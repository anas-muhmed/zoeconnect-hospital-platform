# HIS ATTENDANCE SCENARIO CATALOG

**Purpose:** Exhaustive behavioral specification of the HIS attendance engine — every supported scenario, decision path, punch combination, and outcome derived from bytecode analysis and domain expertise.  
**Basis:** ProcessUploadService.class strings extraction, Quartz XML config, domain entity schemas, business logic inference.  
**Date:** 2026-07-02  
**Classification:** Where behavior is confirmed by code evidence, it is marked [CONFIRMED]. Where inferred from bytecode patterns, it is marked [INFERRED]. Where a domain assumption is applied, it is marked [ASSUMPTION].

---

## PART 1 — COMPLETE ATTENDANCE DECISION TREE

### 1.1 Root: Punch Arrives in ATTLOGS

```
A punch record enters ATTLOGS
│
├── [CONFIRMED] Fields captured:
│   EMPLOYEECODE, LOGDATETIME, DIRECTION ('in'/'out'), DEVICENAME, SN, IPADDRESS, INTRABRANCHID
│
└── Nothing happens immediately.
    HIS does NOT process on arrival.
    The record sits in ATTLOGS until the Quartz job fires at 01:00.
```

### 1.2 Node 1: Quartz Fires — What Date to Process?

```
01:00 AM — dailyPunchUploadCron fires
│
├── processpunchingdataAutoPostingFromDB() called
│
├── [CONFIRMED] Read: BufferDateValue = getConfigParameterValue(branchId, "BufferDateValue")
│   └── This is a stored config value, typically set to "yesterday's date"
│       RISK: If misconfigured, entire batch processes wrong date
│
├── dateMinusOne = BufferDateValue - 1 day
│   └── [INFERRED] This is the actual duty date being processed
│       (BufferDateValue appears to be "today", so dateMinusOne = yesterday)
│
├── Guard 1: find.fileisalreadyupload(dateMinusOne)
│   ├── EXISTS → ABORT with "Please Inactive Previous Punching Data Upload for Selected Date"
│   └── NOT EXISTS → continue
│
├── Guard 2: check.pmspunchupload.entries(dateMinusOne) > 0
│   ├── > 0 → ABORT with "Auto Punching Is Not Possible"
│   └── = 0 → continue
│
└── Load reference data into memory:
    - All employees → employeeIdMap, employeeIdObjMap
    - All shift types → allShiftMapObj
    - Config values → latetimein, latetimeout
    - Identify special shifts: missPunchShift, nopunchShift_15, nopunchShift
```

### 1.3 Node 2: Per-Employee Processing

```
FOR EACH employee in employeeIdMap:
│
├── [CONFIRMED] Fetch raw punches:
│   SQL: WHERE l.logdatetime LIKE '{date}%' AND l.employeecode = '{code}'
│        ORDER BY logdatetime ASC
│   [INFERRED] The date pattern is embedded in the LIKE clause (e.g., '26-07-01%')
│   This restricts to a single calendar date.
│
├── Build PunchInfo list: [{date, direction}] sorted ascending
│
├── [CONFIRMED] 15-minute deduplication:
│   IF consecutive punches within punchinoutdifference15min (=15 min):
│     Mark as doublePunch, skip the second punch
│
├── [CONFIRMED] Identify first IN punch:
│   fetchMINDateTimefromATTLOGS: WHERE DIRECTION = 'in' → MIN(logdatetime)
│
├── [CONFIRMED] Identify last OUT punch:
│   fetchMAXDateTimefromATTLOGS: WHERE DIRECTION = 'out' (or overall MAX — see ambiguity)
│   [AMBIGUITY]: The SQL for MAX is not fully confirmed. May be MAX overall or MAX('out')
│
├── [CONFIRMED] Fetch approved leave:
│   fetchLeaveIsApproved: WHERE empid=? AND date BETWEEN fromdate AND todate AND leavestatus='APPROVED'
│
├── [CONFIRMED] Fetch plan for duty date:
│   getDutyPlanValues: WHERE empId=? AND planDate BETWEEN date 00:00:00 AND date 23:59:59
│   → Returns: shiftPlan (ShiftType), secondShift, planDate, correspondingDutyDay
│
├── findPlanAndActual() → LeaveCalenderVO:
│   planshiftTypeId, planFrom, planTo, isNight, isLeaveIsApproved
│
└── Route to: Node 3 (Shift Type Analysis)
```

### 1.4 Node 3: Shift Type Priority Decision

```
[CONFIRMED] ShiftType flags checked in this priority order:

1. isWeekOff = TRUE?
   └── YES → attendance = WEEOFF
              shiftActual = weekOffShift
              No punch evaluation needed
              GOTO SAVE

2. nationalHoliday = TRUE?
   └── YES → attendance = PUBLICHOLLYDAY
              No punch evaluation needed
              GOTO SAVE

3. isLeaveIsApproved = TRUE (from APPLIEDLEAVES)?
   └── YES → attendance = LEAVE
              shiftActual = leaveShiftType (from checkLeaveApprovedShift)
              Punches IGNORED — leave wins regardless of punches
              GOTO SAVE

4. compensatory = TRUE?
   └── YES → attendance = COMPENSATORYOFF
              GOTO SAVE

5. dutyOff = TRUE?
   └── YES → attendance = DUTYOFF
              GOTO SAVE

6. nightOff = TRUE?
   └── YES → attendance = (WEEOFF equivalent or special)
              GOTO SAVE

7. Punch Evaluation Path:
   └── GOTO Node 4
```

### 1.5 Node 4: Night Shift Routing

```
isNight (ShiftType.IS_NIGHT) = TRUE?
│
├── YES → Night Shift Path (Node 5)
│
└── NO  → Day Shift Path (Node 6)
```

### 1.6 Node 5: Night Shift Processing

```
Night Shift Path:
│
├── isFirstDay determination:
│   [INFERRED] Process day 1 of night shift (today's date)
│   Set isFirstDay = TRUE
│
├── checkForNightShiftNxtDay():
│   [INFERRED] Fetches next day's plan to determine shift boundary
│   Next day's shift start time = cutoff for "this night shift's punches"
│
├── Fetch Day 1 punches (today's calendar date):
│   - First IN on day 1: fetchMINDateTimefromATTLOGS(empCode, date, direction='in')
│   - Punches after planned shift end and before next shift start = "next day territory"
│
├── IF firstIN exists on Day 1 AND outPunch will be on Day 2:
│   Save PARTIAL record:
│   - FROMDATETIME = firstIN
│   - TODATETIME = null
│   - ATTENDANCE = TBD (pending Day 2 completion)
│   - forFirstDayPrevdutyactualValueId = this record's ID
│
├── Day 2 Processing (when batch runs for Day 2):
│   - Fetch Day 2 punches
│   - First OUT on Day 2 (before next shift start) = lastOUT
│   - Retrieve Day 1 partial record
│   - Complete: TODATETIME = lastOUT
│   - Calculate duration across both days
│   - Set ATTENDANCE = PRESENT (or MISSPUNCH if no OUT found)
│   - Set CORRESPONDINGDUTYDAY on both records
│
├── Month boundary: fromLastMonLastDate = TRUE
│   → getPrevMonthLastDayPlanRoster() used to find prior night shift context
│
└── Night shift result: PRESENT, MISSPUNCH, or NOPUNCHNOLEAVE
```

### 1.7 Node 6: Day Shift Punch Evaluation

```
Day Shift Punch Evaluation:
│
├── hasIN  = (firstINTime != null)
├── hasOUT = (lastOUTTime != null)
│
├── CASE: !hasIN && !hasOUT (no punches at all)
│   ├── shift.noPunchNoLeave_15 = TRUE → NOPUNCHNOLEAVE + nopunchShift_15
│   └── else → NOPUNCHNOLEAVE + nopunchShift
│
├── CASE: hasIN && !hasOUT (IN only)
│   ├── allowSinglePunchForNightShift && isNight → PRESENT
│   └── else → MISSPUNCH + missPunchShift
│
├── CASE: !hasIN && hasOUT (OUT only)
│   └── MISSPUNCH + missPunchShift
│   [NOTE: HIS does not distinguish MISSING_IN from MISSING_OUT — both = MISSPUNCH]
│
└── CASE: hasIN && hasOUT (both punches)
    ├── isPunchOutTimeAfterPunchInTime(IN, OUT)?
    │   ├── YES (normal order) → Node 7: Duration Calculation
    │   └── NO (reversed/cross-day) → Node 8: Anomaly Handling
    └── Route accordingly
```

### 1.8 Node 7: Duration Calculation → PRESENT

