# HDSP vs HDSP_HYBRID — Gap Analysis & Reconciliation Plan

**Scope:** Read-only comparison of `D:\HDSP` (old/parallel codebase, not modified) against `D:\HDSP_HYBRID` (this codebase). Goal: find code that exists in HDSP but not in HDSP_HYBRID, and lay out how to bring them back in sync.

## 1. How the two codebases relate

Both are git repos. `HDSP_HYBRID` forked from `HDSP` at commit `6cec811` ("Feedback form fix 3.0, HIS pharmacy module integration token 17.0"). From that point the two diverged in different directions:

- **HDSP_HYBRID** went on to build the entire multi-tenancy / cloud-hybrid architecture — infrastructure abstraction (storage/license/notification/Oracle-transport providers), the `connector/` package, cloud deployment (ECS/Terraform), tenant provisioning, feature flags, and the tenant-scoped-identity hardening (composite unique constraints, tenant-aware login, etc.). This is the bulk of what shows up as "different" in a raw diff — it's forward progress, not a gap.
- **HDSP** kept receiving its own commits after the fork: 13 commits ("EIC module report auto load" 1.0–11.0, plus "debug for query for loyalty"), plus a batch of not-yet-committed working-tree edits (`git status` shows ~48 modified files). Most of that uncommitted batch turned out to be noise (see §3), but a handful of real fixes were never ported into HDSP_HYBRID.

A large fraction of the raw `diff -rq` output (728 lines in `backend/` alone) is also just **CRLF vs LF line-ending noise** — HDSP's files are LF, many HDSP_HYBRID files are CRLF, which makes ordinary line-diff tools report nearly every line as changed even when content is identical. Re-running with whitespace-insensitive diff (`diff -w`) cut that down to 311 lines, and most of the remainder is HDSP_HYBRID's own tenant_id/TenantContextInterceptor additions (expected, one-directional).

**Frontend and Vendor Portal have zero HDSP-only files** — everything there is either identical or HDSP_HYBRID is strictly ahead (e.g. the whole `cloud-tenants` feature). The real gaps are all in `backend/`.

## 2. Confirmed real gaps (HDSP has it, HDSP_HYBRID doesn't)

### 2.1 EIC "auto-load" progress reports — missing entirely
11 commits' worth of feature work (`EIC module report auto load 1.0` → `11.0`), touching:
- `backend/src/modules/eic/progress-report/eic-progress-report.service.ts` — adds `hydrateLiveDrafts()` / `hydrateLiveSection()`, which auto-populates a progress report's discipline sections from live/in-progress session data rather than requiring a therapist to manually re-enter it. ~200+ real lines of new logic.
- `frontend/src/app/(platform)/eic/progress-reports/[id]/page.tsx` — matching UI rework to surface the auto-loaded/draft state (large rewrite).
- `frontend/src/lib/api/eic.api.ts` — one new API binding to support it.

**Impact if not ported:** EIC therapists using HDSP_HYBRID lose this auto-load convenience feature entirely — the progress report page will behave like the pre-auto-load version.

### 2.2 HIS `reference.service.ts` — real bug fix missing
`getDoctors()` in HDSP has two things HDSP_HYBRID lacks:
- Strips the `:deptCode` bind placeholder out of a hospital's custom SQL template when no department filter is supplied, to avoid an Oracle `NJS-098` (bind variable not used) error and empty results on "all doctors" queries.
- Bumped its Redis cache key to `his:ref:doctors:v2:...` (from `his:ref:doctors:...`) to invalidate stale cached results after that fix, plus added debug logging of the executed query.

**Impact if not ported:** any hospital whose custom doctor-lookup SQL includes `:deptCode` will get errors/empty results in HDSP_HYBRID when querying "all doctors" (no department selected) — this is a live production bug fix, not a nice-to-have.

### 2.3 `billing.service.ts` — Oracle pagination syntax diverged (needs a decision, not a blind port)
HDSP paginates with the older `SELECT * FROM (...) WHERE ROWNUM <= :lim`; HDSP_HYBRID uses `FETCH FIRST :lim ROWS ONLY` (Oracle 12c+ syntax). Both branches changed this independently after the fork — it's unclear which is intentional-current vs. stale. `FETCH FIRST` is standard on any Oracle version hospitals are likely running, so HDSP_HYBRID's version is probably fine, but worth a quick confirmation with whoever changed it in HDSP before assuming HDSP_HYBRID is authoritative.

