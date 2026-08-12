# DUTYPLAN EVENT-DRIVEN ATTENDANCE ANALYSIS
## Late Duty Plan Assignment and Its Impact on Realtime Attendance

---

# PART 1 — HIS BEHAVIOUR WHEN DUTYPLANVALUES IS ABSENT

## 1.1 What HIS Actually Expects

**CONFIRMED (from scheduler XML):**
HIS runs attendance processing at 01:00 AM via `dailyPunchUploadCron`. By this time:
- eSSL biometric uploads are complete (device uploads happen throughout the day)
- DutyPlanValues assignment is complete (in-charges finish by ~22:00)
- The 23:00 lock (`dailyPunchUploadLock`) prevents further DutyPlanValues writes during batch

**IMPLICATION [CONFIRMED from operational timing]:** HIS was architecturally designed under the assumption that DutyPlanValues IS finalized before processing. It does not need to handle "plan not yet assigned" because the batch window (01:00 AM) is always after plan assignment (22:00 PM).

---

## 1.2 What HIS Does When DutyPlanValues Is Missing

This is the most critical question. Evidence:

**INFERRED (from bytecode method names and HQL query patterns):**
The query for DutyPlanValues uses:
```sql
SELECT * FROM DUTYPLANVALUES WHERE EMPCODE = :emp AND ACTUALDATE = :date
```
If this returns zero rows, the Java code receives `null` (Hibernate returns null for a single-result query with no match).

The subsequent code in `updateAtual()` reads shift flags from the returned object:
```java
shiftType.getIsNight()       // IS_NIGHT flag
shiftType.getIsWeekOff()     // ISWEEKOFF flag
shiftType.getIsLeave()       // ISLEAVE flag
// etc.
```

**If the query returns null, all flag reads would throw NullPointerException** — unless HIS wraps this in a null check.

**Three possible null-handling paths [INFERRED — confidence 60%]:**

**Path A — Null check → skip employee:**
```java
DutyPlan plan = dutyPlanDAO.findByEmpAndDate(empCode, date);
if (plan == null) {
    log.warn("No duty plan for " + empCode + " on " + date);
    return; // skip this employee entirely
}
```
Result: Employee has NO DUTYACTUALVALUES record for that date.
HIS attendance report shows a blank row or a missing record, which payroll interprets as "no data available."

**Path B — Null check → create EMPTY/NOPLANSHIFT record:**
```java
if (plan == null) {
    DutyActual da = new DutyActual();
    da.setAttendance(AttendanceType.EMPTY); // or NOPUNCHNOLEAVE
    da.setEmpCode(empCode);
    da.setActualDate(date);
    dutyActualDAO.save(da);
    return;
}
```
Result: DUTYACTUALVALUES has a record with ATT=EMPTY (or NOPUNCHNOLEAVE).

**Path C — No null check → NullPointerException → exception handler catches, logs, continues:**
```java
// If no null check exists and Spring @Transactional is per-employee:
// NPE is caught, employee is skipped (or rolled back), batch continues
```
Result: Same as Path A (no record) but logged as an error.

**Which path does HIS take? [UNKNOWN — not decompilable from strings extraction]**

Evidence leaning toward Path A or B (not C):
- HIS is a mature healthcare system; unhandled NPE on a common scenario is unlikely to survive production
- The `AttendanceType.EMPTY` constant exists in the bytecode — it was placed there for a reason
- Production hospitals report "missing" employees in attendance reports when no plan exists — consistent with Path A

**Most likely behavior [INFERRED, 65% confidence]: Path A — skip employee silently.**
The `EMPTY` code may be used for a different scenario (explicitly set shift type = empty).

---

## 1.3 Summary of HIS Missing-Plan Behavior

| Scenario | HIS Response | Confidence |
|----------|-------------|------------|
| No DutyPlanValues record at batch time | Skip employee OR write EMPTY | INFERRED 65% |
| DutyPlanValues record exists, ISWEEKOFF=Y | Write WEEOFF | CONFIRMED |
| DutyPlanValues record exists, shift flags normal, no punches | Write NOPUNCHNOLEAVE | STRONG-INFERRED |
| DutyPlanValues created AFTER 01:00 AM batch | Not processed until NEXT night's batch | CONFIRMED |
| DutyPlanValues created AFTER 23:00 lock | Lock prevents write; DBA workaround needed | CONFIRMED |

