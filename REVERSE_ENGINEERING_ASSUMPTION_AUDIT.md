# REVERSE ENGINEERING ASSUMPTION AUDIT
## Attacking Every Inference, Finding Every Alternative, Exposing Blind Spots

**Purpose:** Prove the previous reports are wrong. Challenge every sentence that is not directly verifiable. Document contradictions between reports. Identify what runtime behavior cannot be determined from static analysis.

---

# PART 1 — THE FUNDAMENTAL METHOD PROBLEM

## Our analysis used `strings` on .class files. Here is what that can and cannot show:

```
WHAT strings EXTRACTS:
  ✓ String constants in the constant pool
  ✓ Class names referenced
  ✓ Method names defined in the class
  ✓ Field names of String type (if initialized with literals)
  ✓ SQL fragments if written as string literals
  ✓ Config key names if hardcoded
  ✗ DOES NOT SHOW: control flow (if/else order)
  ✗ DOES NOT SHOW: loop conditions
  ✗ DOES NOT SHOW: which method calls which method
  ✗ DOES NOT SHOW: where variables are assigned vs. read
  ✗ DOES NOT SHOW: exception handling paths
  ✗ DOES NOT SHOW: dynamic string concatenation results
  ✗ DOES NOT SHOW: method parameters or return types
  ✗ DOES NOT SHOW: null checks
  ✗ DOES NOT SHOW: boolean conditions
  ✗ DOES NOT SHOW: numeric comparisons
```

**IMPLICATION:** Every "pseudocode" section in all previous reports is a RECONSTRUCTION based on method names and domain knowledge, not actual decompiled bytecode. The control flow graphs in HIS_SYMBOLIC_EXECUTION.md are logically inferred, not verified from bytecode.

---

# PART 2 — ATTACK EVERY MAJOR INFERENCE

## ATTACK-001: The Priority Order in updateAtual()

**What we claimed:**
```
Priority: WKOFF > HOL > LEAVE > COMP > DOFF > NIGHTOFF > punch eval
```

**Why we inferred it:**
Domain knowledge. Attendance systems typically evaluate in this order.

**Evidence we actually have:**
- Method name `updateAtual` exists in bytecode
- String constants for each ShiftType flag exist
- AttendanceType enum values exist
- No control flow evidence

**Alternative interpretations:**

*Alt A — Leave priority BEFORE holiday:*
Some hospitals allow leave to supersede a declared holiday (employee took leave before holiday was declared; HR wants to honor the leave record and not give a free holiday).
If HIS implements: LEAVE > HOL, then employee on holiday with approved leave gets LEAVE (not PUBLICHOLLYDAY). Our test EP-08 ("leave approved during holiday → PUBLICHOLLYDAY") would be wrong.

*Alt B — Single pass with OR conditions:*
Instead of sequential IF-RETURN, HIS might set a priority score and pick winner:
```java
int priority = 0;
if (WKOFF) priority = Math.max(priority, 7);
if (HOL) priority = Math.max(priority, 6);
if (LEAVE) priority = Math.max(priority, 5);
// then switch(priority) to determine ATT
```
This produces same result as sequential IF for clean data but behaves differently for edge cases
(e.g., WKOFF=Y and LEAVE=Y simultaneously — score system always picks WKOFF; IF-chain might have subtle order differences).

*Alt C — Night shift evaluated BEFORE punch analysis, not as a sub-path:*
Instead of calling checkForNightShiftNxtDay() AFTER all flags, it might be called FIRST, then update the punch variables, then fall through to updateAtual() with updated punches.
This would change the IN/OUT values used for all differential calculations.

**Evidence missing:**
The actual bytecode of updateAtual() method body.

**Verification method:**
1. Run a live HIS test: create an employee with ISWEEKOFF=Y AND ISLEAVE=Y on same date. Observe which ATT code is written.
2. Or obtain a decompiler (CFR, Procyon) and decompile updateAtual.class.

---

