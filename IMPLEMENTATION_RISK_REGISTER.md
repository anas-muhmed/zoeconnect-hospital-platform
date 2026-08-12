# IMPLEMENTATION RISK REGISTER
## Every HDSP Recommendation — With Confidence, Failure Mode, and Impact

**Format per entry:**
- RISK-ID | Source recommendation | Confidence | Wrong-if scenario | Impact if wrong | Likelihood | Severity | Mitigation

---

# TIER-1: CATASTROPHIC RISKS (wrong decision = payroll error for many employees)

## RISK-T1-001: Night Shift Cutoff = plannextin = Next Shift Start

**Source recommendation:** REALTIME_MIGRATION_SCENARIO_ANALYSIS.md, HIS_SYMBOLIC_EXECUTION.md
**Our claim:** D2 OUTs before next-shift-start are assigned to D1 night shift

**Confidence: 65% (MEDIUM-INFERENCE)**

**Wrong if:** HIS uses planned shift END (e.g., 06:00) as the cutoff, not next shift START (e.g., 14:00).

**Production failure scenario:**
Night shift 22:00-06:00. Employee OUT at 07:30.
- HDSP (our implementation): D1=PRESENT (07:30 < 14:00 NIN → assigned to D1)
- HIS (if cutoff=06:00): D1=MISSPUNCH (07:30 > 06:00 → not assigned to D1)
Payroll sees D1=PRESENT in HDSP, D1=MISSPUNCH in HIS. HR asks: "Why did HDSP pay this employee?" Answers don't match.

**Employee impact:** Night shift workers who exit between planned shift end and next shift start.
In a 300-bed hospital with 3-shift nursing (200 night nurses/month):
If cutoff is wrong: ~40-80 employees/month have wrong attendance.

**Likelihood: HIGH** (this boundary is untested)
**Severity: CRITICAL** (payroll impact, nurse attendance records incorrect)

**Mitigation:**
1. Run BV-005 validation test BEFORE implementing night shift
2. Implement with a CONFIGURATION FLAG: `nightShiftCutoffType: 'NEXT_SHIFT_START' | 'PLANNED_SHIFT_END'`
3. Default to 'PLANNED_SHIFT_END' (more conservative — employee must exit by planned end)
4. Switch to 'NEXT_SHIFT_START' only after validation

---

## RISK-T1-002: Decision Priority Order Wrong

**Source recommendation:** HIS_SYMBOLIC_EXECUTION.md Section 3, HIS_REALTIME_EQUIVALENCE_PROOF.md
**Our claim:** WKOFF > HOL > LEAVE > COMP > DOFF priority chain

**Confidence: 55% (MEDIUM-INFERENCE — never decompiled)**

**Wrong if:** LEAVE priority is BEFORE HOL or WKOFF in updateAtual().

**Scenario A: LEAVE > WKOFF:**
Employee has approved leave AND weekoff on same date (forced rest day).
- HDSP (our impl): WEEOFF (weekoff wins)
- HIS (if LEAVE > WKOFF): LEAVE (leave wins, balance consumed)
Result: leave balance consumed in HIS but NOT in HDSP. After 3 months: HIS leave balance ≠ HDSP leave balance. HR confronts employee about extra leave.

**Scenario B: LEAVE > HOL:**
Hospital allows leave to supersede holiday (common when employee took leave before holiday was declared).
- HDSP: PUBLICHOLLYDAY (employee gets free holiday)
- HIS: LEAVE (leave balance consumed)
Leave balance diverges.

**Likelihood: MEDIUM-HIGH** (we have NO evidence of the actual order)
**Severity: CRITICAL** (leave balance errors → payroll → legal → HR complaints)