**KEY INSIGHT:** HIS never has to handle "plan arrives late" because the 23:00 lock + 01:00 batch creates a guaranteed window. HDSP has no such window — it operates 24/7 in realtime. This is a fundamentally new problem class.

---

# PART 2 — HDSP REALTIME STRATEGY ANALYSIS

## 2.1 The Problem Statement

```
08:00  →  Punch IN arrives at HDSP
08:01  →  HDSP queries DUTYPLANVALUES → NULL
08:01  →  Decision: what does HDSP do?
13:00  →  In-charge creates DutyPlanValues
13:00  →  Decision: does HDSP automatically react?
```

HDSP must produce an attendance decision that eventually matches what HIS would have produced if it ran at 01:00 AM the next day. But HDSP must make a decision NOW, at 08:01, with incomplete information.

---

## Strategy A — Immediately mark NOPLANSHIFT (or equivalent final state)

**Behavior:** When DutyPlanValues is absent at punch time, immediately write ATT=NOPLANSHIFT to DUTYACTUALVALUES. No further processing unless manually triggered.

**Advantages:**
- Simple to implement
- No open-ended waiting state
- Produces a deterministic result immediately

**Disadvantages:**
- WRONG in most cases. Plan is simply not assigned yet, not permanently missing.
- When plan arrives at 13:00, nothing automatically recalculates → NOPLANSHIFT remains wrong all day
- Requires manual intervention for EVERY employee whose plan is created after their first punch
- In a 300-bed hospital: ~20-50 employees may punch in before their plan is assigned on any given day
- Creates constant HR noise: "Why does HDSP show NOPLANSHIFT for all morning arrivals?"

**Verdict: REJECT.** Treats a temporary missing plan as a permanent condition.

---

## Strategy B — Store punch, wait indefinitely

**Behavior:** Accept the punch, store it in ATTLOGS (as currently done), but do NOT compute attendance. Leave DUTYACTUALVALUES row absent or in a PENDING state.

**Advantages:**
- Punch data is preserved and not lost
- No wrong decision is made

**Disadvantages:**
- HDSP's attendance dashboard is blank for many employees during morning hours
- Requires an external trigger or polling to eventually process the stored punch
- "Indefinite wait" creates zombie records that may never be processed if plan is never created
- Need a timeout strategy or the record waits forever

**Verdict: PARTIAL ACCEPT.** The punch storage part is correct (always store punches). The indefinite wait is the problem — needs a bounded timeout.

---

## Strategy C — Create provisional DutyActual with WAITING_FOR_DUTY_PLAN status

**Behavior:** Create a DUTYACTUALVALUES record immediately with a provisional status. Store what is known (punch times). When DutyPlanValues arrives, trigger recalculation.

```
08:01  →  Insert DUTYACTUALVALUES: EMPCODE=E001, DATE=2026-07-02
              ATT=WAITING_FOR_DUTY_PLAN, FROMTIME=08:00, TOTIME=null
13:00  →  DutyPlanValues INSERT detected for E001, 2026-07-02
13:00  →  Trigger recalculation → ATT=PRESENT, FROMTIME=08:00, TOTIME=18:00 (after OUT arrives)
```

**Advantages:**
- HDSP dashboard shows "waiting" instead of blank — visible to HR
- Punch data preserved and linked to date
- Clear trigger: "when plan arrives → recalculate"
- Bounded: plan either arrives or cutoff is reached

**Disadvantages:**
- Requires WAITING_FOR_DUTY_PLAN as a new provisional state
- HIS has no equivalent state → introduces a HDSP-only concept
- Must prevent HIS batch from overwriting WAITING_FOR_DUTY_PLAN with EMPTY at 01:00 AM

**Verdict: STRONG ACCEPT.** Correct conceptual model with manageable implementation cost.

---

## Strategy D — Keep employee in pending queue, retry X minutes

**Behavior:** On DutyPlanValues null, place the employee-date into a retry queue. Retry every N minutes until plan exists or cutoff reached.

