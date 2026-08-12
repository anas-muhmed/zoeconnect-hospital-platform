# Phase 12 Implementation Plan — CI/CD and Release Packaging

Status: **Complete**
Scope: roadmap-literal Tasks 12.1–12.6, per the user's own framing for this phase ("How do we reliably produce, test, version, and release HDSP? Not: how do we add another feature?"). No new user-facing application behavior was added; the one code change to existing application logic (`TenantProvisioningService`'s `mode` parameter, see Task 12.4 below) is additive and does not alter the HTTP admin API's existing behavior.

**Explicitly out of scope, per the user's own stated boundary for this phase:** monitoring, observability, Kubernetes tuning, performance optimization, auto-scaling, feature work. None of that is touched here.

## Pre-flight findings

A research pass over the existing `.github/workflows/*`, `infrastructure/docker/*`, `infrastructure/terraform/*`, `connector/VERSIONING.md`, and `DEPLOY.md` before writing anything found:

- `ci-backend.yml`'s `storage-s3-conformance` job (MinIO-backed, Phase 3) **already exists** — an earlier research pass (during this same pre-flight) initially reported it missing, which turned out to be a sandbox bash-mount-staleness artifact (a recurring, previously-documented issue in this project); re-verified directly via the Read tool and confirmed present and correctly configured. Task 12.1's "add provider-conformance suites as CI gates" was therefore already mostly done for storage; the Oracle-transport and license-provider conformance suites (Phases 4/7) were confirmed to already run unconditionally inside the normal backend test step (mocked dependencies, no external service needed).
- Every CI workflow used `npm install`, not `npm ci` — the original comment in `ci-backend.yml` explicitly flagged this as deferred hardening "once the lockfile round-trip is verified stable." Verified: root, `backend/`, and `frontend/` each have a committed, presumably-in-sync `package-lock.json`; `connector/` and `packages/oracle-client` are npm workspace members covered only by the root lockfile (no lockfile of their own).

