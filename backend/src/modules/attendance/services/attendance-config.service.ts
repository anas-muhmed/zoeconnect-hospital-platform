import { Injectable } from '@nestjs/common';
import { HisConfigService } from '../../his/config/his-config.service';

/**
 * Typed runtime configuration for the attendance module.
 *
 * Values are sourced in priority order:
 *   1. HIS config store (pushed from vendor portal per-hospital via HIS_CONFIG_UPDATE webhook)
 *   2. process.env  (server-level .env file -- backward-compatible fallback)
 *   3. Hardcoded default
 *
 * This lets the vendor override any value on a per-hospital basis without
 * touching .env files or restarting the application -- except cron expressions,
 * which are bound to the @Cron decorator at module initialisation and require
 * a restart to change.
 */
export interface AttendanceRuntimeConfig {
  // Core realtime polling
  /** Master switch. Env: ATTENDANCE_REALTIME_ENABLED */
  realtimeEnabled:       boolean;
  /** Bootstrap cursor for first run. Env: ATTENDANCE_INITIAL_CURSOR */
  initialCursor:         string;
  /**
   * Hard floor: punches in ATTLOGS strictly before this date are never
   * considered, regardless of the stored Redis cursor. Accepts YYYY-MM-DD
   * or full ISO-8601. Empty = no floor. Env: ATTENDANCE_PUNCH_START_DATE
   */
  punchStartDate:        string;
  /** Bull dequeue interval in ms. Env: ATTENDANCE_POLL_INTERVAL_MS */
  pollIntervalMs:        number;
  /** Max punches per poll cycle. Env: ATTENDANCE_POLL_BATCH_SIZE */
  pollBatchSize:         number;
  /** Verbose structured logging. Env: ATTENDANCE_DEBUG */
  debug:                 boolean;
  /**
   * If an event has sat at status='QUEUED' longer than this without moving
   * to PROCESSING/PROCESSED/FAILED, the listener treats it as orphaned
   * (its Bull job was lost or silently deduped) and re-enqueues it instead
   * of skipping it forever. Env: ATTENDANCE_STALE_QUEUED_MS
   */
  staleQueuedMs:         number;
  /**
   * Safety-net sweep, independent of the CREATEDDATETIME cursor used by
   * fetchNewPunches(). Covers the scenario where a punch device / eSSL sync
   * software is offline for an extended period and, once reconnected,
   * writes ATTLOGS rows whose CREATEDDATETIME does not advance the cursor
   * as expected (e.g. it preserves an old timestamp rather than the actual
   * insert time) — such rows would otherwise be silently skipped forever.
   * This sweep re-scans a trailing window by LOGDATETIME (the actual punch
   * time) regardless of CREATEDDATETIME, and relies on PunchHistoryService's
   * sourceId dedup to safely re-process the same window repeatedly without
   * side effects. Master switch. Env: ATTENDANCE_BACKFILL_ENABLED
   */
  backfillEnabled:       boolean;
  /** How far back the backfill sweep looks, in days. Env: ATTENDANCE_BACKFILL_WINDOW_DAYS */
  backfillWindowDays:    number;
  /** How often the backfill sweep runs, in ms. Env: ATTENDANCE_BACKFILL_INTERVAL_MS */
  backfillIntervalMs:    number;
  /** Max rows fetched per backfill sweep. Env: ATTENDANCE_BACKFILL_BATCH_SIZE */
  backfillBatchSize:     number;
  /**
   * Early NPNL flagging: for a rostered employee whose shift start time
   * (SHIFT_TYPE.START_TIMING) plus npnlGraceMinutes has already passed with
   * no punch and no approved leave, this sweep proactively writes NPNL to
   * DUTYACTUALVALUES instead of waiting for end-of-day reconciliation. Once
   * the employee actually punches (IN or OUT), the normal realtime pipeline
   * re-evaluates the full day and MERGE-updates the same DUTYACTUALVALUES
   * row with the correct status — this sweep only ever writes a
   * placeholder that gets naturally superseded. Master switch.
   * Env: ATTENDANCE_NPNL_SWEEP_ENABLED
   */
  npnlSweepEnabled:      boolean;
  /** Minutes after shift start before NPNL is flagged. Env: ATTENDANCE_NPNL_GRACE_MINUTES */
  npnlGraceMinutes:      number;
  /** How often the NPNL sweep runs, in ms. Env: ATTENDANCE_NPNL_SWEEP_INTERVAL_MS */
  npnlSweepIntervalMs:   number;
  /** Max roster candidates evaluated per sweep. Env: ATTENDANCE_NPNL_SWEEP_BATCH_SIZE */
  npnlSweepBatchSize:    number;
  // Night / queue reconciliation
  /** Cron for night recon (restart required). Env: ATTENDANCE_RECON_CRON */
  reconCron:             string;
  /** Batch size for night recon. Env: ATTENDANCE_RECON_BATCH_SIZE */
  reconBatchSize:        number;
  /** Divergence resolution strategy. Env: ATTENDANCE_RECON_STRATEGY */
  reconStrategy:         string;
  // Dependency pollers
  /** Master switch for all dependency pollers. Env: DEPENDENCY_POLLING_ENABLED */
  depPollingEnabled:     boolean;
  /** Orchestrator tick interval in ms. Env: DEPENDENCY_POLL_INTERVAL_MS */
  depPollIntervalMs:     number;
  /** Shared batch size for all four pollers. Env: DEPENDENCY_POLL_BATCH_SIZE */
  depPollBatchSize:      number;
  /** DutyPlan poller active. Env: DEPENDENCY_DUTYPLAN_POLL_ENABLED */
  depDutyplanEnabled:    boolean;
  /**
   * DutyPlan has no modification timestamp in Oracle (DUTYPLANVALUES lacks
   * LASTMODIFIEDDATE) — the poller re-scans a rolling PLANDATE window every
   * cycle instead of tracking an incremental cursor. Days into the past to
   * include in that window. Env: DEPENDENCY_DUTYPLAN_REFRESH_PAST_DAYS
   */
  depDutyplanRefreshPastDays:   number;
  /**
   * Days into the future to include in the DutyPlan PLANDATE refresh window.
   * Env: DEPENDENCY_DUTYPLAN_REFRESH_FUTURE_DAYS
   */
  depDutyplanRefreshFutureDays: number;
  /** Leave poller active. Env: DEPENDENCY_LEAVE_POLL_ENABLED */
  depLeaveEnabled:       boolean;
  /**
   * EMPLOYEELEAVELIST also has no modification timestamp — the Leave poller
   * re-scans a rolling FROMDATE/TODATE window every cycle instead of tracking
   * an incremental cursor, same as DutyPlan. Days into the past to include.
   * Env: DEPENDENCY_LEAVE_REFRESH_PAST_DAYS
   */
  depLeaveRefreshPastDays:   number;
  /**
   * Days into the future to include in the Leave refresh window.
   * Env: DEPENDENCY_LEAVE_REFRESH_FUTURE_DAYS
   */
  depLeaveRefreshFutureDays: number;
  /** Holiday poller active (opt-in). Env: DEPENDENCY_HOLIDAY_POLL_ENABLED */
  depHolidayEnabled:     boolean;
  /** ShiftType poller active (opt-in). Env: DEPENDENCY_SHIFTTYPE_POLL_ENABLED */
  depShiftTypeEnabled:   boolean;
  // Dependency router & recalculation
  /** Route dependency events to re-enqueue attendance. Env: DEPENDENCY_ROUTER_ENABLED */
  depRouterEnabled:      boolean;
  /** Debounce before routing DutyPlan events. Env: DEPENDENCY_DUTYPLAN_DEBOUNCE_MS */
  depDutyplanDebounceMs: number;
  /** Max employee-days per ALL-scope recalc. Env: DEPENDENCY_GLOBAL_RECALC_LIMIT */
  depGlobalRecalcLimit:  number;
  /** Lookback days when shift config changes. Env: DEPENDENCY_CONFIG_LOOKBACK_DAYS */
  depConfigLookbackDays: number;
  /** Max employee-days per config-scope recalc. Env: DEPENDENCY_CONFIG_RECALC_LIMIT */
  depConfigRecalcLimit:  number;
  // HIS reconciliation
  /** Nightly HIS recon job active. Env: HIS_RECON_ENABLED */
  hisReconEnabled:       boolean;
  /** Cron for HIS recon (restart required). Env: HIS_RECON_CRON */
  hisReconCron:          string;
  /** Lookback days for HIS recon snapshot comparison. Env: HIS_RECON_LOOKBACK_DAYS */
  hisReconLookbackDays:  number;
  /** Max rows per HIS recon run. Env: HIS_RECON_BATCH_SIZE */
  hisReconBatchSize:     number;
  // Retroactive recalculation
  /** Max employees fetched for dept-scope retroactive recalc. Env: RETROACTIVE_DEPT_EMP_LIMIT */
  retroDeptEmpLimit:     number;
  /** Overall cap on employee-days per retroactive run. Env: RETROACTIVE_RECALC_BATCH_LIMIT */
  retroBatchLimit:       number;
}

