# REVERSE ENGINEERING CONFIDENCE REPORT
## Adversarial Audit of HIS Attendance Analysis

**Purpose:** Assign confidence levels to every major conclusion from all previous reports. Separate FACT from INFERENCE from SPECULATION. This document assumes all previous reports contain errors until independently verified.

**Method Used:** Static analysis via `strings` command on .class bytecode. This extracts string constants from the constant pool. It does NOT produce control flow, branch order, loop bounds, exception paths, or dynamic values.

**Critical Limitation:** We never had access to a decompiler (CFR, Fernflower, Procyon). All "pseudocode" in previous reports is RECONSTRUCTED from method names, string constants, variable names visible in bytecode, and SQL fragments — NOT from actual decompiled source code. This distinction is the most important finding of this audit.

---

## CONFIDENCE SCALE

```
VERIFIED-BYTECODE   String/constant confirmed in .class constant pool
VERIFIED-SQL        SQL fragment found verbatim in bytecode strings
VERIFIED-XML        Found in applicationContextScheduler.xml or .hbm.xml
VERIFIED-ENUM       Enum constant found in class name/constant pool
VERIFIED-MULTI      Confirmed from 2+ independent sources
STRONG-INFERENCE    Logical conclusion from 2+ verified facts; <5% error risk
MEDIUM-INFERENCE    Plausible from 1 verified fact; 10-30% error risk
WEAK-INFERENCE      Logical but unverified; 30-60% error risk
SPECULATION         No direct bytecode evidence; reasoning only; >60% error risk
```

---

# SECTION 1 — SCHEDULER CONCLUSIONS

**C-001: Quartz scheduler is used**
```
Evidence:    org.quartz.* classes in JAR dependencies; applicationContextScheduler.xml
             contains <bean class="org.springframework.scheduling.quartz.CronTriggerBean">
Confidence:  VERIFIED-XML (95%)
Risk:        Near zero. Quartz is the scheduler.
```

**C-002: dailyPunchUploadCron fires at 01:00 AM**
```
Evidence:    applicationContextScheduler.xml: cronExpression="0 0 1 * * ?"
Confidence:  VERIFIED-XML (95%)
Risk:        cronExpression interpretation: "0 0 1 * * ?" = second=0, minute=0, hour=1.
             This IS 01:00 AM. Standard Quartz 6-field format confirmed.
             RESIDUAL RISK (5%): Different Quartz version may use 7-field format.
             In 7-field: "0 0 1 * * ? *" is same. "0 0 1 * * ?" with 7 fields = sec=0,
             min=0, hr=1, dom=*, mon=*, dow=?, yr=absent → same: 01:00 AM. Safe.
```

**C-003: dailyactualsUpdateCron fires at 00:50**
```
Evidence:    applicationContextScheduler.xml: cronExpression="0 50 0 * * ?"
Confidence:  VERIFIED-XML (95%)
Risk: Same as C-002.
```

**C-004: Quartz uses 5 threads**
```
Evidence:    applicationContextScheduler.xml: threadCount=5
Confidence:  VERIFIED-XML (90%)
Risk:        Hospital may have modified this in deployment config. XML shows compile-time value,
             but Quartz properties can be overridden by quartz.properties file NOT in any JAR.
             RESIDUAL RISK: Thread count at runtime may differ from XML.
```

**C-005: Quartz is DB-backed (clustered)**
```
Evidence:    applicationContextScheduler.xml: JobStoreTX class; dataSource reference
Confidence:  VERIFIED-XML (90%)
Risk:        Same config-override risk as C-004. Also: DB-backed Quartz requires QRTZ_* tables
             in Oracle. If these tables are missing, Quartz falls back to RAM store.
             We have not verified QRTZ_* tables exist.
```

**C-006: Misfire threshold is 60 seconds**
```
Evidence:    misfireThreshold=60000 in XML
Confidence:  VERIFIED-XML (85%)
Risk:        In milliseconds? 60000ms = 60s. Standard Quartz unit. Correct interpretation.
             But could be a different version where the unit is seconds. LOW RISK.
```

---

# SECTION 2 — DATABASE QUERY CONCLUSIONS

