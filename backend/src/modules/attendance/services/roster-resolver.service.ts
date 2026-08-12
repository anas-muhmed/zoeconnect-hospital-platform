import { Inject, Injectable } from '@nestjs/common';
import { IOracleTransport } from '../../platform/infrastructure/oracle/oracle-transport.interface';
import { ORACLE_TRANSPORT } from '../../platform/infrastructure/tokens';
import { AttendanceConfigService } from './attendance-config.service';
import { AttendanceStructuredLogger } from './attendance-structured-logger.service';
import type { LeaveDayPart, RosterContext } from '../attendance.types';

@Injectable()
export class RosterResolver {
  constructor(
    @Inject(ORACLE_TRANSPORT) private readonly oracle: IOracleTransport,
    private readonly attendanceConfig: AttendanceConfigService,
    private readonly attendanceLogger: AttendanceStructuredLogger,
  ) {}

  async resolve(employeeCode: string, punchDate: Date): Promise<RosterContext> {
    const startedAt = this.attendanceLogger.time();
    const cfg = await this.attendanceConfig.getConfig();
    const employeeTable = this.attendanceConfig.ident(cfg, 'attendance.employee.table');
    const employeeIdCol = this.attendanceConfig.ident(cfg, 'attendance.employee.id');
    const employeeCodeCol = this.attendanceConfig.ident(cfg, 'attendance.employee.code');
    const rosterTable = this.attendanceConfig.ident(cfg, 'attendance.roster.table');
    const rosterIdCol = this.attendanceConfig.ident(cfg, 'attendance.roster.id');
    const empCol = this.attendanceConfig.ident(cfg, 'attendance.roster.employeeId');
    const dateCol = this.attendanceConfig.ident(cfg, 'attendance.roster.dutyDate');
    const shiftPlanCol = this.attendanceConfig.ident(cfg, 'attendance.roster.primaryShift');
    const secondShiftCol = this.attendanceConfig.ident(cfg, 'attendance.roster.secondShift');
    const branchCol = this.attendanceConfig.ident(cfg, 'attendance.roster.intraBranchId');
    const shiftTable = this.attendanceConfig.ident(cfg, 'attendance.shift.table');
    const shiftIdCol = this.attendanceConfig.ident(cfg, 'attendance.shift.id');
    const shiftCodeCol = this.attendanceConfig.ident(cfg, 'attendance.shift.code');
    const shiftStartCol = this.attendanceConfig.ident(cfg, 'attendance.shift.start');
    const shiftEndCol = this.attendanceConfig.ident(cfg, 'attendance.shift.end');
    const secondStartCol = this.attendanceConfig.ident(cfg, 'attendance.shift.secondStart');
    const secondEndCol = this.attendanceConfig.ident(cfg, 'attendance.shift.secondEnd');
    const isNightCol = this.attendanceConfig.ident(cfg, 'attendance.shift.isNight');
    const isLeaveCol = this.attendanceConfig.ident(cfg, 'attendance.shift.isLeave');
    const isHolidayCol = this.attendanceConfig.ident(cfg, 'attendance.shift.isHoliday');
    const isWeekOffCol = this.attendanceConfig.ident(cfg, 'attendance.shift.isWeekOff');
    const isWorkShiftCol = this.attendanceConfig.ident(cfg, 'attendance.shift.isWorkShift');
    const leaveMasterCol = this.attendanceConfig.ident(cfg, 'attendance.shift.leaveMaster');
    const leaveTable = this.attendanceConfig.ident(cfg, 'attendance.leave.table');
    const leaveIdCol = this.attendanceConfig.ident(cfg, 'attendance.leave.id');
    const leaveNameCol = this.attendanceConfig.ident(cfg, 'attendance.leave.name');
    const employeeLeaveTable = this.attendanceConfig.ident(cfg, 'attendance.employeeLeave.table');
    // NOTE: EMPLOYEELEAVELIST has no employee column of its own (confirmed
    // via all_tab_columns — see attendance-config.service.ts) and no
    // LEAVEMASTER column either, so there is no 'attendance.employeeLeave.
    // employeeId' / '...leaveMaster' config key to read here. Only
    // dayPart/leaveDetailId are actually selected from ell below.
    const employeeLeaveDayPartCol = this.attendanceConfig.ident(cfg, 'attendance.employeeLeave.dayPart');
    const approvedLeaveStatus = cfg['attendance.employeeLeave.approvedStatus'] ?? 'APPROVED';
    const dutyDate = this.startOfDay(punchDate);
    const appliedLeaveTable = this.attendanceConfig.ident(cfg, 'attendance.appliedLeave.table');
    const appliedLeaveIdCol = this.attendanceConfig.ident(cfg, 'attendance.appliedLeave.id');
    const appliedLeaveEmpCol = this.attendanceConfig.ident(cfg, 'attendance.appliedLeave.employeeId');
    const appliedLeaveFromDateCol = this.attendanceConfig.ident(cfg, 'attendance.appliedLeave.fromDate');
    const appliedLeaveToDateCol = this.attendanceConfig.ident(cfg, 'attendance.appliedLeave.toDate');
    const appliedLeaveMasterCol = this.attendanceConfig.ident(cfg, 'attendance.appliedLeave.leaveMaster');
    const appliedLeaveStatusCol = this.attendanceConfig.ident(cfg, 'attendance.appliedLeave.status');

    const employeeLeaveDetailCol = this.attendanceConfig.ident(cfg, 'attendance.employeeLeave.leaveDetailId');

    // ── Eligibility-gate columns (confirmed 2026-07 by the user directly
    //    against production Oracle — see attendance-config.service.ts) ──────
    const isPunchRequiredCol = this.attendanceConfig.ident(cfg, 'attendance.employee.isPunchRequired');
    const punchCountCol = this.attendanceConfig.ident(cfg, 'attendance.employee.punchCount');
    const empStatusCol = this.attendanceConfig.ident(cfg, 'attendance.employee.status');
    const forHisCol = this.attendanceConfig.ident(cfg, 'attendance.employee.forHis');
    const activeStatusValue = cfg['attendance.employee.activeStatusValue'] ?? '75';
    const pmsEmployeeTable = this.attendanceConfig.ident(cfg, 'attendance.pmsEmployee.table');
    const pmsEmployeeIdCol = this.attendanceConfig.ident(cfg, 'attendance.pmsEmployee.employeeId');
    const relievingDateCol = this.attendanceConfig.ident(cfg, 'attendance.pmsEmployee.relievingDate');
    const scmTable = this.attendanceConfig.ident(cfg, 'attendance.serviceCenterMap.table');
    const scmEmployeeIdCol = this.attendanceConfig.ident(cfg, 'attendance.serviceCenterMap.employeeId');
    const scmServiceCenterCol = this.attendanceConfig.ident(cfg, 'attendance.serviceCenterMap.serviceCenterId');
    const scmIsActiveCol = this.attendanceConfig.ident(cfg, 'attendance.serviceCenterMap.isActive');
    const scmUpdatedAtCol = this.attendanceConfig.ident(cfg, 'attendance.serviceCenterMap.updatedAt');
    const scmCreatedAtCol = this.attendanceConfig.ident(cfg, 'attendance.serviceCenterMap.createdAt');
    const dutyPlansFkCol = this.attendanceConfig.ident(cfg, 'attendance.roster.dutyPlansFk');
    const dreTable = this.attendanceConfig.ident(cfg, 'attendance.dutyRosterEmployee.table');
    const dreIdCol = this.attendanceConfig.ident(cfg, 'attendance.dutyRosterEmployee.id');
    const dreDutyRosterIdCol = this.attendanceConfig.ident(cfg, 'attendance.dutyRosterEmployee.dutyRosterId');
    const drmTable = this.attendanceConfig.ident(cfg, 'attendance.dutyRosterMaster.table');
    const drmIdCol = this.attendanceConfig.ident(cfg, 'attendance.dutyRosterMaster.id');
    const drmServiceCenterCol = this.attendanceConfig.ident(cfg, 'attendance.dutyRosterMaster.serviceCenterId');

    let row: Record<string, unknown> | null;
    try {
      row = await this.oracle.queryOne<Record<string, unknown>>(
        `
        SELECT
          e.${employeeIdCol} AS "employeeId",
          e.${employeeCodeCol} AS "employeeCode",
          e.${isPunchRequiredCol} AS "isPunchRequired",
          e.${punchCountCol} AS "punchesRequired",
          e.${empStatusCol} AS "empStatus",
          e.${forHisCol} AS "forHis",
          pms.${relievingDateCol} AS "relievingDate",
          scm."serviceCenterId" AS "activeServiceCenterId",
          dp.${rosterIdCol} AS "rosterId",
          dp.${dateCol} AS "dutyDate",
          dp.${shiftPlanCol} AS "primaryShiftId",
          dp.${secondShiftCol} AS "secondShiftId",
          dp.${branchCol} AS "intraBranchId",
          st.${shiftCodeCol} AS "shiftCode",
          st.${shiftStartCol} AS "plannedIn",
          st.${shiftEndCol} AS "plannedOut",
          st.${secondStartCol} AS "secondPlannedIn",
          st.${secondEndCol} AS "secondPlannedOut",
          st.${isNightCol} AS "isNight",
          st.${isLeaveCol} AS "isLeave",
          st.${isHolidayCol} AS "isHoliday",
          st.${isWeekOffCol} AS "isWeekOff",
          st.${isWorkShiftCol} AS "isWorkShift",
          COALESCE(ellm.${leaveNameCol}, lm.${leaveNameCol}) AS "leaveType",
          ell.${employeeLeaveDayPartCol} AS "leaveDayPart"
        FROM ${employeeTable} e
        LEFT JOIN ${pmsEmployeeTable} pms
          ON pms.${pmsEmployeeIdCol} = e.${employeeIdCol}
        /* Current ACTIVE servicecenter assignment only. Defensively picks the
           most-recently-updated ISACTIVE=1 row if more than one somehow
           exists (should not happen, but a transfer race could momentarily
           leave two active rows) rather than letting an arbitrary Oracle
           join order decide. */
        LEFT JOIN (
          SELECT
            ${scmEmployeeIdCol} AS "employeeId",
            ${scmServiceCenterCol} AS "serviceCenterId",
            ROW_NUMBER() OVER (
              PARTITION BY ${scmEmployeeIdCol}
              ORDER BY ${scmUpdatedAtCol} DESC NULLS LAST, ${scmCreatedAtCol} DESC
            ) AS rn
          FROM ${scmTable}
          WHERE ${scmIsActiveCol} = 1
        ) scm
          ON scm."employeeId" = e.${employeeIdCol}
         AND scm.rn = 1
        LEFT JOIN ${rosterTable} dp
          ON dp.${empCol} = e.${employeeIdCol}
         /* PERF: range predicate instead of TRUNC(column) so the
            (EMPID, PLANDATE) index is usable. */
         AND dp.${dateCol} >= TRUNC(:dutyDate)
         AND dp.${dateCol} <  TRUNC(:dutyDate) + 1
         /* Scope to the employee's CURRENT active servicecenter's duty
            roster only. Without this, an employee transferred mid-month
            between servicecenters could match a DUTYPLANVALUES row created
            under their OLD servicecenter's DUTYROSTERMASTER, since
            DUTYPLANVALUES itself carries no servicecenter column directly —
            it only reaches one via DUTYPLANS -> DUTYROSTEREMPLOYEE ->
            DUTYROSTERMASTER.SERVICECENTER. If the employee has no active
            servicecenter mapping (scm."serviceCenterId" IS NULL), this EXISTS
            can never match, correctly excluding the roster row entirely. */
         AND EXISTS (
           SELECT 1
           FROM ${dreTable} dre
           JOIN ${drmTable} drm ON drm.${drmIdCol} = dre.${dreDutyRosterIdCol}
           WHERE dre.${dreIdCol} = dp.${dutyPlansFkCol}
             AND drm.${drmServiceCenterCol} = scm."serviceCenterId"
         )
        LEFT JOIN ${shiftTable} st
          ON st.${shiftIdCol} = dp.${shiftPlanCol}
        LEFT JOIN ${leaveTable} lm
          ON lm.${leaveIdCol} = st.${leaveMasterCol}
        LEFT JOIN ${appliedLeaveTable} al
          ON al.${appliedLeaveEmpCol} = e.${employeeIdCol}
        /* PERF: equivalent to TRUNC(:d) BETWEEN TRUNC(from) AND TRUNC(to)
           but sargable — no functions on the columns. */
        AND al.${appliedLeaveFromDateCol} <  TRUNC(:dutyDate) + 1
        AND al.${appliedLeaveToDateCol}   >= TRUNC(:dutyDate)
        AND UPPER(al.${appliedLeaveStatusCol}) =
            UPPER(:approvedLeaveStatus)

        LEFT JOIN ${employeeLeaveTable} ell
          ON ell.${employeeLeaveDetailCol} =
            al.${appliedLeaveIdCol}

        LEFT JOIN ${leaveTable} ellm
          ON ellm.${leaveIdCol} =
            al.${appliedLeaveMasterCol}
        WHERE e.${employeeCodeCol} = :employeeCode
        `,
        { employeeCode, dutyDate, approvedLeaveStatus },
      );
    } catch (err) {
      this.attendanceLogger.error('Roster shift resolution failed', {
        employeeCode,
        dutyDate,
        punchTime: punchDate,
        processingStage: 'ORACLE_ERROR',
        executionTimeMs: this.attendanceLogger.elapsed(startedAt),
      }, err);
      throw err;
    }

    if (!row || row.employeeId == null) {
      this.attendanceLogger.warn('Roster shift resolution did not find employee', {
        employeeCode,
        dutyDate,
        punchTime: punchDate,
        processingStage: 'SHIFT_RESOLUTION',
        executionTimeMs: this.attendanceLogger.elapsed(startedAt),
        success: false,
        failure: true,
      });
      return {
        employeeCode,
        employeeId: null,
        dutyDate,
        rosterId: null,
        shiftCode: null,
        primaryShiftId: null,
        secondShiftId: null,
        plannedIn: null,
        plannedOut: null,
        secondPlannedIn: null,
        secondPlannedOut: null,
        plannedStatus: null,
        actualStatus: null,
        approvedLeaveType: null,
        approvedLeaveDayPart: null,
        isHoliday: false,
        isWeekOff: false,
        isResigned: false,
        isNight: false,
        isWorkShift: false,
        intraBranchId: null,
        raw: null,
        isEligibleForPunch: false,
        ineligibleReason: 'Employee not found in EMPLOYEE table.',
        punchesRequired: 2,
        activeServiceCenterId: null,
      };
    }

    const plannedStatus = this.statusFromShift(row);
    const rowDutyDate = row.dutyDate ? this.startOfDay(new Date(String(row.dutyDate))) : dutyDate;
    const eligibility = this.evaluateEligibility(row, rowDutyDate, activeStatusValue);
    const roster = {
      employeeCode: String(row.employeeCode ?? employeeCode),
      employeeId: Number(row.employeeId),
      dutyDate: rowDutyDate,
      rosterId: this.str(row.rosterId),
      shiftCode: this.str(row.shiftCode),
      primaryShiftId: this.num(row.primaryShiftId),
      secondShiftId: this.num(row.secondShiftId),
      plannedIn: this.parseOracleDate(row.plannedIn, rowDutyDate),
      plannedOut: this.parseOracleDate(row.plannedOut, rowDutyDate),
      secondPlannedIn: this.parseOracleDate(row.secondPlannedIn, rowDutyDate),
      secondPlannedOut: this.parseOracleDate(row.secondPlannedOut, rowDutyDate),
      plannedStatus,
      actualStatus: null,
      approvedLeaveType: this.str(row.leaveType),
      approvedLeaveDayPart: this.leaveDayPart(row.leaveDayPart),
      isHoliday: this.flag(row.isHoliday),
      isWeekOff: this.flag(row.isWeekOff),
      isResigned: plannedStatus === 'RESIGNED',
      isNight: String(row.isNight ?? '').toUpperCase() === 'Y' || this.flag(row.isNight),
      isWorkShift: this.flag(row.isWorkShift),
      intraBranchId: this.num(row.intraBranchId),
      raw: row,
      isEligibleForPunch: eligibility.isEligibleForPunch,
      ineligibleReason: eligibility.ineligibleReason,
      punchesRequired: eligibility.punchesRequired,
      activeServiceCenterId: eligibility.activeServiceCenterId,
    };
    if (!eligibility.isEligibleForPunch) {
      this.attendanceLogger.info('Employee not eligible for punch tracking', {
        employeeCode: roster.employeeCode,
        employeeId: roster.employeeId,
        dutyDate: roster.dutyDate,
        processingStage: 'SHIFT_RESOLUTION',
        success: true,
        metadata: { reason: eligibility.ineligibleReason },
      });
    }
    this.attendanceLogger.info('Roster shift resolved', {
      employeeCode: roster.employeeCode,
      employeeId: roster.employeeId,
      dutyDate: roster.dutyDate,
      shiftCode: roster.shiftCode,
      punchTime: punchDate,
      processingStage: 'SHIFT_RESOLUTION',
      executionTimeMs: this.attendanceLogger.elapsed(startedAt),
      success: true,
      metadata: {
        rosterId: roster.rosterId,
        plannedStatus,
        isNight: roster.isNight,
        isWeekOff: roster.isWeekOff,
        isHoliday: roster.isHoliday,
      },
    });
    this.attendanceLogger.info('Leave resolution completed', {
      employeeCode: roster.employeeCode,
      employeeId: roster.employeeId,
      dutyDate: roster.dutyDate,
      shiftCode: roster.shiftCode,
      processingStage: 'LEAVE_RESOLUTION',
      executionTimeMs: this.attendanceLogger.elapsed(startedAt),
      success: true,
      metadata: {
        approvedLeaveType: roster.approvedLeaveType,
        approvedLeaveDayPart: roster.approvedLeaveDayPart,
      },
    });
    return roster;
  }