**Mitigation:**
1. Run BV-003 and BV-004 validation tests
2. Query historical data: find employees with leave + weekoff on same date; check what HIS produced
```sql
SELECT d.EMPCODE, d.ACTUALDATE, d.ATTENDANCE
FROM DUTYACTUALVALUES d
JOIN DUTYPLANVALUES p ON d.EMPCODE = p.EMPCODE AND d.ACTUALDATE = p.ACTUALDATE
WHERE p.ISWEEKOFF = 'Y'
  AND EXISTS (SELECT 1 FROM EMPLOYEELEAVELIST l
              WHERE l.EMPCODE = d.EMPCODE
                AND d.ACTUALDATE BETWEEN l.FROMDATE AND l.TODATE
                AND l.STATUS = 'APPROVED');
```

---

## RISK-T1-003: HIS Pre-Reset Destroys HDSP Records (DELETE not UPDATE)

**Source recommendation:** REALTIME_MIGRATION_SCENARIO_ANALYSIS.md (coexistence strategy)
**Our claim:** dailyactualsUpdateCron at 00:50 may DELETE DUTYACTUALVALUES before HIS re-inserts

**Confidence: 70% (STRONG-INFERENCE)**

**Wrong if:** Pre-reset is an UPDATE (not DELETE). HDSP records survive 00:50 if they're for a date HIS isn't processing that night.

**Failure mode:**
If we ASSUME DELETE and design HDSP to stop writing during 00:50-03:00:
- We build a "lockout window" where HDSP defers all writes
- If HIS actually does UPDATE (not DELETE): lockout is unnecessary overhead
- Worse: if HIS does UPDATE but HDSP stops writing at 23:00 (believing its records will be deleted), employee attendance during 23:00-01:00 window is lost

**Converse failure mode:**
If we ASSUME UPDATE and design HDSP to write freely:
- A HIS DELETE at 00:50 destroys all HDSP records for today
- HDSP then re-processes: duplicate event processing, compensation event loops

**Likelihood: MEDIUM** (depends on exact HIS implementation)
**Severity: HIGH** (data integrity, potential duplicate compensation events)

**Mitigation:**
1. Run BV-007 test on staging
2. Design HDSP with BOTH modes: `hisPreResetMode: 'DELETE' | 'UPDATE'`
3. Monitor for DUTYACTUALVALUES record disappearance at 00:50 in production observability

---

## RISK-T1-004: Oracle Triggers Silently Modifying Attendance

**Source recommendation:** (implicit in all attendance write logic)
**Our claim:** HIS Java code writes exactly what we analyzed to Oracle

**Confidence: UNKNOWN — not validated at all**

**Failure mode:**
If a trigger exists: `BEFORE INSERT ON DUTYACTUALVALUES` that transforms MISSPUNCH to NOPUNCHNOLEAVE when FROMTIME and TOTIME are both null — our entire MISSPUNCH analysis is wrong. HIS always writes NOPUNCHNOLEAVE in this case. HDSP's MISSPUNCH records differ from what's actually in Oracle.

**How catastrophic:** Every MISSPUNCH employee produces wrong attendance code. If this trigger exists, the discrepancy would be immediate and obvious — but the ROOT CAUSE would be hidden.

**Likelihood: LOW-MEDIUM** (triggers are common in older Oracle healthcare systems)
**Severity: CATASTROPHIC** (fundamental behavior difference, invisible to Java analysis)

**Mitigation:**
1. Run SV-002 as the VERY FIRST validation step
2. Zero-cost: one SQL query reveals all triggers
3. Treat any trigger discovered as HIGH PRIORITY to understand

---

# TIER-2: HIGH RISKS (significant impact on subset of employees)

## RISK-T2-001: Dedup Window Unit Wrong (Seconds vs Minutes)

**Source recommendation:** All reports use "15-minute dedup window"
**Our claim:** punchinoutdifference15min=15 means 15 minutes

**Confidence: 85% (STRONG-INFERENCE)**

**Wrong if:** Value 15 means 15 seconds. Variable name's 'min' means 'minimum threshold', not 'minutes'.

**Failure mode:**
HDSP currently uses 60 seconds. If correct answer is 15 seconds:
- Our GAP-01 "fix" changes HDSP from 60s to 900s (if we think 15 min)
- But correct fix is 60s → 15s (making HDSP more aggressive, not less)
- Employees with two punches 20-30 seconds apart: HDSP passes both to HIS, HIS deduplicates one
- Result: HDSP processes 2 events, HIS only processes 1 → count divergence

