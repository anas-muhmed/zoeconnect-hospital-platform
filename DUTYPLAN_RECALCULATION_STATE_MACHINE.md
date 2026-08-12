# DUTYPLAN RECALCULATION STATE MACHINE
## Formal State Machine: Attendance When DutyPlan Is Delayed, Inserted, Updated, Deleted, or Corrected

---

# PART 5 — PROVISIONAL ATTENDANCE STATES

## 5.1 State Inventory

HDSP needs provisional states that HIS never needed because HIS always processes finalized data. These states represent "attendance is known to be incomplete or unresolved."

### States Classification

```
FINAL STATES (can be written to Oracle, match HIS ATT codes):
  PRESENT              — complete, punches valid, shift complete
  MISS_PUNCH           — one punch missing
  NPNL                 — no punches, no leave
  LEAVE                — approved leave
  WEEK_OFF             — weekoff per roster
  HOLIDAY              — public holiday
  HALF_DAY             — half-day leave approved
  COMPENSATORY_OFF     — compensatory granted
  DUTY_OFF             — duty off per plan
  NOPLANSHIFT          — no duty plan assigned (after cutoff)

PROVISIONAL STATES (HDSP-only, never written as final Oracle ATT):
  WAITING_FOR_DUTY_PLAN          — plan not yet assigned; punches may exist
  WAITING_FOR_PUNCH              — plan exists, no punches yet, before shift end
  WAITING_FOR_OUT_PUNCH          — IN received, waiting for OUT
  WAITING_FOR_NIGHT_COMPLETION   — night shift D1 in progress; D2 OUT not yet received
  WAITING_FOR_LEAVE_DECISION     — employee on leave-pending-approval
  WAITING_FOR_HOLIDAY_CONFIRM    — potential holiday declared but not yet confirmed
  WAITING_FOR_RECONCILIATION     — HIS batch pending; HDSP decision may be overridden

GATE STATES (processing blocked):
  PAYROLL_LOCKED                 — period frozen; no automatic changes
  MANUALLY_CORRECTED             — HR has locked this record
  INVALIDATED                    — dependency deleted; previous result is void
```

---

## 5.2 Provisional State Definitions

### WAITING_FOR_DUTY_PLAN

