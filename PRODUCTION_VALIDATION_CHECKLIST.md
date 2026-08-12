# PRODUCTION VALIDATION CHECKLIST
## What to Verify Against Live HIS Before Trusting Any Analysis

**Purpose:** An exhaustive list of runtime behaviors to verify against live HIS before implementing HDSP changes. Each item is a specific observation test — not a review of documents.

---

# SECTION 1 — DATABASE SCHEMA VALIDATION

## SV-001: Column Data Types
| Column | Table | Claimed Type | Verify By |
|--------|-------|-------------|-----------|
| FROMTIME | DUTYACTUALVALUES | DATE or TIMESTAMP | `DESC DUTYACTUALVALUES` |
| TOTIME | DUTYACTUALVALUES | DATE or TIMESTAMP | `DESC DUTYACTUALVALUES` |
| LOGDATETIME | ATTLOGS | DATE or TIMESTAMP | `DESC ATTLOGS` |
| WORKHOURS | DUTYACTUALVALUES | VARCHAR2 or NUMBER | `DESC DUTYACTUALVALUES` |
| ATTENDANCE | DUTYACTUALVALUES | VARCHAR2(20) | `DESC DUTYACTUALVALUES` |

Critical: If FROMTIME is DATE (not TIMESTAMP), time values are truncated to seconds. If VARCHAR2, times are stored as strings — comparison is lexicographic, not temporal.

---

## SV-002: Trigger Existence
```sql
SELECT trigger_name, trigger_type, triggering_event, table_name, status
FROM ALL_TRIGGERS
WHERE owner = '<HIS_SCHEMA>'
ORDER BY table_name;
```
Expected for correct analysis: zero triggers affecting DUTYACTUALVALUES, ATTLOGS, PMS_PUNCHINGMASTER.
If triggers exist: document each trigger body. Every trigger is a hidden business rule.

---

## SV-003: Oracle Packages / Stored Procedures
```sql
SELECT object_name, object_type
FROM ALL_OBJECTS
WHERE owner = '<HIS_SCHEMA>'
  AND object_type IN ('PACKAGE', 'PACKAGE BODY', 'PROCEDURE', 'FUNCTION')
ORDER BY object_type, object_name;
```
Expected for correct analysis: no packages with names like PKG_ATTENDANCE, PKG_SHIFT, PROC_PROCESS_PUNCH.
If packages exist: get the package bodies and audit for attendance logic.

---

## SV-004: Constraint Discovery
```sql
SELECT constraint_name, constraint_type, table_name, search_condition
FROM ALL_CONSTRAINTS
WHERE owner = '<HIS_SCHEMA>'
  AND table_name IN ('DUTYACTUALVALUES','ATTLOGS','PMS_PUNCHINGMASTER','DUTYPLANVALUES')
ORDER BY table_name;
```
Important: Does a UNIQUE constraint exist on DUTYACTUALVALUES (EMPCODE, ACTUALDATE)?
If yes: HIS cannot have duplicate records → our "multiple roster" scenarios are impossible.

---

## SV-005: Index Structure
```sql
SELECT index_name, table_name, uniqueness, column_name
FROM ALL_IND_COLUMNS c
JOIN ALL_INDEXES i USING (index_name, owner)
WHERE i.owner = '<HIS_SCHEMA>'
  AND i.table_name IN ('ATTLOGS', 'DUTYACTUALVALUES')
ORDER BY table_name, index_name;
```
Verify: Is ATTLOGS indexed on (EMPCODE, LOGDATETIME, DIRECTION)?
Without this index, the MAX/MIN queries run full table scan. With it, performance and result set identical but confirms query path.

---

# SECTION 2 — CONFIGURATION VALIDATION

## CV-001: Actual dedup window value
```bash
grep -r "punchinoutdifference" /path/to/deployed/app/
# Also check Oracle config table:
SELECT * FROM HIS_CONFIG WHERE CONFIG_KEY LIKE '%punch%';
SELECT * FROM SYSTEM_PROPERTY WHERE PROPERTY_KEY LIKE '%dedup%';
```
Expected: 15 (minutes) or 900 (seconds).
CRITICAL: The UNIT determines whether our 15-min analysis is correct.

