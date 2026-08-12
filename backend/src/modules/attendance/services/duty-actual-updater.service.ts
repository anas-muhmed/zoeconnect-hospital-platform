import { Inject, Injectable } from '@nestjs/common';
import { IOracleTransport } from '../../platform/infrastructure/oracle/oracle-transport.interface';
import { ORACLE_TRANSPORT } from '../../platform/infrastructure/tokens';
import { AttendanceConfigService } from './attendance-config.service';
import { AttendanceStructuredLogger } from './attendance-structured-logger.service';
import type { AttendanceDecision, RosterContext } from '../attendance.types';

@Injectable()
export class DutyActualUpdater {
  constructor(
    @Inject(ORACLE_TRANSPORT) private readonly oracle: IOracleTransport,
    private readonly attendanceConfig: AttendanceConfigService,
    private readonly attendanceLogger: AttendanceStructuredLogger,
  ) {}

  async getCurrentActual(roster: RosterContext): Promise<Record<string, unknown> | null> {
    if (!roster.employeeId) return null;
    const cfg = await this.attendanceConfig.getConfig();
    const table = this.attendanceConfig.ident(cfg, 'attendance.actual.table');
    const empCol = this.attendanceConfig.ident(cfg, 'attendance.actual.employeeId');
    const dateCol = this.attendanceConfig.ident(cfg, 'attendance.actual.dutyDate');
    return this.oracle.queryOne<Record<string, unknown>>(
      // PERF: range predicate instead of TRUNC(column) so the (EMPID, ACTUALDATE) index is usable.
      `SELECT * FROM ${table} WHERE ${empCol} = :employeeId AND ${dateCol} >= TRUNC(:dutyDate) AND ${dateCol} < TRUNC(:dutyDate) + 1`,
      { employeeId: roster.employeeId, dutyDate: roster.dutyDate },
    );
  }

