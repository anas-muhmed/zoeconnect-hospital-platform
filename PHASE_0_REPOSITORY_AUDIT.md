# PHASE 0 — REPOSITORY AUDIT AND MIGRATION MAP
## Every Existing Class Mapped to the New Architecture

**Spec reference:** HDSP_EVENT_RECALCULATION_IMPLEMENTATION_PLAN.md, ATTENDANCE_DEPENDENCY_ENGINE_DESIGN.md

---

# SECTION 1 — EXISTING CODEBASE INVENTORY

## 1.1 PostgreSQL Entities (TypeORM, in `attendance/entities/`)

| Entity | Table | Purpose | Disposition |
|--------|-------|---------|------------|
| `AttendanceEvent` | `attendance_events` | Stores every ATTLOGS punch discovered by polling | **EXTEND** — Add `dependencyType` column. Will store all dependency events, not just punches. |
| `AttendanceRule` | `attendance_rules` | Per-shift configurable rule sets | **REUSE** — No changes needed. |
| `AttendanceAudit` | `attendance_audit` | Audit trail of every attendance change | **EXTEND** — Add `triggeredByDependency` and `confidence` columns. |
| `AttendanceReconciliation` | `attendance_reconciliation` | HIS batch reconciliation run log | **EXTEND** — Add HIS divergence tracking columns. |

## 1.2 Services (in `attendance/services/`)

### `OraclePollingService` — REFACTOR
**Current:** Polls `ATTLOGS` using a Redis cursor. Returns `AttlogPunch[]`.
**What it does correctly:** Cursor-based polling, `isAvailable` guard, direction normalization, `sourceId` generation.
**What it does wrong:**
- `GAP-10 / Bug F-05`: Initial cursor hardcoded to `2026-06-28T00:00:00.000Z` (line 135). Must be configurable.
- `console.log` debug statements in production path (lines 87-88). Remove.
- Tightly coupled to ATTLOGS only. Must be generalized into a reusable polling base.

**Migration target:** Rename to `AttlogsPoller`. Extract common polling logic into `BaseOraclePoller<T>` abstract class. DutyPlanPoller, LeavePoller, HolidayPoller all extend the same base.

---

### `AttendanceListener` — REFACTOR
**Current:** `setInterval` at 1500ms, calls `OraclePollingService.fetchNewPunches()`, records the punch via `PunchHistoryService`, enqueues the event via `RealtimeQueueService`.
**What it does correctly:** Non-overlapping ticks (`this.running` guard), graceful shutdown, startup delay.
**What it does wrong:**
- `GAP-09 / Bug F-03`: Line 71 sets `event.status = 'QUEUED'` but **never saves it back to the database** before calling `enqueue()`. The save is missing. Status remains 'NEW' in DB even after queuing.
- Only handles punch events. New architecture needs it to coordinate multiple pollers.

**Migration target:** Rename to `AttendancePollerCoordinator`. Manages all external pollers (Attlogs, DutyPlan, Leave, Holiday, ShiftType). Each poller produces an `AttendanceDependencyChangedEvent`. Coordinator passes events to `DependencyEventRouter`.

---

### `PunchHistoryService` — REFACTOR
**Current:** Makes `sourceId` via SHA-256, records punches in PostgreSQL, loads punches from Oracle ATTLOGS for recalculation window.
**What it does correctly:** SHA-256 dedup, idempotent upsert, Oracle fallback.
**What it does wrong:** Name implies punch-only. The `recordDiscoveredPunch()` concept needs to generalize to any dependency change.
**Migration target:** Keep `PunchHistoryService` for ATTLOGS-specific concerns. Extract `DependencyEventRecorder` for recording all dependency change events (DutyPlan, Leave, Holiday) in the `attendance_events` table with appropriate `dependencyType`.

---

