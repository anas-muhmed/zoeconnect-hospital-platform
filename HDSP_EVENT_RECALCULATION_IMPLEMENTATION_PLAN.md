# HDSP EVENT RECALCULATION IMPLEMENTATION PLAN
## Integrating DutyPlanValues Events into the Realtime Attendance Architecture

---

# PART 10 — ARCHITECTURAL EVOLUTION

## 10.1 Current Architecture (Punch Engine)

```
Current HDSP Flow:
  Oracle ATTLOGS
       │
       ▼ (poll every 1500ms)
  AttlogsPoller
       │
       ▼
  PunchEvent → Bull Queue → AttendanceWorker
                                    │
                                    ▼
                           Attendance Decision
                           (requires DutyPlan now,
                            returns NOPLANSHIFT if absent)
                                    │
                                    ▼
                           DUTYACTUALVALUES (Oracle)
```

**Current limitations:**
- Single event source (ATTLOGS only)
- DutyPlan absence → permanent NOPLANSHIFT (no recovery)
- No event-driven recalculation (changes to Leave, Holiday, DutyPlan have no effect)
- No provisional states
- No cutoff awareness

---

## 10.2 Target Architecture (Dependency-Driven Engine)

```
Target HDSP Flow:

EVENT SOURCES:
  Oracle ATTLOGS          ──poll 1500ms──►  PunchEvent
  Oracle DUTYPLANVALUES   ──poll 30s─────►  DutyPlanEvent
  Oracle EMPLOYEELEAVELIST──poll 60s─────►  LeaveEvent
  Oracle HOLIDAY_MASTER   ──poll 300s────►  HolidayEvent
  Oracle SHIFTTYPE        ──poll 300s────►  ShiftTypeEvent
  Internal Timer          ──cron─────────►  CutoffEvent / NightShiftCutoffEvent
  Internal Timer          ──cron─────────►  ReconciliationEvent

         │ (all events)
         ▼
  EventRouter
         │
    ┌────┼─────────┐
    ▼    ▼         ▼
 IMMED BATCH  RECONCILE
 Queue  Queue  Queue
    │    │         │
    └────┼─────────┘
         ▼
  RecalculationEngine
         │
    ┌────┼────────────────────┐
    ▼    ▼                    ▼
  Check Check             Check
  Payroll Manual           Gate
  Lock  Correction        States
    │         │               │
    └─────────┼───────────────┘
              ▼
      Attendance Decision
      (loads ALL dependencies)
              │
    ┌─────────┼──────────────┐
    ▼         ▼              ▼
  Oracle    Oracle     PostgreSQL
  DUTYACT   PMS_PMS    hdsp_attendance
  UALVALUES PUNCHINGM  (HDSP own state)
            ASTER
              │
              ▼
       CompensationEvents
       → downstream consumers
         (alerts, reporting, payroll)
```

---

# NEW COMPONENTS

## NC-001: DutyPlanPoller

**File:** `src/pollers/duty-plan.poller.ts`

**Purpose:** Detect INSERT, UPDATE, DELETE events on DUTYPLANVALUES.

**Challenge:** Oracle does not have a built-in change notification that's straightforward to poll. Three approaches:

### Approach A: LAST_MODIFIED_DATE column (preferred if column exists)
```typescript
@Injectable()
export class DutyPlanPoller {
  private lastPollTime: Date = new Date(0);

  async poll(): Promise<void> {
    const changed = await this.oracleDataSource.query(`
      SELECT EMPCODE, ACTUALDATE, LAST_MODIFIED_DATE,
             CASE WHEN INSERT_DATE >= :lastPoll THEN 'INSERT'
                  WHEN LAST_MODIFIED_DATE >= :lastPoll THEN 'UPDATE'
                  ELSE 'UPDATE'
             END AS change_type
      FROM DUTYPLANVALUES
      WHERE LAST_MODIFIED_DATE >= :lastPoll
         OR INSERT_DATE >= :lastPoll
      ORDER BY LEAST(INSERT_DATE, LAST_MODIFIED_DATE) ASC
    `, [this.lastPollTime, this.lastPollTime]);

    for (const row of changed) {
      await this.eventQueue.add('duty-plan-event', {
        empCode: row.EMPCODE,
        date: row.ACTUALDATE,
        changeType: row.change_type,
      }, { priority: 1 }); // HIGH priority
    }

    if (changed.length > 0) {
      this.lastPollTime = new Date(); // advance cursor
    }
  }
}
```