  async upsert(roster: RosterContext, decision: AttendanceDecision): Promise<Record<string, unknown>> {
    const startedAt = this.attendanceLogger.time();
    if (!roster.employeeId) {
      throw new Error(`Cannot update DUTYACTUALVALUES: employee not resolved for code ${roster.employeeCode}`);
    }

    const cfg = await this.attendanceConfig.getConfig();
    const table = this.attendanceConfig.ident(cfg, 'attendance.actual.table');
    const idCol = this.attendanceConfig.ident(cfg, 'attendance.actual.id');
    const sequence = this.attendanceConfig.ident(cfg, 'attendance.actual.sequence');
    const empCol = this.attendanceConfig.ident(cfg, 'attendance.actual.employeeId');
    const dateCol = this.attendanceConfig.ident(cfg, 'attendance.actual.dutyDate');
    const dayCol = this.attendanceConfig.ident(cfg, 'attendance.actual.dayOfMonth');
    const shiftCol = this.attendanceConfig.ident(cfg, 'attendance.actual.primaryShift');
    const secondShiftCol = this.attendanceConfig.ident(cfg, 'attendance.actual.secondShift');
    const statusCol = this.attendanceConfig.ident(cfg, 'attendance.actual.status');
    const inCol = this.attendanceConfig.ident(cfg, 'attendance.actual.inPunch');
    const outCol = this.attendanceConfig.ident(cfg, 'attendance.actual.outPunch');
    const inTimeCol = this.attendanceConfig.ident(cfg, 'attendance.actual.inTime');
    const outTimeCol = this.attendanceConfig.ident(cfg, 'attendance.actual.outTime');
    const durationCol = this.attendanceConfig.ident(cfg, 'attendance.actual.duration');
    const durationMinutesCol = this.attendanceConfig.ident(cfg, 'attendance.actual.durationMinutes');
    const remarksCol = this.attendanceConfig.ident(cfg, 'attendance.actual.remarks');
    const branchCol = this.attendanceConfig.ident(cfg, 'attendance.actual.intraBranchId');
    const correspondingDayCol = this.attendanceConfig.ident(cfg, 'attendance.actual.correspondingDutyDay');
    const remark = `ZoeConnect realtime: ${decision.reasonCode} (${decision.reason})`;
    const actualShiftId = await this.resolveActualShiftId(cfg, roster, decision);
    const status = this.toHisStatus(decision.status);

    try {
      await this.oracle.execute(
        `
        MERGE INTO ${table} target
        USING (
          SELECT
            :employeeId AS ${empCol},
            :dutyDate AS ${dateCol},
            :dayOfMonth AS ${dayCol},
            :shiftActual AS ${shiftCol},
            :secondShift AS ${secondShiftCol},
            :status AS ${statusCol},
            :inPunch AS ${inCol},
            :outPunch AS ${outCol},
            :inTime AS ${inTimeCol},
            :outTime AS ${outTimeCol},
            :duration AS ${durationCol},
            :durationMinutes AS ${durationMinutesCol},
            :intraBranchId AS ${branchCol},
            :remarks AS ${remarksCol}
          FROM dual
        ) source
        /* PERF: range predicate instead of TRUNC(target.col) so the
           (EMPID, ACTUALDATE) index is usable and the MERGE does not
           full-scan + lock-scan DUTYACTUALVALUES, which HIS also writes. */
        ON (target.${empCol} = source.${empCol}
            AND target.${dateCol} >= TRUNC(source.${dateCol})
            AND target.${dateCol} <  TRUNC(source.${dateCol}) + 1)
        WHEN MATCHED THEN UPDATE SET
          target.${shiftCol} = source.${shiftCol},
          target.${secondShiftCol} = source.${secondShiftCol},
          target.${statusCol} = source.${statusCol},
          target.${inCol} = source.${inCol},
          target.${outCol} = source.${outCol},
          target.${inTimeCol} = source.${inTimeCol},
          target.${outTimeCol} = source.${outTimeCol},
          target.${durationCol} = source.${durationCol},
          target.${durationMinutesCol} = source.${durationMinutesCol},
          target.${branchCol} = source.${branchCol},
          target.${remarksCol} = source.${remarksCol}
        WHEN NOT MATCHED THEN INSERT (
          ${idCol}, ${empCol}, ${dateCol}, ${dayCol}, ${correspondingDayCol},
          ${shiftCol}, ${secondShiftCol}, ${statusCol}, ${inCol}, ${outCol},
          ${inTimeCol}, ${outTimeCol}, ${durationCol}, ${durationMinutesCol}, ${branchCol}, ${remarksCol}
        ) VALUES (
          ${sequence}, source.${empCol}, source.${dateCol}, source.${dayCol}, source.${dateCol},
          source.${shiftCol}, source.${secondShiftCol}, source.${statusCol}, source.${inCol}, source.${outCol},
          source.${inTimeCol}, source.${outTimeCol}, source.${durationCol}, source.${durationMinutesCol}, source.${branchCol}, source.${remarksCol}
        )
        `,
        {
          employeeId: roster.employeeId,
          dutyDate: roster.dutyDate,
          dayOfMonth: roster.dutyDate.getDate(),
          shiftActual: actualShiftId,
          secondShift: roster.secondShiftId,
          status,
          inPunch: decision.inPunch,
          outPunch: decision.outPunch,
          inTime: this.formatTime(decision.inPunch),
          outTime: this.formatTime(decision.outPunch),
          duration: decision.workMinutes ? decision.workMinutes / 60 : null,
          durationMinutes: decision.workMinutes || null,
          intraBranchId: roster.intraBranchId,
          remarks: remark.slice(0, 256),
        },
      );
    } catch (err) {
      this.attendanceLogger.error('DUTYACTUALVALUES update failed', {
        employeeCode: roster.employeeCode,
        employeeId: roster.employeeId,
        dutyDate: roster.dutyDate,
        shiftCode: roster.shiftCode,
        processingStage: 'ORACLE_ERROR',
        decision: decision.status,
        executionTimeMs: this.attendanceLogger.elapsed(startedAt),
      }, err);
      throw err;
    }

    this.attendanceLogger.info('FROMTIME and TOTIME recalculated', {
      employeeCode: roster.employeeCode,
      employeeId: roster.employeeId,
      dutyDate: roster.dutyDate,
      shiftCode: roster.shiftCode,
      processingStage: 'FROMTIME_TOTIME_UPDATE',
      decision: decision.status,
      success: true,
      metadata: {
        fromTime: this.formatTime(decision.inPunch),
        toTime: this.formatTime(decision.outPunch),
        inPunch: decision.inPunch?.toISOString() ?? null,
        outPunch: decision.outPunch?.toISOString() ?? null,
      },
    });

    this.attendanceLogger.info('DUTYACTUALVALUES updated', {
      employeeCode: roster.employeeCode,
      employeeId: roster.employeeId,
      dutyDate: roster.dutyDate,
      shiftCode: roster.shiftCode,
      processingStage: 'DUTYACTUALVALUES_UPDATE',
      decision: decision.status,
      executionTimeMs: this.attendanceLogger.elapsed(startedAt),
      success: true,
      metadata: {
        attendance: status,
        shiftActual: actualShiftId,
        secondShift: roster.secondShiftId,
        workMinutes: decision.workMinutes,
      },
    });

    return {
      employeeCode: roster.employeeCode,
      employeeId: roster.employeeId,
      dutyDate: roster.dutyDate.toISOString().slice(0, 10),
      status,
      shiftActual: actualShiftId,
      inPunch: decision.inPunch?.toISOString() ?? null,
      outPunch: decision.outPunch?.toISOString() ?? null,
      lateMinutes: decision.lateMinutes,
      earlyGoingMinutes: decision.earlyGoingMinutes,
      workMinutes: decision.workMinutes,
      remarks: remark,
    };
  }