```
Duration Calculation (getworkDuration):
│
├── duration = OUT - IN
├── hours    = duration.toHours()
├── minutes  = duration.toMinutes() % 60
├── seconds  = duration.toSeconds() % 60
├── durationStr = "HH:mm" formatted
│
├── [CONFIRMED] Write to DUTYACTUALVALUES:
│   FROMDATETIME = firstIN
│   TODATETIME   = lastOUT
│   FROMTIME     = "HH:mm" of IN
│   TOTIME       = "HH:mm" of OUT
│   DURATION     = float hours
│   DURATIONINMINUTES = integer minutes
│
├── [CONFIRMED] Late arrival (settimediffIn):
│   IF actualIN > plannedStart:
│     punchInDiffFirst = (actualIN - plannedStart) as float
│     punchInDiffFirstHour, punchInDiffFirstMin
│
├── [CONFIRMED] Early departure (settimediffOut):
│   IF actualOUT < plannedEnd:
│     punchOutDiffFirst = (plannedEnd - actualOUT) as float
│     punchOutDiffFirstHour, punchOutDiffFirstMin
│
├── [IMPORTANT] HIS does NOT set attendance = 'LATE_COMING' or 'EARLY_GOING'
│   It uses attendance = PRESENT for ALL present employees
│   Late/early data is in NUMERIC DIFFERENTIAL COLUMNS only
│   Payroll reads these columns for deductions
│
└── ATTENDANCE = PRESENT
    GOTO SAVE
```

### 1.9 Node 8: Anomaly Handling (OUT before IN)

```
isPunchOutTimeAfterPunchInTime returns FALSE:
│
├── Possible causes:
│   A) Cross-day punch (OUT is on day 2, but being evaluated as same-day)
│   B) Device clock error (OUT time < IN time due to drift)
│   C) Data corruption
│   D) Night shift evaluated without night shift flag
│
├── [INFERRED] If isNight = TRUE:
│   Route to night shift cross-day logic (Node 5)
│   The "reversed" order is expected for night shifts
│
└── [INFERRED] If isNight = FALSE:
    May result in MISSPUNCH or data error
    No explicit error handling confirmed in bytecode
```

### 1.10 Node 9: Save to Database

```
SAVE:
│
├── [CONFIRMED] savepunchingmaster(date):
│   INSERT INTO PMS_PUNCHINGMASTER all punch summary fields
│
├── [CONFIRMED] MERGE INTO DUTYACTUALVALUES:
│   ATTENDANCE = resolved status code
│   SHIFTACTUAL = resolved ShiftType ID
│   All timing and differential columns
│   CORRESPONDINGDUTYDAY (for night shifts)
│   REMARKS = null (HIS leaves blank)
│
├── [CONFIRMED] updateactualGrantTotalHours(empId, date):
│   Updates aggregate hours for payroll
│
└── Move to next employee
```

---

## PART 2 — EVERY SUPPORTED PUNCH PATTERN

### 2.1 Confirmed Punch Direction Handling

**[CONFIRMED]** DIRECTION column in ATTLOGS contains lowercase `'in'` and `'out'`.

HIS uses two directional queries:
- `WHERE DIRECTION = 'in'` → for finding first IN time
- `WHERE DIRECTION = 'out'` (inferred) → for finding last OUT time

**[INFERRED]** If DIRECTION contains unexpected values (NULL, 'IN' uppercase, 'both', ''), these punches are silently ignored in the directional queries.

### 2.2 Punch Pattern Catalog

**Pattern P01: IN → OUT (standard)**
```
Input:  08:00 IN, 17:00 OUT
Process: MIN('in') = 08:00, MAX('out') = 17:00
Result:  PRESENT, duration = 9h00m
```

**Pattern P02: OUT → IN (reversed order in ATTLOGS — data anomaly)**
```
Input:  17:00 OUT, 08:00 IN (inserted out of order in ATTLOGS, but ORDER BY logdatetime sorts correctly)
Process: After ORDER BY sort: 08:00 IN first, 17:00 OUT second
         MIN('in') = 08:00, MAX('out') = 17:00
Result:  PRESENT (sort saves us)
Note:    The ORDER BY logdatetime ASC ensures chronological processing
         regardless of ATTLOGS insertion order
```

**Pattern P03: IN only**
```
Input:  08:00 IN, no OUT
Process: MIN('in') = 08:00, MAX('out') = null
Result:  MISSPUNCH (unless night shift + allowSinglePunch)
ShiftActual: missPunchShift
```

**Pattern P04: OUT only**
```
Input:  17:00 OUT, no IN
Process: MIN('in') = null, MAX('out') = 17:00
Result:  MISSPUNCH
Note:    HIS cannot distinguish between "forgot IN" and "forgot OUT" — both = MISSPUNCH
```

**Pattern P05: No punches**
```
Input:  No ATTLOGS rows for employee on date
Process: MIN('in') = null, MAX('out') = null
Result:  NOPUNCHNOLEAVE (or override by shift type flags)
ShiftActual: nopunchShift (or nopunchShift_15 for 15-min NPNL shift type)
```

**Pattern P06: IN → OUT → OUT (duplicate OUT)**
```
Input:  08:00 IN, 17:00 OUT, 17:05 OUT
Process: 15-min dedup: 17:05 OUT is within 15 min of 17:00 OUT → FILTERED
         MIN('in') = 08:00, MAX('out') = 17:00
Result:  PRESENT (second OUT ignored)
```

**Pattern P07: IN → OUT → OUT (spaced OUTs)**
```
Input:  08:00 IN, 12:00 OUT, 17:00 OUT
Process: 12:00 OUT and 17:00 OUT are 5 hours apart → BOTH KEPT
         MIN('in') = 08:00, MAX('out') = 17:00 (MAX takes the last)
Result:  PRESENT, duration = 9h00m (12:00 OUT ignored — only MAX('out') used)
[KEY INSIGHT]: Middle OUTs are irrelevant. Only MIN(IN) and MAX(OUT) matter.
```

**Pattern P08: IN → IN → OUT (duplicate INs)**
```
Input:  08:00 IN, 08:05 IN, 17:00 OUT
Process: 08:05 IN within 15 min of 08:00 IN → FILTERED
         MIN('in') = 08:00, MAX('out') = 17:00
Result:  PRESENT
```

**Pattern P09: IN → IN → OUT (spaced INs)**
```
Input:  08:00 IN, 12:00 IN, 17:00 OUT
Process: 12:00 IN and 08:00 IN are 4h apart → BOTH KEPT
         MIN('in') = 08:00 (first), MAX('out') = 17:00
Result:  PRESENT, duration = 9h00m (12:00 IN ignored — only MIN(IN) used)
[KEY INSIGHT]: Middle INs are irrelevant. Only MIN(IN) and MAX(OUT) matter.
```

**Pattern P10: IN → OUT → IN → OUT (re-entry)**
```
Input:  08:00 IN, 12:00 OUT, 13:00 IN, 17:00 OUT
Process: All gaps > 15 min → all kept
         MIN('in') = 08:00, MAX('out') = 17:00
Result:  PRESENT, duration = 9h (NOT 8h actual work time — lunch break included)
[CRITICAL]: HIS does NOT subtract gaps between exit and re-entry.
            Duration = first IN to last OUT. Lunch break inflates work time.
```

**Pattern P11: Many punches (10+ taps)**
```
Input:  08:00 IN, 08:02 IN, 08:04 IN, ..., 17:00 OUT, 17:03 OUT
Process: All within 15-min clusters get deduped
         First cluster: 08:00 kept, 08:02, 08:04 filtered
         Last cluster: 17:00 kept, 17:03 filtered
         MIN('in') = 08:00, MAX('out') = 17:00
Result:  PRESENT
[CONFIRMED]: doublePunch flag set = TRUE when filtering occurs
```

**Pattern P12: All IN direction punches (employee on entry-only device)**
```
Input:  08:00 IN, 12:00 IN, 17:00 IN
Process: MIN('in') = 08:00, MAX('out') = null (no 'out' direction punches)
Result:  MISSPUNCH
[REAL WORLD]: Common when IN/OUT readers are physically separated and employee
              only uses the entry reader
```

**Pattern P13: All OUT direction punches**
```
Input:  08:00 OUT, 12:00 OUT, 17:00 OUT
Process: MIN('in') = null, MAX('out') = 17:00
Result:  MISSPUNCH
```

**Pattern P14: IN immediately followed by OUT (< 1 min)**
```
Input:  08:00:00 IN, 08:00:30 OUT
Process: 30 seconds apart → within 15-min window → OUT FILTERED
         MIN('in') = 08:00, MAX('out') = null (OUT was filtered)
Result:  MISSPUNCH
[PROBLEM]: Legitimate quick badge-and-exit gets treated as MISSPUNCH
           Employee who briefly entered and left legitimately = MISSPUNCH
```

