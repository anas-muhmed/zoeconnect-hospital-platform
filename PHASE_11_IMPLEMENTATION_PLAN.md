# Phase 11 Implementation Plan — Feature Flags

Status: **Complete**
Scope decision: roadmap-literal Phase 11 (Tasks 11.1–11.4), per an explicit user decision recorded below.

## Scope fork found during pre-flight, and how it was resolved

Before writing any code, the roadmap (`HDSP_Hybrid_Implementation_Roadmap.md`, lines 500-533) and spec Section 8.2 (lines 291-313) were read against the user's stated expectation for this phase. A real conflict emerged:

The user's initial framing expected Phase 11 to wrap Phases 3–9's **infrastructure/provider-selection capabilities** in runtime feature flags — e.g. `ENABLE_CLOUD_ORACLE_TRANSPORT`, toggles for Connector usage, S3 storage, cloud notifications, tenant provisioning.

The roadmap and spec define `FeatureFlag` as something different: a layer **beneath module licensing**, for gating **business behavior within an already-licensed module**, per-tenant — the spec's own worked example is `CMS → Feature: scrolling-ticker = on, emergency-broadcast = on` and `AI Assistant → Feature: ai-assistant = beta`. Nothing in the roadmap's 4 tasks mentions infrastructure toggles at all.

**Explicitly not a semantic quibble:** building `ENABLE_CLOUD_ORACLE_TRANSPORT` as a `FeatureFlag` row would duplicate `ORACLE_TRANSPORT` (Phase 7) with a second, less deployment-safe mechanism — Redis-cached and DB-backed, evaluated per-request, versus a boot-time env var read once at process start. This is exactly the anti-pattern the user's own message correctly cautioned against ("I wouldn't let Phase 11 become a general configuration framework... `SMTP_HOST`... that's configuration, not a feature toggle") — just aimed at the phase's actual entity rather than avoided by it.

This was surfaced via `AskUserQuestion` before any code was written. **The user chose the roadmap-literal option** and asked for an explicit boundary note to be recorded:

> Infrastructure mode selection (e.g. `DEPLOYMENT_MODE`, `ORACLE_TRANSPORT`, `STORAGE_DRIVER`, `LICENSE_PROVIDER_MODE`, `NOTIFICATION_PROVIDER_MODE`) remains outside the Feature Flag system by design. These are deployment-level configuration decisions established in Phases 3–9. Phase 11 governs only runtime, per-tenant business feature availability.

That boundary is enforced by construction, not just by policy: `FeatureFlagsService`/`RequireFeatureGuard` have no code path that reads or writes any of those five env vars, and nothing in this phase touches `redis.config.ts`'s provider-selection wiring or any `*.config.ts` file beyond adding one new `CACHE_KEYS` entry.

## What was built

### Task 11.1 — `FeatureFlag` entity + `FeatureFlagsService`

`backend/src/modules/platform/feature-flags/entities/feature-flag.entity.ts` — `tenant_id` (nullable, genuinely meaningful: NULL = platform-wide default, non-null = per-tenant override — unlike the nullable-but-unused `tenant_id` columns found on Role/Permission/Settings during Phase 10), `feature_key` (dot-namespaced, e.g. `cms.emergency-broadcast`), `state` (`enabled`/`disabled`/`beta`), `rollout_percentage` (stored, not yet evaluated — see below), `description`, `updated_by`. Composite unique index on `(tenant_id, feature_key)` — a unique *index*, not a table constraint, so Postgres's "NULL is distinct from every other NULL" semantics correctly allow many tenant-specific rows to coexist with one global default row per feature key.

`FeatureFlagsService.isEnabled(tenantId, featureKey)` mirrors `LicenseService.getStatus()`'s exact caching shape (same `InjectRedis()` client, same 5-minute TTL, same "cache miss or Redis error → fall through to DB, never throw" resilience, same "write path calls `redis.del()` to bust" invalidation) — deliberately not refactored into a shared generic cache-wrapper with `LicenseService`, since the two check semantically different things and duplicating this small amount of logic by eye is clearer than a new abstraction for two call sites.

Resolution order: tenant-specific row → platform-wide default row → `disabled` if neither exists. An unconfigured feature is off by default, so a newly added `@RequireFeature()` call site can never accidentally expose unfinished behavior.

### Task 11.2 — `@RequireFeature()` decorator + `RequireFeatureGuard`

`backend/src/modules/platform/feature-flags/decorators/require-feature.decorator.ts` and `guards/require-feature.guard.ts` — mirror `@RequireModule()`/`LicenseGuard`'s exact shape (`SetMetadata` + `Reflector.getAllAndOverride`, no metadata means no restriction). Tenant resolution reads `request.tenantId`, the same ambient field `TenantScopeGuard` (Phase 8) already reads, populated upstream by `SubdomainTenantMiddleware` before any guard runs. Per spec Section 8.2 ("module gate wins if the module itself is unlicensed, feature gate only evaluated within an already-licensed module"), the decorator's own doc comment documents the correct `@UseGuards()` ordering (`LicenseGuard` before `RequireFeatureGuard`) for any future controller that has both — this phase's one pilot controller (CMS) has no module-level license gate today, so that ordering doesn't apply to it directly, documented rather than assumed.

