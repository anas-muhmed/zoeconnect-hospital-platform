# HDSP Cloud vs. Self-Hosted — Architecture Separation Roadmap

Date: 2026-07-20 (revised 2026-07-21)
Status: Phases 1–2 shipped. Phase 3 REVISED (see below) — Oracle pool
refactor not started, deliberately deferred to after tonight's deployment.

## Revision, 2026-07-21

Original Phase 3 assumed cloud would move to middleware/REST-based HIS
integration instead of direct Oracle connectivity. That assumption is
wrong and is being corrected here: cloud tenants ARE meant to connect
directly to their own Oracle HIS database, same as self-hosted — the
requirement is that the connection be properly tenant-scoped, not that it
be replaced with middleware. Middleware/REST remains a possible *optional*
integration strategy for the future, not the primary direction.

What actually needs to be cloud-only-restricted is **Attendance**, because
it's a continuously-polling, data-intensive background service that
doesn't fit a shared multi-tenant backend process — not Oracle
connectivity generally.

Revised phases:
- **Phase 1 (tonight)**: Attendance disabled entirely for cloud (already
  shipped, unaffected by this revision) + HIS config gating corrected so
  Oracle DB_CONNECTION fields stay available for cloud and only
  Attendance's runtime-tuning fields are hidden (this was backwards until
  today's fix — see below).
- **Phase 2 (shipped)**: Hospitals + Cloud Tenants → Customers merge.
  Unaffected by this revision.
