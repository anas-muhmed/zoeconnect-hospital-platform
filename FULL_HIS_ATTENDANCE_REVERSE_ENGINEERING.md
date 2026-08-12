# FULL HIS ATTENDANCE REVERSE ENGINEERING

**Target:** HIS Legacy Application — 8 JARs (payroll-web-5.0, payroll-domain-5.0, duty-roster-all-5.0, his-domain-5.0, his-web-5.0, common-all-5.0, leave-domain-5.0, leave-web-5.0)  
**Method:** Bytecode string extraction via `strings` on .class files + Spring XML config parsing  
**Date:** 2026-07-02  
**Author:** Reverse Engineering via HDSP Integration Project

---

## 1. ARCHITECTURE OVERVIEW

### 1.1 Technology Stack

| Layer | Technology |
|---|---|
| Framework | Spring Framework 3.x + JSF (JavaServer Faces) |
| Scheduler | Quartz Scheduler (clustered, DB-backed via `qrtz_` tables) |
| Persistence | Hibernate ORM + named HQL/SQL queries in `.hbm.xml` files |
| Database | Oracle (single DB, no separate read replica) |
| UI | JSF / Apache MyFaces (faces-config.xml per module) |
| Build | Maven multi-module (5.0 version across all JARs) |

### 1.2 Module Dependency Graph

```
common-all-5.0
  └── Spring beans, Quartz scheduler XML, base services, LeaveCalenderVO
      └── his-domain-5.0
          └── Domain entities: Employee, Shift, Leave, DutyPlan, DutyActual
              ├── duty-roster-all-5.0
              │   ├── DutyActualValues (entity, audited via Hibernate Envers)
              │   ├── DutyPlanValues (entity, audited)
              │   ├── ShiftType (entity, audited)
              │   ├── AttendanceType (enum)
              │   ├── DutyRosterService
              │   └── IFindEmployeePlanAndActuals (service interface)
              ├── leave-domain-5.0
              │   ├── LeaveSlot (enum: FULLDAY, MORNING, AFTERNOON)
              │   ├── LeaveMaster
              │   └── leaveQueryBean.hbm.xml
              └── payroll-domain-5.0
                  ├── PunchingMaster (entity → PMS_PUNCHINGMASTER table)
                  └── payroll.hibernate.queries.hbm.xml
payroll-web-5.0
  └── ProcessUploadService (MAIN attendance engine)
      ├── Implements IProcessUploadService
      ├── Extends BaseApplicationService
      ├── DailyPunchUpload (Quartz job entry point)
      ├── DailyDutyactualsUpdate (pre-processing job)
      └── DailyDutyactualsandAttendanceUpdate (post-processing job)
```

### 1.3 Key Classes

| Class | Package | Role |
|---|---|---|
| `ProcessUploadService` | `com.erp.payroll.process.service.impl` | Main attendance processing engine (~400+ methods/fields) |
| `ProcessUploadService$PunchInfo` | (inner) | Punch record: `{Date date, String direction}` |
| `ProcessUploadService$1DateComparator` | (inner) | Sorts PunchInfo ascending by date |
| `ProcessUploadService$2DateComparator` | (inner) | Secondary date comparator |
| `PunchDataVO` | `com.erp.payroll.process.service.impl` | Per-employee punch map value |
| `AttendanceType` | `com.his.dutyroster.nurserostering.service.impl` | Enum of all attendance codes |
| `DutyActualValues` | `com.his.dutyroster.nurserostering.domain` | DUTYACTUALVALUES entity |
| `DutyPlanValues` | `com.his.dutyroster.nurserostering.domain` | DUTYPLANVALUES entity |
| `ShiftType` | `com.his.dutyroster.nurserostering.domain` | SHIFT_TYPE entity |
| `PunchingMaster` | `com.erp.payroll.core` | PMS_PUNCHINGMASTER entity |
| `LeaveCalenderVO` | `com.erp.core.domain` | VO bridging plan + actual + leave for a date |
| `LeaveSlot` | `com.his.leave.domain` | Enum: FULLDAY, MORNING, AFTERNOON |

---

## 2. QUARTZ SCHEDULER TIMELINE

The Quartz scheduler is configured in `common-all-5.0/spring/applicationContextScheduler.xml`. It runs clustered with 5 threads, misfire threshold 60 seconds. All attendance jobs use `CustomQuartzJob` which delegates to a named Spring bean.

### 2.1 Attendance Cron Schedule (nightly sequence)

```
23:00:00  → dailyPunchUploadLock
              Bean: dailyPunchUploadLock
              Query: update.lock.duty.roster.emtries
              Purpose: Locks DUTYPLANVALUES to prevent manual edits during batch

00:05:00  → employeeRelievingUpdateCron
              Bean: employeeRelievingUpdate
              Purpose: Syncs employee relieving status from external API to HIS DB

00:50:00  → dailyactualsUpdateCron
              Bean: dailyDutyactualsUpdate
              Method: updateDutyactualsbeforeAutoPunchuploadFromDB()
              Queries: update.dutuactuals.beforepunchupload
                       update.attendance.beforepunchupload
              Purpose: PRE-RESET - clears/resets DUTYACTUALVALUES for the day
                       to be processed so punch upload can write fresh values

01:00:00  → dailyPunchUploadCron   ← MAIN ATTENDANCE BATCH
              Bean: dailyPunchUpload
              Method: processpunchingdataAutoPostingFromDB()
              Purpose: Full ATTLOGS → DUTYACTUALVALUES processing for all employees

02:30:00  → attendanceandActualsUpdateCron
              Bean: dailyDutyactualsandAttendanceUpdate
              Method: updateDutyactualsandAttendancebeforeAutoPunchupload()
              Purpose: POST-PROCESSING - final attendance status reconciliation

03:00:00  → dailyPunchUploadUnLockCron
              Bean: dailyPunchUploadUnLock
              Purpose: Releases lock on DUTYPLANVALUES
```

