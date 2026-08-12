# HDSP Hybrid — Current Architecture Analysis (Code-Verified)

**Scope:** This report describes what is *actually implemented* in the HDSP Hybrid codebase as of the current commit, based on direct inspection of source code, configuration files, and infrastructure-as-code. It deliberately ignores design intent expressed in the repository's many planning/spec markdown files (`ARCHITECTURE_STATUS.md`, `HDSP_Hybrid_Architecture_Specification_v2.0.md`, `CLOUD_TENANT_ONBOARDING_DESIGN.md`, etc.) except as pointers to where to look in code. Every claim below is backed by a file path, class/function name, or code excerpt.

**Three distinct deployment architectures are referenced in this repository, and this report distinguishes them explicitly throughout (especially Sections 1, 7, and 12):**

1. **Current Deployment — OCI Demo Server (`OCI_DEMO_DEPLOYMENT.md`).** The environment that is actually running today: a single Oracle Cloud Infrastructure (OCI) Compute VM, administered via SSH as the `opc` user, with Nginx as the reverse proxy, reached by public IP address (no DNS). This is a sales/demo deployment of the self-hosted application pattern, not the target multi-tenant SaaS architecture.
2. **Target Production Cloud Architecture — AWS/Terraform (`CLOUD_DEPLOY.md`, `infrastructure/terraform/`).** The intended future multi-tenant production environment (ECS Fargate, RDS Multi-AZ, ElastiCache, S3 + CloudFront, ALB + WAF). Fully written as Terraform/task definitions but, per `CLOUD_DEPLOY.md`'s own text, **never applied against a real AWS account** — this is a design/IaC artifact, not a running environment.
3. **Self-Hosted Hospital Deployment (`DEPLOY.md`, `infrastructure/installer/`).** The generic runbook a customer hospital follows to install HDSP on their own premises or their own cloud account (PM2 or Docker Compose, Nginx, single implicit tenant). The OCI demo server (#1) is one specific, already-running instance of this same pattern, hosted on OCI infrastructure rather than a hospital's own hardware, used for demonstration rather than production hospital use.

---

## 1. Overall Deployment Architecture

**Finding: Hybrid — three distinct deployment topologies exist in this repository, of which only two (self-hosted and the OCI demo) are actually running anywhere; the AWS multi-tenant cloud architecture is written but unapplied.**

- **Currently running:** the OCI demo server (Oracle Cloud Infrastructure Compute VM, SSH access as `opc`, Nginx reverse proxy, public-IP-only, no DNS) — see `OCI_DEMO_DEPLOYMENT.md`. Architecturally this is the self-hosted pattern (single `Tenant` row, `code: 'default'`), just hosted on OCI IaaS instead of a hospital's own server, for demo/sales purposes.
- **Currently running (pattern, per real customer installs):** the self-hosted hospital deployment pattern (`DEPLOY.md`) — PM2 or Docker Compose, Nginx, single implicit tenant per install. The OCI demo server is one instance of this pattern.
- **Not currently running anywhere:** the AWS multi-tenant cloud (SaaS) architecture (`CLOUD_DEPLOY.md`, Terraform). This is the only one of the three that exercises `SubdomainTenantMiddleware`'s multi-tenant path, S3 storage, RDS, ElastiCache, and the ALB's wildcard host rule — but it exists only as infrastructure-as-code and runbook text, never applied to a real AWS account.

Below, "cloud mode" / "cloud deployment" refers to the **target AWS architecture's intended behavior as implemented in code** (the `DEPLOYMENT_MODE=cloud` code path exists and is real), not to any environment that is currently live. The OCI demo server does not exercise this code path.

Evidence:
- `backend/src/modules/platform/tenant-provisioning/tenant-provisioning.service.ts` explicitly branches provisioning logic on a `mode: 'cloud' | 'self_hosted'` parameter, skipping cloud-only steps (subdomain reservation, connector-pairing key, trial license) when `self_hosted`.
- Self-hosted installs run `scripts/provision-self-hosted.ts` once at install time and get exactly one `Tenant` row (`code: 'default'`, `subdomain: null`).
- Cloud installs run behind `infrastructure/terraform/alb.tf`, an AWS ALB with a wildcard host rule (`*.${var.cloud_base_domain}`) fronting a **single shared** backend/frontend deployment that serves every tenant, with tenant identity resolved per-request in-process by `SubdomainTenantMiddleware`.
- Both modes share one codebase, one `Tenant`/`User`/`Role` schema, and one NestJS backend image — differentiated only by deployment configuration (env vars, DNS/ALB routing, Docker Compose vs. PM2 vs. ECS), not by separate code branches or separate products.

This is not "Single Tenant" (cloud mode genuinely serves many tenants from one running deployment) and not a mature "Multi Tenant" SaaS either — enforcement of tenant boundaries in the multi-tenant mode is, as detailed in Section 2, partially built and defaults to observe-only in several places. The most accurate label is **hybrid deployment architecture with shared-database multi-tenancy in cloud mode, defaulting to a single implicit tenant in self-hosted mode.**

---

## 2. Tenant Architecture

**Tenant identification:** `Tenant` entity (`backend/src/modules/platform/tenant/entities/tenant.entity.ts`, `@Entity('tenant')`): `id` (UUID PK), `code` (unique), `name`, `subdomain` (nullable), `status`, `isSystem`. Self-hosted installs get one row with `subdomain: null`.

**Subdomain routing: implemented.** `SubdomainTenantMiddleware` (`backend/src/common/middleware/subdomain-tenant.middleware.ts`) is registered on every request and parses `req.headers.host`:
```ts
private extractSubdomain(host: string | undefined): string | null {
  if (!host) return null;
  const hostname = host.split(':')[0].trim().toLowerCase();
  if (hostname === 'localhost' || /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return null;
  const labels = hostname.split('.');
  if (labels.length < 3) return null;
  return labels[0];
}
```
It resolves the subdomain to a tenant via `TenantContextService.resolveTenantBySubdomain()`, sets `req.tenantId`/`req.tenantCode`, and falls back to the `'default'` tenant on no match — so self-hosted installs are unaffected.

**Tenant context resolution — two independent mechanisms that don't fully converge:**
1. Hostname-derived `req.tenantId` (above), consumed by the globally-registered `TenantScopeGuard`.
2. `TenantContextStorage`, an `AsyncLocalStorage`-based ambient tenant context populated by `TenantContextInterceptor` from the **authenticated user**, not the hostname. This interceptor is **not global** — it must be explicitly added per controller (`@UseInterceptors(TenantContextInterceptor)`), and a repo-wide search found it applied on roughly 15 controllers (`users`, `eic-*`, `feedback-translation`, one `auth` method) but **absent** from `his`, `licensing`, `branch`, `attendance`, `document-platform`, `vendor-administration`, `settings`, and `reports`.

**Isolation completeness: partial, with the codebase's own comments confirming this is an active, staged rollout, not a finished mechanism.**
- `TenantScopedRepository` (`.../tenant/repositories/tenant-scoped.repository.ts`) auto-filters reads (`find`, `findOne`, `count`, `createQueryBuilder`, etc.) by `tenantId`, but explicitly **excludes** `save()`/`insert()`/`upsert()` — writes must be tenant-stamped manually by each service.
- It supports `mode: 'dry-run'` (logs what *would* be filtered, applies no filter) vs `mode: 'enforced'`. Adoption is broad (112 files reference it) but opt-in per entity — anything not wrapped gets zero automatic filtering.
- `TenantScopeGuard` (global `APP_GUARD`) compares the JWT's `tenantId` claim to the hostname-resolved `request.tenantId`, but its own doc comment states it defaults to `TENANT_SCOPE_GUARD_MODE=log-only` — mismatches are logged, not blocked.
- Login-time tenant scoping (`AuthService.resolveLoginUser()`) defaults to `LOGIN_TENANT_SCOPE_MODE=shadow`: the legacy unscoped username lookup remains authoritative; the tenant-scoped lookup only runs in parallel for comparison logging.
- `auth.module.ts` contains a comment referencing a "confirmed Users cross-tenant leak" that was patched by promoting `PasswordResetRequest` from dry-run to enforced — direct evidence this has been a real, live isolation gap, not a theoretical one.
- `Permission.tenantId` column exists but is nullable and, per its own doc comment, "unread by any code yet" — permissions are effectively global/shared across tenants today.

**Conclusion:** Tenant isolation infrastructure is well-engineered (subdomain resolution, ALS-based context, wrapped repositories, mismatch guard) but the enforcement defaults are observe-only/shadow in several critical paths, and coverage is uneven across modules. This is **partial isolation, mid-rollout**, not complete isolation.

---

## 3. Backend Architecture

**Type: Modular monolith**, not microservices. Single NestJS process (`backend/src/app.module.ts`, `main.ts`), single `package.json`, single deployable image. A `PROCESS_ROLE` env var (`api` vs `worker`) lets the same codebase run as either an API pod (skips `ScheduleModule.forRoot()`) or a worker pod — this is horizontal-scaling awareness within one codebase, not independently-deployable services with their own APIs.

**Module boundaries** (`src/modules/*`, imported into `AppModule`): `auth`, `users`, `rbac`, `platform` (with `tenant`, `tenant-provisioning`, `feature-flags` sub-domains), `licensing`, `his` (+ `his/sync`), `branch`, `loyalty`, `eic`, `notifications`/`notification` (two overlapping modules), `reports`, `token`, `attendance`, `document-platform` (further split into `document-engine`, `workflow-engine`, `compliance-engine`, `forms-runtime`, `execution-platform`), `vendor-administration`, `cms`, `feedback`, `settings`, `audit`. Directory-per-domain boundaries are generally clean.

**Inter-module communication:**
- Predominantly **direct in-process service injection** — e.g. `AuthModule` imports `BranchModule`, `LicensingModule`, `SettingsModule`, `HisModule`, `UsersModule`, `TenantModule` and calls their services directly.
- `@nestjs/event-emitter` is used, but narrowly (~12 files), concentrated in `document-platform` listeners (`audit-trail.listener.ts`, `evidence-chain.listener.ts`, `workflow-notification.listener.ts`) and `tenant-provisioning`'s `tenant.provisioned` event (which currently has **zero subscribers** — see Section 6).
- `@nestjs/bull` (BullMQ over Redis) handles background job queues: `QUEUE_NAMES = { NOTIFICATIONS, AUDIT_LOGS, LOYALTY_EVENTS, CAMPAIGN_TRIGGERS, ATTENDANCE_REALTIME }`, consumed by processors like `attendance.processor.ts` and `audit.processor.ts`.
- No HTTP calls between backend modules were found — all intra-process. (The *only* inter-service HTTP boundary in the whole system is HDSP backend ↔ Vendor Portal backend, see Section 6.)

---

## 4. Database Architecture

**Single shared PostgreSQL database, shared schema, column-based (`tenant_id`) multi-tenancy.** `backend/src/config/database.config.ts` configures exactly one `TypeOrmModule.forRootAsync` connection and one `AppDataSource` — no dynamic per-tenant `DataSource`, no `search_path` switching, no schema-per-tenant or database-per-tenant code anywhere in `src/database` or `src/config`. `entities: [path.join(__dirname, '../**/*.entity{.ts,.js}')]` is a single global entity set shared by every tenant.

**Isolation mechanism:** a `tenantId` UUID column added to relevant entities (e.g., `Role.tenantId` NOT NULL with composite unique constraint `uq_roles_tenant_name`; `Permission.tenantId` nullable and unused), enforced — where enforced at all — at the **application/repository layer** (`TenantScopedRepository`, Section 2), not via PostgreSQL Row-Level Security or database-level policies. No RLS policies were found. Migrations (`src/database/migrations`, e.g. `1783880000000-TenantScopedIdentityCompositeConstraints.ts`) show additive, staged rollout of tenant columns onto the existing shared schema — backfill first, `NOT NULL` later.

**Summary:** Shared database + shared schema + `tenant_id` discriminator column + partial application-layer filtering. Not database-per-tenant, not schema-per-tenant.

---

## 5. Authentication Architecture

**Login flow** (`POST /api/v1/auth/login`, `AuthController.login()`, `@Public()`, throttled 5/min):
1. Controller passes credentials plus the hostname-resolved `req.tenantId` to `AuthService.login()`.
2. `resolveLoginUser()` looks up the user — tenant-scoped or not, depending on `LOGIN_TENANT_SCOPE_MODE` (default `shadow`, i.e. legacy unscoped lookup is authoritative; scoped lookup is shadow-logged only).
3. Checks `isActive`/`isLocked`; `bcrypt.compare()` against `passwordHash`; failure triggers lockout counters and an audit log entry.
4. On success, resets failure counters, updates `lastLoginAt`, loads accessible branches (`BranchService`; SUPER_ADMIN sees all, others see assigned only; degrades gracefully if Oracle/HIS is unreachable).
5. `generateTokens()` signs access + refresh JWTs; audit log records `LOGIN_SUCCESS`; response returns `{ user, accessToken, refreshToken }`.

Parallel flows exist: `hisLogin()` (auto-login via HIS employee code) and a cookie-based, iframe-embeddable "widget" flow (httpOnly-cookie refresh token) for kiosk/registration-desk embedding.

**JWT structure** (`JwtStrategy`, `jwt.strategy.ts`): `sub`, `jti` (for blacklisting), `username`, `hisEmployeeCode`, `roles: string[]`, `tenantId` (nullable — added later in the project, per comment "Phase 8"), `tenantSlug`, `activeBranchId/DepartmentId/ServiceCenterId`. Signed via `JwtModule.registerAsync` (`config.jwt.secret`, default 15-minute access token expiry). Two other narrower JWT shapes exist for kiosk/workstation tokens (no `tenantId`, resolved via `ChainTenantResolver`).

**Tenant resolution on subsequent requests:** two signals compared independently, not merged — (a) global `TenantScopeGuard` self-verifies the JWT and compares its `tenantId` claim to the hostname-resolved `request.tenantId`, defaulting to log-only; (b) `JwtStrategy.validate()` does a fresh DB lookup of the full `User` (with roles/permissions), checks the Redis JWT blacklist, and populates `request.user`, which downstream RBAC guards actually trust (not raw JWT claims).

**RBAC model:** `Role` entity — `tenantId` NOT NULL, composite-unique `(tenantId, name)`, many-to-many `permissions` via `role_permissions`. `Permission` entity — global triple `(moduleCode, resource, action)`, unique, `tenantId` nullable and unused in practice — i.e. **permissions are effectively global across tenants today**, while roles are tenant-scoped. `@RequirePermissions('MODULE:RESOURCE:ACTION')` decorators drive `PermissionsGuard`.

**Authorization pipeline for a typical protected route** (e.g. `UsersController`):
```
Global APP_GUARD: TenantScopeGuard   (JWT tenantId vs hostname tenantId — log-only by default)
     ↓
@UseGuards(JwtAuthGuard, PermissionsGuard)   (per-controller)
     ↓
@UseInterceptors(TenantContextInterceptor)   (per-controller, NOT global)
     ↓
Controller handler → Service
```
`RolesGuard`/`@Roles()` exists but is not used on most checked controllers — the codebase favors permission-based authorization. Both guard types allow `user.isSuperAdmin` to bypass all checks.

**Not implemented:** Postgres RLS; a global TypeORM subscriber for automatic tenant filtering; automatic tenant-stamping on writes; tenant-partitioned permissions; enforced (non-log-only) `TenantScopeGuard` and enforced (non-shadow) login scoping as *defaults*.

---

## 6. Cloud Tenant Provisioning

**Trigger points (three, all converging on one service):**
1. `TenantProvisioningController` (`POST /platform/tenant-provisioning`), guarded by `VendorPortalApiKeyGuard` — accepts either a SUPER_ADMIN JWT or a shared-secret header `X-Vendor-Portal-Api-Key`.
2. Vendor Portal's `CloudTenantsController` (`POST /cloud-tenants` in `vendor-portal/backend`), a vendor-operator admin form — **not** customer self-service (explicitly deferred, per the DTO's own comment: "per the user's Option 3 scope decision").
3. `scripts/provision-self-hosted.ts`, run once at self-hosted install time, calling the same service in-process with no HTTP involved.