```
08:01  →  Queue: (E001, 2026-07-02) → retry in 15 min
08:16  →  Query DUTYPLANVALUES → NULL → retry in 30 min
08:46  →  Query DUTYPLANVALUES → NULL → retry in 60 min
09:46  →  Query DUTYPLANVALUES → NULL → retry in 120 min
11:46  →  Query DUTYPLANVALUES → NULL → retry in 240 min
13:46  →  Query DUTYPLANVALUES → EXISTS → process attendance
```

**Advantages:**
- No need to detect DutyPlanValues INSERT events (polling is simpler)
- Self-contained retry logic
- Works even if DutyPlanValues event detection fails

**Disadvantages:**
- Average lag between plan creation (13:00) and detection (13:46) = 46 minutes
- Exponential backoff means later assignments are processed with greater delay
- Redis queue fills with pending retries for every early-arriving employee
- Still misses the "immediate" reaction when plan is inserted

**Verdict: COMPLEMENTARY STRATEGY.** Use as a FALLBACK if event detection fails, not as the primary mechanism.

---

## Strategy E — Poll DutyPlanValues table for changes

**Behavior:** Add a separate polling loop (like the existing ATTLOGS poll) that polls DUTYPLANVALUES for new/modified records.

```
HDSP already polls ATTLOGS every 1500ms
Add: HDSP polls DUTYPLANVALUES every 30s
On new/changed record → trigger recalculation for that employee-date
```

**Advantages:**
- Reuses existing polling architecture (proven pattern in HDSP)
- Near-realtime reaction (30s lag maximum)
- No need for Oracle triggers or CDC infrastructure

**Disadvantages:**
- How to detect "new" records vs. already-processed records? Need cursor/watermark.
- DUTYPLANVALUES is modified by HIS UI (not HDSP), so HDSP needs to track what it has already processed
- UPDATE detection needs last-modified timestamp in DUTYPLANVALUES (does it have one?)
- DELETE detection via polling is unreliable (record is gone before poll sees it)

**Verdict: PRIMARY MECHANISM for INSERT and UPDATE detection.** Cannot reliably detect DELETEs.

---

## Strategy F — Event-driven: DutyPlanValues as first-class event source [RECOMMENDED]

**Behavior:** Treat DutyPlanValues mutations (INSERT, UPDATE, DELETE) as attendance-affecting events, same as punch events.

```
ATTLOGS INSERT → PunchEvent → attendance recalculation
DUTYPLANVALUES INSERT → DutyPlanCreatedEvent → attendance recalculation
DUTYPLANVALUES UPDATE → DutyPlanModifiedEvent → attendance recalculation
DUTYPLANVALUES DELETE → DutyPlanDeletedEvent → attendance recalculation
```

**Detection mechanism:** Poll DUTYPLANVALUES with a change-detection watermark (LAST_MODIFIED_DATE or sequence-based cursor). When a change is detected, publish a DutyPlanEvent to the same Bull queue.

**Advantages:**
- Architecturally clean — every attendance-affecting entity emits events
- Immediate reaction when plan is inserted
- Same retry/error handling as existing punch event processing
- Scales to adding more event sources (Leave, Holiday) using same pattern
- Idempotent: replaying a DutyPlanCreatedEvent recalculates → same result

**Disadvantages:**
- Requires change detection on DUTYPLANVALUES (needs LAST_MODIFIED timestamp or INSERT_DATE column)
- If DUTYPLANVALUES has no change-tracking column, detection requires comparing snapshots (expensive)
- Must handle the case where HIS writes DUTYPLANVALUES and HDSP reacts before HIS is done (partial write)

**Verdict: RECOMMENDED PRIMARY ARCHITECTURE.** Strategy F (event source) + Strategy C (provisional state) + Strategy D (fallback retry) forms a complete, resilient solution.

---

## 2.2 Recommended Architecture

```
Punch arrives, no DutyPlanValues:
  1. Store punch in ATTLOGS (always — never drop a punch)
  2. Create DutyActual with provisional state WAITING_FOR_DUTY_PLAN
  3. Record: (EMPCODE, ACTUALDATE, pending_reason=NO_DUTY_PLAN)
  4. Set timeout: if no DutyPlan by CUTOFF_TIME → finalize as NOPLANSHIFT

DutyPlanValues INSERT detected by polling:
  1. Emit DutyPlanCreatedEvent(empCode, actualDate)
  2. RecalculationEngine picks up event
  3. Re-runs full attendance decision with now-available DutyPlan
  4. Updates DutyActual from WAITING_FOR_DUTY_PLAN → PRESENT/MISSPUNCH/etc.

Cutoff reached (configurable, default 22:00):
  1. All remaining WAITING_FOR_DUTY_PLAN for today → NOPLANSHIFT
  2. No further automatic recalculation (manual override only)
```

