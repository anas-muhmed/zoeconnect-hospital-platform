# Stage B Design Document — Hybrid Architecture, Tenant Foundation

**Version:** 1.0-pending — becomes v1.0 (approved architectural baseline) upon successful completion of the §9 office-environment integration verification pass. Currently draft.
**Source of record for individual checkpoint history:** `HYBRID_ARCHITECTURE_LOG.md`. This document is the synthesis; the log remains the detailed journal and should still receive entries as Stage B checkpoints execute.

**Change policy (effective once this reaches v1.0):** This document is the approved architectural baseline for Stage B and should not be edited incrementally during implementation. Day-to-day implementation decisions, deviations, and discoveries belong in `HYBRID_ARCHITECTURE_LOG.md`. If a major architectural assumption in this document changes during implementation — most likely candidate: the §4 Global/Shared Resource Policy resolving differently than the direction assumed here — publish a new minor version (v1.1, v1.2, ...) with an explicit changelog entry below, rather than silently rewriting the affected section. Minor clarifications that don't change a decision (typo fixes, formatting) don't require a version bump.

**Version history:**
- v1.0-pending (2026-07-14) — initial consolidated draft, covering Checkpoints A1–A13 plus deferred A6/A10. Not yet approved — awaiting §9 verification pass.

---

## 1. Objectives

Stage A added a nullable `tenant_id UUID` column, backfilled to a seeded `'default'` tenant, across every live, migrated, production-connected table in the codebase — purely additive, with zero behavior change and zero runtime enforcement. Its job was narrow and is now done: give every table a place to record ownership without touching a single write path.

Stage B's objective is the opposite half of the same problem: make `tenant_id` load-bearing. Concretely, Stage B must:

- Populate `tenant_id` correctly on every new row, using the right resolution strategy for that write path.
- Enforce `tenant_id` at read time so cross-tenant data never leaks through a query that forgot to filter.
- Tighten the schema (`NOT NULL`, foreign keys, composite unique constraints) once every write path is confirmed to populate it correctly.
- Resolve the handful of genuine architectural questions Stage A surfaced but deliberately did not answer (global/shared resources, ownerless-by-design rows, two still-open classification calls).
- Do all of this without repeating Stage A's mistake class in reverse — i.e., don't flip a switch that assumes 100% write-path coverage before verifying it.

Stage B is **not** a re-audit. Every table, write path, scheduler, and raw SQL site relevant to this work was already inventoried in Stage A. Stage B's job is to act on that inventory, not rediscover it.

---

## 2. Tenant Model

- One `tenant` table, seeded with a single row (`code: 'default'`) in Checkpoint A1. `TenantContextService` resolves and caches this UUID lazily.
- Today's system is genuinely single-tenant in production. Stage A's `tenant_id` columns are inert — no code reads them yet.
- Stage B does not need to build multi-tenant *product* features (tenant switching UI, tenant provisioning flow, etc.) as a prerequisite — it needs to make the existing single tenant's data correctly and consistently tagged, which is the actual precondition for ever adding a second tenant safely.
- Every table's `tenant_id` was backfilled to the same `'default'` tenant. There is no migration risk in tightening columns to `NOT NULL` once write paths are fixed, because there is currently no row in any table that isn't already correctly tagged.

---

## 3. Resolution Strategies

Three ownership patterns were identified across all 13 checkpoints. This is the single most important finding of Stage A: **the design space is closed, not open** — Token (A13), the module expected to be most likely to introduce a fourth pattern, introduced none.

### Pattern 1 — Session-derived (the default, most tables)

Tenant is resolved from the authenticated request context (JWT/session) at write time, or derivable via a Postgres FK join back to a root entity that itself is session-derived. Covers the large majority of tables: Settings, Licensing, Auth/RBAC, Audit/Notification, Loyalty, EIC, most of CMS, most of Feedback, most of Token.

**Stage B implementation:** a request-scoped `TenantContextService`-equivalent (or extension of the existing one) that middleware/interceptor-populates on every authenticated request; write paths read from it instead of hardcoding `'default'`.

### Pattern 2 — External/Oracle-derived (Attendance only, confirmed exception)

No Postgres join can resolve tenant. Employee identity in Attendance lives entirely in Oracle HIS, resolved live per-request via `RosterResolver` using Oracle's `INTRABRANCHID`. Tenant must be resolved from that external identifier and stamped onto the row at write time — never derivable after the fact.