**Step-by-step pipeline** (`TenantProvisioningService.provision()`/`execute()`, a persisted, resumable 10-step state machine — each step tracked as a `TenantProvisioningStep` row, the whole attempt as a `TenantProvisioningRun` row; failures stop the run without rollback and require `resume()`):

| # | Step | What actually happens |
|---|------|------------------------|
| 1 | `create_tenant_row` | Inserts `Tenant` row (code/name/subdomain/status). Checks subdomain collision first. |
| 2 | `reserve_subdomain` | No real reservation — re-confirms Step 1's row; uniqueness comes from a DB `UNIQUE` constraint. Skipped in self-hosted mode. |
| 3 | `ensure_global_roles` | **No-op** — verifies pre-seeded global roles exist; creates nothing (roles table is global, not per-tenant). |
| 4 | `ensure_global_permissions` | **No-op** — same pattern for permissions. |
| 5 | `ensure_global_settings` | **Explicit no-op**, documented as deferred — no per-tenant settings exist anywhere in the codebase. |
| 6 | `allocate_storage_namespace` | **No-op** — just records a `storagePrefix` string; S3 already prefixes by tenant ID automatically, no bucket/namespace API call made. |
| 7 | `generate_connector_pairing_key` | Real: generates + bcrypt-hashes a pairing key, inserts `TenantConnectorPairing` row (`status: pending`). Skipped in self-hosted mode. |
| 8 | `issue_trial_license` | Real: inserts `SubscriptionLicense` row (`trialing`, `maxUsers: 5`). Skipped in self-hosted mode (uses a separate file-based license path instead). |
| 9 | `create_super_admin_user` | Real: calls `AuthService.setupSuperAdmin()`, creates a `User` row stamped with the new tenant ID. |
| 10 | `emit_tenant_provisioned_event` | Emits `tenant.provisioned` via `EventEmitter2` — **confirmed zero subscribers anywhere in the codebase.** No welcome email, no downstream automation. |

