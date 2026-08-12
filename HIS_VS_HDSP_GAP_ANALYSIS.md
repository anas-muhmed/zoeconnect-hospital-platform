# HIS vs HDSP GAP ANALYSIS

**Scope:** Side-by-side comparison of HIS legacy attendance batch vs. HDSP realtime attendance module  
**Date:** 2026-07-02  
**Reference:** HDSP Audit Report (14 findings) + HIS Reverse Engineering  

---

## 1. EXECUTIVE SUMMARY

HDSP replicates roughly 60–65% of HIS attendance logic. The remaining gaps fall into three categories:

- **Structural gaps** — logic that exists in HIS but has no equivalent in HDSP (e.g. split shifts, cross-day night shift linking, 15-minute deduplication)
- **Accuracy gaps** — logic exists in both but HDSP's implementation is incorrect or incomplete (e.g. late arrival/early departure calculation not propagated to Oracle, wrong ROWNUM ordering)
- **Semantic gaps** — HIS uses codes/fields that HDSP maps differently, risking data incompatibility if both systems write to the same Oracle schema

---

## 2. ARCHITECTURE COMPARISON

| Dimension | HIS | HDSP |
|---|---|---|
| Trigger | Quartz cron (01:00 daily) | Oracle poll every 1,500 ms (setInterval) |
| Processing model | Batch — all employees for one date | Event-driven — one punch at a time |
| Queue | None (synchronous Hibernate) | Bull/Redis queue, 5 retry attempts |
| Database | Oracle only | Oracle (HIS) + PostgreSQL (local state) |
| Lock mechanism | `update.lock.duty.roster.emtries` (DB lock) | None |
| Deduplication | 15-minute punch interval window | SHA-256 sourceId only (exact match) |
| Punch direction | Lowercase `'in'`/`'out'` from ATTLOGS | Normalised to uppercase IN/OUT |
| Status storage | DUTYACTUALVALUES.ATTENDANCE | DUTYACTUALVALUES (via Oracle MERGE) + local attendance_events |
| Audit trail | Hibernate Envers on domain entities | attendanceLogger structured JSON |
| Night shift | Full cross-day logic with CORRESPONDINGDUTYDAY | Not implemented |
| Split shift | Full second-shift column support | Not implemented |
| Half-day leave | LeaveSlot MORNING/AFTERNOON with SECOND_SHIFT_SLOT | Not implemented |
| Manual override detection | No mechanism (HIS owns all writes) | REMARKS column prefix check |

---

## 3. ATTENDANCE STATUS CODE MAPPING

### 3.1 HIS AttendanceType → HDSP DecisionStatus

| HIS Code | HDSP Code | Match? | Notes |
|---|---|---|---|
| `PRESENT` | `PRESENT` | ✅ Exact | |
| `MISSPUNCH` | `MISS_PUNCH` | ⚠️ Partial | HIS writes `MISSPUNCH` (no underscore); HDSP maps this correctly in `toHisStatus()` |
| `NOPUNCHNOLEAVE` | `NPNL` | ⚠️ Partial | HIS writes `NOPUNCHNOLEAVE`; HDSP maps to `NOPUNCHNOLEAVE` in `toHisStatus()` |
| `LEAVE` | `LEAVE` | ✅ Exact | |
| `PUBLICHOLLYDAY` | `HOLIDAY` | ⚠️ Partial | HIS writes `PUBLICHOLLYDAY`; HDSP maps correctly |
| `WEEOFF` | `WEEK_OFF` | ⚠️ Partial | HIS writes `WEEOFF`; HDSP maps correctly |
| `COMPENSATORYOFF` | ❌ MISSING | ❌ Gap | HDSP has no `COMPENSATORYOFF` decision status |
| `DUTYOFF` | ❌ MISSING | ❌ Gap | HDSP has no `DUTYOFF` decision status |
| `HALFDAYMORNING` | `HALF_DAY` | ⚠️ Partial | HDSP has single `HALF_DAY` — no morning/afternoon distinction |
| `HALFDAYAFTERNOON` | `HALF_DAY` | ⚠️ Partial | Same as above |
| `EMPTY` | `INVALID` | ⚠️ Semantic mismatch | Different meaning |
| ❌ HIS has none | `LATE_COMING` | N/A | HDSP-only code — HIS stores late diff in numeric columns, not attendance status |
| ❌ HIS has none | `EARLY_GOING` | N/A | HDSP-only code — same as above |
| ❌ HIS has none | `MISSING_IN` | N/A | HDSP distinguishes direction of miss punch; HIS does not |
| ❌ HIS has none | `MISSING_OUT` | N/A | Same as above |