### Approach B: Snapshot comparison (if no LAST_MODIFIED_DATE column)
```typescript
// Store SHA256 of DUTYPLANVALUES row in PostgreSQL hdsp_duty_plan_snapshot
// Poll: compute current SHA256; compare with stored; detect changes
// More expensive (fetches all records for comparison) — use only as fallback
```

### Approach C: Oracle DBMS_CHANGE_NOTIFICATION (most reliable, requires DBA)
```
-- DBA runs once:
EXEC DBMS_CHANGE_NOTIFICATION.ENABLE_TABLE_DETECTION(
  'HIS_SCHEMA.DUTYPLANVALUES',
  :notification_handler
);
-- HDSP listens via JDBC ChangeNotificationListener
```

**Polling interval:** 30 seconds (balance between responsiveness and DB load)

**DELETE detection problem:** If a record is DELETED, it's gone from DUTYPLANVALUES. Approach A and B both miss this because there's nothing to query.

**DELETE detection solution:**
```typescript
// In PostgreSQL hdsp_duty_plan_cache:
// Store empCode + date of all known DutyPlanValues
// Each poll: compare current DUTYPLANVALUES with cache
// Records in cache but not in current query → DELETED

interface DutyPlanCacheEntry {
  empCode: string;
  date: Date;
  snapshotHash: string;
  lastSeenAt: Date;
}
```

---

## NC-002: LeavePoller

**File:** `src/pollers/leave.poller.ts`

**Purpose:** Detect INSERT and UPDATE on EMPLOYEELEAVELIST (specifically status changes: PENDING→APPROVED, APPROVED→CANCELLED).

```typescript
@Injectable()
export class LeavePoller {
  async poll(): Promise<void> {
    const changed = await this.oracleDataSource.query(`
      SELECT EMPCODE, FROMDATE, TODATE, STATUS, LEAVETYPE, LEAVEDAYS,
             LAST_MODIFIED_DATE
      FROM EMPLOYEELEAVELIST
      WHERE LAST_MODIFIED_DATE >= :lastPoll
        AND STATUS IN ('APPROVED', 'CANCELLED', 'REJECTED')
      ORDER BY LAST_MODIFIED_DATE ASC
    `, [this.lastPollTime]);

    for (const row of changed) {
      // Generate one event per date in the leave range
      const dates = eachDayOfInterval({ start: row.FROMDATE, end: row.TODATE });
      for (const date of dates) {
        await this.eventQueue.add('leave-event', {
          empCode: row.EMPCODE,
          date: date,
          status: row.STATUS,
          leaveType: row.LEAVETYPE,
        }, { priority: 2 }); // MEDIUM priority
      }
    }
  }
}
```

**Polling interval:** 60 seconds (leave approvals are less time-critical than punches)

---

## NC-003: HolidayPoller

**File:** `src/pollers/holiday.poller.ts`

**Purpose:** Detect new holiday declarations or cancellations.

```typescript
@Injectable()
export class HolidayPoller {
  async poll(): Promise<void> {
    const changed = await this.oracleDataSource.query(`
      SELECT HOLIDAY_DATE, HOLIDAY_NAME, STATUS, LAST_MODIFIED_DATE
      FROM HOLIDAY_MASTER
      WHERE LAST_MODIFIED_DATE >= :lastPoll
    `, [this.lastPollTime]);

    for (const row of changed) {
      await this.eventQueue.add('holiday-event', {
        date: row.HOLIDAY_DATE,
        holidayName: row.HOLIDAY_NAME,
        status: row.STATUS, // 'DECLARED' or 'CANCELLED'
      }, {
        priority: 3,     // LOW priority
        delay: 60000,    // 1 minute delay: prevent thundering herd on all employees
      });
    }
  }
}
```

