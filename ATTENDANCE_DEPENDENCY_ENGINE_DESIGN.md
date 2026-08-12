# ATTENDANCE DEPENDENCY ENGINE DESIGN
## From Punch Processor to Dependency-Driven Attendance Engine

---

# PART 4 — ATTENDANCE DEPENDENCY GRAPH

## 4.1 Core Dependency Model

```
ATTENDANCE(empCode, date) = f(
    Punches(empCode, date),           -- Primary input: what actually happened
    DutyPlan(empCode, date),          -- Context: what was planned
    Leave(empCode, date),             -- Override: approved absence
    Holiday(date),                    -- Override: declared non-working day
    ShiftType(shiftTypeId),           -- Configuration: shift parameters
    EmployeeStatus(empCode),          -- Gate: is employee active?
    ManualCorrection(empCode, date),  -- Override: HR explicit correction
    PayrollLock(period),              -- Gate: is attendance frozen?
    NightShiftContext(empCode, date±1) -- Context: cross-day night shift
)
```

## 4.2 Dependency Sensitivity Matrix

For each dependency, defines:
- **Read**: always needed for attendance calculation
- **Invalidates**: when this changes, existing attendance must be recalculated
- **Blocks**: when this is absent, attendance CANNOT be calculated (must wait)
- **Freezes**: when this is set, attendance CANNOT be changed

| Dependency | Read | Invalidates | Blocks | Freezes |
|-----------|------|------------|--------|---------|
| Punches (ATTLOGS) | YES | YES — new punch changes IN/OUT/duration | NO (absence = NPNL) | NO |
| DutyPlan (DUTYPLANVALUES) | YES | YES — shift change alters all calculations | YES (if absent, cannot calculate) | NO |
| Leave (EMPLOYEELEAVELIST) | YES | YES — approval changes ATT code | NO (absence = not on leave) | NO |
| Holiday (HOLIDAY_MASTER) | YES | YES — declaration changes ATT code | NO (absence = not a holiday) | NO |
| ShiftType Config | YES | YES (partial) — time changes affect differentials | YES (needed for shift boundaries) | NO |
| Employee Status | YES | CONDITIONAL — if inactive, attendance may be voided | CONDITIONAL | NO |
| Manual Correction | YES | YES — locks specific field against auto-recalculation | NO | PARTIAL (locks specific fields) |
| Payroll Lock | YES | NO | NO | YES — freezes entire period |
| Night Shift D±1 Context | YES (for night shift only) | YES — D2 plan change affects D1 attendance | CONDITIONAL (night shift only) | NO |
| Compensatory Grant | YES | YES — creates COMPENSATORYOFF | NO | NO |
| DutyOff Config | YES | YES — creates DUTYOFF | NO | NO |

---

## 4.3 Complete Dependency Graph

```
                      ┌─────────────────────────────────────────────────┐
                      │           ATTENDANCE DECISION ENGINE             │
                      │                                                  │
   PUNCHES ──────────►│  1. Check: Employee active? (EmployeeStatus)    │
   (ATTLOGS)          │  2. Check: PayrollLock? → FREEZE if yes         │
                      │  3. Check: ManualCorrection? → use locked value  │
   DUTYPLAN ─────────►│  4. Require: DutyPlan → WAIT if absent          │
   (DUTYPLANVALUES)   │  5. Read: ShiftType flags from DutyPlan         │
                      │  6. Evaluate: Holiday > Leave > WeekOff > Comp  │
   LEAVE ────────────►│     > DutyOff > Punch analysis                  │
   (EMPLOYEELEAVELIST)│  7. Night shift: cross-reference D±1 context     │
                      │  8. Compute: differentials, duration, work hours │
   HOLIDAY ──────────►│  9. Write: DUTYACTUALVALUES                     │
   (HOLIDAY_MASTER)   │ 10. Write: PMS_PUNCHINGMASTER                   │
                      │ 11. Write: Oracle differential columns           │
   SHIFTTYPE ────────►│                                                  │
   (config)           └─────────────────────────────────────────────────┘
                                          ▲
   EMPLOYEE STATUS ─────────────────────►│
   (EMPLOYEE_MASTER)                     │
                                         │
   MANUAL CORRECTION ──────────────────►│
   (DUTYACTUALVALUES manual)             │
                                         │
   PAYROLL LOCK ──────────────────────►│
   (config or lock table)               │
                                         │
   NIGHT SHIFT CONTEXT ───────────────►│
   (D-1 or D+1 DutyPlan)               │
```