  private async resolveActualShiftId(
    cfg: Record<string, string>,
    roster: RosterContext,
    decision: AttendanceDecision,
  ): Promise<number | null> {
    if (['PRESENT', 'LATE_COMING', 'EARLY_GOING', 'HALF_DAY', 'LEAVE', 'HOLIDAY', 'WEEK_OFF'].includes(decision.status)) {
      if (decision.actualShiftCode) {
        const shiftByCode = await this.resolveShiftIdByCode(cfg, roster, decision.actualShiftCode);
        if (shiftByCode != null) return shiftByCode;
      }
      return roster.primaryShiftId;
    }

    const shiftTable = this.attendanceConfig.ident(cfg, 'attendance.shift.table');
    const idCol = this.attendanceConfig.ident(cfg, 'attendance.shift.id');
    const missPunchCol = this.attendanceConfig.ident(cfg, 'attendance.shift.missPunch');
    const npnlCol = this.attendanceConfig.ident(cfg, 'attendance.shift.noPunchNoLeave');
    const branchCol = this.attendanceConfig.ident(cfg, 'attendance.roster.intraBranchId');
    const flagCol = decision.status === 'NPNL' ? npnlCol : missPunchCol;

    // ROWNUM fix: Oracle evaluates ROWNUM before ORDER BY when both appear in
    // the same SELECT block, making ORDER BY a no-op on a single-row result.
    // Wrapping the ordered query in a subquery ensures ORDER BY is applied
    // first, then ROWNUM selects the first row from the ordered result.
    //
    // NOTE: the :branchId bind is ALWAYS present in the SQL text, even when
    // roster.intraBranchId is null/0/undefined — do not build this predicate
    // conditionally (e.g. `roster.intraBranchId ? '...:branchId...' : ''`).
    // oracledb's object-style binds require the bind object's key count to
    // exactly match the number of :placeholders in the SQL; a branchId key
    // with no matching placeholder throws NJS-098 ("N bind placeholders were
    // used ... but M bind values were provided"), which crashed this write
    // for every employee with no INTRABRANCHID set and dead-lettered the
    // event after 5 retries. `:branchId IS NULL` makes the predicate a
    // deliberate no-op when there's no branch to filter on.
    const row = await this.oracle.queryOne<Record<string, unknown>>(
      `
      SELECT "id" FROM (
        SELECT ${idCol} AS "id"
        FROM ${shiftTable}
        WHERE ${flagCol} = 1
          AND (:branchId IS NULL OR ${branchCol} = :branchId OR ${branchCol} IS NULL)
        ORDER BY ${branchCol} NULLS LAST
      ) WHERE ROWNUM = 1
      `,
      { branchId: roster.intraBranchId ?? null },
    );
    return row?.id == null ? roster.primaryShiftId : Number(row.id);
  }

  private async resolveShiftIdByCode(
    cfg: Record<string, string>,
    roster: RosterContext,
    shiftCode: string,
  ): Promise<number | null> {
    const shiftTable = this.attendanceConfig.ident(cfg, 'attendance.shift.table');
    const idCol = this.attendanceConfig.ident(cfg, 'attendance.shift.id');
    const codeCol = this.attendanceConfig.ident(cfg, 'attendance.shift.code');
    const branchCol = this.attendanceConfig.ident(cfg, 'attendance.roster.intraBranchId');

    // ROWNUM fix: same subquery pattern as resolveActualShiftId above.
    // NOTE: same NJS-098 fix as resolveActualShiftId() above — :branchId
    // must always appear in the SQL text, matching the bind object's key
    // count exactly, regardless of whether roster.intraBranchId is set.
    const row = await this.oracle.queryOne<Record<string, unknown>>(
      `
      SELECT "id" FROM (
        SELECT ${idCol} AS "id"
        FROM ${shiftTable}
        WHERE UPPER(${codeCol}) = UPPER(:shiftCode)
          AND (:branchId IS NULL OR ${branchCol} = :branchId OR ${branchCol} IS NULL)
        ORDER BY ${branchCol} NULLS LAST
      ) WHERE ROWNUM = 1
      `,
      { shiftCode, branchId: roster.intraBranchId ?? null },
    );
    return row?.id == null ? null : Number(row.id);
  }

  private formatTime(value: Date | null): string | null {
    if (!value) return null;
    return `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`;
  }

  private toHisStatus(status: AttendanceDecision['status']): string {
    const map: Record<AttendanceDecision['status'], string> = {
      PRESENT: 'Present',
      MISS_PUNCH: 'Miss Punch',
      MISSING_IN: 'Miss Punch',
      MISSING_OUT: 'Miss Punch',
      NPNL: 'NPNL',
      LEAVE: 'Leave',
      HOLIDAY: 'Holiday',
      WEEK_OFF: 'Week Off',
      LATE_COMING: 'Present',
      EARLY_GOING: 'Present',
      HALF_DAY: 'Half Day',
      INVALID: 'Miss Punch',
      NO_ROSTER: 'Miss Punch',
      // Unreachable in practice: AttendanceProcessor.processEvent() short-
      // circuits and returns before calling upsert() whenever
      // decision.status === 'INELIGIBLE' (see attendance-processor.service.ts)
      // — an ineligible employee (ISPUNCHREQUIRED=0, inactive, relieved, or no
      // active servicecenter mapping) must never get a DUTYACTUALVALUES row
      // written at all. This entry exists only to satisfy the exhaustive
      // Record<AttendanceDecision['status'], string> type.
      INELIGIBLE: 'NPNL',
    };
    return map[status];
  }
}
