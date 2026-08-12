# Phase 4 Implementation Plan — Licensing Providers

**Companion to:** `HDSP_Hybrid_Implementation_Roadmap.md`'s Phase 4 section — tracks actual execution against it, matching `PHASE_2_IMPLEMENTATION_PLAN.md`/`PHASE_3_IMPLEMENTATION_PLAN.md`'s relationship to their phases.

**Governance carried forward:** continuous implementation, no per-task stop-and-review, architectural blockers only.

---

## Pre-flight (2026-07-16)

1. **`ILicenseProvider` already exists correctly shaped** (`platform/infrastructure/licensing/license-provider.interface.ts`), with `getStatus(tenantId?: string)` already anticipating this phase. `FileLicenseProvider` (Phase 2) already implements it as a thin wrapper around `LicenseService`. No interface changes needed.
2. **Task 4.1's real target confirmed by reading `license.service.ts` directly:** `resetToTrial()` (three destructive operations — delete all `vendor_registrations`, delete all `license_master` rows, raw-SQL delete all non-SUPER_ADMIN `users`) and the `LICENSE_REVOKED` handler's full-table `UPDATE license_master SET status='REVOKED'` were both completely unscoped — they'd affect every tenant's data in a table, not just the tenant whose vendor webhook triggered them. Both `LicenseMaster` and `VendorRegistration` already carry a nullable `tenant_id` column (from Stage A's backfill), so the fix was buildable without new migrations for this part.
3. **No tenant-mapping infrastructure exists yet** (Phase 10, same standing note as every earlier phase). The webhook payload (`processWebhookEvent`) carries no tenant identifier at all — the only available anchor is the `tenantId` already stamped on the affected `LicenseMaster` row itself. The fix therefore *derives* `tenantId` from the record being acted on (find the active license first, read its `tenantId`, then scope every subsequent delete/update to it) rather than inventing an ambient-tenant-context mechanism that doesn't exist for a webhook call path. When no `tenantId` is found on the record (today's reality for every existing install), the fix falls back to `tenant_id IS NULL` scoping rather than a blind full-table wipe — same effective behavior today, safe once a second tenant's data can coexist in the same tables.
4. **Deviation from the roadmap's literal env var name:** the roadmap says `LICENSE_PROVIDER` (`file | subscription`). Used `LICENSE_PROVIDER_MODE` instead — `LICENSE_PROVIDER` is already the DI token constant's *name* (`platform/infrastructure/tokens.ts`, value `'ILicenseProvider'`); reusing the identical string for an unrelated env var name risked real confusion in code and docs for no benefit. Functionally identical otherwise (same two values, same default).
5. **Task 4.2's "DB table shaped like today's Vendor Portal schema"** — the Vendor-Portal-side schema extension (adding `stripeCustomerId`/`planId`/billing fields to `Hospital`/`IssuedLicense`) is explicitly out of this backend roadmap's scope per the roadmap's own text. Built a new local table (`subscription_licenses`) instead, following the same pattern `LicenseMaster`/`VendorRegistration` already use: a local HDSP-side mirror populated by vendor sync (not a live cross-system query), which `SubscriptionLicenseProvider` reads from. No webhook handler writes to it yet — proving the interface, not yet building the sync pipeline, matches the roadmap's explicit "no Stripe integration yet" scope limit.

**Status:** pre-flight complete. Proceeding to implementation.

---

## Task sequencing

1. **Task 4.1 — `resetToTrial()` / `LICENSE_REVOKED` tenant-scoping fix**, shipped as its own logically isolated change inside `license.service.ts` (per the roadmap's explicit instruction to keep this independent of the new-provider work).
2. **Task 4.2 — `SubscriptionLicenseProvider`**: new `SubscriptionLicense` entity + migration (`1783830000000-CreateSubscriptionLicenses`), new provider implementing `ILicenseProvider` by reading/mapping that table.
3. **Task 4.3 — `LicensingModule` mode-selection**, `LICENSE_PROVIDER_MODE` env var (`file | subscription`, default `file`), factory-based `LICENSE_PROVIDER` binding mirroring Phase 3's `StorageModule` pattern exactly (both providers always registered, only one ever bound).
4. **Task 4.4 — `ILicenseProvider` conformance suite**, run against both providers in CI's existing "Unit tests" step (no external service dependency needed here, unlike Phase 3's MinIO-backed suite — both providers only need a mocked repository/service).
5. **CI guardrail**: added `subscription-license.provider.ts` to Task 2.9's infrastructure-import-boundary allow-list (no binding-module change needed — `license.module.ts` was already listed).

---

## Status: ✅ PHASE 4 COMPLETE (2026-07-16)

| Task | Status | Notes |
|---|---|---|
| 4.1 — `resetToTrial()` tenant-scoping fix | ✅ | Shipped as an isolated change; derives tenantId from the affected record itself (no ambient-context mechanism exists for webhook calls); falls back to `tenant_id IS NULL` scoping, not a blind full-table wipe, when no tenantId is found |
| 4.2 — `SubscriptionLicenseProvider` | ✅ | New `subscription_licenses` table + provider; not populated by any webhook handler yet (sync pipeline is future work, out of this task's stated scope) |
| 4.3 — Mode-selection | ✅ | `LICENSE_PROVIDER_MODE` env var, default `file`; zero behavior change for every current deployment |
| 4.4 — Conformance suite | ✅ | Runs in the normal unit-test step; mocked repository/service, no live DB needed |

**Follow-ups for a human, outside this session's reach:**
1. Run the real toolchain's `npm run migration:run` (to actually create `subscription_licenses`), `npm run build`/`test`/`lint` — same standing caveat as every prior phase.
2. `SubscriptionLicenseProvider` has no writer yet — a future task needs to wire an actual Stripe/Vendor-Portal sync path (webhook or polling) that populates `subscription_licenses`, before `LICENSE_PROVIDER_MODE=subscription` is usable in any real deployment.
3. Task 4.1's fix is a correctness improvement that's a no-op under today's single-tenant reality (verified logically, not against live production data — same standing caveat as every schema/data-scoping fix in this project). Recommend the testing checklist item from the roadmap (verify with ≥2 tenant rows present) actually be run once the branch reaches the office environment.
4. `activateTrial()` (called at the end of `resetToTrial()`) still creates the new trial license row without stamping a `tenantId` — consistent with today's single-tenant reality, not addressed here since it's outside Task 4.1's stated scope (which only covers the destructive/delete operations, not the trial-recreation step).
