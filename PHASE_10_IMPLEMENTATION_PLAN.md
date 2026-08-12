# Phase 10 Implementation Plan — Tenant Provisioning

Status: **Complete**
Scope decision: roadmap-literal Phase 10 (Tasks 10.1–10.8), no business-module changes. See `PHASE_10_ARCHITECTURE_REVIEW.md` for the pre-flight and the user's explicit Option 3 scope decision. Broader SaaS-operations capabilities are tracked separately in `PHASE_10_DEFERRED_BACKLOG.md`.

## What this phase builds

A purpose-built tenant provisioning pipeline: given a hospital name, a subdomain, and an initial admin's credentials, an internal platform operator can create a fully working tenant — a `Tenant` row, a verified subdomain, a trial `SubscriptionLicense`, a Connector pairing key, and a `SUPER_ADMIN` user — in one API call, with the run's progress durably tracked and resumable if it fails partway through.

## Two roadmap-vs-reality discrepancies found during pre-flight, and how they were resolved

### 1. No generic workflow engine exists

Spec Section 8.1 assumed `TenantProvisioningService` would be "built on the existing Workflow-engine primitives already present in `document-platform`." Investigation found that module (`backend/src/modules/document-platform/workflow-engine/`) is a document-approval state machine (draft → review → approved, driven by explicit human approve/reject actions) — not a generic multi-step process runner with per-step retry and resumption.

**Resolution:** built a minimal, purpose-built step-runner instead: `TenantProvisioningRun` (one row per provisioning attempt) and `TenantProvisioningStep` (one row per pipeline step per run, in a fixed 10-step order). `TenantProvisioningService.execute()` walks the steps in order, skips anything already `succeeded`, and stops at the first failure — leaving the run in a `failed` state with the failing step's error recorded. `resume(runId)` re-reads the run's own steps and continues from there. This is intentionally the smallest thing that satisfies "can onboarding resume after failure?" (see `PHASE_10_ARCHITECTURE_REVIEW.md`, Question 6) — it is not a general-purpose workflow engine and was not built as one.

### 2. Roles, Permissions, and Settings are global singletons, not per-tenant tables

Spec Section 8.1's Steps 3–5 assumed "seed default Roles/Permissions/Settings scoped to `tenant_id`" is a straightforward per-tenant insert. Investigation found:

- `Role.name` carries a **global** unique constraint (not composite with `tenant_id`). `seed-platform.ts`'s own `ON CONFLICT ("name") DO NOTHING` only makes sense if roles are shared across tenants, which they are today.
- `Permission` has the same pattern: global unique on `(module_code, resource, action)`.
- `SystemSetting`, `CMSSettings`, and `FeedbackSettings` are all de-facto global singleton tables — `CMSSettings`/`FeedbackSettings`'s own doc comments say so explicitly ("Singleton row pattern: always operate on the first (only) row"). No service anywhere has a genuine per-tenant "create a new settings row" path.
- All three settings tables do have a nullable, unused `tenant_id` column (backfilled to `'default'` by an earlier migration) — an artifact, not a working feature.

Creating genuine per-tenant Role/Permission rows would violate the existing unique constraints outright. Building genuine per-tenant Settings rows would require changing `SettingsService`/`CmsSettingsService`/`FeedbackSettingsService`'s read paths — a business-module change explicitly out of scope for this phase per the Option 3 decision ("no business-module changes").

**Resolution, documented in code (`tenant-provisioning.service.ts`, Steps 3–5) rather than silently glossed over:**
- Step 3 (`ensure_global_roles`) and Step 4 (`ensure_global_permissions`) do **not** create new rows. They verify the platform's global role/permission catalog is present and complete (the exact set `seed-platform.ts` seeds), and fail loudly if it is missing — a newly provisioned tenant needs those global rows to exist before Step 9 assigns `SUPER_ADMIN` to its admin user.
- Step 5 (`ensure_global_settings`) is an explicit no-op, tracked in the step ledger with a `deferred: true` result flag rather than silently skipped, so the run's audit trail honestly reflects that tenant-scoped settings do not exist yet.
- Building real per-tenant Settings rows is tracked in `PHASE_10_DEFERRED_BACKLOG.md`.

### Bonus finding: `Tenant.subdomain` had no DB-level unique constraint

Phase 8's `SubdomainTenantMiddleware`/`TenantContextService.resolveTenantBySubdomain()` already assumed subdomain uniqueness via a `.findOne()` lookup, but nothing enforced it at the database level. Fixed additively in this phase's migration (`1783840000000-CreateTenantProvisioning.ts`): `ALTER TABLE "tenant" ADD CONSTRAINT "UQ_tenant_subdomain" UNIQUE ("subdomain")` — safe because Postgres allows unlimited NULLs in a unique index, and the only pre-existing tenant (`code: 'default'`) has a null subdomain.

