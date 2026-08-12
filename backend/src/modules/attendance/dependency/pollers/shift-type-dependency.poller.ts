/**
 * Phase 2B — ShiftTypeDependencyPoller
 *
 * Polls the Oracle SHIFT_TYPE table for rows modified after the stored cursor
 * and emits one AttendanceDependencyChangedEvent { source: 'SHIFT_TYPE',
 * scope: 'CONFIG' } per changed shift definition.
 *
 * A shift-type change is config-level — it potentially invalidates attendance
 * decisions for every employee using that shift, across any date.  The event
 * carries no employeeCode or dutyDate; the Phase 3 engine uses shiftId/shiftCode
 * from the payload to scope the re-evaluation.
 *
 * Architectural constraints:
 *   • Cursor is timestamp-based (LASTMODIFIEDDATE).  ROWID avoided.
 *   • poll() never throws — errors are caught and metered.
 *   • Disabled by default: DEPENDENCY_SHIFTTYPE_POLL_ENABLED (default: false).
 *     Activate once downstream handlers can cope with CONFIG-scoped events.
 */

import { Inject, Injectable } from '@nestjs/common';
import { InjectRedis } from '../../../../common/redis/redis.provider';
import type { Redis } from 'ioredis';
import { IOracleTransport } from '../../../platform/infrastructure/oracle/oracle-transport.interface';
import { ORACLE_TRANSPORT } from '../../../platform/infrastructure/tokens';
import { AttendanceConfigService } from '../../services/attendance-config.service';
import { AttendanceStructuredLogger } from '../../services/attendance-structured-logger.service';
import { DependencyEventRouter } from '../../services/dependency-event-router.service';
import { ShiftTypeMapper } from '../mappers/shift-type.mapper';
import type { AttendanceDependencyPoller, PollerMetrics } from '../interfaces/attendance-dependency-poller.interface';

const CURSOR_KEY    = 'attendance:dep:shifttype:cursor';
const DEFAULT_BATCH = 500;

@Injectable()
export class ShiftTypeDependencyPoller implements AttendanceDependencyPoller {
  readonly name = 'ShiftTypeDependencyPoller';

  private _metrics: PollerMetrics = {
    enabled:            false, // disabled by default — see DEPENDENCY_SHIFTTYPE_POLL_ENABLED
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

  async resetCursor(date: Date): Promise<void> {
    await this.redis.set(CURSOR_KEY, date.toISOString());
    this._metrics.cursor = date.toISOString();
    this.attendanceLogger.info('ShiftType dependency cursor reset', {
      processingStage: 'DEPENDENCY_POLL_SHIFTTYPE',
      success: true,
      metadata: { cursor: date.toISOString() },
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

    try {
      if (!this.oracle.isAvailable) {
        this.attendanceLogger.warn('ShiftType poller: Oracle unavailable', {
          processingStage: 'DEPENDENCY_POLL_SHIFTTYPE',
          success: false,
        });
        return;
      }

      const cursor  = await this.getCursor();
      const { depPollBatchSize: limit } = await this.attendanceConfig.getRuntimeConfig();
      const cfg     = await this.attendanceConfig.getConfig();

      const shiftTable = this.attendanceConfig.ident(cfg, 'attendance.shift.table');
      const idCol      = this.attendanceConfig.ident(cfg, 'attendance.shift.id');
      const codeCol    = this.attendanceConfig.ident(cfg, 'attendance.shift.code');
      const modCol     = this.attendanceConfig.ident(cfg, 'attendance.shift.lastModifiedDate');

      const rows = await this.oracle.query<Record<string, unknown>>(
        `SELECT * FROM (
           SELECT
             s.${idCol}    AS "shiftId",
             s.${codeCol}  AS "shiftCode",
             s.${modCol}   AS "lastModifiedDate"
           FROM ${shiftTable} s
           WHERE s.${modCol} > :cursor
           ORDER BY s.${modCol} ASC
         )
         WHERE ROWNUM <= :limit`,
        { cursor, limit },
        { maxRows: limit },
      );

      this._metrics.rowsLastPoll = rows.length;
      this._metrics.lastPollAt   = new Date();

      let emitted = 0;
      let latestModified: Date | null = null;

      for (const raw of rows) {
        const row = ShiftTypeMapper.mapRow(raw);
        if (!row) continue;

        const event = ShiftTypeMapper.toEvent(row);
        await this.router.route(event);
        emitted++;

        if (!latestModified || row.lastModifiedDate! > latestModified) {
          latestModified = row.lastModifiedDate!;
        }
      }

      if (latestModified) {
        await this.saveCursor(new Date(latestModified.getTime() + 1));
      }

      this._metrics.eventsEmittedTotal += emitted;
      this._metrics.lastSuccessAt       = new Date();
      this._metrics.lastError           = null;

      this.attendanceLogger.info('ShiftType dependency poll completed', {
        processingStage: 'DEPENDENCY_POLL_SHIFTTYPE',
        executionTimeMs: this.attendanceLogger.elapsed(startedAt),
        success: true,
        metadata: {
          cursor:      cursor.toISOString(),
          rowsFetched: rows.length,
          emitted,
          limit,
        },
      });
    } catch (err) {
      this._metrics.errorsTotal++;
      this._metrics.lastError  = (err as Error).message;
      this._metrics.lastPollAt = new Date();

      this.attendanceLogger.error('ShiftType dependency poll failed', {
        processingStage: 'DEPENDENCY_POLL_SHIFTTYPE',
        executionTimeMs: this.attendanceLogger.elapsed(startedAt),
        success: false,
        failure: true,
      }, err);
      // Never re-throw — orchestrator must continue with other pollers
    } finally {
      this._metrics.running = false;
    }
  }

  // ── Cursor helpers ─────────────────────────────────────────────────────────

  private async getCursor(): Promise<Date> {
    const stored = await this.redis.get(CURSOR_KEY);
    if (stored) {
      const d = new Date(stored);
      this._metrics.cursor = d.toISOString();
      return d;
    }

    const initial = new Date(new Date().setUTCHours(0, 0, 0, 0));
    await this.redis.set(CURSOR_KEY, initial.toISOString());
    this._metrics.cursor = initial.toISOString();

    this.attendanceLogger.info('ShiftType dependency cursor initialised', {
      processingStage: 'DEPENDENCY_POLL_SHIFTTYPE',
      success: true,
      metadata: { cursor: initial.toISOString(), source: 'default (midnight UTC today)' },
    });
    return initial;
  }

  private async saveCursor(date: Date): Promise<void> {
    await this.redis.set(CURSOR_KEY, date.toISOString());
    this._metrics.cursor = date.toISOString();
  }

  private async isEnabled(): Promise<boolean> {
    const rc = await this.attendanceConfig.getRuntimeConfig();
    return rc.depShiftTypeEnabled;
  }
}