---

# PART 3 — DUTYPLANVALUES AS AN EVENT SOURCE

## 3.1 Complete List of Attendance-Affecting Database Objects

| Object | Table | Change Type | Attendance Impact |
|--------|-------|-------------|------------------|
| Punches | ATTLOGS | INSERT | Direct — primary attendance input |
| Duty Plan | DUTYPLANVALUES | INSERT | Unlocks attendance calculation |
| Duty Plan | DUTYPLANVALUES | UPDATE | May change shift type → recalculate |
| Duty Plan | DUTYPLANVALUES | DELETE | Removes basis → revert to WAITING or NOPLANSHIFT |
| Leave Approval | EMPLOYEELEAVELIST | INSERT/UPDATE | May change PRESENT → LEAVE |
| Leave Cancellation | EMPLOYEELEAVELIST | UPDATE (status=CANCELLED) | Reverts LEAVE → re-evaluate punches |
| Holiday Declaration | HOLIDAY_MASTER (or equivalent) | INSERT | PRESENT → PUBLICHOLLYDAY |
| Holiday Cancellation | HOLIDAY_MASTER | DELETE | Reverts PUBLICHOLLYDAY → re-evaluate |
| Shift Type Config | SHIFTTYPE | UPDATE | Changes shift times → recalculate differentials |
| Employee Status | EMPLOYEE_MASTER | UPDATE (resigned, transferred) | May void attendance |
| Compensatory Grant | COMPENSATORY_MASTER | INSERT | Creates COMPENSATORYOFF |
| Compensatory Cancel | COMPENSATORY_MASTER | DELETE | Reverts COMPENSATORYOFF |
| Manual Correction | DUTYACTUALVALUES | Manual UPDATE | Override — protected from auto-recalculation |
| Payroll Lock | PAYROLL_LOCK (or config) | INSERT | Freeze — no further recalculation |
| Roster Correction | DUTYPLANVALUES | UPDATE (change of shift) | Shift changed → full recalculation |

---

## 3.2 Event Generation Rules

```
DutyPlanValues INSERT (new plan for employee-date):
  → Emit: DutyPlanCreatedEvent
  → Recalculate: attendance for empCode + date
  → Priority: HIGH (employee may have been waiting hours)

DutyPlanValues UPDATE (shift time change, flag change):
  → Emit: DutyPlanModifiedEvent
  → Recalculate: attendance for empCode + date
  → Priority: MEDIUM (plan existed; refine calculation)

DutyPlanValues DELETE:
  → Emit: DutyPlanDeletedEvent
  → Recalculate: attendance for empCode + date
  → Result: if no other plan → WAITING_FOR_DUTY_PLAN (if before cutoff) or NOPLANSHIFT (if after cutoff)
  → Priority: HIGH (current attendance is now invalid)

Leave APPROVED (EMPLOYEELEAVELIST insert or status change to APPROVED):
  → Emit: LeaveApprovedEvent
  → Recalculate: attendance for empCode + date range
  → Priority: MEDIUM

Leave CANCELLED:
  → Emit: LeaveCancelledEvent
  → Recalculate: attendance for empCode + date range
  → Priority: MEDIUM

Holiday DECLARED:
  → Emit: HolidayDeclaredEvent
  → Recalculate: attendance for ALL employees on that date
  → Priority: LOW (batch-safe, can be queued)

Shift Type CONFIG change:
  → Emit: ShiftTypeChangedEvent
  → Recalculate: attendance for all employees with that shift type on affected dates
  → Priority: LOW (may affect many records — throttle)
```

---

# PART 9 — EDGE CASE ANALYSIS

## EC-001: Punch Before DutyPlan Creation

**Scenario:** Employee punches IN at 08:00. DutyPlanValues created at 13:00. Employee punches OUT at 18:00.

