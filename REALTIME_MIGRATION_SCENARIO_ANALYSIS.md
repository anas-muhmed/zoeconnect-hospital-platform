# REALTIME MIGRATION SCENARIO ANALYSIS

**Purpose:** For every HIS attendance scenario, define the correct HDSP realtime behavior — whether to process immediately, defer, recalculate, open pending state, merge with future punches, reconcile, rollback, or compensation event.  
**Scope:** Covers night shift deep analysis (Part 5), realtime conversion (Part 6), and batch vs. realtime comparison (Part 9) from the task specification.  
**Date:** 2026-07-02

---

## PART 1 — THE CORE ARCHITECTURAL DIFFERENCE

### 1.1 Why "Copy the HIS Algorithm" Is Insufficient

HIS makes one foundational assumption: **all data for a duty date is final before processing begins.**

At 01:00 AM, HIS knows:
- All ATTLOGS punches have arrived (device sync complete)
- All leave approvals are in final state
- All roster entries are finalized (lock at 23:00)
- The date being processed is complete (yesterday)

**HDSP receives punches immediately.** When the first punch arrives at 08:01 AM, HDSP has:
- Incomplete ATTLOGS (only one punch so far)
- Leave status may still change (employee requests leave mid-morning)
- Roster may still change (HR makes corrections until evening)
- The duty date is still in progress (16 hours remain)

Therefore, HDSP cannot decide "PRESENT vs MISSPUNCH" at first punch. It must:
1. Record what is known now (partial state)
2. Update when new information arrives
3. Reconcile at end-of-day to handle what HIS would have seen at 01:00 AM

### 1.2 The Four Processing Modes for HDSP

| Mode | When to Use | Mechanism |
|---|---|---|
| **IMMEDIATE** | Shift-type flags can be decided without punches (WEEOFF, HOLIDAY, LEAVE) | Process on first roster fetch; update Oracle |
| **PROVISIONAL** | Punch arrived; decision may change (PRESENT → may add punch later; MISSPUNCH → OUT may arrive) | Write provisional result; set flags for re-evaluation |
| **DEFERRED** | Decision requires data not yet available (night shift OUT not yet arrived; next day punch expected) | Write pending record; leave open |
| **TRIGGERED** | Decision re-made when external state changes (leave approved, roster changed, holiday declared) | Event listener → recalculate |

---

## PART 2 — NIGHT SHIFT DEEP ANALYSIS

### 2.1 The Fundamental Night Shift Problem

Night shift 20:00 D1 → 08:00 D2:

| Time | Event | HIS (batch) | HDSP (realtime) |
|---|---|---|---|
| 20:00 D1 | Employee punches IN | Nothing | HDSP: receives punch; no OUT yet → provisional MISSPUNCH |
| 23:59 D1 | Calendar day changes | Nothing | HDSP: D1 becomes "yesterday"; but OUT has not arrived yet |
| 01:00 D2 | HIS batch runs for D1 | HIS: finds 20:00 IN, no OUT → saves partial | HDSP: D1 already has MISSPUNCH written |
| 06:00 D2 | Employee punches OUT | Nothing (HIS batch already ran for D2 at 01:00) | HDSP: OUT arrives → must retroactively complete D1 |
| 01:00 D2+1 | HIS batch runs for D2 | HIS: finds 06:00 OUT on D2 → completes D1 record | HDSP: already handled in realtime |

**The key insight:** HDSP must do what HIS does across two batch runs IN REAL TIME. When a night shift OUT arrives at 06:00 D2, HDSP must:
1. Identify that this OUT belongs to the D1 night shift (not to a D2 shift)
2. Retrieve the D1 attendance event
3. Mark it as PRESENT with the correct duration
4. Update DUTYACTUALVALUES for D1 (retroactive update)
5. Write CORRESPONDINGDUTYDAY on both records

### 2.2 Night Shift Boundary — Exact Algorithm for HDSP

**The HIS algorithm (reconstructed):** Uses `plannextin` (next shift start on D2) as the boundary between night shift punches and D2 day shift punches.

**HDSP must implement:**
```
FUNCTION resolveNightShiftBoundary(empCode, nightShiftDutyDate):
  nightShift = getRoster(empCode, nightShiftDutyDate)
  nextDayDate = nightShiftDutyDate + 1
  nextDayPlan = getRoster(empCode, nextDayDate)
  
  IF nextDayPlan EXISTS:
    nightShiftCutoff = parseTime(nextDayDate + 'T' + nextDayPlan.shiftStart)
    // e.g., "2026-07-02T13:00:00" for a 13:00 start
  ELSE:
    // No next-day plan; use a conservative default
    nightShiftCutoff = nightShiftDutyDate + 1 + nightShift.plannedEnd
    // e.g., if night shift ends at 08:00, cutoff = next day 08:00
  
  RETURN nightShiftCutoff
```

