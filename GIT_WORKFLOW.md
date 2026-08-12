# HDSP — Git Workflow

**Provider-agnostic by design.** This document intentionally avoids provider-specific terminology (no "GitHub-only" features assumed) so it remains valid across GitHub, GitLab, Azure DevOps, or a self-hosted Git server (e.g. Gitea/GitLab CE) — anticipating the company's planned migration to its own Git server.

**What is code-verified vs. recommended:** the current repository's actual branch/tag conventions and CI triggers (verified against `.github/workflows/*.yml`) are cited where they exist. Sections without a citation are **recommended practice**, not something already enforced by this codebase — flagged explicitly rather than presented as existing policy.

---

## 1. Repository Structure

Single monorepo (`hdsp-monorepo`) containing: `backend/`, `frontend/`, `connector/`, `vendor-portal/{backend,frontend}`, `packages/*` (shared libraries), `infrastructure/` (IaC, Nginx, PM2, Docker, installer), `scripts/`, and root-level documentation. Root `package.json` declares npm workspaces for `packages/*` and `connector` only — `backend`/`frontend`/`vendor-portal/*` are independent package trees within the same repo. This structure should be preserved across any Git provider migration; nothing in the CI workflows or scripts assumes a particular provider's monorepo tooling.

## 2. Branch Naming (recommended — not currently enforced in code)

No branch-naming validation (commit hook, CI lint step, or provider branch-policy config) exists in the repository today. The following convention is recommended to align with the two branches CI already treats specially (`main`, `develop` — see §3):

| Prefix | Purpose | Example |
|---|---|---|
| `feature/<ticket>-<short-description>` | New functionality | `feature/hdsp-412-connector-pairing-validation` |
| `fix/<ticket>-<short-description>` | Non-urgent bug fix | `fix/hdsp-430-cors-origin-wiring` |
| `hotfix/<ticket>-<short-description>` | Urgent production fix, branched from the release/production branch | `hotfix/hdsp-441-login-lockout` |
| `release/<version>` | Release stabilization branch | `release/1.4.0` |
| `chore/<short-description>` | Tooling, docs, dependency bumps | `chore/add-eslint-config` |

## 3. Protected Branches

**Code-verified today:** `.github/workflows/ci-backend.yml` and `ci-frontend.yml` both trigger on `push`/`pull_request` to `[main, develop]` specifically — meaning these two branches are the ones CI is wired to protect the quality bar of. `ci-connector.yml` is additionally path-filtered (only fires on changes under `packages/oracle-client/**` or `connector/**`). `deploy-cloud.yml` targets deployment **environments** (`staging`, `production`) rather than branches, gated by GitHub Environment protection rules (approval requirement lives in repository settings, not in a branch-protection rule).

**Recommended policy** (not yet configured/verifiable from code — branch protection rules are a repository setting, not expressible in YAML, so this must be configured directly in whatever Git server hosts the repo):
- `main` — protected, no direct pushes, requires a passing CI run + at least one approving review before merge.
- `develop` (if used as an integration branch ahead of `main`) — same protection, slightly lower review bar acceptable.
- Any `release/*` branch — protected once cut, only hotfix/cherry-pick commits allowed.