**Likelihood: LOW-MEDIUM** (15 seconds is very aggressive for biometric readers)
**Severity: MEDIUM** (only affects employees with very fast double-tap)

**Mitigation:**
1. Run BV-001 and BV-002 tests
2. Query ATTLOGS for duplicate records within 15 seconds:
```sql
SELECT a1.EMPCODE, a1.LOGDATETIME, a2.LOGDATETIME,
       (a2.LOGDATETIME - a1.LOGDATETIME) * 86400 AS seconds_diff
FROM ATTLOGS a1
JOIN ATTLOGS a2 ON a1.EMPCODE = a2.EMPCODE
  AND a2.LOGDATETIME > a1.LOGDATETIME
  AND a2.LOGDATETIME - a1.LOGDATETIME < 1/24  -- within 1 hour
WHERE a1.DIRECTION = a2.DIRECTION
ORDER BY seconds_diff;
```
If all duplicates are clustered under 15 seconds: window is 15 seconds.
If all duplicates are under 15 minutes: window is 15 minutes.

---

## RISK-T2-002: HDSP earlyGraceMinutes Correct Target Unknown

**Source recommendation:** GAP-08 / Bug F-13: "earlyGraceMinutes=120 should be 0"
**Our claim:** HIS has no early grace period (earlyGraceMinutes=0)

**Confidence: INFERRED — no bytecode evidence**

**Wrong if:** HIS has earlyGraceMinutes=15 (or any non-zero value).

**Failure mode:**
If target is 15 minutes: fixing HDSP to 0 makes it MORE strict than HIS.
An employee who exits 10 minutes early is EARLY_GOING in HDSP but PRESENT in HIS.
HR marks them absent from HDSP view but present in HIS view.

**Likelihood: MEDIUM** (grace periods are common; 0 is unusually strict)
**Severity: MEDIUM** (affects employees who consistently exit slightly early)

**Mitigation:**
1. Run RISK-001 checklist item: observe employees who punched out early
2. Check what HIS produces for an employee who exits 5, 10, 15, 20 minutes early
3. Do NOT fix to 0 until confirmed — current 120-minute is definitely wrong, but target value is unknown

---

## RISK-T2-003: @Transactional Scope Per-Employee Not Confirmed

**Source recommendation:** SYMBOLIC_EXECUTION.md — assumed transaction wraps per-employee
**Our claim:** Each employee processed in a separate transaction (isolation of failures)

**Confidence: 35% (SPECULATION)**

**Wrong if:** HIS processes all employees in a single transaction, OR with no explicit transaction (autocommit).

