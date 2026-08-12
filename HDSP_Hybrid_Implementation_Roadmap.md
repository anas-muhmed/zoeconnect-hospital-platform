# HDSP Hybrid Architecture — Implementation Roadmap

**Status:** Planning document only. No code is generated in this document. Implementation begins phase-by-phase, task-by-task, only after each phase's detailed plan is separately approved.
**Reference:** Implements *HDSP Hybrid Architecture Specification v2.0*, informed by the two prior audit reports.
**Ground rule for every phase, restated so it is never skipped:** at the start of each phase, before any code is written, I will check whether a simpler path to the same architectural outcome exists given what the codebase actually looks like at that point, and propose it if so. Simplicity is evaluated against the spec's principles (Section 1 of v2.0), not against convenience — a "simpler" suggestion must still preserve the interface boundary, the tenant-first model, and mode-agnostic business logic.

**Working agreement for execution (applies to every phase below):**
1. Analyze the current state of the affected files.
2. Produce a detailed, task-level implementation plan for that phase (or that task, for large phases).
3. Wait for explicit approval.
4. Generate code only for the approved task — never a whole phase in one pass.
5. Verify nothing else broke (targeted test run + a short manual smoke-check list) before moving to the next task.
6. Commit at task granularity, not phase granularity, so any single commit can be reverted without unwinding unrelated work.

---

## How the phases relate to each other

```
Phase 0  Preparation (scaffolding only)
   │
Phase 1  Tenant Foundation ─────────────────────────────┐
   │                                                       │
Phase 2  Infrastructure Abstraction (interfaces + wiring)  │  Phases 1 and 2 can be
   │                                                       │  developed in parallel by
Phase 3  Storage Providers                                 │  different engineers once
   │                                                       │  Phase 0 lands, but Phase 1
Phase 4  Licensing Providers                                │  must merge before Phase 8.
   │                                                       │
Phase 5  Notification Providers                              │
   │                                                       ┘
Phase 6  Connector (standalone component, not yet wired to cloud)
   │
Phase 7  Cloud Oracle Transport (uses Phase 6's Connector)
   │
Phase 8  Multi-Tenancy Activation (turns on what Phase 1 built)
   │
Phase 9  Cloud Deployment (infra, not app code)
   │
Phase 10 Tenant Provisioning
   │
Phase 11 Feature Flags
   │
Phase 12 CI/CD and Release Packaging
```

Every phase below ends with the statement **"application state after this phase"** — confirming self-hosted production behavior is unchanged and cloud capability is additive only. Nothing in Phases 0–7 changes what a self-hosted hospital experiences today.

---

## Phase 0 — Preparation (scaffolding, zero behavior change)

**Objective.** Create the physical and logical scaffolding the rest of the roadmap builds into, without moving or changing any existing runtime behavior.

**Why now.** Every later phase needs somewhere to put new code that doesn't yet exist (`backend/src/infrastructure/`), a config key that doesn't yet exist (`DEPLOYMENT_MODE`), and a naming/token convention that doesn't yet exist (DI provider tokens). Doing this first means every subsequent phase's diff is smaller and easier to review, because the "where does this go" question is already answered.

**Tasks:**

- **Task 0.1 — Create the `infrastructure/` directory skeleton.** Add `backend/src/infrastructure/{storage,oracle,licensing,notifications,email,cache,secrets,auth-providers}/` with an empty `.gitkeep` or a `README.md` per folder describing its intended contents (per spec Section 4). No `.ts` files with logic yet.
- **Task 0.2 — Add `DEPLOYMENT_MODE` to configuration, defaulted to `self_hosted`.** New `backend/src/config/deployment.config.ts` (`registerAs('deployment', ...)`, following the exact pattern of `redis.config.ts`/`oracle.config.ts`), registered in `app.module.ts`'s `ConfigModule.forRoot({ load: [...] })`, validated in `env.validation.ts` (`DEPLOYMENT_MODE: Joi.string().valid('cloud','self_hosted').default('self_hosted')`). Nothing reads this value yet.
- **Task 0.3 — Define (but do not yet use) the five core interfaces.** `IObjectStorageProvider` (move, don't modify, from `platform/services/object-repository/interfaces/`), `IOracleTransport`, `ILicenseProvider`, `INotificationTransport`, `ISecretsProvider` (move, don't modify, from `platform/infrastructure/secrets/`). These are pure TypeScript interfaces/tokens — no provider implementations yet, no DI wiring changes yet.
- **Task 0.4 — Define DI provider token constants.** A single `backend/src/infrastructure/tokens.ts` exporting `export const STORAGE_PROVIDER = Symbol('IObjectStorageProvider')` etc. — establishes the naming convention before any module uses it.
- **Task 0.5 — Add the CI guardrail (lightweight version).** A grep-based CI step (extending `.github/workflows/ci-backend.yml`) that fails if `process.env.DEPLOYMENT_MODE` or `config.get('deployment.mode')` appears outside an allow-listed file list (initially empty, since nothing reads it yet — this means the check starts in its strictest possible state and future phases explicitly add to the allow-list as they legitimately need to).

**Files/modules affected:** new `backend/src/infrastructure/**` (mostly empty), `backend/src/config/deployment.config.ts` (new), `backend/src/config/env.validation.ts` (add one field), `backend/src/app.module.ts` (register the new config), `.github/workflows/ci-backend.yml` (new CI step).

**Database migrations:** none.

**API changes:** none.

**Frontend changes:** none.

**Risks:** effectively zero — this phase adds files and one unread config key. The only real risk is scope creep (an engineer starts "just quickly" moving real logic into the new folders before Phase 2) — explicitly out of bounds for Phase 0.

**Testing checklist:**
- [ ] `npm run build` succeeds (backend).
- [ ] `npm run test` (existing suite) passes unchanged — zero test files should need modification.
- [ ] App boots locally, `/health` returns 200, exactly as before.
- [ ] New CI grep-check runs and passes on the current (empty allow-list) codebase.
- [ ] Manual smoke check: login, view CMS dashboard, submit a feedback form — unchanged behavior.

**Rollback strategy.** Trivial — revert the single commit (or set of commits); nothing else in the codebase depends on anything added here yet, so there is no cascading impact.

**Expected Git commits:**
1. `chore(infra): scaffold infrastructure/ directory structure (no logic)`
2. `chore(config): add DEPLOYMENT_MODE config key, defaulted and unused`
3. `refactor(infra): relocate IObjectStorageProvider and ISecretsProvider interfaces (no behavior change)`
4. `chore(infra): define core Infrastructure DI provider tokens`
5. `ci: add DEPLOYMENT_MODE usage guardrail check`

**Application state after this phase:** identical to today in every observable way. Purely additive scaffolding.

---

## Phase 1 — Tenant Foundation

**Objective.** Introduce a `Tenant` entity and `tenant_id` across the schema, with the application still running, in every respect, as a single implicit tenant (`'default'`). This is the largest phase in the roadmap by surface area (touches ~107 entities per the prior audit) but is designed to be the *lowest-risk* large phase, because every step is additive-then-backfilled, never destructive, and the default-tenant behavior is indistinguishable from today's single-hospital behavior at every intermediate step.