---

## 4.4 Dependency Change → Attendance Impact Matrix

| Changed Dependency | Change Type | Impact | Scope | Priority |
|-------------------|------------|--------|-------|---------|
| Punch | INSERT | May change NPNL→MISSPUNCH, MISSPUNCH→PRESENT | Single employee-date | IMMEDIATE |
| Punch | (no DELETE in HIS model) | n/a | — | — |
| DutyPlan | INSERT | Unblocks WAITING_FOR_DUTY_PLAN | Single employee-date | IMMEDIATE |
| DutyPlan | UPDATE (shift change) | Recalculate with new shift params | Single employee-date | IMMEDIATE |
| DutyPlan | UPDATE (weekoff flag) | May change PRESENT→WEEOFF | Single employee-date | IMMEDIATE |
| DutyPlan | DELETE | Revert to WAITING or NOPLANSHIFT | Single employee-date | IMMEDIATE |
| Leave | INSERT (APPROVED) | May change PRESENT→LEAVE, MISSPUNCH→LEAVE | Employee × date range | QUEUED |
| Leave | UPDATE (CANCELLED) | Reverts LEAVE → re-evaluate punches | Employee × date range | QUEUED |
| Leave | UPDATE (APPROVED→REJECTED) | Same as CANCELLED | Employee × date range | QUEUED |
| Holiday | INSERT | Changes ALL employees on that date | All employees × single date | BATCH |
| Holiday | DELETE | Reverts all from PUBLICHOLLYDAY | All employees × single date | BATCH |
| ShiftType | UPDATE (shift times) | Recalculate differentials for affected employees | All employees with that shift | BATCH |
| ShiftType | UPDATE (IS_NIGHT flag) | Recalculate night shift logic | All employees with that shift | BATCH |
| Employee Status | UPDATE (inactive) | May void attendance | Single employee × recent dates | QUEUED |
| Manual Correction | UPDATE | Lock this record from auto-recalc | Single employee-date | NO RECALC |
| Payroll Lock | INSERT/SET | Freeze all attendance for period | All employees × period | FREEZE |
| Night D+1 DutyPlan | INSERT/UPDATE | May change D night shift cutoff | Single employee × D date | IMMEDIATE |
| Compensatory | INSERT | Creates COMPENSATORYOFF | Single employee-date | IMMEDIATE |

---

# PART 7 — CUTOFF RULES

## 7.1 Why Cutoffs Are Necessary

Without cutoffs, WAITING_FOR_DUTY_PLAN states could persist indefinitely:
- New employees whose plan is never assigned
- Employees on long-term leave with no day-by-day plan
- System errors where plan creation fails silently
- Weekends or holidays where no in-charge is present

The cutoff converts "plan not yet assigned" into "plan will not be assigned" — a business decision, not a technical limitation.

---

## 7.2 Three-Phase Cutoff Model

```
00:00 ──────────────────────────────────────────────────────────► 23:59
│                              │                    │               │
│    PROVISIONAL ZONE          │   EVALUATION ZONE  │ LOCKED ZONE   │
│                              │                    │               │
│ DutyPlan can be created      │ In-charge finishes │ HIS batch     │
│ Attendance is provisional    │ assignments        │ processes     │
│ Any change triggers          │ HDSP finalizes     │ No more       │
│ recalculation                │ WAITING records    │ changes       │
│                              │                    │               │
│←──────── configurable ──────►│←── configurable ──►│←─ fixed ──────│
│    default: 00:00-21:00      │ default: 21:00-22:00│ 22:00+        │
```

### Phase 1: PROVISIONAL ZONE (00:00 to DUTY_PLAN_CUTOFF)
- All attendance decisions are provisional
- Any dependency change triggers automatic recalculation
- WAITING_FOR_DUTY_PLAN is a valid state
- HDSP dashboard shows provisional indicator on attendance