| Phase | HIS | HDSP (Current) | HDSP (Recommended) |
|-------|-----|----------------|-------------------|
| 08:00 | N/A (batch not run yet) | Queries DUTYPLANVALUES → null → NOPLANSHIFT (premature) | Creates provisional WAITING_FOR_DUTY_PLAN, FROMTIME=08:00 |
| 13:00 | N/A | No automatic reaction | DutyPlanCreatedEvent → recalculate → MISSPUNCH (IN exists, no OUT yet) |
| 18:00 | N/A | OUT processed but no DutyPlan attached | OUT arrives → PRESENT (both punches + plan now exists) |
| 01:00+1d | Runs batch: plan exists, both punches → PRESENT | — | Already PRESENT. HIS batch may overwrite or confirm. |

**Compensation events required:**
1. `NOPLANSHIFT_ISSUED` → compensated by `DUTYPLAN_CREATED` → recalculation
2. `MISSPUNCH_PROVISIONAL` → compensated by `PUNCH_OUT_RECEIVED` → PRESENT

**Risk: LOW** — With recommended architecture, final state matches HIS.

---

## EC-002: Multiple Punches Before DutyPlan Creation

**Scenario:** Employee has 3 punches (IN 08:00, OUT 10:00 re-entry, IN 10:30) before DutyPlan created at 13:00.

**HDSP behavior:**
- Each punch is stored in ATTLOGS (regardless of plan status)
- Provisional state: WAITING_FOR_DUTY_PLAN (accumulating punches)
- At 13:00 DutyPlanCreatedEvent: recalculate using ALL stored punches
- Dedup logic (15-min window) applied across all punches in one pass
- Final decision: PRESENT or MISSPUNCH depending on punch validity

**Key requirement:** Recalculation must process ALL ATTLOGS for that employee-date, not just the triggering punch. A new full recalculation from scratch is safer than incremental.

**Risk: LOW** — Punches are never dropped; they accumulate until recalculation is triggered.

---

## EC-003: DutyPlan Created After Employee Already Punched OUT (Full Day Complete)

**Scenario:** Employee punches IN 08:00, OUT 18:00. DutyPlan created at 21:00 (late assignment).

**HIS behavior:** No issue — 01:00 batch processes both punches with 21:00 plan.

**HDSP current behavior:** 
- 08:00 IN: no plan → NOPLANSHIFT
- 18:00 OUT: no plan → NOPLANSHIFT (or ignored)
- 21:00: no reaction to plan creation

**HDSP recommended behavior:**
- 08:00 IN: WAITING_FOR_DUTY_PLAN, FROMTIME=08:00
- 18:00 OUT: still WAITING_FOR_DUTY_PLAN, TOTIME=18:00 (punch stored)
- 21:00 DutyPlanCreatedEvent: full recalculation → PRESENT (both punches, plan confirmed)

**Compensation events:**
1. DutyPlanCreatedEvent → attendance recalculation → WAITING_FOR_DUTY_PLAN → PRESENT

**Risk: LOW** — Both punches stored; recalculation produces correct final state.

---

## EC-004: DutyPlan Changed After Attendance Already Calculated

**Scenario:** DutyPlan created 09:00 (employee in night shift 22:00-06:00). HDSP calculated attendance correctly as PRESENT night shift. At 14:00, in-charge changes the plan to day shift (09:00-18:00).

**HIS behavior:** HIS batch at 01:00 the next day uses the LATEST DutyPlanValues record. If plan was updated to day shift at 14:00, HIS processes using day shift parameters. Employee has no punches during 09:00-18:00 → NOPUNCHNOLEAVE. Night shift punches (22:00-06:00) might be re-evaluated as MISSPUNCH (wrong time for day shift).

**HDSP recommended behavior:**
- DutyPlanModifiedEvent(shift: night→day) triggers recalculation
- Existing punches (22:00-06:00) now evaluated against day shift (09:00-18:00)
- No punches in day shift window → NOPUNCHNOLEAVE
- Night punches treated as outside-shift-hours punches → not counted
- Compensation event: PRESENT_NIGHT_SHIFT → reverted to NOPUNCHNOLEAVE

