# Phase 10 Deferred Backlog — SaaS Operations Layer

This document exists because of an explicit user decision (Option 3, recorded verbatim in `HYBRID_ARCHITECTURE_LOG.md`'s Phase 10 entry): implement Phase 10 exactly as the roadmap defines it, and separately track the broader tenant-management vision as follow-on work rather than folding it into Phase 10.

The items below are **product and operational enhancements**, not prerequisites for proving the hybrid architecture. The hybrid architecture is proven once the platform can provision and run its first cloud tenants using the roadmap-literal Phase 10 capabilities. Everything here can be added afterward, independently, without revisiting Phase 10's code.

None of these are started. Each entry states what exists today (if anything) and what real product/engineering work remains.

## 1. Vendor Portal self-service onboarding — **Implemented (Cloud Tenant Onboarding)**

**Status:** Implemented as its own cross-repo feature, "Cloud Tenant Onboarding" — see `CLOUD_TENANT_ONBOARDING_DESIGN.md` for the full design and `HYBRID_ARCHITECTURE_LOG.md`'s Cloud Tenant Onboarding entry for the implementation record. Summary: `TenantProvisioningController` remains SUPER_ADMIN-JWT-gated for the original internal-operator path, and additionally accepts a service-to-service call from Vendor Portal via `VendorPortalApiKeyGuard` (`X-Vendor-Portal-Api-Key` header). Vendor Portal gained a new, fully self-contained "Cloud Tenants" module (`vendor-portal/backend/src/modules/cloud-tenants/`, its own `cloud_tenants` table, service, controller, and a "Provision Cloud Tenant" UI screen) that generates the SUPER_ADMIN temporary password, calls HDSP's provisioning endpoint, and persists `tenantId`/`subdomain`/`loginUrl`/`provisionedAt`/`status` from the response. The existing self-hosted "Register to Vendor" flow (`HospitalsController`/`HospitalsService`/`hospitals` table) was not touched by this work — it remains entirely separate, per the project's explicit governing decision.

**What's still open:** validation/approval workflow before provisioning runs (today it's immediate, operator-triggered), and the broader lifecycle/dashboard items below (2, 6, 8) remain unimplemented for cloud tenants specifically.

## 2. Full tenant lifecycle management

**Today:** `TenantProvisioningService.deprovision()` (Task 10.8) provides exactly one narrow operation — flip a tenant to `inactive` and revoke its connector pairing, as a pilot-rollback safety valve. No suspend/reactivate distinction, no rename, no subdomain change, no delete.