**Total window: 23:00 → 03:00 (4-hour nightly processing window)**

### 2.2 Job Execution Flow

```
23:00  LOCK    ──►  DUTYPLANVALUES locked (no manual edits)
  ↓
00:50  PRE     ──►  Reset previous actuals for target date
  ↓
01:00  MAIN    ──►  Process all employee punches from ATTLOGS
  ↓
02:30  POST    ──►  Final reconciliation pass
  ↓
03:00  UNLOCK  ──►  DUTYPLANVALUES unlocked
```

---

## 3. MAIN PROCESSING PIPELINE — `processuploadpunchFromDB`

### 3.1 Entry Point

Quartz fires `DailyPunchUpload` → calls `processpunchingdataAutoPostingFromDB()`:

```
FUNCTION processpunchingdataAutoPostingFromDB():
  bufferDate = getConfigParameterValue(branchId, "BufferDateValue")
                // BufferDateValue config param = yesterday's date
  dateMinusOne = bufferDate - 1 day  // the date to actually process

  // Guard: reject if a punching upload is already active for this date
  IF find.fileisalreadyupload(dateMinusOne) EXISTS:
    RAISE "Please Inactive Previous Punching Data Upload for Selected Date"

  // Guard: check PUNCHINGMASTER for existing entries
  IF check.pmspunchupload.entries(dateMinusOne) > 0:
    RAISE "Auto Punching Is Not Possible"

  // Load all employees into memory maps
  getEmployeeObject(branchId, siteId)
    → fills: employeeIdMap{empCode→empId}
    → fills: employeeIdObjMap{empCode→[empId, empName, ...]}

  // Load all shift types into memory
  allshift = findAll(ShiftType)
    → fills: allShiftMapObj{shiftId→ShiftType}
    → identifies: missPunchShift, nopunchShift_15, nopunchShift
    → reads: latetimein, latetimeout config params (from BranchConfigParameter)

  // Create PunchingRecords wrapper for this batch run
  punchingRecords = new PunchingRecords()
  punchingRecords.id = dateMinusOne
  punchingRecords.save()

  // Process each employee
  FOR EACH empCode IN employeeIdMap:
    processuploadpunchFromDB(punchingRecords, dateMinusOne)

  // Mark upload complete
  update.punchingmaster.all(punchingRecords.id)
  update.punchingupload.all(punchingRecords.id)
  update.shift.actualvalue.all(punchingRecords.id)
```

### 3.2 Per-Employee Processing — `processuploadpunchFromDB(punchingRecords, date)`