  /**
   * Bulk roster scan used by NpnlSweepService: finds every employee rostered
   * for `date` whose shift start time (SHIFT_TYPE.START_TIMING) plus
   * `graceMinutes` has already elapsed. Intentionally does NOT filter out
   * leave/holiday/week-off here — that classification is already handled
   * correctly, per-employee, by resolve() + AttendanceDecisionEngine (which
   * also needs the APPLIEDLEAVES join that a bulk query can't cheaply
   * replicate). This method only answers "whose shift-start deadline has
   * passed", leaving the actual NPNL/LEAVE/HOLIDAY/WEEK_OFF classification
   * to the existing per-employee pipeline.
   */
  async findNpnlSweepCandidates(
    date: Date,
    graceMinutes: number,
    limit = 5000,
  ): Promise<{ employeeCode: string; dutyDate: Date; plannedIn: Date | null }[]> {
    const cfg = await this.attendanceConfig.getConfig();
    const employeeTable = this.attendanceConfig.ident(cfg, 'attendance.employee.table');
    const employeeIdCol = this.attendanceConfig.ident(cfg, 'attendance.employee.id');
    const employeeCodeCol = this.attendanceConfig.ident(cfg, 'attendance.employee.code');
    const rosterTable = this.attendanceConfig.ident(cfg, 'attendance.roster.table');
    const empCol = this.attendanceConfig.ident(cfg, 'attendance.roster.employeeId');
    const dateCol = this.attendanceConfig.ident(cfg, 'attendance.roster.dutyDate');
    const shiftPlanCol = this.attendanceConfig.ident(cfg, 'attendance.roster.primaryShift');
    const shiftTable = this.attendanceConfig.ident(cfg, 'attendance.shift.table');
    const shiftIdCol = this.attendanceConfig.ident(cfg, 'attendance.shift.id');
    const shiftStartCol = this.attendanceConfig.ident(cfg, 'attendance.shift.start');

    const dutyDate = this.startOfDay(date);
    const startedAt = this.attendanceLogger.time();
    let rows: Record<string, unknown>[];
    try {
      rows = await this.oracle.query<Record<string, unknown>>(
        `
        SELECT * FROM (
          SELECT
            e.${employeeCodeCol} AS "employeeCode",
            st.${shiftStartCol} AS "plannedIn"
          FROM ${rosterTable} dp
          JOIN ${employeeTable} e ON e.${employeeIdCol} = dp.${empCol}
          LEFT JOIN ${shiftTable} st ON st.${shiftIdCol} = dp.${shiftPlanCol}
          /* PERF: range predicate instead of TRUNC(column) so the
             (EMPID, PLANDATE) index is usable. */
          WHERE dp.${dateCol} >= TRUNC(:dutyDate) AND dp.${dateCol} < TRUNC(:dutyDate) + 1
          ORDER BY e.${employeeCodeCol} ASC
        )
        WHERE ROWNUM <= :limit
        `,
        { dutyDate, limit },
        { maxRows: limit },
      );
    } catch (err) {
      this.attendanceLogger.error('NPNL sweep roster scan failed', {
        dutyDate,
        processingStage: 'ORACLE_ERROR',
        executionTimeMs: this.attendanceLogger.elapsed(startedAt),
      }, err);
      throw err;
    }

    const now = Date.now();
    const graceMs = graceMinutes * 60_000;
    const candidates: { employeeCode: string; dutyDate: Date; plannedIn: Date | null }[] = [];
    for (const row of rows) {
      const employeeCode = row.employeeCode == null ? '' : String(row.employeeCode).trim();
      if (!employeeCode) continue;
      const plannedIn = this.parseOracleDate(row.plannedIn, dutyDate);
      // No resolvable shift-start time — can't determine whether the grace
      // period has elapsed, so skip rather than guess.
      if (!plannedIn) continue;
      if (now - plannedIn.getTime() < graceMs) continue;
      candidates.push({ employeeCode, dutyDate, plannedIn });
    }

    this.attendanceLogger.info('NPNL sweep roster scan completed', {
      dutyDate,
      processingStage: 'SHIFT_RESOLUTION',
      executionTimeMs: this.attendanceLogger.elapsed(startedAt),
      success: true,
      metadata: { rosterRows: rows.length, candidateCount: candidates.length, graceMinutes },
    });

    return candidates;
  }