| Property | Value |
|---------|-------|
| **Meaning** | Punch(es) arrived for employee-date but no DutyPlanValues exists |
| **Entry conditions** | Punch received AND DutyPlanValues query returns null AND before cutoff |
| **What is written to Oracle** | DUTYACTUALVALUES: ATT=WAITING_FOR_DUTY_PLAN (HDSP-only provisional code), FROMTIME=first IN punch (if exists) |
| **Exit → PRESENT** | DutyPlanCreatedEvent + OUT punch received + valid calculation |
| **Exit → MISS_PUNCH** | DutyPlanCreatedEvent + only one punch exists |
| **Exit → NPNL** | DutyPlanCreatedEvent + no punches (rare: punch lost) |
| **Exit → NOPLANSHIFT** | CutoffReachedEvent AND still no DutyPlan |
| **Exit → PAYROLL_LOCKED** | PayrollLock set (shouldn't happen during day, but possible) |
| **Timeout** | At DUTY_PLAN_CUTOFF (default 21:00) → transition to NOPLANSHIFT |
| **Compensation events** | On entry: emit `AttendanceProvisional(reason=NO_DUTY_PLAN)` |
| **On exit to final state** | Emit `AttendanceFinalized(previousState=WAITING_FOR_DUTY_PLAN, finalState=...)` |
| **Monitoring** | Alert supervisor if still in this state 2 hours after shift start |

---

### WAITING_FOR_PUNCH

| Property | Value |
|---------|-------|
| **Meaning** | DutyPlan exists, shift not yet started or shift in progress, no punches yet |
| **Entry conditions** | DutyPlan exists AND no ATTLOGS for this employee-date AND shift start time has not passed |
| **What is written** | DUTYACTUALVALUES: ATT=WAITING_FOR_PUNCH (provisional), no punch data |
| **Exit → PRESENT** | Both IN and OUT punches received within shift window |
| **Exit → MISS_PUNCH** | One punch received; shift end time passed |
| **Exit → NPNL** | Shift end time passed; zero punches received |
| **Exit → LEAVE** | Leave approval received (even if no punches) |
| **Exit → WEEK_OFF** | DutyPlan updated with ISWEEKOFF=Y |
| **Exit → HOLIDAY** | Holiday declared for this date |
| **Timeout** | At shift end + grace period → transition to NPNL (if no punches) or MISS_PUNCH (if partial) |
| **Compensation events** | None on entry. On NPNL finalization: emit `NPNLFinalized` |

---

### WAITING_FOR_OUT_PUNCH

| Property | Value |
|---------|-------|
| **Meaning** | IN punch received, OUT punch not yet received, shift still in progress |
| **Entry conditions** | IN punch received AND DutyPlan exists AND shift end time not yet passed |
| **Current attendance value** | MISS_PUNCH (provisional — will upgrade to PRESENT when OUT arrives) |
| **Exit → PRESENT** | OUT punch received; both punches valid |
| **Exit → MISS_PUNCH (final)** | Shift end + 2h grace period passed; still no OUT punch |
| **Exit → LEAVE** | Leave approved retroactively (unusual, but possible) |
| **Timeout** | After `shift_end + LATE_GRACE_PERIOD (default: 2 hours)` → MISS_PUNCH finalized |
| **Night shift note** | For night shifts: timeout is D2 morning, not D1 shift end |

---

### WAITING_FOR_NIGHT_COMPLETION

| Property | Value |
|---------|-------|
| **Meaning** | Night shift D1 IN received; waiting for D2 OUT to determine if full night was worked |
| **Entry conditions** | IS_NIGHT=Y in DutyPlan AND IN punch received D1 night AND no D2 OUT yet |
| **Current attendance (D1)** | MISS_PUNCH (provisional) |
| **Current attendance (D2)** | WAITING_FOR_DUTY_PLAN or WAITING_FOR_PUNCH depending on D2 plan status |
| **Exit → PRESENT (D1)** | D2 OUT received before plannextin cutoff; valid duration |
| **Exit → MISS_PUNCH (D1, final)** | D2 plannextin time reached; no OUT arrived |
| **Exit → PRESENT (D1) + MISS_PUNCH (D2)** | D2 OUT arrived before cutoff (D1 PRESENT) AND D2 has no separate IN |
| **Timeout** | At plannextin time on D2 (configurable; default: next shift start on D2) |
| **Cross-day coupling** | D1 and D2 records are coupled; changing D2 DutyPlan affects D1 cutoff |
| **Compensation events** | On entry: lock D1 as MISS_PUNCH provisional. On OUT received: emit `NightShiftCompleted` |

---

### WAITING_FOR_LEAVE_DECISION

| Property | Value |
|---------|-------|
| **Meaning** | Employee has a PENDING leave request (not yet APPROVED/REJECTED); attendance is ambiguous |
| **Entry conditions** | Leave record in EMPLOYEELEAVELIST with status=PENDING for this employee-date |
| **Current attendance** | Based on punches (PRESENT/MISSPUNCH/NPNL) — ignoring the pending leave |
| **Exit → LEAVE** | Leave approved → recalculate |
| **Exit → current punch-based value** | Leave rejected → recalculate (result same as if no leave request) |
| **Note** | HIS has no equivalent: by 01:00 AM, all leaves are either approved or rejected |
| **Timeout** | At batch lock time (23:00) → finalize based on current punch data (ignore pending leave) |

---

### WAITING_FOR_RECONCILIATION

| Property | Value |
|---------|-------|
| **Meaning** | HDSP has computed provisional attendance; HIS batch will run at 01:00; HDSP defers final authority to HIS |
| **Entry conditions** | After 23:00 batch lock; before 03:30 batch unlock |
| **Current attendance** | HDSP's last computed value (valid provisional) |
| **Exit → confirmed HDSP value** | HIS batch result matches HDSP → confirm HDSP record |
| **Exit → HIS value** | HIS batch result differs → accept HIS result, log divergence |
| **Duration** | 23:00 to ~03:30 (4.5 hours) |
| **Compensation events** | On HIS divergence: emit `HISHDSPDivergence(severity, reason)` |

---

## 5.3 Allowed State Transitions (Formal)

```
Legend:
  ──────► Normal transition
  - - - ► Timeout transition
  ═══════► Manual override transition (requires explicit authorization)
  ✗       Forbidden transition

PROVISIONAL STATES:
  WAITING_FOR_DUTY_PLAN ──────► WAITING_FOR_OUT_PUNCH (when plan arrives + IN exists)
  WAITING_FOR_DUTY_PLAN ──────► PRESENT (when plan + IN + OUT all exist at plan creation time)
  WAITING_FOR_DUTY_PLAN ──────► MISS_PUNCH (when plan arrives; only one punch exists)
  WAITING_FOR_DUTY_PLAN ──────► NPNL (when plan arrives; no punches; after shift window)
  WAITING_FOR_DUTY_PLAN ──────► LEAVE (when plan arrives; leave approved for same date)
  WAITING_FOR_DUTY_PLAN ──────► WEEK_OFF (when plan has ISWEEKOFF=Y)
  WAITING_FOR_DUTY_PLAN ──────► HOLIDAY (when holiday declared for this date)
  WAITING_FOR_DUTY_PLAN - - - ► NOPLANSHIFT (timeout: DUTY_PLAN_CUTOFF reached)
  WAITING_FOR_DUTY_PLAN ═══════► NOPLANSHIFT (manual: HR confirms no plan will be assigned)

  WAITING_FOR_PUNCH ──────────► PRESENT (IN + OUT received)
  WAITING_FOR_PUNCH ──────────► WAITING_FOR_OUT_PUNCH (IN received only)
  WAITING_FOR_PUNCH ──────────► LEAVE (leave approved)
  WAITING_FOR_PUNCH ──────────► WEEK_OFF (plan updated to weekoff)
  WAITING_FOR_PUNCH ──────────► HOLIDAY (holiday declared)
  WAITING_FOR_PUNCH - - - - - ► NPNL (timeout: shift end + grace, no punches)

  WAITING_FOR_OUT_PUNCH ──────► PRESENT (OUT punch received, valid)
  WAITING_FOR_OUT_PUNCH - - - ► MISS_PUNCH (timeout: shift end + 2h grace, no OUT)
  WAITING_FOR_OUT_PUNCH ──────► WAITING_FOR_NIGHT_COMPLETION (if IS_NIGHT and no D2 OUT yet)
  WAITING_FOR_OUT_PUNCH ──────► LEAVE (retroactive leave approval)

  WAITING_FOR_NIGHT_COMPLETION → PRESENT (D2 OUT received before cutoff)
  WAITING_FOR_NIGHT_COMPLETION → MISS_PUNCH (D2 cutoff reached, no OUT)
  WAITING_FOR_NIGHT_COMPLETION → LEAVE (leave applied to D1 date)

  WAITING_FOR_LEAVE_DECISION ─► LEAVE (leave approved)
  WAITING_FOR_LEAVE_DECISION ─► [punch-based state] (leave rejected/cancelled)
  WAITING_FOR_LEAVE_DECISION - ► [punch-based state] (timeout: batch lock time)

  WAITING_FOR_RECONCILIATION ─► [confirmed HDSP value] (HIS matches)
  WAITING_FOR_RECONCILIATION ─► [HIS value] (HIS differs; HDSP defers)

FINAL STATE TRANSITIONS (require DutyPlan change or other dependency change):
  PRESENT ────────────────────► LEAVE (retroactive leave approved)
  PRESENT ────────────────────► HOLIDAY (holiday declared after attendance computed)
  PRESENT ────────────────────► MISS_PUNCH (DutyPlan deleted; re-evaluation)
  PRESENT ────────────────────► WAITING_FOR_DUTY_PLAN (DutyPlan deleted, before cutoff)
  PRESENT ════════════════════► [any] (manual override)

  MISS_PUNCH ─────────────────► PRESENT (OUT punch arrives)
  MISS_PUNCH ─────────────────► LEAVE (leave approved)
  MISS_PUNCH ─────────────────► WAITING_FOR_DUTY_PLAN (DutyPlan deleted, before cutoff)

  NPNL ───────────────────────► MISS_PUNCH (punch arrives after shift end, somehow)
  NPNL ───────────────────────► LEAVE (retroactive leave)
  NPNL ───────────────────────► HOLIDAY (holiday declared)
  NPNL ───────────────────────► WAITING_FOR_DUTY_PLAN (DutyPlan deleted, before cutoff)

  NOPLANSHIFT ════════════════► WAITING_FOR_DUTY_PLAN (DutyPlan created; recalculation; before payroll lock)
  NOPLANSHIFT ════════════════► PRESENT (if punches exist and DutyPlan created)

GATE STATE TRANSITIONS:
  Any state ──────────────────► PAYROLL_LOCKED (payroll lock SET for period)
  PAYROLL_LOCKED ════════════► [any] (authorized payroll override only)

  Any state ──────────────────► MANUALLY_CORRECTED (HR sets manual lock)
  MANUALLY_CORRECTED ─────────► [same] (auto-recalculation blocked)
  MANUALLY_CORRECTED ════════► [any] (HR removes manual lock explicitly)

FORBIDDEN TRANSITIONS:
  PAYROLL_LOCKED → any automatic state (✗)
  MANUALLY_CORRECTED → any automatic state (✗)
  NOPLANSHIFT → PRESENT (✗ without going through WAITING_FOR_DUTY_PLAN first)
```

---

# PART 6 — DUTY PLAN LIFECYCLE

## 6.1 Complete DutyPlan Lifecycle States

```
┌─────────────────────────────────────────────────────────────────┐
│              DUTY PLAN LIFECYCLE STAGES                          │
│                                                                   │
│  STAGE 0: NOT CREATED                                            │
│    ↓ (in-charge action: create)                                  │
│  STAGE 1: JUST INSERTED                                          │
│    ↓ (in-charge action: modify shift/flags)                      │
│  STAGE 2: ACTIVE (read by HDSP for attendance)                   │
│    ↓ (in-charge action: change shift type)                       │
│  STAGE 3: MODIFIED (shift parameters changed)                    │
│    ↓ (HIS: 23:00 lock acquired)                                  │
│  STAGE 4: LOCKED FOR BATCH (read-only during HIS batch)          │
│    ↓ (HIS batch completes at ~03:00)                             │
│  STAGE 5: POST-BATCH (HIS has processed; corrections possible)   │
│    ↓ (payroll run at month-end)                                   │
│  STAGE 6: PAYROLL-LOCKED (no changes allowed)                    │
│    ↓ (rarely: retroactive correction with payroll adjustment)     │
│  STAGE 7: RETROACTIVELY MODIFIED (exceptional path)              │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6.2 Attendance Evolution Per Lifecycle Stage

| DutyPlan Stage | HDSP Attendance State | Auto-Recalculate? | HR Action Required? |
|---------------|----------------------|------------------|-------------------|
| Stage 0: NOT CREATED | WAITING_FOR_DUTY_PLAN (if punches exist) or WAITING_FOR_PUNCH | YES (when plan arrives) | NO |
| Stage 0 + cutoff passed | NOPLANSHIFT | Only if plan later created | YES (override) |
| Stage 1: JUST INSERTED | Recalculation triggered → PRESENT/MISS_PUNCH/NPNL/etc. | YES | NO |
| Stage 2: ACTIVE, no changes | Stable attendance state | NO | NO |
| Stage 3: MODIFIED (shift change) | Recalculation triggered → may change | YES | NO (automatic) |
| Stage 3: MODIFIED (minor, same window) | Recalculation triggered → may not change | YES | NO |
| Stage 4: LOCKED FOR BATCH | WAITING_FOR_RECONCILIATION | NO (frozen) | NO |
| Stage 5: POST-BATCH | Reconciled with HIS; HDSP may update | YES (reconciliation) | Only if divergence |
| Stage 5: MODIFIED (correction) | Recalculation triggered; audit logged | YES + ALERT | YES (confirm intent) |
| Stage 6: PAYROLL-LOCKED | PAYROLL_LOCKED | NO (blocked) | YES (payroll correction) |
| Stage 7: RETROACTIVELY MODIFIED | Complex: payroll correction process | MANUAL ONLY | YES |

---

## 6.3 DutyPlan INSERT → Attendance Cascade

```
T=13:00: DutyPlanValues INSERT (E001, 2026-07-02, shift=DAY_09_18)
  │
  ├─► DutyPlanPoller detects change (next poll: within 30s)
  ├─► Emits: DutyPlanCreatedEvent(empCode=E001, date=2026-07-02, shiftTypeId=DAY_09_18)
  ├─► RecalculationEngine loads:
  │     Punches: ATTLOGS for E001 on 2026-07-02 → [IN:08:00, OUT:18:00]
  │     DutyPlan: DAY_09_18 (FROMTIME=09:00, TOTIME=18:00, IS_NIGHT=N, ISLEAVE=N, etc.)
  │     Leave: none
  │     Holiday: none
  │     ShiftType: ISWORKSHIFT=Y
  ├─► Decision: isPunchOutTimeAfterPunchInTime(08:00, 18:00)=YES → PRESENT
  ├─► getworkDuration(08:00, 18:00) → 10:00 hours
  ├─► settimediffIn: 08:00 vs 09:00 → late by 60 minutes
  ├─► settimediffOut: 18:00 vs 18:00 → on time
  ├─► UPDATE DUTYACTUALVALUES: ATT=PRESENT, FROMTIME=08:00, TOTIME=18:00, WORKHOURS="10:00"
  ├─► INSERT PMS_PUNCHINGMASTER
  └─► Emit: AttendanceChangedEvent(E001, 2026-07-02, WAITING_FOR_DUTY_PLAN→PRESENT)
```

---

## 6.4 DutyPlan UPDATE → Attendance Cascade

```
T=15:00: DutyPlanValues UPDATE (E001, 2026-07-02, shift: DAY_09_18 → NIGHT_22_06)
  │
  ├─► DutyPlanPoller detects LAST_MODIFIED change (or cursor-based detection)
  ├─► Emits: DutyPlanModifiedEvent(E001, 2026-07-02, old=DAY_09_18, new=NIGHT_22_06)
  ├─► RecalculationEngine:
  │     Existing: PRESENT (calculated at 13:00 using day shift)
  │     New DutyPlan: IS_NIGHT=Y, FROMTIME=22:00, TOTIME=06:00 (next day)
  │     Punches: [IN:08:00, OUT:18:00] — these are now OUTSIDE the night shift window
  │     Decision: IS_NIGHT=Y → checkForNightShiftNxtDay()
  │               Night shift expected: 22:00 D1 → 06:00 D2
  │               Existing punches (08:00 IN, 18:00 OUT): in day hours, not night
  │               Result: NPNL (employee has no night shift punches)
  ├─► UPDATE DUTYACTUALVALUES: ATT=NPNL, FROMTIME=null, TOTIME=null, WORKHOURS=null
  ├─► Emit: AttendanceChangedEvent(E001, 2026-07-02, PRESENT→NPNL)
  └─► Emit: AttendanceRegression(E001, 2026-07-02, "PRESENT→NPNL due to shift change")
      [ALERT: Attendance regressed from PRESENT to NPNL. HR review recommended.]
```

---

## 6.5 DutyPlan DELETE → Attendance Cascade

```
T=16:00: DutyPlanValues DELETE (E001, 2026-07-02)
  [Detected via: next poll sees no record where one existed before]
  │
  ├─► Emits: DutyPlanDeletedEvent(E001, 2026-07-02)
  ├─► RecalculationEngine:
  │     DutyPlan: NONE
  │     Before cutoff (21:00)? YES (current time 16:00)
  │     Decision: → WAITING_FOR_DUTY_PLAN
  ├─► UPDATE DUTYACTUALVALUES: ATT=WAITING_FOR_DUTY_PLAN
  │     (preserve FROMTIME/TOTIME from existing punches — do NOT clear punch data)
  ├─► Emit: AttendanceChangedEvent(E001, 2026-07-02, PRESENT→WAITING_FOR_DUTY_PLAN)
  └─► Emit: DutyPlanDeletedAlert(E001, 2026-07-02, "Previous attendance was PRESENT")
      [ALERT: Duty plan deleted for active employee. Attendance reverted to provisional.]

If no new DutyPlan arrives by 21:00 (cutoff):
  ├─► CutoffReachedEvent fires
  ├─► WAITING_FOR_DUTY_PLAN → NOPLANSHIFT
  └─► Emit: NoplanshiftFinalized(E001, 2026-07-02, "No duty plan assigned before cutoff")
```

---

## 6.6 DutyPlan LOCKED (23:00 batch lock) → Attendance Cascade

```
T=23:00: dailyPunchUploadLock fires (HIS acquires lock on DUTYPLANVALUES)
  │
  ├─► HDSP recognizes lock time from config (batchLockTime=23:00)
  ├─► For all WAITING_FOR_DUTY_PLAN records for today:
  │     → Transition to NOPLANSHIFT (cutoff should have fired at 21:00, this is a safety net)
  │     → Emit: NoplanshiftFinalized for each
  ├─► All WAITING_FOR_RECONCILIATION records created:
  │     Current HDSP value preserved; reconciliation pending after batch
  ├─► DutyPlanPoller: PAUSE processing DutyPlan events for today
  │     (events for FUTURE dates: continue processing)
  └─► Monitoring: emit BatchWindowEntered event
```

---

## 6.7 Post-Batch Reconciliation (03:00-03:30) → Attendance Cascade

```
T=03:05: HIS batch complete; HDSP unlocks
  │
  ├─► ReconciliationWorker starts
  ├─► For each employee with DUTYACTUALVALUES updated by HIS tonight:
  │     1. Read HIS value: SELECT ATT FROM DUTYACTUALVALUES WHERE EMPCODE=:e AND ACTUALDATE=:d
  │     2. Read HDSP value: from HDSP's attendance_decisions table (HDSP's own record)
  │     3. Compare:
  │        SAME → emit ReconciliationMatch; mark HDSP record as HIS_CONFIRMED
  │        DIFFERENT → emit ReconciliationDivergence
  │                   → Apply HIS value to DUTYACTUALVALUES (HIS is authoritative tonight)
  │                   → Log divergence reason (analysis via leave/punch timing)
  └─► Emit: ReconciliationComplete(date, matched_count, diverged_count)
