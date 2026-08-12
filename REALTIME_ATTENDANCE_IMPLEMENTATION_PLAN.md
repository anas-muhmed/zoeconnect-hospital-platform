# REALTIME ATTENDANCE IMPLEMENTATION PLAN

**Objective:** Implement all missing HIS attendance logic in HDSP as event-driven realtime processing  
**Stack:** NestJS + TypeORM + Bull + Oracle (HIS DB) + PostgreSQL  
**Reference:** HIS Reverse Engineering + Gap Analysis  
**Date:** 2026-07-02  

---

## 1. GUIDING PRINCIPLES

1. **Event-driven, not batch** — HDSP processes each punch as it arrives. All HIS batch algorithms must be re-expressed as per-punch or per-duty-date window operations.
2. **HIS-compatible output** — DUTYACTUALVALUES and PMS_PUNCHINGMASTER must be written with the same columns and semantics as HIS so payroll integration works without modification.
3. **Idempotent** — Processing the same punch N times must produce the same result.
4. **Manual override safe** — Never overwrite records that a human edited in HIS (detected via REMARKS prefix).
5. **Night shift window is mandatory** — Night shift cross-day logic is a P0 requirement; without it, all night-shift employees break.

---

## 2. PHASE 0 — BUG FIXES (Do First, Week 1)

These are low-effort fixes with high correctness impact. Complete before any new features.

### 2.1 Fix Duplicate Window (Bug F-04) — `attendance-decision-engine.service.ts`

**File:** `backend/src/modules/attendance/services/attendance-decision-engine.service.ts`

```typescript
// CURRENT (broken): _duplicateWindowSeconds never used
evaluate(punches, roster, rules, _duplicateWindowSeconds) { ... }

// FIX: wire up the parameter
evaluate(punches, roster, rules, duplicateWindowSeconds) {
  const deduped = this.removeDuplicates(punches, duplicateWindowSeconds);
  ...
}

removeDuplicates(punches: PunchEvent[], windowSeconds: number): PunchEvent[] {
  if (punches.length === 0) return [];
  const result: PunchEvent[] = [punches[0]];
  for (let i = 1; i < punches.length; i++) {
    const prev = result[result.length - 1];
    const curr = punches[i];
    const diffSeconds = (curr.logDateTime.getTime() - prev.logDateTime.getTime()) / 1000;
    // HIS rule: skip punches within 15 minutes (900 seconds) of previous
    if (diffSeconds < windowSeconds) continue;
    result.push(curr);
  }
  return result;
}
```

Update `AttendanceRuleSet.duplicateWindowSeconds` default from `60` to `900` (15 minutes).

### 2.2 Fix QUEUED Status Persist (Bug F-03) — `attendance-listener.service.ts`

```typescript
// ADD eventRepo.save() after status assignment
event.status = 'QUEUED';
await this.eventRepo.save(event);   // ← THIS LINE IS MISSING
await this.queue.enqueue(event);
```

### 2.3 Fix ROWNUM Before ORDER BY (Bug F-09) — `duty-actual-updater.service.ts`

```sql
-- CURRENT (broken): ROWNUM applied before ORDER BY
SELECT SHIFTACTUALID FROM DUTYACTUALVALUES
WHERE ${flagCol} = 1 AND ROWNUM = 1
ORDER BY ${branchCol}

-- FIX: wrap in subquery
SELECT SHIFTACTUALID FROM (
  SELECT SHIFTACTUALID FROM DUTYACTUALVALUES
  WHERE ${flagCol} = 1
  ORDER BY ${branchCol}
) WHERE ROWNUM = 1
```

### 2.4 Fix Initial Cursor Hardcode (Bug F-05) — `oracle-polling.service.ts`

```typescript
// CURRENT (broken)
const initial = new Date("2026-06-28T00:00:00.000Z");

// FIX: configurable lookback
const lookbackHours = parseInt(process.env['ATTENDANCE_INITIAL_LOOKBACK_HOURS'] ?? '24', 10);
const initial = new Date(Date.now() - lookbackHours * 60 * 60 * 1000);
```

### 2.5 Fix earlyGraceMinutes Default (Bug F-13) — `shift-rule-engine.service.ts`