@Injectable()
export class AttendanceConfigService {
  constructor(private readonly hisConfig: HisConfigService) {}

  async getConfig(): Promise<Record<string, string>> {
    const cfg = await this.hisConfig.getConfig();
    return {
      'attendance.attlogs.table': 'ATTLOGS',
      'attendance.attlogs.employeeCode': 'EMPLOYEECODE',
      'attendance.attlogs.logDateTime': 'LOGDATETIME',
      'attendance.attlogs.deviceName': 'DEVICENAME',
      'attendance.attlogs.direction': 'DIRECTION',
      'attendance.attlogs.ipAddress': 'IPADDRESS',
      'attendance.attlogs.serialNumber': 'SN',
      'attendance.attlogs.intraBranchId': 'INTRABRANCHID',
      // Native TIMESTAMP(6) insert-time column — used as the POLLING CURSOR
      // (indexed, sargable). LOGDATETIME (VARCHAR2) remains the business punch
      // time. Override per hospital via the vendor portal if the column differs.
      'attendance.attlogs.createdAt': 'CREATEDDATETIME',
      'attendance.employee.table': 'EMPLOYEE',
      'attendance.employee.id': 'EMPLOYEE_ID',
      'attendance.employee.code': 'EMPNO',
      // Confirmed 2026-07 by the user directly (production system owner,
      // not a decompiled-code guess) against production Oracle:
      //   ISPUNCHREQUIRED — 1 = employee is considered for punch tracking at
      //     all; 0/null = never considered (e.g. exempted staff).
      //   PUNCH — 1 = a single IN or OUT punch is enough to mark PRESENT;
      //     2 (or unset) = the normal two-punch (IN+OUT) flow.
      //   EMP_STATUS — compared against attendance.employee.activeStatusValue
      //     below; not equal => employee is inactive, not considered.
      //   FOR_HIS — 1 = a system/admin account (not a real staff member,
      //     e.g. an admin login used for HIS configuration), never
      //     considered for punch tracking regardless of anything else;
      //     0/null = a normal employee.
      'attendance.employee.isPunchRequired': 'ISPUNCHREQUIRED',
      'attendance.employee.punchCount': 'PUNCH',
      'attendance.employee.status': 'EMP_STATUS',
      'attendance.employee.forHis': 'FOR_HIS',
      // The "active" EMP_STATUS code. Confirmed 2026-07 directly by the user
      // (production system owner): 75 = active.
      'attendance.employee.activeStatusValue': '75',
      // PMS_EMPLOYEE: relieving-date source. Confirmed via production query
      // (columns EMPLOYEEID, RELIEVINGDATE). RELIEVINGDATE itself is still a
      // valid working day; the employee is excluded starting the day after.
      'attendance.pmsEmployee.table': 'PMS_EMPLOYEE',
      'attendance.pmsEmployee.employeeId': 'EMPLOYEEID',
      'attendance.pmsEmployee.relievingDate': 'RELIEVINGDATE',
      // EMPLOYEESCMAPFORDUTYROSTER: current servicecenter assignment.
      // Confirmed via production query (columns MAPID, EMPLOYEE,
      // SERVICECENTER, DEPARTMENT, SKILL, ISACTIVE, SORTORDER,
      // CREATEDDATETIME, UPDATEDDATETIME, ...). When an incharge transfers an
      // employee between servicecenters, the OLD mapping row's ISACTIVE
      // flips to 0 and a NEW row is created with ISACTIVE=1 — only the
      // ISACTIVE=1 row is authoritative. An employee with no ISACTIVE=1 row
      // at all is not considered for punch (not currently assigned anywhere).
      'attendance.serviceCenterMap.table': 'EMPLOYEESCMAPFORDUTYROSTER',
      'attendance.serviceCenterMap.employeeId': 'EMPLOYEE',
      'attendance.serviceCenterMap.serviceCenterId': 'SERVICECENTER',
      'attendance.serviceCenterMap.isActive': 'ISACTIVE',
      'attendance.serviceCenterMap.updatedAt': 'UPDATEDDATETIME',
      'attendance.serviceCenterMap.createdAt': 'CREATEDDATETIME',
      // DUTYROSTEREMPLOYEE / DUTYROSTERMASTER: the join chain that actually
      // ties a DUTYPLANVALUES row to a servicecenter. Confirmed via
      // production all_tab_columns query 2026-07:
      //   DUTYPLANVALUES.DUTYPLANS -> DUTYROSTEREMPLOYEE.EMPDUTYID (PK)
      //   DUTYROSTEREMPLOYEE.DUTYROSTERID -> DUTYROSTERMASTER.DUTYROSTERID (PK)
      //   DUTYROSTERMASTER.SERVICECENTER matches
      //     EMPLOYEESCMAPFORDUTYROSTER.SERVICECENTER's value space.
      // NOTE: DUTYROSTERMASTER also has its own INTRABRANCHID column,
      // confirmed to be a SEPARATE dimension from SERVICECENTER — do not
      // conflate the two. attendance.roster.intraBranchId (below) is
      // unrelated to this join chain and is left unchanged.
      'attendance.roster.dutyPlansFk': 'DUTYPLANS',
      'attendance.dutyRosterEmployee.table': 'DUTYROSTEREMPLOYEE',
      'attendance.dutyRosterEmployee.id': 'EMPDUTYID',
      'attendance.dutyRosterEmployee.dutyRosterId': 'DUTYROSTERID',
      'attendance.dutyRosterMaster.table': 'DUTYROSTERMASTER',
      'attendance.dutyRosterMaster.id': 'DUTYROSTERID',
      'attendance.dutyRosterMaster.serviceCenterId': 'SERVICECENTER',
      'attendance.roster.table': 'DUTYPLANVALUES',
      'attendance.roster.id': 'DUTYPLANVALUEID',
      'attendance.roster.employeeId': 'EMPID',
      'attendance.roster.dutyDate': 'PLANDATE',
      'attendance.roster.dayOfMonth': 'DAYOFMONTH',
      'attendance.roster.primaryShift': 'SHIFTPLAN',
      'attendance.roster.secondShift': 'SECONDSHIFT',
      'attendance.roster.intraBranchId': 'INTRABRANCHID',
      // NOTE: DUTYPLANVALUES has NO modification-timestamp column in the HIS
      // Oracle schema. Do not add an 'attendance.roster.lastModifiedDate'
      // mapping here — querying a non-existent LASTMODIFIEDDATE column raises
      // ORA-00904. DutyPlanDependencyPoller uses a PLANDATE-windowed periodic
      // refresh instead of a modification-timestamp cursor.
      'attendance.shift.table': 'SHIFT_TYPE',
      'attendance.shift.lastModifiedDate': 'LASTMODIFIEDDATE',
      'attendance.shift.id': 'ID',
      'attendance.shift.code': 'CODE',
      'attendance.shift.start': 'START_TIMING',
      'attendance.shift.end': 'END_TIMING',
      'attendance.shift.secondStart': 'SECONDSHIFT_STARTTIMING',
      'attendance.shift.secondEnd': 'SECONDSHIFT_ENDTTIMING',
      'attendance.shift.isNight': 'IS_NIGHT',
      'attendance.shift.isLeave': 'ISLEAVE',
      'attendance.shift.isHoliday': 'NATIONAL_HOLIDAY',
      'attendance.shift.isWeekOff': 'ISWEEKOFF',
      'attendance.shift.isWorkShift': 'ISWORKSHIFT',
      'attendance.shift.missPunch': 'MISSPUNCH',
      'attendance.shift.noPunchNoLeave': 'NOPUNCHNOLEAVE',
      'attendance.shift.leaveMaster': 'LEAVEMASTER',
      'attendance.holiday.table': 'HOLIDAY',
      'attendance.holiday.date': 'HOLDATE',
      'attendance.holiday.lastModifiedDate': 'LASTMODIFIEDDATE',
      'attendance.leave.table': 'LEAVEMASTER',
      'attendance.leave.id': 'ID',
      'attendance.leave.name': 'NAME',
      'attendance.employeeLeave.table': 'EMPLOYEELEAVELIST',
      // ── EMPLOYEELEAVELIST schema, confirmed 2026-07-04 via
      //    SELECT column_name FROM all_tab_columns WHERE table_name =
      //    'EMPLOYEELEAVELIST' against production Oracle:
      //      ID, DAYS, FROMDATE, STATUS, LEAVEDETAILID, LEAVESLOT,
      //      COMPENSATIONDATE, INTRABRANCHID
      //    There is NO EMPID, EMPCODE, TODATE, LEAVEMASTER, or
      //    LASTMODIFIEDDATE column — do not reintroduce any of those
      //    mappings. (A HIS reverse-engineering doc had inferred EMPCODE/
      //    TODATE from decompiled bytecode; three separate production
      //    ORA-00904s disproved every one of EMPID, TODATE, and EMPCODE.)
      //
      //    EMPLOYEELEAVELIST does NOT carry the employee at all — it is a
      //    per-day detail row whose only link back to the employee is
      //    LEAVEDETAILID -> APPLIEDLEAVES.ID -> APPLIEDLEAVES.EMPID ->
      //    EMPLOYEE.EMPLOYEE_ID -> EMPLOYEE.EMPNO. LeaveDependencyPoller
      //    must join through APPLIEDLEAVES and EMPLOYEE to get employeeCode
      //    for a given EMPLOYEELEAVELIST row (see leave-dependency.poller.ts).
      'attendance.employeeLeave.leaveDate': 'FROMDATE',
      'attendance.employeeLeave.status': 'STATUS',
      'attendance.employeeLeave.approvedStatus': 'APPROVED',
      // NOTE: like DUTYPLANVALUES, EMPLOYEELEAVELIST has NO modification-
      // timestamp column in the HIS Oracle schema (confirmed by production
      // ORA-00904 on "L"."LASTMODIFIEDDATE"). Do not add an
      // 'attendance.employeeLeave.lastModifiedDate' mapping. LeaveDependencyPoller
      // uses a FROMDATE-windowed periodic refresh instead, the same pattern
      // as DutyPlanDependencyPoller's PLANDATE window.
      'attendance.actual.table': 'DUTYACTUALVALUES',
      // Confirmed 2026-07-04 via production queries against Oracle:
      //   SELECT sequence_name FROM all_sequences
      //   WHERE sequence_name LIKE '%DUTYACTUAL%' OR sequence_name LIKE '%DAV%';
      //   -> DUTYACTUALS_0, DUTYACTUALVALUES_0
      //   SELECT trigger_name, table_name FROM all_triggers
      //   WHERE table_name = 'DUTYACTUALVALUES';
      //   -> no rows (no trigger auto-populates the ID column)
      // 'DUTYACTUALVALUES_SEQ' (the prior, unverified guess) does not exist
      // and threw ORA-02289 in production. The real sequence backing
      // DUTYACTUALVALUES.DUTYACTUALVALUEID is DUTYACTUALVALUES_0 — note the
      // naming convention here is "<TABLE>_0", not "<TABLE>_SEQ". Since there
      // is no insert trigger, the app must keep supplying this value itself.
      'attendance.actual.sequence': 'DUTYACTUALVALUES_0.NEXTVAL',
      'attendance.actual.id': 'DUTYACTUALVALUEID',
      'attendance.actual.employeeId': 'EMPID',
      'attendance.actual.dutyDate': 'ACTUALDATE',
      'attendance.actual.dayOfMonth': 'DAYOFMONTH',
      'attendance.actual.primaryShift': 'SHIFTACTUAL',
      'attendance.actual.secondShift': 'SECONDSHIFT',
      'attendance.actual.inPunch': 'FROMDATETIME',
      'attendance.actual.outPunch': 'TODATETIME',
      'attendance.actual.inTime': 'FROMTIME',
      'attendance.actual.outTime': 'TOTIME',
      'attendance.actual.duration': 'DURATION',
      'attendance.actual.durationMinutes': 'DURATIONINMINUTES',
      'attendance.actual.status': 'ATTENDANCE',
      'attendance.actual.remarks': 'REMARKS',
      'attendance.actual.intraBranchId': 'INTRABRANCHID',
      'attendance.actual.correspondingDutyDay': 'CORRESPONDINGDUTYDAY',
      'attendance.appliedLeave.table': 'APPLIEDLEAVES',
      'attendance.appliedLeave.id': 'ID',
      'attendance.appliedLeave.employeeId': 'EMPID',
      'attendance.appliedLeave.fromDate': 'FROMDATE',
      'attendance.appliedLeave.toDate': 'TODATE',
      'attendance.appliedLeave.leaveMaster': 'LEAVEMASTERID',
      'attendance.appliedLeave.status': 'LEAVESTATUS',
      'attendance.appliedLeave.approvedStatus': 'APPROVED',
      'attendance.employeeLeave.leaveDetailId': 'LEAVEDETAILID',
      'attendance.employeeLeave.dayPart': 'LEAVESLOT',
      ...cfg,
    };
  }