### 2.4 CMS module registration migration — missing
`backend/src/database/migrations/1785000000000-RegisterCmsModule.ts` exists in HDSP (as an uncommitted-but-real file) and inserts a `CMS` row into the `module_registry` table (`INSERT ... ON CONFLICT (code) DO NOTHING`). This migration does not exist in HDSP_HYBRID at all.

**Impact if not ported:** depending on how `module_registry` is read elsewhere (module listing/licensing UI), HDSP_HYBRID's CMS module may not appear correctly registered in that table. Low risk (idempotent, `ON CONFLICT DO NOTHING`) but should be added — HDSP_HYBRID's migration chain currently ends at `1783890000000-Task10TenantScopedUniqueConstraints.ts`, so this would need a new migration timestamped after that.

### 2.5 Token module — request validation hardening missing
`backend/src/modules/token/dto/token-payloads.dto.ts` (HDSP) defines typed `class-validator` DTOs — `CreateLocationDto`, `UpdateLocationDto`, `CounterActionDto`, `CallTokenDto`, `EnsureServiceCenterDto`, `IssueTokenDto`, and `ManualResetDto` (7 classes) — used as `@Body()` types in **both** `token.controller.ts` and `token/config/token-config.controller.ts`, giving real runtime validation (`@IsString`, `@IsNotEmpty`, etc.).

HDSP_HYBRID's controllers instead take untyped inline object literals (`@Body() body: { label: string }`, `@Body() body: { referenceType?: string; referenceId?: string } = {}`, etc.) with **no runtime validation** — a malformed request body is not rejected the way it is in HDSP. Confirmed in both controllers.

**Impact if not ported:** token endpoints in HDSP_HYBRID accept malformed/incomplete payloads that HDSP would reject with a 400. This is a validation regression relative to HDSP, independent of and compatible with HDSP_HYBRID's tenant-scoping work (`TenantContextInterceptor` is applied per-route via `@UseInterceptors` in HDSP_HYBRID's version — that part is fine and should stay) — safe to port directly alongside it.

### 2.6 Vendor Portal HIS-config default SQL template — needs a decision
`vendor-portal/frontend/.../hospitals/[id]/his-config/page.tsx`: the default doctor-lookup SQL shown in the config UI differs — HDSP's default has been edited to match one specific hospital's real Oracle schema (`employee`, `employeecategorymap`, `hisdepartment`, `emp_status = '75'`), while HDSP_HYBRID still ships the generic placeholder (`DOCTOR_MASTER`, `STATUS = 'A'`). This looks like a one-off site customization that leaked into the shared default rather than a deliberate template improvement — **recommend confirming with whoever made that change** before porting it verbatim, since baking one hospital's real table names into the default template would be wrong for every other hospital using this file.

### 2.7 Self-hosted installer — two divergent, non-overlapping approaches (needs a product decision)
This wasn't in the original pass — it only surfaced once the raw `git status` in HDSP showed an untracked `installer/` folder.