## ATTACK-002: The Night Shift Cutoff = plannextin = next shift start

**What we claimed:**
```
plannextin = next-day planned shift start
Night shift OUT assigned to D1 if out_time < plannextin
```

**Why we inferred it:**
- Variable name 'plannextin' seen in bytecode
- Variable name 'lastoutnextday' seen
- Logical reasoning: "next in" implies "next shift start"

**Evidence we actually have:**
- String constant 'plannextin' in bytecode
- This appears in context of checkForNightShiftNxtDay

**Alternative interpretations:**

*Alt A — plannextin = planned end time of the night shift (D2 end = 08:00):*
"plann-ext-in" could mean "plan extended in [time]" = the PLANNED END of the current night shift.
If cutoff = 08:00 D2 (planned shift end) instead of 13:00 D2 (next shift start):
- Employee with OUT@09:00 D2: 09:00 > 08:00 → NOT a night shift OUT → MISSPUNCH
- Our test case P3 (OUT@13:00 exactly at NIN) becomes irrelevant
- ALL night shift scenarios with OUT after planned shift end but before next shift start would produce MISSPUNCH, not PRESENT
- This would be a much stricter boundary

*Alt B — plannextin is fetched from a different source:*
"plannextin" might be: the next ATTLOGS IN punch time from another employee (ward-level tracking).
Unlikely but cannot be excluded without decompiled code.

*Alt C — The boundary is NOT time-based but record-ID based:*
HIS might assign D2 OUTs to D1 based on sequential ATTLOGS ID proximity, not time comparison.

*Alt D — No explicit boundary; all D2 OUTs belong to D1:*
For night shifts, HIS might take ALL D2 OUTs (up to the first D2 IN) as potential night shift OUTs.
The cutoff might be first D2 IN, not a planned time.

**Production validation test:**
Set up scenario: Night shift 22:00-08:00. Next shift 13:00.
Employee OUT at 10:00 D2 (between planned shift end 08:00 and next shift start 13:00).
Does D1 show PRESENT (using 10:00 as OUT) or MISSPUNCH?
Answer determines whether cutoff = 08:00 or 13:00.

**SEVERITY: CRITICAL.** If cutoff = 08:00, the entire night shift algorithm in HDSP is wrong.

---

## ATTACK-003: The Dedup Window = 15 Minutes

**What we claimed:**
`punchinoutdifference15min=15` means 15 minutes between consecutive punches.

**Why we inferred it:**
Variable name says 'min' (minutes), value is 15.

**Alternative interpretations:**

*Alt A — 15 seconds:*
In some systems, dedup is designed for anti-double-tap (reader re-read in 15 seconds).
The '15' would then be 15 seconds. 'min' in the variable name = 'minimum' threshold, not 'minutes'.

*Alt B — The value 15 is a minimum punch count, not time:*
Unlikely given the context (punch timing), but cannot be excluded.

*Alt C — The window applies per-direction, not per-punch:*
Instead of "any two consecutive punches within 15 min", it might be:
"two consecutive INs within 15 min" OR "two consecutive OUTs within 15 min"
but NOT applied across directions (IN followed by OUT is not deduplicated even within 15 min).
This would change the behavior for TEST-034 (exit/re-entry within 15 min).

*Alt D — The 15-minute value is not used in findActualPunchigDifference:*
The value might be used in a DIFFERENT method (perhaps for checking shift overlap, or for some other purpose), and the actual dedup uses a hardcoded value in the SQL (WHERE LOGDATETIME - prev.LOGDATETIME > 0 i.e., no dedup at all).

**Verification:**
Load an employee with two INs exactly 14 minutes apart into HIS test environment. Observe DUTYACTUALVALUES. If the second IN is deduplicated → window ≥ 14 min. Try 16 minutes → if NOT deduplicated → window is between 14-16 min. Binary search to find exact threshold.

---

## ATTACK-004: ROWNUM Bug Causes Non-Deterministic Roster Selection

