/**
 * Phase 2A — DutyPlanDependencyPoller
 *
 * Polls Oracle DUTYPLANVALUES and emits one AttendanceDependencyChangedEvent
 * { source: 'DUTY_PLAN' } per row currently inside a rolling PLANDATE window.
 *
 * Why not an incremental (LASTMODIFIEDDATE) cursor:
 *   DUTYPLANVALUES has no modification-timestamp column in the actual HIS
 *   Oracle schema. An earlier version of this poller assumed one existed and
 *   filtered with `WHERE LASTMODIFIEDDATE > :cursor`, which raises ORA-00904
 *   ("invalid identifier") against real HIS databases. There is no reliable
 *   substitute column, so incremental polling is not possible for this table.
 *
 * Redesign — periodic full-window refresh:
 *   Every poll cycle re-scans all DUTYPLANVALUES rows whose PLANDATE falls
 *   within [today - refreshPastDays, today + refreshFutureDays] (defaults:
 *   1 day back, 14 days ahead — configurable via
 *   DEPENDENCY_DUTYPLAN_REFRESH_PAST_DAYS / _FUTURE_DAYS) and emits an event
 *   for every row found. This is a superset re-check rather than a diff: it
 *   costs more Oracle reads per cycle than a true incremental poll, but it
 *   requires no modification signal from HIS and it is self-healing — any
 *   duty-plan edit (INSERT/UPDATE/DELETE) made by HIS is picked up on the
 *   next cycle regardless of how it was made. Downstream recalculation is
 *   idempotent and debounced (DEPENDENCY_DUTYPLAN_DEBOUNCE_MS), so re-emitting
 *   unchanged rows is safe.
 *
 * Architectural constraints (Master Task):
 *   • External system polled only — this service NEVER calls internal components
 *     to trigger recalculation directly; it only routes events.
 *   • No LASTMODIFIEDDATE / ROWID dependency — window bounds are computed
 *     from wall-clock time, not from a column that does not exist.
 *   • All errors are caught internally; poll() never throws.
 *   • Disabled via DEPENDENCY_DUTYPLAN_POLL_ENABLED=false (individual flag) or
 *     DEPENDENCY_POLLING_ENABLED=false (master flag checked by orchestrator).
 */

import { Inject, Injectable } from '@nestjs/common';
import { InjectRedis } from '../../../../common/redis/redis.provider';
import type { Redis } from 'ioredis';
import { IOracleTransport } from '../../../platform/infrastructure/oracle/oracle-transport.interface';
import { ORACLE_TRANSPORT } from '../../../platform/infrastructure/tokens';
import { AttendanceConfigService } from '../../services/attendance-config.service';
import { AttendanceStructuredLogger } from '../../services/attendance-structured-logger.service';
import { DependencyEventRouter } from '../../services/dependency-event-router.service';
import { DutyPlanMapper } from '../mappers/duty-plan.mapper';
import type { AttendanceDependencyPoller, PollerMetrics } from '../interfaces/attendance-dependency-poller.interface';