**Punch assignment rule:**
- Punches on D1: always belong to D1 (IN punches for night shift)
- Punches on D2 BEFORE nightShiftCutoff: belong to D1 night shift (OUT punches)
- Punches on D2 AT or AFTER nightShiftCutoff: belong to D2's own shift

### 2.3 Every Night Shift Variation — Realtime Behavior

**Variation N01: Perfect night shift (IN D1, OUT D2 before planned end)**
```
HIS: D1 batch saves partial; D2 batch completes
HDSP: 
  D1 IN arrives → create D1 event (provisional DEFERRED: night shift)
  D2 OUT arrives (before cutoff) → update D1 event → PRESENT
  Write CORRESPONDINGDUTYDAY on both DUTYACTUALVALUES
Mode: DEFERRED → TRIGGERED by D2 OUT arrival
```

**Variation N02: Night shift OUT arrives exactly at planned end**
```
Same as N01. No boundary ambiguity.
```

**Variation N03: Night shift OUT arrives after planned end (overtime)**
```
D2 OUT = 10:00; night shift planned end = 08:00; next D2 shift starts 13:00
cutoff = 13:00 → 10:00 < 13:00 → assigned to night shift ✓
HDSP: D1 PRESENT with extended duration
Differential: punchOutDiff = 0 (left after planned end; no early-out penalty)
```

**Variation N04: Night shift IN only (no OUT ever arrives)**
```
D1 IN arrives → DEFERRED state
D2: no OUT before cutoff
D2 batch boundary passes → night reconciliation job triggers
Night recon: D1 event has no paired OUT → set MISSPUNCH
HDSP: night reconciliation (01:30 AM cron) handles this
```

**Variation N05: Night shift OUT only (no D1 IN)**
```
D1: no IN punch → no event created for D1 (or NPNL created)
D2: OUT arrives → no D1 night shift event to attach to
HDSP: D2 OUT processed against D2's own roster
If D2 roster is a day shift: MISSPUNCH (OUT with no IN for D2)
Result: D1 = NPNL, D2 = MISSPUNCH
```

**Variation N06: Night shift IN very early (before planned start)**
```
Night shift: 22:00-08:00. Employee punches 18:00 IN.
HIS: MIN('in') = 18:00; FROMDATETIME = 18:00; no penalty for early IN
HDSP: Same; no upper bound on early IN
Duration inflated by 4 hours (18:00-22:00 counted)
Recommendation: Implement maxEarlyArrivalMinutes for night shifts
Currently missing in both HIS and HDSP
```

**Variation N07: Night shift with allowSinglePunch=true, IN only**
```
HIS: allowSinglePunchForNightShift = true → single IN = PRESENT
HDSP: Config exists ([CONFIRMED] in HIS); HDSP doesn't implement
HDSP behavior: MISSPUNCH (wrong)
Fix needed: Add allowSinglePunchForNightShift to HDSP shift rules
```

**Variation N08: Two consecutive night shifts (Mon night, Tue night)**
```
Mon 22:00 IN → Tue 06:00 OUT → Mon PRESENT
Tue 22:00 IN → Wed 06:00 OUT → Tue PRESENT

HIS: Each batch independently handles each pair
HDSP: 
  Mon 22:00 IN → DEFERRED (D1 Mon event)
  Tue 06:00 OUT → before Tue shift start (cutoff) → completes Mon event → PRESENT
  Tue 22:00 IN → DEFERRED (D1 Tue event)
  Wed 06:00 OUT → completes Tue event → PRESENT
Note: Tue 06:00 OUT must be checked: does it complete MON or start TUE?
      cutoff for Mon night = Tue 22:00 (next night shift start) → 06:00 < 22:00 → Mon ✓
```

**Variation N09: Night shift then day shift (transition)**
```
Mon: Night shift 22:00-08:00 (IS_NIGHT = true)
Tue: Day shift 08:00-17:00 (IS_NIGHT = false)

cutoff for Mon night shift = Tue day shift start = 08:00
Mon 22:00 IN → DEFERRED
Tue 06:00 OUT → before 08:00 → completes Mon → PRESENT
Tue 08:00 IN → new Tue event → starts DEFERRED for Tue day shift
Tue 17:00 OUT → completes Tue → PRESENT

[BOUNDARY EDGE CASE]:
If employee punches OUT at exactly 08:00 → cutoff = 08:00 → 08:00 < 08:00? Or <=?
The boundary condition (< vs <=) determines whether 08:00 punch is Mon OUT or Tue IN.
Recommendation: Use < cutoff (exclusive) for OUT; >= cutoff for IN.
```

**Variation N10: Night shift spanning month end (Jul 31 → Aug 1)**
```
HIS: fromLastMonLastDate = TRUE; getPrevMonthLastDayPlanRoster() gets Jul 31 plan
HDSP:
  Jul 31 22:00 IN → DEFERRED (Jul 31 event)
  Aug 1 06:00 OUT → arrive in Aug → must still complete Jul 31 event
  cutoff = Aug 1 next-shift start (if any) or default 08:00
  Aug 1 06:00 < cutoff → completes Jul 31 event → PRESENT

Implementation need: The retroactive update crosses a month boundary. The Jul 31
DUTYACTUALVALUES record must be updated during August processing.
Recommendation: Store the "pending night shift" state in PostgreSQL with the D1 duty date.
When D2 OUT arrives (any date), look up pending state by (empCode, "NIGHT_SHIFT_PENDING").
```