**Why now.** Every later phase (Infrastructure Abstraction's tenant-aware cache keys, Connector pairing, Multi-Tenancy Activation, Tenant Provisioning) assumes `tenant_id` already exists everywhere it's needed. Doing this early, while the codebase is still simplest (before new Infrastructure abstractions add their own surface area), keeps the migration smaller than doing it later.

**Tasks — deliberately ordered from lowest to highest risk:**

- **Task 1.1 — `Tenant` entity + migration + seed.** New `backend/src/modules/platform/tenant/entities/tenant.entity.ts` (`id`, `name`, `subdomain` nullable, `status`, timestamps). Migration creates the table. A second migration seeds exactly one row: `id: 'default', name: '<from existing system_settings hospital name if present, else "Default Hospital">', status: 'active'`. New `TenantModule` (Platform layer) with a `TenantContextService` that — for now — always resolves to `'default'` (no middleware yet, no subdomain resolution yet; this task only makes the concept exist and resolvable).
- **Task 1.2 — Add nullable `tenant_id` to the highest-priority entities first, in small batches, each its own migration + commit.** Batch order, chosen to de-risk by starting with entities that have the fewest cross-references: (a) `system_settings`, `cms_settings`, `feedback_settings` (the already-flagged singleton-row tables); (b) `license_master`, `his_schema_configs`; (c) `users`, `roles`, `permissions`; (d) the remaining ~100 entities, grouped by module (Token, CMS, Feedback, Attendance, Loyalty, EIC, Document Platform), one migration set per module. Every migration: add `tenant_id uuid NULL`, backfill `UPDATE ... SET tenant_id = 'default'`, leave nullable for now (tightening to `NOT NULL` is a separate, later task per table once backfill is verified in each environment) — this exact "add nullable → backfill → tighten" sequence is already an established pattern in this codebase's own migration history, per the prior audit.
- **Task 1.3 — Tighten `tenant_id` to `NOT NULL` + FK, table by table, following the same batch order as 1.2.** Only after each batch's backfill has been verified in a real environment. This is intentionally a separate task from 1.2 so a backfill problem in one table never blocks the others.
- **Task 1.4 — Convert global unique constraints to composite `(tenant_id, column)`.** `users.username`, `users.email`, `system_settings.setting_key`, `his_schema_configs.config_key`, `token_branch_config.branch_id`, `license_master.license_key`. Each its own migration; verify no duplicate-key backfill conflicts exist first (trivial in single-tenant data, since there's only ever one `tenant_id` value at this point).
- **Task 1.5 — `TenantContextMiddleware` (still resolving to `'default'` always).** Wired into the Fastify pipeline alongside the existing `RequestIdMiddleware` in `main.ts`. Still a no-op in terms of behavior — this task exists to put the middleware seam in place before Phase 8 makes it subdomain-aware, and to start threading `tenantId` through request context (e.g., via `AsyncLocalStorage` or a request-scoped provider) so services *can* start reading it.
- **Task 1.6 — Repository-level tenant scoping helper.** A small shared utility/base-repository pattern (or TypeORM subscriber) that appends `WHERE tenant_id = :tenantId` automatically for scoped entities, sourced from the Task 1.5 context. Applied first to a small pilot set of services (e.g., `SettingsService`, `CmsSettingsService`) to validate the pattern before Task 1.7 rolls it out broadly.
- **Task 1.7 — Roll the scoping helper out module by module**, same batch order as 1.2, each its own commit, each independently testable (since single-tenant data means the added filter is a no-op on results but is now provably present in the generated SQL — verified via `synchronize: false`/query logging in tests, not just "the app still works").
- **Task 1.8 — Redis key tenant-namespacing.** Update the `CACHE_KEYS` helper in `redis.config.ts` and the ~22 files identified in the prior audit to prepend `tenantId` (resolved from Task 1.5's context, defaulting to `'default'`). One commit per logical group (auth/session keys, HIS/branch keys, license keys, token/kiosk keys) rather than one giant commit, to keep each diff reviewable.
- **Task 1.9 — Bull job payload `tenantId` field.** Add an always-present `tenantId` field (default `'default'`) to every job DTO identified in the prior audit (`notifications`, `audit-logs`, `loyalty-events`, `attendance-realtime`, `his-bridge`). Processors accept but do not yet *require* a non-default value.
- **Task 1.10 — Raw-SQL call sites audited for tenant scoping.** `BranchService.getUserBranches` and the other `dataSource.query(...)` call sites identified in the prior audit get an explicit `AND tenant_id = $N` added manually (since these bypass the Task 1.6 ORM-level helper by construction).

**Files/modules affected:** new `modules/platform/tenant/**`; migrations across essentially every module directory (`modules/*/migrations` or the central `database/migrations` directory, whichever this repo's convention is — confirm in Task 1.1); `redis.config.ts` and ~22 consuming files; `main.ts` (middleware registration); Bull job DTOs across 5 queues; `branch.service.ts` and other raw-SQL sites.

**Database migrations:** the largest set in the whole roadmap — expect on the order of 15–25 discrete migration files across Tasks 1.1–1.4, each small and independently revertible (this is a deliberate design choice: many small migrations, never one giant schema-rewrite migration).

**API changes:** none externally visible yet — no endpoint changes, no new required request fields. `tenantId` is entirely server-resolved (`'default'`) at this stage.

**Frontend changes:** none required for this phase.

**Risks:**
- Migration batch ordering mistakes (a later batch's backfill depending on an earlier batch not yet applied) — mitigated by the strict module-by-module ordering above and by never combining schema-add and constraint-tighten in the same migration.
- Performance regression from the new `WHERE tenant_id = 'default'` predicate on hot-path queries if the new column isn't indexed before Task 1.7 rolls out broadly — mitigated by requiring the index to land in the *same* migration as the column add (Task 1.2), not deferred.
- A raw-SQL call site missed in Task 1.10, silently bypassing tenant scoping — mitigated by the prior audit's file list being the explicit checklist for this task, plus a repo-wide grep for `dataSource.query\(` / `manager.query\(` re-run at the end of Task 1.10 to confirm the list is exhaustive.

**Testing checklist (per batch, repeated across Tasks 1.2/1.3/1.7):**
- [ ] Migration runs clean on a copy of a real (anonymized) production-shaped dataset, not just an empty dev DB.
- [ ] Migration `revert` (down migration) is verified to work, not just written.
- [ ] Full existing test suite passes unchanged.
- [ ] Manual smoke check of the affected module's primary user flows.
- [ ] Query-logging spot-check confirms `tenant_id = 'default'` appears in generated SQL for scoped services after Task 1.6/1.7.

**Rollback strategy.** Per-migration revert for schema changes (each migration is small and independently revertible by design). For the middleware/context/scoping-helper tasks (1.5–1.7), revert is a straightforward code revert since behavior is provably unchanged (single tenant, no external contract change) — no data cleanup needed since no destructive operations occur in this phase.

**Expected Git commits:** roughly 30–40 across all tasks, following the pattern `feat(tenant): add Tenant entity and default-tenant seed`, `migrate(tenant): add nullable tenant_id to <module> entities`, `migrate(tenant): backfill tenant_id=default for <module>`, `migrate(tenant): tighten tenant_id NOT NULL for <module>`, `refactor(tenant): namespace Redis keys for <group>`, `refactor(tenant): add tenantId to <queue> job payload`, `fix(tenant): scope raw SQL in BranchService to tenant_id` — one commit per task/sub-batch, never a combined "add all tenant_id columns" commit.

**Application state after this phase:** functionally and observably identical to today. Every hospital using self-hosted HDSP sees no change whatsoever. The schema and code are now tenant-aware but behaviorally single-tenant everywhere.

---

## Phase 2 — Infrastructure Abstraction (interfaces + wiring, behavior unchanged)

**Objective.** Introduce `StorageService`, `IOracleTransport`, `ILicenseProvider`, `INotificationTransport` as the *only* way Business/Platform code touches infrastructure — while every concrete implementation underneath continues to do exactly what today's `fs`/`OraclePoolService`/`LicenseService`/`WhatsAppService` code does. No new provider (S3, cloud Oracle, subscription licensing) exists yet — this phase is purely "insert the seam," not "add the second implementation."

**Why now.** This is the direct precondition for Phases 3–5 (each of which adds a *second* provider behind an already-existing interface) and de-risks them individually — by the time Phase 3 starts, the only change is "add `S3StorageProvider` and wire the factory," because the interface and the call-site refactor already happened here, with zero new behavior to verify simultaneously.

**Tasks:**

- **Task 2.1 — `StorageService` facade + `LocalStorageProvider`, wired to today's exact `fs` behavior.** New `backend/src/infrastructure/storage/local-storage.provider.ts` — literally lift the existing logic from `CmsMediaController.upload`, `TokenController.uploadMedia`, `FeedbackFormController`'s handler into one class implementing `IObjectStorageProvider`. `StorageModule.forRoot()` binds `IObjectStorageProvider` → `LocalStorageProvider` unconditionally (mode-selection logic added in Phase 3, not here). `ObjectRepositoryService` (already exists, currently unwired) becomes the facade Business modules call.
- **Task 2.2 — Migrate the three upload controllers to call `ObjectRepositoryService` instead of `fs` directly.** One controller per commit (CMS, Token, Feedback), each independently testable — same method signature, same response shape, verified byte-for-byte identical output.
- **Task 2.3 — Migrate `CmsAssetCleanupService`/`CmsMediaController.permanentDelete` to call the storage facade's delete, instead of `fs.unlink`.**
- **Task 2.4 — `DirectOracleTransport` wrapping today's `OraclePoolService`, unchanged internals.** `OracleModule.forRoot()` binds `IOracleTransport` → `DirectOracleTransport` unconditionally. `OraclePoolService`'s existing pool/circuit-breaker/`reconfigure()` logic becomes `DirectOracleTransport`'s body verbatim (a move, not a rewrite).
- **Task 2.5 — Migrate Oracle-consuming services to depend on `IOracleTransport` instead of injecting `OraclePoolService` directly.** One consuming module per commit: `his/patient`, `his/visit`, `his/billing`, `his/sync`, `attendance` (`OraclePollingService`, `AttendanceListener`), `token` (`his-token-bridge.service.ts`), `branch.service.ts`. Each is a mechanical DI-token swap with no logic change — call sites already only use `.query()`/`.execute()`-shaped calls per the prior audit's finding that business logic never assumed transport.
- **Task 2.6 — `FileLicenseProvider` wrapping today's `LicenseService`, unchanged internals.** `LicensingInfraModule.forRoot()` binds `ILicenseProvider` → `FileLicenseProvider` unconditionally. `LicenseGuard`/`@RequireModule()` updated to call `ILicenseProvider.getStatus(tenantId)` (using Phase 1's tenant context, defaulting to `'default'`) instead of `LicenseService.getStatus()` directly.
- **Task 2.7 — `WhatsAppTransport` wrapping today's `WhatsAppService`, unchanged internals.** `NotificationInfraModule.forRoot()` binds `INotificationTransport` → `WhatsAppTransport` unconditionally. `NotificationService`/`NotificationProcessor` updated to call the interface.
- **Task 2.8 — `EnvironmentSecretsProvider` relocation confirmation and `ISecretsProvider` consumer audit.** Already exists per Phase 0 Task 0.3's move; this task confirms every current consumer (AI-platform providers, any other secret reader) goes through the interface, closing any remaining direct-env-read gaps found during this pass.
- **Task 2.9 — Enable the CI guardrail's real enforcement.** Now that Tasks 2.1–2.7 have moved all legitimate infrastructure access behind interfaces, tighten the Phase 0.5 grep-check's allow-list to only the new `infrastructure/**/*.provider.ts`/`*.transport.ts` files, and turn on the "Business/Platform modules may not import infrastructure/**/*.provider.ts directly" rule from spec Section 3/10.

**Files/modules affected:** `backend/src/infrastructure/{storage,oracle,licensing,notifications}/*` (now with real logic, relocated from existing files); `modules/cms/media/cms-media.controller.ts`, `modules/token/token.controller.ts`, `modules/feedback/forms/feedback-form.controller.ts`, `modules/cms/cleanup/cms-asset-cleanup.service.ts`; `modules/his/**` consumers, `modules/attendance/services/{oracle-polling,attendance-listener}.service.ts`, `modules/branch/branch.service.ts`; `modules/licensing/license.guard.ts`, decorator; `modules/notifications/**`; `.github/workflows/ci-backend.yml`.

**Database migrations:** none.

**API changes:** none — every refactor in this phase preserves existing controller signatures and response shapes exactly.

**Frontend changes:** none.

**Risks:**
- Subtle behavior drift during the `fs` → `StorageService` refactor (e.g., checksum computed at a different point in the pipeline) — mitigated by testing byte-for-byte output equivalence, not just "upload succeeds," in Task 2.2's checklist.
- Oracle transport swap breaking the existing circuit-breaker/reconfigure hot-swap behavior if any state is accidentally left behind in the old `OraclePoolService` rather than fully moved — mitigated by deleting the old class only after `DirectOracleTransport` is confirmed byte-for-byte equivalent in a staging/pilot environment, not simultaneously.
- License/notification refactors touching security-relevant or compliance-relevant code paths (`LicenseGuard`, audit-logged notification sends) — mitigated by keeping these as their own isolated tasks/commits (2.6, 2.7) reviewed with extra scrutiny, not bundled with the lower-risk storage tasks.

**Testing checklist:**
- [ ] Full existing test suite passes unchanged after each task.
- [ ] Upload/download/delete smoke test for CMS media, token display media, feedback header images — output byte-identical to pre-refactor.
- [ ] Oracle-dependent flows (patient search, attendance polling, HIS bill sync, kiosk print) verified against a real/staging Oracle instance, not mocked, at least once per consuming module in Task 2.5.
- [ ] License activation/verification flow (upload a real signed license file) still works end-to-end.
- [ ] A WhatsApp notification send still succeeds end-to-end against a real/sandbox account.
- [ ] CI guardrail correctly flags a deliberately-introduced violation (test the check itself) before relying on it going forward.

**Rollback strategy.** Each task is an isolated, revertible commit swapping call sites from a concrete class to an interface-bound equivalent with identical behavior — revert restores the direct dependency with no data or state implications, since no schema or persisted-data changes occur in this phase.

**Expected Git commits:** `refactor(storage): introduce StorageService facade + LocalStorageProvider (no behavior change)`, `refactor(storage): migrate CmsMediaController to StorageService`, `refactor(storage): migrate TokenController to StorageService`, `refactor(storage): migrate FeedbackFormController to StorageService`, `refactor(storage): migrate CmsAssetCleanupService to StorageService.delete`, `refactor(oracle): introduce IOracleTransport + DirectOracleTransport (no behavior change)`, `refactor(oracle): migrate his/patient to IOracleTransport`, ... (one per consumer), `refactor(licensing): introduce ILicenseProvider + FileLicenseProvider (no behavior change)`, `refactor(notifications): introduce INotificationTransport + WhatsAppTransport (no behavior change)`, `ci: enforce infrastructure import boundary`.

**Application state after this phase:** identical observable behavior to today, in both what a self-hosted hospital experiences and what the (not-yet-existing) cloud deployment would experience. The only change is that every infrastructure touchpoint now goes through an interface with exactly one bound implementation.

---

## Phase 3 — Storage Providers (add S3, still default to Local)

**Objective.** Add `S3StorageProvider` behind the now-existing `IObjectStorageProvider` interface, selectable via config, but **not yet selected by default anywhere** — self-hosted continues using `LocalStorageProvider` unconditionally.

**Why now.** This is the first phase that adds genuinely new capability rather than refactoring existing behavior, and it's deliberately the *first* such phase because storage is the least security/compliance-sensitive of the four core providers (compare to Oracle or Licensing) — a good place to prove out the "add a second provider" pattern established by Phase 2's interfaces before applying it to higher-stakes providers in Phases 4–5.

**Tasks:**

- **Task 3.1 — Implement `S3StorageProvider`** (`@aws-sdk/client-s3` + `@aws-sdk/lib-storage` for streaming multipart upload, `@aws-sdk/s3-request-presigner` for `getPresignedDownloadUrl`), implementing the same `IObjectStorageProvider` interface, with its own conformance test suite (per spec Section 10 rule 3) run against a MinIO container in CI.
- **Task 3.2 — `StorageModule.forRoot()` gains real mode-selection logic**, keyed off a new `STORAGE_DRIVER` env var (`local | s3`), independent of but consistent with the `DEPLOYMENT_MODE` scaffolding from Phase 0 — default remains `local` everywhere until a deployment explicitly opts in.
- **Task 3.3 — Tenant-prefixed object keys.** `ObjectRepositoryService.storeFile()` gains a `tenantId` parameter (sourced from Phase 1's tenant context), used only by `S3StorageProvider` (a no-op prefix for `LocalStorageProvider`, which continues to use today's flat directory layout since self-hosted is always single-tenant).
- **Task 3.4 — Optional: pilot `S3StorageProvider` in one non-production/staging self-hosted-shaped environment**, verifying upload/download/delete/presigned-URL parity with `LocalStorageProvider` end-to-end, without changing any production deployment's `STORAGE_DRIVER`.

**Files/modules affected:** `backend/src/infrastructure/storage/s3-storage.provider.ts` (new), `storage.module.ts` (extend factory), `env.validation.ts` (`STORAGE_DRIVER` + S3 connection fields, all optional/unused unless `STORAGE_DRIVER=s3`), `.github/workflows/ci-backend.yml` (MinIO service container for conformance tests).

**Database migrations:** none — object keys stored in existing `url`/equivalent entity columns are unaffected until a future migration deliberately switches a deployment to `s3` (out of scope for this phase).

**API changes:** none.

**Frontend changes:** none — the frontend already only consumes whatever URL the backend returns; presigned vs. static-served URLs are transparent to it as long as both are valid, fetchable URLs (worth a explicit frontend smoke-test in this phase's checklist, not a code change).

**Risks:** low — this phase is additive and unselected-by-default everywhere. The main risk is a S3 SDK dependency/bundle-size concern for self-hosted installs that will never use it — mitigated by confirming the AWS SDK packages are dev/optional dependencies that don't materially affect the self-hosted install footprint, or lazy-loaded only when `STORAGE_DRIVER=s3`.

**Testing checklist:**
- [ ] `S3StorageProvider` conformance suite passes against MinIO in CI.
- [ ] Manual pilot (Task 3.4) confirms upload/download/delete/presigned-URL parity.
- [ ] Existing `LocalStorageProvider` path fully regression-tested — confirm zero behavior change for any environment not explicitly opting into `STORAGE_DRIVER=s3`.
- [ ] Self-hosted install footprint (bundle size, install time) unaffected.

**Rollback strategy.** `STORAGE_DRIVER` defaults to `local`; rollback for any environment that piloted `s3` is a one-line env var change back to `local` (with a data-location caveat if files were actually written to S3 during the pilot — call out explicitly in the pilot's own runbook, not a generic revert).

**Expected Git commits:** `feat(storage): implement S3StorageProvider`, `feat(storage): add STORAGE_DRIVER config and mode-selection factory`, `feat(storage): tenant-prefixed object keys`, `test(storage): add S3 conformance suite against MinIO in CI`.

**Application state after this phase:** identical to Phase 2's end state for every existing deployment. A second, opt-in, unused-by-default storage backend now exists and is proven correct.

---

## Phase 4 — Licensing Providers (add Subscription provider, still default to File)

**Objective.** Add `SubscriptionLicenseProvider` behind `ILicenseProvider`, not yet used by any live deployment — self-hosted (and the not-yet-existing cloud deployment) continue using `FileLicenseProvider`.

**Why now.** Licensing is more sensitive than storage (it gates paid access to modules) but less architecturally novel than Oracle transport — a deliberate middle step. Doing it before Phase 6/7 (Connector, Cloud Oracle Transport) means the Tenant Provisioning phase (10) has a real `ILicenseProvider` implementation to call, rather than being blocked on it later.

**Tasks:**

- **Task 4.1 — `resetToTrial()` tenant-scoping fix.** Before adding a second provider, close the high-risk gap flagged in the prior audits: scope every query inside `resetToTrial()` (and any equivalent destructive operation in `FileLicenseProvider`) to `tenantId`, using Phase 1's context. This is deliberately sequenced first in this phase, as a standalone, easily-reviewed commit, precisely because it's a correctness fix independent of the new provider and shouldn't be bundled with new-feature work.
- **Task 4.2 — Implement `SubscriptionLicenseProvider`** reading from an extended Vendor Portal schema (`Hospital`/`IssuedLicense` gain `stripeCustomerId`/`planId`/billing fields per the prior audit's recommendation — a Vendor Portal-side migration, tracked but out of this backend roadmap's direct scope, coordinated separately). No Stripe integration yet — this task stops at "read tenant license status from a DB table shaped like today's Vendor Portal schema," proving the interface, not yet building billing.
- **Task 4.3 — `LicensingInfraModule.forRoot()` gains mode-selection**, keyed off `LICENSE_PROVIDER` env var (`file | subscription`), default `file`.
- **Task 4.4 — Conformance test suite for `ILicenseProvider`**, run against both providers in CI.

**Files/modules affected:** `backend/src/infrastructure/licensing/subscription-license.provider.ts` (new), `licensing-infra.module.ts` (extend factory), `modules/licensing/license.service.ts` (Task 4.1's scoping fix), `env.validation.ts` (`LICENSE_PROVIDER`).

**Database migrations:** none in the HDSP backend itself for this phase (Vendor Portal-side schema extension is separate and does not touch the HDSP backend's own migrations).

**API changes:** none.

**Frontend changes:** none.

**Risks:** the highest-stakes item in this phase is Task 4.1 (a correctness fix touching a destructive operation) — mitigated by shipping it as its own reviewed, tested commit, verified against a copy of real data, before any new-provider work in the same phase.

**Testing checklist:**
- [ ] `resetToTrial()` (and equivalents) verified to only affect the intended tenant's data — test with ≥2 tenant rows present (using Phase 1's schema) even though only one tenant is live in production, to prove the fix.
- [ ] `SubscriptionLicenseProvider` conformance suite passes.
- [ ] `FileLicenseProvider` path fully regression-tested, zero behavior change confirmed.
- [ ] `LicenseGuard`/`@RequireModule()` behavior unchanged end-to-end for the default (`file`) provider.

**Rollback strategy.** `LICENSE_PROVIDER` defaults to `file`; Task 4.1's fix is independently revertible but should not be reverted without cause, since it's a standalone correctness fix, not a feature flag.

**Expected Git commits:** `fix(licensing): scope resetToTrial and destructive license ops to tenantId`, `feat(licensing): implement SubscriptionLicenseProvider`, `feat(licensing): add LICENSE_PROVIDER config and mode-selection factory`, `test(licensing): add ILicenseProvider conformance suite`.

**Application state after this phase:** identical to Phase 3's end state for every existing deployment, plus one important standalone correctness fix (Task 4.1) that benefits self-hosted today, independent of anything cloud-related.

---

## Phase 5 — Notification Providers (interface proven, still WhatsApp only)

**Objective.** Confirm `INotificationTransport` (already introduced in Phase 2) is genuinely provider-agnostic by adding a second, low-stakes implementation — not a strategic priority provider, just proof the abstraction holds — while production continues using `WhatsAppTransport` exclusively.

**Why now.** Lower priority and lower risk than Phases 3–4, placed here deliberately as a light phase before the higher-novelty Phase 6 (Connector) — a good checkpoint to confirm the provider pattern is holding up cleanly across three different infrastructure categories before tackling the hardest one.

**Tasks:**

- **Task 5.1 — Implement an `SmtpEmailTransport`** implementing a new, narrowly-scoped `IEmailTransport` (email was flagged as a genuine gap in the prior audit — no SMTP exists anywhere today — so this is new capability, not a refactor). Kept separate from `INotificationTransport`/WhatsApp rather than conflated into one interface, since email and WhatsApp have different payload shapes (per spec Section 4's `email/` vs `notifications/` split).
- **Task 5.2 — Wire `NotificationService` to dispatch through whichever transports are configured** (a tenant/deployment can have zero, one, or both channels active) — this is the first place a genuinely N-way (not just 2-way) provider selection shows up, validating spec Section 9's design intent early.
- **Task 5.3 — Per-tenant notification credential resolution stub.** Extend `NotificationService` to resolve credentials via `ISecretsProvider` keyed by `tenantId` rather than a single global env var — still resolves to the same single global credential in self-hosted/single-tenant mode, but proves the per-tenant credential path before Phase 8 needs it for real.

**Files/modules affected:** `backend/src/infrastructure/email/*` (new), `backend/src/infrastructure/notifications/notification-infra.module.ts` (extend), `modules/notifications/notification.service.ts`.

**Database migrations:** possibly one small migration if per-tenant notification credentials need a new settings table/column (extending the `system_settings`-style pattern) — kept minimal and additive.

**API changes:** none required, though an optional new endpoint for configuring email settings could be added here if desired — treat as optional/deferred to keep this phase light.

**Frontend changes:** none required for this phase (a settings UI for email config, if wanted, can follow later without blocking this phase).

**Risks:** low — genuinely new, additive, low-stakes capability.

**Testing checklist:**
- [ ] SMTP send verified end-to-end against a test mail server.
- [ ] `WhatsAppTransport` path fully regression-tested, zero behavior change.
- [ ] Per-tenant credential resolution correctly falls back to the single global credential in single-tenant mode.

**Rollback strategy.** Purely additive; revert removes the new email capability with no impact on existing WhatsApp notifications.

**Expected Git commits:** `feat(notifications): implement SmtpEmailTransport`, `feat(notifications): support multiple concurrently-active transports`, `feat(notifications): resolve credentials via ISecretsProvider per tenant`.

**Application state after this phase:** identical to Phase 4's end state, plus a new (optional, unused-unless-configured) email capability.

---

## Phase 6 — Connector (standalone component, not yet wired to cloud)

**Objective.** Extract the Oracle Client + Message Transport split (spec Section 7) into a standalone, versioned `connector/` component — but the backend continues using `DirectOracleTransport` exclusively. The Connector exists, builds, and can theoretically run standalone, but nothing in production talks to it yet.

**Why now.** This is the highest-novelty piece of the whole roadmap (per both prior reviews) — building it in isolation, with zero coupling to a live cloud deployment, means it can be developed, tested, and hardened without any production risk, and its interface (the Oracle Client / Message Transport split) can be validated before Phase 7 makes the backend depend on it.

**Tasks:**

- **Task 6.1 — Create the `connector/` top-level directory** as a new package (spec Section 7.4), initially just the Oracle Client half: relocate (not duplicate) the pool/circuit-breaker logic into a shared package consumable both by the backend's `DirectOracleTransport` (Phase 2) and the new standalone Connector binary — a shared internal package (similar to how `packages/form-schema` etc. are already shared across `backend`/`frontend` in this monorepo), not a copy-paste fork.
- **Task 6.2 — Define the Message Transport protocol** (`{correlationId, sqlTemplateId, binds} → {correlationId, rows|rowsAffected|error}`), including the SQL-template allow-list mechanism described in spec Section 7.2, and the specific queue/transport technology choice (message queue for async sync traffic + WebSocket or short-poll for interactive lookups, per the prior review's Section 6 recommendation) — implemented but not yet connected to any real cloud backend endpoint.
- **Task 6.3 — Standalone Connector build/run capability** — the Connector can be built and run as its own process locally/in CI (pointed at a test Oracle instance or a mock), independent of the main backend, proving it works in isolation.
- **Task 6.4 — Connector health-check endpoint**, extending the existing `common/health/oracle.health.ts` pattern.
- **Task 6.5 — Connector versioning and compatibility-matrix documentation**, establishing the release discipline from spec Section 7.4/11 ahead of the first real release in Phase 12.

**Files/modules affected:** new top-level `connector/` package; a new shared internal package for the Oracle Client (extracted from `backend/src/infrastructure/oracle/direct-oracle.transport.ts`'s underlying pool logic, without changing `DirectOracleTransport`'s external behavior); no changes to any Business/Platform module.

**Database migrations:** none.

**API changes:** none — the backend's public API is entirely untouched by this phase.

**Frontend changes:** none.

**Risks:** the main risk is scope creep — it would be easy to start wiring the Connector into the live backend in this phase "since it's right there." Explicitly deferred to Phase 7, kept as its own reviewed boundary, so this phase's testing can focus purely on the Connector's correctness in isolation.

**Testing checklist:**
- [ ] Connector builds and runs standalone.
- [ ] Message Transport protocol round-trips correctly against a mock backend endpoint (not the real one).
- [ ] Oracle Client (shared package) produces identical query results to today's `OraclePoolService`/`DirectOracleTransport` for the same test queries.
- [ ] Connector health-check reports accurate Oracle connectivity status.
- [ ] `DirectOracleTransport`'s production behavior is provably unaffected by the Task 6.1 code relocation (this is the one place in this phase with real regression risk, since it touches shared code) — full Oracle-dependent flow regression per Phase 2's Task 2.5 checklist, re-run here.

**Rollback strategy.** The `connector/` package and Message Transport protocol are entirely new and unreferenced by production code — trivially removable. The one shared-code-relocation risk (Task 6.1) is mitigated by keeping it a mechanical move verified byte-for-byte equivalent, same discipline as Phase 2.

**Expected Git commits:** `feat(connector): scaffold standalone connector package`, `refactor(oracle): extract shared Oracle Client package from DirectOracleTransport (no behavior change)`, `feat(connector): implement Message Transport protocol`, `feat(connector): add SQL template allow-list`, `feat(connector): add standalone health-check endpoint`, `docs(connector): versioning and compatibility matrix`.

**Application state after this phase:** identical to Phase 5's end state for the backend. A new, standalone, tested-in-isolation Connector component now exists, ready to be wired in.

---

## Phase 7 — Cloud Oracle Transport (uses Phase 6's Connector)

**Objective.** Implement `CloudOracleTransport` behind `IOracleTransport` (from Phase 2), which talks to the Phase 6 Connector over the Message Transport — but self-hosted deployments continue using `DirectOracleTransport` exclusively; `CloudOracleTransport` is only exercised in a controlled pilot, not production traffic, at the end of this phase.

**Why now.** This is the phase where the Connector built in isolation becomes real — the natural next step once Phase 6 has proven the Connector works standalone. Placed after Licensing/Notifications/Storage providers (Phases 3–5) so the "add a second provider behind an interface" pattern is well-proven by the time the hardest provider is tackled.

**Tasks:**

- **Task 7.1 — Implement `CloudOracleTransport`** implementing `IOracleTransport`, publishing to the Message Transport and awaiting correlated responses, with the same method signature (`query`/`execute`/`isAvailable`) as `DirectOracleTransport`.
- **Task 7.2 — `OracleModule.forRoot()` gains real mode-selection**, keyed off `ORACLE_TRANSPORT` env var (`direct | cloud_relay`), default `direct` everywhere.
- **Task 7.3 — Conformance test suite for `IOracleTransport`**, run against both `DirectOracleTransport` (real/test Oracle) and `CloudOracleTransport` (real/test Connector instance from Phase 6) in CI, proving both return byte-identical results for the same test queries.
- **Task 7.4 — Timeout/retry/circuit-breaker parity check.** `CloudOracleTransport` must replicate the operational resilience characteristics already proven in `DirectOracleTransport` (circuit breaker, retry-on-failure) at the transport layer, adapted for the added network hop — this is explicitly called out as its own task because it's the most likely place for behavioral drift between the two transports.
- **Task 7.5 — Controlled pilot.** One staging/test "hospital" configured end-to-end with `ORACLE_TRANSPORT=cloud_relay`, a real deployed Connector instance, and a real (test) Oracle database — validating the full path before any production cloud tenant ever uses it. No production traffic touches this yet.

**Files/modules affected:** `backend/src/infrastructure/oracle/cloud-oracle.transport.ts` (new), `oracle.module.ts` (extend factory), `env.validation.ts` (`ORACLE_TRANSPORT`), the `connector/` package (wired to a real endpoint for the pilot).

**Database migrations:** none.

**API changes:** none.

**Frontend changes:** none.

**Risks:** this is the single highest-risk phase in the roadmap, consistent with both prior reviews flagging Oracle connectivity redesign as the most architecturally novel piece. Mitigations: extensive conformance testing (Task 7.3) before any pilot; the pilot itself (Task 7.5) is explicitly non-production; `DirectOracleTransport` remains the default and only production path through the end of this phase.

**Testing checklist:**
- [ ] Conformance suite passes for both transports, same test-query set, byte-identical results.
- [ ] Circuit-breaker/retry behavior verified under simulated Oracle unavailability, Connector unavailability, and Message Transport unavailability — three distinct failure modes `DirectOracleTransport` never had to handle.
- [ ] Pilot environment runs a realistic workload (patient search, attendance polling, HIS sync) end-to-end against `CloudOracleTransport` for a sustained period (recommend at minimum several days of soak testing) before this phase is considered complete.
- [ ] `DirectOracleTransport`'s production behavior fully regression-tested, zero change confirmed.

**Rollback strategy.** `ORACLE_TRANSPORT` defaults to `direct`; the pilot environment's rollback is simply decommissioning it, with zero production impact since no live tenant depends on `CloudOracleTransport` yet.

**Expected Git commits:** `feat(oracle): implement CloudOracleTransport`, `feat(oracle): add ORACLE_TRANSPORT config and mode-selection factory`, `test(oracle): add IOracleTransport conformance suite (direct + cloud_relay)`, `feat(oracle): circuit-breaker and retry parity for CloudOracleTransport`, `docs(oracle): pilot environment runbook and soak-test results`.

**Application state after this phase:** identical to Phase 6's end state for every real deployment. A pilot-validated, not-yet-production `CloudOracleTransport` now exists.

---

## Phase 8 — Multi-Tenancy Activation

**Objective.** Turn on what Phase 1 built: real subdomain-based tenant resolution, tenant-aware JWT, and tenant enforcement across guards — enabling more than one tenant to exist and be genuinely isolated, for the first time. This is the phase where "cloud mode" becomes real in the sense of supporting >1 hospital, though still without a live customer-facing cloud deployment (that's Phase 9).

**Why now.** Everything before this phase was either scaffolding (Phase 1's schema) or provider-swapping with a single implicit tenant (Phases 2–7). This is the first phase that changes *authentication/authorization behavior*, so it's sequenced after every lower-risk infrastructure phase is stable — by this point, storage, licensing, notifications, and Oracle transport have all already proven the interface-swap pattern works, reducing the number of genuinely new risk classes introduced here to just the tenancy-enforcement logic itself.

**Tasks:**

- **Task 8.1 — `tenantId`/`tenantSlug` added to `JwtPayload`**, signed at login (`AuthService.generateTokens()`), resolved from the authenticating user's `tenant_id` (Phase 1). Still `'default'` for every existing self-hosted install.
- **Task 8.2 — Subdomain-resolution middleware**, replacing Phase 1's always-`'default'` `TenantContextMiddleware` with real `req.hostname` → `Tenant` lookup, falling back to `'default'` when no subdomain routing is configured (i.e., self-hosted's behavior is entirely unaffected — no subdomain means no resolution attempt, straight to `'default'`).
- **Task 8.3 — `TenantScopeGuard`**, verifying `req.tenantId === user.tenantId` (JWT claim) on every authenticated request — the guard that actually closes the "hospital A user logs into hospital B's subdomain" gap identified in the prior review.
- **Task 8.4 — `isSetupRequired`/`setupSuperAdmin` made tenant-scoped** (first admin per tenant, not globally-once).
- **Task 8.5 — Widget cookie flow (`hdsp_widget_session`) tenant-scoped.**
- **Task 8.6 — Cron/interval jobs updated to iterate over active tenants** rather than operating globally — for the currently-Postgres-only jobs identified in the prior audit (password-reset expiry, reservation sweep, campaign scheduler, token daily reset/analytics, CMS cleanup); the Oracle-touching pollers remain out of scope here since they move to the Connector's domain per Phase 6/7, not this phase.
- **Task 8.7 — CORS rework**: self-hosted keeps today's private-IP allowlist unconditionally; cloud mode (detected via `DEPLOYMENT_MODE`, the *one* legitimate new read site added to the Phase 0 CI allow-list) gains a wildcard-subdomain allowlist resolved from the tenant registry.

**Files/modules affected:** `modules/auth/auth.service.ts`, `modules/auth/strategies/jwt.strategy.ts`, `common/guards/*` (new `TenantScopeGuard`), `modules/platform/tenant/tenant-context.middleware.ts` (upgraded from Phase 1's stub), `modules/auth/setup.controller.ts`, widget-cookie-related auth controller code, the six cron/interval job classes listed above, `main.ts` (CORS).

**Database migrations:** none new — this phase activates behavior on top of Phase 1's already-complete schema.

**API changes:** `JwtPayload` shape changes (additive field, backward-compatible with any token already in flight since JWTs are short-lived — a 15-minute access-token TTL means old tokens naturally expire within the deployment window). No breaking change to any request/response DTO.

**Frontend changes:** minimal — the frontend should already treat the JWT as opaque; if any client-side code inspects JWT claims directly (worth an explicit audit in this phase, flagged as unknown/needs-verification in the prior review), update it to handle the new `tenantId` claim gracefully.

**Risks:**
- Cross-tenant data leakage if `TenantScopeGuard` has any bypass gap — mitigated by extensive authz test coverage explicitly attempting cross-tenant access with valid-but-wrong-tenant credentials, run before this phase is considered complete, not just "guard exists."
- Cron-job tenant-iteration introducing duplicate/missed processing if not carefully implemented — mitigated by keeping this phase's cron changes to the already-tenant-scoped, Postgres-only jobs (Task 8.6's explicit scope limit), deferring the harder Oracle-poller tenant-iteration question entirely to the Connector's domain.

**Testing checklist:**
- [ ] Self-hosted (`'default'`-only) behavior fully regression-tested — every existing auth/login/session flow unchanged.
- [ ] Explicit cross-tenant authz test suite: valid credentials for tenant A, attempted access via tenant B's subdomain/JWT, confirmed rejected at every guarded endpoint.
- [ ] `isSetupRequired` correctly allows a first-admin setup per new tenant without being blocked by an existing tenant's admin.
- [ ] Cron jobs verified to process each active tenant exactly once per scheduled run.
- [ ] CORS behavior verified correct for both `self_hosted` (unchanged private-IP allowlist) and a simulated `cloud` config (wildcard-subdomain allowlist).

**Rollback strategy.** Every task in this phase is additive/guard-based rather than destructive — rollback is a code revert; no data migration is introduced in this phase, so no data cleanup is needed on rollback. The `TenantScopeGuard` in particular should be introduced behind its own feature toggle initially (log-only "would have blocked" mode before hard-enforcing), giving a safe intermediate rollback point if unexpected legitimate traffic is caught.

**Expected Git commits:** `feat(auth): add tenantId claim to JwtPayload`, `feat(tenant): real subdomain-resolution middleware`, `feat(auth): TenantScopeGuard (log-only mode)`, `feat(auth): TenantScopeGuard (enforced)`, `fix(auth): scope isSetupRequired/setupSuperAdmin per tenant`, `fix(auth): scope widget cookie flow per tenant`, `feat(scheduler): tenant-iterate Postgres-only cron jobs`, `feat(security): cloud-mode wildcard-subdomain CORS`.

**Application state after this phase:** self-hosted behavior fully unchanged. The application is now genuinely capable of serving more than one isolated tenant, though no live cloud deployment exists to exercise it with real customer traffic yet.

---

## Phase 9 — Cloud Deployment (infrastructure, not application code)

**Objective.** Stand up the actual cloud environment (containers, ECS/equivalent, managed Postgres/Redis, object storage, workers) that everything since Phase 0 has been preparing the application to run on — this phase is primarily infrastructure-as-code and deployment tooling, not backend feature work.

**Why now.** Every application-level precondition (tenant model, provider abstractions, cloud transports) is now in place; this phase would have been premature earlier (nothing to deploy that could actually behave differently in cloud mode) and would be a distraction if attempted earlier (infrastructure work competing for attention with the higher-risk Phases 6–8).

**Tasks:**

- **Task 9.1 — Dockerfiles** for backend API, worker, frontend, and the Phase 6 Connector (currently entirely absent from the repo per the prior audit).
- **Task 9.2 — ECS Fargate task definitions/services** (or the team's chosen equivalent) for the three core services, per the prior review's Section 13 recommendation.
- **Task 9.3 — RDS Postgres (Multi-AZ) and ElastiCache Redis provisioning**, connection details wired through existing `database.config.ts`/`redis.config.ts` (no code change needed — both already config-driven).
- **Task 9.4 — S3 bucket + CloudFront**, `STORAGE_DRIVER=s3` activated for the cloud environment (Phase 3's already-implemented, already-tested provider).
- **Task 9.5 — ALB host-based routing** for subdomain-per-tenant, WAF attached.
- **Task 9.6 — Worker service split** — the dedicated worker deployment target (Bull consumers + tenant-iterated cron) separated from the API service, per the prior review's Section 10 recommendation, now that Phase 8's tenant-iteration logic exists to run inside it.
- **Task 9.7 — Centralized logging** (CloudWatch, re-enabling Winston's console/stdout transport in the container context) and health-check-driven service recovery (using the already-cloud-ready `@nestjs/terminus` endpoints).
- **Task 9.8 — `DEPLOYMENT_MODE=cloud` set for the first time in a real running environment** (staging first, then production), with `STORAGE_DRIVER=s3`, `ORACLE_TRANSPORT=cloud_relay`, `LICENSE_PROVIDER=subscription` — the first environment where all four provider selections flip together, deliberately validated as a full stack in staging before production.

**Files/modules affected:** no backend/frontend application code changes in this phase beyond configuration — this is `infrastructure/` (the deployment-tooling directory, not the code module of the same name) and IaC/CI changes.

**Database migrations:** none new — RDS is provisioned with the schema Phase 1 already defined.

**API changes:** none.

**Frontend changes:** build/deployment target changes only (pointed at the cloud API base URL), no code changes.

**Risks:** classic infrastructure cutover risk (DNS, TLS, connection-string misconfiguration) rather than application-logic risk at this point — mitigated by a staging environment fully mirroring production configuration before any real tenant is provisioned onto it (Phase 10 is explicitly the *next* phase, not bundled here).

**Testing checklist:**
- [ ] Staging environment fully deployed with `DEPLOYMENT_MODE=cloud` and all four cloud providers active.
- [ ] Full regression suite (all prior phases' checklists) re-run in the cloud environment, not just locally.
- [ ] Load test at expected initial scale.
- [ ] DR drill: simulate an AZ failure, confirm RDS/ElastiCache failover and ECS service recovery.
- [ ] Health-check-driven auto-recovery verified by deliberately killing a task.

**Rollback strategy.** Staging cutover is fully reversible (tear down the environment). Production cutover, once reached, follows standard blue/green or canary deployment practice — kept out of scope for detailed prescription here since it's a one-time infrastructure event better covered by a dedicated cutover runbook, not this application-focused roadmap.

**Expected Git commits:** `chore(infra): add backend/worker/frontend/connector Dockerfiles`, `chore(infra): ECS task definitions and service configs`, `chore(infra): Terraform/CDK for RDS, ElastiCache, S3, CloudFront`, `chore(infra): ALB host-based routing and WAF config`, `chore(infra): split worker deployment target`, `chore(infra): CloudWatch logging and health-check wiring`.

**Application state after this phase:** a real, staging-validated cloud environment exists, running the exact same application code as every self-hosted install, with all four provider seams pointed at their cloud implementations. No production cloud tenant exists yet — that's Phase 10.

---

## Phase 10 — Tenant Provisioning (hospital onboarding)

**Objective.** Implement `TenantProvisioningService` (spec Section 8.1) so a new cloud hospital customer can be onboarded through a defined, resumable pipeline rather than manual setup — the first phase where a real second cloud tenant can actually go live.

**Why now.** This is the natural capstone of Phases 1–9 — every piece it orchestrates (Tenant creation, RBAC seeding, settings seeding, storage namespace, Connector pairing key, license issuance) already exists as a capability from an earlier phase; this phase's job is purely to sequence them into one reliable workflow.

**Tasks:**

- **Task 10.1 — `TenantProvisioningService` skeleton**, built on the existing Document-Platform workflow-engine primitives per spec Section 8.1, with each step idempotent and independently retryable, and a clear "incomplete" state if any step fails.
- **Task 10.2 — Steps 1–5 (Tenant, subdomain, roles, permissions, default settings)** — pure Platform-layer work, no new infra dependency, lowest risk.
- **Task 10.3 — Step 6 (storage namespace)** — trivial given Phase 3/9's tenant-prefixed S3 key convention already exists; this step just registers the prefix, no bucket creation needed.
- **Task 10.4 — Step 7 (Connector pairing key generation)** — the first real product surface for the Phase 6/7 Connector work; generates the credential a hospital's deployed Connector instance uses to authenticate.
- **Task 10.5 — Step 8 (initial license issuance via `SubscriptionLicenseProvider`)**, starting in trial status per existing trial-mode semantics (Phase 4's provider, now used for real).
- **Task 10.6 — Steps 9–10 (initial SUPER_ADMIN user, `TenantProvisioned` event)**.
- **Task 10.7 — Admin-facing provisioning API/UI** (internal tool, not customer self-service at this stage) to trigger and monitor the pipeline.
- **Task 10.8 — Pilot: provision 1–2 real friendly-customer hospitals end-to-end**, the first real cloud tenants, run in parallel with their continued (or newly-adopted) self-hosted or previous arrangement until validated.

**Files/modules affected:** new `modules/platform/tenant-provisioning/**`; admin-facing controller/UI (new); no changes to existing Business modules.

**Database migrations:** none new beyond what Phase 1 already defined — provisioning writes rows, it doesn't change schema.

**API changes:** new internal admin-only endpoints for triggering/monitoring provisioning — additive, not touching any existing public API.

**Frontend changes:** new internal admin UI (or reuse of an existing admin panel) for provisioning — additive.

**Risks:** partial-provisioning failure leaving a tenant in a broken state — mitigated by the idempotent/resumable design (Task 10.1) and the explicit "incomplete" state requirement from the spec, verified by testing deliberate failure injection at each step.

**Testing checklist:**
- [ ] Full pipeline succeeds end-to-end in staging.
- [ ] Deliberate failure injected at each step, confirmed resumable without side effects (no duplicate roles/settings/license rows on retry).
- [ ] Pilot hospital(s) can log in, use licensed modules, and have their Oracle Connector paired and functioning, fully mirroring a self-hosted hospital's capabilities.

**Rollback strategy.** A failed/incomplete provisioning run is either resumed or explicitly torn down via a companion de-provisioning path (worth building as part of Task 10.1, not an afterthought) — since this phase only creates new tenants, it carries no risk to any existing tenant's data.

**Expected Git commits:** `feat(provisioning): TenantProvisioningService skeleton on workflow engine`, `feat(provisioning): tenant/roles/permissions/settings seeding steps`, `feat(provisioning): storage namespace step`, `feat(provisioning): connector pairing key generation`, `feat(provisioning): initial license issuance step`, `feat(provisioning): admin user + TenantProvisioned event`, `feat(provisioning): internal admin API/UI`, `docs(provisioning): pilot runbook`.

**Application state after this phase:** the first real, production cloud tenant(s) exist and are fully operational, provisioned through a repeatable pipeline rather than manual setup. Self-hosted deployments remain entirely unaffected.

---

## Phase 11 — Feature Flags

**Objective.** Introduce the `FeatureFlag` layer (spec Section 8.2) beneath the existing module-level licensing, enabling trials, beta programs, and finer-grained enterprise differentiation.

**Why now.** Placed after Tenant Provisioning (Phase 10) because feature flags are most valuable once there are multiple real tenants to differentiate between — building this earlier would have had no real use case to validate against.

**Tasks:**

- **Task 11.1 — `FeatureFlag` entity + `FeatureFlagService`**, Redis-cached identically to today's `LicenseService.getStatus()` pattern (short TTL, cache-busted on change).
- **Task 11.2 — `@RequireFeature()` decorator/guard**, sitting underneath the existing `@RequireModule()`/`LicenseGuard` per spec Section 8.2 — module gate wins if the module itself is unlicensed, feature gate only evaluated within an already-licensed module.
- **Task 11.3 — Migrate the first real use case** (e.g., gate the AI Assistant, or another genuinely optional sub-capability identified with the product team) onto the new flag, proving the pattern with one real feature before broader adoption.
- **Task 11.4 — Admin-facing feature-flag management** (internal tool, extend Task 10.7's admin surface).

**Files/modules affected:** new `modules/platform/feature-flags/**`; one pilot Business-module controller updated to use `@RequireFeature()`.

**Database migrations:** one small, additive migration for the `FeatureFlag` table.

**API changes:** additive only.

**Frontend changes:** the pilot feature's UI gains a flag-aware visibility check (consistent with how licensing-gated UI presumably already works today) plus the new admin management UI.

**Risks:** low — purely additive layer with a narrow initial pilot use case before wider rollout.

**Testing checklist:**
- [ ] Feature flag correctly gates the pilot capability per-tenant.
- [ ] Module-level license gate correctly overrides an enabled feature flag when the parent module itself is unlicensed.
- [ ] Cache invalidation on flag change verified (no stale-flag window beyond the defined TTL).

**Rollback strategy.** Purely additive; revert removes the flag layer and the pilot feature reverts to its always-on (or always-off, per how it's currently gated) prior behavior.

**Expected Git commits:** `feat(feature-flags): FeatureFlag entity and service`, `feat(feature-flags): RequireFeature decorator and guard`, `feat(feature-flags): migrate <pilot feature> to flag-based gating`, `feat(feature-flags): admin management UI`.

**Application state after this phase:** identical to Phase 10's end state, plus a proven, extensible feature-flag layer ready for broader use.

---

## Phase 12 — CI/CD and Release Packaging

**Objective.** Formalize the one-pipeline, multiple-artifact release strategy (spec Section 11) — versioned container images for API/worker/frontend/Connector, an automated self-hosted installer replacing today's manual `DEPLOY.md` runbook, and the Backend/Connector compatibility-matrix discipline.

**Why now.** Deliberately last — every artifact this phase packages and every environment it targets (cloud via Phase 9, self-hosted's existing PM2/Nginx/Docker-Compose stack, the Connector from Phase 6/7) already exists and is already proven; this phase is about *release discipline*, not new capability, and benefits from having nothing left to change underneath it.

**Tasks:**

- **Task 12.1 — Harden existing CI** (`ci-backend.yml`/`ci-frontend.yml`): switch `npm install` → `npm ci` (a known, already-tracked gap), add the provider-conformance suites from Phases 3/4/7 as required CI gates, add E2E smoke tests.
- **Task 12.2 — Build stage**: produce versioned, `DEPLOYMENT_MODE`-agnostic container images (`hdsp-api:<sha>`, `hdsp-worker:<sha>`, `hdsp-frontend:<sha>`, `hdsp-connector:<sha>`), pushed to a registry.
- **Task 12.3 — Cloud deploy automation**: image → ECR → ECS deploy, gated by the required CI checks from Task 12.1, with an approval gate for production.
- **Task 12.4 — Self-hosted package pipeline**: `docker-compose.selfhosted.yml` referencing the same image tags, an automated installer script (extending `DEPLOY.md`'s manual runbook — pulls images, runs the reduced self-hosted `TenantProvisioningService` pipeline from Phase 10, writes `.env` from a template, starts the stack), published as a versioned GitHub Release.
- **Task 12.5 — Backend/Connector compatibility matrix**, published and enforced (installer/deploy tooling checks version compatibility before proceeding).
- **Task 12.6 — Supported-version-window policy** for self-hosted (e.g., N-2), documented and reflected in the release notes process.

**Files/modules affected:** `.github/workflows/*` (extended, not replaced), new installer script/tooling, `DEPLOY.md` (rewritten to describe the automated flow, with the manual steps retained as a documented fallback).

**Database migrations:** none.

**API changes:** none.

**Frontend changes:** none beyond build/packaging.

**Risks:** primarily process risk (a broken installer script blocking a hospital's upgrade) — mitigated by dogfooding the automated installer against a staging self-hosted environment before it replaces the manual runbook as the recommended path, and keeping the manual runbook documented as a fallback for at least one release cycle.

**Testing checklist:**
- [ ] Full CI pipeline (including all provider-conformance suites) green on a real PR.
- [ ] Cloud deploy automation successfully deploys a tagged release to staging, then production, with the approval gate functioning correctly.
- [ ] Self-hosted installer successfully provisions a fresh environment end-to-end, dogfooded against a staging self-hosted box before being recommended to real hospitals.
- [ ] Compatibility-matrix check correctly blocks a deliberately-mismatched Backend/Connector version pairing.

**Rollback strategy.** Cloud: standard versioned-image rollback (redeploy the previous tag). Self-hosted: the installer's own versioning means a hospital can re-run against a previous release tag; the manual `DEPLOY.md` fallback remains available as an escape hatch during the transition period.

**Expected Git commits:** `ci: switch npm install to npm ci`, `ci: add provider-conformance suites as required gates`, `ci: add E2E smoke tests`, `chore(release): build stage for versioned deployment-mode-agnostic images`, `chore(release): cloud deploy automation to ECS`, `chore(release): self-hosted docker-compose and installer script`, `chore(release): backend/connector compatibility matrix`, `docs: rewrite DEPLOY.md for automated installer, retain manual fallback`.

**Application state after this phase:** the full hybrid architecture from the v2.0 specification is implemented, deployed, and released through one disciplined pipeline — cloud and self-hosted are two packaging targets of the same continuously-tested codebase, exactly as the specification's Principle 1 requires.

---

## Cross-Phase Notes

**On merge-conflict minimization.** Phases 3, 4, and 5 (Storage/Licensing/Notification providers) touch disjoint files after Phase 2 lands and can be developed concurrently by different engineers with minimal conflict risk, since Phase 2 has already isolated each provider behind its own interface and module. Phase 1's migrations are the highest conflict-risk area precisely because they touch nearly every module — the batch-by-module task breakdown in Phase 1 is designed explicitly to let different engineers own different module batches concurrently without stepping on each other's migration files, provided migration-file timestamp ordering is coordinated (a brief standup/Slack-check before generating a new migration file's timestamp, given this codebase's own history of duplicate-timestamp migrations flagged in the prior audit).

**On "every phase leaves a working application."** Every phase above ends with an explicit "application state after this phase" statement confirming this — read it as the acceptance criterion for the phase, not optional color commentary. If a phase's plan, once elaborated in detail at implementation time, turns out not to satisfy this property, the task breakdown within that phase should be adjusted (split further) rather than the property relaxed.

**On testing depth over time.** Early phases (0–2) rely primarily on the existing test suite plus targeted smoke checks, because they're refactors. Later phases (7, 8, 10) require materially more investment in new test infrastructure (conformance suites, cross-tenant authz tests, provisioning failure-injection tests) because they introduce genuinely new behavior — this is intentional and should be budgeted for explicitly when each phase is scheduled, not treated as uniform effort across all twelve phases.

---

This roadmap is the reference for phase-by-phase execution. No code has been written against it yet. When you're ready, tell me which phase to start with, and I will produce the detailed, file-level implementation plan for that phase's first task, note any simpler alternative I see given the current codebase state, and wait for your approval before generating any code.
