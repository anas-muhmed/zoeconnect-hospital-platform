/**
 * Phase 2A — LeaveDependencyPoller
 *
 * Polls Oracle EMPLOYEELEAVELIST and emits one AttendanceDependencyChangedEvent
 * { source: 'LEAVE' } per row currently inside a rolling FROMDATE window.
 *
 * Why not an incremental (LASTMODIFIEDDATE) cursor:
 *   EMPLOYEELEAVELIST has no modification-timestamp column in the actual HIS
 *   Oracle schema — confirmed by production ORA-00904 ("L"."LASTMODIFIEDDATE":
 *   invalid identifier). There is no reliable substitute column, so
 *   incremental polling is not possible for this table. This mirrors
 *   DUTYPLANVALUES (see DutyPlanDependencyPoller); the same redesign applies.
 *
 * Why FROMDATE alone, not a FROMDATE/TODATE range:
 *   EMPLOYEELEAVELIST is a one-row-per-leave-day table, like DUTYPLANVALUES'
 *   PLANDATE — NOT a date-range table. There is no TODATE column here; date
 *   ranges belong to APPLIEDLEAVES (a different table), not this one.
 *
 * Redesign — periodic full-window refresh:
 *   Every poll cycle re-scans all EMPLOYEELEAVELIST rows whose FROMDATE falls
 *   within [today - refreshPastDays, today + refreshFutureDays] (defaults:
 *   1 day back, 14 days ahead — configurable via
 *   DEPENDENCY_LEAVE_REFRESH_PAST_DAYS / _FUTURE_DAYS) and emits an event for
 *   every row found. This is a superset re-check rather than a diff, but it
 *   requires no modification signal from HIS and is self-healing — any leave
 *   record change (INSERT/UPDATE/DELETE, approval flips, etc.) is picked up
 *   on the next cycle regardless of how it was made. Downstream
 *   recalculation is idempotent, so re-emitting unchanged rows is safe.
 *
 * Confirmed schema (2026-07-04, via all_tab_columns against production
 * Oracle): EMPLOYEELEAVELIST has ID, DAYS, FROMDATE, STATUS, LEAVEDETAILID,
 * LEAVESLOT, COMPENSATIONDATE, INTRABRANCHID — and critically, NO employee
 * column at all (no EMPID, no EMPCODE). Three earlier guesses (EMPID,
 * TODATE, EMPCODE), based on a HIS reverse-engineering document's decompiled
 * SQL, were each individually disproved by production ORA-00904s. The only
 * way to find the employee for an EMPLOYEELEAVELIST row is to walk:
 *   EMPLOYEELEAVELIST.LEAVEDETAILID -> APPLIEDLEAVES.ID
 *   APPLIEDLEAVES.EMPID             -> EMPLOYEE.EMPLOYEE_ID
 *   EMPLOYEE.EMPNO                  =  employeeCode
 * (APPLIEDLEAVES.EMPID -> EMPLOYEE.EMPLOYEE_ID is the same join already used,
 * and working, in roster-resolver.service.ts.)
 *
 * Architectural constraints: same as DutyPlanDependencyPoller.
 * Disabled via DEPENDENCY_LEAVE_POLL_ENABLED=false.
 */

import { Inject, Injectable } from '@nestjs/common';
import { InjectRedis } from '../../../../common/redis/redis.provider';
import type { Redis } from 'ioredis';
import { IOracleTransport } from '../../../platform/infrastructure/oracle/oracle-transport.interface';
import { ORACLE_TRANSPORT } from '../../../platform/infrastructure/tokens';
import { AttendanceConfigService } from '../../services/attendance-config.service';
import { AttendanceStructuredLogger } from '../../services/attendance-structured-logger.service';
import { DependencyEventRouter } from '../../services/dependency-event-router.service';
import { LeaveMapper } from '../mappers/leave.mapper';
import type { AttendanceDependencyPoller, PollerMetrics } from '../interfaces/attendance-dependency-poller.interface';

