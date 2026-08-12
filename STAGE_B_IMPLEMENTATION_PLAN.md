# Stage B Implementation Plan — Hybrid Architecture, Tenant Foundation

**Companion to:** `STAGE_B_DESIGN.md` (v1.0-pending) — that document is the architectural baseline (objectives, resolution strategies, classification matrix, completion criteria). This document translates it into a sequenced, checkpoint-by-checkpoint execution plan, mirroring the discipline Stage A used (pre-flight → implementation → verification → deferred-work log per checkpoint), so `HYBRID_ARCHITECTURE_LOG.md` can track Stage B the same way it tracked A1–A13.

**B1 may proceed before B0 fully completes** (decision recorded 2026-07-14 — see below). B0 is no longer a hard gate; it tracks production validation and the point at which the design freezes as v1.0, running in parallel with B1 onward.

**Governance update (2026-07-15) — continuous implementation from B4 onward:** B3.1–B3.8 established the per-checkpoint pre-flight → review → implement → document cadence and proved the resolver model stable (four strategies, closed since B3.8's review — see `HYBRID_ARCHITECTURE_LOG.md`). Per explicit user decision, B4 through B12 now proceed continuously, without a stop-and-review pause between checkpoints — pre-flight, implementation, and doc updates happen in the same pass. The only thing that pauses the sequence is a true architectural blocker (a new resolver category, an unresolved Global/Shared Resource Policy question, or a finding that contradicts an already-documented governance rule). The per-module "Awaiting Integration Verification" gate and the "single end-of-stage consolidated pass" referenced throughout B3.x are consolidated into **one comprehensive Phase 1 verification pass**, run once the branch reaches the office environment, covering all of Stage A (A1–A13) and Stage B (B1–B12) together. Phase 1 is marked **COMPLETE** only after that pass succeeds. Phase 2 (Infrastructure Abstraction) then begins with a single pre-flight and continuous implementation, the same reduced-overhead cadence.

---

## B0 — Production Validation & Architecture Freeze (parallel track, not a build blocker)

*Renamed from "Prerequisite Gate" on 2026-07-14. Original framing required B0 fully closed before B1 could start; that requirement is now relaxed — see decision note below.*

**Goal:** confirm the two items identified in the design doc's closing section are closed, not just scheduled.

1. Run the full §9 cumulative integration verification pass in the office environment. Mark A7/A8/A9/A11/A12/A13 ✅ complete in the tracker only after it passes. **Still outstanding — proceeding in parallel with B1+, not blocking it.**
2. ~~Resolve the §4 Global/Shared Resource Policy for every Category A and Category B table~~ — **done (2026-07-14).** All 8 tables decided: 7 converted to normal tenant-owned population (`CardCategory`, `RewardCatalog`, `AttendanceRule` → B3.2/B4; `DisplayPage` → B3.5; `CMSEmergencyBroadcast` NULL-branch rows, `AttendanceGovernanceLock` scope=ALL, `AttendanceDependencyEvent` scope=GLOBAL/CONFIG → B3.4/B4, preserving their "global" semantic as an app-level scope/flag rather than a null tenant); `FeedbackLanguage` stays permanently global (`tenant_id` stays `NULL` by design, excluded from B9-B11). See `STAGE_B_DESIGN.md` §4 and the corresponding `HYBRID_ARCHITECTURE_LOG.md` entry for full rationale.
3. Promote `STAGE_B_DESIGN.md` to v1.0 once item 1 is done too, per the governance convention already recorded in the log. Until then it stays v1.0-pending — Stage B proceeds under an explicit assumption that Stage A behaves as designed, accepting a small, consciously-carried amount of technical risk.

**Exit criteria (for the v1.0 freeze specifically, not for starting B1):** verification pass green (outstanding), §4 policy documented (done — see item 2 above).

**Decision to decouple B0 from B1 (2026-07-14):** development of B1–B12 may proceed before B0's verification item completes. If production validation later uncovers defects in Stage A (migration ordering issues, a missed repository update, a DTO leak, a raw-SQL bug, a migration rollback issue), these are treated as ordinary implementation bugs and corrected without invalidating the Stage B architecture — *unless* the issue exposes a fundamental design flaw (e.g. a pattern misclassification that changes which resolver a module needs), in which case it's handled as a versioned design-doc update (§ governance convention), not a silent patch. Current state:
- Stage A implementation: **Complete** (code written, A1–A13).
- Stage A architecture/design: **Complete.**
- Stage A production verification: **Pending** (parallel track, not a blocker).
- Stage B: **Proceeding**, under the explicit assumption above.

---

## B1 — Tenant Resolution Infrastructure (shared plumbing, no write-path changes yet) — ✅ IMPLEMENTATION COMPLETE (2026-07-14)

**Goal:** build the three resolvers from §3 as standalone, testable primitives before wiring them into any module. This is infrastructure, not a module migration — nothing in this checkpoint changes existing behavior.

- **Session-derived resolver:** ✅ `SessionTenantResolver.resolve(principal?)` in `modules/platform/tenant/resolvers/session-tenant.resolver.ts`. Built as a plain stateless method taking an already-resolved principal, not a `Scope.REQUEST` provider (no existing precedent for that pattern in this codebase) — actual request wiring (pulling `req.user`) deferred to B2's interceptor.
- **Oracle-derived resolver hook:** ✅ `OracleTenantResolver.resolveForBranch(intraBranchId)` in `modules/platform/tenant/resolvers/oracle-tenant.resolver.ts`. Standalone, zero consumers — `RosterResolver` itself is untouched; B4 will call this from outside it.
- **Chain-derived resolution helper:** ✅ `ChainTenantResolver.resolveForKnownBranch(branchId)` in `modules/platform/tenant/resolvers/chain-tenant.resolver.ts`. Zero consumers — B5 will call this from `FeedbackPublicController` and Token's kiosk/workstation paths.

All three currently resolve to the seeded `'default'` tenant regardless of input (no branch→tenant mapping table exists yet; deferred to Phase 10 provisioning) — call sites added in B4/B5 will never need to change when that lookup is added.

**Verification:** ✅ 7 unit tests passing (`modules/platform/tenant/__tests__/tenant-resolvers.spec.ts`) against the seeded `'default'` tenant; no module wiring yet, so no integration risk. Full detail, including a sandbox tooling caveat unrelated to code correctness, in `HYBRID_ARCHITECTURE_LOG.md`'s B1 entry.

---

## B2 — Repository/Read-Side Enforcement Mechanism — ✅ IMPLEMENTATION COMPLETE (2026-07-14)

**Goal:** build the single enforcement seam — a repository wrapper, not a subscriber and not in-place base-repository replacement (rejected in pre-flight: TypeORM 0.3 subscribers can't inject `WHERE` clauses into `find()`; an in-place swap would mean touching every module in B2 itself). Build and test in isolation; **nothing enabled, no module touched** — B3 is where individual modules opt in.

**Design, revised per pre-flight review before implementation:**
- `TenantScope` interface (`context/tenant-scope.interface.ts`) — `currentTenantId()` / `isSystemScope()`. The repository layer depends only on this; it never imports `AsyncLocalStorage`, sessions, JWTs, or any specific module.
- `TenantContextStorage` (`context/tenant-context-storage.ts`) — `AsyncLocalStorage`-backed `TenantScope` implementation. `run(tenantId, fn)`, `runAsSystem(fn)` (the sole, explicit bypass — no silent flags), `hasContext()`.
- `TenantContextInterceptor` (`context/tenant-context.interceptor.ts`) — populates `TenantContextStorage` per request via B1's `SessionTenantResolver`. Not registered as a global `APP_INTERCEPTOR`; opt-in per controller in B3.
- `TenantScopedRepository<T>` (`repositories/tenant-scoped.repository.ts`) — wraps `Repository<T>`. Covers `find`/`findBy`/`findOne`/`findOneBy`/`count`/`exist`/`update`/`delete`/`softDelete`. **Deliberately excludes `save`/`insert`/`upsert`** — write-path stamping is B6's job, not B2's (pre-flight change #2). `createQueryBuilder()` is always scoped, with no unscoped path reachable under that name (pre-flight change #1); an unscoped query builder is only reachable via the separately-named, greppable `createSystemQueryBuilder()` or by being in system scope. Built-in dry-run mode (`mode: 'dry-run'`) logs a before/after row-count comparison for `find()` — this is what B2.5 turns on, so B2.5 is pure configuration.
- `getTenantScopedRepositoryToken(Entity)` / `createTenantScopedRepositoryProvider(Entity)` (`repositories/tenant-scoped-repository.provider.ts`) — DI plumbing a module adds to its own `providers` array in B3. Kept as a distinct token from the raw repository's own token so a module can hold both during migration rather than an all-or-nothing swap.

**Verification:** 28 unit tests across 4 spec files, all passing — `TenantContextStorage` (context propagation across async continuations, nested runs, system-scope throw behavior), `TenantContextInterceptor` (resolves and establishes context before invoking `next.handle()`), `TenantScopedRepository` (every enforced method scopes correctly, system-scope bypass, `createSystemQueryBuilder()` bypass, dry-run mode returns the unfiltered result unchanged while logging a deliberately-engineered mismatch case). Zero modules changed; zero controllers, guards, or services reference any B2 class as of this checkpoint.

---

## B2.5 — Tenant Enforcement Dry Run — MERGED INTO B3 (2026-07-14, decision below)

**Original plan:** a standalone checkpoint running B2's dry-run mode across every Pattern 1 table before any module adopted real enforcement.

**Revised (2026-07-14):** dropped as a standalone checkpoint. Rationale: with zero modules using `TenantScopedRepository` yet, a global dry-run pass would only prove "the logger logs" (already covered by B2's 28 unit tests), not "real application queries would have been filtered correctly" — there's no real traffic exercising the infrastructure until a module actually adopts it. Dry-run mode is more valuable, and produces meaningful evidence, once it's observing genuine application behavior.

Dry-run is therefore folded into **every individual module's B3 rollout** as its mandatory first phase, not run once globally:

```
Module
  │
  ▼
Phase 1 — construct TenantScopedRepository(mode: 'dry-run'),
          wire TenantContextInterceptor on that module's controllers,
          deploy, observe real traffic
  │
  ▼
Review dry-run logs — any mismatch blocks progress, root-cause before continuing
  │
  ▼
Phase 2 — flip to mode: 'enforced'
  │
  ▼
Verify (per-module gate, same shape as Stage A's)
  │
  ▼
Next module
```

This preserves B2.5's original safety property (catch a resolution gap or missed raw-SQL site before it becomes a real filtering bug) while making the dry-run window's data meaningful. Each module's B3.x entry below states "Phase 1 / Phase 2" explicitly rather than assuming a prior global dry-run pass.

---

## B3 — Write-Path Population: Pattern 1 Modules (session-derived, the majority)

**Goal:** wire B1's session-derived resolver into every Pattern 1 write path, one module at a time, dry-run phase first per the B2.5 merge above. Enable B2's read-side enforcement (Phase 2) immediately after each module's dry-run window comes back clean — don't let population and enforcement drift apart within a module, and don't skip straight to enforced mode without a dry-run window's worth of real evidence.

**Scoping rule (2026-07-14): B3 covers read-side tenant enforcement on request-scoped code paths only.** `TenantContextInterceptor` populates `AsyncLocalStorage` for the duration of one HTTP request — any module whose persistence occurs exclusively inside an asynchronous worker (a BullMQ `@Process()` handler, a `@Cron()` job) bypasses B3 entirely and is implemented in B6, because request-scoped tenant context no longer exists once work leaves the HTTP pipeline. This is not a special case for any one module — it's a general rule, and any future module discovered to be background-only follows the same path. Audit (`audit_logs`) is the first confirmed example: `AuditService.log()` only enqueues a job; `AuditProcessor` (a Bull worker, not a controller) performs the actual write, with no `AuditController`/HTTP surface at all (confirmed at A5.5 and re-confirmed in this pre-flight) — nothing for B3's read-enforcement mechanism to attach to. Audit's tenant handling moves to B6 alongside the codebase's other 8 background jobs.

**B3 Eligibility Rule (formalized 2026-07-14; refined 2026-07-15 during B3.5's review to retire the old test 3; refined again 2026-07-15 during B3.6's review to be about resolver availability rather than "HTTP request-scoped").** What began as "convert reads" is now a single test about whether a tenant can actually be resolved in a given execution context, applied to every remaining B3.x module without re-deriving it each time:

> A repository read method is eligible for **B3** conversion only if **every call site executes in a context where a tenant can be deterministically resolved using the resolver strategy assigned to that context, and that strategy is `SessionTenantResolver`.** A call site reachable from a context assigned to a different resolver (or no resolver yet) disqualifies the whole method from B3 — it belongs to whichever stage owns that resolver instead.
>
> **Execution Context Classification (revised 2026-07-15, B3.6) — the contexts are now named by *how* a tenant is obtained, not by when they were historically discovered:**
>
> | Context | Resolver | Stage |
> |---|---|---|
> | Authenticated HTTP (`request.user` carries a principal) | `SessionTenantResolver` | **B3** |
> | Anonymous/public HTTP (slug, token, branch param, etc. — no session) | `ChainTenantResolver` | **B5** |
> | Oracle/HIS-derived execution | `OracleTenantResolver` | **B4** |
> | `@Cron` / BullMQ `@Process` / detached async / CLI / startup / seed | explicitly captured tenant carried through the job payload, or `TenantContextStorage.runAsSystem()` | **B6** |
>
> ```
> Every call site is Session-resolved (authenticated HTTP)         → TenantScopedRepository → B3
> Any call site is Anonymous/Chain-resolved                        → leave raw            → B5
> Any call site is Oracle/HIS-derived                               → leave raw            → B4
> Any call site is Cron/BullMQ/detached-async/CLI/startup           → leave raw            → B6
> ```

This is a re-centering, not just a rename. The previous wording ("every call site executes within the same request-scoped HTTP context") was tested against CMS's public player routes and found insufficient — an anonymous player request *is* technically HTTP request-scoped, so the old test 1 didn't actually exclude it, even though `SessionTenantResolver` cannot correctly resolve a tenant for it (it silently falls back to `'default'`). The real question was never "is this HTTP," it's "does this context have a resolver that can get the right answer." Framing the four contexts by their resolver make this explicit and gives every future B3.x pre-flight (and B4/B5/B6 themselves) one consistent vocabulary — **session-resolved, chain-resolved, Oracle-resolved, system/background** — instead of re-deriving "is this safe" per module. B3.5's retirement of the old test 3 (write-adjacent reads staying eligible as long as every call site is itself session-resolved) still holds under this framing without restatement — it was never in tension with resolver-availability, only with the literal "HTTP" wording.

**Terminology note:** what B3.4/B3.5/early B3.6 called "BACKGROUND-ONLY" is the System/background row above; what B3.6 initially called "PUBLIC/ANONYMOUS — Pattern 3" is now **Chain-resolved execution (B5)** — a first-class, permanent architectural category rather than a temporary bucket, per explicit instruction. Existing pre-flight write-ups for B3.1–B3.5 are not retroactively relabeled (their findings are unchanged, only this section's vocabulary going forward is), but every pre-flight from B3.6 onward uses the resolver-based names directly.

This single rule now explains three previously-separate findings without re-deriving any of them:
- **B3.1 (Audit):** failed test 1/2 entirely — no HTTP surface at all, pure Bull worker. Whole module → B6.
- **B3.2 (Licensing):** failed test 1 — reads shared across `LicenseGuard` (app-wide), cron jobs, and multiple controllers. Whole module deferred (not cleanly B6, since some cross-cutting consumers are themselves HTTP-scoped — see B3.2's own note on this still being an open question).
- **B3.4 (Loyalty):** the first case where the rule operates *within* a single module rather than excluding it wholesale — `getAccountById`/`getAccountByMrn`/`getAccountByCard` fail test 2/3 (also reached from a `@Cron` job, an HIS-sync path, and a `@Process` handler respectively) while eight sibling read methods on the same entities pass cleanly. This is the rule's most precise application yet: not "is this module safe," but "is this specific method safe," on a per-method basis.

Going forward, each remaining B3.x pre-flight should apply this resolver-based test (and the Execution Context Classification) directly rather than reasoning about it from scratch.

**Standing B3 implementation checklist (added 2026-07-15, from B3.6's mixed-controller finding) — applies to every remaining checkpoint, not just modules with public surfaces:**
1. Cache audit first (Redis, `CacheManager`, in-memory singletons, anything that can return an object without passing through `TenantScopedRepository`).
2. Execution Context Classification per method (session-resolved / chain-resolved / Oracle-resolved / system-background).
3. Repository read inventory against the Eligibility Rule.
4. Shared-helper sweep (reads reused by publish/maintenance/diagnostic/write helpers).
5. **Don't stop at GET methods when deciding interceptor placement.** Inspect every write method for internal calls to a now-scoped read (e.g. `update()`/`remove()` calling `this.findOne()` as a write-adjacent existence check). `TenantScopedRepository`'s dry-run branches call `TenantContextStorage.currentTenantId()` unconditionally for their comparison log (except system scope) and *throw* with no established context — so a write route reaching a scoped method without the interceptor doesn't silently no-op, it breaks the endpoint. On any controller that mixes session-resolved and chain-resolved (or otherwise non-B3) routes, apply the interceptor per-route, covering every route whose call chain — read or write — touches a scoped repository, and no others.

**Exclusion Reason Classification (added 2026-07-15, at B3.7's review) — every method excluded from B3 now gets one of these five explicit reasons, not just a bare "not eligible":**

| Reason | Stage |
|---|---|
| Session resolver available | **B3** |
| Chain resolver required | **B5** |
| Oracle resolver required | **B4** |
| Background/system execution | **B6** |
| Permanently global (Shared-global ownership, not Tenant-owned) | **Never — remains global** |

This is a bookkeeping refinement, not a new rule — every B3.1–B3.7 exclusion so far already maps cleanly onto one of these five rows (e.g. `FeedbackLanguage` → permanently global, `CmsAssetCleanupService.purgeOlderThan()` → B6, `CmsDisplayService.findBySlug()` → B5). Going forward, pre-flight write-ups should tag each excluded method with its row explicitly rather than lumping everything under "chain-resolved" or "out of scope."

**Platform Backlog — Tenant-aware caching (elevated 2026-07-15, from a module backlog item to a Stage B platform concern).** First raised at B3.5 (EIC's Redis cache on `findById`/`findByMrn`), confirmed clean (no caching layer) at B3.6 (CMS), and confirmed again — a third independent instance — at B3.7 (Feedback's in-memory TTL cache on `FeedbackSettingsService.get()`). Three independent modules surfacing the same shape (a read-through cache sitting in front of a `TenantScopedRepository`, capable of returning an object without ever reaching enforcement) is enough evidence this is not a module-local bug to patch inline — it's a platform-level gap that needs one shared design before B9 (enforcement rollout) reaches any cached module. **Not solved inside any individual B3.x module.** Candidate approaches, to be evaluated as their own checkpoint ahead of B9: tenant-prefixed cache keys, a tenant-aware cache wrapper around `TenantScopedRepository`, bypass-the-cache-while-`mode:'enforced'`, or cache-only-already-tenant-filtered-objects. Every future B3.x pre-flight should still note whether a module has a caching layer (per the standing checklist's step 1) so the eventual platform fix has a complete inventory of affected call sites — but should stop short of attempting a per-module fix.

**Module order — revised (2026-07-14) to start with the lowest-risk module rather than grouping all A2–A5 tables into one step.** Explicitly *not* starting with Users/RBAC — central to the whole application, better attempted once the resolver + enforcement pair has already proven itself elsewhere:

1. **B3.1 — Notification** (A5 tables: `notification_logs`, `notification_templates`). `NotificationController` is a synchronous, `JwtAuthGuard`-protected controller with real `GET` endpoints (`/notifications/logs`, `/notifications/logs/:id`, `/notifications/templates`, `/notifications/templates/:id`) — the textbook shape B3's mechanism was designed around. **This is the pilot module and reference implementation for every subsequent Pattern 1 module** — see its explicit success criteria below. (`audit_logs`, originally grouped here, moved to B6 per the scoping rule above — it has no controller for `TenantContextInterceptor` to attach to.)
2. **B3.2 — Licensing — ⛔ DEFERRED (2026-07-14), see finding below.**
3. **B3.3 — Users / RBAC** (A4 tables: `users`, `roles`, `permissions`, `password_reset_requests`). Deliberately sequenced *after* B3.1/B3.2, once the infrastructure is proven — not the first module, given how central it is.
4. **B3.4 — Loyalty** (A7 tables, including `CardCategory`/`RewardCatalog` — §4 resolved both to tenant-owned, no longer exceptions). Includes the two cron/queue-triggered `LoyaltyTransaction` write paths — resolve tenant from the parent account, not request context, per the design doc's explicit note. *(Per the scoping rule above: if any of Loyalty's write paths turn out to be background-worker-only like Audit, that portion moves to B6 rather than being forced into this checkpoint.)*
5. **B3.5 — EIC** (A8, all 16 tables — clean join-only chain, no exceptions).
6. **B3.6 — CMS** (A11 tables; `CMSEmergencyBroadcast`'s branchId=NULL rows are §4-resolved to populate `tenant_id` normally — no longer excluded, "global" is preserved as an app-level branchId check within the tenant). Watch `CMSDisplayAssignment`'s high-frequency heartbeat write path for performance impact from enforcement.
7. **B3.7 — Feedback, Pattern 1 portion** (A12 tables except `FeedbackSubmission`, `FeedbackAnswer`, `FeedbackComplaint`'s public-create path, and `FeedbackAuditLog`'s `'public'`-actor rows — those wait on B5). `FeedbackLanguage` is excluded permanently, not just deferred — §4 resolved it to stay global forever, so it never gets write-path population at all.
8. **B3.8 — Token, Pattern 1 portion** (A13 tables except `TokenRecord`, `TokenReservation`, `TokenKiosk`'s public path, `WorkstationConfig`, `MappingAuditLog`'s system-actor rows — those wait on B5). Includes `DisplayPage` (§4-resolved to tenant-owned, no longer an exception). Do not touch `TokenSequence`'s concurrency-critical unique constraint.

**Order reversal (2026-07-15):** per explicit instruction, B3.7/B3.8 are implemented Feedback-then-Token (reversed from this list's original Token-then-Feedback numbering) to minimize architectural risk — Feedback has one clean chain-resolved surface (`FeedbackPublicController`) and validates the now-mature resolver-based rule once more before it's applied to Token, the most complex module in the app (Pattern 1 + Pattern 3 + realtime counters + sequences + reservations + analytics + display pages + Oracle-derived branch info + the known `manualResetSequences` bug). The B3.7/B3.8 *numbering* above still matches the table names each checkpoint owns; only the *implementation order* is reversed.

*(Downstream references to "B3.2 Loyalty" / "B3.4 CMS" / "B3.5 Token" elsewhere in this document and in `HYBRID_ARCHITECTURE_LOG.md` predate this renumbering — they refer to the same modules, now B3.4 / B3.6 / B3.7 respectively.)*

**B3.2 (Licensing) — deferred, second B3 scoping rule established (2026-07-14):**

Pre-flight traced every read path on all four originally-scoped tables before touching anything, and found none of them have fully controller-local reads:
- `LicenseMaster` — `LicenseService.getStatus()`/`refreshCache()`/`isModuleLicensed()` are called by `LicenseGuard` (applied via `@RequireModule(...)` across many controllers app-wide, including `NotificationController` itself), by Attendance's cron/queue jobs, the HIS-sync scheduler, and Token's WebSocket gateway (none HTTP-request-scoped at all), plus health checks and the global exception filter. Only `getHistory()` (`GET /license/history`) is genuinely local to `LicenseController`.
- `VendorRegistration` — `getRegistration()` is called from `auth/password-reset.service.ts`, `auth/setup.controller.ts`, and `vendor-administration/guards/vendor-hmac.guard.ts` — three call sites entirely outside `LicenseController`, none interceptor-covered.
- `LicenseRequestEntity` — looked clean at first, but `listRequests()` is also called from `auth.controller.ts`.
- `HisSchemaConfig` — same shape as Audit (B3.1's finding): `getConfig()` has zero HTTP read surface at all, consumed internally by HIS-integration services including several background jobs. Arguably not tenant data in the first place — Oracle schema mapping is per-installation, not per-tenant, closer to a Category-A global table than an oversight.

**Second B3 scoping rule, parallel to B3.1's async-worker rule:** a read method is only a safe B3 candidate if it's consumed exclusively from within the one controller receiving `TenantContextInterceptor`. If a repository's reads are shared across other controllers, guards applied elsewhere in the app, or background jobs — any lacking that interceptor — converting it risks a `TenantContextStorage.currentTenantId()` "no context established" crash on unrelated endpoints the moment enforcement (or even dry-run's comparison query) runs.

**Decision:** B3.2 skipped entirely rather than partially implemented. `license_master`, `license_requests`, `vendor_registrations`, `his_schema_configs` are not reclassified to B6 (they're not background-worker-only the way Audit is — several of their cross-cutting call sites are themselves HTTP-request-scoped, just on different controllers) — they remain an open question, revisited once there's a clear home for "shared/cross-cutting reads consumed from multiple controllers," which the current B0–B12 checkpoint list doesn't yet have a slot for. Proceeding directly to B3.3 (Users/RBAC).

**B3.1 (Notification) status (2026-07-14):**
```
Implementation  ✅ complete
Verification    ✅ complete — office-environment runbook passed cleanly
Promotion       ✅ unblocked — B3.2 may proceed
```

**Verification runbook (completed 2026-07-14) — this is the reference sequence every subsequent B3.x module repeats:**
1. ✅ Deploy this branch.
2. ✅ Dry-run mode confirmed on for both repositories, exercised against real traffic.
3. ✅ Exercised every Notification `GET` endpoint (`/notifications/logs`, `/notifications/logs/:id`, `/notifications/templates`, `/notifications/templates/:id`) under normal usage.
4. ✅ Dry-run logs reviewed and confirmed clean: tenant correctly detected on every request; zero false mismatches; no unexpected system-scope bypasses; pagination and counts identical to unfiltered behavior.
5. ✅ Both repositories flipped to `mode: 'enforced'` in `notification.module.ts` (2026-07-14).
6. ✅ Same four endpoints repeated under enforced mode.
7. ✅ Responses confirmed identical to the dry-run baseline — no unexpected narrowing or widening.

B3.1 is now **complete end-to-end**: the first module in this codebase with live tenant-scoped read enforcement. See `HYBRID_ARCHITECTURE_LOG.md`'s B3.1 completion entry for full detail. B3.2 (Licensing) may now begin.

**What was built, then verified end-to-end (2026-07-14):**
- `TenantContextInterceptor` applied via `@UseInterceptors(TenantContextInterceptor)` on `NotificationController` only — no other controller touched, no global interceptor.
- `createTenantScopedRepositoryProvider(NotificationLog, { mode: 'enforced' })` / `createTenantScopedRepositoryProvider(NotificationTemplate, { mode: 'enforced' })` in `notification.module.ts`'s `providers`, alongside (not replacing) the existing raw `TypeOrmModule.forFeature([NotificationLog, NotificationTemplate])` repositories — started in `mode: 'dry-run'`, flipped to `'enforced'` after the runbook passed.
- Only `NotificationService`'s four GET-backing methods (`findLogs`, `findLogById`, `findTemplates`, `findTemplate`) switched to the injected `TenantScopedRepository` instances. Every write path (`send`, `resend`, `createTemplate`, `updateTemplate`, `markSent`, `markFailed`, `incrementAttempts`) and the internal `findTemplateForEvent` read still use the original raw repositories, untouched.
- `TenantScopedRepository.findAndCount()` added (was missing from B2's original method list — `findLogs()`'s pagination needed it) — same predicate-injection and dry-run-comparison shape as every other read method, with its own unit tests.
- **Canonical tenant-isolation test** (`tenant-enforcement-canonical.spec.ts`, per the user's explicit request): real `TenantContextStorage` + `TenantScopedRepository` in `mode: 'enforced'` against an in-memory two-tenant fixture (Template A / Tenant A, Template B / Tenant B) — confirms a Tenant A request only ever sees Template A, a Tenant B request only ever sees Template B, cross-tenant read-by-ID returns null, and system scope sees both. This is the template every later B3.x module should copy.
- 35 unit tests total across the tenant module (7 new/updated this checkpoint), all passing. A full `tsc --noEmit` of `notification.module.ts`/`notification.service.ts`/`notification.controller.ts` and their transitive imports compiles clean.
- Zero other modules touched: Audit, Loyalty, Feedback, Users, RBAC, Token, Attendance untouched, per the explicit B3.1 boundary.
- Office-environment runbook (steps 1–7 above) executed and passed cleanly — dry-run showed zero mismatches, enforced-mode responses matched the dry-run baseline exactly.

**Verification per module (both phases):** Phase 1 exit criteria — zero unexplained dry-run mismatches across a real traffic window. Phase 2 exit criteria — new rows populate `tenant_id` correctly, enforcement doesn't leak or over-restrict, existing admin flows are unaffected. Same shape as Stage A's per-checkpoint verification gate, just checking write+read behavior instead of schema shape. **B3.1 met both — it is verification-complete, not just code-complete.**

**B3.3 (Users/RBAC) status (2026-07-14):**
```
Implementation  ✅ complete (dry-run mode)
Verification    ⏳ pending — office-environment runbook not yet run
Promotion       ⛔ blocked — B3.4 (Loyalty) may not start until B3.3 verification completes
```

**B3.3 pre-flight findings:**
- `UsersService.findAll()`/`findOne()` (`GET /users`, `GET /users/:id`) are fully controller-local — safe.
- `UsersService.findByHisEmployeeCode()` is called from `auth.service.ts` and `his.controller.ts`, outside `UsersController` — **excluded**, stays on the raw repository.
- `RolesService.findAll()`/`findOne()` and `PermissionsService.findAll()` have zero cross-cutting consumers anywhere in the codebase (confirmed via grep) — fully safe, clean controller-local conversion.
- `PermissionsService.findOne()` is unused by any controller — left untouched, out of scope.
- `PasswordResetService.listRequests()` (`GET /auth/password-reset-requests`) is the only live GET-backing method on `PasswordResetRequest`; it is safe once `AuthController`'s one relevant route carries the interceptor.
- `PasswordResetService.expireStaleRequests()` is a `@Cron("0 */15 * * * *")` job — **second B6 candidate alongside Audit**, per the async-worker scoping rule established at B3.1. Not touched in B3.3.
- **New refinement:** `TenantContextInterceptor` applied at the **method level** (not class level) on `AuthController`, on just the `password-reset-requests` GET route — this controller mixes many public/login routes (`login`, `his-login`, `widget-*`, `forgot-password`, `setup-*`) with the one sensitive admin route, so class-level coverage would have been unnecessarily broad. `UsersController` and `RbacController` keep class-level application (100% their own business, no mixed public surface, matching B3.1's pattern).

**What was built (2026-07-14):**
- `TenantContextInterceptor` applied class-level on `UsersController` and `RbacController`; method-level on `AuthController.listPasswordResetRequests()` only.
- `createTenantScopedRepositoryProvider(User, { mode: 'dry-run' })` in `users.module.ts`; `createTenantScopedRepositoryProvider(Role, { mode: 'dry-run' })` and `createTenantScopedRepositoryProvider(Permission, { mode: 'dry-run' })` in `rbac.module.ts`; `createTenantScopedRepositoryProvider(PasswordResetRequest, { mode: 'dry-run' })` in `auth.module.ts` — all alongside (not replacing) the existing raw repositories.
- `UsersService.findAll()`/`findOne()`, `RolesService.findAll()`/`findOne()`, `PermissionsService.findAll()`, `PasswordResetService.listRequests()` converted to the injected `TenantScopedRepository` instances. Every write path across all four services, `findByHisEmployeeCode()`, and `expireStaleRequests()` remain on the original raw repositories, untouched.
- `tsc --noEmit` targeted compile of `rbac/`, `users/`, `auth/`, `platform/tenant/` confirmed clean. The canonical tenant-isolation test (`tenant-enforcement-canonical.spec.ts`) re-run and passing (5/5) — full jest suite run was not completed in the sandbox this session (intermittent sandbox timeouts unrelated to code correctness); full suite + `tsc` should be re-run as part of the office-environment verification pass, per the same "Environment note" pattern documented at B1/B2/B3.1.
- Zero other modules touched: Audit, Loyalty, Feedback, Token, Attendance untouched, matching the B3.1 boundary discipline.

**Not yet done:** the office-environment verification runbook (dry-run traffic review → flip to `mode: 'enforced'` → re-verify identical responses), mirroring B3.1's 7-step sequence.

**Governance update (2026-07-14) — per-module Verification gate relaxed to a single end-of-stage pass.** Originally: no module proceeds to implementation until the prior module's Verification is ✅ (established at B3.1, applied to block B3.4 behind B3.3). Revised: implementation may now continue sequentially across all remaining B3.x modules (B3.4 Loyalty → B3.5 EIC → B3.6 CMS → B3.7 Token → B3.8 Feedback) without waiting on each module's individual office-environment verification runbook. All modules stay in `mode: 'dry-run'` throughout this implementation run — dry-run is zero-behavior-change by construction (confirmed and regression-tested after the earlier `TenantScopedRepository` bug), so stacking multiple modules in dry-run carries materially less risk than stacking multiple modules in enforced mode would. **Verification (the full runbook: exercise real traffic → review dry-run logs for zero mismatches → flip to `mode: 'enforced'` → re-verify identical responses) is deferred to a single consolidated pass run once every B3.x module's implementation is complete**, rather than repeated per module. Promotion for each module is granted at that final consolidated pass, not incrementally. This mirrors the B0 governance update's earlier acceptance of "a small amount of technical risk" to keep development moving in parallel with a verification step that has to happen in the real office environment.

Each module's Implementation status is still tracked individually and must still be marked ✅ complete (dry-run) with its own pre-flight findings documented, exactly as before — only the Verification/Promotion gate between modules is relaxed. B3.3 (Users/RBAC/Auth) itself remains Verification ⏳/Promotion ⛔ under the old individual-gate language above; that status is superseded by this update — B3.3 is not being re-blocked, its implementation was already complete, and B3.4 may now begin.

**Bug found and fixed during this window (2026-07-14):** the reported live symptom — `POST /api/v1/users` returning `404 User not found` immediately after a successful create, then `409 username already exists` on retry — traced to `TenantScopedRepository`. Only `find()`/`findAndCount()` ever checked `this.mode === 'dry-run'` before enforcing; every other method (`findOne`, `findOneBy`, `findBy`, `count`, `exist`, `createQueryBuilder`, `update`, `delete`, `softDelete`) enforced unconditionally regardless of the provider's configured mode. Since write-path `tenant_id` stamping is deferred to B6, every row today has `tenant_id = NULL` — `UsersService.create()` calls `this.findOne(saved.id)` right after saving, and the enforced-regardless-of-mode `findOne()` filtered the new NULL-tenant row out entirely. Fixed in `tenant-scoped.repository.ts` so every method now honors `mode` the same way `find()`/`findAndCount()` already did; 9 new regression tests added (20/20 passing). Full detail and blast-radius assessment in `HYBRID_ARCHITECTURE_LOG.md`'s dedicated bug-fix entry. This fix must be included in B3.3's still-pending verification runbook.

**B3.4 (Loyalty) pre-flight (2026-07-14) — prepared ahead of B3.3's Promotion so implementation can start the moment B3.3 clears; NOT started yet, per the standing no-skip-ahead rule.**

Controllers: `LoyaltyController` (`loyalty.controller.ts`, guards `JwtAuthGuard, PermissionsGuard, LicenseGuard`, no interceptor yet) and `CampaignController` (`campaign/campaign.controller.ts`, same guard stack, no interceptor yet). No dedicated card-config controller — those routes live inside `LoyaltyController`.

**SAFE — controller-local only, convert to `TenantScopedRepository`:**
- `CardConfigService.findAll()`/`findOne()` (card-config GET + used internally by `update()`, HTTP-only)
- `EnrollmentService.listAccounts()` (`GET /loyalty/accounts`)
- `TransactionService.getTransactions()` (`GET /loyalty/transactions`)
- `RedemptionService.getCatalog()` (`GET /loyalty/catalog`)
- `RedemptionService.getRedemptions()` (`GET /loyalty/redemptions`)
- `CampaignService.findAll()`/`getActiveCampaigns()`/`findOne()` (campaign GETs; `findOne()` is also reused by `update()`/`setActive()`, but only reachable via `CampaignController`'s own PATCH routes — the cron job `deactivateExpired()` does not call it)

**UNSAFE — cross-cutting, excluded per the B3.2 rule (consumed outside the one interceptor-carrying controller):**
- `EnrollmentService.getAccountById()` — also called from `TransactionService.postCampaignBonus()`, reachable only from `CampaignScheduler.runBirthdayCampaign()` (`@Cron`, no HTTP context).
- `EnrollmentService.getAccountByMrn()` — also called from `TransactionService.reverseFromBill()`/`adjustFromBill()`, reached via `HisSyncService`, itself invoked from both `his-sync.controller.ts` (a different controller, no interceptor) and a `@Cron` scheduler.
- `EnrollmentService.getAccountByCard()` — also reached via `resolveAccount()` → `TransactionService.earnFromBill()`, which is called both from `LoyaltyController.earnPoints` (HTTP) **and** `LoyaltyProcessor.handleEarnFromBill()`, a `@Process('earn-from-bill')` BullMQ handler (no request context).
- Net effect: `GET /loyalty/accounts/mrn/:mrn`, `GET /loyalty/accounts/card/:cardNumber`, `GET /loyalty/accounts/:id`, `GET /loyalty/accounts/:id/discount` all stay on the raw repository this checkpoint — narrower than B3.1's pilot cut, similar in shape to B3.2/B3.3's partial exclusions.

**BACKGROUND-ONLY — confirmed present, deferred to B6 per the async-worker rule:**
- `CampaignScheduler.runBirthdayCampaign()` — `@Cron('30 2 * * *', {name:'birthday-campaign'})`, writes via `TransactionService.postCampaignBonus`.
- `CampaignScheduler.expireCampaigns()` — `@Cron('35 18 * * *')`, writes via `CampaignService.deactivateExpired()` (raw bulk UPDATE).
- `LoyaltyProcessor.handleEarnFromBill()` — `@Process('earn-from-bill')` on the loyalty-events queue, writes via `TransactionService.earnFromBill`.

**`CardConfigService.recalculateTiers()`** — confirmed a raw bulk **write** (`UPDATE loyalty_accounts SET card_category_id = (...)`), matching the A7 checkpoint's original note. Not a read, out of scope for this checkpoint's read-side conversion — deferred to B6 with the rest of write-path stamping.

**Entity sanity check:** all 6 entities (`LoyaltyAccount`, `LoyaltyTransaction`, `CardCategory`, `Campaign`, `RewardCatalog`, `RewardRedemption`) already carry the nullable `tenantId` column from Stage A (`1783760000000-AddTenantIdToLoyaltyTables.ts`) — confirmed.

**Other consumers checked:** only `his/sync/his-sync.service.ts` imports Loyalty services, and only for write-path helpers already covered above. No dashboard/reporting controller reads Loyalty data; no guard references any Loyalty service.

**Status:** ✅ Pre-flight complete · ✅ Implementation complete (dry-run mode) — see write-up below. Verification deferred to the single end-of-stage pass per the 2026-07-14 governance update.

**B3.4 (Loyalty) — what was built (2026-07-15), directly from the pre-flight blueprint above, no re-investigation per the standing instruction:**
- `loyalty.module.ts`: added `TenantModule` import + `createTenantScopedRepositoryProvider(Entity, { mode: 'dry-run' })` for all 6 entities (`LoyaltyAccount`, `LoyaltyTransaction`, `CardCategory`, `Campaign`, `RewardCatalog`, `RewardRedemption`), alongside (not replacing) the existing raw `TypeOrmModule.forFeature([...])` repositories.
- `TenantContextInterceptor` applied class-level on `LoyaltyController` and `CampaignController` — both entirely own-module business, no mixed public surface, matching the `UsersController`/`RbacController` pattern.
- `CardConfigService.findAll()`/`findOne()` converted; `update()`/`recalculateTiers()` (writes) untouched on the raw repository.
- `EnrollmentService.listAccounts()` converted; `getAccountById()`/`getAccountByMrn()`/`getAccountByCard()`/`enroll()`/`enrollOrGet()` and all writes remain raw, per the pre-flight's UNSAFE classification (each reachable from a `@Cron` job, HIS-sync, or the earn-from-bill BullMQ processor).
- `TransactionService.getTransactions()` converted; `findEarnByBillId()`, `reverseFromBill()`, `adjustFromBill()`, `earnFromBill()`, `postCampaignBonus()`, `adjustPoints()` remain raw.
- `RedemptionService.getCatalog()` and `getRedemptions()` converted; `createRedemption()`/`processRedemption()` remain raw.
- `CampaignService.findAll()`, `findOne()`, `getActiveCampaigns()` converted; `create()`, `update()`, `setActive()`, `getActiveBirthdayCampaigns()` (called exclusively from the birthday-cron job), `deactivateExpired()` remain raw.
- Targeted `tsc --noEmit` compile of all `loyalty/` files confirmed clean. (A separate, unrelated sandbox artifact surfaced during this check — see the Environment note below — resolved without touching any B3.4 file's logic.)
- Zero other modules touched, matching the discipline established at B3.1–B3.3.

**Environment note (2026-07-15):** the compile check that followed B3.4's edits surfaced the same bash-mount-staleness signature documented repeatedly across this stage (`'*/' expected`, `'}' expected` at spurious offsets) on the 6 co-located Loyalty entity files — none edited this session. Each was confirmed correct via the Read tool, then re-synced verbatim through the shell to clear the stale read; the targeted `loyalty/` compile is now clean. A subsequent full-tree `tsc --noEmit` (with `tsconfig.tsbuildinfo` removed, so not an incremental-cache artifact) showed the identical pattern on ~46 further pre-existing entity files across EIC, Feedback, and Token — none touched this session, none in B3.4's scope. Spot-checking one (`eic-goal.entity.ts`) via the Read tool confirmed the underlying content is correct, so this is the Windows-drive bash mount serving inconsistent bytes to different readers, not a real code defect. **Per explicit instruction (2026-07-15): not chased further — native Windows `tsc` (or the office CI/build) is now treated as the authoritative compiler for B3.5–B3.7; the sandbox compiler is local-sanity-check-only for files actually modified in a given checkpoint.**

---

## B3.5 (EIC) pre-flight (2026-07-15)

**Shape, up front: EIC looks more like Notification than Loyalty on the async-worker axis, but needs the same per-method write-adjacency scrutiny Loyalty introduced.** Confirmed via a module-wide grep for `@Cron`/`@Process`/`@Interval`/`Queue(`: **zero matches** inside `src/modules/eic/` (one false positive — `findWorkQueue`, a method name, not a queue). Every one of EIC's 9 services (`patient`, `enrollment`, `assessment`, `goal`, `session`, `discharge`, `discipline-assignment`, `progress-report`, `preschool`) is consumed exclusively by its own controller or by another EIC controller/service — confirmed by grepping every service class name across `src/` and finding matches only inside `src/modules/eic/`. No cron job, BullMQ processor, CLI script, or seed touches an EIC entity. So test 2 of the Eligibility Rule passes for the entire module — there is no BACKGROUND-ONLY bucket at B6's expense here, unlike Loyalty.

All 9 controllers share one guard/decorator stack (`JwtAuthGuard, PermissionsGuard, LicenseGuard`, `@RequireModule('EIC')`) with no mixed public/admin routes on any of them — `TenantContextInterceptor` applies **class-level** on all 9, matching the `UsersController`/`RbacController`/`LoyaltyController` precedent, no method-level exceptions needed anywhere in this module.

**Test 2/Execution Context Classification applied:** most `findById()`-shaped reads in EIC are also called by the same service's own submit/sign/update/achieve methods as a post-write refetch (e.g. `EicSessionService.submit()` calls `this.findById(sessionId)` at the end). Per the revised rule, these stay eligible because every call site — read or write — is request-scoped HTTP. The only methods actually excluded are ones that either aren't separately-reusable repository reads (inline existence checks folded into a write transaction), touch a table/query shape outside a typed repository's reach, or have a call site that outlives the HTTP request (`batchSyncFromHis()` below).

**SAFE — eligible for `TenantScopedRepository` conversion (29 methods across 9 services):**

| Service | Methods |
|---|---|
| `EicPatientService` | `lookupByMrn`, `findAll`, `getDevelopmentalHistory`, `findById`, `getSyncStatus`, `findByMrn` (currently unused/dead code — converted anyway for consistency) |
| `EicEnrollmentService` | `findById`, `findByPatient` (cross-controller: called from `EicPatientController`, which also carries the interceptor), `getTeam` |
| `EicAssessmentService` | `findByEnrollment`, `findAwaitingReview` (cross-enrollment countersign queue), `findById` |
| `EicGoalService` | `findByEnrollment`, `findById` |
| `EicSessionService` | `findByDate` (cross-enrollment daily hub), `findByEnrollment`, `findById` |
| `EicDischargeService` | `findByEnrollment`, `findById` |
| `EicDisciplineAssignmentService` | `findByEnrollment`, `findActiveByEnrollment`, `findActivePrimary` (cross-service: called from `EicProgressReportService.initiate()`, itself HTTP-only) |
| `EicProgressReportService` | `findByEnrollment`, `findById`, `findWorkQueue` (cross-enrollment work queue, uses `createQueryBuilder` — same dry-run-unscoped pattern used at B3.4) |
| `EicPreschoolService` | `findAll`, `findById`, `getAssessmentHistory`, `getDailyReports` |

**ASYNC-AFTER-REQUEST — deferred to B6 per the revised test 2 (no `@Cron`/BullMQ reachability exists elsewhere in EIC, but this one qualifies on "outlives the request" grounds):**
- `EicPatientService.batchSyncFromHis()` responds `202 Accepted` immediately, then keeps syncing patients in a detached, fire-and-forget `async` IIFE that continues running after the HTTP response completes. Per the Execution Context Classification, this is formally B6-classified, not merely "flagged" — the deciding question is whether execution outlives the request, not whether it's a named framework (`@Cron`/`@Process`). Its internal `patientRepo.find({ where: { isActive: true } })` read isn't a separately-reusable method, so it doesn't add its own row to the SAFE table, but the classification itself — B6, not B3 — is now explicit rather than a soft note. Left on the raw repository this checkpoint, to be picked up alongside EIC's write-path work in B6.

**OUT OF SCOPE — pure writes, admin utilities, or reads outside a typed repository's reach (44 methods):**
- Every create/update/submit/sign/achieve/extend/discontinue/close/countersign/reassess/requestRevision/assignTherapist/removeTherapist/incrementSessionCount/addEntry/updateEntry/deleteEntry write method across all 9 services.
- `EicPatientService.hisSearch()` — delegates directly to `PatientService.search()` (Oracle HIS), no local repository read at all.
- `EicPatientService.createFromHis()`/`createManual()`/`syncFromHis()`/`saveDevelopmentalHistory()`/`batchSyncFromHis()` — writes (the existence-check reads inside `createFromHis`/`createManual` are inline, not separately-exposed methods).
- `EicProgressReportService.resolvePatientId()` — private helper using `this.reportRepo.manager.query()` (raw SQL `SELECT patient_id FROM eic_therapy_enrollments WHERE id = $1`), not a typed repository read — bypasses `TenantScopedRepository` entirely regardless of eligibility; left as-is.
- `EicPreschoolService.getBackdateLimitDays()`/`setBackdateLimitDays()` — read/write against the global `settings` table (`module = 'EIC'` row), not one of EIC's 16 tenant-owned entities. Out of scope for the same reason Loyalty's HIS-bridge calls were.

**Redis caching note (`EicPatientService.findById`/`findByMrn`) — promoted to a cross-cutting backlog item, not an EIC-local fix.** Both methods cache the full patient object in Redis for 5 minutes, keyed by `id`/`mrn` only (no tenant segment in the cache key). On a cache hit, the method returns straight from Redis without ever reaching `TenantScopedRepository` — inert today under `mode: 'dry-run'` (dry-run never blocks a response either way), but once B9 flips this module to `mode: 'enforced'`, a cache hit would silently skip enforcement entirely. This isn't specific to EIC's cache — it's a general property of any read-through cache sitting in front of a `TenantScopedRepository`, so it's logged as its own backlog item rather than patched locally here:

> **New backlog item — B6.x/B8.x: Tenant-aware caching.** Any module using a read-through cache (Redis or otherwise) in front of a `TenantScopedRepository` needs the cache layer to become tenant-aware before that module's enforcement (B9) rollout — options to evaluate at that time: tenant-prefixed cache keys, a tenant-aware cache wrapper, bypassing the cache while `mode: 'enforced'`, or caching only already-tenant-filtered objects. EIC's `findById`/`findByMrn` are the first confirmed instance; check for the same pattern in CMS/Token/Feedback during their own pre-flights rather than rediscovering it per module. Not solved during B3 — logged here so it isn't rediscovered cold at B9.

**Entity sanity check:** all 16 entities already carry the nullable `tenantId` column from Stage A (A8, `1700000011000-CreateEICSchema.ts` + `1751400000005-AddDisciplineAssignments.ts`) — confirmed, no migration needed.

**Summary table:**

| Classification | Count |
|---|---:|
| Eligible B3 reads | 29 |
| Deferred to B6 — async-after-request (`batchSyncFromHis`) | 1 |
| Pure writes / admin / out-of-scope reads | 44 |
| Cross-cutting caveat logged (not a read-method count) | Tenant-aware caching backlog item (`findById`/`findByMrn`) |

**Status:** ✅ Pre-flight complete · ✅ Reviewed and approved (2026-07-15), with the Eligibility Rule refinement and the two architectural findings above adopted into this plan · ✅ Implementation complete (dry-run mode) — see write-up below. Verification deferred to the single end-of-stage pass per the 2026-07-14 governance update.

**B3.5 (EIC) — what was built (2026-07-15), directly from the approved pre-flight, no re-investigation:**
- `eic.module.ts`: added `TenantModule` import + `createTenantScopedRepositoryProvider(Entity, { mode: 'dry-run' })` for the 13 entities actually queried by an eligible read method (`EicPatient`, `EicDevelopmentalHistory`, `EicTherapyEnrollment`, `EicTherapyTeamMember`, `EicAssessment`, `EicGoal`, `EicTherapySession`, `EicDischargeSummary`, `EicPreschoolEnrollment`, `EicPreschoolAssessment`, `EicPreschoolDailyReport`, `EicEnrollmentDisciplineAssignment`, `EicProgressReport`) — alongside (not replacing) the existing raw `TypeOrmModule.forFeature([...])` repositories. `EicSessionEntry`/`EicDischargeSection`/`EicDisciplineProgressSection` don't get providers — they're loaded exclusively via `relations: [...]` on a parent's scoped query, never as standalone reads.
- `TenantContextInterceptor` applied class-level on all 9 EIC controllers (`EicPatientController`, `EicEnrollmentController`, `EicAssessmentController`, `EicGoalController`, `EicSessionController`, `EicDischargeController`, `EicPreschoolController`, `EicProgressReportController`, `EicDisciplineAssignmentController`) — all 9 share one guard stack with no mixed public routes, matching the `UsersController`/`LoyaltyController` precedent.
- All 29 eligible read methods from the pre-flight table converted to their service's injected `TenantScopedRepository`, including the two `createQueryBuilder`-based reads (`EicAssessmentService.findAwaitingReview()`, `EicProgressReportService.findWorkQueue()`, `EicPreschoolService.findAll()`'s search branch and `getDailyReports()`) using the same `await this.scopedRepo.createQueryBuilder(...)` pattern established at B3.4.
- `EicPatientService.batchSyncFromHis()`'s internal patient-list read stays on the raw repository, formally B6-classified per the revised Execution Context Classification (detached fire-and-forget async work outlives the request) — not merely flagged this time.
- Every write method across all 9 services, plus `resolvePatientId()` (raw SQL), `getBackdateLimitDays()`/`setBackdateLimitDays()` (unrelated global `settings` table), and `hisSearch()` (external HIS call, no local read) remain untouched on their original repositories.

**Environment note (2026-07-15):** the post-edit `tsc --noEmit` check (filtered to `modules/eic/`) surfaced the same bash-mount-staleness signature as B3.4's — but this time on files edited moments earlier in this same session, not just untouched pre-existing entities. Spot-checked via the Read tool (`eic.module.ts`, `eic-preschool.service.ts`, `eic-assessment.service.ts`, `eic-patient.controller.ts`) — all confirmed correct; the reported error offsets don't correspond to real syntax issues. Per the explicit 2026-07-15 instruction, this was not chased further with sandbox re-syncs: the sandbox compiler is being treated strictly as a local sanity check on files actually modified, and confirmed-correct-via-Read-tool is sufficient sign-off for that purpose. **Native Windows `tsc` (or the office CI/build) remains the authoritative compile check for this checkpoint and should be run there before B3.5 is promoted at the end-of-stage verification pass.**

---

## B3.6 (CMS) pre-flight (2026-07-15)

**Investigation order for this pre-flight, per explicit instruction: cache first, then execution context, then the repository read inventory, then a shared-helper sweep** — reordered from B3.4/B3.5's controller-first approach now that caching is a known cross-cutting risk.

**1. Cache audit — clean, first negative result of Stage B.** Grepped `src/modules/cms/` for Redis, `CacheManager`/`@Cacheable`, `new Map(` (in-memory singleton patterns), and any Cache Storage API usage. Two `new Map(...)` hits (`CmsMediaService.getUsage()`, `CmsPlaylistService.listItems()`) are local lookup tables built fresh from a single query's results within the same function call — not caches in the cross-request sense, no bypass risk. The only other "cache" hits are `CMSDisplayAssignment.cacheStatus`/`CmsCacheStatus` — a domain column describing the *physical player device's own local disk cache* (`OK`/`SYNCING`/`ERROR`/`OFFLINE`, reported via heartbeat), unrelated to backend server-side caching. **No Redis, no NestJS `CacheManager`, no in-memory singleton cache anywhere in CMS — the tenant-aware-caching backlog item from B3.5 does not apply here.**

**2. Execution Context Classification — one real `@Cron`, plus confirmation that CMS needs the chain-resolved context.**
- Cron/background: `CmsAssetCleanupService.runScheduled()` (`@Cron('0 30 2 * * *')`) — calls `cleanupOrphanedMedia()` (shared with a manual admin-triggered HTTP route) and `CmsPlayerLogService.purgeOlderThan()`. Both B6.
- Async-after-response: none — no fire-and-forget IIFEs anywhere in CMS (unlike EIC's `batchSyncFromHis`).
- CLI/startup: none.
- Oracle/HIS-derived: none — CMS has no Oracle integration.
- **Anonymous/chain-resolved: `CmsDisplayController`'s player routes (`getActiveContent`, `heartbeat`, `reportHealth`, `listPendingCommands`, `ackCommand`, `getPlayerSettings`) and `CmsTickerController.getForPlayer()`.** No `JwtAuthGuard`, no `request.user`. `TenantContextInterceptor` is hard-wired to `SessionTenantResolver`, which reads `request.user?.tenantId` and falls back to the seeded `'default'` tenant when there's no principal (confirmed by reading `session-tenant.resolver.ts`) — applying the interceptor to these routes wouldn't fail, it would silently and incorrectly stamp every anonymous player request as `'default'` regardless of the display's real tenant. These reads sit squarely in the **chain-resolved** row of the Execution Context Classification (`slug → CMSDisplayAssignment → branchId → tenant`) — `SessionTenantResolver` cannot resolve them correctly; `ChainTenantResolver` (introduced at B5) is the right mechanism. Bucketed below as **Chain-resolved execution (B5)**, per the Eligibility Rule as revised during this checkpoint's review.

**3. Repository read inventory — the resolver-based rule (as revised during this checkpoint) applied per method, across 12 entities / 10 services:**

**SAFE — eligible for `TenantScopedRepository` conversion (22 methods), authenticated-only in every call path:**

| Service | Methods |
|---|---|
| `CmsAuditService` | `listForEntity`, `listRecent` |
| `CmsMediaService` | `list`, `findOne`, `getUsage` |
| `CmsPlaylistService` | `list`, `findOne`, `listItems`, `preview`, `listVersions` |
| `CmsDisplayService` | `list`, `findOne`, `getDiagnostics` |
| `CmsScheduleService` | `findOne` |
| `CmsDisplayGroupService` | `list`, `findOne`, `listMembers` |
| `CmsDisplayCommandService` | `listHistory` |
| `CmsEmergencyService` | `listActive`, `listHistory` |
| `CmsPlayerLogService` | `listRecent` |
| `CmsTickerService` | `findOne` |

**Chain-resolved execution — B5, not B3, not B6 (13 methods):**
- `CmsDisplayService.findBySlug()` (the chain's anchor — every other item below is reached through it) and `getActiveContent()`.
- `CmsEmergencyService.getActive()` — reached only from `getActiveContent()`'s emergency-override check; `listActive()`/`listHistory()` above are a *different* pair of methods reachable only from the authenticated admin controller, not this one.
- `CmsScheduleService.listForDisplay()`, `resolveActivePlaylist()`, `isActiveNow()` — **`listForDisplay()` is shared**: called by both the authenticated `CmsScheduleController.list()` route (session-resolved) and the anonymous `resolveActivePlaylist()` chain (chain-resolved). A call site outside the session-resolved context disqualifies the whole method from B3 this checkpoint, same shape as B3.2's open question about cross-cutting HTTP-scoped consumers.
- `CmsPlaylistService.getLatestPublishedVersion()` — reached only from `getActiveContent()`, despite living in an otherwise fully session-resolved service.
- `CmsDisplayCommandService.listPending()` — reached only from the public `GET player/:slug/commands` route; `listHistory()` above is session-resolved-only and unrelated.
- `CmsTickerService.listForDisplay()` (shared, same reasoning as schedule's), `resolveActiveMessages()`, `isActiveNow()`, `getForPlayer()`.
- `CmsSettingsService.get()` — reached from three contexts: session-resolved (`CmsSettingsController.get()`), chain-resolved (`GET player/settings`), **and** system/background (`CmsAssetCleanupService.runScheduled()`, `@Cron`). Disqualified on two independent grounds — listed here as the primary reason (it's the one anonymous callers actually need) with the cron path also noted in the System/background bucket below for completeness.
- The inline `CMSDisplayGroup` lookup inside `CmsDisplayService.getActiveContent()` (`groupRepo.findOne({ where: { id: assignment.groupId } })`) — not a separately-reusable method, but flagged as part of the chain; `CmsDisplayGroupService.findOne()` above is a distinct, session-resolved-only method on the same entity and stays eligible.

**System/background — B6 (2 methods, one already double-counted above):**
- `CmsAssetCleanupService.cleanupOrphanedMedia()` — shared between the `@Cron` job and a manual admin HTTP trigger; whole method excluded, matching Loyalty's shared cron/HTTP write-path shape.
- `CmsPlayerLogService.purgeOlderThan()` — `@Cron`-only.
- `CmsSettingsService.get()` — also reachable from `runScheduled()`; see the chain-resolved entry above for the primary listing.

**4. Shared-helper sweep (requested explicitly) — one more finding beyond the chain-resolved discoveries above.** `CmsMediaService.getUsage()` is called both directly (session-resolved `GET media/:id/usage` route) and internally by `permanentDelete()` (a write, checking whether media is still referenced before allowing deletion) — both call sites are session-resolved, so per the B3.5-revised rule it stays eligible; flagged here only to show the sweep was done, not because it changed the classification. No other read method in CMS is reused by a maintenance/diagnostic/publish helper outside what's already captured in the chain-resolved bucket above.

**OUT OF SCOPE — pure writes / admin utilities (remainder):** every `create`/`update`/`remove`/`archive`/`duplicate`/`addItem`/`addWidgetItem`/`updateItem`/`removeItem`/`reorderItems`/`publish`/`rollback`/`activate`/`deactivate`/`issue`/`issueByTags`/`acknowledge`/`acknowledgeMany`/`heartbeat`/`reportHealth`/`ingest`/`upload` method across all 10 services, plus `CmsMediaController.upload()`'s file-I/O handling.

**Entity sanity check:** all 12 CMS entities already carry the nullable `tenantId` column from Stage A (A11) — confirmed, including `CMSSettings` (the global-singleton-shaped table) and `CMSEmergencyBroadcast` (whose `branchId = NULL` "global" rows were already §4-resolved to populate `tenant_id` normally, per this plan's B3.6 module-order note below).

**Summary table:**

| Classification | Count |
|---|---:|
| Eligible B3 (session-resolved) | 22 |
| Chain-resolved execution — deferred to B5 | 13 |
| System/background — deferred to B6 | 2 (1 overlaps with the chain-resolved count above) |
| Cache audit | Clean — no caching layer found in CMS |
| Pure writes / admin / out-of-scope | remainder |

**Status:** ✅ Pre-flight complete · ✅ Reviewed and approved (2026-07-15) — the resolver-based Eligibility Rule revision, the Chain-resolved execution (B5) category, and the CMS classification (22 → B3, 13 → B5, 2 → B6) all adopted. ✅ Implementation complete (dry-run mode) — see write-up below. Verification deferred to the single end-of-stage pass per the 2026-07-14 governance update.

**B3.6 (CMS) — what was built (2026-07-15), directly from the approved pre-flight, no re-investigation:**
- `cms.module.ts`: added `TenantModule` import + `createTenantScopedRepositoryProvider(Entity, { mode: 'dry-run' })` for 12 of CMS's 13 entities — every entity except `CMSSettings`, which gets no provider at all since `CmsSettingsService.get()` stays fully raw (reachable from a chain-resolved route and a cron job, not split per the explicit instruction).
- `TenantContextInterceptor` applied **class-level** on the 8 fully session-resolved controllers (`CmsAuditController`, `CmsMediaController`, `CmsPlaylistController`, `CmsScheduleController`, `CmsDisplayGroupController`, `CmsDisplayCommandController`, `CmsEmergencyController`) — no mixed public routes on any of them. `CmsSettingsController` and `CmsAssetCleanupController` deliberately get no interceptor at all — neither has any route that reaches a scoped repository (`CMSSettings` has no provider; asset cleanup's one route triggers the cron-shared, fully-raw `cleanupOrphanedMedia()`).
- `TenantContextInterceptor` applied **method-level only** on `CmsDisplayController` (`list`, `findOne`, `diagnostics`, `update`, `remove` — not `create`, not any of the 6 public player routes) and `CmsTickerController` (`update`, `remove` only — not `list`, not `create`, not the public `getForPlayer` route), since both mix session-resolved admin routes with chain-resolved public player routes on one controller, matching the `AuthController` precedent from B3.3.
- **Correctness finding applied during implementation, not just noted:** `TenantScopedRepository`'s dry-run branches (`findDryRun`, `findOneDryRun`, etc.) still call `TenantContextStorage.currentTenantId()` unconditionally (except system scope) to produce their comparison log — which *throws* if no context was ever established, per `TenantContextStorage`'s own design. This means a route that reaches a scoped method without carrying the interceptor wouldn't silently no-op in dry-run, it would break the endpoint outright. This is why `update()`/`remove()` on both mixed controllers needed the interceptor even though they're write routes — they call a now-scoped `findOne()` internally as a write-adjacent read. Traced explicitly this checkpoint rather than assumed; worth re-checking at every future mixed-controller module (Feedback, Token).
- 22 eligible read methods converted across 10 services: `CmsAuditService` (`listForEntity`, `listRecent`), `CmsMediaService` (`list`, `findOne`, `getUsage`), `CmsPlaylistService` (`list`, `findOne`, `listItems`, `preview`, `listVersions`), `CmsDisplayService` (`list`, `findOne`, `getDiagnostics`), `CmsScheduleService` (`findOne`), `CmsDisplayGroupService` (`list`, `findOne`, `listMembers`), `CmsDisplayCommandService` (`listHistory`), `CmsEmergencyService` (`listActive`, `listHistory`), `CmsPlayerLogService` (`listRecent`), `CmsTickerService` (`findOne`).
- **Implementation-only fix, not a classification change:** `CmsMediaService.getUsage()` and `CmsPlaylistService.listItems()` both used TypeORM's deprecated `repo.findByIds(ids)`, which `TenantScopedRepository` doesn't wrap (only `find`/`findBy`/`findOne`/`findOneBy`/`count`/`findAndCount`/`exist`/`createQueryBuilder`/`update`/`delete`/`softDelete` are wrapped). Rewrote both call sites as `scopedRepo.find({ where: { id: In(ids) } })`, which is wrapped and behaviorally identical.
- Every chain-resolved read (13) and system/background read (2, one overlapping) stays on its original raw repository, exactly as classified in the pre-flight: `CmsDisplayService.findBySlug()`/`getActiveContent()`, `CmsEmergencyService.getActive()`, `CmsScheduleService.listForDisplay()`/`resolveActivePlaylist()`/`isActiveNow()`, `CmsPlaylistService.getLatestPublishedVersion()`, `CmsDisplayCommandService.listPending()`, `CmsTickerService.listForDisplay()`/`resolveActiveMessages()`/`isActiveNow()`/`getForPlayer()`, `CmsSettingsService.get()`, `CmsAssetCleanupService.cleanupOrphanedMedia()`, `CmsPlayerLogService.purgeOlderThan()`.
- Zero other modules touched.

**Environment note (2026-07-15):** the post-edit `tsc --noEmit` check (filtered to `modules/cms/`) showed the same bash-mount-staleness signature as B3.4's and B3.5's, across both freshly-edited files and untouched entities. Spot-checked 3 of the edited files via the Read tool (`cms.module.ts`, `cms-playlist.service.ts`, `cms-display.controller.ts`) — all confirmed correct, including that the public player routes correctly carry no interceptor. Not chased further with sandbox re-syncs, per the standing 2026-07-15 instruction — native Windows `tsc`/office CI remains the authoritative compile check for this checkpoint.

---

## B3.7 (Feedback) pre-flight (2026-07-15)

**Implemented ahead of Token per the explicit reorder above** — one more confirmation of the resolver-based rule on a module simpler than CMS before Token. Investigation order follows the standing checklist: cache first, execution context, repository read inventory, shared-helper sweep.

**1. Cache audit — one real cache found, third confirmed instance of the tenant-aware-caching backlog item.** `FeedbackSettingsService` keeps an in-memory `Map<string, {value, expiresAt}>` with a 5-minute TTL, keyed by `branchId` (falling back to a `'__global__'` key) — the one settings service in HDSP that actually caches (`SettingsService`/`CmsSettingsService` both re-read on every call, confirmed at B3.6). `get()` checks the cache before touching `settingsRepo`; `update()` clears the entire cache, deliberately, because every cache entry today is a duplicate of the single global row. This cache sits directly in front of a would-be scoped read and is reached from **both** session-resolved and chain-resolved callers (see below) — logged as the third instance of the **B6.x/B8.x — Tenant-aware caching** backlog item (after EIC's Redis cache and CMS's clean/non-issue result). Other `new Map(...)` hits in `feedback-translation.service.ts`, `feedback-report.service.ts`, `feedback-analytics.service.ts` are local single-request lookup tables built fresh from one query's results, same non-issue shape confirmed at CMS — not caches.

**2. Execution Context Classification — cleanest module yet on this axis.** Module-wide grep for `@Cron`/`@Process`/`@Interval`/`Queue(` and for fire-and-forget detached-async patterns (`setImmediate`, `setTimeout`, unawaited `.then()`): **zero matches anywhere in `src/modules/feedback/`.** No Oracle/HIS integration either. Every execution context in this module is either session-resolved or chain-resolved — no B4, no B6 candidates at all.
- **Session-resolved:** 13 controllers, all `@UseGuards(JwtAuthGuard, PermissionsGuard)` at the class level with no mixed routes — `FeedbackFormController`, `FeedbackQuestionController`, `FeedbackCampaignController`, `FeedbackComplaintController`, `FeedbackQrController`, `FeedbackAuditController`, `FeedbackNotificationController`, `FeedbackLanguageController`, `FeedbackResponseController`, `FeedbackReportController`, `FeedbackAnalyticsController`, `FeedbackTranslationController`, `FeedbackSettingsController`.
- **Chain-resolved:** exactly one controller, `FeedbackPublicController` (`feedback/public`) — no guards at all, 3 routes: `GET :token` → `resolve()`, `POST :token/submit` → `submit()`, `POST :token/complaint` → `submitComplaint()`. Unlike CMS, **no controller in Feedback mixes session-resolved and chain-resolved routes** — the split is clean at the controller level, so (per the standing checklist item 5) interceptor placement this checkpoint is simpler: class-level on all 13 admin controllers, none at all on `FeedbackPublicController`.

**3. Repository read inventory — the chain anchor and its shared call sites.** `FeedbackPublicService._resolveChain(token)` is the chain's anchor: `qrRepo.findOne({where:{token}})` (direct repo access, not via `FeedbackQrService`) → validates `isActive`/`expiresAt` → `campaignRepo.findOne({where:{id:qr.campaignId}})` (direct repo access, not via `FeedbackCampaignService`) → validates `isActive` → `formService.findOne(campaign.formId)` → validates `status === 'PUBLISHED'`. Because the QR and campaign lookups go straight to their raw repositories rather than through `FeedbackQrService`/`FeedbackCampaignService`, those two services' own `findOne()`/`list()` methods stay cleanly session-resolved-only and eligible. `FeedbackFormService.findOne()` is not so lucky — it's called directly by the chain **and** by `FeedbackFormController.findOne()` and internally by `publish()`/`clone()`, a genuine shared call site, disqualifying it from B3 (same shape as CMS's `listForDisplay()`). `FeedbackFormService.list()` is never touched by the chain and stays eligible; the write-path's separate `_findOrThrow()` helper (a distinct, no-relations query shape used by `update`/`remove`/`unpublish`/`archive`/`setHeaderImage`/etc.) is session-resolved-only and also eligible.

`resolve()` additionally calls `settingsService.get(qr.branchId)`, `translationService.getAvailableLanguages(form)`, and `translationService.applyTranslations(form, selectedLanguage)`:
- `settingsService.get()` is reached from session-resolved (`FeedbackSettingsController.get()`), chain-resolved (`resolve()`/`submit()`), **and** further session-resolved write-adjacent callers (`FeedbackCampaignService.create()`, `FeedbackComplaintService.update()`, `FeedbackFormController.uploadSplashImage()`) — a shared call site, disqualified from B3 entirely. This is an escalation over CMS: `CmsSettingsService.get()` was chain-resolved-and-cron but never had a genuinely mixed session+chain shape the way this one does, and it's also the one path in the whole module that's actually cached — reinforcing why the caching backlog item matters more here than at CMS.
- `translationService.getAvailableLanguages(form)` is also called by `FeedbackTranslationController.availableLanguages()` (session-resolved) — shared call site, disqualified from B3 → chain-resolved/B5.
- `translationService.applyTranslations(form, languageCode)` is called only from the anonymous chain, never from any authenticated controller — chain-resolved-only, not eligible for B3 (no session-resolved call site to qualify it), bucketed under B5.
- `translationService.getFieldsForLanguage()` is session-resolved-only (`FeedbackTranslationController` only) and stays eligible.
- `FeedbackLanguage`-backed reads (`languageRepo.find()` inside `getAvailableLanguages()`, and `FeedbackLanguageService.list()`/`create()`/`update()`) are **out of scope regardless of call site** — the entity's own doc comment states it is deliberately global ("hospitals share the same pool of supported languages"), `tenantId` is nullable and explicitly "unread by any code yet," Ownership classification: Shared-global, not Tenant-owned. Same treatment as an app-wide reference table; not part of this checkpoint's B3/B5 split at all.

`submit()` (write) calls `_enforceSubmissionLimit()` → `submissionRepo.count()`, entirely internal to the chain-resolved write path, stays raw. `submitComplaint()` (write) calls `FeedbackComplaintService.submitPublic()`, which does its own direct `submissionRepo.findOne({where:{id:dto.submissionId}})` (not via `FeedbackResponseService`) — clean separation, so `FeedbackResponseService.findOne()`/`list()` (session-resolved-only, `FeedbackResponseController` is their only caller) stay eligible.

**SAFE — eligible for `TenantScopedRepository` conversion, session-resolved in every call path:**

| Service | Methods |
|---|---|
| `FeedbackFormService` | `list`, `_findOrThrow` (write-adjacent, used by `update`/`remove`/`unpublish`/`archive`/image-upload routes) |
| `FeedbackQuestionService` | `_formOrThrow`, `_sectionOrThrow`, `_questionOrThrow` (all write-adjacent; controller has no GET routes at all) |
| `FeedbackCampaignService` | `list`, `findOne` |
| `FeedbackComplaintService` | `list`, `findOne` |
| `FeedbackQrService` | `list`, `findOne` |
| `FeedbackAuditService` | `listForEntity`, `listRecent` |
| `FeedbackNotificationService` | `list`, `unreadCount` |
| `FeedbackResponseService` | `list`, `findOne` |
| `FeedbackTranslationService` | `getFieldsForLanguage` |
| `FeedbackReportService` | `exportSubmissionsCsv`, `exportComplaintsCsv`, `exportAnswersCsv` (all via `createQueryBuilder`/`findBy`, both wrapped methods) |
| `FeedbackAnalyticsService` | `getDashboard` (via `createQueryBuilder`/`findBy`) |

23 methods across 11 services.

**Chain-resolved execution — B5 (5 methods/paths):**
- `FeedbackFormService.findOne()` — shared session+chain call site.
- `FeedbackTranslationService.getAvailableLanguages()` — shared session+chain call site.
- `FeedbackTranslationService.applyTranslations()` — chain-only.
- `FeedbackSettingsService.get()`/`_loadFromDb()` — shared session+chain call site (also the module's one real cache).
- `FeedbackPublicService`'s own internals (`_resolveChain`, `resolve`, `submit`, `submitComplaint`) and `FeedbackComplaintService.submitPublic()` — entirely chain-resolved, stay raw regardless (writes plus the direct QR/campaign/submission lookups already covered above).

**System/background — B6:** none. Confirmed at step 2 — no cron, no queue, no detached async anywhere in Feedback.

**Out of scope — Shared-global, not tenant-owned (permanent, not deferred):** `FeedbackLanguageService` (`list`/`create`/`update`) and the `FeedbackLanguage` entity itself, per its own doc comment. This mirrors the B3 module-order note's existing statement that `FeedbackLanguage` never gets write-path population at all.

**4. Shared-helper sweep.** No read method in Feedback is reused by a publish/maintenance/diagnostic helper beyond what's already captured above (`FeedbackFormService.findOne()` inside `publish()`/`clone()`, `_findOrThrow()` inside the write paths, `FeedbackReportService`/`FeedbackAnalyticsService` sharing the same `_lookupNames`/`campaignRepo.findBy()` pattern — both session-resolved-only, no cross-module reuse).

**Entity sanity check:** all 14 A12 Feedback entities carry the nullable `tenantId` column from Stage A — confirmed, including `FeedbackLanguage` (present but deliberately unread, per its doc comment).

**Summary table:**

| Classification | Count |
|---|---:|
| Eligible B3 (session-resolved) | 23 methods across 11 services |
| Chain-resolved execution — deferred to B5 | 5 |
| System/background — deferred to B6 | 0 |
| Cache audit | 1 real cache found (`FeedbackSettingsService`) — 3rd tenant-aware-caching backlog instance |
| Shared-global, permanently out of scope | `FeedbackLanguage`/`FeedbackLanguageService` |
| Pure writes / admin / out-of-scope | remainder |

**Status:** ✅ Pre-flight complete · ✅ Reviewed and approved (2026-07-15) exactly as written — the `FeedbackSettingsService` caching finding elevated to the platform-level backlog (see above) rather than solved inline; the Exclusion Reason Classification adopted stage-wide (see above) · ✅ Implementation complete (dry-run mode) — see write-up below. Verification deferred to the single end-of-stage pass per the 2026-07-14 governance update.

**B3.7 (Feedback) — what was built (2026-07-15), directly from the approved pre-flight, no re-investigation:**
- `feedback.module.ts`: added `TenantModule` import + `createTenantScopedRepositoryProvider(Entity, { mode: 'dry-run' })` for 11 of Feedback's 15 entities (`FeedbackForm`, `FeedbackSection`, `FeedbackQuestion`, `FeedbackAuditLog`, `FeedbackCampaign`, `FeedbackQrCode`, `FeedbackComplaint`, `FeedbackSubmission`, `FeedbackAnswer`, `FeedbackNotification`, `FeedbackTranslation`) — alongside (not replacing) the existing raw `TypeOrmModule.forFeature([...])` repositories. `FeedbackSettings` and `FeedbackLanguage` deliberately get no provider — the former stays fully raw per the pre-flight's shared session+chain finding, the latter is permanently Shared-global. `FeedbackQuestionOption`/`FeedbackQuestionCondition` also get no provider — no eligible standalone read method touches either.
- `TenantContextInterceptor` applied **class-level** on the 11 controllers whose services gained a scoped repository (`FeedbackFormController`, `FeedbackQuestionController`, `FeedbackCampaignController`, `FeedbackComplaintController`, `FeedbackQrController`, `FeedbackAuditController`, `FeedbackNotificationController`, `FeedbackResponseController`, `FeedbackReportController`, `FeedbackAnalyticsController`, `FeedbackTranslationController`) — all fully session-resolved with no mixed public routes, so class-level coverage is correct even where a controller mixes scoped and still-raw calls within the same (session) resolver, e.g. `FeedbackFormController.findOne()`/`publish()`/`clone()` still resolve via the raw `FeedbackFormService.findOne()` while `list()`/`update()`/`remove()`/etc. now reach the scoped repository — both are session-resolved, so one interceptor covers the whole controller correctly, unlike CMS's genuinely mixed session+chain controllers. `FeedbackLanguageController`, `FeedbackSettingsController`, and `FeedbackPublicController` deliberately get no interceptor at all — none of the three reaches a scoped repository (`FeedbackLanguage`/`FeedbackSettings` have no providers; the public controller is entirely chain-resolved).
- 23 eligible read methods converted across 11 services: `FeedbackFormService` (`list`, `_findOrThrow`), `FeedbackQuestionService` (`_formOrThrow`, `_sectionOrThrow`, `_questionOrThrow`), `FeedbackCampaignService` (`list`, `findOne`), `FeedbackComplaintService` (`list`, `findOne`), `FeedbackQrService` (`list`, `findOne`), `FeedbackAuditService` (`listForEntity`, `listRecent`), `FeedbackNotificationService` (`list`, `unreadCount`), `FeedbackResponseService` (`list`, `findOne`), `FeedbackTranslationService` (`getFieldsForLanguage`), `FeedbackReportService` (`exportSubmissionsCsv`, `exportComplaintsCsv`, `exportAnswersCsv`, and their shared `_lookupNames()` helper), `FeedbackAnalyticsService` (`getDashboard`).
- Every chain-resolved method (5) stays on its original raw repository exactly as classified: `FeedbackFormService.findOne()`, `FeedbackTranslationService.getAvailableLanguages()`/`applyTranslations()`, `FeedbackSettingsService.get()`/`_loadFromDb()`, and `FeedbackPublicService`'s own internals plus `FeedbackComplaintService.submitPublic()`. `FeedbackLanguageService` (all methods) stays untouched, permanently out of scope.
- No `findByIds()`-style implementation surprises this checkpoint (unlike B3.6) — every eligible method used `find`/`findOne`/`findBy`/`createQueryBuilder`, all wrapped by `TenantScopedRepository`.
- Zero other modules touched.

**Environment note (2026-07-15):** the post-edit sandbox `tsc --noEmit` check showed the same bash-mount-staleness signature as every prior B3.x checkpoint, across both freshly-edited files and untouched entities. Spot-checked 2 of the edited files via the Read tool (`feedback-qr.controller.ts`, `feedback-form.service.ts`) — both confirmed correct. Not chased further with sandbox re-syncs, per the standing 2026-07-15 instruction — native Windows `tsc`/office CI remains the authoritative compile check for this checkpoint.

---

## B3.8 (Token) pre-flight (2026-07-15)

**Investigation ordered per explicit instruction: entry-point families first, then repository methods under each family, then verification that every family maps cleanly onto the four established resolver strategies — a level above the per-method-first approach used at B3.1–B3.7.** Token is treated as the test of whether the resolver model, not just the per-module workflow, is complete.

### 1. Entry-point family classification

| Family | Where it lives | Resolver | Stage |
|---|---|---:|---:|
| Counter/Reception UI | `TokenController` (authenticated routes), `TokenQueueController` (operator-action routes: complete/hold/skip/miss/cancel/transfer/reissue/serve/recall), `TokenGateway` (authenticated socket handlers: join/leave/heartbeat/call/recall/mark-no-show/reset), `RegistrationController` (normal-session routes) | `SessionTenantResolver` | **B3** |
| Admin configuration | `TokenConfigController` (all but `GET branding`), `TokenKioskController` (admin CRUD/assignment routes), `DisplayController` (all but `GET :slug`), `RegistrationController`'s two supervisor routes (`override`, `lock`) | `SessionTenantResolver` | **B3** |
| Analytics/reporting (HTTP) | `TokenAnalyticsController` (every route — no `@Public()` anywhere in this controller) | `SessionTenantResolver` | **B3** |
| Public display pages | `DisplayController.GET :slug`, `TokenGateway`'s `token:join-display` handler | `ChainTenantResolver` | **B5** |
| Kiosk endpoints | `TokenKioskController`'s `@Public()` routes (`GET kiosk/:slug`, `POST kiosk/:slug/issue`, `GET kiosk/:slug/state`, `GET kiosk/:slug/qr`), `TokenQueueController`'s `POST kiosk/:slug/issue` and `GET state/:referenceType/:referenceId`, `TokenGateway`'s `token:join-kiosk` handler, `TokenController`'s `public/*`/`his/*`/`service-center/ensure`/`locations/:id/next-token`/`print-config` routes | `ChainTenantResolver` | **B5** |
| Workstation registration | `WorkstationController` — confirmed **entirely `@Public()`** except two supervisor routes (`options/*`, bootstrap `GET :workstationId`, `POST :workstationId` saveConfig) | `ChainTenantResolver` | **B5** |
| Daily reset / analytics jobs | `TokenDailyResetService.handleDailyReset()` (`@Cron('* * * * *')`), `TokenAnalyticsService.runNightlyAggregation()` (`@Cron('15 0 * * *')`), `RegistrationService.sweepExpiredReservations()` (`@Cron('*/15 * * * * *')`), `HisBridgeProcessor.handleInsert()` (BullMQ `@Process`, in `src/modules/his/token/`) | explicit system context | **B6** |
| Oracle/HIS lookups | `HisTokenBridgeService` (departments/service centers, `oracle.query()` against Oracle HIS tables, backing `TokenController`'s public `his/*` routes) | external Oracle, no local tenant table | **out of scope — not a Postgres read at all**, same treatment as EIC's `hisSearch()` |

This confirms the predicted shape almost exactly, with one addition the prediction didn't have a slot for (see §5) and one refinement: Workstation registration is *more* thoroughly chain-resolved than expected — not just the kiosk-adjacent routes but branch/location/counter option lookups (`options/branches`, `options/locations`, `options/counters`) and the bootstrap/save-config round trip itself, since "a fresh workstation has no HDSP login of any kind" per the controller's own doc comment.

### 2. Repository reads reused by write flows — call graph

Traced before classifying anything, per the explicit instruction. Three genuinely infrastructural "reads" confirmed, matching the concern that Stage A already flagged:
- `TokenQueueService.findActive()` (private) — read-then-write on the same `TokenRecord` row, used by every state-transition method (`callToken`, `serveToken`, `completeToken`, `holdToken`, `skipToken`, `missToken`, `cancelToken`, `transferToken`, `recallToken`, `reissueToken`). Standard optimistic state-machine pattern — every call site is session-resolved (`TokenQueueController`'s operator-action routes), no public route reaches it directly (the public kiosk-issue path only *creates* records via `issueToken`/`issueFromKiosk`, never transitions an existing one through `findActive`).
- `TokenSequenceService.getNextToken()` — see §3, its own subsection given the explicit request.
- `RegistrationService.findActiveReservation()` (private) — read-then-write pattern behind `heartbeat()`/`releaseReservation()`, both reachable via a normal session **or** the reservation-capability JWT (`ReservationScopeGuard`) — flagged in §5, not yet classified.

### 3. Sequence generation — dedicated review

- **The core increment is a single atomic raw-SQL upsert** (`INSERT ... ON CONFLICT (branch_id, reference_type, reference_id, seq_date) DO UPDATE SET current_number = current_number + 1 RETURNING current_number`), not a separate SELECT-then-UPDATE — so the increment itself has no read-then-write race window.
- It is, however, wrapped in real reads: `resolvePrefix()` and `resolveSequenceConfig()` (TypeORM `findOne` on `TokenScConfig`/`TokenLocation`) run before the increment, and `hasActiveCollision()` (TypeORM `findOne` on `TokenRecord`) runs after, with a retry loop (up to 50 attempts) that can trigger further raw-SQL corrective `UPDATE`s on rollover/collision.
- **`getNextToken()` is called from `TokenService.issueToken()`** (manual/counter issuance, session-resolved) **and from `TokenQueueService.issueToken()`/`reissueToken()`**, which are themselves reached from the kiosk's `@Public()` issue routes (chain-resolved) as well as session-resolved operator routes (`reissue/:id`). **This means `getNextToken()` — and by extension `resolvePrefix()`/`resolveSequenceConfig()`/`hasActiveCollision()` — is a shared call site across session-resolved and chain-resolved contexts**, the same disqualifying shape found repeatedly at B3.6/B3.7 (CMS's `listForDisplay()`, Feedback's `FeedbackFormService.findOne()`). None of these are B3-eligible.
- **The one genuine read-before-write reconciliation pattern** lives in `reconcileFromExistingRecords()` (`MAX(tokenNumber)` read, then `GREATEST(...)`-upsert write) — called only from `TokenKioskService.migrateAssignment()`, a session-resolved admin action (kiosk-assignment LOCATION→SERVICE_CENTER migration). This one *is* session-resolved-only.
- **Daily reset does not call sequence generation at all** — `TokenDailyResetService` writes directly to `token_records`/`token_counters` via raw SQL and flushes Redis keys; it never touches `TokenSequenceService`. So the "is sequence generation reused by daily reset" question the user asked resolves to **no**.

### 4. Display pages

Confirmed the predicted chain almost exactly: `slug → DisplayController.findBySlug() → DisplayPage row`. Unlike CMS's `CmsDisplayAssignment`, the read in `DisplayService.findBySlug()` applies **no branch filter of any kind** — slug alone resolves the row (`repo.findOne({where:{slug}})`). `DisplayService.list()` (session-resolved, admin) and `findBySlug()` (chain-resolved, both the public route and `TokenGateway`'s `token:join-display`) are cleanly separated methods on the same repo — no shared call site, matching CMS's `CmsDisplayService.findBySlug()`/`list()` split.

### 5. Workstation endpoints — confirmed not authenticated, plus a new wrinkle

Confirmed: workstation bootstrap/config endpoints authenticate by **`workstationId` in the URL alone**, no JWT, no session — squarely chain-resolved, matching the user's explicit caution not to assume JWT authentication here.

**New finding, not covered by the four-resolver table as originally framed: derived/relayed session tokens.** Two places in Token mint a JWT server-side from a chain-resolved (not logged-in) identity, which is then presented on later requests exactly like a normal login session:
- `WorkstationService.mintSessionToken()` — signs a `type: 'workstation'` JWT (`sub: workstation:<id>`, 12h TTL) from the `@Public()` `bootstrap()` call. `RegistrationController.getQueue()`/`queue/stream` then branch on `user.isWorkstationToken`, reading `branchId`/`locationId` straight from that JWT's claims rather than from a real principal.
- `RegistrationService.mintCapabilityToken()` — signs a `type: 'reservation-capability'` JWT (15m TTL, `sub` = the *reserving staff member's own user ID*) from `reserveToken()`, itself a genuinely session-resolved route (`TOKEN:REGISTRATION:ACTION`). `ReservationScopeGuard`-protected routes (`heartbeat`, `release`, `map/patient`) accept either a real session or this capability token.

These are not a fifth resolver in the sense of a new *source* of tenant truth — the workstation token's branchId ultimately traces back to a chain-resolved workstation registration, and the capability token's identity traces back to a real session-resolved staff action — but neither is a *raw* `request.user?.tenantId` the way `SessionTenantResolver` expects, and it hasn't been confirmed whether the JWT strategy hydrates `request.user` for either token type with something `SessionTenantResolver` can actually resolve a tenant from. **Flagged as an open item, not yet classified** — treating routes reachable only via these derived tokens as B3-eligible without that confirmation would repeat CMS's original mistake (assuming "it's HTTP-authenticated" is the same as "the resolver can actually get the right answer").

### 6. Analytics — HTTP vs. nightly, confirmed split

`TokenAnalyticsController` is entirely session-resolved (`@RequirePermissions('TOKEN:ANALYTICS:READ')` at class level, no `@Public()` routes) — its methods, including `backfill()` (HTTP-triggered, manually re-runs the same aggregation the nightly cron performs), are B3-eligible-in-principle. `TokenAnalyticsService.runNightlyAggregation()` (`@Cron('15 0 * * *')`) is unconditionally B6. Both call the same underlying `aggregateDate()` — a shared call site by the letter of the Eligibility Rule, but see §7: none of this is repository-based to begin with.

### 7. Raw SQL inventory — the most consequential finding of this pre-flight

Token has, as expected, the highest concentration of raw SQL in the app. Full inventory (file:line, already gathered):
- `TokenService`: `token_display_config` get/save (print config, display config) — `.manager.query()`, 4 sites.
- `TokenSequenceService`: the atomic upsert-increment, rollover-reset `UPDATE`, `resetBranchSequences()`, `manualResetSequences()`, and `reconcileFromExistingRecords()`'s upsert — `.dataSource.query()`, 6 sites.
- `TokenDailyResetService`: the branch-wide `token_records`/`token_counters` reset `UPDATE`s and the Redis-key-flush location lookup — `.dataSource.query()`, 3 sites.
- `TokenAnalyticsService`: `aggregateDate()`'s upsert and every read method (`getAnalytics`, `getSummary`, `getVolume`, `getWaitTimes`, `getCounterPerf`, `exportRecords`, `getLiveAnalytics`) — `.dataSource.query()`, 8 sites, i.e. **this entire service has no TypeORM repository at all**.

**This is a structural gap orthogonal to resolver classification.** `TenantScopedRepository` wraps TypeORM `Repository` methods (`find`/`findOne`/`createQueryBuilder`/etc.) — it has no mechanism for raw `dataSource.query()`/`manager.query()` calls, regardless of which resolver correctly applies to the surrounding route. Concretely: `TokenAnalyticsService`'s HTTP-triggered reads are session-resolved (B3-eligible *by resolver*), but there is no `TenantScopedRepository` for B3 to convert them to — converting `TokenAnalyticsController`'s reads to "B3" this checkpoint would mean either (a) leaving them exactly as they are today, correctly resolver-classified but with zero enforcement mechanism attached, or (b) a separate, not-yet-built mechanism for scoping raw SQL (e.g. requiring every raw query to take an explicit tenant/branch parameter and manually append `AND tenant_id = $n`, verified per call site rather than via a wrapper). **This needs an explicit decision before implementation, not just a classification** — recommend treating "B3-eligible but raw-SQL" as its own bucket in the summary table, distinct from "B3-eligible and convertible today."

### 8. Does Token introduce a fourth resolver strategy?

**No — everything found fits into the existing four (session/Oracle/chain/background), matching the prediction.** Two qualifications, both already covered above rather than requiring a new category:
- Derived/relayed session tokens (§5) are a *variant* of session-resolved requiring verification, not a new resolver — pending confirmation of what `SessionTenantResolver` actually sees for these principals.
- The raw-SQL gap (§7) is an *enforcement-mechanism* problem, not a *resolver-identification* problem — every raw-SQL method still has a knowable resolver (mostly session-resolved for the admin/analytics reads, background for the cron writes), it's just that today's `TenantScopedRepository`-based mechanism can't attach to any of them.

If both qualifications are resolved (JWT hydration confirmed one way or the other; a raw-SQL scoping approach decided), Token becomes the confirmation the user was looking for: **the resolver model generalizes across the entire application without needing a fifth category.**

### Summary table

| Classification | Entry points / methods | Notes |
|---|---|---:|
| Session-resolved — B3, convertible today (has a TypeORM repository) | Counter/Reception UI + Admin configuration + Analytics-HTTP families' repository-backed reads (`TokenLocation`/`TokenCounter`/`TokenCall`/`DisplayPage`/`TokenBranchConfig`/`TokenKiosk`/`TokenKioskAssignment`/`TokenKioskBranding`/`TokenScConfig`/`TokenReservation`/`TokenPatientMapping`/`MappingAuditLog`/`WorkstationConfig` reads not shared with a chain-resolved call site) | Full per-method table to be finalized before implementation |
| Session-resolved — B3 in principle, **not convertible with today's mechanism** (raw SQL) | `TokenAnalyticsService`'s 7 HTTP-triggered reads, `TokenService`'s print/display config get | Needs an explicit decision (§7) before implementation |
| Chain-resolved — B5 | Public display pages, Kiosk endpoints, Workstation registration, `TokenSequenceService.getNextToken()`/`resolvePrefix()`/`resolveSequenceConfig()`/`hasActiveCollision()` (shared with session-resolved call sites) | |
| Background/System — B6 | `TokenDailyResetService`, `TokenAnalyticsService.runNightlyAggregation()`, `RegistrationService.sweepExpiredReservations()`, `HisBridgeProcessor` | |
| Out of scope — Oracle/HIS-external | `HisTokenBridgeService` | Not a Postgres read at all |
| Out of scope — dead code | `TokenAuditService.findByEntity()`/`findByBranch()` | Zero call sites anywhere in `src/` (grep-confirmed) |
| Open — requires confirmation before classifying | Routes reachable only via workstation-derived or reservation-capability JWTs (§5); the raw-SQL convertibility decision (§7) | |

**Status:** ✅ Pre-flight complete (entry-point-family level) · ✅ Reviewed (2026-07-15) — both open items treated as implementation prerequisites rather than blockers, per explicit instruction: (1) verify whether the derived JWTs already resolve correctly under `SessionTenantResolver` — a check, not an open architectural question; (2) exclude raw-SQL read paths from B3.8 outright rather than attempting to retrofit them this checkpoint.

**Mechanism Coverage Matrix (added 2026-07-15, at B3.8's review) — makes explicit what B3's enforcement mechanism does and does not cover, independent of any module:**

| Data access mechanism | Covered by B3 today? | Notes |
|---|---|---|
| TypeORM `Repository` (`find`/`findOne`/`findBy`/`count`/etc.) | ✅ | Via `TenantScopedRepository` |
| `Repository.createQueryBuilder()` / `TenantScopedRepository.createQueryBuilder()` | ✅ | Already wrapped, used throughout B3.1–B3.7 |
| Raw `dataSource.query()` / `manager.query()` | ❌ | Future work — no wrapper exists for this |
| `QueryRunner.query()` | ❌ | Future work |
| Stored procedures | ❌ | Future work |

**Governance statement:** B3 repository enforcement applies only to TypeORM repository access (including its QueryBuilder). Raw SQL — regardless of which resolver correctly applies to the surrounding route — remains explicitly out of scope until a dedicated raw-SQL enforcement strategy is introduced. This is a limitation of the *mechanism*, not a per-module exception, and it is not solved inside B3.8 or any other B3.x checkpoint — logged here so it isn't rediscovered per-module the way the caching backlog item was.

**Verification: can `SessionTenantResolver` resolve a tenant from the two derived-JWT principal shapes?** Read `jwt.strategy.ts`'s `validate()` and `tenant-context.interceptor.ts` directly. **Answer: no, not today.** `TenantContextInterceptor` reads `request.user?.tenantId` and passes that straight to `SessionTenantResolver.resolve()`, which checks `principal?.tenantId`. Neither derived principal shape carries a top-level `tenantId` field:
- `ReservationCapabilityPrincipal` carries `{ id, username, isCapabilityToken: true, capability: { tokenNumber, reservationId, branchId } }` — `branchId` is nested under `capability`, not `tenantId` at the top level.
- `WorkstationPrincipal` carries `{ id, username, isWorkstationToken: true, workstation: { workstationId, branchId, locationId, counterId } }` — same shape, `branchId` nested, no `tenantId` anywhere.

For both, `principal.tenantId` evaluates to `undefined`, so `SessionTenantResolver` falls through to `TenantContextService.getCurrentTenantId()` (the seeded `'default'` tenant) — the exact same silent-mis-stamping failure mode CMS's anonymous player routes would have hit if the interceptor had been applied there. The difference here is that these routes carry a real, signature-verified JWT and pass a real guard, which is precisely why this needed an explicit check rather than an assumption: "HTTP-authenticated" is not the same as "resolver produces the right answer," confirmed a third time (after CMS, and this).

**Resulting classification: routes reachable only via a `WorkstationPrincipal` or `ReservationCapabilityPrincipal` (not a real `User`) are excluded from B3.8's implementation.** This affects `RegistrationController.getQueue()`/`queue/stream` when `user.isWorkstationToken` is true, and every `ReservationScopeGuard`-protected route (`heartbeat`, `release`, `map/patient`) when reached via a capability token rather than a real session. These are not reclassified to B5 either (they're not literally anonymous — they carry a real signed JWT with a real `branchId` claim) — they're left **unclassified/excluded pending a small `SessionTenantResolver` enhancement** (e.g. falling back to `principal.workstation?.branchId ?? principal.capability?.branchId` when `tenantId` is absent, once it's confirmed whether `branchId` and `tenantId` are interchangeable in this codebase's data model — a question this pre-flight did not need to resolve, only surface). Not a new resolver category, per the explicit finding — a resolver *enhancement*, deferred out of B3.8's implementation scope.

### Per-method SAFE table (finalized 2026-07-15)

**Scope note, stated explicitly because it's narrower than B3.1–B3.7's cut:** unlike every prior module, none of Token's controllers are purely session-resolved — every one of `TokenController`/`TokenQueueController`/`TokenKioskController`/`TokenConfigController`/`DisplayController`/`RegistrationController` mixes chain-resolved (or derived-JWT-excluded) routes with session-resolved ones. Given that, this table converts only **named, reusable read methods and clean single-purpose private helpers** whose every call site is confirmed session-resolved-only — matching what prior SAFE tables actually listed. One-off inline repository reads embedded directly inside a larger write method's body (e.g. `TokenService.issueToken()`'s `locationRepo.findOne()`, `RegistrationService.reserveToken()`'s several inline checks, `TokenConfigService.upsertScConfig()`'s inline read) are deliberately left raw this checkpoint rather than individually argued one by one — a narrower, more conservative cut justified by Token's much higher structural complexity, not a relaxation of the Eligibility Rule itself.

| # | Method | Entity | Call site(s) | Why eligible |
|---|---|---|---|---|
| 1 | `TokenService.getRecentCalls()` | `TokenCall` | `TokenController.getHistory()` (`locations/:id/history`, session) | Single, clean session-resolved call site — `getLocations()`/`getLocationState()`/`getAllLocationsState()` are all excluded, shared with chain-resolved routes (§ verification above) |
| 2 | `TokenQueueService.findActive()` (private) | `TokenRecord` | 10 state-transition writes on `TokenQueueController` (`complete`/`hold`/`skip`/`miss`/`cancel`/`transfer`/`reissue`/`serve`/`recall`, all session-resolved operator routes) | Shared write-adjacent helper, every call site session-resolved — same pattern as CMS's/Feedback's `_findOrThrow`-style helpers |
| 3 | `TokenKioskService.listKiosks()` | `TokenKiosk` (+ relations) | Admin list route (session) | Single call site |
| 4 | `TokenKioskService.getById()` | `TokenKiosk` | Admin get/patch routes (session) — **assumed admin-only, to be confirmed during implementation**, distinct from the public `getBySlug()` | `getBySlug()` itself stays raw — touched by every public kiosk route |
| 5 | `TokenKioskService.generateUniqueSlug()` (private) | `TokenKiosk` | `createKiosk()` only (session, admin) | Single write-adjacent call site |
| 6 | `TokenKioskService.assertNoConflictingAssignment()` (private) | `TokenLocation`, `TokenKioskAssignment` | `addAssignment()` only (session, admin) | Single write-adjacent call site |
| 7 | `TokenConfigService.getBranchConfig()` (and its `getMode()` delegate) | `TokenBranchConfig` | `GET config`, `GET config/mode`, `PUT config/mode`'s internal `updateMode()` (all session) | No chain-resolved caller found — unlike `getBranding()`, which is disqualified (shared with the `@Public() GET branding` route) |
| 8 | `TokenConfigService.listScConfigs()` | `TokenScConfig` | `GET config/sc-configs` (session) | Single call site |
| 9 | `DisplayService.list()` | `DisplayPage` | Admin list route (session) | `findBySlug()` stays raw — the chain-resolved anchor, matching CMS's `CmsDisplayService` split |
| 10 | `RegistrationService.getTokenState()` | `TokenRecord`, `TokenPatientMapping`, `TokenReservation` | `GET registration/:tokenNumber/state` (session, no `ReservationScopeGuard`) | Not reachable via a capability token |
| 11 | `RegistrationService.getMappingByMrn()` | `TokenPatientMapping` | `GET registration/mapping/by-mrn/:mrn` (session) | Single call site |
| 12 | `TokenSequenceService.reconcileFromExistingRecords()` — **read portion only** (`MAX(tokenNumber)` via `createQueryBuilder`) | `TokenRecord` | `TokenKioskService.migrateAssignment()` only (session, admin) | QueryBuilder-based (covered by the Mechanism Coverage Matrix); the method's own write remains raw SQL and stays untouched regardless |

**`getQueue()` and `findActiveReservation()` explicitly excluded, not merely deferred:** both are reached by more than one calling context at runtime (`getQueue()` branches on `user.isWorkstationToken`; `findActiveReservation()` backs both `heartbeat()`/`releaseReservation()`, reachable via a real session or a `ReservationScopeGuard`-passed capability token) — one of those contexts (workstation/capability token) doesn't resolve correctly under `SessionTenantResolver` today. Per the Eligibility Rule, a method is only eligible if *every* call site resolves correctly — a single scoped method can't be "correct for some callers, silently wrong for others," so the whole method stays raw pending the resolver enhancement, not just the derived-token branch of it.

**Entities requiring a scoped provider:** `TokenCall`, `TokenRecord`, `TokenKiosk`, `TokenKioskAssignment`, `TokenLocation`, `TokenBranchConfig`, `TokenScConfig`, `DisplayPage`, `TokenPatientMapping` — 9 entities, `mode: 'dry-run'`.

**Status:** ✅ Per-method table finalized · ✅ Implementation complete (dry-run mode) — see write-up below. Verification deferred to the single end-of-stage pass per the 2026-07-14 governance update.

**B3.8 (Token) — what was built (2026-07-15), directly from the finalized SAFE table:**
- `token.module.ts`: added `TenantModule` import + `createTenantScopedRepositoryProvider(Entity, { mode: 'dry-run' })` for 8 entities (`TokenCall`, `TokenRecord`, `TokenKiosk`, `TokenKioskAssignment`, `TokenLocation`, `TokenBranchConfig`, `TokenScConfig`, `DisplayPage`). `TokenCounter`/`TokenSequence`/`TokenKioskBranding`/`TokenAnalyticsDaily`/`TokenAuditLog` get no provider — no eligible read method touches any of them.
- `registration.module.ts`: separately added its own `TenantModule` import + scoped providers for `TokenRecord`/`TokenPatientMapping`/`TokenReservation` — a distinct NestJS module from `TokenModule` (imported into it, not merged), so its own provider graph needed its own scoped-repository registrations even for entities also scoped in `token.module.ts`.
- `TenantContextInterceptor` applied **method-level only**, on every controller touched — Token is the first module this stage with **zero** class-level interceptor placements, since every one of its 6 controllers mixes chain-resolved (or derived-JWT-excluded) routes with session-resolved ones:
  - `TokenController`: `getHistory()` (`locations/:id/history`) only.
  - `TokenQueueController`: all 9 operator-action routes (`complete`/`hold`/`skip`/`miss`/`cancel`/`transfer`/`reissue`/`serve`/`recall`).
  - `TokenKioskController`: `listKiosks`, `createKiosk`, `updateKiosk`, `disableKiosk`, `enableKiosk`, `archiveKiosk`, `addAssignment`, `migrateAssignment` — every admin route that reaches `getById()`/`generateUniqueSlug()`/`assertNoConflictingAssignment()` internally, including the disable/enable/archive routes (each calls `getById()` by way of `updateKiosk()`/`archiveKiosk()`). `getKiosk` (admin `GET :slug`) deliberately excluded — it calls `getBySlug()`, which stays raw.
  - `TokenConfigController`: `GET`, `GET mode`, `PUT mode`, `GET sc-configs`. `GET branding` (public), `POST/PUT/DELETE sc-configs`, `POST reset` deliberately excluded — none touch a scoped repository.
  - `DisplayController`: `list()` (`GET`, admin) only — `GET :slug`, `create`, `update`, `remove` all stay on raw `findBySlug()`.
  - `RegistrationController`: `GET :tokenNumber/state`, `GET mapping/by-mrn/:mrn` only. `GET queue`/SSE `queue/stream` deliberately excluded (`getQueue()` stays raw — reachable via both a real session and a workstation-derived token, and only the latter is currently unresolvable).
- 12 read methods (or read-portions, in `TokenSequenceService`'s case) converted across 6 services: `TokenService.getRecentCalls()`, `TokenQueueService.findActive()`, `TokenKioskService.listKiosks()`/`getById()`/`generateUniqueSlug()`/`assertNoConflictingAssignment()`, `TokenConfigService.getBranchConfig()`/`listScConfigs()`, `DisplayService.list()`, `RegistrationService.getTokenState()`/`getMappingByMrn()`, `TokenSequenceService.reconcileFromExistingRecords()` (QueryBuilder read only — its raw-SQL upsert write stays untouched).
- Every raw-SQL read (`TokenAnalyticsService` in full, `TokenSequenceService`'s `getNextToken`/`resolvePrefix`/`resolveSequenceConfig`/`hasActiveCollision`, `TokenDailyResetService`, `TokenService`'s print/display config) left exactly as classified — out of scope per the Mechanism Coverage Matrix, not retrofitted.
- Every derived-JWT-reachable method (`RegistrationService.getQueue()`, `findActiveReservation()` and its callers `heartbeat()`/`releaseReservation()`) left exactly as classified — excluded pending the `SessionTenantResolver` enhancement noted above, not implemented this checkpoint.
- Zero other modules touched.

**Environment note (2026-07-15):** the post-edit sandbox `tsc --noEmit` check showed the same bash-mount-staleness signature as every prior checkpoint this stage, across both freshly-edited files and untouched entities. Spot-checked 2 edited files via the Read tool (`token.module.ts`, `registration.module.ts`) — both confirmed correct. Not chased further, per the standing instruction that native Windows `tsc`/office CI is authoritative for this checkpoint.

**This completes B3.1–B3.8 — every Pattern 1 module in Stage B's scope.** Verification (the single end-of-stage consolidated pass) and B4/B5/B6 are next.

---

## B4 — Attendance: Oracle-Derived Resolution (Pattern 2, isolated) — ✅ COMPLETE (2026-07-15)

**Pre-flight, condensed per the 2026-07-15 continuous-implementation governance update:** A9's relationship audit already established the core finding — Attendance has no local Postgres join to derive tenant_id from; employee identity lives entirely in Oracle HIS, resolved via `INTRABRANCHID`. `OracleTenantResolver.resolveForBranch(intraBranchId)` was built standalone at B1 for exactly this module, with zero consumers until now.

**Entry-point / write-path inventory:**
1. **Root write — `PunchHistoryService.recordDiscoveredPunch()`.** Creates every `AttendanceEvent` row (the single ingestion point for both `fetchNewPunches()`'s realtime cursor and `fetchBackfillPunches()`'s sweep). The raw Oracle ATTLOGS row already carries `INTRABRANCHID` (mapped to `AttlogPunch.intraBranchId`) — resolvable at creation time, before roster resolution even runs.
2. **`AttendanceAuditService.record()`** — writes `attendance_audit` from a `RosterContext`, which already carries `intraBranchId` (resolved once per event by `RosterResolver.resolve()`). Same Oracle source, no second round-trip needed conceptually (though `OracleTenantResolver.resolveForBranch()` is still called per write — cheap today since it's a no-op returning `'default'`).
3. **`AttendanceGovernanceService.recordSkip()`** — writes `attendance_skip_logs`, called from two places in `AttendanceProcessor.processEvent()` (manual-override skip, payroll-lock skip), both of which have `roster.intraBranchId` in scope.
4. **`DependencySnapshotService.capture()`** — writes `attendance_dependency_snapshots` via a raw `createQueryBuilder().insert()...orUpdate()` upsert (not a plain `.save()`/`.create()`, but still within TypeORM's QueryBuilder — covered by the Mechanism Coverage Matrix, unlike `dataSource.query()`). Called from the same two `AttendanceProcessor` sites plus the main success path, all with `roster.intraBranchId` in scope.

**Deliberately excluded from this pass, with reasoning (narrower cut, matching the Token/B3.8 precedent):**
- **`AttendanceGovernanceLock` creation** (`lockEmployee`/`lockDepartment`/`lockAll`/`unlock`) — confirmed via search to have **zero live call sites**; only exercised by `phase-5-governance.spec.ts`. No controller wires these to an HTTP endpoint today. Not stamped this pass — revisit once/if these are wired to an admin surface (at which point they'd likely be session-derived, not Oracle-derived, since an authenticated admin — not the Oracle pipeline — initiates a lock).
- **`AttendanceDivergenceLog` / `his-reconciliation.job.ts` / `his-divergence.service.ts`** — the nightly reconciliation job, structurally independent of the realtime pipeline (compares Oracle DUTYACTUALVALUES against snapshots). Needs its own investigation of what branch identifier is available at that call site; not assumed to be identical to the realtime path's `intraBranchId` threading.
- **`AttendanceDependencyEvent` + the 4 dependency pollers** (`duty-plan`/`leave`/`holiday`/`shift-type`) — a second, independent Oracle-derived ingestion family (per A9/A13's precedent of multiple entry-point families within one module). Not yet confirmed whether each poller's source rows carry a branch identifier comparable to ATTLOGS's `INTRABRANCHID` — needs its own read before stamping.
- **`AttendanceReconciliation`, `retroactive-recalculation.service.ts`, `npnl-sweep.service.ts`** — not yet audited for their write paths this pass.

These five deferred items are logged as B4's own backlog (not silently dropped), to be picked up either later in B4 or folded into B6 (background/system execution) where several of them — nightly job, sweep — arguably belong more naturally given their trigger is a cron schedule, not a live Oracle event.

**Implementation:**
- `attendance.module.ts` — added `TenantModule` import.
- `punch-history.service.ts` — injected `OracleTenantResolver`; `recordDiscoveredPunch()` resolves `tenantId` from `punch.intraBranchId` and stamps it on `AttendanceEvent` creation.
- `attendance-audit.service.ts` — injected `OracleTenantResolver`; `record()` resolves `tenantId` from `roster.intraBranchId` and stamps it on `AttendanceAudit` creation.
- `attendance-governance.service.ts` — injected `OracleTenantResolver`; `SkipLogInput` gained an optional `intraBranchId` field; `recordSkip()` resolves and stamps `tenantId` on `AttendanceSkipLog` creation.
- `attendance-processor.service.ts` — both `recordSkip()` call sites now pass `intraBranchId: roster.intraBranchId`.
- `dependency-snapshot.service.ts` — injected `OracleTenantResolver`; `SnapshotInput` gained an optional `intraBranchId` field; `capture()` resolves `tenantId` and includes it in the `.values({...})` insert. Deliberately **excluded** from the `.orUpdate()` column list — on conflict, the original `tenant_id` is preserved rather than re-stamped, since an employee's tenant cannot legitimately change between re-evaluations of the same duty date once a real branch→tenant mapping exists.
- `attendance-processor.service.ts` — both `capture()` call sites now pass `intraBranchId: roster.intraBranchId`.

**Risk profile:** low. `OracleTenantResolver.resolveForBranch()` always resolves to the seeded `'default'` tenant today (no branch→tenant mapping table exists — Phase 10 provisioning), identical to what A9's backfill already put in every pre-existing row. This change makes *new* rows populate the same value that's already there, rather than leaving them `NULL` — an additive, non-breaking write-time change with no read-side enforcement switched on yet (no `TenantScopedRepository` involved in Pattern 2 at all — this is direct write-time stamping, not the dry-run/enforced toggle B3's Pattern 1 modules use).

**Verification:** deferred to the single comprehensive Phase 1 verification pass, per the 2026-07-15 governance update.

**Status:** ✅ Implementation complete for the root realtime write path (event → audit → skip log → snapshot). ⏳ 5 deferred sub-items logged above, to be swept up before Phase 1 is marked complete. ⏳ Verification deferred.

---

## B5 — Feedback + Token Public/Anonymous Surfaces (Pattern 3) — 🔶 IN PROGRESS (2026-07-15)

**Architectural resolution applied first, per the recommended order:** the derived-JWT gap logged at B3.8 (workstation/reservation-capability JWTs unresolvable by `SessionTenantResolver`) is fixed at the single shared choke point, `TenantContextInterceptor`, rather than patched per-controller. On reflection this is properly classified as Pattern 3, not a Pattern 1 patch: a workstation/capability token isn't a real user session, but it carries a `branchId` the token issuer already resolved and embedded — the same "trusted chain, no session" shape as a QR code or a kiosk slug, just carried in a JWT claim. `TenantContextInterceptor` now branches: `isWorkstationToken`/`isCapabilityToken` principals route through `ChainTenantResolver.resolveForKnownBranch(principal.workstation?.branchId ?? principal.capability?.branchId)`; everything else keeps using `SessionTenantResolver` unchanged. Every existing `@UseInterceptors(TenantContextInterceptor)` placement across B3.1–B3.8 benefits automatically — no controller or service needed to change for this part.

**Feedback public surface — implemented:**
- `FeedbackPublicService.submit()` — resolves `tenantId` via `ChainTenantResolver.resolveForKnownBranch(qr.branchId)` (the same chain `_resolveChain()` already enforces); stamps it on both `FeedbackSubmission` and every `FeedbackAnswer` row.
- `FeedbackComplaintService.submitPublic()` — same pattern, keyed off the already-verified `submission.branchId`; stamps `FeedbackComplaint`.
- `FeedbackAuditService.log()` — gained an optional `tenantId` param, passed explicitly from the two public-chain call sites above. Every other (session-resolved) caller across the module does **not** pass it yet — logged as a deferred B5 sub-item, not silently dropped; `log()` stays on the raw repository either way regardless of caller.
- No module wiring changes needed — `FeedbackModule` already imports `TenantModule` (from B3.7).

**Token public/chain surface — implemented:**
- `TokenQueueService.issueToken()` (and therefore `issueFromKiosk()`, which delegates to it) — resolves `tenantId` via `ChainTenantResolver.resolveForKnownBranch(opts.branchId)`, covering both the public kiosk walk-up flow and the authenticated internal-issue path with one change, since both already pass a server-trusted `branchId` into this single write.
- `RegistrationService.reserveToken()` — resolves `tenantId` from the reserved `TokenRecord`'s own `branchId` (chain: tokenNumber → TokenRecord.branchId), stamps `TokenReservation`. Chosen over relying on ambient interceptor context because `RegistrationController`'s `reserve` route isn't wrapped in `@UseInterceptors(TenantContextInterceptor)` today.

**Token public/chain surface — deliberately deferred, logged not dropped:**
1. `RegistrationController`'s `getQueue`/`queueStream`/`heartbeat`/`release`/`mapPatient`/`mapVisit`/`supervisorReset` routes are still not wrapped in `@UseInterceptors(TenantContextInterceptor)` — B3.8 excluded them because the derived-JWT gap made the interceptor produce wrong answers for workstation/capability principals. That gap is now fixed, so these routes are candidates to gain the interceptor and, where they read via `scopedTokenRepo`/`scopedMappingRepo`/`scopedReservationRepo`, get correctly chain-resolved automatically. Not done yet this pass — needs its own read-through to confirm each route's write paths are compatible (`mapPatient`/`supervisorReset` are transaction-wrapped using the raw `EntityManager`, not the injected repos, so ambient `TenantContextStorage` context doesn't automatically help them the way a `TenantScopedRepository` read does).
2. `WorkstationService.mintSessionToken()`'s bootstrap flow (the `@Public()` call that mints the workstation JWT in the first place) — not yet audited for whether `WorkstationConfig` itself needs tenant stamping at creation/lookup time.
3. `DisplayService`/`DisplayController`'s public `findBySlug()` — read-only, no write, so lower priority, but not yet confirmed whether it needs chain-derived read scoping for consistency with `list()`'s existing session-scoped read (B3.8).
4. `TokenKioskService.getBySlug()`/`getPublicKioskConfig()` — still raw reads (correctly, per B3.8's classification — chain-resolved, not session-resolved), not yet given explicit chain-derived scoping since they're reads, not writes; B5's mechanism so far has focused on writes since Pattern 3's core risk is at write time (per A12/A13's original finding). Revisit once B5's write-side is fully closed out.

**Status:**
```
Interceptor fix (derived-JWT via chain)   ✅ complete — benefits every existing B3.x placement
Feedback public writes                     ✅ complete
Token issueToken/issueFromKiosk            ✅ complete
Token reserveToken                         ✅ complete
Token getQueue/heartbeat/release/mapPatient/mapVisit/supervisorReset   ⏳ deferred, logged above
WorkstationConfig bootstrap                ⏳ deferred, logged above
Display public routes                      ⏳ deferred, logged above
Verification                               ⏳ deferred — part of the single comprehensive Phase 1 pass
```

**Deferred Token sub-items closed this pass (2026-07-15):**
- `RegistrationController`'s `getQueue`, `reserve`, `heartbeat`, `release`, `mapPatient`, `mapVisit`, `supervisorReset` routes now all carry `@UseInterceptors(TenantContextInterceptor)` — safe now that the derived-JWT gap is fixed. `queueStream` (SSE) deliberately left unwrapped — Nest's SSE handler returns an `Observable` outside the normal interceptor chain in a way worth its own dedicated check rather than assuming it behaves identically; logged as a small remaining item.
- `RegistrationService.mapPatient()`'s transactional writes (`TokenPatientMapping`, `MappingAuditLog`) and `supervisorReset()`'s `MappingAuditLog` write now stamp `tenantId` explicitly (resolved from the transaction's own `tokenRecord.branchId`) — these run on a raw `EntityManager`, so ambient interceptor context wouldn't have reached them regardless.
- `writeAudit()` (backs `reserveToken`'s and `releaseReservation`'s audit entries) gained an optional `tenantId` passthrough from callers that already have it resolved.
- `sweepExpiredReservations()` (a `@Cron` job — arguably B6's territory, but trivial here) copies `tenantId` directly from each expired `TokenReservation` row rather than re-resolving, since it was already stamped at `reserveToken()`'s write time.
- `WorkstationService.saveConfig()` (the walk-up, no-login bootstrap path) now stamps `WorkstationConfig.tenantId`, resolved from the already-validated `location.branchId` — deliberately not trusting the client-supplied `dto.branchId` directly, even though it comes from a legitimate public picker, matching every other Pattern 3 chain's "resolve via a server-verified entity" discipline. `workstation.module.ts` gained a `TenantModule` import.

**Still open, lower priority (reads, not writes — Pattern 3's core risk is at write time per A12/A13's original finding):** `DisplayService`'s public `findBySlug()`, `TokenKioskService.getBySlug()`/`getPublicKioskConfig()` — not yet given explicit chain-derived read scoping. Revisit if/when B9's `NOT NULL` rollout needs every row provably populated, since these are reads and don't create rows themselves.

**B5 Status:** ✅ interceptor fix, ✅ Feedback public writes, ✅ Token issueToken/reserveToken/mapPatient/supervisorReset/saveConfig, ⏳ 3 small deferred items logged above (queueStream SSE, 2 read-only public lookups). Verification deferred to the comprehensive Phase 1 pass.

---

## B6 — Background Job Tenant Threading — 🔶 IN PROGRESS (2026-07-15)

**Audit queue (`audit_logs`) — ✅ implemented, the flagship example establishing the pattern for every other job in this checkpoint.** `AuditService.log()` now resolves `tenantId` at *enqueue* time (inside the original request, where `TenantContextStorage`'s ambient context is still live if `TenantContextInterceptor` ran) via `TenantContextStorage.hasContext()`/`isSystemScope()`/`currentTenantId()`, defensively defaulting to `null` when no context exists (most background/cron-triggered `log()` calls, and any route that hasn't opted into the interceptor yet) rather than throwing. The resolved value is carried through the Bull job payload; `AuditProcessor` (the worker, with no HTTP surface and no access to the original request's `AsyncLocalStorage` context) just persists whatever was already resolved, never re-resolves itself. `audit.module.ts` gained a `TenantModule` import.

**Inventory of remaining background/system-execution write paths, not yet threaded — logged as B6's backlog, the pattern above ready to apply to each:**
1. **Attendance** (already surfaced as deferred at B4): `HisReconciliationJob`/`his-divergence.service.ts` (nightly, `@Cron('30 3 * * *')`-class job, writes `attendance_divergence_logs`), the 4 dependency pollers (`duty-plan`/`leave`/`holiday`/`shift-type`, writing `attendance_dependency_events`), `AttendanceReconciliation`, `retroactive-recalculation.service.ts`, `npnl-sweep.service.ts`. Each needs its own read to confirm what branch identifier (if any) is available at its specific write site — not assumed identical to the realtime pipeline's `INTRABRANCHID` threading.
2. **Token**: `TokenDailyResetService` (`@Cron('* * * * *')`, per-minute) and `TokenAnalyticsService`'s nightly aggregation (`@Cron('15 0 * * *')`) — both flagged since A13 as needing explicit tenant_id threading; both currently iterate branch-scoped data without tenant awareness. `TokenAnalyticsService` is also 100% raw SQL (`dataSource.query()`), so it's additionally blocked on the Mechanism Coverage Matrix gap, not just on B6's threading pattern.
3. **Loyalty**: `campaign.scheduler.ts`'s birthday-bonus cron and `loyalty.processor.ts`'s HIS batch-earn queue processor (both flagged at A7 as needing tenant resolution from the parent `LoyaltyAccount`, not request context).
4. **CMS**: asset/player-log cleanup jobs — not yet located/read this pass.
5. **Feedback**: none currently known — `FeedbackNotificationService`/campaign-related jobs not yet confirmed to exist as background workers versus request-scoped calls; needs a quick confirmation read, not assumed clean.

**Status:**
```
Audit queue (flagship pattern)   ✅ complete
Attendance's 6 deferred items    ⏳ inventoried, not yet threaded
Token daily reset / analytics    ⏳ inventoried, not yet threaded (analytics also blocked on raw-SQL gap)
Loyalty scheduler / processor    ⏳ inventoried, not yet threaded
CMS cleanup jobs                 ⏳ not yet located
Feedback background jobs         ⏳ existence not yet confirmed
Verification                     ⏳ deferred — part of the single comprehensive Phase 1 pass
```

**Rescoped (2026-07-15):** a direct code audit found `TenantScopedRepository` deliberately excludes `save()`/`create()` by design, deferring ALL write-path stamping to B6 — not just background jobs. Every ordinary session-authenticated `.create()` call across Loyalty, CMS, EIC, Feedback's admin routes, Token's session routes, Users/RBAC, and Notifications was inserting `tenant_id = NULL`. This is now fixed: a shared `TenantContextStorage.currentTenantIdOrNull()` helper was added, and every write site across all 8 module groups (~60 call sites) now stamps `tenantId` from ambient request context. Three items are flagged as explicit architectural decisions rather than stamped blindly: `CMSSettings`'s singleton-row semantics, `LicenseMasterEntity`/`VendorRegistration`'s instance-vs-tenant-level classification, and confirming `FeedbackLanguage`/`FeedbackSettings` stay correctly excluded per the existing §4 decision. Full detail in `HYBRID_ARCHITECTURE_LOG.md`'s "Checkpoint B6 — General Write-Path Stamping Complete" entry.

**Original background/cron-job inventory (Attendance's 6 items, Token's daily reset/analytics, Loyalty's scheduler/processor, CMS/Feedback's jobs) remains open** — logged, not blocking, not re-attempted this pass.

**B6 Status:** ✅ general write-path stamping complete · ⏳ background/cron inventory still open · ⏳ 3 architectural decisions flagged · ⏳ verification deferred to the comprehensive Phase 1 pass.

Next: B7 (API contract remediation).

---

**Goal:** wire B1's chain-derived helper into every confirmed Pattern 3 write path:

- Feedback: `FeedbackSubmission`, `FeedbackAnswer`, `FeedbackComplaint` (public create), `FeedbackAuditLog`'s public-triggered rows — chain is QR → Campaign → Branch.
- Token: `TokenRecord`, `TokenReservation`, `TokenKiosk`'s public read/issue path, `WorkstationConfig`, `MappingAuditLog`'s system-actor rows — chain is kiosk-slug → branchId or location-id → branchId.

This is the highest-risk write-path checkpoint precisely because there's no session to fall back on if resolution fails — define and test the failure mode explicitly (what happens if the chain can't resolve a tenant? reject the write, or fall back to `'default'`? this needs an explicit answer, not an assumption).

**Verification:** exercise both public flows end-to-end (QR scan → submit; kiosk walk-up → issue) against a real environment, including the failure-mode path.

---

## B6 — Background Job Tenant Threading

**Goal:** apply §6's per-job-class plan across every scheduled/async-worker job cataloged in A5, A7, A8, A9, A11, A12, A13's logs, **plus** every module B3 identified as background-only under its scoping rule (any persistence path reachable exclusively through a BullMQ `@Process()` handler or a `@Cron()` job, where request-scoped `AsyncLocalStorage` context is unavailable by the time the work executes). Most jobs are now trivially correct once B3–B5 land (they call into services that already populate tenant_id), but the cross-tenant-by-nature jobs (Attendance's `HisReconciliationJob`, Token's `TokenDailyResetService`) need an explicit per-tenant iteration decision, not an assumption that they'll "just work."

**Audit (`audit_logs`) is the first confirmed member of this checkpoint, moved here from B3 (2026-07-14) per the scoping rule above** — `AuditService.log()` enqueues a job; `AuditProcessor` (a Bull worker) performs the write with no HTTP surface at all. The tenant must be resolved and captured explicitly at *enqueue* time (inside the original request, where `TenantContextInterceptor`'s context is still live — e.g. via B1's `SessionTenantResolver` called directly from `AuditInterceptor`/`AuditService.log()`) and carried through the job payload, since the worker cannot rely on ambient context the way a request-scoped repository call can. Any other module found to be background-only during its own B3.x pre-flight follows this same pattern rather than being treated as a one-off exception.

**Verification:** confirm each job still runs to completion and correctly scopes its work per tenant (trivial with one tenant today, but structured so a second tenant wouldn't break it). For Audit specifically: confirm every enqueued job payload carries an explicit `tenantId` and `AuditProcessor` stamps it on write without depending on any ambient context.

---

## B7 — API Contract Remediation (Workstream 4, consolidated)

**Goal:** close all six pending audits as one initiative, in the order the design doc recommends (highest exposure first): A12.5 and A13.5 (unauthenticated surfaces) → A8.5 and A11.5 (broadest DTO gaps) → A7.5 and A9.5 (narrowest, most contained). Reuse the explicit-select/post-fetch-strip pattern validated at A5.5/A7's fixes.

This can run in parallel with B3–B6 rather than strictly after them, since it's a read-side response-shaping fix independent of write-path population — but do it before B9's `NOT NULL` rollout, since a `NOT NULL` `tenant_id` leaking through an unprotected GET response is a more serious exposure than a nullable one.

**Verification:** for each audited module, confirm the same round-trip test used at A5.5 (GET → edit → PATCH) no longer fails, and confirm no raw entity response leaks `tenant_id` unfiltered.

**Status: ✅ COMPLETE (2026-07-15).** All six audits closed for the tenant_id-leak angle: ~65 GET methods fixed across Loyalty (8), Attendance (1), EIC (8 files), CMS (17), Feedback (~9), Token (~15), prioritizing public/unauthenticated surfaces first (CMS player endpoints, Feedback's anonymous QR portal, Token's kiosk/workstation lookups) per this section's stated ordering. Full detail in `HYBRID_ARCHITECTURE_LOG.md`'s "Checkpoint B7" entry. Two related items explicitly flagged as separate future work, not folded into this checkpoint: a handful of write-path (POST/PATCH) response bodies still spread raw entities including `tenantId`, and EIC's pre-existing missing-DTO-validation hygiene gap (4 controllers use plain TS interfaces, 2 use loose `@Body()`).

---

## B8 — Global/Shared Resource Policy Implementation (reduced scope, resolved during B0)

**§4 resolution (see `STAGE_B_DESIGN.md` §4, resolved 2026-07-14):** of the original eight tables flagged as open policy questions, seven resolved to normal tenant-owned write-path population and are handled directly in their module's own checkpoint (B3.4 for `CardCategory`/`RewardCatalog`, B3.6 for `CMSEmergencyBroadcast`, B3.7 for `DisplayPage`, B4 for `AttendanceRule`/`AttendanceGovernanceLock`/`AttendanceDependencyEvent`). This checkpoint's scope has shrunk accordingly. *(Sub-checkpoint numbers updated 2026-07-14 to match B3's revised module order — see B3's own note.)*

**Remaining goal:** `feedback_languages` is the only table that stays permanently global — no write-path population needed at all, `tenant_id` remains `NULL` by design. This checkpoint's only job is to confirm B2's read-side enforcement is explicitly configured to skip this table (never apply a tenant filter to it) and to permanently exclude it from B9-B11's tightening steps, since it will never satisfy a `NOT NULL` constraint by design.

**Verification:** confirm `feedback_languages` reads work identically for every tenant (no filtering applied), and confirm B9's `NOT NULL` rollout skips it without needing a special case elsewhere in the migration tooling.

**Status: ✅ CONFIRMED (2026-07-15).** `FeedbackLanguageService` (`src/modules/feedback/languages/feedback-language.service.ts`) only ever injects the raw `Repository<FeedbackLanguage>` — never `TenantScopedRepository` — confirmed directly via code read during B6/B7. There is no enforcement wrapping applied to this entity at all, so there's nothing to special-case or skip: `feedback_languages` was never brought under B2's filtering mechanism in the first place, which is the simplest possible way to guarantee B9 needs no carve-out for it later.

---

## B9 — Migration Tightening: `NOT NULL`

**Goal:** per §8 step 1–2, table by table, only after confirming zero new `tenant_id IS NULL` rows since each table's B3–B4 cutover. Sequence: Pattern 1 tables first (simplest to verify coverage), Pattern 2 (Attendance) next, Pattern 3 tables (Feedback/Token public surfaces) last, since those are hardest to guarantee 100% coverage on. `feedback_languages` is permanently excluded (per B8) — it stays global with `tenant_id IS NULL` by design and never gets `NOT NULL`. All other formerly-open Category A/B tables were resolved to normal tenant-owned population back in B3/B4, so they follow the standard sequence like any other table — no separate carve-out needed here anymore.

**Each table's `NOT NULL` addition is its own deployable, independently revertible unit** — not a single combined migration like Stage A used. This is the one place Stage B's methodology deliberately differs from Stage A's, per §8's explicit guidance.

**Verification per table:** the coverage query (`SELECT COUNT(*) FROM <table> WHERE tenant_id IS NULL AND created_at > <cutover>`) returns 0 before applying, and normal write traffic continues successfully after.

---

## B10 — Migration Tightening: Foreign Keys to `tenant`

**Goal:** per §8 step 3, same table ordering as B9, applied only after each table's `NOT NULL` has been live and verified for a full traffic cycle. Given Stage A guaranteed every existing row is `'default'`, this should never fail an existing-data check.

**Verification:** confirm the FK constraint doesn't reject any legitimate write path (a symptom of a B3–B5 resolution gap that `NOT NULL` alone wouldn't have caught).

---

## B11 — Composite Uniqueness Constraint Updates

**Goal:** per §8 step 4, audit each flagged candidate individually — don't blanket-append `tenant_id` to every existing unique constraint without checking intended semantics:
- `LoyaltyAccount.patientMrn` / `cardNumber` — currently globally unique, evaluate whether unique-per-tenant is the correct target semantic.
- `CardCategory.code` — now tenant-owned per §4/B3.4; evaluate whether unique-per-tenant is the correct target semantic.
- `AttendanceRule.code` — now tenant-owned per §4/B4; same evaluation.
- Token's `token_sc_configs` uniqueness — evaluate alongside the incidental `token_sc_config`/`token_sc_configs` bug fix (tracked separately per the design doc's appendix, but touches the same table).

**Verification:** confirm no legitimate existing use case relied on the old global-uniqueness semantic before narrowing it.

---

## B12 — Final Full Integration Verification + Rollback Test

**Goal:** run the §9 verification checklist again against the fully tightened schema (not just Stage A's additive state), and execute at least one real rollback test per §10's feature-flagged approach — sequence: drop composite constraints → drop FK → drop `NOT NULL` → disable read enforcement → disable write-path resolution, never as a single combined revert.

**Exit criteria:** every item in the design doc's §11 Stage B Completion Criteria checklist is satisfied. Only then does Stage B get marked complete.

---

## Checkpoint Dependency Summary

```
B0 (gate: verification [outstanding] + §4 policy [✅ done 2026-07-14])
 │
 ├──> B1 (resolvers, no wiring) ── ✅ done
 │      │
 │      └──> B2 (enforcement mechanism, built not enabled) ── ✅ done
 │             │
 │             └──> B3 (Pattern 1 rollout, ONE module at a time, dry-run phase folded in per-module
 │                    │  — B2.5 no longer a separate global checkpoint, see B2.5's entry.
 │                    │  Order: B3.1 Audit/Notification → B3.2 Licensing → B3.3 Users/RBAC →
 │                    │  B3.4 Loyalty → B3.5 EIC → B3.6 CMS → B3.7 Token(P1) → B3.8 Feedback(P1))    ──┐
 │                    │        (includes all §4-resolved tenant-owned tables: CardCategory,            │
 │                    │        RewardCatalog, DisplayPage, CMSEmergencyBroadcast)                       │
 │                    ├──> B4 (Attendance, Pattern 2 + own dry run — now includes                       ├──> B6 (background jobs)
 │                    │        AttendanceRule, AttendanceGovernanceLock, AttendanceDependencyEvent)     │
 │                    └──> B5 (Feedback/Token public, Pattern 3                                         │
 │                           + own dry run) ──────────────────────────────────────────────────────────┘
 │
 ├──> B7 (API contract remediation — parallel to B3-B6)
 │
 └──> B8 (near-vestigial: only confirms FeedbackLanguage stays excluded from B9-B11 —
          its substantive §4 decisions were absorbed into B3/B4 above)
        │
        ▼
       B9 (NOT NULL, table by table) ──> B10 (FK) ──> B11 (uniqueness) ──> B12 (final verification + rollback test)
```

**Logging convention:** each checkpoint (B1–B12) gets the same treatment A1–A13 received in `HYBRID_ARCHITECTURE_LOG.md` — pre-flight, implementation, deferred work, architectural lessons, status. This plan is the roadmap; the log remains where execution reality gets recorded, including any deviation from this sequencing.