---

## CV-002: Quartz scheduler fire times
```sql
SELECT JOB_NAME, NEXT_FIRE_TIME, PREV_FIRE_TIME, TRIGGER_STATE
FROM QRTZ_TRIGGERS
WHERE SCHED_NAME = 'QuartzScheduler';
```
Verify that actual cron times match what we extracted from applicationContextScheduler.xml:
- 23:00: dailyPunchUploadLock
- 01:00: dailyPunchUploadCron
- 02:30: attendanceandActualsUpdateCron

---

## CV-003: Spring configuration files in deployed WAR
```bash
find /path/to/deployed/war -name "applicationContext*.xml" | xargs ls -la
find /path/to/deployed/war -name "*.properties" | grep -i attend
```
Verify: No override files beyond what was analyzed.

---

## CV-004: Actual properties file values
Read each .properties file on the deployed server (not in JARs) and compare with JAR values.
Specifically look for: grace periods, dedup windows, batch timing, night shift cutoff configuration.

---

# SECTION 3 — BEHAVIOR VALIDATION TESTS (Run on HIS test/staging)

## BV-001: Basic Day Shift — Dedup Window Test

**Setup:**
- Employee with standard day shift (09:00-18:00)
- Insert 2 ATTLOGS IN records: T=09:00:00 and T=09:14:00 (14 minutes apart)

**Observe:**
- After batch: does DUTYACTUALVALUES have FROMTIME = 09:00 or 09:14?
- Is there any ATTLOGS mark indicating dedup?

**Interpretation:**
- If FROMTIME = 09:00: dedup window > 14 min → consistent with 15 min claim
- Repeat test with T=09:16:00: if FROMTIME = 09:00 still → window > 16 min → INCONSISTENT with 15 min
- Binary search the actual window: 1, 2, 5, 10, 14, 15, 16, 20, 30, 60 minutes

---

## BV-002: Dedup Unit Test (Minutes vs Seconds)

**Setup:**
- 2 IN records: 09:00:00 and 09:00:14 (14 SECONDS apart, same minute)

**Observe:**
- If FROMTIME = 09:00:14: dedup window < 14 seconds → very tight dedup
- If FROMTIME = 09:00:00: dedup window > 14 seconds → try 16 seconds, then 60 seconds

**This test definitively answers: is the dedup window in seconds or minutes.**

---

## BV-003: Priority Test — Weekoff + Leave Same Day

**Setup:**
- Employee with IS_NIGHTSHIFT roster on a Saturday (IS_WEEKOFF=Y)
- Approve leave for same Saturday
- Run batch

**Observe:**
- DUTYACTUALVALUES.ATTENDANCE = ? (WEEOFF or LEAVE?)
- Check LEAVECOUNT: was leave balance consumed?

**Interpretation:**
- WEEOFF → our priority order (WKOFF > LEAVE) is correct
- LEAVE → priority order is WRONG; leave beats weekoff
- Will have significant payroll impact if priority is wrong

---

## BV-004: Priority Test — Holiday + Leave Same Day

**Setup:**
- Declare a national holiday on a specific date
- Approve leave for same date for a test employee
- Run batch

**Observe:**
- ATTENDANCE = PUBLICHOLLYDAY or LEAVE?
- Is leave balance consumed (LEAVECOUNT changed)?

---

## BV-005: Night Shift Cutoff Experiment

**CRITICAL TEST — MUST RUN**

**Setup:**
Night shift employee (22:00 D1 to 06:00 D2).
Next day shift: 14:00 (so next shift start NIN = 14:00).

**Scenario A:** OUT at 07:00 D2 (after planned shift end 06:00, before NIN 14:00)
**Scenario B:** OUT at 13:59 D2 (59 minutes before NIN)
**Scenario C:** OUT at 14:00 D2 (exactly NIN)
**Scenario D:** OUT at 14:01 D2 (1 minute after NIN)