**Database records created per tenant:** `tenant`, `tenant_provisioning_runs`, `tenant_provisioning_steps` (10 per run), `tenant_connector_pairings` (cloud only), `subscription_licenses` (cloud only), one `users` row (SUPER_ADMIN), and — in a separate Vendor Portal database — a `cloud_tenants` reference row (`provisioning_status`, `login_url`, `provisioning_run_id`, etc). Roles, permissions, and settings tables are **never** written per-tenant by design (global uniqueness constraints).

**Backend APIs vs. Vendor Portal APIs:** these are genuinely two separate NestJS services with separate databases, integrated over real HTTP (`fetch()`), not stubbed. `CloudTenantsService.provision()` (Vendor Portal) persists a local `PENDING` `CloudTenant` row, then calls HDSP's `POST /api/v1/platform/tenant-provisioning` using `HDSP_BACKEND_URL` + `HDSP_PROVISIONING_API_KEY`. It also calls HDSP's `check-availability`, run-detail, `resume`, and `deprovision` endpoints, with resume/retry logic including a self-healing lookup if a local run ID is lost. If the env vars are unset, the call throws `BadRequestException('Cloud provisioning is not configured...')` — real code, but requires operational wiring.

**Complete vs. placeholder:**
- **Complete, working end-to-end:** tenant row + audit trail creation, resumable step execution, dual-auth guard, SUPER_ADMIN user creation, license row creation, connector-pairing key generation, self-hosted installer, Vendor Portal HTTP client with retry/resume, pilot deprovisioning.
- **Explicit no-ops (documented, not bugs):** per-tenant roles/permissions/settings, storage-namespace allocation, subdomain "reservation."
- **Genuine gaps, explicitly documented in code comments:**
  - `TenantConnectorPairing` credentials are generated but **nothing consumes them** — the Connector authenticates to Redis by URL only, not this key.
  - `tenant.provisioned` event has zero listeners — no onboarding email, no downstream automation.
  - `SubscriptionLicense.stripeCustomerId`/`stripeSubscriptionId` fields exist; **no Stripe/billing integration exists** anywhere.
  - `resume()` does not persist provisioning `mode` on the run row (documented limitation for retrying failed self-hosted runs).