// One-shot window-floor override — see DutyPlanDependencyPoller for the full
// rationale. Normally the floor is just (today - refreshPastDays),
// recomputed fresh every poll; this key only matters right after
// resetCursor() is called.
const WINDOW_OVERRIDE_KEY = 'attendance:dep:leave:cursor';
const DEFAULT_BATCH = 500;

function startOfUtcDay(d: Date): Date {
  return new Date(new Date(d).setUTCHours(0, 0, 0, 0));
}

function addDays(d: Date, days: number): Date {
  const next = new Date(d);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

@Injectable()
export class LeaveDependencyPoller implements AttendanceDependencyPoller {
  readonly name = 'LeaveDependencyPoller';

  private _metrics: PollerMetrics = {
    enabled:            true,
    running:            false,
    lastPollAt:         null,
    lastSuccessAt:      null,
    rowsLastPoll:       0,
    eventsEmittedTotal: 0,
    errorsTotal:        0,
    lastError:          null,
    cursor:             null,
  };

  constructor(
    @InjectRedis() private readonly redis: Redis,
    @Inject(ORACLE_TRANSPORT) private readonly oracle: IOracleTransport,
    private readonly attendanceConfig: AttendanceConfigService,
    private readonly router: DependencyEventRouter,
    private readonly attendanceLogger: AttendanceStructuredLogger,
  ) {}

  // ── Public API ─────────────────────────────────────────────────────────────

  getMetrics(): PollerMetrics {
    return { ...this._metrics };
  }

  /**
   * Forces the NEXT poll's window floor back to the given date — e.g. to
   * force a deeper historical re-scan after a HIS data fix. One-shot:
   * consumed and cleared by the next poll().
   */
  async resetCursor(date: Date): Promise<void> {
    const floor = startOfUtcDay(date);
    await this.redis.set(WINDOW_OVERRIDE_KEY, floor.toISOString());
    this._metrics.cursor = floor.toISOString();
    this.attendanceLogger.info('Leave refresh window floor override set for next poll', {
      processingStage: 'DEPENDENCY_POLL_LEAVE',
      success: true,
      metadata: { windowFloorOverride: floor.toISOString() },
    });
  }

  async poll(): Promise<void> {
    if (!await this.isEnabled()) {
      this._metrics.enabled = false;
      return;
    }
    this._metrics.enabled = true;

    if (this._metrics.running) return;

    this._metrics.running = true;
    const startedAt = this.attendanceLogger.time();
    const pollTime  = new Date();

    try {
      if (!this.oracle.isAvailable) {
        this.attendanceLogger.warn('Leave poller: Oracle unavailable', {
          processingStage: 'DEPENDENCY_POLL_LEAVE',
          success: false,
        });
        return;
      }

      const { depPollBatchSize: limit, depLeaveRefreshPastDays, depLeaveRefreshFutureDays } =
        await this.attendanceConfig.getRuntimeConfig();
      const cfg = await this.attendanceConfig.getConfig();

      const windowStart = await this.getWindowStart(depLeaveRefreshPastDays, pollTime);
      const windowEnd    = addDays(startOfUtcDay(pollTime), depLeaveRefreshFutureDays);

      const leaveTable       = this.attendanceConfig.ident(cfg, 'attendance.employeeLeave.table');
      const leaveDateCol     = this.attendanceConfig.ident(cfg, 'attendance.employeeLeave.leaveDate');
      const leaveDetailIdCol = this.attendanceConfig.ident(cfg, 'attendance.employeeLeave.leaveDetailId');
      const appliedTable     = this.attendanceConfig.ident(cfg, 'attendance.appliedLeave.table');
      const appliedIdCol     = this.attendanceConfig.ident(cfg, 'attendance.appliedLeave.id');
      const appliedEmpCol    = this.attendanceConfig.ident(cfg, 'attendance.appliedLeave.employeeId');
      const empTable         = this.attendanceConfig.ident(cfg, 'attendance.employee.table');
      const empPkCol         = this.attendanceConfig.ident(cfg, 'attendance.employee.id');
      const empNoCol         = this.attendanceConfig.ident(cfg, 'attendance.employee.code');

      // EMPLOYEELEAVELIST has no employee column of its own — walk
      // LEAVEDETAILID -> APPLIEDLEAVES.ID -> APPLIEDLEAVES.EMPID ->
      // EMPLOYEE.EMPLOYEE_ID to reach EMPNO. There is no TODATE column on
      // EMPLOYEELEAVELIST (see file header) — each row is one leave day, so
      // we window on FROMDATE alone, same as DutyPlan windows on PLANDATE.
      const rows = await this.oracle.query<Record<string, unknown>>(
        `SELECT * FROM (
           SELECT
             e.${empNoCol}      AS "employeeCode",
             l.${leaveDateCol}  AS "leaveDate"
           FROM ${leaveTable} l
           LEFT JOIN ${appliedTable} al ON al.${appliedIdCol} = l.${leaveDetailIdCol}
           LEFT JOIN ${empTable} e      ON e.${empPkCol}      = al.${appliedEmpCol}
           WHERE l.${leaveDateCol} >= :windowStart
             AND l.${leaveDateCol} <= :windowEnd
           ORDER BY l.${leaveDateCol} ASC
         )
         WHERE ROWNUM <= :limit`,
        { windowStart, windowEnd, limit },
        { maxRows: limit },
      );

      this._metrics.rowsLastPoll = rows.length;
      this._metrics.lastPollAt   = pollTime;

      let emitted = 0;

      for (const raw of rows) {
        const row = LeaveMapper.mapRow(raw);
        if (!row) continue; // unparseable FROMDATE — skip

        const event = LeaveMapper.toEvent(row, pollTime);
        await this.router.route(event);
        emitted++;
      }

      this._metrics.eventsEmittedTotal += emitted;
      this._metrics.lastSuccessAt       = new Date();
      this._metrics.lastError           = null;

      this.attendanceLogger.info('Leave dependency poll completed', {
        processingStage: 'DEPENDENCY_POLL_LEAVE',
        executionTimeMs: this.attendanceLogger.elapsed(startedAt),
        success: true,
        metadata: {
          windowStart: windowStart.toISOString(),
          windowEnd:   windowEnd.toISOString(),
          rowsFetched: rows.length,
          emitted,
          limit,
        },
      });
    } catch (err) {
      this._metrics.errorsTotal++;
      this._metrics.lastError  = (err as Error).message;
      this._metrics.lastPollAt = new Date();

      this.attendanceLogger.error('Leave dependency poll failed', {
        processingStage: 'DEPENDENCY_POLL_LEAVE',
        executionTimeMs: this.attendanceLogger.elapsed(startedAt),
        success: false,
        failure: true,
      }, err);
    } finally {
      this._metrics.running = false;
    }
  }

  // ── Window helpers ───────────────────────────────────────────────────────────

  /**
   * Normally returns (today - refreshPastDays), recomputed fresh every poll.
   * If resetCursor() left a one-shot override in Redis, it is applied for
   * this single poll (clamped to widen, never shrink, the window) and then
   * cleared — see DutyPlanDependencyPoller.getWindowStart() for the same
   * pattern with full rationale.
   */
  private async getWindowStart(refreshPastDays: number, pollTime: Date): Promise<Date> {
    const defaultFloor = addDays(startOfUtcDay(pollTime), -Math.abs(refreshPastDays));

    const override = await this.redis.get(WINDOW_OVERRIDE_KEY);
    if (override) {
      await this.redis.del(WINDOW_OVERRIDE_KEY);
      const overrideDate = new Date(override);
      const floor = !isNaN(overrideDate.getTime()) && overrideDate < defaultFloor
        ? overrideDate
        : defaultFloor;
      this._metrics.cursor = floor.toISOString();
      return floor;
    }

    this._metrics.cursor = defaultFloor.toISOString();
    return defaultFloor;
  }

  private async isEnabled(): Promise<boolean> {
    const rc = await this.attendanceConfig.getRuntimeConfig();
    return rc.depLeaveEnabled;
  }
}