```typescript
// CURRENT: earlyGraceMinutes: 120  ← 2-hour grace is wrong
// FIX:
earlyGraceMinutes: 0,
```

### 2.6 Remove Debug Console.log (Bug F-01) — `oracle-polling.service.ts`

Remove lines 87–88:
```typescript
// DELETE THESE:
console.log("RAW ROW:", rows[0]);
console.log("MAPPED:", punches[0]);
```

---

## 3. PHASE 1 — DIFFERENTIAL COLUMNS (Week 1–2)

### 3.1 Add Differential Calculation Service

Create `backend/src/modules/attendance/services/punch-differential.service.ts`:

```typescript
@Injectable()
export class PunchDifferentialService {

  /**
   * Calculates late arrival differential vs planned shift start.
   * Mirrors HIS ProcessUploadService.settimediffIn()
   */
  calcLateIn(actualIn: Date, plannedStart: string): PunchDifferential {
    const planned = this.parseShiftTime(actualIn, plannedStart);
    if (actualIn <= planned) return { hours: 0, minutes: 0, totalFloat: 0 };
    const diffMs = actualIn.getTime() - planned.getTime();
    return this.msToDifferential(diffMs);
  }

  /**
   * Calculates early departure differential vs planned shift end.
   * Mirrors HIS ProcessUploadService.settimediffOut()
   */
  calcEarlyOut(actualOut: Date, plannedEnd: string): PunchDifferential {
    const planned = this.parseShiftTime(actualOut, plannedEnd);
    if (actualOut >= planned) return { hours: 0, minutes: 0, totalFloat: 0 };
    const diffMs = planned.getTime() - actualOut.getTime();
    return this.msToDifferential(diffMs);
  }

  private parseShiftTime(dateRef: Date, timeStr: string): Date {
    const [h, m] = timeStr.split(':').map(Number);
    const d = new Date(dateRef);
    d.setHours(h, m, 0, 0);
    return d;
  }

  private msToDifferential(ms: number): PunchDifferential {
    const totalMinutes = Math.floor(ms / 60000);
    return {
      hours: Math.floor(totalMinutes / 60),
      minutes: totalMinutes % 60,
      totalFloat: parseFloat((totalMinutes / 60).toFixed(2)),
    };
  }
}

interface PunchDifferential {
  hours: number;
  minutes: number;
  totalFloat: number; // e.g. 0.5 for 30 minutes late
}
```

### 3.2 Add Differential Columns to DUTYACTUALVALUES MERGE

In `duty-actual-updater.service.ts`, extend the MERGE statement to include all 6 differential columns:

```typescript
// In the MERGE SET clause, add:
PUNCH_IN_DIFF_FIRSTSHIFT    = :lateInFloat,
PUNCH_IN_DIFF_FIRST_HOUR    = :lateInHour,
PUNCH_IN_DIFF_FIRST_MIN     = :lateInMin,
PUNCH_OUT_DIFF_FIRSTSHIFT   = :earlyOutFloat,
PUNCH_OUT_DIFF_FIRST_Hour   = :earlyOutHour,
PUNCH_OUT_DIFF_FIRST_MIN    = :earlyOutMin,
```

Pass these values from `attendance-processor.service.ts`:

```typescript
const lateIn = decision.inPunch && roster.shiftStart
  ? this.differentialSvc.calcLateIn(decision.inPunch, roster.shiftStart)
  : { hours: 0, minutes: 0, totalFloat: 0 };

const earlyOut = decision.outPunch && roster.shiftEnd
  ? this.differentialSvc.calcEarlyOut(decision.outPunch, roster.shiftEnd)
  : { hours: 0, minutes: 0, totalFloat: 0 };
```

---

## 4. PHASE 2 — COMPENSATORYOFF, DUTYOFF, CALLDUTY (Week 2)

### 4.1 Add Missing Shift Type Flags to RosterResult

In `attendance.types.ts`, add to the `RosterResult` type:

```typescript
interface RosterResult {
  // ... existing fields ...
  isCompensatory: boolean;   // ShiftType.COMPENSATORY
  isDutyOff: boolean;        // ShiftType.DUTYOFF
  isCallDuty: boolean;       // ShiftType.CALLDUTY
  isNightOff: boolean;       // ShiftType.NIGHTOFF
  isPermission: boolean;     // ShiftType.PERMISSIONSHIFT
  isNoPunchNoLeave15: boolean; // ShiftType.NOPUNCHNOLEAVE_15
}
```

### 4.2 Add to Roster Resolver SQL

In `roster-resolver.service.ts`, add columns to the JOIN query:

```sql
SELECT
  ...existing columns...,
  st.COMPENSATORY           AS "isCompensatory",
  st.DUTYOFF                AS "isDutyOff",
  st.CALLDUTY               AS "isCallDuty",
  st.NIGHTOFF               AS "isNightOff",
  st.PERMISSIONSHIFT        AS "isPermission",
  st.NOPUNCHNOLEAVE_15      AS "isNoPunchNoLeave15"
FROM DUTYPLANVALUES dpv
JOIN SHIFT_TYPE st ON ...
```

### 4.3 Add to Decision Engine — Priority Order

In `attendance-decision-engine.service.ts`, add before PRESENT/MISS_PUNCH evaluation:

```typescript
// PRIORITY: Compensatory Off (HIS: COMPENSATORYOFF)
if (roster.isCompensatory) {
  return { status: 'COMPENSATORYOFF', reasonCode: 'COMPENSATORY_OFF', ... };
}

// PRIORITY: Duty Off (HIS: DUTYOFF)
if (roster.isDutyOff) {
  return { status: 'DUTYOFF', reasonCode: 'DUTY_OFF', ... };
}

// PRIORITY: Night Off
if (roster.isNightOff) {
  return { status: 'WEEK_OFF', reasonCode: 'NIGHT_OFF', ... };
}

// PRIORITY: Single punch allowed for night shift
if (roster.isNightShift && rules.allowSinglePunchForNightShift) {
  if ((hasIn && !hasOut) || (!hasIn && hasOut)) {
    return { status: 'PRESENT', reasonCode: 'SINGLE_PUNCH_NIGHT', ... };
  }
}
```

Add `COMPENSATORYOFF` and `DUTYOFF` to `AttendanceDecisionStatus` union type and to `toHisStatus()` in `duty-actual-updater.service.ts`:

```typescript
case 'COMPENSATORYOFF': return 'COMPENSATORYOFF';
case 'DUTYOFF':         return 'DUTYOFF';
```

---

## 5. PHASE 3 — NIGHT SHIFT CROSS-DAY LOGIC (Week 2–3)

This is the most complex change. Night shifts that span midnight require linking two DUTYACTUALVALUES records via `CORRESPONDINGDUTYDAY`.

### 5.1 Night Shift Detection

A punch event belongs to a "night window" if:
- The roster for that date has `IS_NIGHT = TRUE`
- OR the punch time falls within a configured overnight window (e.g., 20:00–06:00 next day)

### 5.2 New Service: `NightShiftWindowService`

Create `backend/src/modules/attendance/services/night-shift-window.service.ts`:

```typescript
@Injectable()
export class NightShiftWindowService {

  /**
   * For a night shift starting on dutyDate, returns the effective
   * punch collection window spanning two calendar days.
   */
  getNightWindow(dutyDate: string, shiftStart: string, shiftEnd: string): {
    windowStart: Date;
    windowEnd: Date;
    day1: string;  // dutyDate (e.g. "2026-07-01")
    day2: string;  // dutyDate + 1 (e.g. "2026-07-02")
  } {
    const [startH, startM] = shiftStart.split(':').map(Number);
    const [endH, endM]     = shiftEnd.split(':').map(Number);

    const windowStart = new Date(`${dutyDate}T00:00:00`);
    windowStart.setHours(startH, startM, 0, 0);

    const day2 = this.addDays(dutyDate, 1);
    const windowEnd = new Date(`${day2}T00:00:00`);
    windowEnd.setHours(endH, endM, 0, 0);

    return { windowStart, windowEnd, day1: dutyDate, day2 };
  }

  /**
   * Given a set of ATTLOGS punches spanning two days,
   * extract IN punch from day1 and OUT punch from day2.
   * Mirrors HIS: fetchMINDateTimefromATTLOGS (day1, direction='in')
   *              + last OUT from day2
   */
  extractNightPunches(punches: PunchEvent[], window: NightWindow): {
    inPunch: Date | null;
    outPunch: Date | null;
  } {
    const day1Punches = punches.filter(p => p.logDateTime <= window.windowEnd
      && p.direction === 'IN'
      && p.logDateTime.toDateString() === new Date(window.day1).toDateString());
    const day2Punches = punches.filter(p => p.logDateTime <= window.windowEnd
      && p.direction === 'OUT'
      && p.logDateTime.toDateString() === new Date(window.day2).toDateString());

    const inPunch  = day1Punches.length > 0
      ? new Date(Math.min(...day1Punches.map(p => p.logDateTime.getTime())))
      : null;
    const outPunch = day2Punches.length > 0
      ? new Date(Math.max(...day2Punches.map(p => p.logDateTime.getTime())))
      : null;

    return { inPunch, outPunch };
  }

  private addDays(dateStr: string, days: number): string {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }
}
```

### 5.3 Cross-Day Record Strategy

When processing a night-shift punch for `dutyDate`:

```typescript
// In attendance-processor.service.ts, processEvent():

if (roster.isNightShift) {
  const window = this.nightShiftSvc.getNightWindow(
    event.dutyDate, roster.shiftStart, roster.shiftEnd
  );

  // Fetch punches for BOTH day1 and day2
  const allPunches = await this.punchHistorySvc.getSourcePunchesForWindow(
    event.employeeCode,
    window.windowStart,
    window.windowEnd,
  );

  const { inPunch, outPunch } = this.nightShiftSvc.extractNightPunches(
    allPunches, window
  );

  // Evaluate attendance using combined window
  const decision = await this.decisionEngine.evaluate(
    allPunches, roster, rules
  );

  // Write Day 1 record (the duty date)
  await this.dutyActualUpdater.upsert({
    ...decision,
    inPunch,
    outPunch,
    correspondingDutyDay: outPunch ? window.day2 : null,
    dutyDate: window.day1,
  });

  // If we have a full window (both IN and OUT), also write/update Day 2 record
  // Day 2 record references Day 1's DUTYACTUALVALUEID
  if (inPunch && outPunch) {
    await this.dutyActualUpdater.upsertNightShiftDay2({
      employeeCode: event.employeeCode,
      dutyDate: window.day2,
      correspondingDutyDay: window.day1,
      attendance: decision.status,
    });
  }
}
```

### 5.4 Add CORRESPONDINGDUTYDAY to MERGE Statement

```typescript
// In duty-actual-updater.service.ts MERGE, add:
CORRESPONDINGDUTYDAY = TO_DATE(:correspondingDutyDay, 'YYYY-MM-DD'),
```

---

## 6. PHASE 4 — PMS_PUNCHINGMASTER WRITES (Week 3)

### 6.1 New Service: `PunchingMasterService`

Create `backend/src/modules/attendance/services/punching-master.service.ts`:

```typescript
@Injectable()
export class PunchingMasterService {
  constructor(
    @InjectDataSource('oracle') private readonly oracle: DataSource,
    private readonly configSvc: AttendanceConfigService,
  ) {}

  /**
   * Saves punch summary to PMS_PUNCHINGMASTER.
   * Mirrors HIS ProcessUploadService.savepunchingmaster()
   */
  async upsert(params: PunchingMasterParams): Promise<void> {
    const cfg = await this.configSvc.getConfig();
    // Resolve PayrollEmployee ID from HIS EMPLOYEE
    const pmsEmpId = await this.resolvePmsEmpId(params.employeeCode);

    await this.oracle.query(`
      MERGE INTO PMS_PUNCHINGMASTER pms
      USING DUAL
      ON (pms.EMP_ID = :empId AND pms.PUNCHDATE = :punchDate)
      WHEN MATCHED THEN UPDATE SET
        PUNCH_IN_DATETIME  = :inDateTime,
        PUNCH_OUT_DATETIME = :outDateTime,
        INTIME             = :inTime,
        OUTTIME            = :outTime,
        DURATION           = :durationStr,
        HOURS              = :hours,
        MINUTES            = :minutes,
        SECONDS            = :seconds,
        DURATIONINMINUTES  = :durationMinutes,
        STATUS             = :status,
        ACTUALVALUE        = :actualValueId
      WHEN NOT MATCHED THEN INSERT (
        MASTERID, EMP_ID, SITE_ID, PUNCHDATE,
        PUNCH_IN_DATETIME, PUNCH_OUT_DATETIME,
        INTIME, OUTTIME, DURATION, HOURS, MINUTES, SECONDS,
        DURATIONINMINUTES, STATUS, PUNCH_SOURCE,
        ISCHECKED, ACTUALVALUE
      ) VALUES (
        PUNCHINGMASTER_0.NEXTVAL, :empId, :siteId, :punchDate,
        :inDateTime, :outDateTime,
        :inTime, :outTime, :durationStr, :hours, :minutes, :seconds,
        :durationMinutes, :status, 'HDSP_REALTIME',
        0, :actualValueId
      )
    `, {
      empId: params.employeeId,
      siteId: params.siteId,
      punchDate: params.dutyDate,
      inDateTime: params.inPunch,
      outDateTime: params.outPunch,
      inTime: params.inPunch ? this.toHHmm(params.inPunch) : null,
      outTime: params.outPunch ? this.toHHmm(params.outPunch) : null,
      durationStr: params.durationStr,      // "HH:mm" formatted
      hours: params.durationHours,
      minutes: params.durationMinutes % 60,
      seconds: 0,
      durationMinutes: params.durationMinutes,
      status: params.attendanceStatus,
      actualValueId: params.dutyActualValueId,
    });
  }

  private toHHmm(d: Date): string {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
}
```

### 6.2 Wire into `attendance-processor.service.ts`

After the `dutyActualUpdater.upsert()` call:

```typescript
const dutyActualId = await this.dutyActualUpdater.upsert(decision);

// Write to PMS_PUNCHINGMASTER (mirrors HIS savepunchingmaster())
await this.punchingMasterSvc.upsert({
  employeeCode: event.employeeCode,
  employeeId: roster.employeeId,
  siteId: roster.intraBranchId,
  dutyDate: decision.dutyDate,
  inPunch: decision.inPunch,
  outPunch: decision.outPunch,
  durationStr: decision.durationFormatted,
  durationHours: decision.durationHours,
  durationMinutes: decision.durationTotalMinutes,
  attendanceStatus: this.dutyActualUpdater.toHisStatus(decision.status),
  dutyActualValueId: dutyActualId,
});
```

---

## 7. PHASE 5 — HALF-DAY LEAVE (Week 4)

### 7.1 Read LEAVESLOT from EMPLOYEELEAVELIST

In `roster-resolver.service.ts`, extend the leave join to also return the slot:

```sql
ell.LEAVESLOT AS "leaveSlot"   -- FULLDAY / MORNING / AFTERNOON
```

Add to `RosterResult`:
```typescript
leaveSlot: 'FULLDAY' | 'MORNING' | 'AFTERNOON' | null;
```

### 7.2 Half-Day Decision Logic

In `attendance-decision-engine.service.ts`:

```typescript
if (roster.isOnLeave && roster.leaveSlot === 'FULLDAY') {
  return { status: 'LEAVE', ... };
}

if (roster.isOnLeave && roster.leaveSlot === 'MORNING') {
  // Morning is leave, check afternoon punches
  const afternoonPunches = punches.filter(p =>
    p.logDateTime.getHours() >= 12
  );
  const afternoonDecision = this.evaluatePunches(afternoonPunches, roster, rules);
  return {
    status: 'HALF_DAY',
    leaveSlot: 'MORNING',
    secondShiftSlot: afternoonDecision.status === 'PRESENT' ? 'AFTERNOON' : null,
    secondInPunch: afternoonDecision.inPunch,
    secondOutPunch: afternoonDecision.outPunch,
    ...
  };
}

if (roster.isOnLeave && roster.leaveSlot === 'AFTERNOON') {
  // Afternoon is leave, evaluate morning punches
  const morningPunches = punches.filter(p =>
    p.logDateTime.getHours() < 12
  );
  // Similar pattern
}
```