  ident(cfg: Record<string, string>, key: string): string {
    const value = cfg[key];
    if (!value || !/^[A-Z0-9_$.]+$/i.test(value)) {
      throw new Error(`Invalid or missing Oracle identifier config: ${key}`);
    }
    return value;
  }

  /**
   * Returns the full typed attendance runtime configuration.
   *
   * Each value is resolved in order:
   *   1. HIS config store key (pushed from vendor portal)
   *   2. process.env fallback (backward-compatible .env file)
   *   3. Hardcoded safe default
   *
   * Note: cron expressions (reconCron, hisReconCron) are read here for
   * reference/logging, but @Cron decorators bind at startup so a restart
   * is required for cron changes to take effect.
   */
  async getRuntimeConfig(): Promise<AttendanceRuntimeConfig> {
    const cfg = await this.hisConfig.getConfig();

    const str = (hisKey: string, envKey: string, def: string): string =>
      cfg[hisKey] ?? process.env[envKey] ?? def;

    const bool = (hisKey: string, envKey: string, def: boolean): boolean => {
      const raw = cfg[hisKey] ?? process.env[envKey];
      if (raw === undefined) return def;
      return raw.toLowerCase() === 'true';
    };

    const int = (hisKey: string, envKey: string, def: number): number => {
      const raw = cfg[hisKey] ?? process.env[envKey];
      if (raw === undefined) return def;
      const n = parseInt(raw, 10);
      return Number.isFinite(n) ? n : def;
    };

    return {
      // Core realtime polling
      realtimeEnabled:       bool('attendance.runtime.enabled',               'ATTENDANCE_REALTIME_ENABLED',       false),
      initialCursor:         str ('attendance.runtime.initialCursor',         'ATTENDANCE_INITIAL_CURSOR',         ''),
      punchStartDate:        str ('attendance.runtime.punchStartDate',        'ATTENDANCE_PUNCH_START_DATE',       ''),
      pollIntervalMs:        int ('attendance.runtime.pollIntervalMs',        'ATTENDANCE_POLL_INTERVAL_MS',       15000),
      pollBatchSize:         int ('attendance.runtime.pollBatchSize',         'ATTENDANCE_POLL_BATCH_SIZE',        500),
      debug:                 bool('attendance.runtime.debug',                 'ATTENDANCE_DEBUG',                  false),
      staleQueuedMs:         int ('attendance.runtime.staleQueuedMs',         'ATTENDANCE_STALE_QUEUED_MS',        5 * 60_000),
      backfillEnabled:       bool('attendance.runtime.backfillEnabled',       'ATTENDANCE_BACKFILL_ENABLED',       true),
      backfillWindowDays:    int ('attendance.runtime.backfillWindowDays',    'ATTENDANCE_BACKFILL_WINDOW_DAYS',   7),
      backfillIntervalMs:    int ('attendance.runtime.backfillIntervalMs',    'ATTENDANCE_BACKFILL_INTERVAL_MS',   30 * 60_000),
      backfillBatchSize:     int ('attendance.runtime.backfillBatchSize',     'ATTENDANCE_BACKFILL_BATCH_SIZE',    2000),
      npnlSweepEnabled:      bool('attendance.runtime.npnlSweepEnabled',      'ATTENDANCE_NPNL_SWEEP_ENABLED',     true),
      npnlGraceMinutes:      int ('attendance.runtime.npnlGraceMinutes',      'ATTENDANCE_NPNL_GRACE_MINUTES',     15),
      npnlSweepIntervalMs:   int ('attendance.runtime.npnlSweepIntervalMs',   'ATTENDANCE_NPNL_SWEEP_INTERVAL_MS', 5 * 60_000),
      npnlSweepBatchSize:    int ('attendance.runtime.npnlSweepBatchSize',    'ATTENDANCE_NPNL_SWEEP_BATCH_SIZE',  5000),
      // Night / queue reconciliation
      reconCron:             str ('attendance.runtime.reconCron',             'ATTENDANCE_RECON_CRON',             '0 30 1 * * *'),
      reconBatchSize:        int ('attendance.runtime.reconBatchSize',        'ATTENDANCE_RECON_BATCH_SIZE',       5000),
      reconStrategy:         str ('attendance.runtime.reconStrategy',         'ATTENDANCE_RECON_STRATEGY',         'ACCEPT_HIS'),
      // Dependency pollers
      depPollingEnabled:     bool('attendance.dependency.pollingEnabled',     'DEPENDENCY_POLLING_ENABLED',        true),
      depPollIntervalMs:     int ('attendance.dependency.pollIntervalMs',     'DEPENDENCY_POLL_INTERVAL_MS',       60000),
      depPollBatchSize:      int ('attendance.dependency.pollBatchSize',      'DEPENDENCY_POLL_BATCH_SIZE',        500),
      depDutyplanEnabled:    bool('attendance.dependency.dutyplanEnabled',    'DEPENDENCY_DUTYPLAN_POLL_ENABLED',  true),
      depDutyplanRefreshPastDays:   int('attendance.dependency.dutyplanRefreshPastDays',   'DEPENDENCY_DUTYPLAN_REFRESH_PAST_DAYS',   1),
      depDutyplanRefreshFutureDays: int('attendance.dependency.dutyplanRefreshFutureDays', 'DEPENDENCY_DUTYPLAN_REFRESH_FUTURE_DAYS', 14),
      depLeaveEnabled:       bool('attendance.dependency.leaveEnabled',       'DEPENDENCY_LEAVE_POLL_ENABLED',     true),
      depLeaveRefreshPastDays:   int('attendance.dependency.leaveRefreshPastDays',   'DEPENDENCY_LEAVE_REFRESH_PAST_DAYS',   1),
      depLeaveRefreshFutureDays: int('attendance.dependency.leaveRefreshFutureDays', 'DEPENDENCY_LEAVE_REFRESH_FUTURE_DAYS', 14),
      depHolidayEnabled:     bool('attendance.dependency.holidayEnabled',     'DEPENDENCY_HOLIDAY_POLL_ENABLED',   false),
      depShiftTypeEnabled:   bool('attendance.dependency.shiftTypeEnabled',   'DEPENDENCY_SHIFTTYPE_POLL_ENABLED', false),
      // Dependency router & recalculation
      depRouterEnabled:      bool('attendance.dependency.routerEnabled',      'DEPENDENCY_ROUTER_ENABLED',         true),
      depDutyplanDebounceMs: int ('attendance.dependency.dutyplanDebounceMs', 'DEPENDENCY_DUTYPLAN_DEBOUNCE_MS',   5000),
      depGlobalRecalcLimit:  int ('attendance.dependency.globalRecalcLimit',  'DEPENDENCY_GLOBAL_RECALC_LIMIT',    5000),
      depConfigLookbackDays: int ('attendance.dependency.configLookbackDays', 'DEPENDENCY_CONFIG_LOOKBACK_DAYS',   7),
      depConfigRecalcLimit:  int ('attendance.dependency.configRecalcLimit',  'DEPENDENCY_CONFIG_RECALC_LIMIT',    10000),
      // HIS reconciliation
      hisReconEnabled:       bool('attendance.recon.enabled',                 'HIS_RECON_ENABLED',                 true),
      hisReconCron:          str ('attendance.recon.cron',                    'HIS_RECON_CRON',                    '0 30 3 * * *'),
      hisReconLookbackDays:  int ('attendance.recon.lookbackDays',            'HIS_RECON_LOOKBACK_DAYS',           1),
      hisReconBatchSize:     int ('attendance.recon.batchSize',               'HIS_RECON_BATCH_SIZE',              10000),
      // Retroactive recalculation
      retroDeptEmpLimit:     int ('attendance.retroactive.deptEmpLimit',      'RETROACTIVE_DEPT_EMP_LIMIT',        5000),
      retroBatchLimit:       int ('attendance.retroactive.batchLimit',        'RETROACTIVE_RECALC_BATCH_LIMIT',    20000),
    };
  }
}