### Phase 2: EVALUATION ZONE (DUTY_PLAN_CUTOFF to BATCH_LOCK_TIME)
- WAITING_FOR_DUTY_PLAN transitions to NOPLANSHIFT
- New DutyPlan creation still triggers recalculation (in case of late assignment)
- After DUTY_PLAN_CUTOFF: alert sent to supervisor for any remaining WAITING records
- This window allows last-minute corrections before HIS batch

### Phase 3: LOCKED ZONE (BATCH_LOCK_TIME onwards, until next day unlock)
- Matches HIS's 23:00 lock behavior
- No automatic recalculation
- Manual override requires explicit approval
- HIS batch will run at 01:00; HDSP defers to HIS batch result

---

## 7.3 Configurable Cutoff Parameters

```typescript
interface AttendanceCutoffConfig {
  // When to stop waiting for a DutyPlan and finalize as NOPLANSHIFT
  dutyPlanCutoffTime: string;        // default: "21:00"
  dutyPlanCutoffTimezone: string;    // default: hospital local timezone

  // When to stop all automatic recalculation (mirrors HIS lock)
  batchLockTime: string;             // default: "23:00"

  // When to allow automatic recalculation again (after HIS batch completes)
  batchUnlockTime: string;           // default: "03:30"

  // Whether to recalculate after HIS batch completes (picks up any HIS corrections)
  reconcileAfterBatch: boolean;      // default: true

  // How long to defer NOPLANSHIFT finalization after cutoff (grace period)
  cutoffGracePeriodMinutes: number;  // default: 30

  // Whether retroactive DutyPlan changes trigger recalculation
  allowRetroactiveRecalculation: boolean; // default: true (with payroll lock check)

  // How many days back a retroactive change can trigger recalculation
  retroactiveLimitDays: number;      // default: 30 (payroll period)
}
```

---

## 7.4 Cutoff Decision Table

| Time | DutyPlan exists? | Action |
|------|-----------------|--------|
| Before DUTY_PLAN_CUTOFF | YES | Calculate attendance normally |
| Before DUTY_PLAN_CUTOFF | NO | WAITING_FOR_DUTY_PLAN (provisional) |
| Between CUTOFF and BATCH_LOCK | YES | Calculate attendance normally |
| Between CUTOFF and BATCH_LOCK | NO | NOPLANSHIFT (finalize) |
| Between BATCH_LOCK and BATCH_UNLOCK | YES or NO | LOCKED — no changes |
| After BATCH_UNLOCK | Any | Reconciliation with HIS batch output |
| Past date, before payroll lock | Any | Retroactive recalculation allowed |
| Past date, after payroll lock | Any | BLOCKED — manual override required |

---

# PART 8 — EVENT-DRIVEN RECALCULATION ENGINE

## 8.1 Engine Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                   EVENT SOURCES (Pollers)                        │
│                                                                   │
│  AttlogsPoller ──────────►  PunchEvent                           │
│  DutyPlanPoller ─────────►  DutyPlanEvent (CREATE/UPDATE/DELETE) │
│  LeavePoller ────────────►  LeaveEvent (APPROVED/CANCELLED)      │
│  HolidayPoller ──────────►  HolidayEvent (DECLARED/CANCELLED)   │
│  ShiftTypePoller ────────►  ShiftTypeEvent (CONFIG_CHANGED)      │
│  ManualCorrectionPoller ─►  ManualCorrectionEvent                │
│  NightShiftTimer ────────►  NightShiftCutoffEvent                │
│  CutoffTimer ────────────►  CutoffReachedEvent                   │
└────────────────────────────────────────────────────────────────┬─┘
                                                                 │
                                                                 ▼
┌──────────────────────────────────────────────────────────────────┐
│                   EVENT ROUTER                                    │
│  Routes events to appropriate queues based on:                   │
│  - Event type                                                     │
│  - Scope (single employee vs. batch)                             │
│  - Priority (IMMEDIATE vs. QUEUED vs. BATCH)                     │
└───────────────┬──────────────────────────────┬──────────────────┘
                │                              │
                ▼                              ▼
┌──────────────────────────┐    ┌──────────────────────────────────┐
│  IMMEDIATE QUEUE (Bull)  │    │  BATCH QUEUE (Bull)              │
│  Priority: HIGH          │    │  Priority: LOW                   │
│  Concurrency: 5          │    │  Concurrency: 1                  │
│  Timeout: 30s            │    │  Timeout: 5min                   │
│  Retry: 3× exponential   │    │  Retry: 5× with longer backoff  │
└────────────┬─────────────┘    └──────────────┬───────────────────┘
             │                                  │
             └──────────────┬───────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│                   RECALCULATION ENGINE WORKER                    │