**Observe after D2 batch:**
- D1 DUTYACTUALVALUES.ATTENDANCE = ?
- D1 DUTYACTUALVALUES.TOTIME = ?
- D2 DUTYACTUALVALUES.ATTENDANCE = ?

**Interpretation:**
- If D1=PRESENT for A, B, C and D2=PRESENT for D: cutoff = NIN (our hypothesis)
- If D1=PRESENT for A and B, D2=PRESENT for C and D: cutoff = 14:00 (consistent with our hypothesis)
- If D1=PRESENT for A only, D2=PRESENT for B/C/D: cutoff = 06:00 (planned shift end — our hypothesis is WRONG)
- If D1=MISSPUNCH for all: HIS doesn't use next-day OUT at all for night shifts (completely wrong)

**This test alone validates or invalidates 60% of our night shift analysis.**

---

## BV-006: Night Shift Cutoff AT EXACTLY NIN

**Setup:**
Scenario C above but out time = exactly 14:00:00 NIN.

**Observe:**
D1 PRESENT or D2 PRESENT?

**Interpretation:** Determines if boundary is `< plannextin` (exclusive) or `<= plannextin` (inclusive).
Our reports say "exclusive" (< NIN). If HIS uses <=, one more edge case changes.

---

## BV-007: Pre-Reset Behavior (DELETE or UPDATE)

**Setup:**
- Run HIS batch for employee X on date D.
- Observe DUTYACTUALVALUES: SHIFTACTUALID = 1001 (example)
- Wait for next batch (next day)
- Observe DUTYACTUALVALUES after pre-reset (00:50): SHIFTACTUALID still 1001?

**Observation:**
- Check SHIFTACTUALID before and after 00:50 run
- If same ID: UPDATE (record preserved, values overwritten)
- If different ID: DELETE + INSERT (new sequence value)
- If record briefly absent during 00:50-01:00 window: DELETE confirmed

**Method:** Query DUTYACTUALVALUES every 5 minutes from 00:45 to 01:15.

**Why critical:** HDSP coexistence strategy depends entirely on this.
- If DELETE: HDSP records are destroyed at 00:50 every night
- If UPDATE: HDSP records may survive if HIS updates only changed columns

---

## BV-008: Half-Day Leave — Morning vs Afternoon

**Setup:**
- Approve HALFDAY MORNING leave for employee
- Employee still punches IN at 09:00, punches OUT at 13:00 (works half day)
- Run batch

**Observe:**
- ATTENDANCE = HALFDAYMORNING or HALFDAYAFTERNOON?
- WORKHOURS = ? (half of full day?)
- FROMTIME and TOTIME populated?

**Interpretation:** Which half-day code does HIS assign when employee has morning leave but works afternoon?
Validates LeaveSlot enum behavior.

---

## BV-009: MISSPUNCH — Missing IN

**Setup:**
- Employee with day shift (09:00-18:00)
- No IN punch inserted
- OUT punch at 18:00 inserted

**Observe:**
- ATTENDANCE = MISSPUNCH?
- FROMTIME = null?
- TOTIME = 18:00?

---

## BV-010: MISSPUNCH — Missing OUT

**Setup:**
- Employee with day shift
- IN punch at 09:00 inserted
- No OUT punch inserted

**Observe:**
- ATTENDANCE = MISSPUNCH?
- FROMTIME = 09:00?
- TOTIME = null?

---

## BV-011: NOPUNCHNOLEAVE

**Setup:**
- Employee with day shift
- No IN, no OUT, no leave approved

**Observe:**
- ATTENDANCE = NOPUNCHNOLEAVE?
- FROMTIME = null, TOTIME = null, WORKHOURS = null?

---

## BV-012: PMS Write Conditions

**Setup:**
- Four employees: one PRESENT, one MISSPUNCH, one LEAVE, one WEEOFF
- Run batch