**Polling interval:** 300 seconds (5 minutes — holidays are rarely declared intraday)

---

## NC-004: CutoffTimerService

**File:** `src/services/cutoff-timer.service.ts`

**Purpose:** At configured cutoff times, finalize all provisional attendance states.

```typescript
@Injectable()
export class CutoffTimerService implements OnModuleInit {
  onModuleInit() {
    // Schedule cutoff jobs using Bull's cron support
    this.recalculationQueue.add(
      'cutoff-finalize',
      { reason: 'DUTY_PLAN_CUTOFF', date: 'today' },
      {
        repeat: { cron: this.config.dutyPlanCutoffCron }, // default: "0 21 * * *"
        jobId: 'daily-cutoff-finalizer',
      }
    );

    this.recalculationQueue.add(
      'batch-lock',
      { reason: 'BATCH_LOCK', date: 'today' },
      {
        repeat: { cron: this.config.batchLockCron }, // default: "0 23 * * *"
        jobId: 'daily-batch-locker',
      }
    );

    this.recalculationQueue.add(
      'batch-reconcile',
      { reason: 'BATCH_RECONCILE', date: 'yesterday' },
      {
        repeat: { cron: this.config.batchReconcileCron }, // default: "30 3 * * *"
        jobId: 'daily-reconciler',
      }
    );
  }
}
```

**Cutoff finalization logic:**
```typescript
async finalizeCutoff(date: Date): Promise<void> {
  // Find all employees with WAITING_FOR_DUTY_PLAN for this date
  const waiting = await this.hdspAttendanceRepo.findBy({
    date: date,
    status: ProvisionalStatus.WAITING_FOR_DUTY_PLAN,
  });

  for (const record of waiting) {
    await this.updateAttendance(record.empCode, date, {
      attendance: AttendanceCode.NOPLANSHIFT,
      reason: 'CUTOFF_REACHED_NO_DUTY_PLAN',
      provisional: false,  // FINAL
    });

    await this.alertService.send({
      type: 'NOPLANSHIFT_FINALIZED',
      empCode: record.empCode,
      date: date,
      message: `No duty plan assigned before cutoff (${this.config.dutyPlanCutoffTime}). Attendance finalized as NOPLANSHIFT.`,
    });
  }
}
```

---

## NC-005: RecalculationEngine

**File:** `src/engine/recalculation.engine.ts`

**Purpose:** The core attendance computation unit. Loads all dependencies and runs the HIS-equivalent decision algorithm.

```typescript
@Injectable()
export class RecalculationEngine {

  async recalculate(empCode: string, date: Date, triggeredBy: string): Promise<RecalculationResult> {

    // GATE 1: Payroll lock
    if (await this.payrollLockService.isLocked(date)) {
      return { outcome: 'BLOCKED', reason: 'PAYROLL_LOCKED' };
    }

    // GATE 2: Manual correction lock
    const manualLock = await this.manualCorrectionService.isLocked(empCode, date);
    if (manualLock) {
      return { outcome: 'BLOCKED', reason: 'MANUALLY_CORRECTED' };
    }

    // GATE 3: Batch lock window (23:00-03:30)
    if (this.cutoffService.isBatchLockWindow()) {
      return { outcome: 'DEFERRED', reason: 'BATCH_LOCK_WINDOW' };
    }

    // Load all dependencies in parallel
    const [punches, dutyPlan, leaves, holiday, compensatory] = await Promise.all([
      this.attlogsRepo.findByEmpAndDate(empCode, date),
      this.dutyPlanRepo.findByEmpAndDate(empCode, date),
      this.leaveRepo.findApprovedForDate(empCode, date),
      this.holidayRepo.findByDate(date),
      this.compensatoryRepo.findByEmpAndDate(empCode, date),
    ]);

    // Load night shift context if applicable
    let nightShiftContext: NightShiftContext | null = null;
    if (dutyPlan?.isNight) {
      nightShiftContext = await this.loadNightShiftContext(empCode, date, dutyPlan);
    }

    // PROVISIONAL STATE: DutyPlan missing
    if (!dutyPlan) {
      const isBefore Cutoff = this.cutoffService.isBeforeCutoff();
      if (isBeforeCutoff) {
        return await this.setProvisionalState(empCode, date, ProvisionalStatus.WAITING_FOR_DUTY_PLAN, punches);
      } else {
        return await this.finalizeAs(empCode, date, AttendanceCode.NOPLANSHIFT);
      }
    }

    // Run HIS-equivalent decision algorithm
    const decision = this.attendanceDecisionService.decide({
      punches,
      dutyPlan,
      leaves,
      holiday,
      compensatory,
      nightShiftContext,
    });

    // Compare with existing
    const existing = await this.dutyActualRepo.findByEmpAndDate(empCode, date);
    if (existing && this.decisionsEqual(existing, decision)) {
      return { outcome: 'NO_CHANGE' };
    }

    // Apply change
    await this.applyDecision(empCode, date, decision, triggeredBy);

    return { outcome: 'CHANGED', previous: existing, current: decision };
  }
}
```

