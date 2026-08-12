# Phase 3 Implementation Plan — Storage Providers

**Companion to:** `HDSP_Hybrid_Implementation_Roadmap.md`'s Phase 3 section — that document is the architectural objective; this document tracks actual execution against it, matching `PHASE_2_IMPLEMENTATION_PLAN.md`'s relationship to Phase 2.

**Governance carried forward:** continuous implementation, no per-task stop-and-review, architectural blockers only. One pre-flight for the whole phase (below), then sequential task execution.

---

## Pre-flight (2026-07-15)

Re-read the current storage abstraction (built in Phase 2) before writing anything new:

1. `IObjectStorageProvider` (`platform/services/object-repository/interfaces/object-storage-provider.interface.ts`) already has the right shape for a second provider: `id`, `name`, `upload`, `download`, `getMetadata`, `delete`, `getPresignedDownloadUrl`. No interface redesign needed — `LocalStorageProvider` already implements it cleanly.
2. `StorageModule` currently binds `STORAGE_PROVIDER` unconditionally to `LocalStorageProvider` via `useExisting` — no mode-selection logic exists. This is exactly Task 3.2's target.
3. `ObjectRepositoryService.storeFile()` has no `tenantId` parameter — exactly Task 3.3's target.
4. `LocalStorageProvider.getPresignedDownloadUrl()` currently throws (local files are served as static assets, not via signed URL) — this is a real, pre-existing behavioral difference between providers, not something Phase 3 needs to reconcile; callers that need presigned URLs are new S3-only functionality, not a Local regression.
5. **New finding this pass, not previously flagged:** `TokenController.listMedia()`/`deleteMedia()`, `CmsMediaController.permanentDelete()`, and `CmsAssetCleanupService`'s delete path all gate on raw `fs.existsSync()`/`fs.readdirSync()` against the local `uploads/` directory — they never went through `ObjectRepositoryService` for existence-checking or listing, only for the actual delete call. This means today, with `STORAGE_DRIVER=s3`, `listMedia()` always returns `[]` and every delete endpoint always 404s, even though the object legitimately exists in S3. `IObjectStorageProvider` has no `list()` method, and these four call sites need to switch their existence check from `fs.existsSync` to `getMetadata()` (catch-not-found) before S3 mode is usable end-to-end for delete/list. **Deliberately not fixed in this pass** — it's a materially larger, separate change (new interface method + 4 call-site rewrites with different error-handling semantics per route), and Task 3.3 as scoped only covers the write path. Logged as a follow-up below, not silently left unflagged.

**Status:** pre-flight complete. Proceeding to implementation.

---

## Task sequencing

1. **Task 3.1 — `S3StorageProvider`:** new file, `platform/services/object-repository/providers/s3-storage.provider.ts`, using `@aws-sdk/client-s3` + `@aws-sdk/lib-storage` (multipart-safe upload) + `@aws-sdk/s3-request-presigner`. Added the three `@aws-sdk/*` packages to `backend/package.json` (not previously a dependency) — version pins should be confirmed/refreshed by `npm install` in the real toolchain, since this sandbox can't reliably query the npm registry for the current published version. Added `STORAGE_DRIVER` (`local`/`s3`, default `local`) and `S3_BUCKET`/`S3_REGION`/`S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY` (required only when `STORAGE_DRIVER=s3`, via Joi's `.when()`) plus optional `S3_ENDPOINT`/`S3_FORCE_PATH_STYLE` (for MinIO/R2-style S3-compatible endpoints) to `src/config/env.validation.ts`.
2. **Task 3.2 — `StorageModule` mode-selection:** both `LocalStorageProvider` and `S3StorageProvider` are now always registered as ordinary providers (cheap — `S3StorageProvider`'s constructor just builds an `S3Client`, no eager connection); a new `STORAGE_PROVIDER` factory reads `STORAGE_DRIVER` via `ConfigService` and picks one. `STORAGE_DRIVER` unset or `'local'` is byte-for-byte the same wiring Phase 2 shipped — zero behavior change for every existing deployment.
3. **Task 3.3 — tenant-prefixed object keys:** `IObjectStorageProvider.upload()` and `ObjectRepositoryService.storeFile()` both gained an optional `tenantId?: string | null` parameter. `LocalStorageProvider` ignores it (documented: local deployments are single-tenant-per-install today). `S3StorageProvider` uses it as an object-key prefix (`<tenantId>/<subdir>/<filename>`) when present, falling back to the unprefixed key when absent — so omitting it (existing callers) is fully backward compatible. The three real upload call sites (`CmsMediaController.upload`, `TokenController.uploadMedia`, `FeedbackFormController`'s upload handler) were updated to resolve `tenantId` via `TenantContextStorage.currentTenantIdOrNull()` (the same B6-established helper) and pass it through. This is null-safe by construction — routes without an established tenant context (e.g. `TokenController.uploadMedia`, which doesn't currently carry `TenantContextInterceptor`) simply get `null` and behave exactly as before.
4. **Task 3.4 (piloting in a staging environment):** out of reach from this sandboxed session, same as every previous phase's environment-dependent item. Logged, not attempted.
5. **CI:** added `s3-storage.provider.ts` to the Task 2.9 infrastructure-import-boundary guardrail's `PROVIDER_FILES` list (no `ALLOWED_BINDING_FILES` change needed — `object-repository.module.ts` was already on that list). Added a new S3 conformance test suite (`s3-storage-provider.conformance.spec.ts`, gated behind `RUN_S3_CONFORMANCE_TESTS=true` so it's a no-op outside CI) and a new `storage-s3-conformance` CI job that brings up a MinIO service container and runs it — kept as a separate job from the main `backend` job so a MinIO flake can't fail the whole build for people not touching storage code.