│                                                                   │
│  1. Load all dependencies for (empCode, date)                    │
│  2. Check: PayrollLock? → REJECT if frozen                       │
│  3. Check: ManualCorrection? → skip auto-calc if locked          │
│  4. Check: Employee active? → skip if inactive                   │
│  5. Run attendance decision: same as HIS algorithm               │
│  6. Compare with existing DUTYACTUALVALUES                       │
│  7. If changed: UPDATE DUTYACTUALVALUES + emit CompensationEvent │
│  8. Update: PMS_PUNCHINGMASTER if applicable                     │
│  9. Write: Differential columns                                  │
│  10. Emit: AttendanceChangedEvent for downstream consumers       │
└──────────────────────────────────────────────────────────────────┘
```

---

## 8.2 Event Priority and Processing Decision Matrix

| Event | Priority | Processing Mode | Delay | Conditions |
|-------|---------|----------------|-------|-----------|
| Punch IN received | IMMEDIATE | Inline or next queue slot | 0s | Always process |
| Punch OUT received | IMMEDIATE | Inline or next queue slot | 0s | Always process |
| DutyPlan CREATED (same day) | IMMEDIATE | Immediate queue | 0s | Before cutoff |
| DutyPlan CREATED (today, after cutoff) | IMMEDIATE | Immediate queue | 0s | Allow late-day correction |
| DutyPlan CREATED (past date) | QUEUED | Batch queue | 5min | Check payroll lock |
| DutyPlan UPDATED (shift change) | IMMEDIATE | Immediate queue | 0s | Before lock time |
| DutyPlan UPDATED (minor, same shift) | QUEUED | Immediate queue | 30s | Debounce rapid changes |
| DutyPlan DELETED | IMMEDIATE | Immediate queue | 0s | Before lock time |
| Leave APPROVED (today) | IMMEDIATE | Immediate queue | 0s | — |
| Leave APPROVED (past date) | QUEUED | Batch queue | 5min | Check payroll lock |
| Leave CANCELLED (today) | IMMEDIATE | Immediate queue | 0s | — |
| Leave CANCELLED (past date) | QUEUED | Batch queue | 5min | Check payroll lock |
| Holiday DECLARED (future date) | BATCH | Batch queue | 1h | Affects all employees |
| Holiday DECLARED (today) | QUEUED | Immediate queue | 60s | Stagger to avoid load spike |
| Holiday CANCELLED | BATCH | Batch queue | 1h | Affects all employees |
| ShiftType CONFIG changed | BATCH | Batch queue | 1h | Affects many employees |
| CutoffReachedEvent | BATCH | Immediate batch | 0s | Convert WAITING→NOPLANSHIFT |
| Night shift cutoff event | IMMEDIATE | Immediate queue | 0s | Resolve D1 night shift |
| HIS batch completed | RECONCILE | Reconciliation queue | 5min | After 03:00 unlock |
| Manual correction | IGNORE | No queue | — | Do not auto-recalculate |
| Payroll lock SET | IMMEDIATE | Freeze all queued items | 0s | Cancel pending recalcs |

---

## 8.3 Event Deduplication and Debounce

**Problem:** When a DutyPlan is bulk-imported (e.g., in-charge assigns plans for 50 employees at once), HDSP receives 50 DutyPlanCreatedEvents simultaneously. Without deduplication, the queue processes 50 recalculations. This is correct, but rapid changes to a single employee (plan created, then immediately updated before first recalculation completes) must be handled.

**Deduplication key:** `sha256(empCode + date + eventType)`

**Deduplication rule:**
- If a recalculation for (empCode, date) is already QUEUED or PROCESSING: SKIP the new event (it will run fresh when current one completes)
- If a recalculation FAILED: allow retry
- If a recalculation COMPLETED but event is NEWER than last recalculation: allow

**Debounce rule for DutyPlan UPDATE:**
- If multiple DutyPlan UPDATEs arrive for same employee-date within 5 seconds: process only the last one
- Reason: in-charges sometimes make multiple quick corrections; processing each intermediate state is wasteful

---

## 8.4 Recalculation Idempotency

Every recalculation must be idempotent:
- Running the same event twice must produce the same result
- If attendance has not changed: DO NOT update DUTYACTUALVALUES (avoid spurious updates)

```typescript
async function recalculate(empCode: string, date: Date): Promise<void> {
  const deps = await loadAllDependencies(empCode, date);
  const newDecision = attendanceDecisionEngine(deps);
  const existing = await getExistingDutyActual(empCode, date);

  if (existing && decisionsEqual(existing, newDecision)) {
    // No change — idempotent no-op
    return;
  }

  await updateDutyActual(empCode, date, newDecision);
  await emitAttendanceChangedEvent(empCode, date, existing, newDecision);
}
```

---

## 8.5 Bulk Event Handling (Holiday and ShiftType Changes)

When a holiday is declared for 2026-07-15 affecting 500 employees:
- Do NOT enqueue 500 individual recalculation jobs immediately (overloads queue)
- Instead: emit a single `BulkRecalculationNeededEvent(date: 2026-07-15, reason: HOLIDAY)`
- BulkRecalculationWorker paginates through employees: process 50 at a time, 2-second delay between pages
- Total time for 500 employees: ~20 seconds (acceptable for a holiday declaration)

```typescript
interface BulkRecalculationJob {
  date: Date;
  reason: 'HOLIDAY' | 'SHIFT_TYPE_CHANGE' | 'ROSTER_CORRECTION';
  employeeFilter?: {
    department?: string;
    shiftTypeId?: string;
    allEmployees?: boolean;
  };
  pageSize: number;  // default: 50
  pageDelayMs: number;  // default: 2000
}
```

---

## 8.6 Reconciliation After HIS Batch

After HIS batch completes (~03:00), HDSP should reconcile its records with what HIS produced:

```
03:00  HIS batch completes
03:05  HDSP ReconciliationWorker starts
       For each employee processed by HIS batch today:
         1. Read DUTYACTUALVALUES (what HIS wrote)
         2. Read HDSP's last-written record (before 23:00 lock)
         3. Compare: same ATT code?
            YES → No action; records consistent
            NO  → Log divergence; emit DivergenceAlert
                  Options: trust HIS (overwrite HDSP) OR trust HDSP (log for review)
                  Default: trust HIS (HIS is source of truth for finalized attendance)