When migrating to a self-hosted Git server, replicate these as server-side protected-branch rules (GitLab: "Protected Branches"; Azure DevOps: "Branch Policies"; Gitea: "Branch Protection") — the underlying Git history and CI trigger conditions (`.github/workflows/*.yml`'s `branches:` filters) do not need to change, only the enforcement mechanism.

## 4. Feature Branches

Branch from `develop` (or `main` if no separate integration branch is used), open a Pull/Merge Request back into it. CI (`ci-backend.yml`, `ci-frontend.yml`, and path-filtered `ci-connector.yml`) runs automatically on the PR since these workflows trigger on `pull_request` against `main`/`develop`. A feature branch should be kept short-lived and rebased/merged promptly to avoid the shared `packages/*` workspace dependencies drifting underneath it.

## 5. Hotfixes

For an urgent production issue: branch `hotfix/<ticket>-<description>` from the current production branch/tag (not from `develop`, to avoid pulling in unreleased work), fix, open a PR that runs the same CI gates, merge to production, tag a new patch version (§9), then forward-merge/cherry-pick the fix into `develop`/`main` so it isn't lost in the next regular release. This backport step is a process discipline item — nothing in the codebase automates or verifies it.

## 6. Release Branches

Recommended for coordinating a release that needs stabilization time separate from ongoing `develop` work: cut `release/<version>` from `develop`, allow only bugfixes on it, merge to `main` and tag (§9) when ready, then merge back into `develop` to reconcile any release-branch-only fixes. Not currently used/enforced by any workflow — `build-images.yml` triggers on `push` to `main` and on tags matching `tags: ['v*.*.*']`, so the actual "what gets built and published" trigger is tag-based, not release-branch-based; a release-branch step (if adopted) should culminate in a tag push to trigger the real build.

## 7. Pull Requests / Merge Requests

Required checks before merge, based on what CI actually runs today:
- `ci-backend.yml`: shared-packages build/lint/test → backend lint → backend test → backend build → S3 storage conformance test (real MinIO container) → e2e smoke test (real Postgres+Redis containers, migrations, `/health/live` + `/health/ready` poll). Also enforces two custom guardrails via `grep`: a **DEPLOYMENT_MODE usage guardrail** (fails if `process.env.DEPLOYMENT_MODE` is read outside `deployment.config.ts`) and an **infrastructure import boundary guardrail** (fails if a concrete provider implementation — storage/Oracle-transport/licensing/notifications — is imported outside its designated `*.module.ts`). These are architectural-discipline checks specific to this codebase's provider-abstraction pattern; keep them when migrating CI to a new provider.
- `ci-frontend.yml`: shared-packages build → `type-check` → `lint` → `build` (no test suite exists for the frontend today — flag this as a gap when reviewing frontend PRs, since type-check/lint are currently the only automated signal).
- `ci-connector.yml`: only runs when `packages/oracle-client/**` or `connector/**` changed.

None of `vendor-portal/backend` or `vendor-portal/frontend` are covered by any CI workflow — PRs touching those directories currently have **no automated check** at all. Treat manual review as mandatory there until CI coverage is added.

## 8. Code Reviews (recommended practice)

- At least one approving review before merge to `main`/`develop`/`release/*`.
- Reviewers should specifically check the two architectural guardrails CI enforces (§7) even though CI will catch violations — understanding *why* a PR might fail them (e.g., importing `S3StorageProvider` directly instead of via `IObjectStorageProvider` DI) speeds up review.
- For changes touching tenant-scoping code (`TenantScopedRepository`, `TenantContextInterceptor`, `TenantScopeGuard`, login-tenant-scope logic) — treat as higher-scrutiny given the documented history of a "confirmed Users cross-tenant leak" in this codebase (see `HDSP_Current_Architecture_Analysis.md` §2).
- For changes touching `backend/src/database/migrations/` — require an explicit reviewer check that `synchronize` remains `false` and that the migration is additive/backward-compatible where possible (the codebase's own convention, e.g. backfill-then-`NOT NULL` staged migrations).

## 9. Merge Strategy

Not enforced by any repository setting visible in code (this is a Git-server configuration, not something in `.github/workflows/`). Recommended: **squash merge** for feature/fix branches into `develop`/`main` (keeps history readable, one commit per logical change), **merge commit** (no squash) for `release/*` → `main` merges (preserves the release branch's fix history), and **fast-forward or merge commit** for the mandatory backport of hotfixes into `develop` (§5).

## 10. Tagging

**Code-verified:** `build-images.yml` triggers on `tags: ['v*.*.*']` — i.e., **semantic version tags prefixed with `v`** (e.g. `v1.4.0`) are the actual mechanism that produces a numbered release: the `version` job strips the `v` prefix, sets `is_release=true`, and only then does the workflow publish to GHCR (self-hosted installer images) with both the version tag and `latest`. A `push` to `main` without a version tag still builds/pushes to ECR (tagged with the short commit SHA, `is_release=false`) but does **not** publish to GHCR — this is an intentional distinction: ECR pushes track every mainline commit for the cloud path; GHCR only ever sees real, reviewed releases for the self-hosted path.

Recommended tagging convention: standard SemVer (`vMAJOR.MINOR.PATCH`), with `MAJOR` bumped for breaking API/schema changes, `MINOR` for backward-compatible features, `PATCH` for fixes. Cross-check `connector/COMPATIBILITY.json`'s version-range matrix (used by `infrastructure/installer/check-compatibility.js`) whenever bumping a version that changes Backend↔Connector protocol compatibility.

## 11. Release Process

1. Merge all intended work into `main` (directly or via a `release/*` branch, §6).
2. Tag `vX.Y.Z` and push the tag.
3. `build-images.yml` builds and publishes to ECR (always) and GHCR (because this is a real tag).
4. A `version-manifest.json` artifact is generated recording `hdspVersion`, `connectorVersion`, `minCompatibleConnectorVersion`, and `schemaVersion` — attach or reference this in release notes for traceability.
5. For a cloud deploy: trigger `deploy-cloud.yml` manually (`workflow_dispatch`) with the new version, which runs staging first, then (after any required-reviewer approval) production (`CLOUD_SETUP.md` §10).
6. For a self-hosted release: hospitals run `infrastructure/installer/install.sh <version> --upgrade`, which itself checks Backend↔Connector compatibility before proceeding (§10's `check-compatibility.js` reference).
7. Write release notes documenting migration count/names (new entries under `backend/src/database/migrations/`), any new/changed environment variables, and any Connector compatibility-matrix changes.

## 12. Rollback

- **Self-hosted:** `DEPLOY.md` §10 — checkout the previous tag, revert the migration if the schema changed (`npm run migration:revert`, repeatable for multiple migrations), rebuild, `pm2 reload` (or re-run `install.sh <previous-version>` for the Docker path). No automated rollback tooling exists — this is a manual, tag-driven procedure.
- **Cloud:** re-run `deploy-cloud.yml` with the previous `version` input, or manually `terraform apply -var api_image_tag=<previous> -var worker_image_tag=<previous> -var frontend_image_tag=<previous>` / `aws ecs update-service --force-new-deployment` against the previous task definition revision. Database migration rollback (`migration:revert`) must still be performed manually against RDS if the rolled-back version predates a schema change — there is no automatic schema-rollback tied to an ECS deployment rollback.
- In both cases, always confirm which migrations were applied by the version being rolled back from before reverting — `npm run migration:show` lists applied vs. pending migrations.

## 13. Versioning

Three independently-versioned artifacts exist and should be tracked together:
- **HDSP application version** — the `vX.Y.Z` git tag (§10), reflected in `version-manifest.json`'s `hdspVersion`.
- **Connector version** — `connector/package.json`'s own version, currently `0.1.0` at time of writing; compatibility with a given backend version is governed by `connector/COMPATIBILITY.json`'s range matrix, enforced at self-hosted-upgrade time by `check-compatibility.js` and optionally by the running Connector's own reported version (surfaced via its `/health` endpoint).
- **Database schema version** — implicitly the latest applied migration filename/timestamp under `backend/src/database/migrations/` (98 files at time of writing); `version-manifest.json`'s `schemaVersion` captures this per build.

When migrating to a new Git server, preserve all existing `v*` tags (a straightforward `git push --tags` to the new remote) so this version history and its GHCR/ECR image mapping remain resolvable.