---

## Status: ✅ PHASE 3 COMPLETE (2026-07-16)

User-confirmed sign-off: implementation complete with the following items explicitly deferred, none blocking progression to Phase 4:

1. Provider-level `exists()` / `list()` API (covers the fs-based `listMedia()`/`deleteMedia()`/`permanentDelete()`/asset-cleanup gap identified in the pre-flight).
2. CMS asset-cleanup migration to the provider abstraction (depends on #1).
3. Full staging verification using MinIO/S3 (Task 3.4 — needs a real environment).
4. Future tenant lifecycle operations (export/delete/usage) built on top of the storage abstraction — not in Phase 3's original scope at all, noted for a later phase (likely Phase 10, Tenant Provisioning).

This phase introduced a well-defined abstraction layer (`IObjectStorageProvider` → Local/S3) without forcing widespread application changes — three call sites touched for tenant-prefixing, everything else untouched — consistent with the incremental-migration philosophy used throughout Phase 1 (Stage B) and Phase 2.

| Task | Status | Notes |
|---|---|---|
| 3.1 — S3StorageProvider + env config | ✅ | New provider + Joi conditional validation for S3_* fields |
| 3.2 — StorageModule mode-selection | ✅ | `STORAGE_DRIVER` factory; default path unchanged |
| 3.3 — Tenant-prefixed object keys | ✅ | Additive-only optional param; 3 upload call sites updated; delete/list paths deliberately NOT touched (see follow-ups) |
| 3.4 — Staging pilot | ⏸ Blocked | Requires a real environment; not attempted, same posture as B9-B12/Phase 1-2's environment-gated items |
| CI guardrail + MinIO conformance | ✅ | Guardrail allow-list extended; new conformance suite + CI job |

**Follow-ups for a human, outside this session's reach:**

1. **Real gap, not yet fixed:** `TokenController.listMedia()`/`deleteMedia()`, `CmsMediaController.permanentDelete()`, and `CmsAssetCleanupService`'s delete path still gate on `fs.existsSync()`/`fs.readdirSync()` against local disk. Under `STORAGE_DRIVER=s3` these will misbehave (list always empty, delete always 404) even though the S3 object exists. Needs: add a `list()` (or at least an existence-check) method to `IObjectStorageProvider`, then migrate these four call sites off raw `fs` calls. Not attempted here — materially larger than Task 3.3's stated "tenant-prefix the write path" scope.
2. Run `npm install` in the real toolchain to resolve/lock the `@aws-sdk/client-s3`/`@aws-sdk/lib-storage`/`@aws-sdk/s3-request-presigner` version pins added to `package.json` — this sandbox could not query the npm registry reliably to confirm the exact current published version.
3. Run the real toolchain's `npm run build`/`npm run test`/`npm run lint`, same standing caveat as every prior phase (this sandbox's `tsc`/bash checks have shown recurring mount-staleness and are not authoritative).
4. Task 3.4 (pilot `STORAGE_DRIVER=s3` in a real staging environment against a real S3 bucket, or the CI-tested MinIO setup) needs the office/production environment.
5. Consider whether `getPresignedDownloadUrl()`'s Local-throws-not-supported behavior needs a UI-facing fallback (e.g. always serve via `/uploads/...` static route on Local, only use presigned URLs on S3) — not addressed here since no caller of `getPresignedDownloadUrl()` exists yet in either mode.