**Variation N11: Night shift spanning year end (Dec 31 → Jan 1)**
```
Same as month-end but year boundary.
Jan 1 OUT → completes Dec 31 event.
Additional risk: Year-end payroll close may have locked Dec 31 records.
HDSP: After Jan 1 OUT arrives → attempt to update Dec 31 DUTYACTUALVALUES → Oracle may reject if locked.
Need: "graceful degradation" when retroactive update fails → log for HR.
```

**Variation N12: Night shift, employee works overtime until Day3**
```
Night shift 22:00 D1 → planned end 08:00 D2
Employee actual OUT: 20:00 D2 (12 extra hours)

cutoff = D2 next shift start (e.g., 22:00 D2 if another night shift)
20:00 D2 < 22:00 D2 → assigned to D1 night shift ✓
Duration = 22:00 D1 → 20:00 D2 = 22 hours

HDSP: D2 20:00 OUT arrives → check: is there a pending D1 night shift? YES → complete it → PRESENT 22h
```

**Variation N13: Night shift D2 OUT arrives after D2's night shift IN (next night started)**
```
D1 night shift 22:00-08:00. D2 night shift 22:00-08:00.
D1 IN: 22:00 D1
D2 OUT: 10:00 D2 (missed planned 08:00)
D2 IN: 22:00 D2 (new night shift started)

cutoff for D1 = D2 next-shift start = 22:00 D2
D2 OUT 10:00 < 22:00 → assigned to D1 ✓

HDSP: D2 OUT arrives at 10:00 → pending D1 event found → complete D1 → PRESENT
D2 IN arrives at 22:00 → new DEFERRED event for D2
```

**Variation N14: Night shift OUT arrives 3 days late (device offline)**
```
Night shift 22:00 D1. OUT arrives as a late sync on D4.
D4 ATTLOGS entry: logdatetime = D2 06:00 (original time, not sync time)

HIS: D2 batch already ran without this OUT → D1 = MISSPUNCH
     D4 batch: sees D2 06:00 OUT (correct timestamp) in ATTLOGS for D2 date → 
     [INFERRED] HIS would try to reprocess D2, but D2 batch already ran
     Result: This late punch is effectively lost in HIS

HDSP: maxBackdatedPunchDays = 7 → accept if within 7 days
     D4: ATTLOGS row with logdatetime=D2 06:00 arrives → HDSP poll discovers it
     D1 event exists (MISSPUNCH) → Out punch is for D2 date → needs D1 context
     HDSP must: find D1 pending/MISSPUNCH event → retroactively update to PRESENT
Mode: RETROACTIVE — must update historical record
```

**Variation N15: Night shift IN day1, leave on day2**
```
D1: Night shift 22:00 IN
D2: Approved leave (LEAVE status)

HIS: [CONFIRMED] leaveToNight flag handles this
     D1 record: PRESENT (night shift on D1)
     D2 record: LEAVE (leave approval on D2)
     D1's OUT punch: The night shift ends at 08:00 D2 (on leave day)
     HIS uses previousDayLeaveCalAlreadyPresent to track D2's leave

HDSP:
     D1 22:00 IN → DEFERRED (night shift)
     D2 LEAVE flagged by roster → D2 record = LEAVE immediately
     D2 06:00 OUT arrives → cutoff = D2 next shift? or D2 leave?
     [PROBLEM]: Is the D2 06:00 OUT valid for completing D1 night shift
                even though D2 is a leave day?
     YES — the OUT punch is the physical end of the D1 night shift, not the start of D2
     HDSP: even on D2 leave days, OUT punches before cutoff complete D1 night shift
     D1: PRESENT; D2: LEAVE (independent decisions)
```

**Variation N16: Night shift with month boundary and leave**
```
Jul 31 night shift. Aug 1 is approved leave.
Jul 31 22:00 IN → DEFERRED
Aug 1 06:00 OUT → completes Jul 31 → PRESENT
Aug 1: LEAVE (roster says leave) → separate D2 record

HDSP: Aug 1 OUT before Aug 1 shift start → completes Jul 31 night → PRESENT
      Jul 31 DUTYACTUALVALUES updated in August batch context
```

---

## PART 3 — CAN THIS WORK IN REALTIME? (Per Algorithm)

### 3.1 Realtime Compatibility Matrix