**Stage B implementation:** extend `RosterResolver` (or wherever `INTRABRANCHID` is first resolved) to also resolve/attach `tenant_id`, and thread it through `RosterContext`/`AttlogPunch` so every downstream write (events, audit, snapshot, divergence, skip, governance) receives it directly rather than trying to derive it later.

### Pattern 3 — Anonymous chain-derived (Feedback public API, Token kiosk/workstation)

The write happens with no authenticated session at all (public QR-scan form submission, kiosk walk-up token issuance, workstation walk-up configuration). Tenant is still derivable via a Postgres FK chain, but the chain must be resolved and stamped **server-side** at write time — never trusted from client input, and never assumed to come from a request-scoped user because there isn't one.

Confirmed instances:
- Feedback: `FeedbackSubmission`, `FeedbackAnswer`, `FeedbackComplaint` (initial create) — chain is QR→campaign→branch.
- Token: `TokenRecord`, `TokenReservation`, `WorkstationConfig`, `TokenKiosk` (read/issue path) — chain is kiosk-slug→branchId or location-id→branchId.

**Stage B implementation:** a shared helper (see §6, "chain-derived resolution helper") that each anonymous endpoint calls explicitly, resolving tenant from whatever local identifier is already being resolved for other purposes (the QR token, the kiosk slug) — not a new lookup, just attaching tenant to work already being done.

### Pattern coverage table

| Pattern | Modules | Resolver location |
|---|---|---|
| 1 — Session-derived | Settings, Licensing, Auth/RBAC, Audit/Notification, Loyalty, EIC, CMS (majority), Feedback (majority), Token (majority) | Request-scoped context, populated by auth middleware |
| 2 — External/Oracle-derived | Attendance (all 9 tables) | `RosterResolver`, using `INTRABRANCHID` |
| 3 — Anonymous chain-derived | Feedback public submission/complaint/answer; Token kiosk/workstation/record/reservation | Per-endpoint explicit chain resolution at the public controller/service boundary |

No fourth pattern has been found through A13. If one appears in future work outside this migration's scope, treat it as a new finding requiring the same depth of audit A9 and A12 received — don't assume it fits an existing pattern by default.

---

## 4. Global/Shared Resource Policy — RESOLVED (2026-07-14)

Not every table fit a per-tenant ownership model at the time Stage A closed. These eight tables were deliberately left unresolved rather than forcing an answer during the migration itself. All eight are now decided, closing the second prerequisite of B0.

**Category A — Deliberately global, no branch/tenant column ever existed:**

| Table | Decision | Rationale |
|---|---|---|
| `feedback_languages` (A12) | **Stay permanently global** — `tenant_id` remains `NULL` forever; every tenant shares the same language pool. | A shared language list (`en`, `ar`, `hi`, ...) is genuine shared infrastructure — converting it would mean every new tenant re-adding the same handful of languages with no benefit. |
| `display_pages` (A13, Token) | **Convert to tenant-owned.** | Unlike the language pool, display page templates/slugs are customer-facing configuration a hospital would reasonably want to control independently. |
| `AttendanceRule` (A9) | **Convert to tenant-owned.** | Attendance policy (shift rules, grace periods) is typically hospital-specific HR policy, not shared infrastructure. |
| `CardCategory` (A7, Loyalty) | **Convert to tenant-owned.** | Loyalty tier structures are likely to diverge across hospitals over time. |
| `RewardCatalog` (A7, Loyalty) | **Convert to tenant-owned.** | Reward menus are likely hospital-specific (local partnerships, budget). |

**Category B — Ownerless by design (a null value has real semantic meaning, not "unmigrated"):**

| Table | Decision | Rationale |
|---|---|---|
| `CMSEmergencyBroadcast.branchId = NULL` | **Preserve the global semantic within each tenant.** `tenant_id` gets populated normally (the broadcast belongs to one tenant); `branchId = NULL` continues to mean "every display **within that tenant**," not across tenants. | Global-across-branches and global-across-tenants are different things — an emergency broadcast should never leak across two different hospitals. |
| `AttendanceGovernanceLock` scope=ALL | **Preserve the global semantic within each tenant.** Same pattern — `tenant_id` populated normally; scope=ALL means "every employee within that tenant." | A payroll freeze spanning two unrelated hospitals would be a serious bug, not a feature. |
| `AttendanceDependencyEvent` scope=GLOBAL/CONFIG | **Preserve the global semantic within each tenant.** Same pattern. | A holiday or shift-type change in one hospital must not cascade into another tenant's schedule. |