---

# NEW DATABASE TABLES

## DB-001: hdsp_duty_plan_cache (PostgreSQL)

```sql
CREATE TABLE hdsp_duty_plan_cache (
  id            BIGSERIAL PRIMARY KEY,
  emp_code      VARCHAR(50) NOT NULL,
  actual_date   DATE NOT NULL,
  shift_type_id VARCHAR(50),
  snapshot_hash VARCHAR(64) NOT NULL,  -- SHA256 of key fields
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (emp_code, actual_date)
);
CREATE INDEX idx_duty_plan_cache_date ON hdsp_duty_plan_cache (actual_date);
```

**Purpose:** Track which DutyPlan records exist in HIS Oracle. Used to detect DELETEs (record exists in cache but not in Oracle → deleted).

---

## DB-002: hdsp_attendance_state (PostgreSQL)

```sql
CREATE TABLE hdsp_attendance_state (
  id                  BIGSERIAL PRIMARY KEY,
  emp_code            VARCHAR(50) NOT NULL,
  actual_date         DATE NOT NULL,
  attendance_code     VARCHAR(50) NOT NULL,         -- final or provisional code
  provisional_state   VARCHAR(50),                  -- WAITING_FOR_DUTY_PLAN etc.
  is_provisional      BOOLEAN NOT NULL DEFAULT TRUE,
  is_payroll_locked   BOOLEAN NOT NULL DEFAULT FALSE,
  is_manually_locked  BOOLEAN NOT NULL DEFAULT FALSE,
  from_time           TIMESTAMPTZ,
  to_time             TIMESTAMPTZ,
  work_hours          VARCHAR(10),
  diff_in_minutes     INTEGER,                      -- timediffIn
  diff_out_minutes    INTEGER,                      -- timediffOut
  triggered_by        VARCHAR(100),                 -- event that triggered last calc
  recalculated_at     TIMESTAMPTZ,
  reconciled_with_his BOOLEAN NOT NULL DEFAULT FALSE,
  his_attendance_code VARCHAR(50),                  -- what HIS wrote (from reconciliation)
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (emp_code, actual_date)
);
CREATE INDEX idx_attendance_state_date ON hdsp_attendance_state (actual_date);
CREATE INDEX idx_attendance_state_provisional ON hdsp_attendance_state (is_provisional, actual_date)
  WHERE is_provisional = TRUE;
```

**Purpose:** HDSP's own record of attendance decisions. Separate from Oracle DUTYACTUALVALUES. Allows HDSP to track provisional states without polluting HIS Oracle data.

---

## DB-003: hdsp_recalculation_log (PostgreSQL)