### Task 11.3 — pilot migration: CMS emergency broadcast

Candidates considered: an "AI Assistant" module (named in the roadmap's own Task 11.3 example) does not exist in this codebase — there is a large, unwired `modules/platform/services/ai-platform/` scaffold with its own always-`true` `AiFeatureFlagsService.isCapabilityEnabled()` stub, but it has zero consumers anywhere, so migrating it would not be "proving the pattern with one real feature" (Task 11.3's own wording) — there is no real feature there yet to gate. Instead, the pilot lands on **`cms.emergency-broadcast`**, a genuinely real, live, already-shipped capability (`CmsEmergencyService.activate()`/`deactivate()`, `CmsEmergencyController`'s `POST /cms/emergency` and `PATCH /cms/emergency/:id/deactivate`) — this is in fact the exact feature the spec's own Section 8.2 worked example names (`CMS → Feature: ... emergency-broadcast = on`).

**Correctness note, not incidental:** `activate()`/`deactivate()` had no prior on/off switch at all — they were unconditionally available to anyone with `CMS:DISPLAY:MANAGE` permission. Wiring them to `@RequireFeature('cms.emergency-broadcast')` without seeding a corresponding row would make `FeatureFlagsService.isEnabled()` default to `disabled` (per its documented "unconfigured = off" resolution order) and silently break emergency broadcasting for every existing tenant the moment the migration ran. `1783850000000-CreateFeatureFlags.ts` seeds a platform-wide (`tenant_id IS NULL`) `enabled` row for exactly this `feature_key` as part of the same migration — this phase's migration is behavior-neutral by construction, not just schema-additive.

`listActive()`/`listHistory()` (read-only history) are deliberately left ungated — disabling the flag should stop new broadcasts from being activated, not hide the audit history of ones that already ran.

### Task 11.4 — admin-facing feature-flag management

`backend/src/modules/platform/feature-flags/feature-flags-admin.controller.ts` — `SUPER_ADMIN`-only (`JwtAuthGuard` + `RolesGuard` + `@Roles('SUPER_ADMIN')`, the same pattern Task 10.7 established), kept as its own controller/module rather than added directly into `tenant-provisioning.controller.ts` — "extend Task 10.7's admin surface" is read as "extend the pattern" (same guard stack, same internal-tool posture), not "extend the file," since feature flags are a conceptually distinct resource from tenant provisioning.

- `GET /platform/feature-flags` — list flags (optionally filtered by `?tenantId=<uuid>` or `?tenantId=global`).
- `POST /platform/feature-flags` — upsert a flag (`UpsertFeatureFlagDto`: `tenantId?`, `featureKey`, `state`, `rolloutPercentage?`, `description?`), busts exactly that one cache entry.

## What was explicitly not built

- **Percentage-based gradual rollout.** `rollout_percentage` is stored on the entity per spec Section 8.2 but not evaluated by `isEnabled()` — doing so correctly needs a stable per-tenant hash-bucketing decision (which identifier, which hash function) that has no real use case to validate against with a single pilot feature at `enabled`/`disabled` granularity. Tracked as a natural follow-up once a second flag actually needs graduated rollout, not built speculatively.
- **Frontend flag-aware visibility check** for the pilot feature and the admin management UI (the roadmap's own "Frontend changes" line for this phase) — this phase covered the backend surface only; the frontend work is a natural, separate follow-up using the new `GET`/`POST /platform/feature-flags` endpoints, not attempted here without a frontend task in scope.
- **Infrastructure/provider-selection toggles** — see the scope-fork section above. Explicitly out of bounds by the user's own recorded decision.

## Files touched

- `backend/src/database/migrations/1783850000000-CreateFeatureFlags.ts` (+ registered in `data-source.ts`)
- `backend/src/config/redis.config.ts` — one new `CACHE_KEYS.FEATURE_FLAG` entry
- `backend/src/modules/platform/feature-flags/**` (entity, service, decorator, guard, DTO, admin controller, module)
- `backend/src/modules/cms/cms.module.ts` — imports `FeatureFlagsModule`
- `backend/src/modules/cms/emergency/cms-emergency.controller.ts` — `@RequireFeature('cms.emergency-broadcast')` on `activate()`/`deactivate()`
- `backend/src/app.module.ts` — registers `FeatureFlagsModule`

## Pilot note

Same posture as every other environment-dependent item in this project: the migration's seed INSERT and the guard's Redis-cache-then-DB-fallback path have not been run against a real Postgres/Redis instance in this sandbox. Should be exercised once in the real environment — confirm the seeded row actually preserves emergency-broadcast access post-migration, and confirm a `POST /platform/feature-flags` disable call actually blocks a subsequent `activate()` call within the 5-minute cache TTL window.