### `RealtimeQueueService` — REFACTOR
**Current:** Enqueues `'process-punch'` jobs with `{ eventId }` payload.
**What it does correctly:** Idempotent job IDs, exponential backoff, retry configuration.
**What it does wrong:** Hardcoded to `'process-punch'` job name. New architecture uses `AttendanceDependencyChangedEvent`.
**Migration target:** Rename to `DependencyEventQueueService`. Enqueues generic `'process-dependency'` jobs. Supports priority parameter (IMMEDIATE / QUEUED / BATCH). Routes to different queues based on priority.

---

### `AttendanceQueueProcessor` (`attendance.processor.ts`) — REFACTOR
**Current:** Bull processor for `QUEUE_NAMES.ATTENDANCE_REALTIME`, handles `'process-punch'` job type. Delegates to `AttendanceProcessor`.
**What it does correctly:** Error handling with `@OnQueueFailed`, structured logging.
**What it does wrong:** Tied to `'process-punch'` job. New architecture uses generic dependency events.
**Migration target:** Rename to `DependencyEventQueueProcessor`. Handles `'process-dependency'` job. Delegates to `RecalculationEngine`.

---

### `AttendanceProcessor` (service) — REPLACE with `RecalculationEngine`
**Current:** Core orchestrator. Loads roster → gets rules → gets punches → evaluates → writes to Oracle.
**What it does correctly:** Manual override detection (REMARKS check), error handling, audit recording, mode (REALTIME/RECONCILIATION/MANUAL_RETRY).
**What it does wrong:**
- `'NO_ROSTER'` is treated as final and results in `'SKIPPED'` event status. Per spec, should be `WAITING_FOR_DUTY_PLAN` if before cutoff.
- No provisional state support.
- No dependency-loading for Leave, Holiday, ShiftType independently — all delegated to `RosterResolver`.
- Does not check PayrollLock.
- Does not support `AttendanceConfidence`.

**Migration target:** Replace with `RecalculationEngine`. The manual override detection logic (`isManualOverride`) must be preserved and carried forward. The mode concept (REALTIME/RECONCILIATION/MANUAL_RETRY) must be preserved.

---

### `AttendanceDecisionEngine` — REFACTOR (significant)
**Current:** Pure function engine. Takes roster context, punches, and rules. Returns decision.
**What it does correctly:** Leave evaluation (full/half-day), holiday/weekoff logic, LATE_COMING/EARLY_GOING, HALF_DAY, MISSING_IN/OUT separation, `removeDuplicates`, `isWithinSafetyBounds`.
**What it does wrong:**

**GAP-01 / Bug F-04:** `removeDuplicates()` uses **exact timestamp match** (`punch.logDateTime.getTime() === prev.logDateTime.getTime()`), not a 900-second window. The `_duplicateWindowSeconds` parameter is accepted but **ignored** (note the underscore prefix — intentionally unused). This means HIS's 15-min dedup is completely absent.

**GAP-08 / Bug F-13:** `earlyGraceMinutes: 120` is hardcoded in `DEFAULT_ATTENDANCE_RULES` in `ShiftRuleEngine`. HIS value is unconfirmed but 120 minutes is certainly wrong.

**GAP-03:** Night shift cross-day logic (`checkForNightShiftNxtDay`) is completely absent. For `IS_NIGHT=true` shifts, the engine should: (a) defer OUT punch to next day, (b) use `plannextin` as cutoff.

**GAP-04:** `COMPENSATORYOFF` and `DUTYOFF` are not in `AttendanceDecisionStatus` type and not in the decision logic.

**HIS priority order mismatch:** Current order: `NO_ROSTER → INVALID → LEAVE → HOLIDAY → WEEK_OFF`. HIS order (per reverse engineering): `WEEK_OFF → HOLIDAY → LEAVE → COMPENSATORY → DUTYOFF`. Current implementation evaluates LEAVE before HOLIDAY and WEEK_OFF — **wrong order**.