**What we claimed:**
HIS has a bug where ROWNUM=1 is applied before ORDER BY, causing non-deterministic roster selection when multiple records exist.

**Why we inferred it:**
This is a common Oracle query pattern mistake. We identified Oracle syntax in bytecode.

**Evidence we actually have:**
- Oracle SQL usage confirmed
- ROWNUM usage inferred from common Oracle pattern
- Multiple roster records scenario is hypothetical

**Alternative interpretations:**

*Alt A — HIS uses a proper subquery:*
```sql
SELECT * FROM (SELECT ... ORDER BY col) WHERE ROWNUM = 1
```
This is the CORRECT pattern and would be deterministic. We assumed they made the mistake; they may not have.

*Alt B — The roster has a unique constraint preventing duplicates:*
A DB constraint on (EMPCODE, ACTUALDATE) in DUTYPLANVALUES would prevent multiple records. If the constraint exists, our "multiple records" scenarios cannot occur.

*Alt C — HIS selects the newest record deliberately:*
ORDER BY CREATEDDATE DESC, ROWNUM=1 → picks the most recently modified roster entry. Not a bug; a feature.

**Severity:** MEDIUM. Multiple roster records may be impossible in production due to constraints.

---

## ATTACK-005: savepunchingmaster() Condition

**What we claimed:**
PMS is written only for PRESENT, MISSPUNCH, NOPUNCHNOLEAVE.

**Why we inferred it:**
Business logic: PMS (PunchingMaster) should record physical punch activity. Non-punch states (leave, holiday, etc.) don't need a PMS record.

**Evidence we actually have:**
- Method name savepunchingmaster exists
- Table PMS_PUNCHINGMASTER exists in bytecode strings
- NO direct evidence of the condition guarding the call

**Alternative interpretations:**

*Alt A — PMS written for ALL attendance types:*
HIS might write a PMS record for every employee every day, regardless of ATT status.
For LEAVE: PMS has FROM=null, TO=null, ATT=LEAVE.
For WEEOFF: PMS has FROM=null, TO=null, ATT=WEEOFF.
This would mean our DELETE-on-leave compensation events are wrong.

*Alt B — PMS written only for PRESENT:*
Only when both punches are valid → PMS records the time pair.
For MISSPUNCH and NPNL: no PMS record.
If true: our assumption that MISSPUNCH writes PMS is wrong → regression TEST-111 would fail.

*Alt C — PMS acts as an audit log and is written for all status changes:*
Every time DUTYACTUALVALUES changes, PMS gets a new row (append-only audit table).
Not a "current status" table but a history table.

**Verification:** Query PMS_PUNCHINGMASTER for known LEAVE, WEEOFF, NPNL dates in production HIS.

---

## ATTACK-006: The Priority of checkLeaveApprovedShift (BRANCH-3) vs CompensatoryOff (BRANCH-4)

**What we claimed:**
Leave is evaluated BEFORE compensatory. If employee has approved leave AND compensatory on same date → LEAVE wins.

**Why we inferred it:**
Standard attendance priority: explicit leave > compensatory arrangement.

**Evidence:**
Order is inferred. No bytecode control flow evidence.

**Alternative:** If compensatory PRECEDES leave check in updateAtual():
Employee on comp-off with leave approved → COMPENSATORYOFF (leave ignored).
This would consume leave balance without recording LEAVE in attendance.
Financial impact on payroll.

---

## ATTACK-007: getworkDuration Does Not Subtract Break Time

**What we claimed:**
HIS computes FROM to TO as wall-clock span (no break subtraction).
"No meal break deduction logic found."

**Why we inferred it:**
Absence of evidence: no "break", "lunch", "deduction" strings found in bytecode.

**Critical flaw:** Absence of evidence ≠ evidence of absence.

**Alternative:**
HIS might call a separate method (e.g., calculateNetHours()) that applies break deductions.
This method might be in a different JAR (common-all-5.0) that we analyzed less deeply.
Or: Oracle database FUNCTION computes net hours and HIS uses that instead of Java math.
Or: The hospital has a DB trigger on DUTYACTUALVALUES INSERT that updates WORKHOURS.