```
FUNCTION processuploadpunchFromDB(punchingRecords, crDate):

  // === STEP 1: FETCH RAW PUNCHES ===
  rawPunchData = SQL:
    "SELECT ... FROM attlogs l
     WHERE l.logdatetime LIKE '%'
     AND l.employeecode = '{empCode}'
     ORDER BY logdatetime ASC"

  // === STEP 2: BUILD SORTED PUNCH LIST ===
  punchInfoList = []
  FOR EACH row IN rawPunchData:
    punchInfoList.ADD(new PunchInfo(date=row.logdatetime, direction=row.direction))

  SORT punchInfoList BY DateComparator (ascending by date)

  // === STEP 3: 15-MINUTE DEDUPLICATION ===
  filteredList = []
  FOR i = 0 TO punchInfoList.size()-1:
    currentPunch = punchInfoList[i]
    IF i > 0:
      previousPunch = punchInfoList[i-1]
      timeDifferenceMinutes = (currentPunch.date - previousPunch.date) / 60000
      IF timeDifferenceMinutes < punchinoutdifference15min (15):
        doublePunch = TRUE
        CONTINUE  // skip this punch — too close to previous
    filteredList.ADD(currentPunch)

  // === STEP 4: IDENTIFY FIRST IN / LAST OUT ===
  firstINTime = fetchMINDateTimefromATTLOGS(empCode, crDate)
    // SQL: WHERE DIRECTION = 'in' — takes MIN(logdatetime)
  lastOUTTime = fetchMAXDateTimefromATTLOGS(empCode, crDate)
    // SQL: WHERE DIRECTION = 'out' — takes MAX(logdatetime) (implied by MAX)
    // Note: no explicit DIRECTION='out' filter on MAX — uses last punch overall

  // === STEP 5: FETCH PLAN (ROSTER) FOR DATE ===
  leaveCalenderVO = findPlanAndActual(crDate, crDate, empId, siteId)
    // IFindEmployeePlanAndActuals.findPlanAndActual()
    // Returns LeaveCalenderVO with:
    //   planshiftTypeId, planFrom, planTo, planDuration, night (isNightShift)
    //   actualValuId, actualshiftTypeId, actualFrom, actualTo
    //   isLeaveIsApproved

  // === STEP 6: CHECK APPROVED LEAVE ===
  leaveShiftType = checkLeaveApprovedShift(crDate, empId)
    // SQL: WHERE empid=? AND to_date(?, 'YYYY/MM/DD')
    //      BETWEEN TRUNC(fromdate) AND TRUNC(todate)
    //      AND leavestatus='APPROVED'
    // Returns the leave ShiftType for this date (may be null)

  // === STEP 7: NIGHT SHIFT DAY BOUNDARY HANDLING ===
  IF leaveCalenderVO.isNight:
    checkForNightShiftNxtDay()   // fetch next day's plan
    isFirstDay = TRUE            // track we're processing day-1 of night shift

    // Link to previous day's DutyActualValue for night shift continuation
    forFirstDayPrevdutyactualValueId = getDutyActualValues(empId, prevDate)

    // Handle month boundaries
    IF crDate = lastDayOfMonth:
      fromLastMonLastDate = TRUE
      prevPlanList = getPrevMonthLastDayPlanRoster(empId, prevMonthLastDay)

  // === STEP 8: SHIFT TIME VALIDATION ===
  CheckforNormalShiftTime(leaveCalenderVO, punchInTime)
    // Returns TRUE if punch falls within expected shift window
    // Uses planFrom/planTo from LeaveCalenderVO

  // === STEP 9: SAVE TO PUNCHINGMASTER ===
  savepunchingmaster(crDate)
    // Creates PMS_PUNCHINGMASTER record:
    //   PUNCH_IN_DATETIME = firstINTime
    //   PUNCH_OUT_DATETIME = lastOUTTime
    //   INTIME = HH:mm formatted string
    //   OUTTIME = HH:mm formatted string
    //   PUNCHDATE = crDate
    //   EMP_ID, SITE_ID, DURATION, HOURS, MINUTES, SECONDS
    //   PLANVALUE = DutyPlanValues.id
    //   DURATIONINMINUTES = total work minutes
    //   PUNCH_SOURCE = 'AUTO'
    //   ISCHECKED = FALSE

  // === STEP 10: DETERMINE ATTENDANCE & UPDATE ACTUALS ===
  updateAtual(currentPlan, prevPlan, punchingMaster, shiftType,
              prevShiftType, isFirstDay, previousDayLeaveCalAlreadyPresent)
```

---

## 4. ATTENDANCE DECISION ENGINE — `updateAtual`

### 4.1 Status Priority Order (highest to lowest)

```
FUNCTION updateAtual(...):

  // PRIORITY 1: Week Off
  IF shift.isWeekOff = TRUE:
    attendance = WEEOFF
    GOTO SAVE

  // PRIORITY 2: Public Holiday
  IF shift.nationalHoliday = TRUE:
    attendance = PUBLICHOLLYDAY
    GOTO SAVE

  // PRIORITY 3: Approved Leave
  IF leaveCalenderVO.isLeaveIsApproved = TRUE:
    attendance = LEAVE
    // uses leaveShiftType to identify leave type
    GOTO SAVE

  // PRIORITY 4: Compensatory Off
  IF shift.compensatory = TRUE:
    attendance = COMPENSATORYOFF
    GOTO SAVE

  // PRIORITY 5: Duty Off
  IF shift.dutyOff = TRUE:
    attendance = DUTYOFF
    GOTO SAVE

  // PRIORITY 6: Night Off
  IF shift.nightOff = TRUE:
    // special handling — may link to previous day actual
    attendance = (depends on cross-day state)
    GOTO SAVE

  // === PUNCH EVALUATION ===
  hasIN  = (firstINTime != null)
  hasOUT = (lastOUTTime != null)

  // PRIORITY 7: No punches at all
  IF NOT hasIN AND NOT hasOUT:
    IF shift.noPunchNoLeave_15 = TRUE:
      attendance = NOPUNCHNOLEAVE   // 15-min variant shift
      actualShift = nopunchShift_15
    ELSE:
      attendance = NOPUNCHNOLEAVE
      actualShift = nopunchShift
    GOTO SAVE

  // PRIORITY 8: Single punch (miss punch)
  IF (hasIN AND NOT hasOUT) OR (NOT hasIN AND hasOUT):
    IF allowSinglePunchForNightShift AND shift.isNight:
      attendance = PRESENT          // night shifts allow single punch
    ELSE:
      attendance = MISSPUNCH
      actualShift = missPunchShift
    GOTO SAVE

  // PRIORITY 9: Both punches present → PRESENT
  IF hasIN AND hasOUT:
    IF isPunchOutTimeAfterPunchInTime(firstINTime, lastOUTTime):
      workDuration = getworkDuration(firstINTime, lastOUTTime)
      // workDuration = [hours, minutes, seconds, formattedString]

      dutyActual.FROMDATETIME = firstINTime
      dutyActual.TODATETIME   = lastOUTTime
      dutyActual.FROMTIME     = HH:mm(firstINTime)
      dutyActual.TOTIME       = HH:mm(lastOUTTime)
      dutyActual.DURATION     = workDuration.hours (float)
      dutyActual.DURATIONINMINUTES = workDuration.totalMinutes

      // Calculate late in / early out differentials
      settimediffIn(dutyActual, plannedStartTime)
      settimediffOut(dutyActual, plannedEndTime)

      attendance = PRESENT
    ELSE:
      // OUT before IN — cross-day night shift or data error
      // Handle via night shift cross-day logic (see Section 5)
      attendance = PRESENT (if valid night shift) or MISSPUNCH

  SAVE:
  dutyActual.ATTENDANCE = attendance.code
  dutyActual.SHIFTACTUAL = resolvedShiftType.id
  dutyActual.ACTUALDATE = crDate
  dutyActual.EMPID = empId
  dutyActual.REMARKS = null  // HIS sets no REMARKS — left blank or unchanged
  persist(dutyActual)

  // Also update grant total hours for payroll
  updateactualGrantTotalHours(empId, crDate)
```