  /**
   * Combines the four independent eligibility conditions confirmed by the
   * user against production Oracle (see attendance-config.service.ts for the
   * schema notes). All four must pass for the employee to be considered for
   * punch tracking at all:
   *   1. EMPLOYEE.ISPUNCHREQUIRED = 1
   *   2. EMPLOYEE.FOR_HIS != 1 (FOR_HIS=1 is a system/admin account, e.g. an
   *      HIS-configuration login — never a real staff member)
   *   3. EMPLOYEE.EMP_STATUS equals the configured "active" value
   *   4. PMS_EMPLOYEE.RELIEVINGDATE is null, or dutyDate is on/before it
   *      (relieving date itself still counts; excluded from the day after)
   *   5. The employee has a currently-ACTIVE EMPLOYEESCMAPFORDUTYROSTER row
   *      (surfaced here as activeServiceCenterId being non-null)
   */
  private evaluateEligibility(
    row: Record<string, unknown>,
    dutyDate: Date,
    activeStatusValue: string,
  ): {
    isEligibleForPunch: boolean;
    ineligibleReason: string | null;
    punchesRequired: 1 | 2;
    activeServiceCenterId: number | null;
  } {
    const isPunchRequired = this.flag(row.isPunchRequired);
    // FOR_HIS=1 marks a system/admin account (e.g. an HIS-configuration
    // login), never a real employee. Normal employees have 0 or null.
    const isForHisAccount = this.flag(row.forHis);
    const punchesRequired: 1 | 2 = Number(row.punchesRequired) === 1 ? 1 : 2;
    const empStatus = row.empStatus == null ? '' : String(row.empStatus).trim();
    const isActiveEmployee = empStatus === String(activeStatusValue).trim();
    const relievingDate = row.relievingDate ? this.startOfDay(new Date(String(row.relievingDate))) : null;
    // Excluded starting the day AFTER RELIEVINGDATE — the relieving date
    // itself is still a valid working/punchable day.
    const isRelieved = relievingDate != null && dutyDate.getTime() > relievingDate.getTime();
    const activeServiceCenterId = row.activeServiceCenterId == null ? null : this.num(row.activeServiceCenterId);
    const hasActiveServiceCenter = activeServiceCenterId != null;

    let ineligibleReason: string | null = null;
    if (!isPunchRequired) {
      ineligibleReason = 'EMPLOYEE.ISPUNCHREQUIRED is not set (employee is exempted from punch tracking).';
    } else if (isForHisAccount) {
      ineligibleReason = 'EMPLOYEE.FOR_HIS = 1 (this is a system/admin account, not a real employee).';
    } else if (!isActiveEmployee) {
      ineligibleReason = `EMPLOYEE.EMP_STATUS ('${empStatus}') is not the active status ('${activeStatusValue}').`;
    } else if (isRelieved) {
      ineligibleReason = `Employee was relieved on ${relievingDate!.toISOString().slice(0, 10)} (before this duty date).`;
    } else if (!hasActiveServiceCenter) {
      ineligibleReason = 'Employee has no currently-ACTIVE EMPLOYEESCMAPFORDUTYROSTER mapping.';
    }

    return {
      isEligibleForPunch: ineligibleReason === null,
      ineligibleReason,
      punchesRequired,
      activeServiceCenterId,
    };
  }