### 7.3 Add SECOND_SHIFT_SLOT to MERGE

```typescript
// In duty-actual-updater.service.ts MERGE:
SECOND_SHIFT_SLOT = :secondShiftSlot,   -- 'FULLDAY' | 'MORNING' | 'AFTERNOON'
SECONDFROM_DATETIME = :secondInPunch,
SECONDTO_DATETIME   = :secondOutPunch,
```

---

## 8. NEW SERVICE DEPENDENCY MAP

```
AttendanceProcessor (orchestrator)
  ├── OraclePollingService        (fetch ATTLOGS)
  ├── PunchHistoryService         (dedup + store events)
  ├── RosterResolverService       (DUTYPLANVALUES + SHIFT_TYPE + leave)
  ├── ShiftRuleEngineService      (load rules)
  ├── AttendanceDecisionEngine    (evaluate punches → status)
  │   └── NightShiftWindowService [NEW] (cross-day punch window)
  ├── PunchDifferentialService    [NEW] (late/early diff calc)
  ├── DutyActualUpdaterService    (MERGE DUTYACTUALVALUES)
  │   └── PunchDifferentialService [NEW]
  └── PunchingMasterService       [NEW] (INSERT/MERGE PMS_PUNCHINGMASTER)
```

---

## 9. CONFIG CHANGES

### 9.1 Environment Variables to Add/Update

```env
# EXISTING — update defaults:
ATTENDANCE_POLL_INTERVAL_MS=1500          # keep
ATTENDANCE_RECON_CRON=0 30 1 * * *        # keep, matches HIS 01:30 window
ATTENDANCE_INITIAL_LOOKBACK_HOURS=24      # NEW — replaces hardcoded cursor date

# NEW:
ATTENDANCE_PUNCH_DEDUP_WINDOW_SECONDS=900  # 15 minutes (matches HIS)
ATTENDANCE_ALLOW_SINGLE_PUNCH_NIGHT=false  # matches HIS default
ATTENDANCE_NIGHT_SHIFT_OUT_WINDOW_HOURS=10 # hours after shift start to look for OUT
ATTENDANCE_LATE_GRACE_MINUTES=0            # late grace (HIS has none)
ATTENDANCE_EARLY_GRACE_MINUTES=0           # fix from 120 default
```

### 9.2 Rule Set Defaults to Update

In `shift-rule-engine.service.ts`:

```typescript
const DEFAULT_ATTENDANCE_RULES: AttendanceRuleSet = {
  duplicateWindowSeconds: 900,        // was 60 — fix to match HIS 15-min rule
  earlyGraceMinutes: 0,               // was 120 — fix data-entry error
  lateGraceMinutes: 0,                // HIS has no grace — deduction starts immediately
  earlyGoingGraceMinutes: 0,          // HIS has no grace
  minimumWorkMinutesForPresent: 360,  // keep (6 hours)
  minimumWorkMinutesForHalfDay: 240,  // keep (4 hours)
  maxFuturePunchMinutes: 10,          // keep
  maxBackdatedPunchDays: 7,           // keep
  allowSinglePunchAsPresent: false,   // keep
  allowSinglePunchForNightShift: false, // NEW — from HIS allowSinglePunchForNightShift
  nightShiftOutWindowHours: 10,        // NEW — how far into next day to look for OUT
};
```

---

## 10. MIGRATION CHECKLIST

### Phase 0 (Week 1) — Bug Fixes
- [ ] Fix `removeDuplicates` to use configurable window (15 min default)
- [ ] Fix `QUEUED` status not persisted (`eventRepo.save()`)
- [ ] Fix `ROWNUM` before `ORDER BY` in shift resolution
- [ ] Remove hardcoded cursor date; use lookback env var
- [ ] Fix `earlyGraceMinutes` default from 120 → 0
- [ ] Remove `console.log` debug lines in `oracle-polling.service.ts`