### 4.2 `getworkDuration` Algorithm

```
FUNCTION getworkDuration(punchInDateTime, punchOutDateTime):
  duration = Duration.between(punchInDateTime, punchOutDateTime)

  diffInDays    = duration.toDays()
  diffHours     = duration.toHours() % 24
  diffMinutes   = duration.toMinutes() % 60
  diffSeconds   = duration.toSeconds() % 60

  formattedHours   = String.format("%02d", diffHours)
  formattedMinutes = String.format("%02d", diffMinutes)
  diffStr          = formattedHours + ":" + formattedMinutes

  negativeflag = (punchOutDateTime < punchInDateTime)

  RETURN [diffHours, diffMinutes, diffSeconds, diffStr]
  // diffStr = "HH:mm" formatted duration string
```

### 4.3 `settimediffIn` — Late Arrival Calculation

```
FUNCTION settimediffIn(dutyActualValues, plannedStartTimeStr):
  // plannedStartTimeStr = shift.START_TIMING (e.g. "08:00")
  plantimeObj = parse(plannedStartTimeStr, "HH:mm")
  actualIN    = dutyActualValues.FROMDATETIME

  IF actualIN > plantimeObj:  // arrived AFTER planned start
    diff    = actualIN - plantimeObj
    inhour  = diff.hours
    inmin   = diff.minutes
    timediff = inhour + ":" + inmin  // e.g. "00:30"
  ELSE:
    inhour = 0
    inmin  = 0

  dutyActualValues.PUNCH_IN_DIFF_FIRSTSHIFT    = diff as float
  dutyActualValues.PUNCH_IN_DIFF_FIRST_HOUR    = inhour
  dutyActualValues.PUNCH_IN_DIFF_FIRST_MIN     = inmin
  RETURN dutyActualValues
```

### 4.4 `settimediffOut` — Early Departure Calculation

```
FUNCTION settimediffOut(dutyActualValues, plannedEndTimeStr):
  // plannedEndTimeStr = shift.END_TIMING (e.g. "17:00")
  plantimeObj = parse(plannedEndTimeStr, "HH:mm")
  actualOUT   = dutyActualValues.TODATETIME

  IF actualOUT < plantimeObj:  // left BEFORE planned end
    diff    = plantimeObj - actualOUT
    outhour = diff.hours
    outmin  = diff.minutes
  ELSE:
    outhour = 0
    outmin  = 0

  dutyActualValues.PUNCH_OUT_DIFF_FIRSTSHIFT   = diff as float
  dutyActualValues.PUNCH_OUT_DIFF_FIRST_Hour   = outhour
  dutyActualValues.PUNCH_OUT_DIFF_FIRST_MIN    = outmin
  RETURN dutyActualValues
```

### 4.5 `findActualPunchigDifference`

```
FUNCTION findActualPunchigDifference(empCode, planDate):
  // Fetches plan time and computes difference between planned and actual punch
  // Used for generating late/early difference strings
  plantime = getDutyPlanValues(empId, planDate).shiftPlan.startTime
  timediff = actualPunchTime - plantime
  RETURN formatted difference string (e.g. "+00:30" or "-00:15")
```

---

## 5. NIGHT SHIFT CROSS-DAY LOGIC

Night shifts span two calendar dates. HIS handles this with several flags:

### 5.1 Key Fields

| Field | Type | Purpose |
|---|---|---|
| `isFirstDay` | boolean | TRUE when processing the start-date of a night shift |
| `correspondingDutyDay` | Date | Links two DUTYACTUALVALUES records for the same night shift |
| `leaveToNight` | boolean | Employee transitions from leave to night shift |
| `dayToNight` | boolean | Employee transitions from day to night shift |
| `fromLastMonLastDate` | boolean | Night shift spans a month boundary |
| `forFirstDayPrevdutyactualValueId` | Long | Previous day's DUTYACTUALVALUEID for night shift continuation |
| `previousDayLeaveCalAlreadyPresent` | boolean | Previous day has a leave record that's already been written |

### 5.2 Night Shift Processing Pseudocode