> **Critical Finding:** HIS stores late arrival and early departure as **numeric differential columns** (`PUNCH_IN_DIFF_FIRSTSHIFT`, `PUNCH_OUT_DIFF_FIRSTSHIFT`) — never as an attendance code. HDSP uses `LATE_COMING` and `EARLY_GOING` as discrete attendance statuses. This creates an irreconcilable semantic difference if both systems write DUTYACTUALVALUES rows.

---

## 4. FEATURE MATRIX

### Legend: ✅ Implemented | ⚠️ Partial/Buggy | ❌ Missing

| Feature | HIS | HDSP | Gap Severity |
|---|---|---|---|
| **Core Punch Processing** | | | |
| Fetch raw punches from ATTLOGS | ✅ | ✅ | None |
| Sort punches chronologically | ✅ | ✅ | None |
| Identify first IN punch | ✅ MIN(logdatetime) WHERE DIR='in' | ✅ first item with direction IN | None |
| Identify last OUT punch | ✅ MAX(logdatetime) | ✅ last item with direction OUT | None |
| 15-minute duplicate deduplication | ✅ | ❌ | **HIGH** |
| Double-punch detection flag | ✅ doublePunch | ❌ | MEDIUM |
| **Roster / Plan Resolution** | | | |
| Fetch planned shift for date | ✅ DUTYPLANVALUES JOIN | ✅ DUTYPLANVALUES JOIN | None |
| Night shift detection | ✅ ShiftType.IS_NIGHT | ✅ attendance.shift.isNight | None |
| Week off detection | ✅ ShiftType.ISWEEKOFF | ✅ | None |
| Holiday detection | ✅ ShiftType.NATIONAL_HOLIDAY | ✅ | None |
| Compensatory off detection | ✅ ShiftType.COMPENSATORY | ❌ | **HIGH** |
| Duty off detection | ✅ ShiftType.DUTYOFF | ❌ | **HIGH** |
| Call duty detection | ✅ ShiftType.CALLDUTY | ❌ | MEDIUM |
| Permission shift detection | ✅ ShiftType.PERMISSIONSHIFT | ❌ | LOW |
| Split shift (second shift) | ✅ ShiftType.ISSPLITSHIFT | ❌ | **HIGH** |
| Night off detection | ✅ ShiftType.NIGHTOFF | ❌ | MEDIUM |
| **Leave Handling** | | | |
| Approved full-day leave | ✅ APPLIEDLEAVES check | ✅ | None |
| Half-day leave (MORNING slot) | ✅ LeaveSlot.MORNING | ❌ | **HIGH** |
| Half-day leave (AFTERNOON slot) | ✅ LeaveSlot.AFTERNOON | ❌ | **HIGH** |
| Leave type → shift type resolution | ✅ checkLeaveApprovedShift() | ⚠️ Basic leave flag only | MEDIUM |
| Leave rejection reprocessing | ✅ processuploadpunchFromDBForLeaveRejection | ❌ | MEDIUM |
| **Attendance Decision** | | | |
| PRESENT (both punches) | ✅ | ✅ | None |
| MISSPUNCH (single punch) | ✅ | ⚠️ HDSP distinguishes MISSING_IN/OUT | Semantic difference |
| NOPUNCHNOLEAVE (no punches) | ✅ | ✅ NPNL | None |
| Single punch allowed for night shift | ✅ allowSinglePunchForNightShift | ❌ | **HIGH** |
| COMPENSATORYOFF status | ✅ | ❌ | **HIGH** |
| DUTYOFF status | ✅ | ❌ | **HIGH** |
| HALFDAYMORNING / HALFDAYAFTERNOON | ✅ | ⚠️ single HALF_DAY only | **HIGH** |
| **Duration & Differential Calculations** | | | |
| Work duration (hours:minutes) | ✅ getworkDuration() | ✅ Duration.between() | None |
| Duration stored as float hours | ✅ DURATION Float | ✅ | None |
| Duration stored as integer minutes | ✅ DURATIONINMINUTES | ✅ | None |
| Late arrival differential (hours+min) | ✅ settimediffIn() | ⚠️ calculated but NOT written to Oracle | **HIGH** |
| Early departure differential (hours+min) | ✅ settimediffOut() | ⚠️ calculated but NOT written to Oracle | **HIGH** |
| PUNCH_IN_DIFF_FIRSTSHIFT column | ✅ | ❌ not in HDSP MERGE | **HIGH** |
| PUNCH_OUT_DIFF_FIRSTSHIFT column | ✅ | ❌ not in HDSP MERGE | **HIGH** |
| PUNCH_IN_DIFF_FIRST_HOUR/MIN | ✅ | ❌ | **HIGH** |
| PUNCH_OUT_DIFF_FIRST_Hour/MIN | ✅ | ❌ | **HIGH** |
| Second shift differentials | ✅ | ❌ | MEDIUM |
| **Night Shift Cross-Day** | | | |
| isFirstDay flag | ✅ | ❌ | **CRITICAL** |
| CORRESPONDINGDUTYDAY linkage | ✅ | ❌ | **CRITICAL** |
| leaveToNight transition | ✅ | ❌ | **HIGH** |
| dayToNight transition | ✅ | ❌ | **HIGH** |
| Month boundary night shift | ✅ fromLastMonLastDate | ❌ | **HIGH** |
| Cross-day duration aggregation | ✅ | ❌ | **CRITICAL** |
| **PunchingMaster (PMS)** | | | |
| Write to PMS_PUNCHINGMASTER | ✅ savepunchingmaster() | ❌ | **HIGH** |
| Link PunchingMaster → DutyActual | ✅ ACTUALVALUE FK | ❌ | **HIGH** |
| Manual punch in/out fields | ✅ MANUALPUNCHINDATETIME | ❌ | LOW |
| **Data Safety** | | | |
| DB lock during processing | ✅ 23:00–03:00 lock | ❌ | **HIGH** |
| Pre-reset actuals before batch | ✅ 00:50 reset job | ❌ | MEDIUM |
| Guard: reject duplicate upload | ✅ find.fileisalreadyupload | N/A (realtime is idempotent) | None |
| **Payroll Integration** | | | |
| Grant total hours update | ✅ updateactualGrantTotalHours | ❌ | MEDIUM |
| Salary item override | ✅ saveOverRideDetails | ❌ | LOW |
| Leave-to-payroll integration | ✅ LOP entries, holiday allowance | ❌ | MEDIUM |

