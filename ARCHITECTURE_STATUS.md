# HDSP Hybrid Architecture — Status

**As of:** 2026-07-16 (Phase 12 complete — all 13 roadmap phases done; see `HDSP_V1_ARCHITECTURE_BASELINE.md`)
**Companion to:** `HDSP_Hybrid_Implementation_Roadmap.md` and each phase's `PHASE_*_IMPLEMENTATION_PLAN.md` / `HYBRID_ARCHITECTURE_LOG.md` entry — this document is a snapshot, not a replacement for those; when in doubt, the phase-specific docs are the source of truth.
**Deployment-environment note:** the tables below describe code-level capability (what the codebase supports), not which environment is currently live. Only two deployment topologies are real today — the self-hosted pattern and its OCI demo instance (`OCI_DEMO_DEPLOYMENT.md`) — while the `cloud` mode described throughout this document (Phase 8/9) exists in code and Terraform but has not been applied against a real AWS account (`CLOUD_DEPLOY.md`). See `HDSP_Current_Architecture_Analysis.md` §1 and §12 for the three-way deployment breakdown.

---

## Roadmap progress

| Phase | Name | Status |
|---|---|---|
| 0 | Preparation | ✅ Complete |
| 1 | Tenant Foundation | ✅ Complete |
| 2 | Infrastructure Abstraction | ✅ Complete |
| 3 | Storage Providers | ✅ Complete |
| 4 | Licensing Providers | ✅ Complete |
| 5 | Notification Providers | ✅ Complete |
| 6 | Connector | ✅ Complete (sandbox-reachable scope) |
| 7 | Cloud Oracle Transport | ✅ Complete (sandbox-reachable scope) |
| 8 | Multi-Tenancy Activation | ✅ Complete (sandbox-reachable scope) |
| 9 | Cloud Deployment | ✅ Complete (IaC written, unapplied — no real AWS account in this sandbox) |
| 10 | Tenant Provisioning | ✅ Complete (roadmap-literal scope — broader SaaS-ops vision tracked in `PHASE_10_DEFERRED_BACKLOG.md`) |
| 11 | Feature Flags | ✅ Complete (roadmap-literal scope — one real pilot migration, backend only) |
| 12 | CI/CD | ✅ Complete (roadmap-literal scope — workflows written, not run against a real repo/AWS account/GHCR) |

"Sandbox-reachable scope" means: implemented, unit-tested against mocked dependencies, and reasoned through carefully, but not yet verified against a real Oracle instance, real cloud infrastructure, or a real multi-tenant traffic pattern — this sandbox has none of those. See "Outstanding environment verification" below.

---

## Active provider abstractions

Five infrastructure categories now share the identical mode-selection pattern established in Phase 3: both implementations are always registered as NestJS providers (cheap construction, no eager I/O), a `useFactory` DI binding reads a `ConfigService`-sourced env var and selects one, and the unset/default value is byte-for-byte the pre-existing wiring.

| Category | Interface | Local/Default impl | Second impl | Selector env var | Default |
|---|---|---|---|---|---|
| Object storage | `IObjectStorageProvider` | `LocalStorageProvider` | `S3StorageProvider` | `STORAGE_DRIVER` | `local` |
| Licensing | `ILicenseProvider` | `FileLicenseProvider` | `SubscriptionLicenseProvider` | `LICENSE_PROVIDER_MODE` | `file` |
| Notifications | `INotificationProvider` | `LocalNotificationProvider` | `CloudNotificationProvider` (AWS SES/SNS) | `NOTIFICATION_PROVIDER_MODE` | `local` |
| Oracle/HIS transport | `IOracleTransport` | `DirectOracleTransport` | `CloudOracleTransport` (via Connector) | `ORACLE_TRANSPORT` | `direct` |

Notes:
- `INotificationProvider` (Phase 5) is layered on top of Phase 2's `INotificationTransport`, not a replacement — both notification providers compose the same WhatsApp transport binding.
- `CloudOracleTransport` (Phase 7) only supports SQL templates explicitly registered in its `knownTemplates` map (currently one conformance query, `SELECT 1 FROM dual`) — expanding to real production HIS queries is deferred, matching Phase 6's SQL-allow-list security boundary.
- `CloudOracleTransport.reconfigure()` intentionally returns a "not supported" result rather than attempting anything — vendor-pushed credential rotation has no meaning for a relay transport.