| # | HIS Algorithm | Realtime? | Reason If Not | Required Change |
|---|---|---|---|---|
| R01 | Shift-type flag evaluation (WEEOFF, HOLIDAY, etc.) | YES | Roster fetch gives all flags immediately | None — evaluate on roster load |
| R02 | Leave approval check | YES (partial) | Leave status at punch time vs. at batch time may differ | Re-evaluate when leave status changes |
| R03 | 15-minute punch deduplication | YES | Apply dedup window across events in queue | Fix Bug F-04; use 900s window |
| R04 | First IN / Last OUT identification | YES | Each new punch may update the result; last known state | Maintain "current first IN" and "current last OUT" per duty date |
| R05 | Duration calculation | YES | Recalculate whenever IN or OUT changes | Trigger on any punch update |
| R06 | Late arrival differential (settimediffIn) | YES | Recalculate whenever IN changes | Same trigger |
| R07 | Early departure differential (settimediffOut) | YES | Recalculate whenever OUT changes | Same trigger; final OUT not known until day ends |
| R08 | MISSPUNCH detection (single punch) | PARTIALLY | At any given moment, may see only one punch; MISSPUNCH is premature | Mark as provisional; upgrade to PRESENT if second punch arrives |
| R09 | NOPUNCHNOLEAVE detection | PARTIALLY | "No punches" is only final after duty period ends | Defer until duty window closes; use reconciliation to finalize |
| R10 | Night shift D1 partial record | YES | Create pending record on D1 IN | Implement DEFERRED state |
| R11 | Night shift D2 completion | YES | When D2 OUT arrives, complete D1 record | Implement retroactive update lookup |
| R12 | CORRESPONDINGDUTYDAY linkage | YES | Write when D2 OUT arrives and completes D1 | Part of retroactive update |
| R13 | Month boundary night shift | YES | D2 OUT in next month still completes D1 | Same retroactive lookup; no month restriction |
| R14 | PunchingMaster save | YES | Save after final decision | Write PMS after PRESENT decision (not after MISSPUNCH) |
| R15 | Pre-reset of DUTYACTUALVALUES | NO | HIS resets before batch; HDSP cannot wipe its own data | Disable HIS pre-reset or exclude HDSP-written records |
| R16 | Grant total hours update | YES | Update after PRESENT decision | Add updateactualGrantTotalHours equivalent |
| R17 | Leave rejection reprocessing | YES | Event-driven: leave rejection → recalculate | Implement leave change event listener |
| R18 | Split shift second period | YES | Process two independent punch windows | Implement second-period logic |
| R19 | Half-day leave slots | YES | Determine slot from EMPLOYEELEAVELIST.LEAVESLOT | Add leaveSlot to roster query |
| R20 | allowSinglePunchForNightShift | YES | Config-driven; check at decision time | Add to shift rules |
| R21 | COMPENSATORYOFF / DUTYOFF | YES | Shift flags available immediately | Add to decision engine |
| R22 | Night shift boundary (plannextin) | YES | Fetch next day's roster when processing D1 IN | Part of NightShiftWindowService |
| R23 | doublePunch flag | YES | Set when 15-min dedup occurs | Add to event metadata |
| R24 | Retroactive roster change | PARTIALLY | Cannot undo already-processed decisions automatically | Roster change event → trigger recalculation |
| R25 | Retroactive holiday declaration | PARTIALLY | Requires mass recalculation | Holiday event → trigger recalculation for all affected employees |

---

## PART 4 — BATCH VS. REALTIME: COMPLETE SCENARIO COMPARISON

### 4.1 Simple Day Shift Scenarios

| Scenario | HIS Batch Behavior | HDSP Realtime Behavior | Mode | Notes |
|---|---|---|---|---|
| IN → OUT (normal) | 01:00 batch processes; PRESENT | IN event creates MISSPUNCH; OUT event triggers PRESENT recalc | PROVISIONAL → TRIGGERED | Final decision on OUT arrival |
| IN only | 01:00 batch: MISSPUNCH | Immediate MISSPUNCH on IN; never updated | IMMEDIATE | Correct if no OUT ever arrives; wrong if OUT arrives much later |
| OUT only | 01:00 batch: MISSPUNCH | Immediate MISSPUNCH on OUT; correct | IMMEDIATE | |
| No punches | 01:00 batch: NPNL | NPNL written at duty-window-close time (reconciliation) | DEFERRED | Cannot say NPNL at start of day |
| IN → OUT → more punches | 01:00 batch: first IN, last OUT; PRESENT | Each OUT potentially updates last OUT; PRESENT re-evaluated | TRIGGERED | Last OUT wins; recalculate each time |
| Week off | 01:00 batch: WEEOFF from roster flag | Immediate WEEOFF on roster fetch | IMMEDIATE | No punch needed; decide at poll time |
| Public holiday | 01:00 batch: PUBLICHOLLYDAY | Immediate PUBLICHOLLYDAY | IMMEDIATE | |
| Approved leave | 01:00 batch: LEAVE | LEAVE as soon as leave approval is confirmed | IMMEDIATE | Must re-evaluate if leave is cancelled |
| Leave approved after batch | Batch: NPNL; leave approval missed | HDSP: immediate re-evaluation on leave approval event | TRIGGERED | HDSP advantage over HIS |