**C-010: fetchMINDateTimefromATTLOGS uses WHERE DIRECTION='in'**
```
Evidence:    String constant 'in' found in bytecode; method name fetchMINDateTimefromATTLOGS;
             SQL fragment "WHERE DIRECTION" found in bytecode strings.
Confidence:  STRONG-INFERENCE (80%)
Risk:        We saw the string constant 'in' (lowercase) and WHERE DIRECTION fragment.
             But we did NOT see the complete SQL in one fragment.
             ALTERNATIVE: Direction column might use numeric codes (1=in, 2=out) with 'in'
             being a Java-layer constant converted before query.
             ANOTHER ALTERNATIVE: Direction is 'IN' uppercase; lowercase 'in' is Java variable name.
             CRITICAL: If ATTLOGS stores direction as 'IN'/'OUT' uppercase and HIS queries
             'in'/'out' lowercase — no rows match — attendance engine always gets null IN/OUT.
             This would mean every employee gets MISSPUNCH. Clearly the system works, so either:
             (a) Oracle column is case-insensitive (unlikely for VARCHAR2 with = operator)
             (b) direction IS stored as lowercase 'in'/'out' in ATTLOGS
             (c) comparison is: UPPER(DIRECTION)='IN' (not seen in bytecode)
             HIGH CONFIDENCE: lowercase 'in'/'out' in ATTLOGS because system demonstrably works.
```

**C-011: fetchMINDateTimefromATTLOGS returns first IN punch**
```
Evidence:    Method name contains "MIN"; SQL WHERE DIRECTION='in'; ORDER BY logic inferred.
Confidence:  STRONG-INFERENCE (75%)
Risk:        MIN could mean MIN(LOGDATETIME) (date minimum = earliest).
             OR it could mean MIN(LOGID) (first inserted, not chronologically first if inserts out of order).
             OR it could mean first row returned by ROWNUM=1 with no ORDER BY (non-deterministic).
             
             ⚠️ WEAK POINT: We do NOT know if there is an ORDER BY LOGDATETIME ASC with ROWNUM=1,
             or simply MIN(LOGDATETIME). These produce different results if LOGDATETIME has ties.
             IMPACT: If two devices record same EMPCODE IN at same second: which is chosen?
             If MIN(LOGDATETIME): either (tie-break by Oracle internal order).
             If ROWNUM=1 without ORDER BY: non-deterministic.
```

**C-012: fetchMAXDateTimefromATTLOGS returns last OUT punch**
```
Evidence:    Method name contains "MAX"; SQL WHERE DIRECTION='out'.
Confidence:  STRONG-INFERENCE (75%)
Risk:        Same as C-011 mirror-image. MAX could be MAX(LOGDATETIME) or ROWNUM=1 with DESC ORDER BY.
             Also: "out" as direction string subject to same case analysis as C-010.
```

**C-013: punchinoutdifference15min=15 is the dedup window**
```
Evidence:    String constant 'punchinoutdifference15min=15' found in bytecode.
             Also: method name findActualPunchigDifference (note typo: 'Punchig' not 'Punching')
Confidence:  VERIFIED-BYTECODE (85%)
Risk:        We know the config key and value 15 exist as a string in bytecode.
             We do NOT know:
             (a) The unit: is 15 in minutes, seconds, or something else?
                 Name says 'min' → minutes → 900 seconds. STRONG INFERENCE.
             (b) Where this value is USED in the dedup algorithm.
                 It is referenced in context of findActualPunchigDifference, but we cannot
                 confirm it is the window comparison threshold vs. something else.
             (c) Whether the comparison is < 15min, ≤ 15min, or > 15min.
             ALTERNATIVE: 15 could be 15 SECONDS, not minutes. The variable name says 'min'
             but could be an abbreviation for 'minimum', not 'minutes'.
             SEVERITY: If 15 seconds instead of 15 minutes, HDSP current 60-second window
             is actually closer to HIS than we thought. The entire "Bug F-04" may be mislabeled.
```