- **HDSP** (`installer/`) ships a **Windows-native, Docker-free installer**: an Inno Setup script (`HDSP.iss`, 317 lines) plus `build_installer.ps1`, that bundles a portable `node.exe`, `postgresql.zip`, `redis.zip`, `nssm.exe` (Windows service wrapper), and `vc_redist.x64.exe`, wired up by `scripts/config-generator.js`, `scripts/db-setup.js`, `scripts/health-check.js`, and `scripts/pdf-generator.js` (~815 lines of setup scripting total). This produces a single double-click `HDSP_Setup.exe` for on-prem hospital IT that has no Docker.
- **HDSP_HYBRID** (`infrastructure/installer/`) took a completely different route in Phase 12.4: a Linux/**docker-compose**-based self-hosted install (`install.sh`, `env.selfhosted.template`, `check-compatibility.js`).

These are not the same feature at different maturity levels — they're two different deployment strategies for two different environments (Windows-no-Docker vs. Linux-with-Docker), and neither is a superset of the other. **This needs a product decision**, not a mechanical port:
- If hospitals are actually being deployed via the Windows EXE today, the Docker-only self-hosted path in HDSP_HYBRID doesn't cover that deployment target at all, and the Windows installer assets/scripts should be carried over (adapted to install from HDSP_HYBRID's current schema/migrations, not HDSP's).
- If the docker-compose path is meant to fully replace the Windows installer going forward, then this isn't a gap to close — it's a documented, deliberate deprecation, and `HDSP/installer/` can be left behind on purpose.

Either way, flagging it here so it's a conscious choice rather than something that quietly falls off during reconciliation.

`Output/` (a leftover `mysetup.exe` build artifact) and the root `test.iss` (a 14-line Inno Setup scratch file testing an uninstall-form dialog) are incidental build byproducts of this installer work — no action needed on those specifically.

### 2.8 Debug/scratch files — ignore
- `backend/src/test-query.ts` — a throwaway one-off debug script (hardcoded IDs, `bootstrap()` calling a report lookup). Not real product code, no action needed.

## 3. Explicitly ruled out (looked like gaps, weren't)

- **CMS controllers (10 files) / `cms.module.ts`**: flagged by `git status` in HDSP as locally modified, but diffing content against HDSP_HYBRID shows it's purely HDSP_HYBRID's own `LicenseGuard` → `TenantContextInterceptor` + `@RequireModule` → `@RequireFeature` swap (Phase 11 work). HDSP_HYBRID is ahead here, not behind.
- **`packages/form-schema/*` (11 files)**: byte-identical between the two codebases (0-line diff). False positive from HDSP's own uncommitted `git status`, unrelated to HDSP_HYBRID.
- **`oracle-pool.service.ts`**: HDSP_HYBRID replaced the whole hand-rolled pool/circuit-breaker implementation with the extracted `@hdsp/oracle-client` package (Phase 6 Connector work) — a strict superset, not a gap.
- **Vendor Portal — cloud-tenants feature, hospitals/auth files, etc.**: all either identical or HDSP_HYBRID-only additions (Cloud Tenant Onboarding project). No vendor-portal file exists in HDSP that's missing from HDSP_HYBRID.
- **Nearly all `tenant_id`-related diffs across EIC/CMS/Feedback/Loyalty/Token/Attendance entities and services**: expected, one-directional additions from this project's own Tasks 1–10 (tenant scoping). Not gaps.

## 4. Reconciliation plan (priority order)

1. **Port the `reference.service.ts` `:deptCode` fix (§2.2)** — small, low-risk, fixes a real bug. Apply the same logic against HDSP_HYBRID's `IOracleTransport`-based `reference.service.ts` (the fix is transport-agnostic, no conflict with the Phase 7 Oracle-transport abstraction).
2. **Port the token DTO validation hardening (§2.5)** — copy `token-payloads.dto.ts` (all 7 DTO classes) into HDSP_HYBRID's `token/dto/`, swap the inline object types back to the typed DTOs in both `token.controller.ts` and `token/config/token-config.controller.ts`. No conflict with `TenantContextInterceptor`/`ObjectRepositoryService` wiring already present there.
3. **Add the CMS module-registry migration (§2.4)** — create a new migration (e.g. `1783900000000-RegisterCmsModule.ts`) with the same idempotent insert, appended after HYBRID's current last migration.
4. **Port the EIC auto-load-report feature (§2.1)** — the largest item. Needs the backend `hydrateLiveDrafts`/`hydrateLiveSection` logic re-applied on top of HDSP_HYBRID's tenant-scoped EIC entities/services (the EIC module already went through Task-list tenant-scoping in this codebase, so the ported logic needs to route through `TenantScopedRepository`/tenant context the way the rest of the EIC module now does, not through raw repositories the way HDSP's version does). Recommend a dedicated task rather than a quick copy-paste.
5. **Decide on `billing.service.ts` pagination syntax (§2.3)**, the **his-config default SQL (§2.6)**, and the **installer strategy (§2.7)** with whoever owns those changes/decisions in HDSP before porting — all three need a judgment call, not a mechanical merge. Note: HDSP_HYBRID's own Phase 12.4 was scoped as "docker-compose + installer," which suggests the docker-compose route was already the deliberate chosen path — worth a quick confirmation that the Windows EXE installer is genuinely being retired rather than still needed for a subset of hospitals.
6. **Normalize line endings** (`.gitattributes` with `* text=auto eol=lf` or similar) across both repos once reconciled, so future diffs aren't 2-3x inflated by CRLF/LF noise.
7. After merging, re-run the full-project syntax sweep (`ts.transpileModule()` over all `src/**/*.ts`) and, ideally, a real `npm run build` / `npm test` outside this sandbox to confirm nothing broke.

## 5. What was NOT reviewed in full depth

Given the size of the two codebases, this pass focused on identifying *which* files/directories carry real content differences (filtering out the CRLF noise and HDSP_HYBRID's own expected tenant-scoping work) rather than line-by-line reviewing every one of the ~250 backend files that still show as "different." The 8 items above are the ones confirmed, by direct content diff, to be real one-directional gaps or decisions needed. If you want, the EIC auto-load feature (§2.1, the largest item) can be broken into its own implementation task the same way the tenant-scoping work was.