```
IF leaveCalenderVO.isNight = TRUE:

  // Day 1 of night shift (e.g. shift starts 22:00 today)
  IF isFirstDay:
    // Save a partial DUTYACTUALVALUES for today
    // FROMDATETIME = punch IN time today
    // TODATETIME = null (shift continues tomorrow)
    // CORRESPONDINGDUTYDAY = tomorrow's date
    dutyActual_day1.save()
    forFirstDayPrevdutyactualValueId = dutyActual_day1.id

  // Day 2 of night shift (e.g. shift ends 06:00 tomorrow)
  ELSE:
    // Retrieve day 1 record and complete it
    prevDutyActuals = findById(forFirstDayPrevdutyactualValueId)

    // Combined punch window: Day1 IN → Day2 OUT
    totalDuration = getworkDuration(prevDutyActuals.FROMDATETIME, lastOUTTime)

    prevDutyActuals.TODATETIME = lastOUTTime
    prevDutyActuals.DURATION   = totalDuration.hours
    prevDutyActuals.DURATIONINMINUTES = totalDuration.minutes
    prevDutyActuals.ATTENDANCE = PRESENT
    prevDutyActuals.CORRESPONDINGDUTYDAY = today's date
    update(prevDutyActuals)

    // Also write today's record (Day 2) for calendar display
    dutyActual_day2.SHIFTACTUAL = prevDayShiftType
    dutyActual_day2.ATTENDANCE  = PRESENT
    dutyActual_day2.save()

// SPECIAL CASE: leaveToNight
IF leaveToNight:
  // Employee was on leave, now starting night shift
  // Previous day's leave record is preserved (previousDayLeaveCalAlreadyPresent = TRUE)
  // Current day processes as normal night shift day 1

// SPECIAL CASE: dayToNight
IF dayToNight:
  // Swap from day shift to night shift mid-cycle
  // CORRESPONDINGDUTYDAY links the transition dates

// MONTH BOUNDARY: fromLastMonLastDate
IF fromLastMonLastDate:
  prevPlanList = getPrevMonthLastDayPlanRoster(empId, lastDayPrevMonth)
  // Use last month's shift to determine night shift start details
```

---

## 6. SPLIT SHIFT (SECOND SHIFT) SUPPORT

`SHIFT_TYPE` has `ISSPLITSHIFT` flag and second timing columns. When a split shift is active, DUTYACTUALVALUES stores a parallel set of second-shift columns:

| First Shift Column | Second Shift Column |
|---|---|
| SHIFTACTUAL | SECONDSHIFT |
| FROMDATETIME | SECONDFROM_DATETIME |
| TODATETIME | SECONDTO_DATETIME |
| FROMTIME | SECONDFROMTIME |
| TOTIME | SECONDTOTIME |
| DURATION | SECONDDURATION |
| PUNCH_IN_DIFF_FIRSTSHIFT | PUNCH_IN_DIFF_SECONDSHIFT |
| PUNCH_OUT_DIFF_FIRSTSHIFT | PUNCH_OUT_DIFF_SECONDSHIFT |
| — | SECOND_SHIFT_SLOT (LeaveSlot enum: FULLDAY/MORNING/AFTERNOON) |
| — | SECONDSHIFTREMARK |

---

## 7. LEAVE HANDLING

### 7.1 Leave Types and Slots

**`LeaveSlot` enum:** `FULLDAY`, `MORNING`, `AFTERNOON`

**Known named leave types:** `SICK LEAVE` (hardcoded string literal found in ProcessUploadService)

### 7.2 Leave Resolution Flow

```
FUNCTION checkLeaveApprovedShift(date, empId):
  // Query APPLIEDLEAVES
  SQL: WHERE empid = ?
       AND to_date(?, 'YYYY/MM/DD')
           BETWEEN TRUNC(fromdate) AND TRUNC(todate)
       AND leavestatus = 'APPROVED'

  IF found:
    leaveShiftType = find ShiftType WHERE isLeave = TRUE
                     AND leaveMaster.id = appliedLeave.leaveMasterId
    RETURN leaveShiftType
  ELSE:
    // Also check EMPLOYEELEAVELIST (daily leave records)
    fetchLeaveIsApproved(empId, date)
    RETURN null if not found

FUNCTION checkActualShiftType(leaveCalenderVO, isLeaveApproved):
  // Resolves which ShiftType to assign to DUTYACTUALVALUES
  // Takes into account: leave approval, split shifts, night shifts
```

### 7.3 Half-Day Leave

Half-day is stored via `SECOND_SHIFT_SLOT` in DUTYACTUALVALUES:
- `MORNING` — leave for morning half
- `AFTERNOON` — leave for afternoon half
- The remaining half is treated as PRESENT with proportional duration

---

## 8. DATABASE TABLES — COMPLETE COLUMN INVENTORY

### 8.1 ATTLOGS (Source — read-only in HIS batch)

| Column | Mapped Name | Notes |
|---|---|---|
| EMPLOYEECODE | employeeCode | Varchar, matches EMPLOYEE.EMPNO |
| LOGDATETIME | logDateTime | Timestamp, used in ORDER BY ASC |
| DIRECTION | direction | Lowercase 'in' / 'out' |
| DEVICENAME | deviceName | Device identifier |
| IPADDRESS | ipAddress | Device IP |
| SN | serialNumber | Device serial |
| INTRABRANCHID | intraBranchId | Branch/site filter |
| LOGDATEBKP | createdAt | Backup timestamp |

### 8.2 DUTYPLANVALUES (Read in HIS batch)