---

## 5. CRITICAL GAPS — DETAILED ANALYSIS

### GAP-01: 15-Minute Punch Deduplication ❌ CRITICAL

**HIS:** Filters consecutive punches within 15 minutes as duplicates (`punchinoutdifference15min`). Without this, a single employee tapping a reader multiple times generates spurious punches that corrupt IN/OUT detection.

**HDSP:** Deduplication uses SHA-256 sourceId (exact millisecond match only). `duplicateWindowSeconds=60` exists in config but `_duplicateWindowSeconds` parameter in `evaluate()` is prefixed with underscore and unused (Bug F-04). The `removeDuplicates()` method only catches identical millisecond+direction — it will not catch real-world near-duplicate punches.

**Impact:** HDSP will process every tap as a separate event. An employee tapping 3 times within 10 seconds (common) will generate 3 events. The decision engine may pick the wrong first IN or last OUT, corrupting FROMDATETIME/TODATETIME.

**Fix:** In `removeDuplicates()`, compare consecutive punches' timestamps within `duplicateWindowSeconds` window (same direction). Use `_duplicateWindowSeconds` parameter that is already declared but unused.

---

### GAP-02: Late Arrival / Early Departure Differentials Not Written to Oracle ❌ HIGH

**HIS:** Writes 8 numeric columns to DUTYACTUALVALUES for every PRESENT record:
- `PUNCH_IN_DIFF_FIRSTSHIFT` (float), `PUNCH_IN_DIFF_FIRST_HOUR`, `PUNCH_IN_DIFF_FIRST_MIN`
- `PUNCH_OUT_DIFF_FIRSTSHIFT` (float), `PUNCH_OUT_DIFF_FIRST_Hour`, `PUNCH_OUT_DIFF_FIRST_MIN`

