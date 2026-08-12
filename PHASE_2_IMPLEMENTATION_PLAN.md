# Phase 2 Implementation Plan — Infrastructure Abstraction

**Companion to:** `HDSP_Hybrid_Implementation_Roadmap.md`'s Phase 2 section (lines 142–186) — that document is the architectural objective; this document tracks actual execution against it, the same relationship `STAGE_B_IMPLEMENTATION_PLAN.md` had to `STAGE_B_DESIGN.md` during Phase 1.

**Governance carried forward from Phase 1's 2026-07-15 update:** continuous implementation, no per-task stop-and-review, architectural blockers only. One pre-flight for the whole phase (below), then sequential task execution.

---

## Pre-flight (2026-07-15)

A direct code audit was run before any implementation, since Phase 2's roadmap section makes several specific factual claims about the current codebase that needed verification before trusting them as a task list. **Several claims were found inaccurate or incomplete:**

1. **File path claim is wrong.** The roadmap says scaffolding lives at `backend/src/infrastructure/`. It does not exist there. The real Phase 0 scaffolding directory is `backend/src/modules/platform/infrastructure/`, imported/exported by `platform.module.ts`. Every task below uses the real path, not the roadmap's.

2. **The four target interfaces already exist**, as pure interfaces with explicit "no implementation, no consumer yet" doc comments: `IOracleTransport` (`platform/infrastructure/oracle/oracle-transport.interface.ts`), `ILicenseProvider` (`platform/infrastructure/licensing/license-provider.interface.ts`), `INotificationTransport` (`platform/infrastructure/notifications/notification-transport.interface.ts`), and `ISecretsProvider` (`platform/infrastructure/secrets/secrets.interface.ts`, which is unlike the other three — it already has a bound implementation, `EnvironmentSecretsProvider`, wired via `platform-infrastructure.module.ts`'s `SECRETS_PROVIDER` token). This makes Tasks 2.4/2.6/2.7 lighter than the roadmap implies (write the provider + bind it; the interface is already correctly shaped) but does not reduce Task 2.5's consumer-migration work at all.

3. **Storage has a reconciliation problem the roadmap doesn't mention.** Two non-identical `IObjectStorageProvider` definitions currently exist: a real interface at `platform/services/object-repository/interfaces/object-storage-provider.interface.ts` (consumed by the already-written-but-unwired `ObjectRepositoryService`), and a bare string token (`STORAGE_PROVIDER`) pre-declared in `platform/infrastructure/tokens.ts` with no interface file backing it. Task 2.1 must pick one interface shape and reconcile these before writing `LocalStorageProvider`, not treat them as already-aligned.

4. **`ObjectRepositoryService` is confirmed dead code** — exists, has no `.module.ts`, zero consumers, zero DI registration anywhere. Task 2.1 needs to actually wire it into a new `StorageModule`, not assume it's one step from working.

5. **The three upload controllers are not byte-identical logic**, contrary to what "lift into one class" implies. `CmsMediaController.upload` computes a SHA-256 checksum and image dimensions after write; `TokenController.uploadMedia` and `FeedbackFormController`'s handler do not. `LocalStorageProvider`'s interface needs to accommodate this — either the checksum/dimension logic stays in CMS's own service layer (calling the storage facade only for the raw write), or the interface grows an optional post-write hook. Decided: **keep checksum/dimension computation in `CmsMediaController`'s own code, calling `ObjectRepositoryService.storeFile()` only for the raw write** — this is the smaller, more conservative change and matches Task 2.1's "zero behavior change" goal most literally.

6. **Oracle's consumer list is significantly larger than the roadmap's five-module summary.** Confirmed direct `OraclePoolService` injectors: `his/billing/billing.service.ts`, `his/billing/his-loyalty-bridge.service.ts`, `his/patient/patient.service.ts`, `his/visit/visit.service.ts`, `his/sync/his-sync.service.ts`, `his/reference/reference.service.ts`, `his/token/his-token-bridge.service.ts`, `his/his.controller.ts`, `branch/branch.service.ts`, `licensing/license.controller.ts` (not mentioned in the roadmap at all), plus 7 Attendance services and 4 dependency pollers, plus `common/health/oracle.health.ts`. `AttendanceListener` itself is an *indirect* consumer (via `OraclePollingService`), not direct as the roadmap implies — its own migration is a no-op once `OraclePollingService`'s is done.

7. **No CI infrastructure-import-boundary guardrail exists at all.** `ci-backend.yml`'s only current guardrail checks `DEPLOYMENT_MODE` env-var usage (real Phase 0.5 work, unrelated). Task 2.9 is "write a new guardrail from scratch," not "tighten an existing allow-list" as the roadmap phrases it.

8. **`ISecretsProvider` has zero consumers today**, despite being fully wired. Task 2.8 is "add the first consumers" (starting with the one confirmed direct-env-read gap, `gemini-classifier.provider.ts`'s `GEMINI_API_KEY` read), not an audit of existing ones — there are none to audit.

**Status:** pre-flight complete, task list below adjusted for these 8 corrections. Proceeding to implementation.

---

## Task sequencing (adjusted from the roadmap's Task 2.1–2.9, same objectives, corrected paths/scope)

1. **Storage (Tasks 2.1–2.3):** reconcile the two `IObjectStorageProvider` shapes → write `LocalStorageProvider` implementing the real interface → wire `ObjectRepositoryService` into a new `StorageModule` → migrate CMS/Token/Feedback upload controllers to call it (preserving CMS's checksum/dimension logic in its own layer) → migrate `CmsAssetCleanupService`'s delete path.
2. **Oracle (Tasks 2.4–2.5):** write `DirectOracleTransport` wrapping `OraclePoolService`'s body verbatim → bind via `OracleModule.forRoot()` → migrate all confirmed consumers (the full list above, not the roadmap's abbreviated one) one at a time, mechanical DI-token swap only.
3. **Licensing (Task 2.6):** write `FileLicenseProvider` wrapping `LicenseService` → bind via `LicensingInfraModule.forRoot()` → migrate `LicenseGuard` and every direct `LicenseService` consumer found in pre-flight item 6.
4. **Notifications (Task 2.7):** write `WhatsAppTransport` wrapping `WhatsAppService` → bind via `NotificationInfraModule.forRoot()` → migrate `NotificationProcessor` (the only current consumer).
5. **Secrets (Task 2.8):** migrate `gemini-classifier.provider.ts`'s direct env read to `ISecretsProvider`; confirm no other direct-env-read gaps exist for secret-shaped values.
6. **CI guardrail (Task 2.9):** write the infrastructure-import-boundary grep-check from scratch (business/platform modules may not import `platform/infrastructure/**/*.provider.ts`/`*.transport.ts` directly — only the new `*.module.ts` factories may), test it against a deliberately-introduced violation before trusting it.

Each task group's completion write-up goes into `HYBRID_ARCHITECTURE_LOG.md`, matching Phase 1's per-checkpoint documentation discipline.

---

## Status: ✅ COMPLETE (2026-07-15)

All six task groups implemented and verified. Full narrative in `HYBRID_ARCHITECTURE_LOG.md`'s "Phase 2 — Infrastructure Abstraction: Complete" entry. Summary:

| Task group | Status | Notes |
|---|---|---|
| 1. Storage (2.1–2.3) | ✅ | Two competing interface definitions reconciled; buffered-upload tradeoff flagged (was streaming, now buffer-then-write — same output, different memory profile) |
| 2. Oracle (2.4–2.5) | ✅ | Interface extended (`queryOne`, `reconfigure` were missing); thin-wrapper approach; 20/25 consumers migrated, 5 correctly left on direct injection (see log) |
| 3. Licensing (2.6) | ✅ | `LicenseGuard` + license.controller.ts migrated; ~11 consumers left on direct injection (call `isModuleLicensed()`, not on the interface — correctly out of scope) |
| 4. Notifications (2.7) | ✅ | `NotificationProcessor`, the only consumer, migrated |
| 5. Secrets (2.8) | ✅ | One confirmed gap (`gemini-classifier.provider.ts`) migrated; a longer list of bootstrap-level/synchronous secret reads deliberately deferred, logged not dropped |
| 6. CI guardrail (2.9) | ✅ | Written from scratch (none existed); corrected mid-verification from an overly broad glob to an explicit 5-file list after testing surfaced false positives |

**Follow-ups for a human, outside this session's reach:**
1. Delete two inert scratch files at `backend/src/modules/cms/media/_ci_test_violation.ts` and `_test2.ts` (sandbox couldn't remove them; both overwritten to be harmless).
2. Run the real toolchain's `npm run build`/`npm run test`/`npm run lint` — this session's sandbox `tsc` has shown a recurring mount-staleness artifact at every checkpoint this project and is not authoritative.
3. Consider, as separate future work (not blocking Phase 2's completion): extending `ILicenseProvider` with `isModuleLicensed()` so the remaining Licensing consumers can migrate; extending `ISecretsProvider` consumer coverage to the bootstrap-level secret reads (JWT secrets, WhatsApp credentials, DB/Redis passwords) once an async-safe pattern for `JwtModule.registerAsync`-style factories is worked out.