```sql
CREATE TABLE hdsp_recalculation_log (
  id              BIGSERIAL PRIMARY KEY,
  emp_code        VARCHAR(50) NOT NULL,
  actual_date     DATE NOT NULL,
  trigger_event   VARCHAR(100) NOT NULL,  -- 'DUTY_PLAN_CREATED', 'PUNCH_IN', etc.
  trigger_data    JSONB,                   -- event payload
  previous_state  JSONB,                   -- attendance before recalculation
  new_state       JSONB,                   -- attendance after recalculation
  outcome         VARCHAR(20) NOT NULL,    -- 'CHANGED', 'NO_CHANGE', 'BLOCKED', 'FAILED'
  blocked_reason  VARCHAR(100),            -- if BLOCKED: PAYROLL_LOCKED, MANUALLY_CORRECTED
  duration_ms     INTEGER,                 -- processing time
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_recalc_log_emp_date ON hdsp_recalculation_log (emp_code, actual_date);
CREATE INDEX idx_recalc_log_date ON hdsp_recalculation_log (actual_date);
CREATE INDEX idx_recalc_log_created ON hdsp_recalculation_log (created_at);
```

**Purpose:** Full audit trail of every recalculation. Enables debugging attendance history. Enables divergence analysis.

---

## DB-004: hdsp_dependency_snapshot (PostgreSQL)

```sql
CREATE TABLE hdsp_dependency_snapshot (
  id              BIGSERIAL PRIMARY KEY,
  emp_code        VARCHAR(50) NOT NULL,
  actual_date     DATE NOT NULL,
  dependency_type VARCHAR(50) NOT NULL,  -- 'DUTY_PLAN', 'LEAVE', 'HOLIDAY', 'PUNCH'
  snapshot_data   JSONB NOT NULL,         -- full dependency state at last recalc
  snapshot_hash   VARCHAR(64) NOT NULL,
  captured_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (emp_code, actual_date, dependency_type)
);
```

**Purpose:** Records what the attendance engine "saw" when it made its last decision. Enables reproducible recalculation and root cause analysis for divergences.

---

## DB-005: hdsp_payroll_lock (PostgreSQL)

```sql
CREATE TABLE hdsp_payroll_lock (
  id           BIGSERIAL PRIMARY KEY,
  period_year  INTEGER NOT NULL,
  period_month INTEGER NOT NULL,
  locked_at    TIMESTAMPTZ NOT NULL,
  locked_by    VARCHAR(100) NOT NULL,
  unlocked_at  TIMESTAMPTZ,
  unlocked_by  VARCHAR(100),
  UNIQUE (period_year, period_month)
);
```

**Purpose:** Track payroll lock status per period. Used by RecalculationEngine to gate attendance changes.

---

# NEW SERVICES

## SVC-001: AttendanceDecisionService (evolution of existing)

**File:** `src/services/attendance-decision.service.ts`

This service encapsulates the HIS-equivalent decision algorithm. Key changes from current implementation:

```typescript
interface AttendanceDecisionInput {
  punches: AttLog[];
  dutyPlan: DutyPlanValues | null;      // null = not assigned
  leaves: LeaveRecord[];
  holiday: HolidayRecord | null;
  compensatory: CompensatoryRecord | null;
  nightShiftContext?: NightShiftContext;  // D-1 and D+1 context
  evaluationTime?: Date;                  // when is "now"? for cutoff checks
}

interface AttendanceDecisionOutput {
  attendanceCode: AttendanceCode;
  provisionalState?: ProvisionalStatus;  // null = final decision
  fromTime?: Date;
  toTime?: Date;
  workHours?: string;
  diffInMinutes?: number;
  diffOutMinutes?: number;
  confidence: 'FINAL' | 'PROVISIONAL' | 'WAITING';
  waitingFor?: string[];  // ['DUTY_PLAN', 'OUT_PUNCH', 'NIGHT_COMPLETION']
}
```

---

## SVC-002: DutyPlanChangeDetectionService

**File:** `src/services/duty-plan-change-detection.service.ts`

