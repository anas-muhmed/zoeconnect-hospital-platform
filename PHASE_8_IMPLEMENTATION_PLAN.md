# Phase 8 Implementation Plan — Multi-Tenancy Activation

**Companion to:** `HDSP_Hybrid_Implementation_Roadmap.md`'s Phase 8 section — tracks actual execution, matching Phases 2-7's companion-doc pattern.

**Governance carried forward:** continuous implementation, no per-task stop-and-review, architectural blockers only.

**Design directive (2026-07-16, user-specified):** activate existing pieces (Stage A/B's tenant infrastructure, Storage/Licensing/Notification/Oracle provider selection) to work together — no tenant provisioning (Phase 10), no Vendor Portal changes (Phase 10+), no CI/CD (Phase 12), no deployment automation (Phase 9).

---

## Pre-flight — the real activation boundary

There is no single `MULTI_TENANCY_ENABLED` flag anywhere in this codebase or the roadmap text — the pre-flight corrected this framing before implementation began. The actual mechanism is more granular:

- **Repository enforcement** is already dry-run-only (`TenantScopedRepository`, Stage B) — Phase 8 does not flip this to hard-enforce; that remains a later, separate decision.
- **Tenant resolvers** (`SessionTenantResolver`/`OracleTenantResolver`/`ChainTenantResolver`, Stage B) already exist and already resolve to `'default'` for every self-hosted request — Phase 8 adds the one missing piece: real subdomain-derived resolution (Task 8.2), so a *hostname* can claim a tenant identity, not just an authenticated session.
- **Provider selection** (Storage/Licensing/Notification/Oracle, Phases 3-7) is unaffected by this phase — no change.
- **Connector** (Phase 6) is unaffected — no change.
- **Vendor Portal** is unaffected — no change (confirmed again for this phase; no new cross-repo surface was touched).
- **Deployment** is unaffected — this phase adds `DEPLOYMENT_MODE`-keyed CORS logic (Task 8.7) but changes no infrastructure, no `Dockerfile`, no CI.

Two roadmap-vs-reality discrepancies found and corrected before implementation, consistent with this project's standing pattern (Phase 2's `DirectOracleTransport` path, Phase 6's `OraclePoolService` location):
- No `TenantContextMiddleware` exists to "upgrade" (the roadmap's Task 8.2 text assumes one). Tenant context is actually interceptor-based (`TenantContextInterceptor`, opt-in per-controller) plus a hardcoded `TenantContextService.getCurrentTenantCode()`. `SubdomainTenantMiddleware` (Task 8.2) was built new, not upgraded from a stub.
- `Tenant` entity has no `slug` column — only `code`. The roadmap's "tenantSlug" (`JwtPayload.tenantSlug`, Task 8.1) maps to this entity's `code` column; documented in `auth.service.ts`'s `resolveTenantSlug()`.

---

## Task sequencing

1. **Task 8.1 — `tenantId`/`tenantSlug` on `JwtPayload`** (`modules/auth/strategies/jwt.strategy.ts`, `modules/auth/auth.service.ts`): both optional, added to every token `generateTokens()` issues (`tenantId` from `user.tenantId`, `tenantSlug` resolved via a small cached lookup that returns `null` rather than throwing). Backward-compatible — a pre-Phase-8 token simply has neither claim, and every consumer added in this phase treats their absence as "nothing to check," never as an error.
2. **Task 8.2 — `SubdomainTenantMiddleware`** (`common/middleware/subdomain-tenant.middleware.ts`): resolves the `Host` header's subdomain label to a `Tenant` (cached, positive and negative) via a new `TenantContextService.resolveTenantBySubdomain()`. Runs on every request, before any guard, unauthenticated or not. Self-hosted installs have no `Tenant` row with a non-null `subdomain`, so this always falls back to `getCurrentTenantId()`'s existing `'default'` resolution — zero behavior change there. Wired into `app.module.ts` via `configure()`.
3. **Task 8.3 — `TenantScopeGuard`** (`common/guards/tenant-scope.guard.ts`): registered as a global `APP_GUARD`. Self-contained by design — verifies the bearer token itself via its own injected `JwtService` rather than depending on `request.user`, because this codebase applies `JwtAuthGuard` per-controller, not globally, so guard-execution order relative to it isn't guaranteed. Cross-checks `payload.tenantId` (Task 8.1) against `request.tenantId` (Task 8.2); a mismatch is always logged, and only throws `ForbiddenException` when `TENANT_SCOPE_GUARD_MODE=enforced` (default `log-only`) — the roadmap's own explicit staged-rollout strategy. `@Public()` routes and derived-JWT principals (workstation/reservation-capability tokens, which carry `branchId` not `tenantId`) pass through untouched — their tenant resolution already correctly routes through `ChainTenantResolver` (Stage B), not duplicated here.
4. **Task 8.4 — tenant-scoped `isSetupRequired()`/`setupSuperAdmin()`** (`modules/auth/auth.service.ts`, `modules/auth/auth.controller.ts`): both now take an optional `tenantId` (the controller passes `req.tenantId` from Task 8.2's middleware). Handles the null-vs-default-tenant equivalence explicitly: every pre-Phase-8 `User` row has `tenantId: null`, while the middleware resolves a self-hosted request's `req.tenantId` to the seeded `'default'` tenant's real UUID — without reconciling the two, a self-hosted instance with an existing SUPER_ADMIN would incorrectly report `isSetupRequired() === true`. Resolved by treating `null` and the default tenant's UUID as equivalent only for the default tenant; a genuine second tenant is matched strictly, so one tenant's admin can never satisfy another's setup check.
5. **Task 8.5 — widget cookie flow tenant-scoped** (`modules/auth/auth.controller.ts`, `modules/auth/auth.service.ts`): the `hdsp_widget_session` httpOnly cookie flow (`widget-login`/`widget-bootstrap`/`widget-logout`) is entirely `@Public()`, so `TenantScopeGuard` structurally never reaches it — the guard returns `true` immediately for any `@Public()` route before extracting a token, and never reads cookies at all. This is exactly the long-lived, silently-self-renewing session type Task 8.3 was built to guard, reached via the one path it can't cover. Fixed by reimplementing the same log-only/enforced check (`AuthService.assertTenantScope()`) at the two widget entry points that matter (`widgetLogin`, `widgetBootstrap`), reusing `TENANT_SCOPE_GUARD_MODE`.
6. **Task 8.6 — tenant-iterate Postgres-only cron jobs**: the roadmap names five job categories (password-reset expiry, reservation sweep, campaign scheduler, token daily reset/analytics, CMS cleanup); Oracle-touching pollers (Attendance's HIS/night reconciliation) are explicitly out of scope, deferred to the Connector's domain per Phase 6/7. Audited each named job for the real gap: services that call `TenantContextStorage.currentTenantIdOrNull()` for write-stamping resolve to `null` inside a `@Cron` job, since no `TenantContextInterceptor` ever runs for one. Fixed via the row-derived pattern already established in this codebase (`registration.service.ts`'s `sweepExpiredReservations()`, which needed no change) — each job establishes `TenantContextStorage.run(tenantId, ...)` from a source row's own already-stamped `tenantId` before making a nested write-stamping call, rather than introducing a new active-tenant-iteration query pattern. `token-analytics.service.ts`'s raw-SQL nightly aggregation had its own entity doc comment flagging this exact follow-up (`token_analytics_daily.tenantId`, "Stage B's nightly aggregation job... will need to thread tenant_id through") — resolved by threading `token_records.tenant_id` through the aggregation query's `GROUP BY`. `token-daily-reset.service.ts` needed no change (pure `UPDATE`s on existing branch-scoped rows, no new tenant-stamped row created).
7. **Task 8.7 — CORS rework** (`main.ts`): self-hosted keeps the existing private-IP allowlist completely unconditionally (branch decided once at bootstrap from `DEPLOYMENT_MODE`, never re-evaluated per request). Cloud mode additionally accepts an origin whose hostname is `<subdomain>.<CLOUD_BASE_DOMAIN>` where `<subdomain>` resolves to a real, active `Tenant` via the same cached `TenantContextService.resolveTenantBySubdomain()` lookup Task 8.2 already established — the wildcard is scoped to real tenants, not `*.<domain>` unconditionally. New env var: `CLOUD_BASE_DOMAIN` (required only when `DEPLOYMENT_MODE=cloud`).

---

## Status: ✅ PHASE 8 COMPLETE for sandbox-reachable scope (2026-07-16)

| Task | Status | Notes |
|---|---|---|
| 8.1 — `tenantId`/`tenantSlug` on JWT | ✅ | Backward-compatible, both optional |
| 8.2 — Subdomain resolution middleware | ✅ | Built new (no stub existed); zero change for self-hosted |
| 8.3 — `TenantScopeGuard` | ✅ | Self-contained; `log-only` default, `enforced` opt-in via `TENANT_SCOPE_GUARD_MODE` |
| 8.4 — Tenant-scoped setup | ✅ | Null-vs-default-tenant equivalence handled explicitly |
| 8.5 — Widget cookie flow | ✅ | Reimplements Task 8.3's check at the one path the guard can't reach |
| 8.6 — Cron tenant-iteration | ✅ | Row-derived pattern; 5 named categories audited, real gaps fixed |
| 8.7 — CORS rework | ✅ | Self-hosted unconditional; cloud mode tenant-registry-backed wildcard |

**What this phase deliberately did NOT touch**, per the user's explicit boundary: tenant provisioning UI/flow, Vendor Portal (any file), CI/CD pipeline, deployment automation/infrastructure, `TenantScopedRepository`'s dry-run→enforce switch.

**Follow-ups for a human:**
1. Explicit cross-tenant authz test suite (roadmap's own testing checklist item): valid credentials for tenant A, attempted access via tenant B's subdomain/JWT, confirmed rejected at every guarded endpoint — needs ≥2 real tenant rows and a real running instance, not fabricated here.
2. `TENANT_SCOPE_GUARD_MODE` should stay `log-only` in every real deployment until that log-only run has been observed clean for a representative period, per the roadmap's own rollback strategy — flipping to `enforced` is an operational decision, not a code change, and is deliberately not defaulted here.
3. `npm install` to pick up no new package dependencies this phase (none added), but run the real build/test/lint toolchain — this phase's sandbox verification was read-and-reason only, consistent with this project's standing practice.
4. Cron-job-exactly-once-per-tenant verification (roadmap's testing checklist) needs a real scheduler running against ≥2 real tenant rows.
5. CORS behavior for a simulated `cloud` config needs a real `CLOUD_BASE_DOMAIN` and ≥1 real tenant with a non-null `subdomain` to exercise end-to-end.
6. Phase 4's carried-forward Phase 10 items (Vendor Portal's `testDbConnection()` direct-connectivity assumption; Connector-instance provisioning ownership) remain open and are not re-litigated here.