### 4.2 Night Shift Scenarios

| Scenario | HIS Batch Behavior | HDSP Realtime Behavior | Mode | Notes |
|---|---|---|---|---|
| D1 IN only | D1 batch: partial record | HDSP: DEFERRED (night pending) | DEFERRED | Store pending state in PostgreSQL |
| D2 OUT arrives (before cutoff) | D2 batch: completes D1 | HDSP: retroactive D1 update on D2 OUT arrival | TRIGGERED | Retroactive Oracle update |
| D2 OUT arrives (after cutoff) | D2 batch: assigns OUT to D2 shift | HDSP: same cutoff logic | TRIGGERED | Cut off at nextDayShiftStart |
| D1 IN, no D2 OUT | D2 batch: D1 stays MISSPUNCH | HDSP: reconciliation at 01:30 converts DEFERRED to MISSPUNCH | RECONCILE | Night recon job must handle this |
| Month-boundary night | Two-batch process across month end | Single retroactive update (no month boundary for HDSP) | TRIGGERED | HDSP simpler than HIS here |
| Night shift + D2 leave | D1 PRESENT, D2 LEAVE (separate records) | D1 PRESENT via retroactive; D2 LEAVE via roster | TRIGGERED + IMMEDIATE | leaveToNight logic needed |
| 36h continuous duty (resident) | Two MISSPUNCHes (HIS limitation) | HDSP: if extended window configured, PRESENT | DEFERRED | Configurable nightShiftOutWindowHours |
| Single punch (allowSinglePunch=true) | PRESENT (night shift config) | HDSP must implement this config | IMMEDIATE | Add to shift rules |

### 4.3 Leave & Roster Change Scenarios

| Scenario | HIS Batch Behavior | HDSP Realtime Behavior | Mode | Notes |
|---|---|---|---|---|
| Leave approved before punch | LEAVE (batch checks approved leave) | LEAVE immediately on roster event | IMMEDIATE | |
| Leave approved after punch, before batch | LEAVE (batch picks up approval) | HDSP: re-evaluate on leave approval event | TRIGGERED | HDSP handles this correctly |
| Leave approved after batch (HIS failure) | NPNL (stale); manual correction | HDSP: LEAVE immediately on event | TRIGGERED | HDSP advantage |
| Leave cancelled after punch | PRESENT (batch sees no approval) | HDSP: re-evaluate on cancellation → PRESENT | TRIGGERED | HDSP advantage |
| Roster changed before batch | New roster used | HDSP: re-evaluate on roster change event | TRIGGERED | Must track "last used roster" |
| Roster changed after batch | Stale result; manual correction | HDSP: re-evaluate on roster change event | TRIGGERED | HDSP advantage |
| Holiday declared retroactively | Stale PRESENT; manual batch re-run | HDSP: holiday event → mass recalculate for all employees | TRIGGERED | Mass recalculation needed |
| Leave for night shift day2 | leaveToNight handled | HDSP must implement leaveToNight | TRIGGERED | Currently missing |

### 4.4 Edge Case Scenarios

| Scenario | HIS Batch Behavior | HDSP Realtime Behavior | Mode | Notes |
|---|---|---|---|---|
| Late ATTLOGS sync (arrives after batch) | Missed; NPNL permanent (HIS limitation) | HDSP: real-time poll picks up immediately when it arrives | IMMEDIATE | Major HDSP advantage |
| Backdated punch (7 days old) | HIS would have processed at its batch time | HDSP: within maxBackdatedPunchDays → retroactive update | RETROACTIVE | Configurable lookback |
| Very old punch (>7 days) | Batch already ran; late punch ignored | HDSP: rejects (maxBackdatedPunchDays=7) | REJECTED | Match HIS "batch already ran" behavior |
| Duplicate ATTLOGS rows | 15-min dedup handles | HDSP: SHA-256 handles exact dups; 15-min handles near-dups | DEDUP | Both mechanisms needed |
| Oracle unavailable during poll | N/A (HIS is Oracle-only) | HDSP: poll fails; cursor stays; retry on next poll | RETRY | Built-in via setInterval |
| Redis crash, queue lost | N/A | HDSP: events in queue lost; rely on reconciliation | RECONCILE | Critical gap; events must be persisted |
| HIS batch overwrites HDSP records | HIS batch runs; MERGE overwrites | HDSP REMARKS prefix may protect some | CONFLICT | Fundamental coexistence problem |
| HDSP + HIS both running (dual mode) | HIS batch runs nightly | HIS 00:50 pre-reset wipes HDSP records | CONFLICT | Must disable HIS batch when HDSP active |

---

## PART 5 — BEST ARCHITECTURE FOR HDSP REALTIME

### 5.1 The Three-Phase Processing Model

HDSP should implement three distinct phases that mirror HIS's day-end finalization:

```
PHASE 1 — IMMEDIATE (as punch arrives, <2 seconds)
├── Evaluate shift-type flags (WEEOFF, HOLIDAY, LEAVE, COMPENSATORYOFF, DUTYOFF)
├── Apply 15-min dedup (900-second window)
├── Update current first IN / current last OUT
├── Write PROVISIONAL attendance to DUTYACTUALVALUES:
│     If both IN and OUT known → PRESENT (provisional)
│     If only IN known → MISS_PUNCH (provisional, may upgrade)
│     If no punches yet for date → NPNL (provisional)
└── Mark record as "HDSP_PROVISIONAL" in REMARKS

PHASE 2 — DEFERRED (for night shifts and incomplete records)
├── Night shift D1 IN → create NIGHT_SHIFT_PENDING event
├── Wait for D2 OUT (within configurable window)
├── On D2 OUT arrival → complete D1 → write PRESENT retroactively
├── If D2 OUT never arrives → reconciliation converts to MISSPUNCH
└── Maintain pending state in PostgreSQL attendance_events

PHASE 3 — TRIGGERED (on external state changes)
├── Leave approval → re-evaluate affected duty dates → LEAVE
├── Leave cancellation → re-evaluate → PRESENT or NPNL
├── Roster change → re-evaluate affected duty dates
├── Holiday declaration → mass re-evaluate all employees for date
└── Update Oracle DUTYACTUALVALUES on each re-evaluation
```

### 5.2 Night Shift State Machine

```
States:
  NIGHT_PENDING   → D1 IN punch received; waiting for D2 OUT
  NIGHT_PRESENT   → D2 OUT received; both punches confirmed; PRESENT
  NIGHT_MISSPUNCH → Reconciliation window expired; D2 OUT never arrived
  NIGHT_LEAVE     → D2 is leave day; special handling applies

Transitions:
  D1 IN arrives:                    [NULL] → NIGHT_PENDING
  D2 OUT arrives (before cutoff):   NIGHT_PENDING → NIGHT_PRESENT
  Reconciliation window expires:    NIGHT_PENDING → NIGHT_MISSPUNCH
  D2 leave approved:                NIGHT_PENDING → NIGHT_LEAVE
  D2 OUT arrives after cutoff:      Assign to D2 own shift; D1 stays PENDING

Persistence:
  Store in: attendance_events (PostgreSQL)
  event_type: 'NIGHT_SHIFT_D1' (new type)
  Fields: d1_duty_date, d2_expected_date, cutoff_time, night_shift_open
  When complete: link D1 event to D2 OUT event via sourceId reference
```

### 5.3 Provisional Attendance Decision — State Machine

```
States for each employee-duty-date:
  NO_DATA          → No punch received yet
  PROVISIONAL_IN   → IN punch received; no OUT yet (MISS_PUNCH provisional)
  PROVISIONAL_OUT  → OUT only received (MISS_PUNCH provisional)
  PROVISIONAL_PRESENT → Both IN and OUT received
  DEFERRED_NIGHT   → Night shift pending D2 OUT
  FINALIZED        → Reconciliation has run; decision is final
  OVERRIDE         → Manual HR edit detected (REMARKS without HDSP prefix)

Action per state:
  NO_DATA → write NPNL when duty window passes; FINALIZED
  PROVISIONAL_IN → write MISS_PUNCH; upgrade to PRESENT if OUT arrives
  PROVISIONAL_OUT → write MISS_PUNCH; no upgrade possible (no IN to pair)
  PROVISIONAL_PRESENT → write PRESENT; update if more punches arrive
  DEFERRED_NIGHT → write nothing to Oracle yet (or write partial); upgrade on D2 OUT
  FINALIZED → read-only; only TRIGGERED can change
  OVERRIDE → do not touch; log and skip
```

### 5.4 What HDSP Should Do for Each Action

| Action | Should Process Immediately | Should Defer | Should Recalculate Later | Should Rollback | Should Queue |
|---|---|---|---|---|---|
| Week off roster → punch arrives | YES: WEEOFF immediately | NO | NO | NO | NO |
| Holiday roster → punch arrives | YES: PUBLICHOLLYDAY immediately | NO | NO | NO | NO |
| Leave roster → punch arrives | YES: LEAVE immediately | NO | ONLY if leave cancelled | NO | YES (for leave cancel) |
| First punch IN (day shift) | YES: provisional MISS_PUNCH | NO | YES: upgrade if OUT arrives | NO | YES (pending OUT) |
| First punch OUT (day shift) | YES: provisional MISS_PUNCH | NO | NO (cannot pair) | NO | NO |
| Second punch (OUT after IN) | YES: PRESENT immediately | NO | YES: update if more OUTs | NO | YES (update) |
| Night shift D1 IN | NO: DEFERRED | YES | YES (when D2 OUT arrives) | NO | YES (pending night) |
| Night shift D2 OUT | YES: complete D1 | NO | NO | NO | YES (retroactive update) |
| No punches at end of day | YES: reconciliation NPNL | YES (hold until window closes) | NO | NO | YES (reconciliation) |
| Leave approval event | YES: recalculate immediately | NO | NO | YES (if was PRESENT) | YES (recalculate) |
| Leave cancellation event | YES: recalculate immediately | NO | NO | YES (if was LEAVE) | YES (recalculate) |
| Roster change event | YES: recalculate | NO | NO | YES (if decision changes) | YES (recalculate) |
| Holiday declaration event | YES: mass recalculate | NO | NO | YES (all affected) | YES (mass queue) |
| Retroactive punch (late sync) | YES: within maxBackdated | NO | YES: update existing decision | YES (if decision changes) | YES (retroactive) |