// Historically named "cursor". Normally the refresh window's floor
// (earliest PLANDATE scanned) is just (today - refreshPastDays), recomputed
// fresh on every poll — there is nothing to persist for routine operation.
// This key holds a ONE-SHOT override: if an admin calls resetCursor() to
// force a deeper historical re-scan, the override is read, applied to the
// very next poll only, and then cleared so subsequent polls fall back to the
// normal rolling window instead of getting stuck at a fixed floor forever.
const WINDOW_OVERRIDE_KEY = 'attendance:dep:dutyplan:cursor';
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
export class DutyPlanDependencyPoller implements AttendanceDependencyPoller {
  readonly name = 'DutyPlanDependencyPoller';

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
   * Forces the NEXT poll's window floor (earliest PLANDATE scanned) back to
   * the given date — e.g. to force a deeper historical re-scan after a HIS
   * data fix. This is a one-shot override, consumed and cleared by the next
   * poll(); it does not permanently pin the floor, since the window's whole
   * point is to keep rolling with "today" rather than sticking at a fixed
   * point forever.
   */
  async resetCursor(date: Date): Promise<void> {
    const floor = startOfUtcDay(date);
    await this.redis.set(WINDOW_OVERRIDE_KEY, floor.toISOString());
    this._metrics.cursor = floor.toISOString();
    this.attendanceLogger.info('DutyPlan refresh window floor override set for next poll', {
      processingStage: 'DEPENDENCY_POLL_DUTYPLAN',
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

    if (this._metrics.running) return; // prevent concurrent polls

    this._metrics.running = true;
    const startedAt = this.attendanceLogger.time();
    const pollTime  = new Date();

    try {
      if (!this.oracle.isAvailable) {
        this.attendanceLogger.warn('DutyPlan poller: Oracle unavailable', {
          processingStage: 'DEPENDENCY_POLL_DUTYPLAN',
          success: false,
        });
        return;
      }

      const { depPollBatchSize: limit, depDutyplanRefreshPastDays, depDutyplanRefreshFutureDays } =
        await this.attendanceConfig.getRuntimeConfig();
      const cfg = await this.attendanceConfig.getConfig();

      const windowStart = await this.getWindowStart(depDutyplanRefreshPastDays, pollTime);
      const windowEnd    = addDays(startOfUtcDay(pollTime), depDutyplanRefreshFutureDays);

      // Column identifiers — validated by ident() to prevent injection
      const dpTable   = this.attendanceConfig.ident(cfg, 'attendance.roster.table');
      const empIdCol  = this.attendanceConfig.ident(cfg, 'attendance.roster.employeeId');
      const dateCol   = this.attendanceConfig.ident(cfg, 'attendance.roster.dutyDate');
      const empTable  = this.attendanceConfig.ident(cfg, 'attendance.employee.table');
      const empPkCol  = this.attendanceConfig.ident(cfg, 'attendance.employee.id');
      const empNoCol  = this.attendanceConfig.ident(cfg, 'attendance.employee.code');

      const rows = await this.oracle.query<Record<string, unknown>>(
        `SELECT * FROM (
           SELECT
             e.${empNoCol}    AS "employeeCode",
             d.${dateCol}     AS "dutyDate",
             d.${empIdCol}    AS "empId"
           FROM ${dpTable} d
           LEFT JOIN ${empTable} e ON e.${empPkCol} = d.${empIdCol}
           WHERE d.${dateCol} >= :windowStart
             AND d.${dateCol} <= :windowEnd
           ORDER BY d.${dateCol} ASC
         )
         WHERE ROWNUM <= :limit`,
        { windowStart, windowEnd, limit },
        { maxRows: limit },
      );

      this._metrics.rowsLastPoll = rows.length;
      this._metrics.lastPollAt   = pollTime;

      let emitted = 0;

      for (const raw of rows) {
        const row = DutyPlanMapper.mapRow(raw);
        if (!row) continue; // unparseable PLANDATE — skip

        const event = DutyPlanMapper.toEvent(row, pollTime);
        await this.router.route(event);
        emitted++;
      }

      this._metrics.eventsEmittedTotal += emitted;
      this._metrics.lastSuccessAt       = new Date();
      this._metrics.lastError           = null;

      this.attendanceLogger.info('DutyPlan dependency poll completed', {
        processingStage: 'DEPENDENCY_POLL_DUTYPLAN',
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

      this.attendanceLogger.error('DutyPlan dependency poll failed', {
        processingStage: 'DEPENDENCY_POLL_DUTYPLAN',
        executionTimeMs: this.attendanceLogger.elapsed(startedAt),
        success: false,
        failure: true,
      }, err);
      // Never re-throw — orchestrator must continue with other pollers
    } finally {
      this._metrics.running = false;
    }
  }

  // ── Window helpers ───────────────────────────────────────────────────────────

  /**
   * Normally returns (today - refreshPastDays), recomputed fresh every poll
   * so the window keeps rolling forward with wall-clock time. If
   * resetCursor() left a one-shot override in Redis, that override is
   * applied for this single poll (clamped to be no later than the normal
   * floor, so it can only widen the window, never shrink it) and then
   * cleared — subsequent polls go back to the normal rolling floor.
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
    return rc.depDutyplanEnabled;
  }
}