- **Cloud infrastructure provisioning: not implemented.** No AWS/Azure/GCP SDK calls anywhere in the provisioning pipeline — no S3 bucket creation, no Route53/DNS record creation, no container/VM spin-up. "Provisioning" is purely PostgreSQL inserts/updates plus a bcrypt hash and a random key. The subdomain assigned in Step 1 is only a database column value later consulted by `SubdomainTenantMiddleware`; real DNS relies on one manually-created wildcard record at the infrastructure level.

---

## 7. Networking Architecture

Three networking models are relevant to this repository — two are code/config patterns supporting the self-hosted and AWS-target modes, and one is the specific, currently-running OCI demo box.

**Currently running — OCI Demo Server:** a single OCI Compute VM, reached by public IP address only (no DNS/domain attached), with Nginx running directly on the VM as the reverse proxy in front of the Node.js backend/frontend processes. Administered via SSH as the `opc` user. This is functionally the same `nginx.conf`/`hdsp.conf` path-based-routing pattern described below for self-hosted deployments, applied to one specific OCI VM rather than a hospital's own server — see `OCI_DEMO_DEPLOYMENT.md` for the full breakdown and open confirmation items (TLS status, PM2-vs-Docker on this box, OCI networking rules). No wildcard subdomain, no load balancer, no WAF, no CDN in front of this box.