| Column | Java Field | Notes |
|---|---|---|
| DUTYPLANVALUEID | dutyPlanValueId | PK, sequence DUTYPLANVALUES_0 |
| SHIFTPLAN | shiftPlan | FK → SHIFT_TYPE.ID |
| SECONDSHIFT | secondShift | FK → SHIFT_TYPE.ID (split shift) |
| DAYOFMONTH | dayOfMonth | Integer 1–31 |
| PLANDATE | planDate | Date |
| EMPID | empId | FK → EMPLOYEE |
| REMARKS | remarks | String |
| SECONDSHIFTREMARK | secondShiftRemark | String |
| CORRESPONDINGDUTYDAY | correspondingDutyDay | Cross-day night shift date |
| isActive | isActive | Boolean |

### 8.3 DUTYACTUALVALUES (Written by HIS batch)

| Column | Java Field | Notes |
|---|---|---|
| DUTYACTUALVALUEID | dutyActualValueId | PK, sequence DUTYACTUALVALUES_0 |
| SHIFTACTUAL | shiftActual | FK → SHIFT_TYPE (resolved actual shift) |
| SECONDSHIFT | secondShift | FK → SHIFT_TYPE (split shift actual) |
| DAYOFMONTH | dayOfMonth | Integer 1–31 |
| ACTUALDATE | actualDate | The duty date processed |
| EMPID | empId | FK → EMPLOYEE |
| FROMDATETIME | fromDateTime | Actual IN punch datetime |
| TODATETIME | toDateTime | Actual OUT punch datetime |
| FROMTIME | fromTime | "HH:mm" string of IN time |
| TOTIME | toTime | "HH:mm" string of OUT time |
| DURATION | duration | Float hours (e.g. 8.5) |
| DURATIONINMINUTES | durationInMinutes | Integer total minutes |
| PUNCH_IN_DIFF_FIRSTSHIFT | punchInDiffFirst | Float — late arrival diff |
| PUNCH_OUT_DIFF_FIRSTSHIFT | punchOutDiffFirst | Float — early departure diff |
| PUNCH_IN_DIFF_FIRST_HOUR | punchInDiffFirstHour | Integer hours of late arrival |
| PUNCH_IN_DIFF_FIRST_MIN | punchInDiffFirstMin | Integer minutes of late arrival |
| PUNCH_OUT_DIFF_FIRST_Hour | punchOutDiffFirstHour | Integer hours of early out |
| PUNCH_OUT_DIFF_FIRST_MIN | punchOutDiffFirstMin | Integer minutes of early out |
| SECONDFROM_DATETIME | secondFromDateTime | Split shift 2nd period start |
| SECONDTO_DATETIME | secondToDateTime | Split shift 2nd period end |
| SECONDFROMTIME | secondFromTime | "HH:mm" 2nd period start |
| SECONDTOTIME | secondToTime | "HH:mm" 2nd period end |
| SECONDDURATION | secondDuration | Float hours 2nd period |
| PUNCH_IN_DIFF_SECONDSHIFT | punchInDiffSecond | Late diff 2nd shift |
| PUNCH_OUT_DIFF_SECONDSHIFT | punchOutDiffSecond | Early out diff 2nd shift |
| PUNCH_IN_DIFF_SECOND_HOUR | punchInDiffSecondHour | |
| PUNCH_IN_DIFF_SECOND_MIN | punchInDiffSecondMin | |
| PUNCH_OUT_DIFF_SECOND_Hour | punchOutDiffSecondHour | |
| PUNCH_OUT_DIFF_SECOND_MIN | punchOutDiffSecondtMin | |
| SECOND_SHIFT_SLOT | secondShiftSlot | LeaveSlot enum string |
| SECONDSHIFTREMARK | secondShiftRemark | String |
| ATTENDANCE | attendance | AttendanceType code string |
| REMARKS | remarks | Free text remarks |
| CORRESPONDINGDUTYDAY | correspondingDutyDay | Cross-day link date |

### 8.4 PMS_PUNCHINGMASTER (Written by HIS batch)

| Column | Java Field | Notes |
|---|---|---|
| MASTERID | id | PK, sequence PUNCHINGMASTER_0 |
| EMP_ID | empid | FK → EMPLOYEE (HIS employee) |
| PMS_EMP_ID | pmsemp | FK → PayrollEmployee |
| SITE_ID | siteid | Long |
| PUNCHDATE | punchdate | Date — the duty date |
| PUNCH_IN_DATETIME | punch_in_datetime | First IN punch datetime |
| PUNCH_OUT_DATETIME | punch_out_datetime | Last OUT punch datetime |
| MANUALPUNCHINDATETIME | manualpunchindatetime | Manual override IN |
| MANUALPUNCHOUTDATETIME | manualpunchoutdatetime | Manual override OUT |
| INTIME | intime | "HH:mm:ss" string |
| OUTTIME | outtime | "HH:mm:ss" string |
| PUNCH_SOURCE | punch_source | e.g. 'AUTO' |
| PUNCH_STATES | punch_states | State flags |
| DEVICEID | deviceid | Source device |
| DURATION | duration | "HH:mm:ss" formatted string |
| HOURS | hours | Integer |
| MINUTES | minutes | Integer |
| SECONDS | seconds | Integer |
| DURATIONINMINUTES | durationInMinutes | Integer |
| STATUS | status | Status string |
| DEPARTMENT | department | String |
| DESCRIPTION | description | String |
| ISCHECKED | ischecked | Boolean (FALSE initially) |
| PLANVALUE | planValue | FK → DUTYPLANVALUES |
| ACTUALVALUE | actualValue | FK → DUTYACTUALVALUES |
| PUNCHINGUPLOADID | punchingUploadId | FK → PunchingRecords upload batch |