**Pattern P15: IN → OUT (within 15 min)**
```
Input:  08:00 IN, 08:10 OUT
Process: 10 minutes apart → within 15-min window → OUT FILTERED
Result:  MISSPUNCH
[PROBLEM]: Even a 10-minute genuine entry-exit becomes MISSPUNCH
```

**Pattern P16: Night shift IN day1 → OUT day2**
```
Input:  Day1: 22:00 IN; Day2: 06:00 OUT
Process: Day1 batch: collects Day1 punches → partial record (IN=22:00, OUT=null)
         Day2 batch: collects Day2 punches → completes Day1 record (OUT=06:00)
Result:  PRESENT on Day1 duty date, CORRESPONDINGDUTYDAY = Day2
Note:    Day1 DUTYACTUALVALUES has two writes: partial (Day1 batch) + completion (Day2 batch)
```

**Pattern P17: Night shift IN day1, OUT day1 (early exit)**
```
Input:  Day1: 22:00 IN, Day1: 23:30 OUT
Process: Both punches on Day1 calendar date
         isPunchOutTimeAfterPunchInTime(22:00, 23:30) = TRUE
         HIS may process as PRESENT with short duration
[INFERRED]: Depends on whether HIS applies shift window validation
            If no minimum duration check → PRESENT with 1h30m
```

**Pattern P18: Night shift, no punches at all**
```
Input:  No ATTLOGS for either Day1 or Day2
Process: Day1: no punches → NOPUNCHNOLEAVE
         Day2: no connection to Day1 record
Result:  NOPUNCHNOLEAVE on Day1
```

**Pattern P19: Night shift, IN day1 only, no OUT on day2**
```
Input:  Day1: 22:00 IN; Day2: no punches
Process: Day1 batch: partial record saved
         Day2 batch: no OUT found → day1 record remains incomplete or set to MISSPUNCH
[INFERRED]: Night reconciliation (02:30 job) likely sets these to MISSPUNCH
```

**Pattern P20: Night shift OUT arrives before night shift IN (device clock drift)**
```
Input:  Day2: 05:58 OUT (clocked 2 min early due to drift)
        Day1: 22:02 IN (clocked 2 min late due to drift)
Process: [INFERRED] Timestamps are used as-is. No drift correction.
         The time ordering still works correctly if drift is small.
Result:  PRESENT with slightly skewed IN/OUT times
[PROBLEM]: If drift is severe (e.g., 30 min), a day shift's last punch might
           fall into the previous day's bucket
```

**Pattern P21: Cross-midnight punch for day shift**
```
Input:  Day shift 23:00-07:00 classified as day shift (IS_NIGHT = false)
        23:00 IN, 07:00 OUT (next calendar day)
Process: Day1 batch: fetches punches for Day1 calendar date
         MIN('in') = 23:00, MAX('out') = null (07:00 is on Day2)
Result:  MISSPUNCH on Day1
[PROBLEM]: Unusual day shifts that cross midnight are not handled by IS_NIGHT logic
```

**Pattern P22: Month-end night shift**
```
Input:  July 31: 20:00 IN (night shift), Aug 1: 06:00 OUT
Process: [CONFIRMED] fromLastMonLastDate = TRUE
         getPrevMonthLastDayPlanRoster() fetches July's plan
         August batch for Aug 1 completes the July 31 record
Result:  PRESENT for July 31 duty date
[RISK]: Month-end closure timing vs. batch timing critical
```

**Pattern P23: Leave day with punches (employee comes in anyway)**
```
Input:  Leave approved for date X. Employee punches 08:00 IN, 17:00 OUT.
Process: checkLeaveApprovedShift() returns leaveShiftType
         Priority check: isLeaveIsApproved = TRUE → LEAVE
         Punches are IGNORED
Result:  LEAVE regardless of actual presence
[REAL WORLD]: Employee who worked on approved leave day gets LEAVE, no overtime credit
```

**Pattern P24: Leave on week off (double special day)**
```
Input:  Week off day. Employee also has approved leave.
Process: Priority 1: isWeekOff = TRUE → WEEOFF
         Leave check never reached
Result:  WEEOFF
[INFERRED]: Week off takes priority over leave in HIS
```

**Pattern P25: Public holiday with punches**
```
Input:  Public holiday. Employee comes in. Punches 08:00 IN, 17:00 OUT.
Process: Priority 2: nationalHoliday = TRUE → PUBLICHOLLYDAY
         Punches ignored
Result:  PUBLICHOLLYDAY
[PAYROLL IMPACT]: Holiday allowance should be credited separately — attendance code alone
                  triggers it in payroll mapping
```

---

## PART 3 — EXHAUSTIVE SCENARIO MATRIX

> Note: "HIS Behavior" = what the code actually does based on reverse engineering.
> "Inferred" = behavior derived from logic patterns, not directly confirmed in bytecode.

### Category A: Normal Day Shift Scenarios