**MISSING_IN / MISSING_OUT vs MISS_PUNCH:** Current engine distinguishes `MISSING_IN` and `MISSING_OUT` — HIS uses a single `MISSPUNCH` code. The HDSP types have both, which is fine for internal precision, but the Oracle writer maps both back to 'Miss Punch' (confirmed in `DutyActualUpdater.toHisStatus()`).

**Migration target:** Refactor significantly. Fix all GAPs above. Add night shift context parameter. Add COMPENSATORYOFF/DUTYOFF. Fix priority order. Fix dedup to use actual window.

---

### `RosterResolver` — REFACTOR → becomes `DependencyLoader`
**Current:** Single large Oracle query joining EMPLOYEE + DUTYPLANVALUES + SHIFT_TYPE + LEAVEMASTER + APPLIEDLEAVES + EMPLOYEELEAVELIST. Returns `RosterContext`.
**What it does correctly:** All the Oracle column name indirection via `AttendanceConfigService`. Leave + half-day resolution. IsNight flag normalization (`'Y'` or `1`).
**What it does wrong:**
- Single query tries to load ALL dependencies at once. If DUTYPLANVALUES is absent, the entire context is still returned but with `null` shift fields — causing `NO_ROSTER` decision rather than `WAITING_FOR_DUTY_PLAN`.
- Does not distinguish "employee has no roster" from "roster not assigned yet" (both return null `rosterId`).
- Missing: holiday table lookup (holiday is read from ShiftType flag `NATIONAL_HOLIDAY`, not from a separate holiday master — this may be CONFIGURABLE per hospital).
- Missing: payroll lock check.
- Missing: compensatory grant lookup.
- Missing: Night shift D+1 context loading.

**Migration target:** Rename to `DependencyLoader`. Split into individual load methods: `loadDutyPlan()`, `loadLeave()`, `loadHoliday()`, `loadShiftType()`, `loadNightShiftContext()`, `loadPayrollLock()`. The combined load remains for single-query optimization but individual loaders enable partial loading for event-driven recalculation.

---

### `ShiftRuleEngine` — REFACTOR (minor)
**Current:** Loads `AttendanceRule` from PostgreSQL by shift code. Returns `AttendanceRuleSet`. Falls back to `DEFAULT_ATTENDANCE_RULES`.
**What it does correctly:** Per-shift rule overrides, effective-date logic.
**What it does wrong:**
- `earlyGraceMinutes: 120` in `DEFAULT_ATTENDANCE_RULES` is Bug F-13. Must be changed to `0` or CONFIGURABLE.
- `duplicateWindowSeconds: 60` is Bug F-04. Should be `900` (15 min). Must be CONFIGURABLE.
- `getEvaluationWindow()` uses `earlyGraceMinutes * 60 * 1000` as the "look-back" window for finding punches. This controls how far before the planned shift start we search for punches. Adjusting earlyGraceMinutes will affect both the window AND the grace period — they may need to be decoupled.

**Migration target:** Refactor `DEFAULT_ATTENDANCE_RULES` constants to be CONFIGURABLE (from environment or DB config table). Fix both default values.

---

### `DutyActualUpdater` — REFACTOR → becomes `OracleWriter`
**Current:** MERGE into `DUTYACTUALVALUES`. Maps HDSP decision statuses to HIS-compatible strings via `toHisStatus()`.
**What it does correctly:** MERGE (upsert) pattern, REMARKS field marking HDSP writes, `resolveActualShiftId()` for MISS_PUNCH/NPNL special shift IDs.
**What it does wrong:**
- `GAP-02`: Does NOT write differential columns `TIMEDIFFIN` (late minutes) and `TIMEDIFFOUT` (early going minutes). These are computed but only returned in-memory. HIS writes them.
- `toHisStatus()` maps `LATE_COMING` → `'Present'` and `EARLY_GOING` → `'Present'`. Correct for HIS compatibility but HDSP should still track these internally.
- No check for provisional state before writing. Per spec: "Provisional states SHALL NEVER be written into Oracle HIS tables."
- `resolveActualShiftId()` has the ROWNUM bug: query at line 200-211 uses `WHERE ROWNUM = 1` but the `ORDER BY` is AFTER the ROWNUM filter in the same SELECT level — non-deterministic. Should wrap in subquery: `SELECT * FROM (...ORDER BY...) WHERE ROWNUM = 1`.
- `toHisStatus()` maps `NO_ROSTER` → `'Miss Punch'`. Per spec, `NO_ROSTER` (before cutoff) should not write to Oracle at all — it becomes `WAITING_FOR_DUTY_PLAN`.