---

## PART 6 — HDSP COMPENSATION EVENT ARCHITECTURE

When HDSP recalculates a previous decision, a COMPENSATION EVENT is needed to:
1. Record what changed
2. Update Oracle DUTYACTUALVALUES
3. Update PostgreSQL attendance_events
4. Notify downstream systems (payroll, HR dashboards)

### 6.1 Compensation Event Types

```typescript
enum CompensationReason {
  // Punch-driven
  OUT_PUNCH_ARRIVED     = 'OUT_PUNCH_ARRIVED',      // MISS_PUNCH → PRESENT
  NIGHT_SHIFT_COMPLETE  = 'NIGHT_SHIFT_COMPLETE',    // NIGHT_PENDING → PRESENT
  PUNCH_DEDUPED         = 'PUNCH_DEDUPED',           // Duplicate removed; decision revised

  // External state change
  LEAVE_APPROVED        = 'LEAVE_APPROVED',           // PRESENT/NPNL → LEAVE
  LEAVE_CANCELLED       = 'LEAVE_CANCELLED',          // LEAVE → PRESENT or NPNL
  LEAVE_REJECTED        = 'LEAVE_REJECTED',           // LEAVE → NPNL
  ROSTER_CHANGED        = 'ROSTER_CHANGED',           // Shift type changed; re-evaluate
  HOLIDAY_DECLARED      = 'HOLIDAY_DECLARED',         // Any → PUBLICHOLLYDAY
  HOLIDAY_REVOKED       = 'HOLIDAY_REVOKED',          // PUBLICHOLLYDAY → any

  // Time-based
  DUTY_WINDOW_CLOSED    = 'DUTY_WINDOW_CLOSED',       // NO_DATA → NPNL (reconciliation)
  NIGHT_WINDOW_EXPIRED  = 'NIGHT_WINDOW_EXPIRED',     // NIGHT_PENDING → MISS_PUNCH
  RETROACTIVE_PUNCH     = 'RETROACTIVE_PUNCH',        // Late sync; update past decision
}
```

### 6.2 Compensation Event Flow

```
Trigger arrives (e.g., leave approved)
│
├── Find all affected attendance_events for employee + date
├── Re-evaluate with new context (same decision engine)
├── IF new decision ≠ current decision:
│   ├── Write compensation event to audit log
│   ├── Update PostgreSQL attendance_events:
│   │   - previousStatus, newStatus, compensationReason, compensatedAt
│   ├── Update Oracle DUTYACTUALVALUES (MERGE with new values)
│   ├── Emit compensation event to downstream consumers
│   └── Update PMS_PUNCHINGMASTER if status changed
└── IF new decision = current decision:
    └── No-op; log as "re-evaluated, no change"
```

---

## PART 7 — HDSP COEXISTENCE WITH HIS BATCH

### 7.1 The Fundamental Problem

When both HIS batch and HDSP realtime are active simultaneously:

| Time | HIS Action | HDSP Action | Conflict |
|---|---|---|---|
| All day | Nothing | Process punches; write DUTYACTUALVALUES | HDSP writes records |
| 23:00 | Lock DUTYPLANVALUES | Try to read roster | HDSP may be blocked by lock |
| 00:50 | Pre-reset DUTYACTUALVALUES | Nothing (between polls) | **HIS DELETES all HDSP records** |
| 01:00 | Process all employees | Continues processing new punches | HIS MERGES over HDSP |
| 02:30 | Post-process | Continues | HIS further MERGES |

**Result: HIS destroys HDSP's work every night.**

### 7.2 Migration Strategies (Ordered by Complexity)

**Strategy 1 — Disable HIS Batch (Full HDSP Takeover)**
```
Disable Quartz jobs: dailyPunchUploadCron, dailyactualsUpdateCron, attendanceandActualsUpdateCron
Keep: dailyPunchUploadLock, dailyPunchUploadUnLockCron (for roster protection)
HDSP: becomes sole owner of DUTYACTUALVALUES
Risk: If HDSP fails, no fallback
Mitigation: Enhanced monitoring; manual fallback procedure
```