**Risk: HIGH** — Employee worked the night shift but the plan change makes them NOPUNCHNOLEAVE. This is an HR/managerial error that HDSP faithfully propagates. Mitigation: alert HR when a plan change reverts PRESENT to a worse attendance state.

---

## EC-005: DutyPlan Deleted After Attendance Finalized

**Scenario:** PRESENT was calculated and recorded. HR deletes the DutyPlanValues record (data correction, wrong employee assigned).

**HIS behavior [UNKNOWN]:** If batch re-runs with no plan, likely produces EMPTY or skips the employee. No plan = no valid attendance base.

**HDSP recommended behavior:**
- DutyPlanDeletedEvent → recalculation → no plan exists
- If before cutoff: WAITING_FOR_DUTY_PLAN (plan might be recreated)
- If after cutoff: NOPLANSHIFT
- Compensation event: PRESENT → reverted to WAITING_FOR_DUTY_PLAN or NOPLANSHIFT
- Alert: "DutyPlan deleted for employee X on date D. Previous attendance: PRESENT. Now: WAITING_FOR_DUTY_PLAN."

**Risk: MEDIUM** — Depends on whether HR intends to recreate the plan or permanently remove it.

---

## EC-006: Employee Reassigned to Different Shift After Punches Exist

**Scenario:** Employee assigned to night shift (22:00-06:00). Punches IN at 22:00. In-charge reassigns to day shift at 23:30 (shift change, not a plan deletion + recreation but an UPDATE).

**HDSP recommended behavior:**
- DutyPlanModifiedEvent(old: night_shift, new: day_shift)
- Recalculate using day shift parameters
- IN at 22:00 is now OUTSIDE day shift window
- Outcome: NOPUNCHNOLEAVE or MISSPUNCH (IN exists but not in expected window)
- This is correct — the plan IS day shift; employee punched at wrong time for THIS plan

**Distinction:** The employee MAY have actually worked night shift (wrong plan), or may NOT have worked day shift (correctly absent). HDSP cannot know — it faithfully applies the plan.

**Risk: MEDIUM** — Must trust the plan. If plan is wrong, HR must correct it and HDSP re-recalculates.

---

## EC-007: Night Shift Where Next Day's DutyPlan Is Created Late

**Scenario:** Night shift D1 22:00 → D2 06:00. D1 DutyPlan exists. D2 DutyPlan (for determining next shift start) not yet created at midnight.

**Impact on night shift cutoff calculation:**
HDSP uses `plannextin` (next shift start on D2) to determine the cutoff for D2 OUTs.
If D2 DutyPlanValues doesn't exist at midnight, `plannextin` is UNKNOWN.

**HDSP recommended behavior:**
- At midnight, when determining D1 night shift cutoff: query D2 DutyPlanValues
- If D2 plan missing: use a DEFAULT CUTOFF (configurable, e.g., 12:00 noon D2)
- When D2 plan eventually created: re-evaluate night shift cutoff
- If D2 OUT is now reclassified (was assigned to D1, now should be D2 or vice versa): re-recalculate D1 and D2 attendance

**Risk: HIGH** — Night shift cutoff calculation depends on D2 plan. Missing D2 plan = default cutoff = potentially wrong D1 attendance. Mitigation: make default cutoff conservative (e.g., 06:00 = planned shift end), then expand when D2 plan is known.

---

## EC-008: Split Shift Assigned After Punches Already Arrived

**Scenario:** Employee punches IN at 09:00 and OUT at 13:00. Originally on simple day shift. At 14:00, plan is updated to ISSPLITSHIFT=Y (09:00-13:00 + 14:00-18:00).

**HDSP recommended behavior:**
- DutyPlanModifiedEvent(ISSPLITSHIFT: false→true)
- Recalculate: employee has IN+OUT for first half → MISSPUNCH for second half (no 14:00 IN)
- Wait for 14:00 IN and 18:00 OUT to complete the day
- State: WAITING_FOR_SECOND_HALF_PUNCH (a sub-state of PROVISIONAL)

**Risk: MEDIUM** — Split shift adds complexity. Need clear definition of "complete" for split shift.

---

## EC-009: Retroactive DutyPlan Changes for Previous Dates

**Scenario:** It is 2026-07-05. HR corrects DutyPlanValues for 2026-07-01 (4 days ago).