## The 10 pipeline steps (spec Section 8.1, as actually implemented)

1. `create_tenant_row` — creates the `Tenant` row (code derived from subdomain, status `active`).
2. `reserve_subdomain` — verifies Step 1's write against the DB-level unique constraint (real enforcement lives in the constraint; this step is an explicit auditable confirmation, not a no-op).
3. `ensure_global_roles` — verifies the platform's global role catalog is complete. No per-tenant rows created (see discrepancy #2 above).
4. `ensure_global_permissions` — same pattern for permissions.
5. `ensure_global_settings` — explicit, tracked no-op (see discrepancy #2 above).
6. `allocate_storage_namespace` — confirms no separate allocation is needed: `S3StorageProvider._key()` already prefixes every object key with `<tenantId>/...` once the tenant exists (Phase 3, Task 3.3).
7. `generate_connector_pairing_key` — generates a random 256-bit credential, stores only its bcrypt hash in `TenantConnectorPairing` (`status: 'pending'`), returns the raw key exactly once in the step result. See that entity's doc comment for the documented protocol gap (nothing consumes this credential yet — deferred, see backlog).
8. `issue_trial_license` — creates a `SubscriptionLicense` row (`subscriptionStatus: 'trialing'`, `maxUsers: 5`).
9. `create_super_admin_user` — calls `AuthService.setupSuperAdmin()` (already tenant-scoped since Phase 8, Task 8.4) to create the tenant's first user.
10. `emit_tenant_provisioned_event` — emits `TenantProvisionedEvent` via the app-wide `EventEmitter2`. No consumer exists yet (documented in the event file) — the contract is established for a future welcome-email/onboarding listener.

## What was built

- `backend/src/database/migrations/1783840000000-CreateTenantProvisioning.ts` — subdomain unique constraint + 3 new tables.
- `backend/src/modules/platform/tenant-provisioning/entities/` — `TenantProvisioningRun`, `TenantProvisioningStep`, `TenantConnectorPairing`.
- `backend/src/modules/platform/tenant-provisioning/dto/provision-tenant.dto.ts` — `ProvisionTenantDto`.
- `backend/src/modules/platform/tenant-provisioning/events/tenant-provisioned.event.ts` — `TenantProvisionedEvent`.
- `backend/src/modules/platform/tenant-provisioning/tenant-provisioning.service.ts` — the step-runner (`provision()`, `resume()`, 10 step methods, `deprovision()`).
- `backend/src/modules/platform/tenant-provisioning/tenant-provisioning.controller.ts` — internal admin API, `SUPER_ADMIN`-only (`JwtAuthGuard` + `RolesGuard` + `@Roles('SUPER_ADMIN')`):
  - `POST /platform/tenant-provisioning` — start a new run.
  - `POST /platform/tenant-provisioning/:runId/resume` — resume a failed run.
  - `GET /platform/tenant-provisioning` — list runs.
  - `GET /platform/tenant-provisioning/:runId` — run detail + step ledger.
  - `POST /platform/tenant-provisioning/tenants/:tenantId/deprovision` — pilot rollback (Task 10.8, see below).
- `backend/src/modules/platform/tenant-provisioning/tenant-provisioning.module.ts` — registered in `app.module.ts`.

## Task 10.8 — pilot note and de-provisioning path

The roadmap's own rollback-strategy requirement for a pilot rollout is satisfied by `TenantProvisioningService.deprovision(tenantId)`: sets the `Tenant` row's `status` to `inactive` (which Phase 8's subdomain-resolution middleware already treats as unresolvable, blocking new logins) and revokes any outstanding connector pairing. It does **not** delete the tenant, its users, its business data, or its license — deletion and full suspend/reactivate/rename lifecycle management are deliberately out of scope for this phase (see `PHASE_10_DEFERRED_BACKLOG.md`, "Full tenant lifecycle"). This is a narrow safety valve for undoing an erroneous pilot provisioning run, not a general tenant-management surface.

**Pilot note:** this phase has not been exercised against a real cloud database or a real Connector instance — no AWS credentials or Oracle connectivity exist in this sandbox. The full provisioning flow (all 10 steps, including the `AuthService.setupSuperAdmin()` call and `SubscriptionLicense` creation) should be run once end-to-end in the actual office/cloud environment before the first real hospital is onboarded, per this project's standing practice of not fabricating verification evidence for infrastructure that hasn't actually been exercised.

## Explicitly out of scope for this phase

See `PHASE_10_DEFERRED_BACKLOG.md` for the full, tracked list: Vendor Portal self-service onboarding, full tenant lifecycle management, Connector fleet management / pairing-protocol consumption, subscription lifecycle automation, secret/credential rotation tooling, operational dashboards, and genuine per-tenant Roles/Permissions/Settings.