  private parseOracleDate(value: unknown, dutyDate: Date): Date | null {
    if (!value) return null;
    if (value instanceof Date) return value;
    const raw = String(value).trim();
    if (/^\d{1,2}:\d{2}/.test(raw)) {
      const [hh, mm] = raw.split(':').map((part) => parseInt(part, 10));
      const date = new Date(dutyDate);
      date.setHours(hh, mm, 0, 0);
      return date;
    }
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private startOfDay(date: Date): Date {
    const copy = new Date(date);
    copy.setHours(0, 0, 0, 0);
    return copy;
  }

  private str(value: unknown): string | null {
    return value == null ? null : String(value).trim().toUpperCase();
  }

  private num(value: unknown): number | null {
    if (value == null || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private flag(value: unknown): boolean {
    return Number(value ?? 0) === 1 || String(value ?? '').toUpperCase() === 'Y';
  }

  private leaveDayPart(value: unknown): LeaveDayPart | null {
    const normalized = String(value ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_');
    if (['MORNING_HALF', 'FIRST_HALF', 'FH', 'AM'].includes(normalized)) return 'MORNING_HALF';
    if (['AFTERNOON_HALF', 'SECOND_HALF', 'SH', 'PM'].includes(normalized)) return 'AFTERNOON_HALF';
    if (['FULL_DAY', 'FULL', 'FD'].includes(normalized)) return 'FULL_DAY';
    return null;
  }

  private statusFromShift(row: Record<string, unknown>): string | null {
    if (this.flag(row.isLeave)) return 'LEAVE';
    if (this.flag(row.isHoliday)) return 'HOLIDAY';
    if (this.flag(row.isWeekOff)) return 'WEEK_OFF';
    if (this.flag(row.isWorkShift)) return 'DUTY';
    return this.str(row.shiftCode);
  }
}