**Self-hosted / on-prem (generic pattern, `DEPLOY.md`):** `infrastructure/nginx/hdsp.conf` — single fixed hostname (`server_name hdsp.hospital.local;`, comment: "Replace with actual hostname/IP"), **path-based routing** to two upstreams (`hdsp_backend:3001`, `hdsp_frontend:3000`), with `/api/`, `/api/v1/auth/login` (extra rate-limiting), `/socket.io/` (websocket upgrade), and `/` (frontend) location blocks. No wildcard, no per-tenant blocks — this is a single-tenant reverse proxy. The OCI demo server (above) is one live instance of this same pattern.

**Target production cloud / SaaS (`CLOUD_DEPLOY.md`, written but not applied to any real AWS account):** `infrastructure/terraform/alb.tf` — an AWS ALB with a **wildcard host-header rule**:
```hcl
condition {
  host_header {
    values = ["*.${var.cloud_base_domain}", var.cloud_base_domain]
  }
}
```
One wildcard rule matches every tenant subdomain, split only by path (`/api/*` → backend target group at priority 100, everything else → frontend at priority 200) — not per-tenant target groups or per-tenant ALB rules. Tenant identity itself is resolved **inside the application** by `SubdomainTenantMiddleware` reading the `Host` header, not by the ALB or nginx.