### 8.5 SHIFT_TYPE (Reference — read by HIS batch)

| Column | Java Field | Type | Notes |
|---|---|---|---|
| ID | id | Long | PK |
| CODE | code | String | Short code identifier |
| SHIFT_TYPE_INDEX | index | int | Ordering |
| START_TIMING | startTimeString | String | "HH:mm" |
| END_TIMING | endTimeString | String | "HH:mm" |
| SECONDSHIFT_STARTTIMING | secondShiftStartString | String | Split shift 2nd start |
| SECONDSHIFT_ENDTTIMING | secondShiftEndString | String | Split shift 2nd end |
| IS_NIGHT | night | boolean | yes/no Hibernate type |
| ISLEAVE | isLeave | Boolean | Leave shift type |
| ISWEEKOFF | isWeekOff | Boolean | Week off |
| NATIONAL_HOLIDAY | nationalHoliday | Boolean | Public holiday |
| ISWORKSHIFT | isWorkShift | Boolean | Regular working shift |
| COMPENSATORY | compensatory | Boolean | Compensatory off |
| DUTYOFF | dutyOff | Boolean | Duty off |
| NOPUNCHNOLEAVE | noPunchNoLeave | Boolean | NoPunchNoLeave shift |
| NOPUNCHNOLEAVE_15 | noPunchNoLeave_15 | Boolean | 15-min NPNL variant |
| MISSPUNCH | missPunch | Boolean | Miss punch shift |
| CALLDUTY | callDuty | Boolean | Call duty |
| NIGHTOFF | nightOff | Boolean | Night off |
| ISSPLITSHIFT | isSplitShift | Boolean | Split shift indicator |
| EXTRASHIFT | extraShift | Boolean | Extra shift |
| PERMISSIONSHIFT | permissionShift | Boolean | Permission shift |
| PERMISSIONCOMPENSATORY | permissionComp | Boolean | Permission compensatory |
| DURATION | duration | Float | Shift duration in hours |
| LEAVEMASTER | leaveMaster | FK | → LeaveMaster for leave type |
| COLOR | color | String | UI display color |
| FORMOBILE | forMobile | Boolean | Mobile app visibility |
| IS_ACTIVE | isActive | Boolean | Active flag |

---

## 9. ATTENDANCE TYPE ENUM — `AttendanceType`

```java
enum AttendanceType implements IEnumType {
  PRESENT("PRESENT"),
  LEAVE("LEAVE"),
  WEEOFF("WEEOFF"),              // Week Off
  COMPENSATORYOFF("COMPENSATORYOFF"),
  PUBLICHOLLYDAY("PUBLICHOLLYDAY"),
  HALFDAYAFTERNOON("HALFDAYAFTERNOON"),
  HALFDAYMORNING("HALFDAYMORNING"),
  EMPTY("EMPTY"),                // No decision yet
  MISSPUNCH("MISSPUNCH"),
  NOPUNCHNOLEAVE("NOPUNCHNOLEAVE"),
  DUTYOFF("DUTYOFF")
}
```

Note: `HALFDAYAFTERNOON` and `HALFDAYMORNING` are distinct enum values but are resolved via `SECOND_SHIFT_SLOT` + `LeaveSlot` logic, not set directly in ATTENDANCE column in most cases.

---

## 10. KEY NAMED QUERIES

All queries are declared in Hibernate HBM XML files and invoked by name:

| Query Name | Operation | Table(s) |
|---|---|---|
| `fetchMAXDateTimefromATTLOGS` | SELECT MAX(logdatetime) WHERE DIRECTION='in' | ATTLOGS |
| `fetchMINDateTimefromATTLOGS` | SELECT MIN(logdatetime) WHERE DIRECTION='in' | ATTLOGS |
| `fetchLeaveIsApproved` | SELECT WHERE leavestatus='APPROVED' BETWEEN dates | APPLIEDLEAVES |
| `getDutyPlanValues` | SELECT WHERE empId AND planDate range | DUTYPLANVALUES |
| `getDutyActualValues` | SELECT WHERE empId AND actualdate AND dutyactuals | DUTYACTUALVALUES |
| `getPrevMonthLastDayPlanRoster` | SELECT previous month boundary plan | DUTYPLANVALUES |
| `FindEmployeeScMappingForCheck` | SELECT service center mapping for employee | EMPLOYEE_SC_MAPPING |
| `getDutyRosterMasterObjWithServiceCenter` | SELECT roster master with SC | DUTYPLANVALUES JOIN |
| `find.CorrespondingcompensationDate` | SELECT compensation date link | DUTYACTUALVALUES |
| `find.Correspondingdutyday` | SELECT corresponding duty day link | DUTYACTUALVALUES |
| `fetchdutyrosteremplyeedata` | SELECT duty roster data for employee | DUTYPLANVALUES |
| `updateactualGrantTotalHours` | UPDATE total grant hours | DUTYACTUALVALUES |
| `update.lock.duty.roster.emtries` | UPDATE lock flag | DUTYPLANVALUES |
| `update.punchingmaster.all` | UPDATE batch complete flag | PMS_PUNCHINGMASTER |
| `update.punchingupload.all` | UPDATE upload complete flag | PunchingRecords |
| `update.shift.actualvalue.all` | UPDATE shift actual values batch | DUTYACTUALVALUES |
| `update.dutuactuals.beforepunchupload` | UPDATE reset actuals before batch | DUTYACTUALVALUES |
| `update.attendance.beforepunchupload` | UPDATE reset attendance before batch | DUTYACTUALVALUES |
| `find.fileisalreadyupload` | SELECT check if upload already done | PunchingRecords |
| `check.pmspunchupload.entries` | SELECT count of PUNCHINGMASTER entries | PMS_PUNCHINGMASTER |
| `fetchpayrollemployee` | SELECT payroll employee by code | PayrollEmployee |
| `find.CorrespondingcompensationDate` | SELECT compensation date for day | DUTYACTUALVALUES |