**Consequence for implementation planning:** the four Category A tables converted to tenant-owned (`display_pages`, `AttendanceRule`, `CardCategory`, `RewardCatalog`) are no longer exceptions requiring their own separate policy-implementation checkpoint — they fold into the normal Pattern 1 (session-derived) rollout alongside every other table in their module, since they're now ordinary tenant-owned config with a trivial single-row-per-tenant migration path (today's single row simply becomes `'default'` tenant's row, same as everything else). `feedback_languages` remains the only table that stays permanently global with no Stage B write-path work at all. The three Category B tables need one specific implementation detail: their existing scope=ALL/GLOBAL/CONFIG rows populate `tenant_id` normally (via the same session-derived resolver as everything else in their module) — the "global" behavior is preserved entirely in application logic (the scope check), not by leaving `tenant_id` null.

---

## 5. Repository Enforcement Strategy

Once write paths reliably populate `tenant_id` (§3), reads need equivalent enforcement so a missing `WHERE tenant_id = ...` clause can't leak cross-tenant data. Recommended approach, in order of preference:

1. **TypeORM subscriber/interceptor-based automatic scoping** — a global query interceptor that injects `WHERE tenant_id = :currentTenant` onto every repository call for tenant-owned entities, keyed off the entity's own metadata (e.g., a marker decorator or an interface). This avoids relying on every developer remembering to add the clause manually, which is the same class of defect the A5.5/A7.5/etc. audits kept finding at the *response* layer — don't recreate it at the *query* layer.
2. **Explicit repository wrapper/base class** as a fallback for entities where the interceptor approach doesn't cleanly apply (e.g., raw SQL sites cataloged in every checkpoint's audit — Loyalty's bulk tier UPDATE, Attendance's divergence UPDATE, Token's sequence UPSERT).
3. **Global/shared tables (§4) are explicitly exempted** from this enforcement until their policy is decided — don't accidentally scope a table that's supposed to stay global.

This must be designed before `NOT NULL` is added anywhere, since `NOT NULL` without read-side enforcement just guarantees every row has *a* tenant, not that queries respect it.

---

## 6. Background Job Strategy

Every checkpoint's audit inventoried its scheduled jobs. None of them currently thread `tenant_id`. Stage B needs an explicit plan per job class, not a blanket "add tenant_id everywhere":

- **Single-tenant-scoped-per-run jobs** (most reconciliation/aggregation jobs) — straightforward: iterate tenants, run the existing per-branch logic once per tenant instead of globally.
- **Cross-tenant-by-nature jobs** (e.g., Attendance's `HisReconciliationJob`, Token's `TokenDailyResetService`) — currently iterate all branches globally in one pass; Stage B must decide whether to keep that shape (with tenant resolved per-branch inside the loop) or split into per-tenant runs.
- **Chain-derived resolution helper** referenced in §3, Pattern 3 — background jobs that touch Pattern-3 tables (e.g., `RegistrationService.sweepExpiredReservations`) need the same server-side chain resolution as their originating write path, applied consistently.

Full inventory (job, cadence, pattern needed) should be pulled directly from each checkpoint's log entry rather than re-derived — A5, A7, A8, A9, A11, A12, and A13 each already cataloged their schedulers.

---

## 7. API Contract Remediation Plan (Workstream 4)

Six pending audits, all instances of the same underlying class of defect first found at A5.5 (`feedback_settings`): a controller returns a raw, unfiltered entity, and once that entity carries `tenant_id` (or any other newly-added field), either it leaks in a GET response, or a strict-whitelist PATCH DTO rejects a client that round-trips the object.

| Audit | Module | Status | Notably different from A5.5's original finding |
|---|---|---|---|
| A7.5 | Loyalty | Pending | None — same class |
| A8.5 | EIC | Pending | Broader — 4 of 9 controllers accept plain TS interfaces with zero `class-validator` enforcement, not just raw-entity leaks |
| A9.5 | Attendance | Partial | `AttendanceController` confirmed clean; `AttendanceMonitoringService` (559 lines) unverified |
| A11.5 | CMS | Pending | Broader still — zero response DTOs *and* zero request-validation DTOs anywhere in the module |
| A12.5 | Feedback | Pending | First instance on an **unauthenticated public surface** — the public GET endpoint embeds unprojected nested entity trees |
| A13.5 | Token | Pending | Kiosk/workstation public surfaces need the same review as A12.5, plus admin raw-entity responses |