**DNS:** No Route53 resources, no DNS-automation scripts, no CNAME-provisioning code exist anywhere in the repo (verified via full-repo search). Because the ALB rule is already wildcard, only **one manually-created wildcard DNS record** (`*.cloud_base_domain` → ALB) is required up front; no per-tenant DNS step exists in the provisioning pipeline (consistent with Section 6's finding that provisioning is DB-only).

**Docker:** `infrastructure/docker-compose.yml` (dev-only: Postgres, Redis, optional pgAdmin/redis-commander) and `infrastructure/docker/docker-compose.selfhosted.yml` (production self-hosted: postgres, redis, backend, frontend, optional connector) — one full stack per hospital install, not one container per tenant in a shared cluster. Dockerfiles exist for `backend`, `frontend`, and `connector` (the connector image bundles Oracle Instant Client). Cloud/ECS reuses the same backend image for both API and Worker services, distinguished by `PROCESS_ROLE`.

**Kubernetes: not implemented.** No manifests, Helm charts, or `kustomization` files anywhere. Cloud orchestration is ECS/Fargate (`infrastructure/ecs/*.json`, `infrastructure/terraform/ecs.tf`).

**PM2:** `infrastructure/pm2/ecosystem.config.js` — `hdsp-backend` (cluster mode, 2 instances) and `hdsp-frontend` (fork mode, Next.js self-clusters) — a second, parallel self-hosted deployment path alongside Docker Compose, not a replacement for it (per its own header comment).

---

## 8. Frontend Architecture

### HDSP Frontend (`frontend/`)
Next.js 14.2.15, App Router (`(auth)`, `(platform)` route groups plus public routes for display/kiosk/CMS-player/feedback). **No `middleware.ts` exists** — subdomain routing is not implemented at the Next.js layer; instead `next.config.mjs` rewrites `/api/*` to a single `BACKEND_URL`, and a code comment confirms "one shared frontend image serves every cloud tenant behind the wildcard ALB" with tenant resolution happening in the *backend* via `SubdomainTenantMiddleware`.

Auth: `AuthProvider` (React Context) backed by a Zustand store persisted to **`sessionStorage`** (not `localStorage`, not cookies) — `frontend/src/lib/store/auth.store.ts`. Route protection is a client-side guard inside `AuthProvider`'s effect (redirect to `/login` unless path is in an allowlist), not `middleware.ts`-based. A dedicated axios instance (`lib/api/client.ts`) attaches `Authorization: Bearer <token>` and implements 401 → refresh → retry with a request queue.

Tenant awareness: **essentially none** in the UI — no `TenantContext`, no tenant switcher (a repo-wide search for "tenant" in `frontend/src` returns only 3 incidental hits). The only switcher present is a `BranchSwitcher` (intra-tenant hospital branches/departments), not multi-tenant. `.env.local` defines one `BACKEND_URL`/`NEXT_PUBLIC_API_URL` per deployed instance; tenant identity is resolved server-side from the Host header, not chosen client-side.

API communication: REST via one shared axios instance, browser calls same-origin `/api/*` (Next.js rewrite proxy → backend), avoiding cross-origin calls — effectively a lightweight BFF/reverse-proxy pattern. Build output is `standalone` (SSR container); cloud deployments use one shared image for all tenants, self-hosted deployments build a separate dedicated image (`DEPLOYMENT_MODE` build-time env).

### Vendor Portal Frontend (`vendor-portal/frontend/`)
Next.js 14.0.4, App Router, routes for `hospitals`, `licenses`, `logs`, `requests`, `cloud-tenants` etc. No `middleware.ts`, no rewrites, minimal `next.config.js`. Auth is a plain `sessionStorage.getItem('vendor_token')` check in the layout, with **no refresh-token flow** (unlike the main frontend) — a 401 hard-redirects to `/login`. API base URL defaults to `http://localhost:4000/api` via env var; REST via its own separate axios client.

This is a single-instance operator console (port 4001), not multi-tenant itself — its `cloud-tenants` screens are the actual UI that drives HDSP tenant provisioning (Section 6), returning `subdomain`/`loginUrl`/`tempPassword` to the vendor operator. No shared npm packages exist between the two frontends (they use different major versions of MUI and React Query); the only functional link is the Vendor Portal calling HDSP's provisioning HTTP API, plus a separate, unrelated `VendorRegisterDialog.tsx` in the main frontend that lets a *self-hosted* HDSP instance register itself with the vendor platform for licensing (the inverse relationship).

---

## 9. Infrastructure Dependencies

| Dependency | Status | Evidence |
|---|---|---|
| PostgreSQL | **Required, core** | Single `TypeOrmModule` connection (`database.config.ts`), Postgres 15 pinned in `docker-compose*.yml`, `synchronize: false` with migration-only policy, `pgcrypto`/`pg_stat_statements`/`btree_gist` extensions enabled at init. |
| Redis | **Required, core** | Caching, JWT blacklist, session/tenant data, and BullMQ job queues (`redis.config.ts`, `QUEUE_NAMES`, dedicated health indicators for both Redis and Bull). |
| Oracle HIS | **Required for HIS integration**, isolated | `packages/oracle-client` (dynamic `oracledb` loading, thick/thin mode, circuit breaker); consumed directly by backend (`ORACLE_TRANSPORT=direct`) or via a standalone `connector/` service at the hospital network edge relaying over Redis (`ORACLE_TRANSPORT=cloud_relay`). Not containerized in dev compose ("Oracle HIS is NOT containerised"). |
| Nginx | **Self-hosted only** | `infrastructure/nginx/hdsp.conf`, single-hostname path-based reverse proxy; cloud mode uses an AWS ALB instead. |
| PM2 | **Self-hosted only** | `infrastructure/pm2/ecosystem.config.js`, one of two supported self-hosted deployment paths. |
| Local file storage | **Implemented, dual with S3** | `LocalStorageProvider` (`fs.promises.writeFile` under `./uploads`) vs `S3StorageProvider`, selected via `STORAGE_DRIVER` env var; no multer usage found — manual `fs`/`path` writes. |
| Docker | **Implemented, both modes** | Dockerfiles for backend/frontend/connector; Compose for self-hosted; same backend image reused (role-differentiated) for ECS cloud deployment. |
| Kubernetes | **Not implemented** | No manifests/Helm/kustomize anywhere; cloud orchestration is ECS/Fargate + Terraform instead. |

---

## 10. Current Cloud Readiness Scores

| Dimension | Score | Rationale |
|---|---|---|
| Multi-tenancy | 55% | Real tenant model, subdomain resolution, and shared-DB isolation scaffolding exist and are wired into the app; but enforcement defaults to log-only/shadow in the guard and login paths, and interceptor/repository coverage is uneven across modules. |
| Tenant isolation | 40% | Column-based isolation via `TenantScopedRepository` is real but opt-in per entity, excludes writes, and has a documented history of a confirmed cross-tenant leak; no DB-level (RLS) backstop. |
| Provisioning | 55% | A genuine, resumable, audited state machine exists end-to-end with real HTTP integration between Vendor Portal and HDSP; but several steps are documented no-ops, the completion event has no subscribers, and there's no cloud infrastructure (DNS/storage) automation. |
| Scaling | 60% | ECS supports 2+ API tasks with rolling deploys, PM2 runs backend in cluster mode, Bull queue consumers are documented as safely scalable; but the Worker service is explicitly capped at 1 task due to `@nestjs/schedule` lacking a distributed lock. |
| High Availability | 35% | Multi-AZ-capable ALB/ECS topology exists in Terraform, but no evidence of RDS Multi-AZ configuration, no documented failover testing, and the cron/worker single-instance constraint is a real availability gap. |
| Disaster Recovery | 15% | No backup/restore automation, no documented RPO/RTO, no cross-region replication code found anywhere in the repository. |
| Security | 50% | JWT + bcrypt + Redis blacklist + RBAC/permission guards + rate limiting on login are real; but tenant-boundary enforcement is log-only by default, permissions are not tenant-partitioned, and there's no evidence of secrets rotation automation beyond Secrets Manager references in ECS task defs. |
| Cloud-native readiness | 60% | Real health/liveness/readiness endpoints (`@nestjs/terminus`), 12-factor env-var config, Terraform IaC (ALB, ECS, RDS, ElastiCache, S3, WAF, Secrets Manager), and CI/CD pipelines (`.github/workflows`) all exist; gaps are Kubernetes absence (not necessarily a defect, but limits portability) and the single-instance worker constraint. |

*(Scores reflect implementation completeness observed in code, not an external audit; they are directional, not certified.)*

---

## 11. Missing Pieces

**A. Backend missing / incomplete**
- Enforced (non-log-only) tenant boundary checks as the default configuration (`TenantScopeGuard`, `LOGIN_TENANT_SCOPE_MODE`).
- Universal `TenantContextInterceptor`/`TenantScopedRepository` coverage — several modules (`his`, `licensing`, `branch`, `attendance`, `document-platform`, `vendor-administration`, `settings`, `reports`) have no confirmed tenant-scoping wiring.
- Automatic tenant-stamping on writes (`save()`/`insert()`) — currently a manual per-service responsibility.
- Database-level tenant isolation backstop (Postgres Row-Level Security) — not implemented; isolation is app-layer only.
- Per-tenant roles/permissions/settings — architecturally deferred; `Permission.tenantId` exists but is unused.
- Any subscriber to the `tenant.provisioned` event — no onboarding email, no automated downstream setup.
- Connector-pairing key consumption — key is generated and stored but never validated by the Connector.
- Billing integration — `SubscriptionLicense` has Stripe fields but no Stripe/payment code exists.
- Cloud infrastructure automation inside provisioning (DNS record creation, storage bucket/namespace creation) — currently manual, one-time infra setup only.
- Customer self-service tenant signup — explicitly deferred; only vendor-operator-driven provisioning exists.

**B. Frontend missing**
- Tenant context/switcher UI in the main HDSP frontend — none exists; tenant identity is entirely server-resolved.
- `middleware.ts`-based subdomain routing or auth guarding in either frontend — both apps rely on client-side effect-based redirects instead.
- Refresh-token flow in the Vendor Portal frontend (present in the main frontend, absent here).
- Shared code/design system between the two frontends — none; independent, divergent dependency versions (MUI v5 vs v6, React Query 5.17 vs 5.59).
- Customer/hospital self-service onboarding UI — not present (matches backend gap above).

**C. Infrastructure missing**
- Kubernetes manifests/Helm charts — none; ECS/Fargate only.
- DNS/Route53 automation for tenant subdomains — none; relies on a single manually-created wildcard record.
- Distributed locking for scheduled/cron jobs — absent, which is why the Worker ECS service is capped at 1 task.
- Documented/automated backup, restore, and disaster recovery procedures — not found in code or Terraform.
- Multi-region or cross-AZ database failover configuration — not confirmed in Terraform.
- Secrets rotation automation beyond referencing AWS Secrets Manager in task definitions.

---

## 12. Final Architecture Diagrams

Three separate diagrams are given below — one per deployment architecture — rather than a single merged diagram, because merging them would misrepresent which parts are actually running. Only Diagram A (OCI demo) and, in spirit, Diagram C (self-hosted pattern) reflect environments that exist today; Diagram B (AWS target) is written as Terraform/IaC but has never been applied to a real AWS account.

### Diagram A — CURRENT: OCI Demo Server (actually running today)

```
                    Internet
                        │
              Public IP address only
              (no DNS / no domain attached)
                        │
              Nginx  (running on the OCI VM itself,
                       path-based routing: /api/* vs /*
                       — same pattern as infrastructure/nginx/hdsp.conf)
                        │
        ┌───────────────┴───────────────┐
        │                               │
  HDSP Frontend                   HDSP Backend (NestJS)
  (Next.js, single build,         single tenant ('default'),
   single tenant instance)        DEPLOYMENT_MODE=self_hosted
        │                         (assumed default — confirm on box)
        │                               │
        │                    ┌──────────┴──────────┐
        │                    │                      │
        │              PostgreSQL                Redis
        │              (local to the VM,     (local to the VM,
        │               bare-metal or             cache, JWT
        │               Docker container —        blacklist,
        │               confirm which)             BullMQ queues)
        │
   Local disk storage (LocalStorageProvider, ./uploads)

  Oracle HIS: NOT connected — this is a sales/demo box,
  not wired to a real hospital's Oracle instance.
  /api/health's Oracle indicator expected "unreachable" (non-critical).

  Access: SSH as the `opc` user (OCI/Oracle-Linux default cloud user).
  No ALB, no WAF, no CDN, no load balancer in front of this box.
  See OCI_DEMO_DEPLOYMENT.md for full detail and open confirmation items.
```

### Diagram B — TARGET: AWS Production Cloud Architecture (written, NOT yet applied to any real AWS account)

```
                              ┌─────────────────────────┐
                              │         Internet         │
                              └────────────┬─────────────┘
                                           │
                              AWS ALB — wildcard host rule
                              host_header: *.<cloud_base_domain>
                              split only by path (/api/* vs /*)
                              (+ WAF, + CloudFront for static assets)
                                           │
                    ┌──────────────────────┴──────────────────────┐
                    │                                              │
      Frontend (ECS Fargate,                        Backend API (ECS Fargate,
      Next.js, shared image,                         NestJS, PROCESS_ROLE=api,
      serves ALL tenants)                             tenant resolved per-request
                    │                                  via SubdomainTenantMiddleware
                    │                                  reading Host header)
                    │                                              │
                    │                                        ┌─────┴─────┐
                    │                                   Backend Worker  BullMQ Queues
                    │                                   (ECS, PROCESS_    (NOTIFICATIONS,
                    │                                    ROLE=worker,      AUDIT_LOGS,
                    │                                    capped at 1       LOYALTY_EVENTS,
                    │                                    task — no         CAMPAIGN_TRIGGERS,
                    │                                    distributed       ATTENDANCE_REALTIME)
                    │                                    lock)
                    │                                              │
                    └─────────┬────────────────────┬───────────────┘
                              │                    │
                        PostgreSQL (RDS,      Redis (ElastiCache)
                        Multi-AZ)                   │
                        shared DB, shared       S3 (object storage,
                        schema, tenant_id       tenant-prefixed keys)
                        column isolation
                              │
                    ┌─────────┴──────────────────────────────────────┐
                    │                                                  │
              Connector (per-hospital, edge-deployed,          Oracle HIS
              dials Oracle directly, relays over                (on-prem, hospital-owned,
              CONNECTOR_REDIS_URL — pairing key                  accessed via packages/
              generated at provisioning but NOT                  oracle-client, thick/
              yet validated by the Connector)                    thin mode)
                    │
                    └──────────────────────────► Oracle HIS (direct dial)

   STATUS: Terraform (ALB, ECS, RDS, ElastiCache, S3, WAF, Secrets Manager) is fully
   written under infrastructure/terraform/, but CLOUD_DEPLOY.md explicitly states this
   has never been applied against a real AWS account, real DNS zone, or real credentials.
   Treat this diagram as a design target, not a running environment.
```

### Diagram C — Self-Hosted Hospital Deployment (generic pattern; the OCI demo above is one live instance of it)

```
                    Hospital's own network
                        │
              Nginx  (single fixed hostname,
                       infrastructure/nginx/hdsp.conf,
                       path-based routing)
                        │
        ┌───────────────┴───────────────┐
        │                               │
  HDSP Frontend                   HDSP Backend (NestJS)
  (Next.js, dedicated              single tenant ('default'),
   self-hosted image)              DEPLOYMENT_MODE=self_hosted
        │                               │
        │                    ┌──────────┴──────────┐
        │                    │                      │
        │              PostgreSQL                Redis
        │              (bare-metal via         (bare-metal or
        │               PM2 runbook, or          Docker, per
        │               Docker Compose)           DEPLOY.md)
        │
   Local disk storage (LocalStorageProvider, ./uploads)
        │
        └──────────────────────────► Oracle HIS (on-prem, hospital's own instance,
                                       ORACLE_TRANSPORT=direct)

   Process management: PM2 (infrastructure/pm2/ecosystem.config.js) OR
   Docker Compose (infrastructure/docker/docker-compose.selfhosted.yml) —
   both are supported; a given install uses one or the other.
```

### Cross-cutting: Vendor Portal (separate service, relevant to all three above)

```
        VENDOR PORTAL (separate service, separate DB, port 4001 frontend / 4000 backend)
        ┌─────────────────────────────────────────────────────────────────────┐
        │  Vendor Portal Frontend (Next.js) → Vendor Portal Backend (NestJS)    │
        │  → cloud_tenants table (own Postgres DB)                             │
        │  → HTTP calls (fetch) to an HDSP Backend's                           │
        │    /platform/tenant-provisioning API using                           │
        │    HDSP_BACKEND_URL + X-Vendor-Portal-Api-Key                        │
        │    (provision / check-availability / resume / deprovision)          │
        │                                                                       │
        │  NOTE: this cloud-tenant provisioning flow targets the AWS target    │
        │  architecture (Diagram B)'s multi-tenant HDSP backend. It is not     │
        │  exercised against the OCI demo box or a typical self-hosted        │
        │  install, both of which use the single-tenant provisioning script   │
        │  (scripts/provision-self-hosted.ts) instead.                        │
        └─────────────────────────────────────────────────────────────────────┘
```

---

## 13. Future Architecture — Gap to Ideal Production SaaS

**Already implemented (solid foundation):**
- A real `Tenant` entity and subdomain-based request routing (`SubdomainTenantMiddleware`), with graceful single-tenant fallback for self-hosted installs.
- A layered, opt-in tenant-scoping mechanism (`TenantScopedRepository`, `TenantContextStorage`, `TenantContextInterceptor`) with dry-run/enforced modes designed explicitly for safe, incremental rollout.
- A resumable, audited tenant-provisioning state machine with a real HTTP integration between a separate Vendor Portal service and the core backend.
- JWT-based auth with refresh tokens, blacklisting, bcrypt hashing, rate-limited login, and a permission-based RBAC system.
- Genuine cloud IaC (Terraform: ALB, ECS, RDS, ElastiCache, S3, WAF, Secrets Manager), containerized builds, and CI/CD pipelines with a staged deploy gate.
- Health/liveness/readiness endpoints and 12-factor configuration throughout.

**Partially implemented (built but not finished/enforced):**
- Tenant isolation — the mechanism exists but defaults to observe-only in the guard and login paths, with uneven module coverage and no database-level backstop.
- Tenant provisioning — the state machine is real end-to-end, but several steps are intentional no-ops (per-tenant roles/permissions/settings, storage namespace) and the completion event has no consumers, so onboarding stops at "database records exist" rather than "tenant is fully ready and notified."
- Scaling/HA — horizontal scaling is designed for API and queue-consumer workloads, but the scheduler/worker tier is deliberately single-instance due to a missing distributed lock.

**Still needs to be built:**
- Enforced-by-default tenant isolation (flip guard/login modes to `enforced`, close remaining module gaps, add a DB-level RLS backstop).
- Automated cloud infrastructure provisioning per tenant (DNS, storage namespace) rather than one manual wildcard DNS record plus DB rows.
- A working post-provisioning workflow (subscriber(s) on `tenant.provisioned`: welcome email, connector-pairing key actually validated by the Connector, onboarding checklist).
- Billing/subscription integration (Stripe or equivalent) to back the existing but unused `SubscriptionLicense` fields.
- Customer self-service signup, if that's a business goal (currently vendor-operator-only).
- Distributed locking for scheduled jobs to allow the worker tier to scale beyond one instance.
- Documented and automated backup/restore and disaster recovery procedures, and multi-AZ/multi-region resilience.
- Tenant-partitioned permissions (the column exists but is unused) if per-tenant permission customization is a goal.

---

## Executive Summary

The project currently implements a **modular monolith with shared-database, column-based multi-tenancy**, using **application-level subdomain-based tenant resolution** and a **real but partially-automated tenant provisioning pipeline shared between a separate Vendor Portal service and the core HDSP backend**, while **tenant isolation enforcement, post-provisioning automation, billing, and production-grade high availability/disaster recovery remain incomplete or default to observe-only/manual operation**; critically, the **only environment actually running today is a single-tenant OCI demo VM (see `OCI_DEMO_DEPLOYMENT.md`), while the multi-tenant AWS production architecture this report describes exists solely as unapplied Terraform/IaC (`CLOUD_DEPLOY.md`).**