**Remaining work:** suspend (temporary, reversible, distinct from deprovision's inactive state), reactivate, rename (hospital display name), change subdomain (requires re-validating DNS/ALB routing implications), delete (real data-retention/GDPR-style decisions needed first), and an audit trail for all of the above.

## 3. Connector fleet management / pairing-protocol consumption

**Today:** `TenantConnectorPairing` stores a hashed credential in `status: 'pending'` and nothing ever transitions it. `connector/src/protocol/message-transport.interface.ts` (Phase 6) has no auth/credential field — a Connector today authenticates purely at the Redis connection level (Phase 9's `REDIS_TLS`/ElastiCache auth token), not against this table.

**Remaining work:** an actual protocol-level handshake where a Connector instance presents this pairing credential to authenticate to a specific tenant's Message Transport channel; `status` transitions (`pending` → `active` on first successful auth, `revoked` for rotation); a fleet-visibility view (which tenants have a Connector currently online, last-seen heartbeat, version); rotation tooling for issuing a new pairing key without downtime; handling for "Connector goes offline" (alerting, degraded-mode behavior for that tenant).

## 4. Subscription lifecycle automation

**Today:** Step 8 issues one `SubscriptionLicense` row in `trialing` status with a fixed `maxUsers: 5` and no `currentPeriodEnd`. Nothing automates what happens next.

**Remaining work:** trial-expiry handling (grace period, auto-downgrade or auto-suspend), plan upgrade/downgrade flows, payment integration (the entity already has `stripeCustomerId`/`stripeSubscriptionId` fields, unused), renewal reminders, usage-based `maxUsers` enforcement tied to the actual plan.

## 5. Secret and credential rotation tooling

**Today:** the connector pairing key (item 3) and any tenant-specific secrets have no rotation path beyond generating a brand-new value manually. Cloud-wide secrets (`hdsp/app-config`, `hdsp/database`, `hdsp/redis`, from Phase 9's `secrets.tf`) are also unrotated.

**Remaining work:** scheduled or on-demand rotation for connector pairing keys, tenant-scoped JWT signing considerations (currently one shared `jwt.secret` platform-wide), and a documented rotation runbook for the Phase 9 Terraform-managed secrets.

## 6. Operational dashboards

**Today:** `GET /platform/tenant-provisioning` lists raw provisioning runs; there is no aggregated view.

**Remaining work:** a platform-operator dashboard showing tenant count/status, provisioning run success/failure trends, connector fleet health (depends on item 3), subscription status breakdown, and storage/usage metrics per tenant.

## 7. Genuine per-tenant Roles, Permissions, Settings, and Usernames

**Today (see `PHASE_10_IMPLEMENTATION_PLAN.md`'s discrepancy #2):** `Role`/`Permission` have global unique constraints; `SystemSetting`/`CMSSettings`/`FeedbackSettings` are de-facto global singleton tables. Every tenant currently shares one global role/permission catalog and one global settings row. The same class of issue applies to `User.username`/`User.email` (`auth.service.ts`'s `setupSuperAdmin()`, doc comment at the duplicate-check): both carry a **global** unique constraint, not `(tenant_id, username)` — surfaced concretely during Cloud Tenant Onboarding testing (2026-07-16): a second tenant's SUPER_ADMIN could not be named `superadmin` because that username already existed for a different tenant. Login today works around this cleanly (a global-unique username is enough to find the right user and its `tenantId` without needing subdomain resolution at all), but it is not the target cloud architecture: the intended flow is `subdomain → resolve tenant → authenticate scoped to that tenant`, not `authenticate globally → read tenantId off the user row`. The former only starts to matter once usernames stop being globally unique.

**Remaining work:** if per-tenant role customization, per-tenant settings, or per-tenant username uniqueness ever become real product requirements, this needs a schema migration (composite unique constraints, e.g. `(tenant_id, name)` on `Role`, `(tenant_id, username)` on `User`), and changes to `RolesService`/`PermissionsService`/`SettingsService`/`CmsSettingsService`/`FeedbackSettingsService`/`AuthService`'s read paths to filter/scope by tenant — a business-module change, not a Phase 10 concern. Moving `User` specifically would also mean `SubdomainTenantMiddleware`'s tenant resolution becomes load-bearing for login (not just for post-login `TenantScopeGuard` checks, as it is today), since a username would no longer be unique enough on its own to identify which tenant's user record to check.

**RBAC is why this item can't be closed by the Stage B dry-run→enforced promotion pass.** During the 2026-07-16 consolidated fix (see `HYBRID_ARCHITECTURE_LOG.md`'s Cloud Tenant Onboarding entry), `rbac.module.ts`'s `Role`/`Permission` scoped-repository providers were deliberately left at `mode: 'dry-run'`, not promoted to `'enforced'` like the other six modules (Users, EIC, Loyalty, Feedback, CMS, Token/Registration, Auth's `PasswordResetRequest`). Reason: `TenantScopedRepository`'s enforced mode does a flat `tenant_id = :currentTenantId` equality match with no "OR tenant_id IS NULL" fallback. Every seeded system role (`SUPER_ADMIN`, etc.) and the entire permission catalog have `tenant_id: NULL` by design (global, shared across every tenant) — only custom roles created via `RolesService.create()` get a real `tenantId` stamped. Flipping RBAC to `'enforced'` as-is would make `GET /rbac/roles`/`GET /rbac/permissions` return empty for every tenant (a regression), not fix a leak. Fixing this properly means giving `Role`/`Permission` reads the same tenant-or-global fallback pattern `AuthService.isSetupRequired()` already uses, which is squarely this item's scope, not a one-line mode flip.

## 8. Cloud Tenant Operations (Vendor Portal)

**Today:** the "Cloud Tenants" screen (Cloud Tenant Onboarding, item 1) only provisions — list + create. There is no way to act on a tenant afterward from Vendor Portal. Concretely surfaced during onboarding testing (2026-07-16): the SUPER_ADMIN temporary password is shown exactly once at provisioning time and never persisted anywhere (by design — see `CLOUD_TENANT_ONBOARDING_DESIGN.md` Section 6's password-ownership decision); if an operator loses it before the hospital's first login, there is currently no recovery path except provisioning an entirely new tenant.

**Remaining work**, roughly in order of how often each would actually get used:
- **Reset SUPER_ADMIN password** — the most immediately painful gap. Vendor Portal generates a new temp password (same `generateTempPassword()` pattern `CloudTenantsService.provision()` already uses) and calls a new HDSP endpoint that updates the existing SUPER_ADMIN user's `passwordHash` for that tenant — deliberately NOT the same code path as `create_super_admin_user` (that step assumes no such user exists yet).
- **Retry failed provisioning** — `CloudTenantsService.provision()` already does this correctly today when retrying through the *same* "Provision Cloud Tenant" form (resumes the original HDSP run rather than colliding on the subdomain), but there's no dedicated "Retry" action on a FAILED row in the list itself; today the operator has to reconstruct the original form inputs from memory/the tooltip.
- **View provisioning history** — HDSP's `GET /platform/tenant-provisioning/:runId` already returns the full step-by-step audit trail (`run`, `steps`); nothing in Vendor Portal surfaces it per-tenant today (only the summary fields on the `cloud_tenants` list row).
- **Suspend / Resume tenant** — maps to HDSP's existing `deprovision()` (Task 10.8, sets `Tenant.status = 'inactive'`) for suspend, but there is currently no "reactivate" endpoint on the HDSP side either (see item 2's same gap) — needs a small HDSP addition, not just a Vendor Portal UI action.
- **Disable tenant** — distinct from suspend if "disable" is meant to be a harder, more deliberate state than a reversible pause; needs product clarification on how it should differ from suspend before building it.
- **Regenerate activation credentials** — likely the same underlying mechanism as password reset, framed differently (e.g. re-sending a fresh one-time login/setup link rather than surfacing the raw password again) — worth deciding as one feature, not two, once actually scoped.

None of this blocks Cloud Tenant Onboarding itself (item 1) being complete and usable — these are natural operational follow-ons once real tenants exist to operate on.