These are used by payroll to calculate late deductions.

**HDSP:** `duty-actual-updater.service.ts` MERGE statement does not include any of these 6 columns. HDSP calculates whether an employee is `LATE_COMING` or `EARLY_GOING` as an attendance *status* rather than writing differentials as *numeric columns*.

**Impact:** Payroll cannot calculate late deductions from HDSP-written records. If a record shows `PRESENT` with no differential columns, payroll treats it as a full-pay day even if the employee arrived 2 hours late.

**Fix:** Add late/early differential calculation (analogous to `settimediffIn`/`settimediffOut`) and include all 6 differential columns in the Oracle MERGE statement.

---

### GAP-03: Night Shift Cross-Day Logic Absent ❌ CRITICAL

**HIS:** Night shifts spanning two calendar dates create two linked DUTYACTUALVALUES rows via `CORRESPONDINGDUTYDAY`. Day 1 record has FROMDATETIME but no TODATETIME. Day 2 record completes Day 1 with the OUT punch and sets total duration. `isFirstDay` flag tracks which pass is being executed.

**HDSP:** No concept of `CORRESPONDINGDUTYDAY`. Each punch event is processed independently. A night shift employee who punches in at 22:00 on Monday and out at 06:00 on Tuesday will generate two unrelated events — Monday's event has no OUT, Tuesday's has no IN — both get `MISS_PUNCH` instead of `PRESENT`.

**Impact:** All night shift employees will show MISS_PUNCH for every shift. For hospital environments (nursing staff), this likely affects a large proportion of the workforce.

**Fix:** Implement cross-day window detection: when an IN punch exists on date D but no OUT punch, check for an OUT punch on date D+1 within a configured overnight window. Link the two DUTYACTUALVALUES records via CORRESPONDINGDUTYDAY.

---

### GAP-04: COMPENSATORYOFF and DUTYOFF Not Implemented ❌ HIGH

**HIS:** `ShiftType` has `COMPENSATORY` and `DUTYOFF` boolean flags. When these are set, the attendance code becomes `COMPENSATORYOFF` or `DUTYOFF` respectively regardless of punches.

**HDSP:** `roster-resolver.service.ts` fetches SHIFT_TYPE columns but `shift-rule-engine.service.ts` has no logic for compensatory or duty-off. These employees will get `PRESENT`/`MISS_PUNCH`/`NPNL` instead of the correct code, potentially causing payroll to not credit their compensatory leave day.

**Fix:** Add `isCompensatory` and `isDutyOff` to HDSP's RosterResult type and handle in `attendance-decision-engine.service.ts` before evaluating punches.

---

### GAP-05: Split Shift Not Implemented ❌ HIGH

**HIS:** `ShiftType.ISSPLITSHIFT` triggers second-shift processing. DUTYACTUALVALUES stores a second set of timing columns (`SECONDFROM_DATETIME`, `SECONDTO_DATETIME`, etc.). Employees working a morning + evening split shift get both periods recorded and total duration aggregated.