**Recommended sequencing:** treat this as one platform-wide initiative, not six independent tasks, per the user's own framing. Fix in order of exposure risk: A12.5 and A13.5 first (unauthenticated surfaces), then A8.5/A11.5 (broadest DTO gaps), then A7.5/A9.5 (narrowest, most contained). Reuse the explicit-`select`-projection or post-fetch-strip pattern validated at A5.5/A7 fixes rather than inventing a new approach per module.

---

## 8. Migration Tightening Plan

Only begin after §3 (resolution strategies) are implemented and verified in production for a full write-path cycle, and §4 (global/shared policy) is decided.

1. **Verify write-path coverage first.** For every table, confirm zero new rows are being written with `tenant_id = NULL` before tightening. This is a query, not a guess — `SELECT COUNT(*) FROM <table> WHERE tenant_id IS NULL AND created_at > <cutover_date>`.
2. **`NOT NULL`**, table by table, starting with the tables that have the simplest resolution strategy (Pattern 1) and ending with Pattern 3 tables (Feedback/Token public surfaces), since those are hardest to guarantee 100% coverage on.
3. **Foreign key to `tenant`**, same ordering. Given every existing row is already `'default'`, this should never fail an existing-data check — only new-row coverage gaps would surface here.
4. **Composite unique constraints** where tenancy changes uniqueness semantics — flagged candidates from the checkpoint logs: `LoyaltyAccount.patientMrn`/`cardNumber` (currently globally unique, should likely become unique-per-tenant), `CardCategory.code`, `AttendanceRule.code`, any Token `token_sc_configs` uniqueness. Audit each individually; don't assume every existing unique constraint should just get `tenant_id` appended without checking the intended semantics.
5. **Global/shared tables (§4) are excluded** from all of the above until their policy is resolved.

Do not batch this work the way Stage A's backfills were batched — Stage A migrations were single atomic `ALTER TABLE`s because they were purely additive. Stage B's `NOT NULL`/FK changes carry real risk of breaking a write path that was missed in §3, so each table's tightening should be its own deployable, independently revertible unit, verified against real traffic before the next one proceeds.

---

## 9. Verification Strategy

**Per Stage A checkpoint (A7, A8, A9, A11, A12, A13):** still owed one cumulative integration verification pass in the office environment, not six separate ones. Recommended single pass, once the `hybrid-architecture` branch is pushed:

1. `npm run migration:run` (all pending migrations, in order)
2. `npm run migration:revert` × N, then re-run (rollback verification, at least for the most recent 2–3 migrations)
3. Backend build, frontend build
4. Application boot
5. Authentication (login/logout/refresh/RBAC-protected endpoint/unauthorized-denial)
6. CMS (playlist CRUD, publish, display assignment, emergency broadcast, ticker)
7. Feedback (form CRUD, QR generation, public submission, complaint flow, campaign)
8. Loyalty (enroll, earn, redeem, reverse/adjust, campaign bonus, balance integrity before/after)
9. Attendance (punch ingestion, dependency polling, reconciliation, governance lock/skip)
10. Token (kiosk issue, counter call/recall, registration mapping, display update, analytics aggregation, daily reset, sequence continuity)
11. EIC (patient intake, enrollment, assessment, session, progress report, discharge, preschool track)
12. Licensing (status, fingerprint, registration, history)
13. Oracle/HIS integration (all read paths; the one write path — Token's `PRINT_DATA_DETAIL` MERGE)
14. Public endpoints specifically (Feedback public submission, Token kiosk/workstation/display) — the two Pattern-3 surfaces
15. Background jobs (all `@Cron` jobs listed in §6, confirmed to still run and complete without error)
16. Database verification: `tenant_id` populated on all migrated tables, all rows on `'default'`

Only after this full pass should A7/A8/A9/A11/A12/A13 be marked ✅ complete in the tracker (currently all "Awaiting Integration Verification").

**For Stage B**, verification strategy is per-table-tightening (§8) — each `NOT NULL`/FK change gets its own before/after write-path check, not a single end-of-phase pass.

---

## 10. Rollback Strategy

**Stage A rollback (already proven, low-risk):** every migration has a symmetric `down()` — `DROP INDEX` + `DROP COLUMN`. Confirmed safe at every checkpoint because nothing reads `tenant_id` yet; reverting is a pure schema no-op from the application's perspective. The one operational lesson already learned (A2's login-break incident): entity and migration changes must be applied/reverted **atomically** — never run a live app instance against a schema state that doesn't match its compiled entity metadata.