**Migration target:** Rename to `OracleWriter`. Add GAP-02 fix (write TIMEDIFFIN, TIMEDIFFOUT). Add provisional state guard. Fix ROWNUM bug. Never write provisional states.

---

### `NightReconciliationJob` — REFACTOR
**Current:** Cron at 01:30 AM. Finds all `AttendanceEvent` records in a 30-hour window. Re-processes each unique employee-date by calling `AttendanceProcessor.processEvent()`.
**What it does correctly:** Deduplication by employee-date (`seen` set), graceful error handling per event (continues on failure).
**What it does wrong:**
- Reconciles by re-processing HDSP's stored events — not by comparing against HIS Oracle output.
- Per spec: After HIS batch completes (~03:00), HDSP should read HIS's `DUTYACTUALVALUES` and compare.
- 30-hour window at 01:30 AM picks up yesterday's punches — correct timing.
- Does not handle the 03:30 unlock concept.
- No divergence detection or alerting.

**Migration target:** Refactor to `HisReconciliationJob`. Runs at 03:30 (after HIS batch completes). For each employee processed by HIS batch: compare HIS DUTYACTUALVALUES with HDSP state. Apply HIS result if divergent. Emit `HISHDSPDivergence` alerts.

---

### `AttendanceConfigService` — EXTEND
**Current:** Returns hardcoded column name mappings for Oracle tables. Merges with `HisConfigService` config.
**What it does correctly:** All column names isolated in one place. `ident()` validator.
**What it needs:** New mappings for:
- HOLIDAY_MASTER table and its columns (holiday date, status)
- DUTYPLANVALUES `LAST_MODIFIED` column (for change detection polling)
- APPLIEDLEAVES `LAST_MODIFIED` column (for leave change polling)
- DUTYACTUALVALUES `TIMEDIFFIN`, `TIMEDIFFOUT` columns (GAP-02 fix)
- SHIFT_TYPE `COMPENSATORY`, `DUTYOFF`, `NOPUNCHNOLEAVE_15`, `CALLDUTY`, `NIGHTOFF`, `ISSPLITSHIFT` columns
- Cutoff configuration keys

**Migration target:** EXTEND. Add new config keys. No structural changes.

---

### `AttendanceAuditService` — EXTEND
**Current:** Records attendance changes with old/new values, reason code, mode.
**What it needs:** Add `dependencyType` to audit entries so we know what triggered the change.

**Migration target:** EXTEND with new field.

---

### `AttendanceStructuredLogger` — REUSE
**Current:** Structured logging with timing, processing stage, employee code context.
**Migration target:** REUSE as-is. Add new processing stage names: `DEPENDENCY_LOADING`, `CUTOFF_CHECK`, `PROVISIONAL_STATE`, `DUTY_PLAN_POLLING`, `LEAVE_POLLING`, `HIS_RECONCILIATION`.

---

### `AttendanceMonitoringService` — EXTEND
**Current:** Comprehensive monitoring dashboard with Oracle status, queue metrics, statistics, live feed, employee trace, audit, errors.
**What it needs:** New monitoring data:
- Provisional state counts (WAITING_FOR_DUTY_PLAN count, WAITING_FOR_OUT_PUNCH count, etc.)
- DutyPlan poller status (last poll time, last detected change)
- Leave poller status
- Cutoff status (pre-cutoff / post-cutoff / locked)
- HIS reconciliation divergence count
- AttendanceConfidence distribution