**Impact:** If breaks ARE deducted, WORKHOURS in our scenarios overstates actual computed hours.

---

## ATTACK-008: ProcessUploadService is the ONLY class processing attendance

**What we claimed:**
processuploadpunchFromDB() in ProcessUploadService is THE main attendance processing method.

**Why we inferred it:**
Method name is descriptive and we found it in the most likely JAR (payroll-web-5.0).

**Alternative:**
Multiple processing paths may exist:
- ProcessUploadService: for automated batch
- A separate ManualAttendanceService: for HR-entered attendance
- A ReprocessService: for batch re-runs
- A SpecialShiftService: for emergency/call duty
Any of these could use DIFFERENT algorithms or different field mappings.

If HIS has a MANUAL attendance entry UI, the algorithm for manual entry might:
- Skip dedup (manual = already filtered)
- Skip leave check (HR explicitly overriding)
- Write different columns

Our analysis may only cover the automated batch path.

---

# PART 3 — RUNTIME vs DECOMPILED CODE: WHAT'S OUTSIDE THE JARS

## RC-001: Oracle Database Triggers

**Risk Level: HIGH**

Any of the following triggers could silently alter attendance:
- `BEFORE INSERT ON DUTYACTUALVALUES`: could modify ATTENDANCE value before storing
- `AFTER INSERT ON ATTLOGS`: could trigger a stored procedure to process the punch immediately
- `BEFORE UPDATE ON EMPLOYEELEAVELIST`: could mark related DUTYACTUALVALUES as stale
- `INSTEAD OF` triggers on views

**How they would affect analysis:**
Our analysis assumes Java code writes exactly what we see in the INSERT statement.
A database trigger could silently:
- Convert 'MISSPUNCH' to 'MISS_PUNCH' (column format difference)
- Calculate WORKHOURS using a different formula
- Copy records to an audit table
- Call a stored procedure that modifies related records

**Verification:** Run `SELECT trigger_name, trigger_type, table_name, trigger_body FROM ALL_TRIGGERS WHERE owner = :schema` against the HIS Oracle schema.

---

## RC-002: Oracle Stored Procedures and Packages

**Risk Level: HIGH**

HIS might delegate attendance calculation to Oracle:
```sql
-- Instead of Java computation:
CALL PKG_ATTENDANCE.PROCESS_PUNCH(p_empcode => :emp, p_date => :date);
```

If HIS uses an Oracle package for the core algorithm:
- Our Java pseudocode is COMPLETELY WRONG (the logic is in Oracle, not Java)
- The Java layer is just an orchestrator calling Oracle procedures
- The actual attendance business rules are in PL/SQL

**Evidence against this:** We found method names like getworkDuration, settimediffIn in Java bytecode. These suggest Java-layer computation. But they could also be POST-PROCESSING of results from an Oracle procedure call.

**Verification:** `SELECT object_name, object_type FROM ALL_OBJECTS WHERE object_type IN ('PACKAGE', 'PROCEDURE', 'FUNCTION') AND owner = :schema`

---

## RC-003: Hibernate Named Query Overrides

**Risk Level: MEDIUM**