---

## 11. CONFIGURABLE PARAMETERS

HIS reads runtime configuration from a `BranchConfigParameter` table or similar, accessed via `getConfigParameterValue(branchId, paramKey)`:

| Parameter Key | Observed Values | Purpose |
|---|---|---|
| `BufferDateValue` | Yesterday's date | The date for which the batch processes punches |
| `latetimein` | Configurable | Late IN tolerance threshold (branch-specific) |
| `latetimeout` | Configurable | Late OUT tolerance threshold (branch-specific) |
| `punchinoutdifference15min` | 15 | Minimum minutes between consecutive punches to avoid dedup |
| `allowSinglePunchForNightShift` | true/false | Whether one punch counts as PRESENT for night shifts |

---

## 12. HARDCODED BUSINESS RULES (NON-CONFIGURABLE)

These rules are embedded directly in `ProcessUploadService` bytecode:

| Rule | Value | Location |
|---|---|---|
| Minimum punch interval | 15 minutes | `punchinoutdifference15min` field default |
| First IN direction filter | `'in'` (lowercase) | SQL: `WHERE DIRECTION = 'in'` |
| Leave status check | `'APPROVED'` | SQL: `AND leavestatus='APPROVED'` |
| Date format for plan query | `'YYYY-MM-DD HH24:MI:SS'` | Oracle TO_DATE mask |
| Date format for leave query | `'YYYY/MM/DD'` | Oracle TO_DATE mask |
| Duty actuals reset time | 00:50 daily | Quartz cron `0 50 0 * * ?` |
| Processing time | 01:00 daily | Quartz cron `0 0 1 * * ?` |
| Debug log left in production | `"hello bro debugg it"` | String literal in ProcessUploadService |
| Initial punch data anchor | `"12674"` | Unknown constant found in class pool |
| Cross-day linkage field | `CORRESPONDINGDUTYDAY` | Links night shift DUTYACTUALVALUES pairs |

---

## 13. TRANSACTION FLOW — TABLE UPDATE SEQUENCE

```
Time 00:50 (Pre-reset):
  1. UPDATE DUTYACTUALVALUES — reset attendance for target date
  2. UPDATE ATTLOGS/attendance — reset attendance flags

Time 01:00 (Main batch) — for each employee:
  READ:
  3. SELECT ATTLOGS — fetch raw punches
  4. SELECT DUTYPLANVALUES — fetch planned roster
  5. SELECT APPLIEDLEAVES / EMPLOYEELEAVELIST — check leave approvals
  6. SELECT SHIFT_TYPE (all) — loaded into memory at job start
  7. SELECT EMPLOYEE — employee map loaded at job start

  WRITE:
  8. INSERT PMS_PUNCHINGMASTER — save processed punch summary
  9. INSERT/UPDATE DUTYACTUALVALUES — write attendance decision
 10. UPDATE DUTYACTUALVALUES.CORRESPONDINGDUTYDAY — link night shift pairs
 11. UPDATE PMS_PUNCHINGMASTER.ACTUALVALUE — link back to actuals

Time 02:30 (Post-processing):
 12. UPDATE DUTYACTUALVALUES — final reconciliation pass
 13. UPDATE EMPLOYEE-related grant total hours

Batch completion:
 14. UPDATE PunchingRecords — mark batch complete
 15. UPDATE PMS_PUNCHINGMASTER batch flags
```

---

## 14. FILE UPLOAD PROCESSING (Non-DB Path)

In addition to the automatic DB-polling batch, HIS also supports manual Excel/CSV upload:

```
FUNCTION processuploadpunch(file, punchingRecords):
  // Supports .xls (HSSFWorkbook via Apache POI) and .csv (opencsv)
  // Date formats accepted:
  //   "yyyy-MM-dd", "yyyy/MM/dd", "dd-MM-yyyy", "dd/MM/yyyy"
  // Validates format — rejects with message if wrong

  FOR EACH row:
    punchIn  = parse(row[punchInCol])
    punchOut = parse(row[punchOutCol])
    empCode  = row[EMPID or EMPCODE]
    // Stores in PunchDataVO: {firstPunch, lastPunch, firstDirection, lastDirection}
```

---

*End of FULL_HIS_ATTENDANCE_REVERSE_ENGINEERING.md*