**HIS behavior [INFERRED]:** HIS has no automated retroactive reprocessing. If a DBA manually re-triggers the batch for an old date (possible via Quartz admin UI), HIS would reprocess July 1. Otherwise, no automatic reaction.

**HDSP recommended behavior:**
- DutyPlanModifiedEvent for a past date triggers recalculation for that past date
- BUT: Is the past date payroll-locked? If yes → REJECT recalculation, require manual override
- If not locked: recalculate July 1 attendance based on current DutyPlanValues + ATTLOGS for July 1
- Emit alert: "Retroactive attendance recalculation for E001 on 2026-07-01"

**Risk: HIGH** — Retroactive changes may have payroll consequences. Must have:
1. Explicit payroll lock check before any retroactive recalculation
2. Audit log of all retroactive recalculations
3. HR approval workflow before automated change (or at minimum, notification)

---

## EC-010: Attendance Already Approved Before DutyPlan Modification

**Scenario:** HR supervisor has approved (marked as confirmed) employee's PRESENT attendance for today. DutyPlan is then modified.

**HDSP recommended behavior:**
- Before recalculation: check if DUTYACTUALVALUES has a MANUAL_LOCKED or APPROVED flag
- If APPROVED: do NOT auto-recalculate; emit alert instead
- Alert: "Attendance for E001 on 2026-07-02 was approved but the duty plan has changed. Manual review required."
- HR must explicitly unlock and trigger recalculation

**Risk: MEDIUM** — Approved attendance should not be silently overridden. This is a business rule that HDSP must respect.

---

## EC-011: Payroll Already Generated Before DutyPlan Modification

**Scenario:** Month-end payroll has been run for June. In July, HR discovers June 15 DutyPlan was wrong and modifies it.

**HDSP recommended behavior:**
- Payroll-locked period: June attendance → LOCKED
- DutyPlanModifiedEvent for June 15: attempt recalculation → BLOCKED by payroll lock
- Emit: PayrollLockViolationAlert(empCode, date, reason="DutyPlan modified after payroll lock")
- No automatic recalculation occurs
- HR/Payroll team receives alert and decides whether to manually adjust payroll

**Risk: CRITICAL** — Payroll corrections in a locked period require human decision. HDSP must never automatically modify attendance in a payroll-locked period.

---

## EC-012: Two DutyPlans for Same Employee-Date (Duplicate Assignment)

**Scenario:** In-charge accidentally creates DutyPlanValues for E001 on 2026-07-02 twice. Two records exist for the same employee-date.

**HIS behavior [INFERRED]:** As noted in the reverse engineering audit, if ROWNUM=1 is used without ORDER BY, the result is non-deterministic. HIS may return either record.

**HDSP recommended behavior:**
- DutyPlanCreatedEvent fires twice for same employee-date
- Second event triggers recalculation (idempotent if same plan)
- If plans are different shifts: emit DuplicateDutyPlanAlert
- Use the MOST RECENTLY CREATED plan (by INSERT_DATE DESC)
- Log the conflict: "Multiple DutyPlanValues found for E001 on 2026-07-02. Using most recent."

**Risk: MEDIUM** — Conflict resolution rule must be explicit and documented.

---

## EC-013: Device Sync Delayed — Punches Arrive Hours After Actual Punch Time

**Scenario:** Biometric device was offline. At 20:00, device comes back online and syncs 200 punches from the day, including an 08:00 IN for E001.

**DutyPlanValues situation:** Plan was created at 09:00 (normal). But when this batch of 200 late punches arrives at 20:00, HDSP processes them all at once.

**HDSP recommended behavior:**
- Process each punch by its LOGDATETIME (not by arrival time)
- E001's 08:00 IN: lookup DutyPlanValues for 2026-07-02 → EXISTS (created at 09:00) → process normally
- No WAITING_FOR_DUTY_PLAN needed (plan exists when punch arrives, even if punch was originally at 08:00)
- Same result as if punch arrived at 08:00 in real time

**Key principle:** HDSP should use LOGDATETIME (the actual punch time), not processing time, for all attendance decisions. Late-arriving punches should be processed as if they arrived on time.

**Risk: LOW** — If plan exists, late punch sync is transparent. If plan doesn't exist yet (device sync arrives before plan), falls into EC-001 handling.