### Phase 1 (Week 1–2) — Differential Columns
- [ ] Create `PunchDifferentialService` with `calcLateIn` / `calcEarlyOut`
- [ ] Extend DUTYACTUALVALUES MERGE with 6 differential columns
- [ ] Pass differential values from `attendance-processor.service.ts`
- [ ] Verify payroll reads differential columns (integration test)

### Phase 2 (Week 2) — Missing Statuses
- [ ] Add `isCompensatory`, `isDutyOff`, `isCallDuty`, `isNightOff` to RosterResult
- [ ] Add columns to roster SQL query
- [ ] Add COMPENSATORYOFF / DUTYOFF decision logic
- [ ] Add to `toHisStatus()` mapping
- [ ] Add `COMPENSATORYOFF` and `DUTYOFF` to `AttendanceDecisionStatus` union type

### Phase 3 (Week 2–3) — Night Shift Cross-Day
- [ ] Create `NightShiftWindowService`
- [ ] Modify `getSourcePunchesForWindow` to accept a date range spanning two days
- [ ] Add `correspondingDutyDay` to DUTYACTUALVALUES MERGE
- [ ] Implement dual-record write for night shifts
- [ ] Integration test: night shift spanning midnight → both records correct
- [ ] Integration test: night shift spanning month boundary

### Phase 4 (Week 3) — PunchingMaster
- [ ] Create `PunchingMasterService` with upsert logic
- [ ] Wire into `attendance-processor.service.ts` after DutyActual write
- [ ] Verify `PUNCH_SOURCE = 'HDSP_REALTIME'` distinguishes from HIS batch source `'AUTO'`
- [ ] Confirm payroll reads PunchingMaster correctly

### Phase 5 (Week 4) — Half-Day Leave
- [ ] Add `leaveSlot` to `EMPLOYEELEAVELIST` join in roster resolver
- [ ] Add half-day decision logic to decision engine
- [ ] Add `SECOND_SHIFT_SLOT` and secondary columns to MERGE
- [ ] Test MORNING leave + afternoon punches → correct DUTYACTUALVALUES

### Ongoing
- [ ] Co-ordinate with HIS ops to verify the nightly `update.dutuactuals.beforepunchupload` reset at 00:50 does not wipe HDSP realtime records (most critical data integrity risk)
- [ ] Add `PULSE` health check that verifies DUTYACTUALVALUES row count > 0 for today's date
- [ ] Add monitoring alert if cursor does not advance for > 5 minutes

---

## 11. TESTING STRATEGY

### Unit Tests (per phase)

| Phase | Test | Pass Condition |
|---|---|---|
| 0 | Dedup with punches 5 min apart | Second punch filtered out |
| 0 | Dedup with punches 20 min apart | Both punches kept |
| 0 | earlyGraceMinutes=0 | Employee arriving 5 min early → 0 early diff |
| 1 | settimediffIn: arrive 30 min late | PUNCH_IN_DIFF_FIRST_MIN = 30, HOUR = 0 |
| 1 | settimediffOut: leave 1h15m early | PUNCH_OUT_DIFF_FIRST_Hour = 1, MIN = 15 |
| 2 | COMPENSATORYOFF roster flag | Decision = COMPENSATORYOFF regardless of punches |
| 3 | Night shift IN day1, OUT day2 | Two records, both PRESENT, CORRESPONDINGDUTYDAY set |
| 3 | Night shift only IN (OUT not yet) | Day1 partial record, no TODATETIME |
| 4 | PunchingMaster write after PRESENT | PMS_PUNCHINGMASTER row exists with correct timestamps |
| 5 | MORNING leave, afternoon punches | HALF_DAY, SECOND_SHIFT_SLOT = AFTERNOON |

### Integration Tests

- Full pipeline: ATTLOGS INSERT → Oracle poll → Bull queue → decision → DUTYACTUALVALUES
- Night shift: simulate punch IN at 22:00, OUT at 06:00 next day → PRESENT on both dates
- Leave collision: employee on APPROVED leave punches anyway → LEAVE wins
- Manual override: REMARKS without prefix → SKIPPED

---

*End of REALTIME_ATTENDANCE_IMPLEMENTATION_PLAN.md*