**Observe:**
```sql
SELECT p.EMPCODE, d.ATTENDANCE, p.*
FROM PMS_PUNCHINGMASTER p
JOIN DUTYACTUALVALUES d ON p.EMPCODE = d.EMPCODE AND p.ACTUALDATE = d.ACTUALDATE
WHERE p.ACTUALDATE = :test_date;
```

**Interpretation:**
- Which attendance types have PMS records?
- This definitively answers ATTACK-005.

---

## BV-013: Compensatory Off Behavior

**Setup:**
- Grant compensatory off for employee (COMPENSATORY=Y in ShiftType)
- Run batch
- Does ATTENDANCE = COMPENSATORYOFF?
- Is leave balance affected?

---

## BV-014: DUTYOFF Behavior

**Setup:**
- Set DUTYOFF=Y for employee's shift type
- Run batch without punches

**Observe:**
- ATTENDANCE = DUTYOFF?
- PMS record exists?

---

## BV-015: Split Shift Behavior

**Setup:**
- Configure an ISSPLITSHIFT=Y shift type (e.g., 09:00-13:00, 14:00-18:00 with 1-hour break)
- Employee punches IN at 09:00, OUT at 13:05, IN at 14:00, OUT at 18:05

**Observe:**
- FROMTIME = 09:00 or first IN?
- TOTIME = 18:05 or last OUT?
- WORKHOURS = 8 (continuous) or 7 (minus break) or 8+gap?

---

## BV-016: Attendance Code String Case Sensitivity

**Observe directly:**
```sql
SELECT DISTINCT ATTENDANCE FROM DUTYACTUALVALUES WHERE ROWNUM <= 100;
```
Expected: PRESENT, LEAVE, WEEOFF, PUBLICHOLLYDAY, HALFDAYAFTERNOON, HALFDAYMORNING, MISSPUNCH, NOPUNCHNOLEAVE, COMPENSATORYOFF, DUTYOFF, EMPTY

If any codes appear in different case (MissPunch, miss_punch, etc.): HDSP comparison logic must handle case-insensitively.

---

## BV-017: Timezone Behavior

**Setup:**
- Check Oracle database timezone: `SELECT DBTIMEZONE, SESSIONTIMEZONE FROM DUAL;`
- Check application server timezone: from JVM startup: `java.util.TimeZone.getDefault()`
- Check ATTLOGS for a known punch and verify stored time matches wall clock time

**If server is UTC and hospital is UTC+5:30:**
- 09:00 local IN punch stored as 03:30 UTC in Oracle
- All HIS time comparisons are in UTC
- Planned shift times must also be UTC

---

## BV-018: Quartz Misfire Behavior

**Run during a scheduled batch window:**
- Simulate application restart during batch (kill and restart JVM at 01:15 AM)
- Observe: does the 01:00 batch re-run after restart? Or is it skipped (misfire threshold 60s exceeded)?

**This validates our scheduler analysis.**

---

# SECTION 4 — HDSP-SPECIFIC VALIDATIONS

## HV-001: Confirm HDSP Poll Interval vs HIS Batch Race

**Observation:**
- Start HDSP polling at 23:00 (HIS lock time)
- Observe HDSP event processing during 23:00-03:00 window
- Do HDSP events conflict with HIS writes?

---

## HV-002: Confirm HIS Pre-Reset Destroys HDSP Records

**Test (only on staging — NOT production):**
- Have HDSP write a DUTYACTUALVALUES record
- Wait for 00:50 HIS pre-reset
- Check if HDSP record survived, was overwritten, or was deleted

---

## HV-003: HDSP 60s Dedup vs HIS 15-min Dedup Outcome

**Test:**
- Send two punches 120 seconds apart to HDSP
- HDSP dedup: NOT deduplicated (120s > 60s HDSP window)
- HIS dedup: IS deduplicated (120s = 2 min < 15 min HIS window)
- HDSP would process both as separate events → possible double-count

---

# SECTION 5 — CONFIGURATION TABLE VALIDATION