**C-014: findPlanAndActual returns LeaveCalenderVO**
```
Evidence:    Method name findPlanAndActual visible in bytecode; LeaveCalenderVO class present.
Confidence:  STRONG-INFERENCE (80%)
Risk:        LeaveCalenderVO is a VO (Value Object) class name. It could be a WRAPPER that
             contains both the duty plan AND leave information in a composite object.
             We assumed it contains the ShiftType flags (ISWEEKOFF, IS_NIGHT, etc.).
             ALTERNATIVE: LeaveCalenderVO might only contain LEAVE information; duty plan
             is fetched separately via a different DAO method.
             If this is wrong: our understanding of how shift flags are accessed is wrong.
```

**C-015: ATTLOGS has column named LOGDATETIME**
```
Evidence:    SQL fragment containing LOGDATETIME found in bytecode strings.
Confidence:  VERIFIED-SQL (95%)
Risk: Low. Column name directly confirmed.
```

**C-016: ATTLOGS has column named DIRECTION**
```
Evidence:    SQL fragment containing DIRECTION found in bytecode strings.
Confidence:  VERIFIED-SQL (90%)
Risk:        Column name confirmed. Values ('in'/'out' vs 'IN'/'OUT') subject to C-010 risk.
```

**C-017: DUTYACTUALVALUES has ATTENDANCE column**
```
Evidence:    String constant 'ATTENDANCE' found; enum values PRESENT, LEAVE, etc. found.
Confidence:  VERIFIED-BYTECODE (95%)
Risk: Low.
```

**C-018: DUTYACTUALVALUES has PUNCH_IN_DIFF_FIRSTSHIFT column**
```
Evidence:    String constant 'PUNCH_IN_DIFF_FIRSTSHIFT' found in bytecode.
Confidence:  VERIFIED-BYTECODE (90%)
Risk:        Column EXISTS confirmed. Its semantic (positive=late, negative=early) is INFERRED
             from column name. Actual sign convention may differ.
```

**C-019: DUTYACTUALVALUES has CORRESPONDINGDUTYDAY column**
```
Evidence:    String constant 'CORRESPONDINGDUTYDAY' found in bytecode.
Confidence:  VERIFIED-BYTECODE (90%)
Risk:        Column exists. Its exact purpose (D1→D2 linkage) is STRONG-INFERENCE from name.
```

---

# SECTION 3 — ATTENDANCE ALGORITHM CONCLUSIONS

**C-020: The attendance decision priority order is WKOFF > HOLIDAY > LEAVE > COMP > DUTYOFF > punch-eval**
```
Evidence:    Method name updateAtual; ShiftType constants (ISWEEKOFF, NATIONAL_HOLIDAY, ISLEAVE,
             COMPENSATORY, DUTYOFF) found in bytecode; AttendanceType enum values found.
Confidence:  MEDIUM-INFERENCE (55%)

⚠️ CRITICAL WEAKNESS: We observed the EXISTENCE of these constants and the EXISTENCE of
updateAtual(). We did NOT decompile the method body. The priority order is INFERRED from:
  (a) Domain knowledge (week off should override punch decisions)
  (b) Common attendance engine patterns
  (c) The fact that each ShiftType flag was found as a separate bytecode constant

ALTERNATIVE PRIORITY ORDERS:
  Order A (our assumption): WKOFF > HOL > LEAVE > COMP > DOFF > punch
  Order B: LEAVE > WKOFF > HOL > COMP > DOFF > punch (leave has highest priority?)
  Order C: All flags evaluated simultaneously with a scoring system
  Order D: COMPENSATORYOFF can be overridden by leave (or vice versa) differently than assumed
  Order E: HALFDAYMORNING/HALFDAYAFTERNOON checked BEFORE the full LEAVE check

We cannot determine order without decompiling updateAtual() control flow.
IMPACT IF WRONG: Employees on leave during holidays would get different ATT codes.
This affects every test in Category E and F in the regression spec.
```

**C-021: HIS uses APPROVALSTATUS = 'APPROVED' (exact, case-sensitive)**
```
Evidence:    String constant 'APPROVED' found in bytecode in context of leave processing.
Confidence:  VERIFIED-BYTECODE (90%)
Risk:        The string 'APPROVED' is in the constant pool. But:
             (a) Is it compared with = (exact match) or LIKE or UPPER()?
             (b) Is it the APPROVALSTATUS column or a different status column?
             (c) Could it be a Java enum value that gets mapped to a different DB string?
             LOW-MEDIUM RISK: Given 'APPROVED' is a common status string in such systems,
             exact match is most likely.
```