**Migration target:** EXTEND. New monitoring endpoints added.

---

## 1.3 Queue Processor (`attendance.processor.ts`)

**`AttendanceQueueProcessor`** — REFACTOR (see above under services).

## 1.4 Module (`attendance.module.ts`)

**`AttendanceModule`** — EXTEND to register:
- New entities: `AttendanceState`, `DependencySnapshot`, `RecalculationLog`, `DutyPlanCache`, `PayrollLock`
- New queues: `QUEUE_NAMES.ATTENDANCE_DEPENDENCY` (immediate), `QUEUE_NAMES.ATTENDANCE_BATCH`
- New providers: `DutyPlanPoller`, `LeavePoller`, `HolidayPoller`, `ShiftTypePoller`, `DependencyEventRouter`, `RecalculationEngine`, `DependencyLoader`, `ProvisionalStateManager`, `CutoffTimerService`, `OracleWriter`

## 1.5 Types (`attendance.types.ts`)

**EXTEND** significantly:
- Add `DependencyType: 'PUNCH' | 'DUTY_PLAN' | 'LEAVE' | 'HOLIDAY' | 'SHIFT_TYPE' | 'MANUAL_CORRECTION' | 'PAYROLL_LOCK'`
- Add `AttendanceConfidence: 'PROVISIONAL' | 'HIGH' | 'FINAL' | 'LOCKED'`
- Add `ProvisionalStatus: 'WAITING_FOR_DUTY_PLAN' | 'WAITING_FOR_PUNCH' | 'WAITING_FOR_OUT_PUNCH' | 'WAITING_FOR_NIGHT_COMPLETION' | 'WAITING_FOR_LEAVE_DECISION' | 'WAITING_FOR_RECONCILIATION'`
- Add `AttendanceDependencyChangedEvent` interface (the universal event)
- Add `AttendanceDecisionStatus` values: `'COMPENSATORY_OFF' | 'DUTY_OFF' | 'NOPLANSHIFT' | 'WAITING_FOR_DUTY_PLAN'`
- Fix: `'MISS_PUNCH'` (HDSP) vs `'MISSPUNCH'` (HIS) — keep HDSP style internally.
- Add `AttendanceContext` interface (richer than `RosterContext`, includes all dependencies)

---

# SECTION 2 — KNOWN BUGS MAP

| Bug ID | Location | Current Value | Correct Value | Spec Reference |
|--------|---------|--------------|--------------|----------------|
| **F-03 / GAP-09** | `AttendanceListener.tick()` line 71 | `event.status = 'QUEUED'` without save | Must `await eventRepo.save(event)` after setting QUEUED | GAP Analysis: QUEUED status not persisted |
| **F-04 / GAP-01** | `AttendanceDecisionEngine.removeDuplicates()` | Exact timestamp dedup (window=0) | 900 seconds (15 min) window, CONFIGURABLE | GAP Analysis: 15-min dedup broken |
| **F-05 / GAP-10** | `OraclePollingService.getCursor()` line 135 | `new Date("2026-06-28T00:00:00.000Z")` hardcoded | Read from config or env: `ATTENDANCE_INITIAL_CURSOR` | GAP Analysis: Initial cursor hardcoded |
| **F-13 / GAP-08** | `ShiftRuleEngine.DEFAULT_ATTENDANCE_RULES` | `earlyGraceMinutes: 120` | `0` or CONFIGURABLE (pending production validation BV-001) | GAP Analysis: earlyGraceMinutes wrong |
| **GAP-02** | `DutyActualUpdater.upsert()` | Does not write TIMEDIFFIN/TIMEDIFFOUT | Write `lateMinutes` → TIMEDIFFIN, `earlyGoingMinutes` → TIMEDIFFOUT | GAP Analysis: differential columns not written |
| **GAP-03** | `AttendanceDecisionEngine` | Night shift: no cross-day logic | Implement `checkForNightShiftNxtDay()` equivalent | REALTIME_MIGRATION_SCENARIO_ANALYSIS.md |
| **GAP-04** | `AttendanceDecisionEngine` | COMPENSATORYOFF/DUTYOFF absent | Add to decision priority after LEAVE | GAP Analysis: missing attendance codes |
| **ROWNUM bug** | `DutyActualUpdater.resolveActualShiftId()` line 200-211 | `WHERE ROWNUM=1 ... ORDER BY` in same SELECT | Wrap: `SELECT * FROM (SELECT ... ORDER BY col) WHERE ROWNUM=1` | REVERSE_ENGINEERING_ASSUMPTION_AUDIT.md ATTACK-004 |
| **Priority order** | `AttendanceDecisionEngine.evaluate()` | LEAVE before HOLIDAY/WEEK_OFF | WEEK_OFF → HOLIDAY → LEAVE → COMP → DOFF | HIS_SYMBOLIC_EXECUTION.md Section 3 |