## CONFIG-001: Check for HIS Config/Rule Tables
```sql
SELECT table_name FROM ALL_TABLES
WHERE owner = '<HIS_SCHEMA>'
  AND (LOWER(table_name) LIKE '%config%'
    OR LOWER(table_name) LIKE '%rule%'
    OR LOWER(table_name) LIKE '%param%'
    OR LOWER(table_name) LIKE '%setting%'
    OR LOWER(table_name) LIKE '%property%');
```
For each config table found: `SELECT * FROM <config_table>` to identify any attendance-related parameters.

---

## CONFIG-002: Night Shift Cutoff Config
```sql
-- Try various common config table patterns:
SELECT * FROM HIS_CONFIGURATION WHERE param_key LIKE '%night%';
SELECT * FROM ATTENDANCE_CONFIG WHERE key LIKE '%cutoff%';
SELECT * FROM SYSTEM_PARAMETERS WHERE name LIKE '%shift%';
```
If the cutoff (plannextin behavior) is configurable, it overrides our analysis.

---

# SECTION 6 — KNOWN RISK VALIDATION

## RISK-001: Validate earlyGraceMinutes Target
After observing several employees who punched OUT before their planned shift end, determine if HIS marks them as EARLY_GOING:
```sql
SELECT a.ATTENDANCE, a.FROMTIME, a.TOTIME, d.SHIFTOUTTIME
FROM DUTYACTUALVALUES a
JOIN DUTYPLANVALUES d ON a.EMPCODE = d.EMPCODE AND a.ACTUALDATE = d.ACTUALDATE
WHERE a.TOTIME < d.SHIFTOUTTIME AND a.ATTENDANCE = 'PRESENT';
```
If ATTENDANCE = PRESENT for employees who punched out early: HIS has no early-out detection for PRESENT (earlyGraceMinutes is irrelevant for PRESENT).
Check differential columns: if settimediffOut is populated with a negative value for these employees, HIS IS tracking early-out.
This identifies the correct HDSP behavior.

---

## RISK-002: Validate Differential Column Behavior
```sql
SELECT TIMEDIFFIN, TIMEDIFFOUT, ATTENDANCE
FROM DUTYACTUALVALUES
WHERE ACTUALDATE = :test_date
  AND EMPCODE IN (:late_employee, :early_employee, :on_time_employee);
```
Expected (if our analysis is correct):
- Late employee: TIMEDIFFIN > 0 (minutes late)
- Early employee: TIMEDIFFOUT < 0 (minutes early) or TIMEDIFFOUT > 0 (absolute)
- On-time employee: TIMEDIFFIN = 0, TIMEDIFFOUT = 0
- LEAVE employee: TIMEDIFFIN = null, TIMEDIFFOUT = null

---

## RISK-003: Validate WORKHOURS Format
```sql
SELECT WORKHOURS FROM DUTYACTUALVALUES
WHERE ATTENDANCE = 'PRESENT' AND ROWNUM <= 20;
```
Determine: Is WORKHOURS stored as "08:30" (string), 8.5 (decimal hours), or 510 (minutes)?
This affects HDSP's attendance duration calculation.

---

# SECTION 7 — COMPLETION CRITERIA

## GATE-1: Dedup window confirmed (minutes vs seconds, exact value)
- Status: REQUIRED before GAP-01/Bug F-04 fix

## GATE-2: Night shift cutoff confirmed (plannnextin = shift start vs end)
- Status: REQUIRED before HDSP night shift implementation

## GATE-3: Pre-reset behavior confirmed (DELETE vs UPDATE)
- Status: REQUIRED before HDSP coexistence strategy

## GATE-4: Decision priority confirmed (WKOFF > HOL > LEAVE order)
- Status: REQUIRED before HDSP decision engine

## GATE-5: PMS write conditions confirmed
- Status: REQUIRED before HDSP Oracle write logic

## GATE-6: No hidden Oracle triggers/procedures exist
- Status: REQUIRED before ANY production deployment

---

**Do not deploy HDSP attendance engine to production until all 6 gates are verified.**