**HDSP:** No awareness of split shifts. An employee working 08:00–12:00 and 14:00–18:00 would have all 4 punches in ATTLOGS. HDSP would take the first IN (08:00) and last OUT (18:00) and report 10 hours duration — including the 2-hour break as work time.

**Fix:** Detect `ISSPLITSHIFT` on the shift type, group punches into two windows, and populate secondary columns in the MERGE statement.

---

### GAP-06: Half-Day Leave Resolution ❌ HIGH

**HIS:** `LeaveSlot` enum (`FULLDAY`, `MORNING`, `AFTERNOON`) is stored in `SECOND_SHIFT_SLOT`. For half-day leave, HDSP must set `SECOND_SHIFT_SLOT` and process the other half as a normal work period.

**HDSP:** `HALF_DAY` is a single decision status with no slot distinction. No `SECOND_SHIFT_SLOT` written. If an employee is on MORNING leave and works the afternoon, HDSP may classify them based purely on punch timing, potentially showing `MISS_PUNCH`.

**Fix:** Read `LEAVESLOT` from `EMPLOYEELEAVELIST` and set `secondShiftSlot` accordingly. Handle the non-leave half as a normal punch window.

---

### GAP-07: PMS_PUNCHINGMASTER Not Written ❌ HIGH

**HIS:** Every processed employee gets a record in `PMS_PUNCHINGMASTER` (via `savepunchingmaster()`). This table is the payroll system's authoritative view of attendance. Payroll reads `PunchingMaster.PUNCH_IN_DATETIME` / `PUNCH_OUT_DATETIME` for salary computation — not `DUTYACTUALVALUES`.

**HDSP:** Only writes to `DUTYACTUALVALUES`. No writes to `PMS_PUNCHINGMASTER`. If payroll processes run during the month and reads from `PMS_PUNCHINGMASTER`, HDSP-processed employees will have no payroll input data.

**Fix:** After writing `DUTYACTUALVALUES`, also INSERT/MERGE into `PMS_PUNCHINGMASTER` with the same punch summary data. Link via `ACTUALVALUE` FK.

---

### GAP-08: earlyGraceMinutes Default Misconfiguration ⚠️ HIGH (HDSP Bug F-13)

**HIS:** No grace period concept in the codebase — HIS calculates the exact differential and payroll decides the deduction.

**HDSP:** `DEFAULT_ATTENDANCE_RULES.earlyGraceMinutes = 120` (2 hours). This means an employee arriving up to 2 hours early is not flagged as early. This is clearly a data-entry error for a default that should likely be 0 or 5 minutes.

**Impact:** All employees arriving up to 2 hours before their shift start time generate zero `EARLY_GOING` penalty, erasing early detection entirely.

**Fix:** Change `earlyGraceMinutes` default to `0`. Move grace configuration to runtime environment variables and document the values.

---

### GAP-09: QUEUED Status Not Persisted ⚠️ MEDIUM (HDSP Bug F-03)

**HIS:** N/A (no queue).

**HDSP:** `attendance-listener.service.ts` sets `event.status = 'QUEUED'` in memory but never calls `eventRepo.save(event)`. Events transition directly from `NEW` to `PROCESSING` in the DB, skipping `QUEUED`.

**Impact:** Monitoring dashboards that query `attendance_events WHERE status='QUEUED'` will always return 0. Operational visibility is impaired.

---

### GAP-10: Initial Cursor Hardcode ⚠️ HIGH (HDSP Bug F-05)

**HIS:** N/A (processes by calendar date, no cursor concept).

**HDSP:** `oracle-polling.service.ts` hardcodes `const initial = new Date("2026-06-28T00:00:00.000Z")`. After first deployment, this was likely set to a project milestone date. After Redis restart or new deployment to a different environment, polling restarts from 2026-06-28 — potentially reprocessing weeks of data or skipping recent data.

**Fix:** On first startup, set cursor to `NOW() - configurable_lookback_hours`. Document and move to environment variable.

---

## 6. HDSP-SPECIFIC FEATURES NOT IN HIS