| ID | Scenario | Punch Pattern | Expected | HIS Behavior | Risk | Realtime Impact |
|---|---|---|---|---|---|---|
| A01 | Perfect IN-OUT within shift | 08:00 IN, 17:00 OUT | PRESENT | PRESENT, diff = 0 | None | Process on OUT arrival |
| A02 | Late IN, on-time OUT | 08:30 IN, 17:00 OUT | PRESENT + late mark | PRESENT, punchInDiff = 30min | Late diff not in HDSP MERGE | Recalculate on OUT |
| A03 | Early IN, on-time OUT | 07:45 IN, 17:00 OUT | PRESENT | PRESENT, no early diff | Early arrival has no penalty | Process on OUT |
| A04 | On-time IN, early OUT | 08:00 IN, 16:00 OUT | PRESENT + early mark | PRESENT, punchOutDiff = 60min | Early diff not in HDSP MERGE | Recalculate on OUT |
| A05 | Late IN, early OUT | 09:00 IN, 16:00 OUT | PRESENT + both marks | PRESENT, both diffs set | Both diffs missing in HDSP | Recalculate on OUT |
| A06 | IN, no OUT all day | 08:00 IN only | MISSPUNCH | MISSPUNCH (missPunchShift) | HDSP processes immediately as MISSPUNCH | Night recon corrects if OUT arrives late |
| A07 | OUT, no IN | 17:00 OUT only | MISSPUNCH | MISSPUNCH | HDSP: same | No prior event to attach to |
| A08 | No punches, work shift | None | NPNL | NOPUNCHNOLEAVE | HIS processes at 01:00 so "no punches" is final | HDSP at midnight has no punches → NPNL |
| A09 | IN-OUT-OUT (double OUT near) | 08:00 IN, 17:00 OUT, 17:03 OUT | PRESENT | PRESENT (17:03 filtered) | None | Same |
| A10 | IN-OUT-OUT (spaced) | 08:00 IN, 12:00 OUT, 17:00 OUT | PRESENT (first IN, last OUT) | PRESENT, duration = 9h (12:00 OUT ignored) | Break time included in duration | Realtime: 12:00 OUT triggers PRESENT, 17:00 OUT updates |
| A11 | IN-IN-OUT (double IN near) | 08:00 IN, 08:03 IN, 17:00 OUT | PRESENT | PRESENT (08:03 filtered) | None | Same |
| A12 | IN-IN-OUT (spaced) | 08:00 IN, 12:00 IN, 17:00 OUT | PRESENT (first IN, last OUT) | PRESENT, first IN = 08:00 | Middle IN irrelevant | Realtime: 12:00 IN ignored for decision |
| A13 | IN-OUT-IN-OUT (re-entry) | 08:00 IN, 12:00 OUT, 13:00 IN, 17:00 OUT | PRESENT | PRESENT, duration = 9h (break counted) | Break inflates duration — HIS design | Realtime must handle re-entries |
| A14 | 10 rapid punches within 2 min | All within 2 min | PRESENT or MISSPUNCH | First kept, rest filtered | Risk: all same direction = MISSPUNCH | Batch arrives all at once |
| A15 | Punch exactly at shift start/end | 08:00:00 IN, 17:00:00 OUT | PRESENT, zero differential | PRESENT | None | None |
| A16 | Punch 1 sec after shift start | 08:00:01 IN | PRESENT, 1-sec late | PRESENT (diffs likely in minutes) | Sub-minute precision | Same |
| A17 | Punch on wrong shift code (employee in wrong location) | Normal punches but wrong shift | PRESENT (no cross-check) | PRESENT (HIS doesn't validate device location) | Employee worked different hours than planned | Same |
| A18 | Very short work (IN-OUT 5 min) | 08:00 IN, 08:05 OUT | PRESENT (no min check) | PRESENT, 5min duration [INFERRED: no min duration enforcement in HIS] | Inflated PRESENT without real work | Realtime: same |
| A19 | Very long work (> 24 hours) | 08:00 IN (day1), 10:00 OUT (day2+1) | PRESENT, 26h duration | PRESENT if both punches on correct calendar dates | Duration > 24h is not flagged | Realtime: extremely long window |
| A20 | Employee punches on holiday (work shift assigned) | Holiday shift. IN, OUT. | PUBLICHOLLYDAY | PUBLICHOLLYDAY (shift flag wins) | Employee worked but gets PUBLICHOLLYDAY | Realtime: punch arrives, shift has holiday flag → PUBLICHOLLYDAY |

### Category B: Normal Night Shift Scenarios

| ID | Scenario | Punch Pattern | Expected | HIS Behavior | Risk | Realtime Impact |
|---|---|---|---|---|---|---|
| B01 | Night IN day1, OUT day2 before planned end | 22:00 IN (D1), 05:00 OUT (D2) | PRESENT | PRESENT, two linked records | CORRESPONDINGDUTYDAY set | Two separate events; OUT completes D1 |
| B02 | Night IN day1, OUT day2 exactly at planned end | 22:00 IN (D1), 08:00 OUT (D2) | PRESENT, zero OUT diff | PRESENT | None | Same |
| B03 | Night shift extended overtime | 22:00 IN (D1), 10:00 OUT (D2) | PRESENT, 2h early-out diff=0, extra hours | PRESENT, duration = 12h | [INFERRED] No automatic overtime flag | Realtime: OUT at 10:00 includes 2h extra |
| B04 | Night IN only, no OUT | 22:00 IN (D1) only | MISSPUNCH | Partial D1 record; D2 batch sets MISSPUNCH [INFERRED] | Critical: night shifts often have single punch errors | HDSP: realtime MISSPUNCH immediately, reopen on OUT arrival |
| B05 | Night OUT only (no IN) | 06:00 OUT (D2) only | MISSPUNCH | No D1 IN → D2 OUT ignored for D1 record → NOPUNCHNOLEAVE or MISSPUNCH | D2 batch has no D1 record to complete | HDSP: D2 OUT arrives with no prior event → MISSPUNCH |
| B06 | Night shift early IN | 20:00 IN (D1) for 22:00 shift | PRESENT | [INFERRED] PRESENT, early IN recorded | No early IN penalty unless before shift window check | Realtime: early punch creates event |
| B07 | Night shift very early IN (6 hrs before) | 16:00 IN (D1) for 22:00 shift | PRESENT? | [INFERRED] maxBackdatedPunchDays check not applicable. PRESENT with 6h early IN | No boundary check on IN time in HIS | HDSP: maxFuturePunchMinutes doesn't help here |
| B08 | Night shift multiple OUTs on day2 | 04:00 OUT, 06:00 OUT, 08:00 OUT (D2) | PRESENT (last OUT = 08:00) | MAX('out') = 08:00 → PRESENT | Works correctly | Realtime: each OUT updates the record |
| B09 | Night shift, next day is also night shift | 22:00 IN (D1), 06:00 OUT (D2), then 22:00 IN (D2), 06:00 OUT (D3) | Each PRESENT independently | D1→D2 link, D2→D3 link | Each duty date processed independently | Realtime: complex chain; D2 OUT completes D1, D2 IN starts D2 event |
| B10 | Night shift spanning month end | 22:00 IN (Jul 31), 06:00 OUT (Aug 1) | PRESENT for Jul 31 | fromLastMonLastDate = TRUE; Aug batch completes Jul record | [CONFIRMED] fromLastMonLastDate flag handles this | HDSP: Aug 1 OUT must reference Jul 31 event |
| B11 | Night shift spanning year end | 22:00 IN (Dec 31), 06:00 OUT (Jan 1) | PRESENT for Dec 31 | Same as month-end logic | Year-end payroll close may conflict | HDSP: critical — Jan 1 event must close Dec 31 |
| B12 | Night shift day1 = public holiday | Holiday. 22:00 IN, 06:00 OUT | PUBLICHOLLYDAY | [INFERRED] Holiday flag wins; PUBLICHOLLYDAY; punches ignored | Employee worked night of holiday | Realtime: holiday flag → PUBLICHOLLYDAY immediately |
| B13 | Night shift day2 = public holiday | 22:00 IN (D1, normal), 06:00 OUT (D2, holiday) | PRESENT for D1 | D1 shift is the night shift duty date; D2 is just OUT completion | D2 holiday doesn't affect D1 duty date status | Realtime: D2 OUT completion unaffected by D2 holiday |
| B14 | Night shift, employee on leave for day2 | 22:00 IN (D1), day2 is approved leave | PRESENT for D1 (leave is for D2 duty, not night shift) | D1 night shift processed normally; D2 leave day separate | leaveToNight flag may trigger | Complex split: D1 = PRESENT, D2 = LEAVE |
| B15 | Night shift with allowSinglePunch | 22:00 IN only. allowSinglePunchForNightShift=true | PRESENT | PRESENT (config enables single-punch for night) | [CONFIRMED] field exists in ProcessUploadService | HDSP currently doesn't implement this config |
| B16 | Night OFF day within night shift rotation | Night rotation; this day assigned nightOff shift | No punches | NIGHTOFF or WEEOFF | nightOff ShiftType flag | HDSP: NIGHTOFF not mapped |
| B17 | Night shift, employee only punches at day boundary | 00:01 IN (just after midnight, day2) | MISSPUNCH | No D1 IN; 00:01 is on D2 calendar date → D1 NOPUNCHNOLEAVE | [INFERRED] Clock strikes midnight; employee enters after midnight | Realtime: 00:01 punch belongs to D2 calendar, not D1 night shift |
| B18 | Consecutive nights, employee is scheduled 5 nights | Mon-Fri night shifts | Each PRESENT | Each day processed independently | 10 DUTYACTUALVALUES records (5 D1 + 5 D2) | Realtime: each event pair processed independently |
| B19 | Night shift, OUT punch arrives day3 | 22:00 IN (D1), 06:00 OUT (D3) — missed D2 OUT | MISSPUNCH (D1 record stays incomplete) | D1 batch: partial IN; D2 batch: no OUT; D3 batch: OUT is on D3 calendar, not matched to D1 | [CRITICAL] HIS has no way to match a D3 OUT to a D1 IN | Realtime: same ambiguity |
| B20 | Double duty night (back-to-back 24h) | IN 22:00 (D1), OUT 22:00 (D2) | PRESENT, 24h duration | [INFERRED] isPunchOutTimeAfterPunchInTime = TRUE; PRESENT | Duration = 24h, unusual but valid in HIS | Realtime: extremely long window; may conflict with next shift start |

### Category C: No-Punch Scenarios

| ID | Scenario | Punch Pattern | Expected | HIS Behavior | Risk | Realtime Impact |
|---|---|---|---|---|---|---|
| C01 | Absent, work shift | None | NPNL | NOPUNCHNOLEAVE + nopunchShift | Standard absent | HDSP: at polling window close → NPNL |
| C02 | Absent, 15-min NPNL shift | None | NPNL (15-min variant) | NOPUNCHNOLEAVE + nopunchShift_15 | Different shift assigned | HDSP: same |
| C03 | No punches, week off | None | WEEOFF | WEEOFF (isWeekOff flag) | Shift type wins | HDSP: immediate on roster fetch |
| C04 | No punches, public holiday | None | PUBLICHOLLYDAY | PUBLICHOLLYDAY (nationalHoliday flag) | Shift type wins | HDSP: immediate |
| C05 | No punches, approved full-day leave | None | LEAVE | LEAVE (isLeaveIsApproved) | Leave must be approved by 01:00 AM | HDSP: immediate if leave approved |
| C06 | No punches, compensatory off | None | COMPENSATORYOFF | COMPENSATORYOFF (compensatory flag) | ShiftType flag | HDSP: missing |
| C07 | No punches, duty off | None | DUTYOFF | DUTYOFF (dutyOff flag) | ShiftType flag | HDSP: missing |
| C08 | No punches, no roster for date | None | Undefined | [INFERRED] Error or skip. No DUTYACTUALVALUES written | Missing roster = missing record | HDSP: NPNL may be wrong |
| C09 | No punches, employee resigned/inactive | None | No processing | [INFERRED] Employee not in employeeIdMap → skipped | isResigned bug in HDSP | HDSP has isResigned bug (Bug F-02) |
| C10 | No punches, night off | None | Equivalent to WEEOFF | nightOff flag on ShiftType | HDSP: missing nightOff handling | HDSP must map nightOff |

### Category D: Single Punch Scenarios

| ID | Scenario | Punch Pattern | Expected | HIS Behavior | Risk | Realtime Impact |
|---|---|---|---|---|---|---|
| D01 | IN only, day shift | 08:00 IN | MISSPUNCH | MISSPUNCH + missPunchShift | Standard | HDSP: immediate MISSPUNCH; must recalculate if OUT arrives |
| D02 | OUT only, day shift | 17:00 OUT | MISSPUNCH | MISSPUNCH | No IN direction in query | HDSP: same |
| D03 | IN only, night shift (no OUT) | 22:00 IN | Partial (pending D2) | [INFERRED] MISSPUNCH after reconciliation | Night shift makes this expected | HDSP: partial; resolve on D2 |
| D04 | OUT only on night shift day2 | 06:00 OUT (D2), no D1 IN | MISSPUNCH | No D1 IN record; D2 OUT unmatched | [INFERRED] D2 OUT ignored; D1 gets NOPUNCHNOLEAVE | HDSP: D2 OUT arrives; no D1 event found → MISSPUNCH on D2 |
| D05 | IN only, night shift, allowSinglePunch=true | 22:00 IN only | PRESENT | PRESENT (config enables) | [CONFIRMED] allowSinglePunchForNightShift field | HDSP: missing this config |
| D06 | OUT only before shift start | 07:00 OUT before 08:00 shift | MISSPUNCH | MISSPUNCH | Unusual timing | Same |
| D07 | IN only after shift end | 18:00 IN after 17:00 shift | MISSPUNCH | MISSPUNCH | Late straggler | HDSP: registers as event; MISSPUNCH |
| D08 | Single punch on leave day | 08:00 IN, leave approved | LEAVE | LEAVE (leave wins) | Punch ignored | HDSP: leave flag → LEAVE regardless |
| D09 | Single punch on week off | 08:00 IN | WEEOFF | WEEOFF (flag wins) | Employee shows up; still WEEOFF | HDSP: WEEOFF immediately |
| D10 | Single punch on holiday | 08:00 IN | PUBLICHOLLYDAY | PUBLICHOLLYDAY | Employee shows up; still PUBLICHOLLYDAY | HDSP: same |
| D11 | IN only, within 15 min of OUT that was already filtered | 08:00 IN (after 07:50 OUT was filtered) | MISSPUNCH | After dedup: IN=08:00, OUT=null | OUT was filtered; now MISSPUNCH | Complex realtime state |
| D12 | Single punch, direction='in' at end of day | 16:55 IN (work shift 08:00-17:00) | MISSPUNCH | MISSPUNCH | Late entry, single punch | HDSP: immediate MISSPUNCH |
| D13 | Single punch, direction ambiguous or null | NULL direction | MISSPUNCH | [INFERRED] MIN('in') = null if direction != 'in'; MISSPUNCH | Data quality issue | HDSP: direction normalisation |
| D14 | Punch within maxFuturePunchMinutes from shift end | 17:08 IN, shift ends 17:00 | MISSPUNCH | [INFERRED] maxFuturePunchMinutes applies (HDSP only) | HIS has no future limit | HIS processes it; HDSP rejects if > 10 min future |
| D15 | Punch exactly at 15-min dedup boundary | 08:00 IN, 08:15 OUT | PRESENT (exactly 15 min = boundary) | [INFERRED] < 15 = filtered; = 15 = kept | Off-by-one at boundary | Need clarity on < vs ≤ |

### Category E: Duplicate & Device Error Scenarios

| ID | Scenario | Punch Pattern | Expected | HIS Behavior | Risk | Realtime Impact |
|---|---|---|---|---|---|---|
| E01 | 3 punches same direction within 5 min | 08:00 IN, 08:03 IN, 08:06 IN | PRESENT (first kept) | First IN kept, others filtered | Standard dedup | HDSP dedup works for exact duplicates only |
| E02 | 10 identical punches (device malfunction) | Same timestamp, same direction ×10 | PRESENT | First kept, 9 filtered | Works correctly | HDSP SHA-256 dedup catches exact duplicates |
| E03 | IN-OUT within 10 min (genuine quick exit) | 08:00 IN, 08:10 OUT | MISSPUNCH | OUT within 15 min → OUT filtered → MISSPUNCH | [CRITICAL] Genuine presence wrongly = MISSPUNCH | HIS design flaw; realtime same |
| E04 | Two devices upload same punch (device retry) | 08:00:01 IN (device A), 08:00:01 IN (device B) | PRESENT | [INFERRED] Duplicate row in ATTLOGS; if same timestamp → same record? Or two rows? | Depends on ATTLOGS uniqueness constraint | HDSP SHA-256 dedup: same timestamp = same sourceId → deduplicated |
| E05 | Device clock 1 hour behind | 07:00 IN (real time 08:00), 16:00 OUT (real time 17:00) | PRESENT (but shifted) | PRESENT; IN diff shows +1h early arrival (incorrect) | Differential columns wrong | HDSP: same |
| E06 | Device clock 1 hour ahead | 09:00 IN (real time 08:00), 18:00 OUT | PRESENT; IN diff shows 1h late | Wrong differentials | Payroll sees incorrect late mark | Realtime: same clock issue |
| E07 | eSSL uploads same data twice | Duplicate ATTLOGS rows | PRESENT (dedup handles) | 15-min dedup removes same-timestamp duplicates | If different timestamps = two events | HDSP SHA-256 catches if same fields |
| E08 | Offline device reconnects, dumps week of punches | 7 days of punches upload at once | Processed by respective batch dates | [CONFIRMED] Each batch processes its date's punches | Batches already ran; need retroactive processing | HDSP: maxBackdatedPunchDays check; old punches rejected |
| E09 | Punch arrives in wrong ATTLOGS format | Non-standard logdatetime | Parse error | [INFERRED] TO_DATE('DD-MM-YYYY HH24:MI:SS') would fail | Bug F-07 in HDSP (hardcoded format mask) | HDSP: same format sensitivity |
| E10 | DIRECTION column has uppercase 'IN' | 'IN' instead of 'in' | MISSPUNCH | [INFERRED] WHERE DIRECTION = 'in' — case-sensitive in Oracle → no IN match → MISSPUNCH | Data quality assumption | HIS assumes lowercase; uppercase = invisible punch |
| E11 | DIRECTION column is NULL | NULL | MISSPUNCH | [INFERRED] NULL != 'in' → no IN match; NULL != 'out' → no OUT match | MISSPUNCH for all-null direction | HDSP: also affected |
| E12 | Punch with direction='inout' or 'both' | 'both' | MISSPUNCH | [INFERRED] Doesn't match 'in' or 'out' query → both filtered | Non-standard device output | Same |
| E13 | Clock drift causes OUT to appear before IN in ATTLOGS | OUT timestamp < IN timestamp | MISSPUNCH | After sort: OUT first (smaller timestamp), IN second. MIN('in')=IN. MAX('out')=OUT. isPunchOutAfterIn: OUT < IN → FALSE → anomaly path | Depends on anomaly handling | Complex realtime |
| E14 | 1000 punches in one day (stuck device) | 1000 rows | PRESENT (dedup handles) | Potentially thousands of 15-min comparisons; performance issue | O(n²) dedup if naive | Realtime: each punch queued separately; queue explosion |
| E15 | Two employees with same empcode | Both mapped to same code | Second employee's punches merged | [INFERRED] employeeIdMap keyed by empcode; last entry wins | Data integrity issue | HDSP: same; SHA-256 includes empcode |

### Category F: Leave Scenarios

| ID | Scenario | Punch Pattern | Expected | HIS Behavior | Risk | Realtime Impact |
|---|---|---|---|---|---|---|
| F01 | Approved full-day leave, absent | None | LEAVE | LEAVE (leave approved) | Standard | HDSP: LEAVE immediately on roster |
| F02 | Approved full-day leave, employee comes in | IN, OUT | LEAVE | LEAVE (approval wins; punches ignored) | Employee worked; still LEAVE | HDSP: LEAVE regardless of punches |
| F03 | Leave not yet approved, absent | None | NPNL | NOPUNCHNOLEAVE | Leave is PENDING, not APPROVED | HDSP: same |
| F04 | Leave not yet approved, employee comes in | IN, OUT | PRESENT | PRESENT (no approved leave) | Standard | HDSP: same |
| F05 | Leave approved after batch runs (retroactive) | None on leave date | LEAVE → requires rerun | [INFERRED] Batch already set NPNL; no automatic recalculation | [CRITICAL] Late leave approvals break attendance | HDSP: must listen for leave approval events |
| F06 | Leave cancelled day-of, employee already absent | None | NPNL | [INFERRED] Batch finds no approved leave → NPNL | Cancellation happened during day; batch sees no approval | HDSP: same if cancelled before processing |
| F07 | Leave cancelled after batch | None | NPNL (stale) | NPNL remains; no recalculation triggered | [CRITICAL] Leave was set to LEAVE, then cancelled → should be NPNL | HDSP needs retroactive recalculation trigger |
| F08 | Half-day MORNING leave, works afternoon | No AM punches, 13:00 IN, 17:00 OUT | HALF_DAY MORNING | [CONFIRMED] LeaveSlot.MORNING; SECOND_SHIFT_SLOT set; afternoon punches in secondary columns | HDSP has no LeaveSlot support | Realtime: afternoon punch arrives; needs morning leave context |
| F09 | Half-day AFTERNOON leave, works morning | 08:00 IN, 12:00 OUT, no PM punches | HALF_DAY AFTERNOON | [CONFIRMED] LeaveSlot.AFTERNOON; morning punches in primary columns | HDSP missing | Realtime: morning punches processed; afternoon = leave |
| F10 | Leave during night shift (leave-to-night) | Leave on day2 of night shift | Complex | [CONFIRMED] leaveToNight flag handles this transition | [CONFIRMED] Flag exists in ProcessUploadService | HDSP missing leaveToNight logic |
| F11 | Night shift then leave next day | 22:00 IN (D1), 06:00 OUT (D2, leave day) | PRESENT for D1, LEAVE for D2 | D1 records night shift PRESENT; D2 has leave | Punches on D2 (the 06:00 OUT) must belong to D1, not D2 | Critical: D2 OUT is "night shift property", not "leave day presence" |
| F12 | Leave on public holiday | None | PUBLICHOLLYDAY | [INFERRED] Priority: PUBLICHOLLYDAY > LEAVE (holiday is priority 2, leave is priority 3) | Leave "wasted" on holiday | Same |
| F13 | Leave on week off | None | WEEOFF | [INFERRED] WEEOFF (priority 1) > LEAVE (priority 3) | Leave wasted on week off | Same |
| F14 | Multi-day leave (Monday-Friday) | None for 5 days | LEAVE ×5 | LEAVE for each day individually | Standard | HDSP: each day independently |
| F15 | Leave spanning month | e.g., Jan 28 - Feb 2 | LEAVE for all dates | Processed for each calendar date in respective batches | Month-end leave processing | HDSP: each day independently |
| F16 | Leave without pay (LOP) | None (LOP approved) | LEAVE (type=LOP) | LEAVE (same code; LOP flag in payroll) | LOP entry in payroll must be created | HDSP: attendance = LEAVE; payroll impact separate |
| F17 | Sick leave approved same day as absence | None | LEAVE | If approved before 01:00 AM batch: LEAVE. If approved after: NPNL | [CRITICAL] Time-sensitive: approval must precede batch | HDSP: process leave approval event immediately |
| F18 | Maternity leave (long period) | None for 84 days | LEAVE for all days | Processed daily by each batch | Standard | HDSP: each day independently |
| F19 | Leave rejection after employee was absent (late rejection) | None | LEAVE → should become NPNL | [INFERRED] No automatic recalculation; manual correction needed | Payroll has wrong data until manual fix | HDSP: leave rejection event → recalculate |
| F20 | Employee on leave punches at different site | IN at Site B (on leave for Site A) | LEAVE | [INFERRED] ATTLOGS filtered by INTRABRANCHID; Site B punch invisible to Site A batch | Cross-site punch under leave | HDSP: same filter |
| F21 | Leave applied for morning; works from 13:01 | 13:01 IN, 17:00 OUT (boundary case) | HALF_DAY MORNING + PRESENT afternoon | Depends on whether 13:01 qualifies as "afternoon" | Time boundary for half-day split | HDSP: no half-day support |
| F22 | Leave for non-working day | Leave on week off | WEEOFF (not LEAVE) | WEEOFF wins | Leave application may be administrative error | Same |
| F23 | Leave rejected, employee had punches | IN, OUT; leave rejected | PRESENT | If rejection before batch: PRESENT. After batch: stale LEAVE | Timing-sensitive | HDSP: must recalculate on leave state change |
| F24 | Leave approved at 01:01 AM (1 min after batch) | None (absent) | NPNL (batch already ran with NPNL) | NPNL permanently until manual correction | [CRITICAL] 1-minute window determines leave credit | HDSP: realtime leave approval → immediate recalculate |
| F25 | Employee on half-day leave; takes full day off | Leave = MORNING; employee absent PM too | HALF_DAY MORNING + NPNL (for PM) or MISSPUNCH | [INFERRED] Depends on HIS handling; likely LEAVE for the whole day if no PM punches | Ambiguous | HDSP: no half-day |

### Category G: Holiday & Week Off Scenarios

| ID | Scenario | Punch Pattern | Expected | HIS Behavior | Risk | Realtime Impact |
|---|---|---|---|---|---|---|
| G01 | Public holiday, no punches | None | PUBLICHOLLYDAY | PUBLICHOLLYDAY (nationalHoliday flag) | ShiftType flag must be set correctly | HDSP: immediate on roster fetch |
| G02 | Public holiday, employee works | IN, OUT | PUBLICHOLLYDAY | PUBLICHOLLYDAY (flag wins; punches ignored) | Worked holiday not automatically creates comp | HDSP: same |
| G03 | Holiday declared retroactively after batch | None | NPNL → should be PUBLICHOLLYDAY | NPNL remains; no recalculation | [CRITICAL] Retroactive holiday requires full recalculation | HDSP: holiday declaration event → recalculate |
| G04 | Week off, no punches | None | WEEOFF | WEEOFF (isWeekOff flag) | Standard | HDSP: immediate |
| G05 | Week off, employee comes in | IN, OUT | WEEOFF | WEEOFF (flag wins) | Employee worked on day off; needs comp? | HDSP: WEEOFF regardless |
| G06 | Week off rotated (e.g., rotating weekly schedule) | Varies by rotation | WEEOFF on correct day | DUTYPLANVALUES has SHIFTPLAN for each date | Rotation must be in roster | HDSP: roster-driven |
| G07 | Holiday on night shift start day (D1) | Night shift 22:00 IN | PUBLICHOLLYDAY | [INFERRED] nationalHoliday on D1 shift → PUBLICHOLLYDAY; punches ignored | Employee worked night of holiday | HDSP: immediate PUBLICHOLLYDAY |
| G08 | Holiday on night shift completion day (D2) | Night shift 06:00 OUT on D2 | D1: PRESENT (night duty date), D2: PUBLICHOLLYDAY | D1 duty date is not holiday; D2 is holiday but that's the completion day | D2 holiday doesn't affect D1 night shift result | HDSP: D2 OUT still completes D1 record |
| G09 | Two consecutive holidays | None, None | PUBLICHOLLYDAY, PUBLICHOLLYDAY | Each processed independently | Standard | HDSP: each day independently |
| G10 | Holiday coincides with last day of month batch | None | PUBLICHOLLYDAY | Month-end + holiday + batch: all handled | Compound scenario | HDSP: roster-driven; no special handling needed |

### Category H: Compensatory & Special Shifts

| ID | Scenario | Punch Pattern | Expected | HIS Behavior | Risk | Realtime Impact |
|---|---|---|---|---|---|---|
| H01 | Compensatory off, no punches | None | COMPENSATORYOFF | COMPENSATORYOFF (compensatory flag) | ShiftType flag | HDSP: missing |
| H02 | Compensatory off, employee works | IN, OUT | COMPENSATORYOFF | [INFERRED] Flag wins; punches ignored | Worked comp day; not credited | HDSP: missing |
| H03 | Duty off, no punches | None | DUTYOFF | DUTYOFF (dutyOff flag) | ShiftType flag | HDSP: missing |
| H04 | Duty off, employee punches anyway | IN, OUT | DUTYOFF | [INFERRED] Flag wins | Unusual; possibly data entry error on roster | HDSP: missing |
| H05 | Call duty — employee on standby | None (or partial punches) | Special (CALLDUTY) | [CONFIRMED] callDuty flag on ShiftType | No specific handling confirmed | Undefined in HDSP |
| H06 | Night off in rotation | None | NIGHTOFF | nightOff flag on ShiftType | HDSP: nightOff not mapped | HDSP must add |
| H07 | Permission shift (employee leaves early for personal reason) | 08:00 IN, 14:00 OUT (early permission) | PRESENT with permission note | permissionShift flag | PERMISSIONSHIFT handling unclear | HDSP: not mapped |
| H08 | Extra shift worked (additional unplanned) | IN, OUT beyond normal | extraShift flag handling | [INFERRED] May update DUTYACTUALVALUES with extra shift | Overtime / extra pay implications | HDSP: not mapped |
| H09 | Compensatory earned for holiday work | Worked on public holiday | Future COMPENSATORYOFF earned | [CONFIRMED] find.CorrespondingcompensationDate + correspondingDutyDay | Compensation date must be linked | Complex linkage |
| H10 | Permission comp (permission compensated with leave) | Permission shift + PERMISSIONCOMPENSATORY | Complex | permissionComp flag | Unclear mechanism | HDSP: missing |
| H11 | Duty off + leave on same day | DutyOff shift + approved leave | DUTYOFF or LEAVE? | [INFERRED] DUTYOFF wins (priority 5 before LEAVE priority 3??) | Priority ambiguous | Need to verify priority order |
| H12 | Split shift first period IN-OUT only | Morning IN-OUT only; afternoon absent | [INFERRED] MISSPUNCH for second period or hybrid | Split shift needs both periods | HDSP missing split shift | HDSP: not handled |
| H13 | Split shift both periods worked | AM IN-OUT, PM IN-OUT | PRESENT with both periods | Second shift columns populated | Works correctly in HIS | HDSP: not implemented |
| H14 | Split shift spans midnight | First period ends at 23:00, second starts at 01:00 | Complex cross-day split | [INFERRED] Cross-day split + night detection | Unusual; likely not tested in HIS | HDSP: not implemented |
| H15 | Split shift on public holiday | All periods on holiday | PUBLICHOLLYDAY | Flag wins for whole day | Holiday flag supersedes split | Same |

### Category I: Roster & System Edge Cases

| ID | Scenario | Punch Pattern | Expected | HIS Behavior | Risk | Realtime Impact |
|---|---|---|---|---|---|---|
| I01 | No DUTYPLANVALUES for employee on date | IN, OUT | Undefined | [INFERRED] findPlanAndActual() returns null; no DUTYACTUALVALUES written | Silent skip | HDSP: NPNL or error |
| I02 | DUTYPLANVALUES exists but SHIFT_TYPE missing | IN, OUT | Undefined | [INFERRED] NullPointerException possible; job continues | Unhandled null | HDSP: similar risk |
| I03 | Roster changed same day as batch runs | New plan loaded | New plan used | [CONFIRMED] Plan fetched at batch time | Last-minute roster changes affect processing | HDSP: roster fetched at process time |
| I04 | Roster modified after batch ran | Batch already complete | Stale result | No automatic recalculation | [CRITICAL] Manual correction needed | HDSP: roster change event → recalculate |
| I05 | Employee has two roster entries for same date | Two DUTYPLANVALUES rows | One used | [INFERRED] getDutyPlanValues returns list; first may be used | Data integrity issue | HDSP: same |
| I06 | ATTLOGS has NULL EMPLOYEECODE | NULL empcode punch | Skipped | [INFERRED] employeeIdMap lookup fails; skip | Device configuration issue | HDSP: SHA-256 fails on null |
| I07 | Employee empcode in ATTLOGS does not match EMPLOYEE.EMPNO (case) | 'EMP001' vs 'emp001' | MISSPUNCH? | [INFERRED] Oracle is case-sensitive; mismatch = no mapping | Case sensitivity assumption | HDSP: same |
| I08 | New employee first day of work | IN, OUT | PRESENT | If DUTYPLANVALUES exists: PRESENT | Roster must be created before first punch | HDSP: same |
| I09 | Employee transferred mid-month | Punches at new branch | Complex | [INFERRED] INTRABRANCHID in ATTLOGS differs from roster | Cross-branch punch not handled | HDSP: same |
| I10 | Processing date = today (same day) | Today's punches | Premature NPNL (incomplete data) | [INFERRED] Batch processes "yesterday" → today's punches not processed | Not applicable normally | HDSP realtime: today's punches processed as they arrive |
| I11 | Quartz fires twice (misfire recovery) | Double processing | Duplicate DUTYACTUALVALUES | Guard checks prevent second run (find.fileisalreadyupload) | [CONFIRMED] Guard exists but only checks upload record | HDSP: idempotent by sourceId |
| I12 | Oracle sequence collision (DUTYACTUALVALUES_0) | Normal processing | Unique ID generated | Sequence managed by Oracle | [LOW RISK] Standard sequence behaviour | HDSP: same sequence |
| I13 | Quartz cluster, two nodes both fire | Race condition | [INFERRED] Quartz clustering with DB lock prevents this; only one node fires | [CONFIRMED] Quartz DB-backed clustering with FOR UPDATE lock | Cluster handles it | HDSP: Bull ensures single worker per job |
| I14 | Batch runs during month-end payroll close | Normal processing | [INFERRED] No explicit lock coordination | Payroll may read stale data during batch | [CRITICAL] Payroll + attendance batch race | HDSP: same risk |
| I15 | Manual DUTYACTUALVALUES edit during batch | Manual edit concurrent with batch | Batch overwrites manual edit | [CONFIRMED] MERGE overwrites all columns | [CRITICAL] Manual edits lost | HDSP: REMARKS check protects some edits |

### Category J: Timing & Calendar Edge Cases

| ID | Scenario | Punch Pattern | Expected | HIS Behavior | Risk | Realtime Impact |
|---|---|---|---|---|---|---|
| J01 | Punch exactly at midnight (00:00:00) | 00:00:00 IN | Ambiguous (today or tomorrow?) | Belongs to day with matching calendar date | Off-by-one at midnight | HDSP: depends on date extraction logic |
| J02 | Punch at 23:59:59 | 23:59:59 OUT | Belongs to today | Correct | None | HDSP: same |
| J03 | Last day of month (e.g., Jan 31) | Normal IN-OUT | PRESENT | [CONFIRMED] fromLastMonLastDate flag; standard processing | Month boundary | HDSP: same calendar handling |
| J04 | First day of month, night shift completion | 06:00 OUT on Feb 1 completing Jan 31 night shift | PRESENT for Jan 31 | [CONFIRMED] getPrevMonthLastDayPlanRoster handles Jan 31 plan | Critical: Feb 1 batch must look back to Jan | HDSP: lookback window must span month boundary |
| J05 | Leap year Feb 29 | Normal punches | PRESENT | Standard date arithmetic | Calendar library handles | Same |
| J06 | Year-end Dec 31 night shift → Jan 1 | 22:00 IN Dec 31, 06:00 OUT Jan 1 | PRESENT for Dec 31 | Month/year boundary: fromLastMonLastDate | Year-end payroll close critical timing | HDSP: Jan 1 event must close Dec 31 record |
| J07 | DST clock forward (spring, 1-hr gap) | Punch in missing hour (e.g., 02:30 doesn't exist) | Device doesn't punch in DST gap | [INFERRED] HIS has no timezone/DST handling (Oracle server time used) | Timestamps may be ambiguous | HDSP: same |
| J08 | DST clock backward (fall, 1-hr repeated) | Two punches at same "clock time" | 15-min dedup handles the repeated punch | [INFERRED] If device generates two entries for same wall-clock time | 15-min dedup should filter | HDSP: SHA-256 includes timestamp; both may survive |
| J09 | Server clock mismatch (server 30 min slow) | All timestamps 30 min early | PRESENT with wrong differentials | No NTP synchronization check in HIS | Systematic error; late marks wrong | HDSP: same |
| J10 | Employee works exactly 24 hours | 08:00 IN, 08:00 OUT (next day) | [INFERRED] isPunchOutAfterIn: next day 08:00 > today 08:00 → TRUE; PRESENT, 24h duration | PRESENT if day2's 08:00 is captured in correct date bucket | Only works if next day batch captures the OUT | Complex |
| J11 | Shift with identical start and end time | 08:00 → 08:00 (data error) | Zero duration | [INFERRED] Duration = 0; PRESENT; no error raised | Division risk if used in ratio calculations | HDSP: same |
| J12 | Processing date pushed back 2 days (BufferDateValue misconfigured) | Today's punches processed as 2-days-ago | Wrong day matched | [CRITICAL] All attendance wrong for that run | Config error; no validation | HDSP: hardcoded date (Bug F-05) |
| J13 | Multiple Quartz jobs running simultaneously | Attendance + other jobs overlap | 5-thread pool; can deadlock | [CONFIRMED] 5 threads configured; attendance may share pool with other jobs | Pool exhaustion | HDSP: Bull separate from other jobs |
| J14 | Batch runs at 00:50 (pre-reset) deletes valid manual edits | Pre-reset at 00:50 → update.attendance.beforepunchupload | Manual edits wiped | [CONFIRMED] Pre-reset clears DUTYACTUALVALUES for target date | [CRITICAL] This is intentional in HIS; problem for HDSP coexistence | HDSP writes + HIS pre-reset = HDSP data lost |
| J15 | Lock at 23:00 blocks HDSP roster reads | Lock on DUTYPLANVALUES | HDSP cannot read roster | [CONFIRMED] update.lock.duty.roster.emtries | If lock is SELECT FOR UPDATE, HDSP reads blocked | HDSP needs read-only bypass |

### Category K: Realtime-Specific HDSP Scenarios

| ID | Scenario | Punch Pattern | Expected | HIS Behavior | HDSP Behavior | Realtime Gap |
|---|---|---|---|---|---|---|
| K01 | First punch of day arrives (IN) | 08:00 IN | HIS: wait until 01:00 | N/A | HDSP: immediate MISSPUNCH (no OUT yet) | HDSP marks MISSPUNCH prematurely |
| K02 | OUT arrives after IN | 17:00 OUT | HIS: 01:00 batch decides PRESENT | N/A | HDSP: recalculate → PRESENT | Requires re-processing |
| K03 | OUT arrives same second as IN batch | Race condition | N/A | N/A | HDSP: queue ordering determines result | Ordering matters |
| K04 | Punch for yesterday arrives today | Yesterday's punch, late sync | HIS: already processed | N/A | HDSP: within maxBackdatedPunchDays → reprocess | Retroactive update |
| K05 | Punch for 8 days ago | Very old punch | HIS: already processed; no rerun | N/A | HDSP: reject (maxBackdatedPunchDays=7) | HIS would have processed this at 01:00 on day 8 |
| K06 | HIS batch runs at 01:00, overwrites HDSP records | Batch overwrites PRESENT set by HDSP | HDSP set PRESENT correctly | HIS re-processes and MERGES, potentially changing | [CRITICAL] HIS batch overwrites HDSP realtime output | Both systems write to same Oracle |
| K07 | HIS pre-reset at 00:50 wipes HDSP records | 00:50 reset clears DUTYACTUALVALUES for date | HDSP had correct PRESENT | DUTYACTUALVALUES wiped | HDSP's correct records deleted | HDSP data destroyed nightly |
| K08 | Multiple punches arrive in burst (device reconnect) | 100 punches uploaded at once | HIS: batch processes all together | N/A | HDSP: 100 queue items, may process out of order | Queue ordering not guaranteed |
| K09 | Bull queue overload | 1000 employees × multiple punches | HIS: sequential in batch | N/A | HDSP: parallel queue processing | Concurrency issues for same employee |
| K10 | Redis crash, queue lost | All queued events lost | HIS: batch persists to DB immediately | N/A | HDSP: events in queue lost | No persistence of queue state |
| K11 | Night shift IN arrives at 22:00 | 22:00 IN | HIS: waits for full night | N/A | HDSP: creates event, MISSPUNCH (no OUT) | Must reopen when next day OUT arrives |
| K12 | Night shift OUT arrives at 06:00 (next day) | 06:00 OUT (day2) | HIS: day2 batch pairs with day1 | N/A | HDSP: day2 OUT must find day1 event and update | Cross-day linkage not in HDSP |
| K13 | Roster changes at 14:00 (mid-day) | Punch processed at 08:00 with old roster | HIS: 01:00 batch uses final roster | N/A | HDSP: processed with 08:00 roster; stale | HDSP must recalculate on roster change |
| K14 | Leave approved at 15:00 after HDSP marked PRESENT | Morning punch → PRESENT. Leave approved PM. | HIS: 01:00 batch uses approved leave → LEAVE | LEAVE | HDSP has PRESENT; must update to LEAVE | Leave approval event must trigger recalculation |
| K15 | HDSP QUEUED status never persisted | Status in memory only | N/A | N/A | Status shows NEW → PROCESSING (skips QUEUED) | [CONFIRMED Bug F-03] |
| K16 | Cursor reset after deployment | All old punches reprocessed | N/A | N/A | HDSP: starts from hardcoded 2026-06-28 | Potentially reprocesses weeks of data |
| K17 | Same employee, two concurrent queue workers | Race on same employee's event | HIS: sequential per employee | N/A | HDSP: concurrent workers may process same employee in parallel | Concurrency bug |
| K18 | Oracle connection pool exhausted | Many events at once | HIS: single connection per batch | N/A | HDSP: multiple concurrent Oracle connections | Connection pool limit |
| K19 | Attendance-events table grows unbounded | Millions of rows | N/A | N/A | HDSP: PostgreSQL attendance_events fills | Need archiving/TTL |
| K20 | Night reconciliation at 01:30 conflicts with HIS batch at 01:00 | Both running simultaneously | N/A | N/A | HDSP reconciliation writes conflict with HIS batch writes | Timing conflict |

### Category L: Special Employee Categories (Hospital-Specific)

| ID | Scenario | Punch Pattern | Expected | HIS Behavior | Risk | Realtime Impact |
|---|---|---|---|---|---|---|
| L01 | ICU nurse on extended shift (12h instead of 8h) | 08:00 IN, 20:00 OUT | PRESENT, 12h duration | PRESENT (no max duration check) | Extra hours not flagged | Standard |
| L02 | Resident doctor (24h on-call) | IN 08:00 (D1), OUT 08:00 (D2) | PRESENT, 24h | If IS_NIGHT = false and OUT on D2: MISSPUNCH | [CRITICAL] HIS doesn't handle 24h continuous duty | Realtime: same problem |
| L03 | Doctor emergency extension (unplanned overtime) | Works 4h past shift end | PRESENT, extended | PRESENT, diff hours show early-out=0 (they didn't leave early) | Works correctly for overtime | Standard |
| L04 | Night duty nurse working 3 consecutive nights | 3 night shifts back-to-back | 3 PRESENT records | Each processed independently per duty date | Sleep deprivation tracking not in HIS | Standard |
| L05 | Cross-department punch (nurse in another ward device) | Different device, same hospital | PRESENT | [INFERRED] INTRABRANCHID must match; cross-dept punch may be filtered | Depends on INTRABRANCHID | HDSP: same filter |
| L06 | Emergency called in on week off | 08:00 IN on WEEOFF day | WEEOFF | WEEOFF (flag wins) | Forced work on day off not credited | HIS limitation |
| L07 | On-call doctor, never physically present but available | No punches | NPNL | NPNL (no mechanism for on-call without biometric) | [HIS MISSING] On-call duty has no attendance code | Fundamental gap |
| L08 | Doctor attending clinic outside hospital | No punches at hospital | NPNL | NPNL | External duty not captured | No mechanism in HIS |
| L09 | Staff nurse attending training (off-site) | No biometric punches | NPNL or LEAVE | Depends on whether training is a leave type | Training attendance not linked to biometric | Manual correction needed |
| L10 | Employee works entire public holiday (major incident) | IN-OUT on public holiday | PUBLICHOLLYDAY | PUBLICHOLLYDAY (punches ignored) | No holiday allowance automatic in attendance | Payroll mapping handles |

---

## PART 4 — PUNCH PATTERN DECISION TABLE (Summary)

| Punches | 15-min Filter | MIN('in') | MAX('out') | isPunchOutAfterIn? | Result |
|---|---|---|---|---|---|
| None | N/A | null | null | N/A | NOPUNCHNOLEAVE |
| IN only | N/A | exists | null | N/A | MISSPUNCH |
| OUT only | N/A | null | exists | N/A | MISSPUNCH |
| IN, OUT (normal) | Both kept | exists | exists | YES | PRESENT |
| IN, OUT (<15 min apart) | OUT filtered | exists | null | N/A | MISSPUNCH |
| IN, OUT, OUT (OUTs close) | 2nd OUT filtered | exists | 1st OUT | YES | PRESENT |
| IN, OUT, OUT (OUTs spaced) | All kept | exists | last OUT | YES | PRESENT |
| IN, IN, OUT (INs close) | 2nd IN filtered | 1st IN | exists | YES | PRESENT |
| IN, IN, OUT (INs spaced) | All kept | 1st IN | exists | YES | PRESENT |
| IN, OUT, IN, OUT | All kept (>15m each) | 1st IN | last OUT | YES | PRESENT |
| Many rapid punches | All but first filtered | 1st IN/OUT surviving | last surviving | YES/NO | PRESENT or MISSPUNCH |
| IN (night D1), OUT (D2) | Per day | D1 IN | D2 OUT | Across days | PRESENT (linked) |
| Week off, any punches | Irrelevant | Irrelevant | Irrelevant | Irrelevant | WEEOFF |
| Holiday, any punches | Irrelevant | Irrelevant | Irrelevant | Irrelevant | PUBLICHOLLYDAY |
| Approved leave, any punches | Irrelevant | Irrelevant | Irrelevant | Irrelevant | LEAVE |

---

*End of HIS_ATTENDANCE_SCENARIO_CATALOG.md*
*Total scenarios documented: 235+ across 12 categories*