---

## The Connector (Phase 6)

A standalone package (`connector/`, `@hdsp/connector`) and its extracted core (`packages/oracle-client/`, `@hdsp/oracle-client`) — not part of the backend's deploy unit, not imported by any Business/Platform module. Talks to the backend only via `CloudOracleTransport` over a Redis-backed Message Transport protocol (`{correlationId, sqlTemplateId, binds} → {correlationId, rows|rowsAffected|error}`), enforcing a SQL-template allow-list so the Connector never executes arbitrary SQL received over the wire. Has its own CI (`ci-connector.yml`, path-filtered, fully decoupled from `ci-backend.yml`) and its own `VERSIONING.md`.

---

## Tenant resolution strategies

Established in Stage B (Phase 1), now fully activated by Phase 8:

| Resolver | Derives tenant from | Used for |
|---|---|---|
| `SessionTenantResolver` | `JwtPayload.tenantId` (falls back to `'default'`) | Standard authenticated user-session requests |
| `OracleTenantResolver` | Oracle/HIS-side identity | HIS-login-derived sessions |
| `ChainTenantResolver` | `branchId` on derived-JWT principals | Workstation/reservation-capability tokens (kiosks, token reservations) — these carry no `tenantId` claim at all |

Two additional, request-lifecycle-level mechanisms added in Phase 8:
- **`SubdomainTenantMiddleware`** (Task 8.2) — resolves the `Host` header to a `Tenant` on every request, authenticated or not, before any guard. Answers "which tenant does this *hostname* claim to be," independent of `TenantContextStorage`'s ambient per-request tenant (which answers "who is the authenticated principal's tenant"). Cached (positive and negative).
- **`TenantScopeGuard`** (Task 8.3) — global `APP_GUARD`, cross-checks the two. Self-contained (verifies its own JWT rather than trusting `request.user`, since `JwtAuthGuard` is applied per-controller, not globally, so ordering isn't guaranteed). Governed by `TENANT_SCOPE_GUARD_MODE` (`log-only` default, `enforced` opt-in) per the roadmap's staged-rollout strategy. Does not cover `@Public()` routes by design — the widget cookie flow (Task 8.5) reimplements the same check separately, since it's the one `@Public()` path that needed it.

`TenantScopedRepository` (Stage B) remains in **dry-run mode** — logs would-be violations without blocking. Flipping to enforce is a separate, later decision, not part of Phase 8's activation scope.

---

## Deployment modes supported

Two modes, selected via `DEPLOYMENT_MODE` (`self_hosted` default, `cloud`):

| Concern | `self_hosted` | `cloud` |
|---|---|---|
| Tenant count | One (`'default'`) | Many |
| CORS | Private-IP allowlist (unconditional) | Private-IP allowlist **+** tenant-registry-backed wildcard subdomain (`*.CLOUD_BASE_DOMAIN`, scoped to real active tenants) |
| Storage | `local` (disk) | `s3` available (Phase 3) |
| Licensing | `file` | `subscription` available (Phase 4) |
| Notifications | `local` | `cloud` (AWS SES/SNS) available (Phase 5) |
| Oracle/HIS | `direct` | `cloud_relay` via Connector available (Phase 7) — pilot-scope only |
| Process topology | One combined PM2-managed process (2 cluster instances) | Separate API/worker ECS services via `PROCESS_ROLE` (Phase 9, Task 9.6) |
| Infrastructure | Bare-metal/PM2 (`DEPLOY.md`) | ECS Fargate + RDS + ElastiCache + S3/CloudFront + ALB/WAF, IaC written (Phase 9) — never applied against a real account |

All four provider selections plus `DEPLOYMENT_MODE=cloud` are now documented as a single staging-first flip in `CLOUD_DEPLOY.md` (Phase 9, Task 9.8) — every one of the five flips is pure configuration, no code change, which is what the entire Phase 3-8 provider-abstraction effort was building toward. Not yet exercised against a real environment.

**Phase 9's `PROCESS_ROLE` env var** (`all`/`api`/`worker`, default `all`) is the one new piece of runtime-observable behavior this phase added: an `api`-role process never registers `@Cron`/`@Interval` jobs (via `ScheduleModule.forRoot()` being conditionally omitted), closing a duplicate-cron-tick risk that a prior architecture review flagged for horizontally-scaled API replicas — including, latently, today's self-hosted PM2 config (2 cluster instances of one combined process). Self-hosted is unaffected (`PROCESS_ROLE` unset, defaults to `'all'`).

---

## Tenant Provisioning (Phase 10)

A purpose-built, resumable 10-step pipeline (`backend/src/modules/platform/tenant-provisioning/`) that creates a fully working tenant from one internal admin API call: `Tenant` row → verified subdomain → global Role/Permission catalog check → (settings: explicit no-op) → storage namespace confirmation → hashed Connector pairing key → trial `SubscriptionLicense` → tenant `SUPER_ADMIN` user → `TenantProvisionedEvent`. `TenantProvisioningRun`/`TenantProvisioningStep` entities track progress per-step, enabling `resume(runId)` after a partial failure — deliberately *not* built on `document-platform`'s workflow-engine (found during pre-flight to be a document-approval state machine, not a generic step runner).

Two schema realities forced documented reinterpretations of the spec's literal Steps 3-5: `Role`/`Permission` carry **global** unique constraints (not per-tenant), and `SystemSetting`/`CMSSettings`/`FeedbackSettings` are de-facto global singleton tables — see `PHASE_10_IMPLEMENTATION_PLAN.md` for the full reasoning. Admin API is `SUPER_ADMIN`-only (`/platform/tenant-provisioning/*`). A narrow `deprovision()` pilot-rollback path (Task 10.8) sets a tenant `inactive` and revokes its Connector pairing — not full lifecycle management.

**Explicitly deferred, per the user's Option 3 scope decision** (tracked in `PHASE_10_DEFERRED_BACKLOG.md`, not silently dropped): Vendor Portal self-service onboarding, full tenant lifecycle (suspend/reactivate/rename/delete), Connector fleet management (including actually consuming the pairing-key credential — no protocol-level handshake exists yet), subscription lifecycle automation, secret/credential rotation tooling, operational dashboards, and genuine per-tenant Roles/Permissions/Settings.

## Feature Flags (Phase 11)

A layer beneath module licensing, not a replacement for it: `FeatureFlag` (`backend/src/modules/platform/feature-flags/`) gates business behavior *within* an already-licensed module, per-tenant (`tenant_id IS NULL` = platform-wide default, non-null = per-tenant override). `FeatureFlagsService.isEnabled()` is Redis-cached identically to `LicenseService.getStatus()`'s pattern (same client, 5-minute TTL, cache-miss/error falls through to DB). `@RequireFeature()`/`RequireFeatureGuard` mirror `@RequireModule()`/`LicenseGuard`'s exact shape and are documented to sit alongside it in `@UseGuards()` when a controller has both.

Pilot migration (Task 11.3): CMS's emergency-broadcast `activate()`/`deactivate()` — a real, live, already-shipped capability, chosen over the roadmap's named "AI Assistant" example because no such module actually exists in this codebase (only an unwired `ai-platform` scaffold with a stub, zero-consumer feature-flag service). The migration seeds a platform-wide `enabled` row for that exact feature key in the same transaction as the schema change, so existing deployments see no behavior change by default. Admin API (`/platform/feature-flags`, `SUPER_ADMIN`-only) covers list/upsert; no frontend UI yet.

**Explicit scope boundary, per a user decision recorded during this phase's pre-flight:** infrastructure/provider-selection mechanisms (`DEPLOYMENT_MODE`, `ORACLE_TRANSPORT`, `STORAGE_DRIVER`, `LICENSE_PROVIDER_MODE`, `NOTIFICATION_PROVIDER_MODE`) remain outside the Feature Flag system by design — those are deployment-level configuration from Phases 3-9, not per-tenant runtime business toggles. Phase 11 does not duplicate them.

---

## CI/CD and Release Packaging (Phase 12)

All 13 named tasks (12.1–12.6) complete, roadmap-literal scope. `ci-backend.yml`/`ci-frontend.yml`/`ci-connector.yml` hardened (`npm ci`, production build steps, a new `e2e-smoke` job that boots the compiled app against real Postgres+Redis). New `build-images.yml` produces versioned `hdsp-backend`/`hdsp-frontend`/`hdsp-connector` images (one backend image serves both the ECS `api` and `worker` services via `PROCESS_ROLE`, confirmed against `ecs.tf`), pushes to ECR for cloud and — on a real release tag only — to GHCR for self-hosted distribution, and publishes a version manifest. New `deploy-cloud.yml` runs Terraform + a post-deploy smoke test through two GitHub-Environment-gated stages (`staging` then `production`, the latter carrying the manual-approval requirement structurally via a repository protection rule). New `infrastructure/docker/docker-compose.selfhosted.yml` + `infrastructure/installer/install.sh` give self-hosted a second, image-based deployment path alongside (not replacing) `DEPLOY.md`'s PM2 runbook.

**One real, additive application-code change, not just packaging:** `TenantProvisioningService` gained an optional `mode: 'cloud' | 'self_hosted'` parameter (default `'cloud'`, so the HTTP admin API's existing behavior is unchanged) implementing spec Section 8.1's "self-hosted equivalent" reduced pipeline — skips subdomain generation, Connector-pairing-key generation, and the subscription-license step, each recorded as an explicit tracked skip. A new idempotent CLI entrypoint (`backend/src/scripts/provision-self-hosted.ts`) runs it once per install.

`connector/COMPATIBILITY.json` (new) replaces `VERSIONING.md`'s stale single row; the Connector's health-check response now advertises its own version. Enforcement is honestly scoped as install/deploy-time only (`check-compatibility.js`) — a live connect-time handshake between a running backend and Connector remains a documented, not-yet-closed gap. `SUPPORTED_VERSIONS.md` establishes an N-2 self-hosted support window.

**Explicitly out of scope, per the user's own framing for this phase:** monitoring, observability, Kubernetes tuning, performance optimization, auto-scaling, feature work.

**Pilot note:** none of the new workflows have run against a real repository/AWS account/GHCR — see `PHASE_12_IMPLEMENTATION_PLAN.md`'s pilot note for the exact one-time manual setup (OIDC roles, repo secrets, GitHub Environment protection rules, `.tfvars` files) needed before a real release can flow through this pipeline.

---

## Outstanding environment verification

Every item below requires infrastructure this sandbox does not have (a real Oracle instance, real cloud infra, a real multi-tenant Postgres with ≥2 tenant rows, or a real running scheduler) and has been consistently flagged rather than fabricated, per this project's standing practice:

1. **Real-Oracle parity** — `packages/oracle-client`'s extraction (Phase 6) was done as a mechanical, side-by-side port, but never run against a live Oracle instance. Highest-priority follow-up.
2. **Task 7.5 (Connector pilot)** — deploy one real Connector instance against a test Oracle + Redis, exercise the one registered conformance template end-to-end, then expand `CloudOracleTransport.knownTemplates` one query at a time, each verified against `DirectOracleTransport`'s real output.
3. **Cross-tenant authz test suite** (Phase 8) — valid credentials for tenant A, attempted access via tenant B's subdomain/JWT, confirmed rejected at every guarded endpoint. Needs ≥2 real tenant rows.
4. **Cron-exactly-once-per-tenant verification** (Phase 8) — needs a real scheduler running against ≥2 real tenant rows.
5. **Real `cloud`-mode CORS exercise** (Phase 8) — needs a real `CLOUD_BASE_DOMAIN` and ≥1 tenant with a non-null `subdomain`.
6. **`TENANT_SCOPE_GUARD_MODE=enforced` flip** — should only happen after a representative period of clean `log-only` logs in a real deployment; not a code change, an operational one.
7. **Real build/test/lint toolchain** — this project's sandbox uses `tsc`/bash-based checks that are explicitly *not* authoritative; the office environment's native Windows toolchain is. Every phase's `npm install`/build/test/lint has been deferred to that environment.
8. **LocalStack-backed live SES/SNS suite** (Phase 5) — the notification conformance suite mocks the AWS SDK; no live-service suite exists yet, unlike Phase 3's MinIO-backed one.
9. **Subscription license provisioning** (Phase 4) — `subscription_licenses` has no writer yet; a future Stripe/Vendor-Portal sync task is needed before `subscription` mode is usable in a real deployment.
10. **All of `infrastructure/terraform/` (Phase 9)** — never run through `terraform validate`/`plan`/`apply` against a real AWS account; no credentials exist in this sandbox. Highest-priority follow-up for actually standing up staging.
11. **DR drill, load test, full regression re-run in a real cloud environment** (Phase 9's own testing checklist) — all explicitly named by the roadmap, none executable here.
12. **Bull processor / API-role separation** (Phase 9, Task 9.6 follow-up) — only cron is currently excluded from the API role's module graph; Bull consumers still run in both roles (safe per Bull's own per-job locking, just not maximally resource-efficient). A deeper module-graph split is a follow-up, not attempted without real test infrastructure to verify against.
13. **Phase 10's full 10-step provisioning flow** — never run end-to-end against a real cloud Postgres, a real Connector, or real AWS infra; exercised only through code review and the pre-flight's two subagent investigations. Should be run once for real before the first hospital is onboarded.
14. **All of Phase 12's GitHub Actions workflows** — never executed by a real GitHub Actions runner; no AWS OIDC role, ECR/GHCR credentials, or GitHub Environment protection rules have been configured against a real repository. `install.sh`/`docker-compose.selfhosted.yml` never dry-run against a real Docker host. Highest-priority follow-up alongside item 10 for actually cutting a first real release.

---

## Files worth knowing about

- `HDSP_Hybrid_Implementation_Roadmap.md` — the governing 13-phase plan.
- `HYBRID_ARCHITECTURE_LOG.md` — chronological decision/completion log, one entry per phase (and per Stage-B checkpoint before phases existed).
- `PHASE_3_IMPLEMENTATION_PLAN.md` through `PHASE_9_IMPLEMENTATION_PLAN.md` — per-phase execution detail, task-by-task.
- `PHASE_7_VENDOR_PORTAL_IMPACT_ANALYSIS.md` — the one cross-repository analysis performed so far; concluded no Vendor Portal changes needed through Phase 7.
- `connector/VERSIONING.md` — the Connector's own semver/compatibility-matrix doc.
- `DEPLOY.md` — self-hosted/PM2 deployment runbook.
- `CLOUD_DEPLOY.md` (Phase 9) — cloud/ECS deployment runbook, the staging-first `DEPLOYMENT_MODE=cloud` cutover procedure.
- `infrastructure/terraform/` — the Phase 9 IaC (RDS, ElastiCache, S3/CloudFront, ECS, ALB, WAF) — see its own `README.md` for scope notes (assumes an existing VPC, never applied against a real account).
- `infrastructure/docker/` — the four Dockerfiles (backend/worker share one, frontend, connector).
- `infrastructure/ecs/*.json` — human-readable, annotated ECS task definition reference (the Terraform-managed versions in `ecs.tf` are the actual deploy source of truth).
- `PHASE_10_ARCHITECTURE_REVIEW.md` — the Phase 10 pre-flight answering the roadmap's 8 named provisioning questions, plus the roadmap-literal-vs-expanded-vision scope fork.
- `PHASE_10_IMPLEMENTATION_PLAN.md` — Phase 10 execution detail, including the two roadmap-vs-reality discrepancies (no generic workflow engine; global-singleton Roles/Permissions/Settings) and how each was resolved.
- `PHASE_10_DEFERRED_BACKLOG.md` — the explicitly tracked, not-yet-started broader SaaS-operations vision (Vendor Portal self-service, tenant lifecycle, Connector fleet management, subscription automation, credential rotation, dashboards).
- `backend/src/modules/platform/tenant-provisioning/` — the provisioning service, entities, DTO, event, and admin controller.
- `PHASE_11_IMPLEMENTATION_PLAN.md` — Phase 11 execution detail, including the infra-toggle-vs-business-feature-flag scope fork and its resolution.
- `backend/src/modules/platform/feature-flags/` — the FeatureFlag entity, `FeatureFlagsService`, `@RequireFeature()`/`RequireFeatureGuard`, and admin controller.
- `PHASE_12_IMPLEMENTATION_PLAN.md` — Phase 12 execution detail, including the ECS image-tag-sharing finding and the exact manual setup a real release needs.
- `.github/workflows/{build-images,deploy-cloud}.yml` — the new image-build and cloud-deploy-automation workflows.
- `infrastructure/installer/` — `install.sh`, `env.selfhosted.template`, `check-compatibility.js` (the self-hosted Docker-based deployment path).
- `connector/COMPATIBILITY.json` — the machine-readable Backend/Connector compatibility matrix.
- `SUPPORTED_VERSIONS.md` — the self-hosted N-2 support-window policy.
- `HDSP_V1_ARCHITECTURE_BASELINE.md` — the v1.0 reference snapshot across all 13 phases.