```

**Divergence alert payload:**
```json
{
  "empCode": "E001",
  "date": "2026-07-02",
  "hdspAttendance": "PRESENT",
  "hisAttendance": "LEAVE",
  "reason": "Leave approved at 22:30 after HDSP processed; HIS batch picked it up",
  "severity": "LOW",
  "autoResolved": true,
  "resolution": "ACCEPTED_HIS_RESULT"
}
```

---

## 8.7 Monitoring Metrics for the Dependency Engine

```typescript
// Key metrics to expose via Prometheus/Grafana:

// Queue depths
attendance_recalculation_queue_depth{priority="immediate"}
attendance_recalculation_queue_depth{priority="batch"}
attendance_recalculation_queue_depth{priority="reconcile"}

// Waiting states
attendance_waiting_for_duty_plan_count{date="today"}
attendance_waiting_for_leave_count{date="today"}
attendance_waiting_for_night_completion_count{date="today"}

// Event processing rates
attendance_events_processed_total{event_type="punch"}
attendance_events_processed_total{event_type="duty_plan_created"}
attendance_events_processed_total{event_type="leave_approved"}
attendance_events_processed_total{event_type="holiday_declared"}

// Divergence tracking
attendance_his_hdsp_divergence_total{severity="critical"}
attendance_his_hdsp_divergence_total{severity="low"}

// Recalculation latency
attendance_recalculation_latency_seconds{event_type="punch"}
attendance_recalculation_latency_seconds{event_type="duty_plan_created"}

// Cutoff breaches
attendance_cutoff_breach_total{reason="no_duty_plan"}
attendance_cutoff_breach_total{reason="no_punch"}

// Failed jobs
attendance_recalculation_failed_total{reason="payroll_locked"}
attendance_recalculation_failed_total{reason="manually_corrected"}
attendance_recalculation_failed_total{reason="oracle_error"}
```