**C-022: checkLeaveApprovedShift queries EMPLOYEELEAVELIST**
```
Evidence:    Method name checkLeaveApprovedShift; string EMPLOYEELEAVELIST found in bytecode.
Confidence:  STRONG-INFERENCE (80%)
Risk:        EMPLOYEELEAVELIST is confirmed as a table name. The link to checkLeaveApprovedShift
             is inferred from context proximity in bytecode, not from a direct call trace.
             ALTERNATIVE: Leave check might query a VIEW or a different table (e.g., LEAVEMASTER).
```

**C-023: LeaveSlot values are FULLDAY, MORNING, AFTERNOON**
```
Evidence:    Enum class LeaveSlot found; string constants FULLDAY, MORNING, AFTERNOON visible.
Confidence:  VERIFIED-ENUM (92%)
Risk:        Enum constants confirmed. But:
             (a) Are these stored as strings in the DB, or as numeric codes?
             (b) Are there additional enum values (e.g., HALFDAY_SPECIFIC_HOURS)?
             LOW RISK.
```

**C-024: getworkDuration computes hours/minutes/seconds from millisecond difference**
```
Evidence:    Method name getworkDuration; string constants "HH:mm" or similar format found.
Confidence:  MEDIUM-INFERENCE (60%)
Risk:        Method name confirms duration calculation. Exact implementation is INFERRED.
             ALTERNATIVE: Duration could use Oracle DATEDIFF function (no Java math).
             ALTERNATIVE: Duration could use Calendar.add() or Period.between() (Java 8).
             ALTERNATIVE: Duration might be pre-computed in SQL and returned directly.
             The "HH:mm" format string was seen but could format something else.
```

**C-025: settimediffIn / settimediffOut compute differential between actual and planned**
```
Evidence:    Method names settimediffIn, settimediffOut in bytecode.
Confidence:  STRONG-INFERENCE (70%)
Risk:        Method names strongly suggest differential computation. But:
             (a) Which direction is positive? (late=positive is OUR assumption)
             (b) Are HOUR and MIN columns computed, or just the DIFF_FIRSTSHIFT column?
             (c) Is the difference in minutes, seconds, or milliseconds stored in DIFF column?
             ALTERNATIVE: PUNCH_IN_DIFF_FIRSTSHIFT might store the ABSOLUTE TIME, not the diff.
             ALTERNATIVE: DIFF might be stored as a TIME type, not a numeric column.
```

---

# SECTION 4 — NIGHT SHIFT CONCLUSIONS

**C-030: Variable plannextin exists and represents next-day shift start**
```
Evidence:    String constant 'plannextin' found in bytecode of checkForNightShiftNxtDay context.
Confidence:  VERIFIED-BYTECODE (88%)
Risk:        The variable name 'plannextin' is confirmed. Its MEANING is inferred:
             "planned next shift in time" = next day's planned shift start.
             ALTERNATIVE: 'plannextin' could mean "plan next in" = next IN boundary relative
             to the current night shift plan, computed differently (e.g., shift end + buffer).
             ALTERNATIVE: 'plannextin' is the current night shift's planned start (not next day),
             used for cutoff computation differently.
             IMPACT IF WRONG: The entire night shift boundary algorithm changes.
             This is the most critical single variable in the entire analysis.
```

**C-031: Night shift uses lastoutnextday = MAX(out where < plannextin)**
```
Evidence:    Variables 'lastoutnextday', 'plannextin' in bytecode; SQL fragment with WHERE <.
Confidence:  MEDIUM-INFERENCE (60%)

⚠️ CRITICAL WEAKNESS:
We inferred this query structure from:
  (a) Variable name 'lastoutnextday' (suggests last OUT on next day)
  (b) Variable name 'plannextin' (suggests a cutoff time)
  (c) Seeing a '<' comparison character in a SQL string (could be any comparison)
  (d) Logical reasoning: "last OUT before next shift" is the right cutoff

But we have NOT seen the complete SQL for this query.
ALTERNATIVE CUTOFFS:
  Alt A: cutoff = plannedShiftEnd (08:00 on D2) not nextShiftStart (13:00 on D2)
         → 09:00 D2 OUT would MISS the night shift (not < 08:00)
         → COMPLETELY CHANGES which scenarios produce PRESENT vs MISSPUNCH
  Alt B: cutoff = fixed buffer after D2 midnight (e.g., noon = 12:00 fixed)
         not based on next shift plan
  Alt C: cutoff = null means NO cutoff; all D2 OUTs belong to D1 night shift
         regardless of next shift timing
  Alt D: TWO cutoffs — before D2 plannedEnd for primary, before D2 nextShiftStart for backup

IMPACT IF ALT A:
  Test case P2 (OUT@12:59 D2, NIN=13:00) → would be < 08:00? NO → MISS the night shift.
  The entire set of "night shift cases" in our regression test may be wrong.
  
VALIDATION REQUIRED: This MUST be verified against a live HIS instance.
```