---

# SECTION 3 — NEW FILES TO CREATE

## Phase 1 — Infrastructure
| File | Purpose |
|------|---------|
| `attendance/events/attendance-dependency-changed.event.ts` | The universal event type |
| `attendance/events/dependency-type.enum.ts` | `DependencyType` enum |
| `attendance/types/attendance-confidence.enum.ts` | `AttendanceConfidence` enum |
| `attendance/types/provisional-status.enum.ts` | `ProvisionalStatus` enum |
| `attendance/types/attendance-context.interface.ts` | Full dependency context |
| `attendance/routing/dependency-event-router.ts` | Routes events by type/priority to correct queue |

## Phase 2 — Pollers
| File | Purpose |
|------|---------|
| `attendance/pollers/base-oracle-poller.ts` | Abstract base for all Oracle pollers |
| `attendance/pollers/attlogs.poller.ts` | Refactored from OraclePollingService |
| `attendance/pollers/duty-plan.poller.ts` | New: polls DUTYPLANVALUES for changes |
| `attendance/pollers/leave.poller.ts` | New: polls APPLIEDLEAVES/EMPLOYEELEAVELIST |
| `attendance/pollers/holiday.poller.ts` | New: polls HOLIDAY_MASTER |
| `attendance/pollers/shift-type.poller.ts` | New: polls SHIFT_TYPE config changes |
| `attendance/pollers/attendance-poller-coordinator.ts` | Refactored from AttendanceListener |

## Phase 3 — PostgreSQL State Tables
| File | Purpose |
|------|---------|
| `attendance/entities/attendance-state.entity.ts` | HDSP's own attendance state (provisional + final) |
| `attendance/entities/dependency-snapshot.entity.ts` | What the engine saw at last recalculation |
| `attendance/entities/recalculation-log.entity.ts` | Full audit trail of every recalculation |
| `attendance/entities/duty-plan-cache.entity.ts` | Cache of known DutyPlanValues (for DELETE detection) |
| `attendance/entities/payroll-lock.entity.ts` | Payroll lock per period |

## Phase 4 — Recalculation Engine
| File | Purpose |
|------|---------|
| `attendance/engine/dependency-loader.ts` | Loads all dependencies for (empCode, date) |
| `attendance/engine/recalculation-engine.ts` | Core: loads deps → decides → writes |
| `attendance/engine/provisional-state-manager.ts` | Manages WAITING_FOR_* states |
| `attendance/engine/cutoff-timer.service.ts` | Cron-based cutoff events |

## Phase 5 — Oracle Writer
| File | Purpose |
|------|---------|
| `attendance/oracle/oracle-writer.ts` | Refactored from DutyActualUpdater. Adds GAP-02, no-provisional guard, ROWNUM fix |