- **Phase 3 (next major project, NOT tonight)**: replace the singleton
  `OraclePoolService` with a tenant-aware `OraclePoolManager` that resolves
  the current tenant, loads that tenant's HIS config, and creates/reuses a
  connection pool per tenant (evicting idle pools after a configurable
  timeout). Make `his_schema_config`'s cache (currently one global
  `REDIS_KEY`, see `his-config.service.ts`) and any related caches fully
  tenant-scoped. This is what makes direct per-tenant Oracle connectivity
  actually safe for cloud — today's single process-wide pool and global
  config cache would silently mix tenants' Oracle credentials/mappings the
  moment more than one cloud tenant has data in `his_schema_config`
  (already flagged as a known gap in that file's own doc comment).

## Phase 1 correction, 2026-07-21

`HospitalsService.getHisConfig()`/`updateHisConfig()` and the Vendor
Portal's HIS Config page originally excluded the `DB_CONNECTION` category
(Oracle host/port/service/user/password/pool) for cloud hospitals, and did
NOT exclude the `ATTENDANCE` category (20 attendance-specific
runtime-tuning keys: polling intervals, dependency-poller flags, HIS
reconciliation, retroactive recalc). That's backwards from the intended
architecture. Fixed: cloud now sees/can edit `DB_CONNECTION` (and every
other category — Query Configuration, SQL Queries) exactly like
self-hosted; only `ATTENDANCE` is excluded, since Attendance itself never
runs for cloud. Frontend HIS Config page's sidebar updated to match: the
"Database Connection" section is no longer cloud-hidden; "Attendance
Runtime Config" now is.

`assertSelfHosted()` (guards `syncHisConfig`, `pushHisConfigWithUsers`,
`pushSystemSettings`, `testDbConnection`) is unaffected by this correction
— those 4 methods push/pull config over the network to a self-hosted
instance's own IP:port (webhook or direct fetch), which has nothing to do
with whether cloud has Oracle connectivity. They stay self-hosted-only
until Phase 3's `OraclePoolManager` gives cloud tenants an in-process
equivalent (`testDbConnection` in particular should eventually test the
tenant's own pool directly instead of proxying to a remote instance).

## Why this document exists

Cloud was being built as "self-hosted running in the cloud." Several real
bugs this session (login tenant resolution, empty Users list, idle-timeout
cross-tenant leak, token-config 500s) all traced back to that same root
cause: code written for a single-tenant, single-Oracle-DB deployment was
never fully re-architected for multi-tenant cloud, just patched around it.

Decision: stop retrofitting self-hosted capabilities into cloud one bug at
a time. Treat Cloud and Self-Hosted as two deployment models with shared
business modules (RBAC, Users, CMS, Feedback, Loyalty, Query Configuration)
and different infrastructure capabilities (vendor pairing, direct Oracle
connectivity, Attendance polling, license files).

## Phase 1 — Tonight (shipped, 2026-07-20)

- **Attendance disabled entirely for cloud**, not just hidden. `AttendanceModule`
  is excluded from the NestJS DI graph when `DEPLOYMENT_MODE=cloud`
  (`backend/src/app.module.ts`) — its controllers never register (`/attendance/*`
  404s outright), `DependencyPollingOrchestrator`'s background poller never
  starts, no Oracle connection attempts, no BullMQ queue registration.
  Self-hosted (unset or `self_hosted`) is unaffected — same module list as
  before.
- **Frontend nav**: Attendance menu group hidden for cloud tenants
  (`frontend/src/app/(platform)/layout.tsx`), derived from
  `licenseApi.getStatus().deploymentMode` (already-existing endpoint field),
  not a new build-time flag. Dashboard's Attendance card already self-heals
  (its `/attendance/enabled` check now 404s for cloud, defaulting to hidden).
- **License request dialog**: `ATTENDANCE` no longer offered as a requestable
  module for cloud tenants (`settings/license/page.tsx`).
- **Vendor Connection card on login**: confirmed already self-hosted-only
  (`isCloudMode` gate, done earlier this session) — no cloud tenant sees
  vendor pairing/registration UI.
- **HIS Oracle configuration UI**: confirmed there is currently no
  cloud-reachable screen for this at all — Vendor Portal's Oracle-config
  screens live entirely under `hospitals/[id]/his-config`, and cloud tenants
  don't have a `hospitals` row (see Phase 2). Nothing to gate today; must be
  addressed correctly when Phase 2 gives cloud tenants a management screen.

## Phase 2 — Unify Hospitals + Cloud Tenants into "Customers" (shipped, 2026-07-20)

Implemented as a link, not a full data-model replacement (lower risk, no
data migration of either existing table's identity):

- `hospitals` gets two new columns: `deployment_type` ('self_hosted' |
  'cloud', default 'self_hosted' -- every existing row is unaffected) and
  `cloud_tenant_id` (nullable, cross-references `cloud_tenants.id`). The
  self-hosted-only columns (instance_token/instance_secret/public_ip/
  webhook_url/machine_fingerprint) are now nullable -- a cloud row has none
  of these. Migration: `1785700000000-CustomersMerge.ts`.
- `CloudTenantsService.provision()` now calls `linkHospitalRecord()` on a
  successful (ACTIVE) result, creating or updating the linked `hospitals`
  row (idempotent on retries, keyed by `cloudTenantId` not `hospitalCode`).
  `deprovision()` syncs the linked row to SUSPENDED. This is what makes a
  cloud tenant show up in the Hospitals list and become manageable through
  the exact same license/user/HIS-config/settings surface self-hosted
  hospitals already have -- no duplicate controller under `cloud-tenants`.
- `HospitalsService` guards the subset of actions that depend on a
  reachable physical instance (`syncHisConfig`, `pushHisConfigWithUsers`,
  `pushSystemSettings`, `testDbConnection`) with a clear error for cloud
  rows instead of a confusing `http://null:null/...` failure. These
  genuinely can't work until Phase 3's middleware/API integration exists.
- `getHisConfig()`/`updateHisConfig()` exclude/reject Oracle DB_CONNECTION
  fields for cloud hospitals server-side; Query Configuration (patient/
  billing/appointment table+column mappings) remains fully available --
  exactly the split the user asked for.
- Frontend: Hospitals list shows a Cloud/Self-Hosted type chip and handles
  null publicIp/machineFingerprint for cloud rows. The HIS Config page hides
  its Database Connection and Attendance Runtime Config sidebar sections
  entirely for cloud hospitals (both are self-hosted-only). The Cloud
  Tenant detail page gained an "Ongoing Management" card linking straight
  into the linked hospital's HIS Config / HDSP Users / System Settings
  pages once provisioning completes.

Deliberately NOT done in this pass: a real "Customers" rename/rebrand, or a
dedicated lookup endpoint for cloud-tenant-to-hospital linking (the
frontend currently matches client-side against the full hospitals list,
fine at today's scale). Worth revisiting if the hospital count grows large
enough for that lookup to matter.

Original problem statement, for reference -- Vendor Portal had two
disconnected models:

- `hospitals` — self-hosted's rich management table (license, HDSP users,
  HIS config, system settings, suspend/activate/revoke).
- `cloud-tenants` — provisioning lifecycle only (list/provision/deprovision/
  history). No user, license, or settings management routes at all.

A cloud tenant provisioned today is orphaned in the portal the moment
provisioning finishes — there is no screen to manage its users, licenses,
or query config afterward.

Plan: merge into a single `Customer` concept with `deploymentType` (`cloud`
| `self_hosted`) as an attribute, not a separate workflow. One management
screen; deployment type toggles which capability sections render (vendor
pairing/downloads for self-hosted, cloud-specific actions for cloud).
Reuse `HospitalsController`'s existing management surface rather than
duplicating it under `cloud-tenants`.

Estimated scope: new/merged entity + migration, controller consolidation,
portal UI rework. Multi-day, not a patch.

## Phase 3 — SHIPPED, 2026-07-21 (tenant-scoped Oracle architecture)

Implemented tonight, ahead of the original "next major project after
launch" plan (explicitly requested):

- **`OraclePoolManager`** (`backend/src/modules/his/oracle-pool.service.ts`,
  renamed from `OraclePoolService`) replaces the single process-wide
  `OracleClient` with a `Map<tenantKey, OracleClient>`. Resolves the
  current tenant from `TenantContextStorage` (ambient, HTTP-request-scoped)
  each call; the seeded 'default' tenant (and any request with no ambient
  tenant — background jobs, startup) maps to a sentinel key whose pool is
  built from `.env` + any vendor-portal-pushed override, byte-identical to
  the old singleton's behavior. Every other (real, cloud) tenant's pool is
  built lazily, on first use, purely from that tenant's own
  `HisSchemaConfig` `db.*` rows — no `.env` fallback, so a misconfigured
  cloud tenant gets a clear error instead of silently reusing another
  tenant's (or self-hosted's) database. Idle non-default pools are evicted
  after `ORACLE_TENANT_POOL_IDLE_TIMEOUT_MS` (default 30 min); the default
  pool is never evicted.
- **`@hdsp/oracle-client`**: `OracleClientConfig` gained an optional
  `poolAlias` field. node-oracledb's pool-alias registry is process-wide —
  without a distinct alias per tenant, the second tenant's pool creation in
  the same process would throw on the shared `'HDSP_HIS'` alias the old
  single-pool code hardcoded. Defaults preserve every other caller
  (self-hosted, the standalone `connector/` package) exactly.
- **`HisConfigService`** (`getConfig()`/`loadFromDb()`/`REDIS_KEY`) is now
  tenant-scoped — this was a previously-flagged, deliberately-deferred gap
  (its own doc comment called it out) that had to be fixed alongside the
  pool manager, since the pool manager reads a tenant's Oracle credentials
  through this service. Ambient-first, explicit-override-available, same
  pattern as `TokenService.getLocations()` from earlier this session.
- **`HisController`/`HisSyncController`** now apply `TenantContextInterceptor`
  — neither did before, meaning ambient tenant context was never
  established for authenticated HIS requests at all (same gap
  `TokenController` had, fixed earlier tonight).
- `DirectOracleTransport`, `AttendanceMonitoringService`,
  `PunchHistoryService`, `LicenseController`'s Oracle-credential
  test/reconfigure flow — updated or left on a backward-compatible export
  alias (`export { OraclePoolManager as OraclePoolService }`) so existing
  tests didn't all need touching under time pressure.

**Not verified tonight** (sandbox has no live Oracle/Postgres to test
against): a full `tsc --noEmit` passed clean across the backend and the
`@hdsp/oracle-client` package, but the actual runtime behavior — self-hosted
boot still connecting correctly, a second cloud tenant's pool actually
resolving its own DB, idle eviction firing, the vendor-portal reconfigure
flow end-to-end — needs a real smoke test before this is trusted in
production. `assertSelfHosted()`'s `testDbConnection()` guard is still in
place for cloud (see that method's updated doc comment) pending a
cloud-appropriate connection-test path.

## Phase 3 (historical) — SUPERSEDED, see "Revision, 2026-07-21" at top of this document

The paragraphs below are kept for history only — they described a
middleware/REST-first direction that has been reversed. Direct, per-tenant
Oracle connectivity is the intended architecture for cloud; see the
revision section above for the actual Phase 3 plan
(`OraclePoolManager`, tenant-scoped `his_schema_config` cache).

~~Confirmed this session: `OraclePoolService` is one Oracle connection pool
per backend process (`backend/src/modules/his/oracle-pool.service.ts`), and
`HisConfigService.getConfig()` caches one flat, tenant-unaware config map
per process (`his-config.service.ts:32-50`, already flagged in its own doc
comment as a latent gap). Neither can support two cloud tenants with two
distinct real Oracle databases on the same shared backend today.~~ (still
true — this is exactly the gap the revised Phase 3 closes.)

~~Plan: default to middleware/REST-based HIS integration for cloud tenants...
Only build real per-tenant Oracle pooling if a specific cloud customer
requires direct Oracle connectivity as a hard requirement.~~ Superseded —
direct per-tenant Oracle connectivity is now the default plan, not a
fallback gated on customer demand.

## Phase 4 — Server-managed cloud licensing

Self-hosted keeps file-based licensing (`license.upload()`, machine
fingerprinting) unchanged — it has no persistent vendor connection to rely
on. Cloud tenants move to a server-side subscription model: Vendor Portal
update → Cloud API → tenant license table, no file generation/upload/
activation step. Sequence after Phase 2, since the Customer management
screen is what this new flow needs to live inside.

## Explicit non-goals for now

- No change to self-hosted's Oracle connectivity, Attendance, vendor
  pairing, or license-file flow — all confirmed unaffected by Phase 1.
- No `OraclePoolManager`/tenant-scoped pool work tonight — deliberately
  deferred to the next major project after tonight's deployment (per
  2026-07-21 revision above). Until then, cloud tenants technically share
  one process-wide Oracle pool and one global `his_schema_config` cache —
  a known, documented gap, not yet exploitable at today's single-cloud-
  tenant-in-production scale, but must be closed before onboarding a
  second real cloud customer with its own Oracle DB.
- No licensing model change before Phase 2 ships.