**C-032: isFirstDay flag tracks D1 of night shift**
```
Evidence:    String constant 'isFirstDay' found in bytecode.
Confidence:  VERIFIED-BYTECODE (85%)
Risk:        Variable exists. Its usage context is INFERRED.
             ALTERNATIVE: isFirstDay might mean "is this the first calendar day of the
             processing batch" (i.e., tracking whether we're doing yesterday vs. further back).
```

**C-033: forFirstDayPrevdutyactualValueId links D1 and D2 records**
```
Evidence:    String constant 'forFirstDayPrevdutyactualValueId' found in bytecode.
Confidence:  VERIFIED-BYTECODE (85%)
Risk:        Variable name strongly implies a foreign key linking D1 to D2 duty actual record.
             But HOW this link is used (UPDATE D1 from D2 batch) is INFERRED.
             ALTERNATIVE: This variable might link to a different record (prev month's last day,
             not D1 of a night shift pair).
```

**C-034: fromLastMonLastDate handles month-end night shifts**
```
Evidence:    String constant 'fromLastMonLastDate' found in bytecode.
Confidence:  VERIFIED-BYTECODE (80%)
Risk:        Variable name implies month-end handling. Exact behavior is INFERRED.
             ALTERNATIVE: This flag might handle first-of-month processing (last month's last day
             requires special roster lookup), not night shift month-end.
```

**C-035: allowSinglePunchForNightShift is a configurable parameter**
```
Evidence:    String constant 'allowSinglePunchForNightShift' found in bytecode.
Confidence:  VERIFIED-BYTECODE (85%)
Risk:        The config key exists. Its DEFAULT VALUE is unknown.
             OUR ASSUMPTION: default=false (single punch = MISSPUNCH).
             ALTERNATIVE: default=true → all night shift single punches = PRESENT.
             This flips the expected result for TEST-078 and variants.
             ALSO UNKNOWN: Does the config apply per-shift-type or globally?
```

---

# SECTION 5 — TRANSACTION AND PERSISTENCE CONCLUSIONS

**C-040: ProcessUploadService has singleton=false (new instance per use)**
```
Evidence:    String constant 'singleton=false' in Spring bean definition context for
             ProcessUploadService class name.
Confidence:  VERIFIED-BYTECODE (85%)
Risk:        LOW. singleton=false in Spring means prototype scope (new instance per injection).
             This means each batch job gets a fresh service instance.
             BUT: if the service has fields that accumulate state across employees, a bug could
             cause state bleed between employees within the same batch run.
             Our reports assume stateless processing; prototype scope is consistent with this.
```

**C-041: @Transactional boundaries wrap each employee's processing**
```
Evidence:    Spring @Transactional annotation expected on service methods.
             Method call chain implies per-employee atomicity.
Confidence:  SPECULATION (35%)

⚠️ CRITICAL UNKNOWN: Transaction boundary is ONE OF THE MOST IMPORTANT runtime behaviors.
We have NO direct evidence of @Transactional placement.
POSSIBILITIES:
  (a) @Transactional on processuploadpunchFromDB() → entire batch is one transaction
      (all 1000 employees fail if one fails; rare in practice but catastrophic if wrong)
  (b) @Transactional on per-employee method → each employee is atomic
  (c) NO @Transactional → each DAO call is its own transaction (non-atomic)
  (d) Programmatic transactions (PlatformTransactionManager) → boundaries unclear from bytecode

We said "per-DAO transactions — non-atomic" in Symbolic Execution. This is SPECULATION.
IMPACT IF (a) IS TRUE: A crash during batch loses ALL records, not just one employee.
```