## Phase 6+ — Per-Dependency Handlers
| File | Purpose |
|------|---------|
| `attendance/handlers/duty-plan.handler.ts` | Handles DutyPlan INSERT/UPDATE/DELETE events |
| `attendance/handlers/leave.handler.ts` | Handles leave approval/cancellation |
| `attendance/handlers/holiday.handler.ts` | Handles holiday declaration/cancellation |
| `attendance/handlers/night-shift.handler.ts` | Handles cross-day night shift logic |

---

# SECTION 4 — MIGRATION MAP SUMMARY

```
EXISTING CLASS                    → NEW CLASS                   DISPOSITION
─────────────────────────────────────────────────────────────────────────────
OraclePollingService              → AttlogsPoller               REFACTOR
  + new BaseOraclePoller<T>       → BaseOraclePoller            NEW
AttendanceListener                → AttendancePollerCoordinator REFACTOR
PunchHistoryService               → PunchHistoryService         KEEP + EXTEND
  + new generic recorder          → DependencyEventRecorder     NEW
RealtimeQueueService              → DependencyEventQueueService REFACTOR
AttendanceQueueProcessor          → DependencyEventQueueProcessor REFACTOR
AttendanceProcessor (service)     → RecalculationEngine         REPLACE
AttendanceDecisionEngine          → AttendanceDecisionEngine    REFACTOR (GAPs)
RosterResolver                    → DependencyLoader            REFACTOR
ShiftRuleEngine                   → ShiftRuleEngine             REFACTOR (defaults)
DutyActualUpdater                 → OracleWriter                REFACTOR (GAP-02, ROWNUM)
NightReconciliationJob            → HisReconciliationJob        REFACTOR
AttendanceConfigService           → AttendanceConfigService     EXTEND
AttendanceAuditService            → AttendanceAuditService      EXTEND
AttendanceStructuredLogger        → AttendanceStructuredLogger  REUSE
AttendanceMonitoringService       → AttendanceMonitoringService EXTEND

NEW CLASSES:
  AttendanceDependencyChangedEvent                              NEW (Phase 1)
  DependencyEventRouter                                         NEW (Phase 1)
  DutyPlanPoller                                                NEW (Phase 2)
  LeavePoller                                                   NEW (Phase 2)
  HolidayPoller                                                 NEW (Phase 2)
  ShiftTypePoller                                               NEW (Phase 2)
  AttendanceState entity                                        NEW (Phase 3)
  DependencySnapshot entity                                     NEW (Phase 3)
  RecalculationLog entity                                       NEW (Phase 3)
  DutyPlanCache entity                                          NEW (Phase 3)
  PayrollLock entity                                            NEW (Phase 3)
  DependencyLoader                                              NEW (Phase 4)
  ProvisionalStateManager                                       NEW (Phase 4)
  CutoffTimerService                                            NEW (Phase 4)
  DutyPlanHandler                                               NEW (Phase 6)
  LeaveHandler                                                  NEW (Phase 7)
  HolidayHandler                                                NEW (Phase 7)
  NightShiftHandler                                             NEW (Phase 8)
  CompensationEngine                                            NEW (Phase 9)

DELETE (after replacement):
  AttendanceProcessor (service) — fully replaced by RecalculationEngine
```

---

# SECTION 5 — IMPLEMENTATION ORDER CONSTRAINTS

The following dependencies must be respected when implementing phases:

```
Phase 1 (event types + router) → MUST precede all other phases
Phase 2 (pollers) → requires Phase 1 (produces AttendanceDependencyChangedEvent)
Phase 3 (PostgreSQL entities) → can run parallel to Phase 2
Phase 4 (RecalculationEngine) → requires Phases 1, 2, 3
Phase 5 (OracleWriter) → requires Phase 4 (called by RecalculationEngine)
Phase 6 (DutyPlan) → requires Phase 4
Phase 7 (Leave/Holiday/ShiftType) → requires Phase 4
Phase 8 (Night Shift) → requires Phase 4, 6 (needs DutyPlanLoader for D+1)
Phase 9 (CompensationEngine) → requires Phases 4-8
Phase 10 (Observability) → requires Phases 1-9 (adds metrics to existing infra)
Phase 11 (Validation) → final phase; all previous must be complete
```