**Single transaction failure mode:**
If employee #237 throws an exception, entire batch (all employees) rolls back.
All DUTYACTUALVALUES for today are reverted.
This would be a known operational catastrophe in HIS usage. If hospitals report this problem, single-transaction is true.
**HDSP must handle this by NOT writing to DUTYACTUALVALUES during HIS batch window** (any HDSP write during batch would also be rolled back if HIS rolls back and they share the connection — but they DON'T share connection since HDSP has its own pool).
Actually: HDSP uses separate connection pool. HIS transaction rollback does NOT roll back HDSP writes.
But: HDSP writes PRESENT, then HIS batch rolls back → HIS re-runs next night → HIS re-inserts PRESENT (same result). Safe.

**Autocommit failure mode:**
If HIS uses autocommit: each SQL is immediately visible to other sessions.
This INCREASES race condition risk: HDSP might read a partial HIS state mid-batch.

**Likelihood: MEDIUM** (per-employee transaction is the best practice and most likely)
**Severity: LOW** (HDSP is not in HIS's transaction — isolated)

**Mitigation:**
1. Query Oracle during HIS batch (01:00-02:00): are partial results visible mid-batch?
```sql
-- Run at 01:05 AM (5 minutes into batch):
SELECT COUNT(*) FROM DUTYACTUALVALUES WHERE ACTUALDATE = TRUNC(SYSDATE);
-- If count is increasing: per-employee commits (autocommit or per-employee transaction)
-- If count is 0 until batch completes: single transaction
```

---

## RISK-T2-004: checkForNightShiftNxtDay() Called or Not for Day Shifts

**Source recommendation:** HIS_SYMBOLIC_EXECUTION.md — night shift check is conditionally called
**Our claim:** checkForNightShiftNxtDay() called only when IS_NIGHT flag is set

**Confidence: 70% (STRONG-INFERENCE)**

**Wrong if:** The method is ALWAYS called (for every employee) but returns quickly for non-night shifts.

**Impact:** Low (day shift employees not affected by night shift logic regardless of call).
But if logic has a bug that activates for certain day-shift punch times (e.g., OUT after midnight for late workers), it could mis-assign those punches to the "next day" for night shift processing.

**Mitigation:** Run a production query for day-shift employees who stayed late (OUT after midnight). Check their DUTYACTUALVALUES — is TOTIME 00:30 or null?

---

## RISK-T2-005: savepunchingmaster Conditions Unknown

**Source recommendation:** SYMBOLIC_EXECUTION.md, EXECUTION_TRACE.md — PMS write conditions inferred
**Our claim:** PMS written only for PRESENT, MISSPUNCH, NOPUNCHNOLEAVE

**Confidence: 60% (MEDIUM-INFERENCE)**

**Wrong if:** PMS written for ALL attendance types including LEAVE, WEEOFF, etc.

**Failure mode:**
If HDSP does NOT write PMS for LEAVE employees but HIS does:
GAP-07 (PMS never written) is partially correct but incomplete.
After fixing GAP-07: HDSP writes PMS for PRESENT/MISSPUNCH only.
HIS writes PMS for ALL types.
PMS divergence remains for LEAVE/WEEOFF employees.

**Mitigation:** Run BV-012 — query PMS for all attendance types.

---

# TIER-3: MEDIUM RISKS (operational impact, not payroll-critical)

## RISK-T3-001: Oracle Stored Procedures Handle Core Logic

**Source recommendation:** (implicit — we assumed all logic in Java)
**Our claim:** All attendance computation is in Java JARs

**Confidence: 75% (STRONG-INFERENCE based on finding Java method names)**

**Wrong if:** A significant portion of computation is in Oracle packages.

**Failure mode:**
HDSP re-implements HIS logic in TypeScript.
If actual logic is in a PL/SQL package, TypeScript implementation is a guess.
Small differences accumulate across all employees.

**Likelihood: LOW-MEDIUM**
**Severity: HIGH** (fundamental replication problem)

**Mitigation:** Run CONFIG-001 and RC-002 checklist items. Run Oracle package audit before any HDSP logic implementation.

---

## RISK-T3-002: Hospital-Specific Patches Override JAR Classes

**Source recommendation:** (implicit)
**Our claim:** JAR files contain the entire HIS implementation

**Confidence: 70% (STRONG-INFERENCE)**

**Wrong if:** Hospital has a custom /WEB-INF/classes directory with overriding .class files.

**Failure mode:**
We analyzed the vendor JARs. Hospital has customized night shift algorithm for rotating resident schedules. HDSP implements vendor algorithm, not hospital algorithm.

**Mitigation:** Check deployed application server:
```bash
ls -la /path/to/deployed/war/WEB-INF/classes/
find /path/to/deployed/war -name "*.class" -newer /path/to/vendor/jar
```
Any .class files newer than the vendor JARs are customizations.

---

## RISK-T3-003: Properties File Runtime Values Differ from JAR Defaults

**Source recommendation:** All config-dependent claims
**Our claim:** JAR defaults (punchinoutdifference15min=15) are actual runtime values

**Confidence: 80% (STRONG-INFERENCE)**

**Wrong if:** Production properties file overrides any of these values.

**Impact:** Any analysis based on configuration values is wrong.

**Mitigation:** Run CV-001 and CV-004 checklist items. Read actual deployed properties files.

---

## RISK-T3-004: Split Shift Logic Unknown

**Source recommendation:** GAP-05 — split shift not implemented in HDSP
**Our claim:** HDSP should implement split shift to match HIS

**Confidence: 40% (WEAK-INFERENCE on implementation details)**

**Wrong if:** HIS split shift logic treats the two halves independently (not combined), and HDSP should do the same but with different punch pairing logic.

**Failure mode:**
We implement combined-duration split shift. HIS actually processes each half independently.
For an employee with 4 punches (IN1, OUT1, IN2, OUT2):
- Our HDSP: duration = (OUT1-IN1) + (OUT2-IN2)
- HIS: processes IN1/OUT1 as one shift, IN2/OUT2 as second shift → two records
Divergence for ALL split shift employees.

**Mitigation:** Run BV-015 test. Also check DUTYACTUALVALUES for employees with ISSPLITSHIFT=Y:
```sql
SELECT * FROM DUTYACTUALVALUES WHERE EMPCODE IN (
  SELECT DISTINCT EMPCODE FROM DUTYPLANVALUES WHERE ISSPLITSHIFT = 'Y'
) AND ROWNUM <= 20;
```
Multiple rows per employee per date → HIS writes separate records for each half.

---

## RISK-T3-005: HDSP GAP-10 Initial Cursor Behavior

**Source recommendation:** GAP-10 / Bug F-05: initial cursor hardcoded
**Our claim:** HDSP starts processing from a fixed ATTLOGS timestamp (GAP-10)

**Wrong if:** The initial cursor IS correctly configured but we diagnosed the bug incorrectly.

**Failure mode:** "Fixing" GAP-10 by changing the initial cursor might cause HDSP to reprocess all historical punches.
If ATTLOGS has 3 years of historical punches, HDSP would process them all on first restart.
Result: hundreds of thousands of compensation events for historical dates.
Database overwhelmed.

**Mitigation:** When fixing GAP-10: set initial cursor to current timestamp, NOT start of data.

---

# RISK SUMMARY MATRIX

| Risk ID | Likelihood | Severity | Priority | Gate |
|---------|-----------|---------|---------|------|
| T1-001 Night shift cutoff | HIGH | CRITICAL | P0 | BV-005 |
| T1-002 Priority order | MEDIUM-HIGH | CRITICAL | P0 | BV-003/004 |
| T1-003 Pre-reset DELETE vs UPDATE | MEDIUM | HIGH | P0 | BV-007 |
| T1-004 Oracle triggers | LOW-MEDIUM | CATASTROPHIC | P0 | SV-002 |
| T2-001 Dedup unit seconds vs minutes | LOW-MEDIUM | MEDIUM | P1 | BV-001/002 |
| T2-002 earlyGraceMinutes target | MEDIUM | MEDIUM | P1 | RISK-001 |
| T2-003 Transaction scope | MEDIUM | LOW | P2 | Monitoring |
| T2-004 Day shift night check | LOW | LOW | P3 | Observation |
| T2-005 PMS write conditions | MEDIUM | MEDIUM | P1 | BV-012 |
| T3-001 Oracle packages | LOW-MEDIUM | HIGH | P1 | RC-002 |
| T3-002 Hospital patches | LOW | HIGH | P1 | WAR audit |
| T3-003 Properties override | LOW | HIGH | P1 | CV-004 |
| T3-004 Split shift logic | LOW-MEDIUM | MEDIUM | P2 | BV-015 |
| T3-005 GAP-10 cursor init | LOW | MEDIUM | P2 | Code review |

---

# UNKNOWN UNKNOWNS REGISTER

## UU-001: Hospital Operational Procedures Outside HIS
Hospitals often have manual processes that compensate for HIS limitations:
- HR manually adjusts DUTYACTUALVALUES for known exceptions (late device sync)
- Payroll team runs correction scripts before month-end close
- DBA runs nightly SQL to fix recurring bugs in HIS output
- Department heads approve attendance via a separate portal that writes directly to Oracle

**Impact:** HDSP may produce "correct" automated attendance while HR immediately overwrites it. HDSP's realtime updates look like interference. HR complains that "HDSP is reverting their corrections."

**Likelihood: HIGH** (almost all hospital HIS deployments have manual workarounds)

---

## UU-002: Month-End Payroll Lock Process
Most hospitals lock attendance at month-end before payroll export. The lock mechanism:
- Could be a flag on DUTYACTUALVALUES (LOCKED='Y')
- Could be a separate lock table
- Could be enforced by Oracle triggers (reject updates after lock date)

If HDSP writes to locked records: Oracle trigger rejects the insert → HDSP gets an error → HDSP marks the event as FAILED → DEAD_LETTER queue fills up at month-end.

**Mitigation:** Query for lock mechanism before month-end deployment.

---

## UU-003: Device-Level Deduplication by Biometric Vendor
The biometric device vendor middleware (ZKTeco, Suprema, etc.) may deduplicate at the device level BEFORE writing to ATTLOGS. If device dedup = 30 seconds, no duplicate punches within 30 seconds ever reach Oracle. Our 15-minute HIS dedup analysis then becomes: HIS dedup handles the 15-second to 15-minute range. HDSP's 60-second window may be duplicating work the device already does.

**Net effect:** Device (30s) + HIS (15min) = no duplicates under 15 min in production. HDSP adds a third layer.

---

## UU-004: Shift Roster Import/Export from External System
HIS may receive roster data (DUTYPLANVALUES) from an external rostering system (SAP, Kronos, custom HR system). Changes to the roster in the external system may not trigger HIS batch re-run. The HDSP TRIGGERED mode (roster change → recalculate) may depend on detecting roster changes that HIS never acts on because HIS only reads the roster at batch time.

**Impact:** HDSP and HIS have different views of "current roster" between roster-change time and next batch run.

---

## UU-005: Attendance Already Modified by Doctor/Department Head
Some HIS deployments allow department heads to modify attendance via a web UI before batch runs. If a department head marked an employee as LEAVE at 14:00 and HIS batch runs at 01:00 next day:
- HIS sees: LEAVE approved (from UI action)
- HDSP saw: employee present (punches arrived in realtime, classified as PRESENT)
- HDSP wrote PRESENT at 18:00; UI override set LEAVE at 14:00
- HDSP's compensation event chain fires: PRESENT → TRIGGERED → recalculate → need leave data

**Impact:** HDSP must listen to ALL attendance-affecting events, not just punch and leave approval events. Department head UI actions are a separate event source we may not have modeled.

---

## UU-006: Multiple HIS Application Instances / Cluster
If the hospital runs two HIS instances (load balancer, failover, or test/prod on same DB):
- Quartz is DB-backed — only ONE instance fires each job (correct behavior)
- But if both instances run WITHOUT proper clustering configured: BOTH fire at 01:00
- Double-batch = double DUTYACTUALVALUES processing = duplicate records or race conditions

We assumed single HIS instance. If clustered (even incorrectly): our analysis of the batch execution changes.

---

## UU-007: Historical Date Backfill Scenarios
Hospitals sometimes backfill attendance for past dates (device data recovered from backup, retroactive roster change, correcting mass error). HIS batch might be manually triggered for a past date. HDSP polling would then detect ATTLOGS records for historical dates (punch.logdatetime = 2026-03-15 while today is 2026-07-02). HDSP's current design may not handle historical date events correctly — it likely assumes all events are for recent dates.

---

## UU-008: Timezone Change / DST Events
If the hospital is in a region with daylight saving time:
- One day per year has 25 hours (clocks go back): what happens to ATTLOGS records between 02:00 and 03:00?
- One day per year has 23 hours: does HIS handle a night shift crossing the DST gap?
- Oracle DATE type does not store timezone info; DST ambiguity exists

India has no DST (UTC+5:30 year-round). If hospital is in India: not applicable. If hospital is in a DST region: critical edge case.

---

*This risk register should be reviewed and updated after each production validation test completes. Items confirmed as safe should be closed. Items that discover new behavior should spawn new risk entries.*