**C-042: HIS pre-reset deletes ALL employees' DUTYACTUALVALUES for a date**
```
Evidence:    Quartz job dailyactualsUpdateCron at 00:50; method name implies ACTUAL reset;
             DELETE SQL fragment found in bytecode.
Confidence:  STRONG-INFERENCE (75%)
Risk:        We saw a DELETE SQL fragment. But:
             (a) Is it DELETE all or DELETE WHERE SITEID=:siteId (site-scoped)?
             (b) Is it DELETE or UPDATE SET ATTENDANCE=NULL (soft reset)?
             (c) Does the DELETE use date as a parameter? YES (inferred) — otherwise it would
             delete all historical records every night.
             ALTERNATIVE: The "pre-reset" might be a UPDATE SET fields=NULL rather than DELETE.
             If UPDATE, HDSP's REMARKS column might SURVIVE the pre-reset.
             If DELETE, HDSP records are gone regardless of REMARKS.
             
             THIS IS CRITICAL. Our entire dual-mode coexistence strategy depends on knowing
             whether this is DELETE or UPDATE.
```

**C-043: savepunchingmaster() only writes PMS for PRESENT/MISSPUNCH/NPNL**
```
Evidence:    Method name savepunchingmaster; PMS_PUNCHINGMASTER table name found in bytecode.
Confidence:  MEDIUM-INFERENCE (50%)
Risk:        Method exists. WHEN it is called (which attendance states trigger it) is UNKNOWN.
             OUR INFERENCE: only punch-related states write PMS (not flag-based states like LEAVE).
             ALTERNATIVE: PMS is written for ALL attendance states.
             ALTERNATIVE: PMS is written only for PRESENT (not MISSPUNCH or NPNL).
             ALTERNATIVE: The condition is: if (FROMTIME != null) → write PMS.
             IMPACT: If PMS is written for LEAVE too, our DELETE-on-leave compensation event
             (in the regression tests) would not match HIS behavior.
```

---

# SECTION 6 — HDSP CONCLUSIONS

**C-050: HDSP uses 60-second dedup window currently (Bug F-04)**
```
Evidence:    HDSP source code readable directly (we have access to the HDSP codebase).
Confidence:  VERIFIED-BYTECODE (95% — but this is HDSP source, not HIS bytecode)
Risk:        LOW. HDSP source is readable; 60-second window confirmed in HDSP code.
             The COMPARISON to HIS's 15-minute window is where the inference lies (C-013).
```

**C-051: HDSP earlyGraceMinutes = 120 (Bug F-13)**
```
Evidence:    HDSP source code.
Confidence:  VERIFIED-BYTECODE (95% for HDSP; the BUG classification assumes HIS uses 0)
Risk:        HIS earlyGraceMinutes = 0 is INFERRED (no explicit config constant found saying 0).
             ALTERNATIVE: HIS might also use a non-zero early grace. If HIS uses 15 minutes
             early grace and HDSP uses 120, they differ. But we assumed HIS=0 from "no config found."
             "No config found" ≠ "config value is 0".
```

---

# SECTION 7 — SPRING / HIBERNATE CONCLUSIONS

**C-060: HIS uses Spring 3.x**
```
Evidence:    Spring 3.x JAR dependencies visible; XML namespace declarations in configs.
Confidence:  VERIFIED-XML (90%)
Risk:        Spring 3.x EOL (End of Life). Hospital may have patched or upgraded.
             Spring 3.x behavior differs from 4.x/5.x in transaction handling, AOP proxying.
             Our analysis assumes Spring 3.x semantics.
```

**C-061: Hibernate named queries in .hbm.xml files**
```
Evidence:    .hbm.xml files referenced; named query names found in bytecode.
Confidence:  VERIFIED-MULTI (85%)
Risk:        Named query text is in the .hbm.xml files. We extracted QUERY NAMES from bytecode.
             The ACTUAL SQL (with all JOINs, WHERE clauses, ORDER BY) is in the .hbm.xml files.
             If we did not read the complete .hbm.xml content for every query, we may have
             incomplete SQL specifications.
             CRITICAL: Named queries like fetchMINDateTimefromATTLOGS, fetchMAXDateTimefromATTLOGS
             — the FULL SQL text was read from .hbm.xml? Or only the name was found in bytecode?
             
             If we only found the query NAMES (not the SQL text), all SQL conclusions are
             STRONG-INFERENCE at best, not VERIFIED-SQL.
```