**Strategy 2 — HIS Batch as Fallback (HDSP Marks Its Records)**
```
HDSP marks its writes with REMARKS prefix: "HDSP realtime: ..."
HIS batch: check REMARKS; if HDSP prefix exists → skip this record (MERGE uses WHEN NOT MATCHED only)
This prevents HIS from overwriting HDSP records
Risk: HIS pre-reset still clears REMARKS before checking them
Fix: Pre-reset must exclude HDSP-written records:
     UPDATE DUTYACTUALVALUES SET ATTENDANCE = NULL
     WHERE actualDate = :date
     AND REMARKS NOT LIKE 'HDSP realtime:%'   ← modify pre-reset query
```

**Strategy 3 — Parallel Running with Comparison**
```
Both systems run. HDSP and HIS write to separate columns or a shadow table.
Nightly comparison: HIS result vs HDSP result → report discrepancies
Use discrepancies to validate HDSP correctness before full cutover
```

**Recommended Phase Order:**
1. Phase A (now): Strategy 3 — run in parallel, compare discrepancies
2. Phase B (after validation): Strategy 2 — HDSP writes protected; HIS still runs as fallback
3. Phase C (full confidence): Strategy 1 — HIS batch disabled; HDSP sole owner

---

## PART 8 — CRITICAL IMPLEMENTATION PRIORITIES FOR HDSP

### 8.1 Priority P0 — Must Implement Before Any Production Use

| # | Feature | Why P0 | HIS Scenario |
|---|---|---|---|
| P0-01 | Night shift DEFERRED state | Night shift employees get MISS_PUNCH without this | N01-N16 |
| P0-02 | Night shift cutoff (plannextin boundary) | Without boundary, D2 day shift punches contaminate D1 | N09 |
| P0-03 | Retroactive D1 update on D2 OUT | Night shift completion requires retroactive write | N01-N08 |
| P0-04 | 15-minute dedup window (900s) | Current 60s is wrong; HIS uses 15 min | E01-E05 |
| P0-05 | Differential columns in Oracle MERGE | Payroll cannot compute deductions without these | A02, A04, A05 |
| P0-06 | Reconciliation: NPNL at duty window close | Currently no mechanism to finalize NPNL | C01-C10 |
| P0-07 | Reconciliation: MISSPUNCH for expired night pending | Night shifts where OUT never arrives | N04 |
| P0-08 | Disable/modify HIS pre-reset for HDSP records | Pre-reset destroys HDSP data nightly | K07 |

### 8.2 Priority P1 — Required for Correctness

| # | Feature | HIS Scenario |
|---|---|---|
| P1-01 | COMPENSATORYOFF and DUTYOFF shift type handling | H01-H04 |
| P1-02 | Leave approval event listener → recalculate | F05, F17, F24 |
| P1-03 | Leave cancellation event listener → recalculate | F06, F07, F19 |
| P1-04 | allowSinglePunchForNightShift config | N07 |
| P1-05 | Half-day leave (MORNING/AFTERNOON) slot handling | F08, F09 |
| P1-06 | PMS_PUNCHINGMASTER writes | O02-O10 |
| P1-07 | Month-boundary night shift retroactive update | N10, N11, L07, L08 |
| P1-08 | Provisional MISS_PUNCH → upgrade to PRESENT on OUT | K01, K02 |

### 8.3 Priority P2 — Required for Full HIS Parity

| # | Feature | HIS Scenario |
|---|---|---|
| P2-01 | Split shift second period | I01-I15 |
| P2-02 | Roster change event → recalculate | I03, I04, J04 |
| P2-03 | Holiday declaration event → mass recalculate | G03 |
| P2-04 | doublePunch flag propagation | E01-E07 |
| P2-05 | CALLDUTY, NIGHTOFF, PERMISSIONSHIFT shift types | H05-H08 |
| P2-06 | Grant total hours update (updateactualGrantTotalHours) | O02-O10 |
| P2-07 | Retroactive punch processing (late device sync) | N14, K04, K05 |

---

## PART 9 — WHAT HDSP DOES BETTER THAN HIS

| Capability | HIS Limitation | HDSP Advantage |
|---|---|---|
| Late leave approval | Missed if after 01:00 AM | HDSP processes immediately via event |
| Late device sync | Missed if after 01:00 AM | HDSP processes as soon as punch arrives |
| Retroactive leave cancel | Manual re-run | HDSP: event-driven recalculation |
| MISS_PUNCH distinction | HIS: all MISSPUNCH | HDSP: MISSING_IN vs MISSING_OUT |
| LATE_COMING status | HIS: numeric columns only | HDSP: discrete status (better for dashboards) |
| Audit trail | Hibernate Envers (limited) | HDSP: full event log with statuses, timestamps, retry history |
| Partial failure | One bad employee = entire batch may fail | HDSP: each event is independent |
| Manual override protection | None (MERGE overwrites all) | HDSP: REMARKS prefix check |
| Processing latency | ~8 hours average (00:50 reset → 01:00 result) | HDSP: <2 seconds |
| Visibility into processing | Log4j debug (with typo) | HDSP: structured JSON logging |

---

*End of REALTIME_MIGRATION_SCENARIO_ANALYSIS.md*