**Stage B rollback (needs its own plan, not inherited from Stage A):** once write paths populate `tenant_id` and reads enforce it, a revert is no longer a schema no-op — reverting the read-enforcement layer while leaving `NOT NULL`/FK constraints in place (or vice versa) could break the running application. Recommended approach:
- Feature-flag the read-enforcement layer (§5) independently of the schema tightening (§8), so either can be disabled without touching the other.
- Sequence rollback in reverse order of §8's tightening steps (drop composite constraints → drop FK → drop `NOT NULL` → disable read enforcement → disable write-path resolution), never as a single combined revert.
- Because Stage A guaranteed every row starts as `'default'`, a full Stage B rollback to Stage A's state is always safe from a data-integrity standpoint — the risk is entirely in application behavior during a partial rollback, not data loss.

---

## 11. Stage B Completion Criteria

Stage B is complete when all of the following are true — not before:

- [ ] No new rows are created with `tenant_id IS NULL` anywhere, except on tables explicitly approved as global/shared under §4's resolved policy.
- [ ] All three resolution strategies (§3) are implemented and verified in production: session-derived, Oracle-derived (Attendance), anonymous chain-derived (Feedback public surface, Token kiosk/workstation).
- [ ] The Global/Shared Resource Policy (§4) is decided and implemented for every Category A and Category B table.
- [ ] Repository/read-side enforcement (§5) is enabled for every tenant-owned entity — no query path can silently return cross-tenant rows.
- [ ] All background jobs (§6) correctly thread tenant context, per their assigned strategy.
- [ ] All six pending API contract audits (A7.5, A8.5, A9.5 completion, A11.5, A12.5, A13.5 — §7) are complete and their findings remediated.
- [ ] `NOT NULL` constraints are applied to every table where write-path coverage has been verified (§8, step 1–2).
- [ ] Foreign keys to `tenant` are applied where applicable (§8, step 3).
- [ ] Composite uniqueness constraints are updated where tenancy changes uniqueness semantics (§8, step 4) — including the flagged candidates (`LoyaltyAccount.patientMrn`/`cardNumber`, `CardCategory.code`, `AttendanceRule.code`, Token's `token_sc_configs` uniqueness).
- [ ] The full cumulative integration verification pass (§9) has been run against the tightened schema, not just against Stage A's additive state.
- [ ] Rollback has been tested for at least one full tightening cycle (§10) — not just Stage A's schema-only revert, but a real revert of a `NOT NULL`/FK/enforcement change under the feature-flagged approach.

Stage B should not be declared complete module-by-module in isolation the way Stage A checkpoints were — because read-side enforcement is cross-cutting, a single un-migrated or un-enforced table can undermine the guarantees Stage B is meant to provide for every other table. Track progress per-table against this list, but only declare Stage B itself done when every row is checked.

---

## Appendix A — Tenant Classification Matrix

Canonical reference for "how is tenant determined for this entity." Organized by checkpoint/module. Every entity that received `tenant_id` in Stage A is listed; entities marked **Global policy** or **Shared-global** are those still awaiting the §4 decision — until that decision lands, treat their Stage B action as blocked, not skippable.

### A2 — Settings
| Entity | Table | Resolution Pattern | Stage B Action |
|---|---|---|---|
| SystemSetting | system_settings | 1 — Session-derived | Populate from request context |
| CmsSettings | cms_settings | 1 — Session-derived | Populate from request context |
| FeedbackSettings | feedback_settings | 1 — Session-derived | Populate from request context (already contract-audited, A5.5) |

### A3 — Licensing
| Entity | Table | Resolution Pattern | Stage B Action |
|---|---|---|---|
| LicenseMaster | license_master | 1 — Session-derived | Populate from request context |
| LicenseRequest | license_requests | 1 — Session-derived | Populate from request context |
| VendorRegistration | vendor_registrations | 1 — Session-derived | Populate from request context |
| HisSchemaConfig | his_schema_configs | 1 — Session-derived | Populate from request context |

### A4 — Auth/RBAC
| Entity | Table | Resolution Pattern | Stage B Action |
|---|---|---|---|
| User | users | 1 — Session-derived | Populate from request context |
| Role | roles | 1 — Session-derived | Populate from request context |
| Permission | permissions | 1 — Session-derived | Populate from request context |
| PasswordResetRequest | password_reset_requests | 1 — Session-derived | Populate from request context |

### A5 — Audit/Notification
| Entity | Table | Resolution Pattern | Stage B Action |
|---|---|---|---|
| AuditLog | audit_logs | 1 — Session-derived | Populate from request context |
| NotificationLog | notification_logs | 1 — Session-derived | Populate from request context |
| NotificationTemplate | notification_templates | 1 — Session-derived | Populate from request context (contract-audited, A5.5) |

### A7 — Loyalty
| Entity | Table | Resolution Pattern | Stage B Action |
|---|---|---|---|
| LoyaltyAccount | loyalty_accounts | 1 — Session-derived | Populate from request context; revisit unique(patientMrn)/unique(cardNumber) → per-tenant uniqueness |
| LoyaltyTransaction | loyalty_transactions | 1 — Session-derived (via account_id) | Populate at write time; 2 write paths are cron/queue-triggered — resolve tenant from parent account, not request context |
| CardCategory | card_categories | 1 — Session-derived (§4-resolved: converted to tenant-owned) | Populate from request context; no longer an exception, joins normal Loyalty B3 rollout |
| Campaign | campaigns | 1 — Session-derived | Populate from request context |
| RewardCatalog | reward_catalog | 1 — Session-derived (§4-resolved: converted to tenant-owned) | Populate from request context; no longer an exception, joins normal Loyalty B3 rollout |
| RewardRedemption | reward_redemptions | 1 — Session-derived (via account_id) | Populate from request context |

### A8 — EIC (all derive from EicPatient, the root)
| Entity | Table | Resolution Pattern | Stage B Action |
|---|---|---|---|
| EicPatient | eic_patients | 1 — Session-derived | Populate from request context; root of ownership chain |
| EicDevelopmentalHistory | eic_developmental_histories | 1 — Derived (patient_id) | Populate via join at write time |
| EicTherapyEnrollment | eic_therapy_enrollments | 1 — Derived (patient_id) | Populate via join at write time |
| EicTherapyTeamMember | eic_therapy_team_members | 1 — Derived (enrollment_id) | Populate via join at write time |
| EicAssessment | eic_assessments | 1 — Derived (enrollment_id) | Populate via join at write time |
| EicGoal | eic_goals | 1 — Derived (enrollment_id) | Populate via join at write time |
| EicTherapySession | eic_therapy_sessions | 1 — Derived (enrollment_id) | Populate via join at write time (highest-volume EIC table) |
| EicSessionEntry | eic_session_entries | 1 — Derived (session_id) | Populate via join at write time |
| EicProgressReport | eic_progress_reports | 1 — Derived (enrollment_id) | Populate via join at write time |
| EicDisciplineProgressSection | eic_discipline_progress_sections | 1 — Derived (progress_report_id) | Populate via join at write time |
| EicDischargeSummary | eic_discharge_summaries | 1 — Derived (enrollment_id) | Populate via join at write time |
| EicDischargeSection | eic_discharge_sections | 1 — Derived (discharge_id) | Populate via join at write time |
| EicPreschoolEnrollment | eic_preschool_enrollments | 1 — Derived (patient_id) | Populate via join at write time |
| EicPreschoolAssessment | eic_preschool_assessments | 1 — Derived (preschool_enrollment_id) | Populate via join at write time |
| EicPreschoolDailyReport | eic_preschool_daily_reports | 1 — Derived (preschool_enrollment_id) | Populate via join at write time (high-volume) |
| EicEnrollmentDisciplineAssignment | eic_enrollment_discipline_assignments | 1 — Derived (enrollment_id) | Populate via join at write time |

### A9 — Attendance (the confirmed Pattern 2 module)
| Entity | Table | Resolution Pattern | Stage B Action |
|---|---|---|---|
| AttendanceEvent | attendance_events | 2 — Oracle-derived | Populate from `RosterResolver` (INTRABRANCHID) |
| AttendanceAudit | attendance_audit | 2 — Oracle-derived | Populate from `RosterResolver` |
| AttendanceRule | attendance_rules | 1 — Session-derived (§4-resolved: converted to tenant-owned) | Populate from request context; no longer an exception, joins normal rollout |
| AttendanceReconciliation | attendance_reconciliation | 1 — System-owned/Session-adjacent | Populate per-branch during job run |
| AttendanceDependencyEvent | attendance_dependency_events | 2 — Oracle-derived for scope=EMPLOYEE; scope=GLOBAL/CONFIG rows are §4-resolved (populate `tenant_id` normally via RosterResolver, "global" preserved as an app-level scope check, not a NULL tenant) | Populate from RosterResolver for all rows regardless of scope |
| AttendanceDependencySnapshot | attendance_dependency_snapshots | 2 — Oracle-derived | Populate from `RosterResolver`; raw UPDATE in `his-divergence.service.ts` needs explicit scoping |
| AttendanceDivergenceLog | attendance_divergence_logs | 2 — Oracle-derived | Populate from `RosterResolver` |
| AttendanceGovernanceLock | attendance_governance_locks | 2 — Oracle-derived for scope=EMPLOYEE/DEPARTMENT; scope=ALL is §4-resolved (populate `tenant_id` normally, "global" preserved as an app-level scope check, not a NULL tenant) | Populate from RosterResolver for all rows regardless of scope |
| AttendanceSkipLog | attendance_skip_logs | 2 — Oracle-derived | Populate from `RosterResolver` |

### A11 — CMS
| Entity | Table | Resolution Pattern | Stage B Action |
|---|---|---|---|
| CMSMedia | cms_media | 1 — Session-derived | Populate from request context |
| CMSPlaylist | cms_playlists | 1 — Session-derived | Populate from request context |
| CMSPlaylistItem | cms_playlist_items | 1 — Derived (playlist_id) | Populate via join at write time |
| CMSPublishVersion | cms_publish_versions | 1 — Derived (playlist_id) | Populate via join at write time |
| CMSDisplayAssignment | cms_display_assignments | 1 — Session-derived | Populate from request context; high-frequency heartbeat writes need care |
| CMSPlaylistSchedule | cms_playlist_schedules | 1 — Derived (display_assignment_id) | Populate via join at write time |
| CMSAuditLog | cms_audit_logs | 1 — Session-derived | Populate from request context |
| CMSDisplayGroup | cms_display_groups | 1 — Session-derived | Populate from request context |
| CMSDisplayCommand | cms_display_commands | 1 — Derived (display_assignment_id) | Populate via join at write time |
| CMSEmergencyBroadcast | cms_emergency_broadcasts | 1 — Session-derived, including branchId=NULL rows (§4-resolved: "global" preserved as an app-level branchId=NULL check within the tenant, not a NULL tenant) | Populate `tenant_id` from request context for all rows regardless of branchId |
| CMSPlayerLog | cms_player_logs | 1 — Derived (display_assignment_id) | Populate via join at write time (high write volume) |
| CMSTickerMessage | cms_ticker_messages | 1 — Derived (display_assignment_id) | Populate via join at write time |

### A12 — Feedback (the confirmed Pattern 3 introduction)
| Entity | Table | Resolution Pattern | Stage B Action |
|---|---|---|---|
| FeedbackForm | feedback_forms | 1 — Session-derived | Populate from request context; root of ownership chain |
| FeedbackSection | feedback_sections | 1 — Derived (form_id) | Populate via join at write time |
| FeedbackQuestion | feedback_questions | 1 — Derived (form_id) | Populate via join at write time |
| FeedbackQuestionOption | feedback_question_options | 1 — Derived (question_id) | Populate via join at write time |
| FeedbackQuestionCondition | feedback_question_conditions | 1 — Derived (question_id) | Populate via join at write time |
| FeedbackCampaign | feedback_campaigns | 1 — Session-derived | Populate from request context |
| FeedbackQrCode | feedback_qr_codes | 1 — Session-derived | Populate from request context |
| **FeedbackSubmission** | feedback_submissions | **3 — Anonymous chain-derived** | Resolve via QR → Campaign → Branch, server-side, at write time |
| **FeedbackAnswer** | feedback_answers | **3 — Anonymous chain-derived** | Resolve via submission_id → FeedbackSubmission's already-resolved tenant |
| **FeedbackComplaint** | feedback_complaints | **3 — Anonymous chain-derived** (initial create only; admin update is Pattern 1) | Resolve via submission/campaign chain on public create path |
| FeedbackLanguage | feedback_languages | **Shared-global (§4-resolved: stays permanently global)** | No Stage B write-path action — `tenant_id` remains NULL forever by design; excluded from B9-B11 tightening |
| FeedbackTranslation | feedback_translations | 1 — Derived (form_id) | Populate via join at write time |
| FeedbackNotification | feedback_notifications | 1 — Session-derived (branch-linked) | Populate from request context |
| FeedbackAuditLog | feedback_audit_logs | 1 — Session-derived, **except** `changed_by='public'` events | Populate from request context; public-triggered rows use the same chain resolution as their originating submission/complaint |

### A13 — Token Management
| Entity | Table | Resolution Pattern | Stage B Action |
|---|---|---|---|
| TokenLocation | token_locations | 1 — Session-derived | Populate from request context |
| TokenCounter | token_counters | 1 — Derived (location_id) | Populate via join at write time |
| TokenCall | token_calls | 1 — Derived (counter_id) | Populate via join at write time |
| DisplayPage | display_pages | 1 — Session-derived (§4-resolved: converted to tenant-owned) | Populate from request context; no longer an exception, joins normal Token B3 rollout |
| TokenBranchConfig | token_branch_config | 1 — Session-derived | Populate from request context |
| TokenKiosk | token_kiosks | 1 for admin CRUD, **3 — Anonymous chain-derived** for public read/issue path | Split by endpoint: admin writes from session, kiosk reads resolve from kiosk_slug → branchId |
| TokenKioskAssignment | token_kiosk_assignments | 1 — Session-derived | Populate from request context |
| TokenKioskBranding | token_kiosk_branding | 1 — Session-derived | Populate from request context |
| TokenScConfig | token_sc_configs | 1 — Session-derived | Populate from request context |
| TokenSequence | token_sequences | 1 — Session-derived | Populate from request context; concurrency-critical, do not alter the unique constraint |
| **TokenRecord** | token_records | **3 — Anonymous chain-derived** | Resolve via kiosk_slug → TokenKiosk.branchId or location_id → TokenLocation.branchId, server-side, at write time |
| TokenAnalyticsDaily | token_analytics_daily | 1 — Session-derived (per-branch aggregate) | Thread tenant through nightly aggregation job |
| TokenAuditLog | token_audit_logs | 1 — Session-derived | Populate from request context |
| **TokenReservation** | token_reservations | **3 — Anonymous chain-derived** (via token_record_id, which may itself be Pattern 3) | Resolve via the underlying TokenRecord's already-resolved tenant |
| TokenPatientMapping | token_patient_mapping | 1 — Session-derived (JWT-authenticated registration flow) | Populate from request context |
| MappingAuditLog | mapping_audit_log | 1 for authenticated events, **3** for `actor='system'` expiry-sweep events | Split by triggering event type |
| **WorkstationConfig** | hdsp_workstation_configuration | **3 — Anonymous chain-derived** | Resolve from workstation's already-configured branchId, server-side |

---

## Appendix B — Incidental Bugs Found During Stage A (Workstream 5, tracked separately from tenancy work)

These were discovered during pre-flight audits but are unrelated to the tenant migration and should be fixed independently, not bundled into Stage B:

1. **`RewardRedemption.status`** (A7) — entity/TS union allows `'FULFILLED'`, but the live DB CHECK constraint only permits `'CANCELLED'` as the 4th value. A `FULFILLED` write would currently violate the constraint.
2. **`TokenSequenceService.manualResetSequences`** (A13) — raw SQL references table `token_sc_config` (singular) instead of the real `token_sc_configs` (plural), silently defeating configured start numbers on branch-wide bulk sequence reset.
3. **`AttendanceUsersService`/`user_branches`** (A4) — pre-existing empty `user_branches` table caused a "0 accounts" admin UI symptom; root-caused as unrelated to migration, environment-specific data gap.

---

## Summary — Where This Leaves the Project

Per the user's own final assessment, which this document confirms rather than revises:

- **Stage A implementation:** Complete, pending one cumulative integration verification pass (§9).
- **Architectural discovery:** Complete — three ownership patterns fully cover all 13 checkpoints, confirmed closed at A13.
- **Open decisions before Stage B enforcement can begin:** the global/shared resource policy (§4) and nothing else structural — everything else in this document is implementation planning, not open unknowns.
- **Next concrete actions, in order:** (1) push `hybrid-architecture` to the office environment and run the full verification pass in §9; (2) resolve the §4 policy decisions; (3) begin Stage B implementation starting with §3's resolution strategies, in the module order Pattern 1 → Pattern 2 (Attendance) → Pattern 3 (Feedback/Token public surfaces), since that's increasing order of implementation risk.