**Post-completion correction (found during a later real-build debugging session, not caught by this phase's own pre-flight):** the "presumably-in-sync" assumption above was wrong. The root `package-lock.json`'s own `packages[""].workspaces` array is `["packages/*"]` only — it does not include `"connector"`, unlike `package.json`'s `workspaces` field. The lockfile has zero entries for the `connector` workspace, `packages/oracle-client`, or `ioredis` (a `connector` dependency). This means `ci-connector.yml`'s `npm ci` hardening (this task) will fail on a real GitHub Actions run until the lockfile is regenerated (`npm install` at repo root, not `npm ci`, then commit the updated `package-lock.json`) — flagged to the user directly; not something fixable by editing workflow YAML or `connector/` source, both of which are already correct.
- No E2E smoke test existed anywhere — nothing proved the compiled app actually boots against real Postgres/Redis.
- No image-build/push workflow, no cloud-deploy-automation workflow, and no self-hosted Docker-based install path existed at all — self-hosted deployment today is exclusively the PM2-based runbook in `DEPLOY.md`.
- `connector/VERSIONING.md` had a single stale compatibility-matrix row, not updated since before Phase 7 shipped `CloudOracleTransport` — explicitly self-described as "future work, not implemented."
- The monorepo is npm workspaces (`packages/*`, `connector`) with independently-versioned packages (backend `1.0.0`, frontend `1.0.0`, connector `0.1.0`, `oracle-client` `0.1.0`) — no single root version drives releases, and no CHANGELOG/release-notes/version-manifest concept existed anywhere in the repo.

## Bonus finding: a genuine, pre-existing YAML syntax bug in all three CI workflows

While spot-checking the edited workflow files with a YAML parser (a step this project would otherwise have deferred to the real GitHub Actions runner, per the standing "sandbox checks aren't authoritative" posture — but a plain YAML-syntax-validity check needs no application runtime, so it was run directly here), four step `name:` values across `ci-backend.yml`, `ci-frontend.yml`, and `ci-connector.yml` contained an unquoted colon-plus-space inside the name string (e.g. `name: Build packages (dependency order: form-schema -> canvas-engine -> canvas-engine-react)`) — invalid per the YAML spec for a plain scalar. None of these four lines were introduced by this phase's edits; they predate Phase 12 (Milestone 1/2 era). Verified this is a real parse failure, not a false positive, with a minimal reproduction. Fixed by quoting all four `name:` values. This means these three CI workflows would have failed to parse at all on a real GitHub Actions run — a previously-undetected gap, consistent with this project's repeated finding that nothing in `.github/workflows/` has ever actually been exercised against a real GitHub Actions runner.

## Task 12.1 — Harden existing CI

- `ci-backend.yml`, `ci-frontend.yml`, `ci-connector.yml`: every `npm install` switched to `npm ci`. For `connector`/`packages/oracle-client` (workspace members with no own lockfile), this meant restructuring two per-directory install steps into one root-level `npm ci` that installs/hoists both.
- Added a production `npm run build` step to both `ci-backend.yml` and `ci-frontend.yml` — proves the exact artifact Task 12.2 packages into images actually compiles in CI, not just passes `tsc --noEmit`/lint.
- Added a new `e2e-smoke` job to `ci-backend.yml`: spins up real Postgres + Redis service containers, runs migrations, boots the compiled app, and polls `/api/v1/health/live` then `/api/v1/health/ready` (DB + Redis only — Oracle is deliberately not stood up or asserted, consistent with `ORACLE_HOST` being optional). This is new coverage no existing job provided: proof the app actually starts against real infrastructure, not just that unit tests pass against mocks.
- Documented (not silently assumed) that making `storage-s3-conformance`/`e2e-smoke` *required* status checks is a GitHub repository branch-protection setting, not something expressible in the workflow YAML itself — a one-time manual setup step for whoever administers the repo.

## Task 12.2 — Build stage

New workflow `.github/workflows/build-images.yml`, triggered on push to `main` (produces a `0.0.0-<sha>` dev tag) and on `v*.*.*` tags (a real release). Builds all three Dockerfiles (backend, frontend, connector — all from the monorepo root context per Phase 9) via OIDC-authenticated AWS credentials, pushes to the three ECR repos Phase 9's `ecr.tf` already provisions. Confirmed against `ecs.tf`: `api_image_tag` and `worker_image_tag` are separate Terraform variables both pointing at the *same* `aws_ecr_repository.backend` — so exactly one `hdsp-backend` image is built and pushed, not two; the API/worker split remains purely a `PROCESS_ROLE` runtime distinction (Phase 9), not a build-time one.

A `version-manifest` job publishes a JSON artifact (`hdspVersion`, `images`, `connectorVersion`, `minCompatibleConnectorVersion` from Task 12.5's `COMPATIBILITY.json`, `schemaVersion` derived from the latest migration filename) — the roadmap's own named deliverable.

On a real release tag only, a second job (`publish-self-hosted-images`) also pushes the same three images to GHCR (`GITHUB_TOKEN`-authenticated, no extra secret) — a deliberate, documented design choice: the private ECR repos Task 12.3's cloud deploy uses are not reachable by a hospital's self-hosted server (no AWS IAM identity there), so self-hosted release distribution needs a registry a plain `docker login`/pull can reach. Only real version tags publish to GHCR — a hospital's installer should never see a `0.0.0-<sha>` dev build.

## Task 12.3 — Cloud deploy automation

New workflow `.github/workflows/deploy-cloud.yml`, manually triggered (`workflow_dispatch` with a `version` input) rather than automatic on every image build — which released version goes to production, and when, is an operational decision, not a CI event. Two sequential jobs, `deploy-staging` then `deploy-production`, each a GitHub Environment (not `if:` branching) so `production`'s required-reviewer protection rule — a repository setting this workflow assumes exists, documented rather than silently assumed — is what structurally enforces the roadmap's "manual approval gate for production" requirement. Each job: `terraform plan`/`apply` against Phase 9's existing Terraform (setting `api_image_tag`/`worker_image_tag`/`frontend_image_tag` to the requested version), then a smoke test against `/api/v1/health/live` via the deployed ALB's DNS name (`outputs.tf`'s `alb_dns_name`, confirmed to exist).

Never run against a real AWS account from this sandbox — same posture as every other Phase 9/12 infrastructure file in this project.

## Task 12.4 — Self-hosted package pipeline

- `infrastructure/docker/docker-compose.selfhosted.yml` — Postgres, Redis, `backend` (single combined process by default, `PROCESS_ROLE` unset, matching today's PM2 topology rather than Phase 9's cloud API/worker split), `frontend`, and a commented-out `connector` service for the unusual-but-supported connector-relay variant. Pulls the exact same images `build-images.yml` publishes to GHCR — no separate self-hosted build.
- `infrastructure/installer/env.selfhosted.template` + `install.sh` — a second self-hosted deployment path alongside (not replacing) `DEPLOY.md`'s manual PM2 runbook, which stays documented as the fallback per the roadmap's own rollback-strategy guidance. `install.sh` checks prerequisites, sets up `.env` interactively on first run, runs the Task 12.5 compatibility check when the connector-relay variant is enabled, pulls images, starts Postgres/Redis, runs migrations, runs the reduced provisioning pipeline (below), starts the full stack, and smoke-tests it.
- **Real code change to Phase 10's `TenantProvisioningService`, not just new packaging:** spec Section 8.1's own "Self-hosted equivalent" note requires the installer to run "a reduced version of the same pipeline (skip subdomain generation, skip Connector-pairing-key generation, use FileLicenseProvider instead of step 8's subscription call)." Implementing this meant adding an optional `mode: 'cloud' | 'self_hosted'` parameter (default `'cloud'`) to `provision()`/`execute()`/`dispatchStep()` and the three affected step methods (`stepCreateTenantRow`, `stepReserveSubdomain`, `stepGenerateConnectorPairingKey`, `stepIssueTrialLicense`) — each records an explicit `skipped: true` result in self-hosted mode rather than silently omitting the step from the ledger. `TenantProvisioningController` (the HTTP admin API) is entirely unaffected — it never passes `mode`, so it always gets `'cloud'`'s existing behavior unchanged. A new one-shot CLI entrypoint, `backend/src/scripts/provision-self-hosted.ts` (boots a NestJS application context, not a full HTTP server, reusing the real `TenantProvisioningService` rather than reimplementing its logic in raw SQL the way the older `seed-platform.ts` does), is idempotent — it checks for an existing non-system `Tenant` row and exits cleanly if one is found, so re-running `install.sh` on a version upgrade never re-provisions or errors.
- **Known limitation, documented in the service's own doc comment rather than silently assumed away:** `mode` is not persisted on the `TenantProvisioningRun` row, so `resume()` always resumes in `'cloud'` mode. Fine for the installer's actual one-shot-idempotent usage; means a self-hosted run that fails partway through cannot currently be resumed via `resume()` in the same reduced mode — re-running the installer script is the supported recovery path, not a stored resume() call.

## Task 12.5 — Backend/Connector compatibility matrix

- `connector/COMPATIBILITY.json` — new, machine-readable source of truth (protocol version, `minCompatibleConnectorVersion`, a matrix of connector/backend version ranges), replacing the stale single-row table `VERSIONING.md` had carried since before Phase 7.
- `connector/VERSIONING.md` rewritten: current matrix row reflecting Phase 7/9/10 reality, explicit cross-reference to `COMPATIBILITY.json` as the tooling-facing source of truth, and an honest "Compatibility check at connect time" section distinguishing what's now **advertised** (health-check response now includes `connectorVersion`/`protocolVersion`, additive change to `connector/src/health.ts`) from what's **enforced** (install-time/deploy-time only, via `infrastructure/installer/check-compatibility.js` and the release manifest) versus what remains a **documented gap** (no runtime connect-time handshake between a live backend and a live Connector — both would still fail on the first mismatched request rather than refusing up front). This is deliberately not overclaimed as fully solved.
- `check-compatibility.js` — dependency-free (no semver package) version-range comparison, used by `install.sh` before pulling connector-relay images and referenced by `build-images.yml`'s manifest job.

## Task 12.6 — Supported-version-window policy

`SUPPORTED_VERSIONS.md` — an N-2 minor-release-line policy for self-hosted (the cloud deployment always runs one operator-chosen version, so this applies primarily to self-hosted's variable upgrade cadence), with explicit reasoning for why N-2 over a shorter or longer window, what "supported" concretely means, and an honest statement that no telemetry exists to actually measure the self-hosted install-base's real version distribution — this is a starting policy, not data-backed yet.

## Files touched

- `.github/workflows/{ci-backend,ci-frontend,ci-connector}.yml` — hardened.
- `.github/workflows/{build-images,deploy-cloud}.yml` — new.
- `infrastructure/docker/docker-compose.selfhosted.yml` — new.
- `infrastructure/installer/{env.selfhosted.template,install.sh,check-compatibility.js}` — new.
- `connector/COMPATIBILITY.json` — new.
- `connector/VERSIONING.md` — rewritten.
- `connector/src/health.ts` — additive `connectorVersion`/`protocolVersion` fields.
- `backend/src/modules/platform/tenant-provisioning/tenant-provisioning.service.ts` — additive `mode` parameter.
- `backend/src/scripts/provision-self-hosted.ts` — new.
- `backend/package.json` — new `provision:self-hosted` script.
- `SUPPORTED_VERSIONS.md` — new.

## Pilot note

None of the new GitHub Actions workflows have been run against a real repository (no GitHub Actions runner, no AWS account, no GHCR credentials reachable from this sandbox) — same posture as every other environment-dependent item in this project. Before relying on this for a real release: (1) create the `AWS_ECR_PUSH_ROLE_ARN`/`AWS_DEPLOY_ROLE_ARN` OIDC roles and repository secrets, (2) configure the `staging`/`production` GitHub Environments with `production` requiring reviewer approval, (3) create `staging.tfvars`/`production.tfvars` (referenced by `deploy-cloud.yml`, not committed — same "real secret values are never committed" posture as Phase 9's `secrets.tf`), (4) dry-run `install.sh` against a real staging Docker host before trusting it for a hospital's production install.