```typescript
@Injectable()
export class DutyPlanChangeDetectionService {

  async detectChanges(): Promise<DutyPlanChange[]> {
    const current = await this.loadCurrentDutyPlans();
    const cached = await this.loadCachedDutyPlans();

    const changes: DutyPlanChange[] = [];

    // Detect INSERTs: in current but not in cache
    for (const plan of current) {
      const key = `${plan.empCode}_${plan.date}`;
      if (!cached.has(key)) {
        changes.push({ type: 'INSERT', empCode: plan.empCode, date: plan.date, plan });
      } else if (cached.get(key)!.hash !== plan.hash) {
        changes.push({ type: 'UPDATE', empCode: plan.empCode, date: plan.date, plan,
                       previous: cached.get(key)!.plan });
      }
    }

    // Detect DELETEs: in cache but not in current
    const currentKeys = new Set(current.map(p => `${p.empCode}_${p.date}`));
    for (const [key, entry] of cached) {
      if (!currentKeys.has(key)) {
        changes.push({ type: 'DELETE', empCode: entry.empCode, date: entry.date });
      }
    }

    // Update cache with current snapshot
    await this.updateCache(current);

    return changes;
  }
}
```

---

## SVC-003: ProvisionalStateManagerService

**File:** `src/services/provisional-state-manager.service.ts`

```typescript
@Injectable()
export class ProvisionalStateManagerService {

  async getWaitingEmployees(date: Date): Promise<ProvisionalRecord[]> {
    return this.attendanceStateRepo.findBy({
      date,
      isProvisional: true,
    });
  }

  async finalizeWaiting(date: Date, reason: string): Promise<void> {
    const waiting = await this.getWaitingEmployees(date);
    for (const record of waiting) {
      if (record.provisionalState === ProvisionalStatus.WAITING_FOR_DUTY_PLAN) {
        await this.recalculationEngine.finalizeAs(
          record.empCode, date, AttendanceCode.NOPLANSHIFT
        );
      }
      // Other provisional states finalize based on what IS known
    }
  }

  async getProvisionalSummary(date: Date): Promise<ProvisionalSummary> {
    const states = await this.attendanceStateRepo.groupBy({
      date,
      groupBy: 'provisionalState',
    });
    return {
      waitingForDutyPlan: states.WAITING_FOR_DUTY_PLAN ?? 0,
      waitingForPunch: states.WAITING_FOR_PUNCH ?? 0,
      waitingForOutPunch: states.WAITING_FOR_OUT_PUNCH ?? 0,
      waitingForNightCompletion: states.WAITING_FOR_NIGHT_COMPLETION ?? 0,
      waitingForLeave: states.WAITING_FOR_LEAVE_DECISION ?? 0,
      waitingForReconciliation: states.WAITING_FOR_RECONCILIATION ?? 0,
      total: Object.values(states).reduce((a, b) => a + b, 0),
    };
  }
}
```

---

# NEW QUEUE JOBS

## QUEUE-001: duty-plan-event

```typescript
// Bull queue definition
const dutyPlanEventQueue = new Queue('duty-plan-events', redisConnection);

// Worker
dutyPlanEventQueue.process(async (job) => {
  const { empCode, date, changeType } = job.data;
  await recalculationEngine.recalculate(empCode, date, `DUTY_PLAN_${changeType}`);
});

// Configuration
{
  attempts: 3,
  backoff: { type: 'exponential', delay: 2000 },
  removeOnComplete: false,  // keep for audit
  removeOnFail: false,      // keep for investigation
}
```

## QUEUE-002: leave-event

```typescript
const leaveEventQueue = new Queue('leave-events', redisConnection);

leaveEventQueue.process(async (job) => {
  const { empCode, date, status } = job.data;
  await recalculationEngine.recalculate(empCode, date, `LEAVE_${status}`);
});

// Configuration
{
  attempts: 5,
  backoff: { type: 'exponential', delay: 5000 },
  delay: 0,
}
```

## QUEUE-003: bulk-recalculation