---

# SECTION 6 — IMMEDIATE FIXES THAT CAN BE DONE NOW (before Phase 1)

The following bugs can be fixed independently in the current codebase with zero architectural risk:

**Fix #1 — GAP-09: QUEUED status not persisted**
File: `attendance/services/attendance-listener.service.ts` line 71
```typescript
// BEFORE:
event.status = 'QUEUED';
await this.queueService.enqueue(event.id, event.employeeCode, event.logDateTime);

// AFTER: (save before enqueue so status is visible even if enqueue fails)
// Note: PunchHistoryService needs a save method exposed, or use the eventRepo
// For now: status update moved into RealtimeQueueService after successful enqueue
```
Risk: LOW. One missing `await save()` call.

**Fix #2 — GAP-10: Hardcoded initial cursor**
File: `attendance/services/oracle-polling.service.ts` line 135
```typescript
// BEFORE:
const initial = new Date("2026-06-28T00:00:00.000Z");

// AFTER:
const initial = new Date(process.env['ATTENDANCE_INITIAL_CURSOR'] ?? new Date().toISOString());
```
Risk: LOW. One line change. Add `ATTENDANCE_INITIAL_CURSOR` to .env documentation.

**Fix #3 — Remove console.log debug statements**
File: `attendance/services/oracle-polling.service.ts` lines 87-88
```typescript
// DELETE these two lines:
console.log("RAW ROW:", rows[0]);
console.log("MAPPED:", punches[0]);
```
Risk: NONE.

**Fix #4 — ROWNUM bug in resolveActualShiftId**
File: `attendance/services/duty-actual-updater.service.ts` lines 200-211
```typescript
// BEFORE:
`SELECT ${idCol} AS "id"
 FROM ${shiftTable}
 WHERE ${flagCol} = 1 ${branchPredicate}
   AND ROWNUM = 1
 ORDER BY ${branchCol} NULLS LAST`

// AFTER:
`SELECT "id" FROM (
  SELECT ${idCol} AS "id"
  FROM ${shiftTable}
  WHERE ${flagCol} = 1 ${branchPredicate}
  ORDER BY ${branchCol} NULLS LAST
) WHERE ROWNUM = 1`
```
Risk: LOW. Correctness fix, same intent.

---

# SECTION 7 — QUESTIONS FOR APPROVAL BEFORE PHASE 1

The following design decisions require confirmation before implementation begins:

**Q1:** The existing `attendance_events` table currently stores only punch events. Should Phase 3 ADD new tables for dependency events (DutyPlanCache, AttendanceState), or should `attendance_events` be EXTENDED with a `dependency_type` column to also store DutyPlan/Leave/Holiday change records?

**Recommendation:** Add new tables. Mixing punch events and dependency events in one table creates query complexity and makes monitoring harder. The `attendance_events` table remains punch-only.

**Q2:** The `ATTENDANCE_REALTIME_ENABLED` environment variable currently gates ALL attendance processing. Should there be separate feature flags per poller (e.g., `DUTY_PLAN_POLLING_ENABLED`, `LEAVE_POLLING_ENABLED`) so that new pollers can be enabled incrementally without affecting existing punch processing?

**Recommendation:** Yes. Separate flags per poller. Existing punch processing must never break while new pollers are being added.

**Q3:** Should immediate fixes (Section 6 above) be applied NOW before Phase 1, or should they wait until the relevant phase implements those components?

**Recommendation:** Apply immediately. All four fixes are isolated one-line changes with zero architectural impact. They fix currently broken production behavior (GAP-09, GAP-10).

---

**Phase 0 audit is complete. No code has been modified.**

**Awaiting approval to proceed to Phase 1.**