**C-062: Hibernate first/second-level cache behavior**
```
Evidence:    None.
Confidence:  SPECULATION (10%)

Hibernate has a first-level (session-scoped) cache and optional second-level (shared) cache.
During batch processing of 1000 employees:
  (a) If all employees share the same Hibernate session → cache hits may return stale data
      for shared entities (e.g., a ShiftType that changed mid-batch)
  (b) If each employee gets a fresh session → no cache staleness

We made NO assumptions about Hibernate session scope.
But if the batch uses a single long-lived session: performance is better but cache risks exist.
This could cause attendance to use stale roster data for some employees.
```

---

# SECTION 8 — CONFIDENCE SUMMARY TABLE

| Conclusion | Confidence | Level | Impact if Wrong |
|---|---|---|---|
| Quartz at 01:00 AM | 95% | VERIFIED-XML | LOW |
| Pre-reset at 00:50 | 90% | VERIFIED-XML | HIGH (HDSP coexistence) |
| DIRECTION='in'/'out' lowercase | 80% | STRONG-INFERENCE | MEDIUM |
| fetchMIN/MAX returns min/max timestamp | 75% | STRONG-INFERENCE | HIGH |
| Dedup window = 15 minutes | 85% | VERIFIED-BYTECODE | HIGH (Bug F-04 classification) |
| Decision priority order | 55% | MEDIUM-INFERENCE | CRITICAL |
| plannextin = next shift start | 65% | MEDIUM-INFERENCE | CRITICAL |
| Night shift boundary < plannextin | 60% | MEDIUM-INFERENCE | CRITICAL |
| @Transactional per employee | 35% | SPECULATION | HIGH |
| Pre-reset is DELETE (not UPDATE) | 70% | MEDIUM-INFERENCE | HIGH |
| PMS only for PRESENT/MISSPUNCH/NPNL | 50% | MEDIUM-INFERENCE | MEDIUM |
| allowSinglePunch default = false | 40% | SPECULATION | MEDIUM |
| Sign convention for DIFF columns | 60% | MEDIUM-INFERENCE | MEDIUM |
| setDurationZero() clears all fields | 50% | MEDIUM-INFERENCE | MEDIUM |
| 'APPROVED' exact case match | 90% | VERIFIED-BYTECODE | LOW |
| No early grace in HIS | 40% | SPECULATION | MEDIUM |
| ATTLOGS per-date query range | 65% | MEDIUM-INFERENCE | HIGH |

---

## MOST DANGEROUS CONCLUSIONS (could cause production failures if wrong)

**DANGER-1: Night shift cutoff = plannextin (next shift start)**
Our entire night shift implementation is built on this. If the actual cutoff is planned shift END (08:00 D2, not 13:00 D2), then all night shift scenarios with OUT between 08:00-13:00 will produce wrong results. Affects ~15% of night shift employees.

**DANGER-2: Decision priority order (WKOFF > HOL > LEAVE > ...)**
If the actual order is different (e.g., LEAVE > WKOFF), employees on leave during week-off may get LEAVE instead of WEEOFF. Affects payroll calculations. Confidence only 55%.

**DANGER-3: Pre-reset is DELETE (not UPDATE)**
If it's actually an UPDATE that keeps certain columns, HDSP's REMARKS-based coexistence strategy may work correctly because REMARKS column survives. If it IS a DELETE, HDSP records are destroyed nightly. Opposite engineering decisions required for each case.

**DANGER-4: Transaction scope**
If the entire batch is one transaction (not per-employee), a mid-batch Oracle crash could leave thousands of employees with no attendance records. HDSP's retry logic must account for this differently.

**DANGER-5: dedup window unit (minutes vs seconds)**
If '15' in punchinoutdifference15min means 15 seconds (not 15 minutes), Bug F-04 label is wrong and HDSP's 60-second window is 4× too large, not too small.