```typescript
const bulkRecalcQueue = new Queue('bulk-recalculation', redisConnection);

bulkRecalcQueue.process(async (job) => {
  const { date, reason, pageSize = 50, pageDelayMs = 2000 } = job.data;

  let offset = 0;
  while (true) {
    const employees = await getEmployeesForDate(date, { offset, limit: pageSize });
    if (employees.length === 0) break;

    await Promise.all(employees.map(emp =>
      recalculationEngine.recalculate(emp.code, date, reason)
    ));

    offset += pageSize;
    await sleep(pageDelayMs);  // throttle to avoid DB overload
  }
});
```

## QUEUE-004: reconciliation

```typescript
const reconciliationQueue = new Queue('his-reconciliation', redisConnection);

reconciliationQueue.process(async (job) => {
  const { date } = job.data;

  const hisRecords = await hisOracle.query(
    `SELECT EMPCODE, ATTENDANCE, FROMTIME, TOTIME, WORKHOURS
     FROM DUTYACTUALVALUES WHERE ACTUALDATE = :date`, [date]
  );

  for (const hisRecord of hisRecords) {
    const hdspRecord = await hdspAttendanceRepo.findOne({
      empCode: hisRecord.EMPCODE, date
    });

    if (!hdspRecord) continue;

    const matches = hdspRecord.attendanceCode === hisRecord.ATTENDANCE;

    await recalcLogRepo.save({
      empCode: hisRecord.EMPCODE,
      date,
      outcome: matches ? 'HIS_CONFIRMED' : 'HIS_DIVERGED',
      hisValue: hisRecord.ATTENDANCE,
      hdspValue: hdspRecord.attendanceCode,
    });

    if (!matches) {
      await alertService.emit('HIS_HDSP_DIVERGENCE', {
        empCode: hisRecord.EMPCODE, date,
        hdspValue: hdspRecord.attendanceCode,
        hisValue: hisRecord.ATTENDANCE,
      });

      // Accept HIS as authoritative
      await hdspAttendanceRepo.update(
        { empCode: hisRecord.EMPCODE, date },
        { attendanceCode: hisRecord.ATTENDANCE, reconciledWithHIS: true }
      );
    }
  }
});
```

---

# CONFIGURATION OPTIONS

```typescript
// New config additions to existing HDSP config

interface AttendanceCutoffConfig {
  // Duty plan cutoff: when WAITING_FOR_DUTY_PLAN → NOPLANSHIFT
  dutyPlanCutoffTime: string;          // default: "21:00"
  dutyPlanCutoffTimezone: string;      // default: "Asia/Kolkata"
  dutyPlanCutoffGracePeriodMinutes: number; // default: 30

  // Batch lock: when HDSP stops auto-recalculation (matches HIS 23:00 lock)
  batchLockTime: string;               // default: "23:00"

  // Batch unlock: when HDSP resumes after reconciliation
  batchUnlockTime: string;             // default: "03:30"

  // Reconciliation: whether to accept HIS result on divergence
  reconciliationStrategy: 'ACCEPT_HIS' | 'ACCEPT_HDSP' | 'ALERT_ONLY';
  // default: ACCEPT_HIS (HIS is source of truth for finalized attendance)

  // Retroactive recalculation
  allowRetroactiveRecalculation: boolean; // default: true
  retroactiveLimitDays: number;           // default: 30

  // Night shift default cutoff (when D+1 plan is unknown)
  nightShiftDefaultCutoffHour: number;   // default: 12 (noon of D+1)

  // DutyPlan polling interval
  dutyPlanPollIntervalMs: number;        // default: 30000 (30s)
  leavePollIntervalMs: number;           // default: 60000 (60s)
  holidayPollIntervalMs: number;         // default: 300000 (5min)

  // Alerts
  waitingStateAlertAfterMinutes: number; // default: 120 (alert if still WAITING_FOR_DUTY_PLAN 2h after shift start)
  enableAttendanceRegressionAlerts: boolean; // default: true
  enableHISDivergenceAlerts: boolean;    // default: true
}
```

---

# RETRY POLICIES

## RP-001: Punch Event (existing, no change)
- Attempts: 3
- Backoff: exponential, base 1s
- Dead letter after: 3 failures
- Dead letter action: manual review queue