HDSP has invented capabilities that HIS does not have. These should be preserved:

| Feature | HDSP Implementation | Value |
|---|---|---|
| Realtime processing (sub-2s latency) | setInterval 1,500ms Oracle poll | Core HDSP value proposition |
| Local event log | `attendance_events` PostgreSQL table | Full audit trail with statuses |
| Manual override detection | REMARKS prefix `"HDSP realtime:"` | Prevents overwriting manual HR adjustments |
| Structured logging | `AttendanceStructuredLogger` JSON | Production observability |
| Dead-letter queue | Bull queue, 5 retries → `DEAD_LETTER` | Fault tolerance |
| Night reconciliation job | `NightReconciliationJob` at 01:30 | Safety net for missed events |
| SHA-256 idempotency | sourceId dedup | Prevents double-processing |
| MISSING_IN / MISSING_OUT distinction | DecisionStatus | Better granularity than HIS MISSPUNCH |
| LATE_COMING / EARLY_GOING as status | DecisionStatus | Easier reporting vs numeric columns |

---

## 7. IMPLEMENTATION PRIORITY MATRIX

| Priority | Gap | Effort | Payroll Impact | Employee Impact |
|---|---|---|---|---|
| 🔴 P0 | Night shift cross-day logic (GAP-03) | HIGH | HIGH | CRITICAL |
| 🔴 P0 | Late/early differential columns to Oracle (GAP-02) | MEDIUM | HIGH | HIGH |
| 🔴 P0 | 15-minute punch deduplication (GAP-01) | LOW | HIGH | HIGH |
| 🔴 P0 | PMS_PUNCHINGMASTER writes (GAP-07) | MEDIUM | HIGH | NONE |
| 🟠 P1 | COMPENSATORYOFF / DUTYOFF statuses (GAP-04) | LOW | HIGH | HIGH |
| 🟠 P1 | Half-day leave slots (GAP-06) | MEDIUM | MEDIUM | HIGH |
| 🟠 P1 | Fix earlyGraceMinutes default (GAP-08) | LOW | MEDIUM | HIGH |
| 🟠 P1 | Split shift second-period support (GAP-05) | HIGH | HIGH | MEDIUM |
| 🟡 P2 | Fix QUEUED status persist (GAP-09) | LOW | NONE | NONE |
| 🟡 P2 | Fix initial cursor hardcode (GAP-10) | LOW | NONE | NONE |
| 🟡 P2 | CALLDUTY / PERMISSIONSHIFT shift types | MEDIUM | LOW | MEDIUM |
| 🟢 P3 | Grant total hours update | MEDIUM | MEDIUM | NONE |
| 🟢 P3 | Leave rejection reprocessing | HIGH | LOW | LOW |
| 🟢 P3 | Manual punch in/out fields in PUNCHINGMASTER | LOW | LOW | LOW |

---

## 8. DATA COMPATIBILITY RISK

If HIS batch AND HDSP both write to the same Oracle schema concurrently:

| Risk | Severity | Mitigation |
|---|---|---|
| HIS pre-reset at 00:50 wipes HDSP's realtime writes for today | **CRITICAL** | Disable HIS `dailyactualsUpdateCron` or coordinate window |
| HIS locks DUTYPLANVALUES at 23:00 — HDSP cannot read roster | HIGH | Implement read-only retry on HDSP side during lock window |
| HIS `CORRESPONDINGDUTYDAY` links require both records to exist | HIGH | HDSP must write both records in the same transaction |
| HDSP's REMARKS prefix may be overwritten by HIS batch | MEDIUM | HIS writes null REMARKS for computed records |
| HDSP status codes (`LATE_COMING`, `EARLY_GOING`) not valid in HIS | MEDIUM | `toHisStatus()` already maps these — verify mapping exhaustive |
| Both systems inserting to PMS_PUNCHINGMASTER same sequence | HIGH | Coordinate sequence usage or use different ranges |

---

*End of HIS_VS_HDSP_GAP_ANALYSIS.md*