```

---

## 6.8 Payroll Lock → Attendance Cascade

```
T=PAYROLL_LOCK_DATE: Month-end payroll lock acquired
  │
  ├─► PayrollLockEvent(period=2026-07, lockTime=2026-07-31T23:59)
  ├─► For all DUTYACTUALVALUES in the period:
  │     → Mark HDSP records as PAYROLL_LOCKED
  │     → No further automatic recalculation allowed
  │     → Queue any pending recalculation jobs for the period → REJECTED with reason PAYROLL_LOCKED
  ├─► DutyPlanPoller: for events on payroll-locked dates → emit PayrollLockViolationAlert
  └─► Manual override path:
        HR must: 1. Request override; 2. Receive approval; 3. Execute manual recalculation
        HDSP does NOT auto-execute payroll-locked recalculations under any circumstances
```

---

## 6.9 State Machine Diagram (ASCII)

```
          ┌─────────────────────────────────────────────────────────────────┐
          │                    ATTENDANCE STATE MACHINE                      │
          │                                                                   │
          │  [PUNCH ARRIVES]                    [NO PUNCH]                   │
          │       │                                  │                        │
          │       ▼                                  ▼                        │
          │  ┌─────────────────┐            ┌─────────────────┐              │
          │  │ WAITING_FOR     │            │ WAITING_FOR     │              │
          │  │ DUTY_PLAN       │            │ PUNCH           │              │
          │  │ (has punches)   │            │ (no punches)    │              │
          │  └────────┬────────┘            └────────┬────────┘              │
          │           │ [DutyPlan arrives]            │ [DutyPlan exists]    │
          │           │                               │                       │
          │           └─────────────┬─────────────────┘                      │
          │                         │                                         │
          │           ┌─────────────▼──────────────┐                         │
          │           │     RECALCULATION ENGINE    │                         │
          │           │  (evaluates all deps once)  │                         │
          │           └─────────────┬──────────────┘                         │
          │                         │                                         │
          │        ┌────────────────┼────────────────┐                       │
          │        │                │                 │                       │
          │        ▼                ▼                 ▼                       │
          │  [IN only]        [IN + OUT]         [No punches]                 │
          │        │                │                 │                       │
          │        ▼                ▼                 ▼                       │
          │  WAITING_FOR      [evaluate          [evaluate                   │
          │  OUT_PUNCH        duration]          shift flags]                 │
          │        │                │                 │                       │
          │     [timeout]           │            ┌────┴──────┐               │
          │        │           ┌────┴──────┐     │           │               │
          │        ▼           │           │     ▼           ▼               │
          │  MISS_PUNCH    PRESENT    IS_NIGHT?  LEAVE/HOL  NPNL             │
          │  (final)      (final)       │       /WKOFF/etc                   │
          │                          [YES]      (final)     (final)          │
          │                             │                                     │
          │                             ▼                                     │
          │                    WAITING_FOR_NIGHT                             │
          │                    COMPLETION                                     │
          │                             │                                     │
          │                   ┌─────────┴─────────┐                          │
          │                   │                   │                           │
          │              [D2 OUT arrives]    [D2 cutoff timeout]              │
          │                   │                   │                           │
          │                   ▼                   ▼                           │
          │                PRESENT           MISS_PUNCH                       │
          │                (D1, final)       (D1, final)                      │
          │                                                                   │
          │  [CUTOFF REACHED, no DutyPlan]:                                   │
          │  WAITING_FOR_DUTY_PLAN ──────► NOPLANSHIFT (final)               │
          │                                                                   │
          │  [PAYROLL LOCK]:                                                  │
          │  Any state ──────────────────► PAYROLL_LOCKED (gate)             │
          │                                                                   │
          │  [MANUAL CORRECTION]:                                             │
          │  Any state ──────────────────► MANUALLY_CORRECTED (gate)         │
          └─────────────────────────────────────────────────────────────────┘
```