## RP-002: DutyPlan Event (new)
- Attempts: 5 (more retries — plan creation may cause brief DB inconsistency)
- Backoff: exponential, base 2s
- Dead letter after: 5 failures
- Dead letter action: set provisional state WAITING_FOR_DUTY_PLAN; schedule retry in 5min

## RP-003: Leave Event (new)
- Attempts: 5
- Backoff: fixed, 10s
- Dead letter after: 5 failures
- Dead letter action: alert; manual reconciliation before next batch

## RP-004: Holiday/Bulk Event (new)
- Attempts: 10 (bulk jobs may fail partway through)
- Backoff: exponential, base 5s
- Checkpoint: save page offset on each successful page (resume from checkpoint on retry)
- Dead letter after: 10 failures

## RP-005: Cutoff Finalization (new)
- Attempts: 3
- No backoff: must complete before batch lock at 23:00
- Alert on first failure: time-sensitive
- Dead letter action: emergency alert to system admin

---

# IDEMPOTENCY CONSIDERATIONS

## ID-001: DutyPlan Event Idempotency

Each DutyPlanCreatedEvent for (empCode, date) must be idempotent:
```typescript
// Deduplicate by: empCode + date + changeType + planHash
const eventId = sha256(`${empCode}_${date}_DUTY_PLAN_CREATED_${planHash}`);

// Bull: use jobId to prevent duplicate processing
await queue.add('duty-plan-event', data, { jobId: eventId });
// Bull deduplicates by jobId — second add with same jobId is no-op
```

## ID-002: Recalculation Idempotency

```typescript
// Before writing any change to Oracle:
const newDecision = computeDecision(dependencies);
const existing = await loadExistingDecision(empCode, date);

if (decisionsEqual(newDecision, existing)) {
  // No-op: identical result, don't write
  return;
}

// Only write if something actually changed
await writeDecision(empCode, date, newDecision);
```

## ID-003: Reconciliation Idempotency

```typescript
// Reconciliation can run multiple times safely:
// Each run reads HIS Oracle and HDSP state fresh; compares; applies HIS if different
// If HIS and HDSP already match: no-op
// If run twice: second run sees match (first run already applied HIS) → no-op
```

---

# IMPLEMENTATION PHASES

## Phase 1 (Immediate — fixes existing bugs first)
- Fix GAP-03: Night shift cross-day logic
- Fix GAP-01: Dedup window 60s → confirm correct target
- Fix GAP-02: Write differential columns
- Fix GAP-08: earlyGraceMinutes = confirmed value

## Phase 2 (Foundation — provisional state infrastructure)
- Add `hdsp_attendance_state` table
- Add `hdsp_recalculation_log` table
- Refactor existing AttendanceWorker to use RecalculationEngine
- Implement WAITING_FOR_DUTY_PLAN provisional state
- Implement CutoffTimerService (21:00 finalization)
- Implement batchLock window (23:00)

## Phase 3 (New event sources)
- Implement DutyPlanPoller + DutyPlanChangeDetectionService
- Add `hdsp_duty_plan_cache` table
- Add duty-plan-event Bull queue
- Implement LeavePoller + leave-event queue
- Implement HolidayPoller + bulk-recalculation queue

## Phase 4 (Reconciliation)
- Implement ReconciliationWorker (runs at 03:30)
- Add `hdsp_dependency_snapshot` table
- Implement HIS divergence detection and alerting

## Phase 5 (Governance)
- Implement payroll lock mechanism
- Implement manual correction locking
- Implement retroactive recalculation with payroll lock check
- Build monitoring dashboard (Prometheus metrics + Grafana)

## Estimated effort per phase
| Phase | Scope | Risk | Estimated Days |
|-------|-------|------|---------------|
| Phase 1 | Bug fixes (known, contained) | LOW | 5-7 |
| Phase 2 | State infrastructure | MEDIUM | 8-12 |
| Phase 3 | New pollers + queues | MEDIUM | 6-10 |
| Phase 4 | Reconciliation | MEDIUM | 5-8 |
| Phase 5 | Governance | HIGH | 10-15 |
| **Total** | | | **34-52 days** |