Named queries can be defined in:
1. .hbm.xml files (in JARs — we analyzed these)
2. @NamedQuery annotations on entity classes
3. orm.xml files in META-INF (could override #1 or #2)
4. Programmatic query registration at startup

If orm.xml exists with overriding named queries, the queries in the JARs might be replaced.
**Verification:** Check META-INF directory in deployed WAR file for orm.xml.

---

## RC-004: Spring XML Configuration Overrides

**Risk Level: MEDIUM**

Spring allows multiple applicationContext XML files. The deployed application may include:
- A hospital-specific applicationContext-override.xml
- A production applicationContext-datasource.xml with different datasource configs
- A custom applicationContext-attendance.xml with modified beans

These external files could override bean definitions from the JARs.
For example: a hospital-specific ProcessUploadService implementation overriding the JAR version.

**Verification:** Check the deployed WAR/EAR file for all applicationContext*.xml files.

---

## RC-005: Properties Files Outside JARs

**Risk Level: HIGH**

The value `punchinoutdifference15min=15` was found IN a JAR (constant pool).
But the ACTUAL RUNTIME VALUE comes from a properties file that may:
- Override the JAR default
- Be loaded from a server filesystem path (not in the JAR)
- Be stored in the Oracle database (a CONFIG table)

**If the production properties file has `punchinoutdifference15min=10`:**
The dedup window is 10 minutes, not 15. All our analysis is wrong.

**Verification:** Find the attendance-config.properties (or equivalent) on the application server and read its actual values.

---

## RC-006: JNI / Native Libraries

**Risk Level: LOW**

HIS is Java; JNI is possible but unlikely for attendance logic.
However: biometric device integration DLLs are common.
These DLLs handle device communication and might pre-process punch data before inserting into ATTLOGS.
If a DLL deduplicates punches at the device level before they reach ATTLOGS, HIS's 15-min dedup is applied to already-deduplicated data.

---

## RC-007: Spring AOP Interceptors (Logging, Security, Transaction)

**Risk Level: MEDIUM**

Spring AOP can intercept any method call. An AOP aspect could:
- Intercept processuploadpunchFromDB() and modify parameters
- Add additional attendance business rules as cross-cutting concerns
- Modify return values (e.g., correcting attendance codes based on hospital-specific rules)

We cannot detect AOP advice from bytecode analysis alone (it's woven at runtime).
**Verification:** Search for @Aspect classes and <aop:config> in Spring XML files.

---

# PART 4 — HIDDEN RUNTIME DEPENDENCIES

## HRD-001: Oracle NLS_DATE_FORMAT and Timezone

**Impact: HIGH**

HIS parses and compares dates/timestamps.
If the Oracle session NLS_DATE_FORMAT is not set to include time components, date comparisons may drop the time portion.

Example:
- If NLS_DATE_FORMAT = 'DD-MON-YY': `TO_DATE('2026-07-01 22:00:00', 'YYYY-MM-DD HH24:MI:SS')` might fail or produce midnight
- Night shift times stored as DATE (not TIMESTAMP) might lose the time portion

**If HIS uses DATE type (not TIMESTAMP) for FROMTIME, TOTIME:**
All time comparisons use DATE arithmetic, which in Oracle truncates to seconds.
Sub-second precision is impossible. (Low risk — we already assumed second resolution.)

**Oracle timezone:** If server is in UTC but hospital is UTC+5:30 (India), a punch at "08:00" local time is stored as "02:30 UTC". If HIS roster is in local time but ATTLOGS is in UTC, all time comparisons fail.

**Verification:** `SELECT DBTIMEZONE, SESSIONTIMEZONE FROM DUAL;`

---

## HRD-002: Oracle Database Isolation Level

**Impact: MEDIUM**

Default Oracle isolation: READ COMMITTED.
During HIS batch processing employee #500:
- ATTLOGS is being updated by device sync (INSERT happening concurrently)
- With READ COMMITTED: the batch might see some device sync rows and not others (committed at query time)
- This means two batch employees processed seconds apart may see different ATTLOGS snapshots

This is the race condition RC-2 in SYMBOLIC_EXECUTION.md. But isolation level affects EXACTLY which punches each employee's query sees.

If hospital uses SERIALIZABLE: batch sees a frozen snapshot from batch start (01:00 AM). Any punch inserted after 01:00 is NEVER seen by this batch. This is safer but means ANY last-minute punch is always missed.

**Verification:** `SELECT * FROM V$TRANSACTION` and connection pool settings.

---

## HRD-003: Oracle Sequences for Primary Keys

**Impact: LOW-MEDIUM**

DUTYACTUALVALUES SHIFTACTUALID and PMS primary keys are likely Oracle sequences.
If HDSP uses the same sequences (to generate PKs for its inserts), sequence contention could slow performance.
If HDSP uses a DIFFERENT PK generation strategy: orphan FK issues possible.

**Also:** If the sequence has `NOCACHE`, concurrent INSERTs from HDSP and HIS batch serialized on sequence. Performance impact.

---

## HRD-004: Singleton State in ProcessUploadService

**Impact: MEDIUM**

We confirmed singleton=false (prototype scope). BUT:
- If the class has a static field (class-level, not instance-level): it IS shared between all instances
- Static counters, loggers, or cached data would be shared

Example: If ProcessUploadService has `static ShiftTypeCache cache = new ShiftTypeCache()` — a cached roster map — all instances share this cache. A cache hit may return stale roster data from an employee processed earlier in the batch.

We cannot determine static fields from `strings` output alone.

---

## HRD-005: Thread-Local Variables

**Impact: MEDIUM**

If HIS uses ThreadLocal variables (common for security context, tenant ID, transaction context):
- Each of the 5 Quartz threads maintains its own ThreadLocal state
- If state is not cleared between employees, thread reuse could pollute state

Example: If employee A's `dutyActual` object is stored in ThreadLocal and not cleared before employee B is processed on the same thread, employee B might use employee A's data.

---

## HRD-006: Connection Pool Configuration

**Impact: MEDIUM-HIGH**

The Oracle JDBC connection pool (c3p0, DBCP, HikariCP) has settings:
- `minPoolSize`, `maxPoolSize`: affects how many parallel ATTLOGS queries can run
- `connectionTimeout`: if exceeded during batch, employees fail silently
- `idleConnectionTestPeriod`: if connections are validated differently, some queries might run against a recycled connection with different NLS settings

---

# PART 5 — REVERSE ENGINEERING BLIND SPOTS

## BS-001: Reflection-Based Method Invocation

Java reflection (`method.invoke(...)`) cannot be traced from static analysis.
If HIS uses a plugin or strategy pattern where the attendance calculation method is loaded by name:
```java
Class<?> cls = Class.forName("com.erp.attendance." + shiftType.getAlgorithm());
Method m = cls.getMethod("calculate", DutyActual.class);
m.invoke(instance, dutyActual);
```
Different shift types could use completely different algorithms.
Night shift, split shift, resident duty: each might have its own class loaded dynamically.
**We would have missed all of these classes.**

---

## BS-002: Dynamic SQL via Criteria API or String Concatenation

Named HQL queries in .hbm.xml are static. But HIS might also use:
- Hibernate Criteria API: SQL built at runtime from Java objects
- String concatenation: `"SELECT * FROM ATTLOGS WHERE EMPCODE='" + empCode + "'"`
- JPAQuery/QueryDSL: type-safe runtime queries

These produce SQL that doesn't appear as string constants in bytecode.
**We may have missed entire query paths.**

---

## BS-003: Hospital-Specific Patches (Custom Classes in Deployed WAR)

If the hospital has a customized HIS deployment:
- The deployed WAR might have additional classes not in the original JARs
- These classes might override or extend ProcessUploadService
- Custom night shift logic for rotating resident schedules
- Custom overtime calculations for nurses

**We analyzed only the JARs provided.** If the hospital has a custom /WEB-INF/classes directory, those classes were NOT analyzed.

---

## BS-004: XML-Driven Business Rules

HIS might load business rules from an XML configuration table:
```sql
SELECT rule_value FROM ATTENDANCE_RULES WHERE rule_name = 'NIGHT_SHIFT_CUTOFF_TYPE'
```
If `rule_value = 'SHIFT_END'` → cutoff = planned shift end
If `rule_value = 'NEXT_SHIFT_START'` → cutoff = next shift start

The hospital's specific configuration of this table determines which algorithm branch runs.
We have no visibility into ATTENDANCE_RULES or similar config tables.

---

## BS-005: AOP Transaction Boundaries

@Transactional is implemented via Spring AOP proxies.
These proxies are created at application startup, not visible in static bytecode analysis.
The ACTUAL transaction boundary might differ from what the original class defines if:
- A subclass overrides a method but doesn't re-annotate @Transactional
- The proxy is CGLIB-based vs. JDK-proxy-based (different behavior for self-invocation)
- Self-invocation within the same class bypasses the proxy (@Transactional self-call limitation)

Example: If processuploadpunchFromDB() calls updateAtual() on `this` (not via proxy):
- updateAtual()'s @Transactional is BYPASSED
- The transaction context is inherited from processuploadpunchFromDB()
- Or: NO transaction at all for individual employees

This is a known Spring AOP limitation. We do not know if HIS triggers it.

---

# PART 6 — CONTRADICTIONS BETWEEN REPORTS

## CONTRADICTION-001: Dedup Window Description

**Report A (FULL_HIS_ATTENDANCE_REVERSE_ENGINEERING.md):**
> "15-minute dedup window (punchinoutdifference15min=15)"

**Report B (HIS_VS_HDSP_GAP_ANALYSIS.md):**
> "GAP-01: 15-min dedup broken (Bug F-04, `_duplicateWindowSeconds` unused)"

**Report C (ATTENDANCE_EXECUTION_TRACE.md):**
> "diff < punchinoutdifference15min (15)" and then "DEDUP_WINDOW_SECONDS = 900"

**CONTRADICTION:** Report A says "15 minutes" and uses value 15. Report C says "900 seconds". These ARE the same value (15 min × 60 = 900s). But the UNIT DESCRIPTION differs. If someone reading Report A implements "15" as "15 seconds", they get a different result than someone reading "900 seconds."

**Also:** Report B says `_duplicateWindowSeconds` is "unused" — implying HDSP has this variable but doesn't use it. But if HIS uses 15 SECONDS (not minutes), then HDSP's 60-second window might already be adequate.

**Resolution needed:** Confirm whether HIS's '15' is minutes or seconds.

---

## CONTRADICTION-002: PMS Write Conditions

**SYMBOLIC_EXECUTION.md (Section 1.7):**
> "BRANCH-A: ATTENDANCE ∈ {PRESENT, MISSPUNCH, NOPUNCHNOLEAVE}? NO → RETURN without writing"
> (This says LEAVE, WEEOFF, etc. do NOT write PMS — as expected.)
> But then: "The condition for writing PMS is reconstructed. [INFERRED]"

**ATTENDANCE_REGRESSION_TEST_SPECIFICATION.md (TEST-111):**
> "Test B: MISSPUNCH → PMS row EXISTS (absent from HIS confirmation; INFERRED)"

**CONTRADICTION:** One report says MISSPUNCH writes PMS (as INFERRED behavior). Another marks this as unconfirmed. The confidence levels differ between reports without explicit resolution.

---

## CONTRADICTION-003: Night Shift D1 Batch Behavior

**REALTIME_MIGRATION_SCENARIO_ANALYSIS.md:**
> "HIS D1 batch at 01:00 D2: creates partial D1 record (MISSPUNCH or partial)"

**ATTENDANCE_EXECUTION_TRACE.md (S14):**
> "HIS: Jul-1 batch: checkForNightShiftNxtDay()... no OUT arrived yet → D1 = MISSPUNCH (temporary)"

**HIS_REALTIME_EQUIVALENCE_PROOF.md (EP-09):**
> "HIS D1 batch (01:00 D2): D2 ATTLOGS at 01:00 D2: empty (OUT at 01:01 not yet) → D1 = MISSPUNCH"

**APPARENT CONSISTENCY:** All three say D1 = MISSPUNCH when no D2 OUT exists at batch time. But:

**ATTACK:** Does HIS actually WRITE a DUTYACTUALVALUES record at D1 batch time with MISSPUNCH?
Or does it write a PARTIAL RECORD (EMPTY or NULL for ATT) specifically marked as "night shift, first day"?

If HIS writes ATT=NULL (not MISSPUNCH) for the D1 partial record, then D2 batch's UPDATE sets the ATT for the first time.
In this case: MISSPUNCH is NEVER written for D1 night shifts; only PRESENT or the D2 batch's final value.

If HIS writes ATT=MISSPUNCH at D1 time, then updates it at D2 time:
The intermediate state (D1 = MISSPUNCH for 24 hours) is what HDSP must also produce.

**CRITICAL for HDSP:** Which intermediate state is correct? MISSPUNCH (temporary) or NULL/EMPTY (partial)?

---

## CONTRADICTION-004: HDSP earlyGraceMinutes

**HIS_VS_HDSP_GAP_ANALYSIS.md:**
> "GAP-08: earlyGraceMinutes=120 (Bug F-13, should be 0)"

**REVERSE_ENGINEERING_CONFIDENCE_REPORT.md (C-051):**
> "HIS earlyGraceMinutes = 0 is INFERRED (no explicit config constant found saying 0)"

**CONTRADICTION:** Report 1 states confidently "should be 0". The confidence report reveals this is INFERRED with no bytecode evidence. The "should be 0" is an assumption about HIS behavior, not a verified fact.

**IMPLICATION:** If HIS earlyGraceMinutes = 15 (for example), HDSP's 120 is wrong but "fix to 0" is also wrong. Fix to 15 is required. We don't know the correct target value.

---

## CONTRADICTION-005: Transaction Scope Claims

**SYMBOLIC_EXECUTION.md (TX-1):**
> "If BOTH in same transaction... Crash between step 1 and step 5: Both rolled back → safe."
> "The actual transaction boundary is INFERRED... [INFERRED: per-DAO transactions — non-atomic]"

**HIS_REALTIME_EQUIVALENCE_PROOF.md (EP-18):**
> "HDSP night shift D2 OUT arrives: UPDATE D1 DUTYACTUALVALUES: ATT=PRESENT. Oracle timeout during UPDATE → failure → retry."

**CONTRADICTION:** Symbolic Execution says INFERRED non-atomic (per-DAO transactions). The Equivalence Proof discusses Oracle timeouts as if transactions are straightforward. Neither report acknowledges the uncertainty — the equivalence proof applies transaction failure analysis without stating that the transaction model is speculative.

---

# PART 7 — METHODOLOGY SELF-CRITIQUE

The core problem with all previous reports is what we will call the **Narrative Coherence Trap**:

When reverse engineering produces disconnected fragments (method names, SQL strings, config values), the analyst's mind naturally fills in the gaps to create a coherent narrative. The narrative FEELS verified because it fits perfectly. But the "fitting" is done by the analyst's domain knowledge, not by the evidence.

**Specific examples from our reports:**

1. We found `plannextin` and `lastoutnextday` in bytecode. We constructed an entire algorithm around these. The algorithm is LOGICALLY SOUND but we cannot confirm it matches actual code. We may have invented a plausible algorithm that produces similar outputs to HIS for 80% of cases but differs in critical edge cases.

2. We found `updateAtual` as a method name. We constructed a complete 10-branch priority tree. The tree is logically reasonable for an attendance engine. But HIS might implement it completely differently and still produce similar attendance codes for normal cases while diverging on simultaneous flags.

3. We described `getworkDuration()` as returning `[hours, minutes, seconds, "HH:mm" string]`. This is a plausible implementation but we saw only the method name and a format string. The actual return type and fields are unknown.

**The test:** If we implemented HDSP based solely on our reports and ran it against a real HIS for 1000 employees for one month, what percentage would diverge? We estimate:
- Normal employees (day shift, no edge cases): 92-95% match
- Night shift employees: 70-80% match (depends on boundary algorithm)
- Employees with simultaneous flags: 60-75% match (depends on priority order)
- Complex leave scenarios: 70-85% match

This is NOT production-grade confidence.
