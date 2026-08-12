import { Inject, Injectable } from '@nestjs/common';
import { InjectRedis } from '../../../common/redis/redis.provider';
import type { Redis } from 'ioredis';
import { IOracleTransport } from '../../platform/infrastructure/oracle/oracle-transport.interface';
import { ORACLE_TRANSPORT } from '../../platform/infrastructure/tokens';
import { AttendanceConfigService } from './attendance-config.service';
import { PunchHistoryService } from './punch-history.service';
import { AttendanceStructuredLogger } from './attendance-structured-logger.service';
import type { AttlogPunch, PunchDirection } from '../attendance.types';

const CURSOR_KEY = 'attendance:attlogs:cursor';

/**
 * How far into the future a row's CREATEDDATETIME may plausibly be (to
 * tolerate ordinary clock drift between the Oracle server and this app)
 * before it is treated as corrupt source data rather than a real insert
 * time. A punch-clock device with a broken RTC can write a garbage
 * far-future CREATEDDATETIME into ATTLOGS; if that value is blindly trusted
 * to advance the cursor, it permanently stalls ALL future polling, because
 * `WHERE ${createdCol} >= :cursor` can then never match a real row again.
 * (This happened in production: one bad row advanced the cursor to the
 * year 2133.)
 */
const MAX_FUTURE_SKEW_MS = 24 * 60 * 60 * 1000; // 1 day

@Injectable()
export class OraclePollingService {
  constructor(
    @InjectRedis() private readonly redis: Redis,
    @Inject(ORACLE_TRANSPORT) private readonly oracle: IOracleTransport,
    private readonly attendanceConfig: AttendanceConfigService,
    private readonly punchHistory: PunchHistoryService,
    private readonly attendanceLogger: AttendanceStructuredLogger,
  ) {}

  async fetchNewPunches(limit = 500): Promise<AttlogPunch[]> {
    const rc = await this.attendanceConfig.getRuntimeConfig();
    if (!rc.realtimeEnabled) {
      this.attendanceLogger.info('Attendance realtime disabled', {
        processingStage: 'ORACLE_POLLING',
        success: true,
        metadata: { reason: 'realtimeEnabled=false (ATTENDANCE_REALTIME_ENABLED)' },
      });
      return [];
    }
    const startedAt = this.attendanceLogger.time();
    if (!this.oracle.isAvailable) {
      this.attendanceLogger.warn('Oracle unavailable for attendance polling', {
        processingStage: 'ORACLE_POLLING',
        executionTimeMs: this.attendanceLogger.elapsed(startedAt),
        success: false,
        failure: true,
      });
      return [];
    }

    try {
      // Apply the configurable punch floor: punches before punchStartDate are
      // never considered, even if the stored Redis cursor is older.
      const storedCursor = await this.getCursor();
      const startFloor = this.parsePunchStartDate(rc.punchStartDate);
      const cursor = startFloor && startFloor > storedCursor ? startFloor : storedCursor;
      const cfg = await this.attendanceConfig.getConfig();
      const table = this.attendanceConfig.ident(cfg, 'attendance.attlogs.table');
      const empCol = this.attendanceConfig.ident(cfg, 'attendance.attlogs.employeeCode');
      const dtCol = this.attendanceConfig.ident(cfg, 'attendance.attlogs.logDateTime');
      const deviceCol = this.attendanceConfig.ident(cfg, 'attendance.attlogs.deviceName');
      const directionCol = this.attendanceConfig.ident(cfg, 'attendance.attlogs.direction');
      const ipCol = this.attendanceConfig.ident(cfg, 'attendance.attlogs.ipAddress');
      const snCol = this.attendanceConfig.ident(cfg, 'attendance.attlogs.serialNumber');
      const branchCol = this.attendanceConfig.ident(cfg, 'attendance.attlogs.intraBranchId');
      const createdCol = this.attendanceConfig.ident(cfg, 'attendance.attlogs.createdAt');
      // PERF (2026-07 HIS slowdown fix):
      //   • CURSOR column = ${createdCol} (CREATEDDATETIME, native TIMESTAMP,
      //     plain B-tree index IDX_ATTLOGS_CREATEDDATETIME — see
      //     fix_attendance_performance_indexes.sql). Sargable, no functions.
      //     Polling by insert time also means late-uploaded punches are never
      //     missed, regardless of their punch time.
      //   • BUSINESS punch time = TO_DATE(${dtCol}) — evaluated only on the
      //     <= :limit rows the index already selected, so it is cheap here.
      //     Attendance semantics still use the actual punch time.
      //   • '>= :cursor' (not '>') because TIMESTAMP(6) microseconds are lost
      //     in the ms-precision JS cursor; boundary rows are re-read and
      //     deduplicated downstream by PunchHistoryService (sourceId).
      const dtExpr = `TO_DATE(${dtCol}, 'DD-MM-YYYY HH24:MI:SS')`;
      const floorPredicate = startFloor ? `AND ${dtExpr} >= :punchFloor` : '';
      const binds: Record<string, unknown> = startFloor
        ? { cursor, limit, punchFloor: startFloor }
        : { cursor, limit };
      const rows = await this.oracle.query<Record<string, unknown>>(
        `
        SELECT * FROM (
          SELECT
            ${empCol} AS "employeeCode",
            ${dtExpr} AS "logDateTime",
            ${deviceCol} AS "deviceName",
            ${directionCol} AS "direction",
            ${ipCol} AS "ipAddress",
            ${snCol} AS "serialNumber",
            ${branchCol} AS "intraBranchId",
            ${createdCol} AS "createdAt"
          FROM ${table}
          WHERE ${createdCol} >= :cursor
          ${floorPredicate}
          ORDER BY ${createdCol} ASC
        )
        WHERE ROWNUM <= :limit
        `,
        binds,
        { maxRows: limit },
      );

      const punches = rows
        .map((row) => this.mapRow(row))
        .filter((punch): punch is AttlogPunch => !!punch);

      // Advance the cursor from the RAW rows (not the filtered punches), so
      // unmappable rows can never stall the cursor. Rows are ordered by
      // ${createdCol} ASC, so the newest plausible insert time is normally
      // the last row — but a single row with a corrupt CREATEDDATETIME
      // (e.g. a malfunctioning punch device with a broken clock writing a
      // garbage far-future date) must never be trusted blindly: doing so
      // poisons the cursor forever, since no real row can ever be >= a
      // bogus year-2133 value again. Scan backward from the newest row and
      // use the first one within MAX_FUTURE_SKEW_MS of now; skip (and flag)
      // anything further out.
      const now = Date.now();
      let cursorAdvanced = false;
      for (let i = rows.length - 1; i >= 0; i--) {
        const raw = rows[i];
        if (!raw?.createdAt) continue;
        const candidate = new Date(String(raw.createdAt));
        if (Number.isNaN(candidate.getTime())) continue;

        if (candidate.getTime() - now > MAX_FUTURE_SKEW_MS) {
          this.attendanceLogger.error(
            'ATTLOGS row has an implausible future CREATEDDATETIME — not trusted for cursor advancement (likely corrupt source data, e.g. a punch device with a bad clock)',
            {
              employeeCode: raw.employeeCode != null ? String(raw.employeeCode) : null,
              processingStage: 'ORACLE_POLLING',
              success: false,
              failure: true,
              metadata: {
                rawCreatedAt:    String(raw.createdAt),
                rawLogDateTime:  raw.logDateTime != null ? String(raw.logDateTime) : null,
                rowIndex:        i,
              },
            },
          );
          continue;
        }

        await this.redis.set(CURSOR_KEY, new Date(candidate.getTime() + 1).toISOString());
        cursorAdvanced = true;
        break;
      }
      if (!cursorAdvanced && rows.length) {
        this.attendanceLogger.warn('ATTLOGS cursor not advanced: no row in this batch had a plausible createdAt', {
          processingStage: 'ORACLE_POLLING',
          success: false,
          metadata: { rowsFetched: rows.length },
        });
      }

      this.attendanceLogger.info('Oracle attendance polling completed', {
        processingStage: 'ORACLE_POLLING',
        executionTimeMs: this.attendanceLogger.elapsed(startedAt),
        success: true,
        metadata: {
          cursor: cursor.toISOString(),
          limit,
          detectedCount: punches.length,
          latestPunchTime: punches[punches.length - 1]?.logDateTime.toISOString() ?? null,
        },
      });

      return punches;
    } catch (err) {
      // console.log / console.error removed (Phase 0.5): use structured logger only
      this.attendanceLogger.error('Oracle attendance polling failed', {
        processingStage: 'ORACLE_ERROR',
        executionTimeMs: this.attendanceLogger.elapsed(startedAt),
      }, err);
      throw err;
    }
  }

  /**
   * Safety-net sweep for punches the CREATEDDATETIME cursor may have missed
   * (see AttendanceRuntimeConfig.backfillEnabled for the full rationale —
   * covers a punch device / eSSL sync outage of several days). Unlike
   * fetchNewPunches(), this scans by LOGDATETIME (the actual business punch
   * time) over a trailing window ending now, completely independent of the
   * CREATEDDATETIME cursor. It is safe to call repeatedly on overlapping
   * windows: PunchHistoryService.recordDiscoveredPunch() dedupes by
   * sourceId, so already-known punches are simply skipped.
   */
  async fetchBackfillPunches(windowDays: number, limit = 2000): Promise<AttlogPunch[]> {
    const startedAt = this.attendanceLogger.time();
    if (!this.oracle.isAvailable) {
      this.attendanceLogger.warn('Oracle unavailable for attendance backfill sweep', {
        processingStage: 'ORACLE_POLLING',
        executionTimeMs: this.attendanceLogger.elapsed(startedAt),
        success: false,
        failure: true,
      });
      return [];
    }

    try {
      const cfg = await this.attendanceConfig.getConfig();
      const table = this.attendanceConfig.ident(cfg, 'attendance.attlogs.table');
      const empCol = this.attendanceConfig.ident(cfg, 'attendance.attlogs.employeeCode');
      const dtCol = this.attendanceConfig.ident(cfg, 'attendance.attlogs.logDateTime');
      const deviceCol = this.attendanceConfig.ident(cfg, 'attendance.attlogs.deviceName');
      const directionCol = this.attendanceConfig.ident(cfg, 'attendance.attlogs.direction');
      const ipCol = this.attendanceConfig.ident(cfg, 'attendance.attlogs.ipAddress');
      const snCol = this.attendanceConfig.ident(cfg, 'attendance.attlogs.serialNumber');
      const branchCol = this.attendanceConfig.ident(cfg, 'attendance.attlogs.intraBranchId');
      const createdCol = this.attendanceConfig.ident(cfg, 'attendance.attlogs.createdAt');

      const dtExpr = `TO_DATE(${dtCol}, 'DD-MM-YYYY HH24:MI:SS')`;
      const windowStart = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

      const rows = await this.oracle.query<Record<string, unknown>>(
        `
        SELECT * FROM (
          SELECT
            ${empCol} AS "employeeCode",
            ${dtExpr} AS "logDateTime",
            ${deviceCol} AS "deviceName",
            ${directionCol} AS "direction",
            ${ipCol} AS "ipAddress",
            ${snCol} AS "serialNumber",
            ${branchCol} AS "intraBranchId",
            ${createdCol} AS "createdAt"
          FROM ${table}
          WHERE ${dtExpr} >= :windowStart
          ORDER BY ${dtExpr} ASC
        )
        WHERE ROWNUM <= :limit
        `,
        { windowStart, limit },
        { maxRows: limit },
      );

      const punches = rows
        .map((row) => this.mapRow(row))
        .filter((punch): punch is AttlogPunch => !!punch);

      this.attendanceLogger.info('Oracle attendance backfill sweep completed', {
        processingStage: 'ORACLE_POLLING',
        executionTimeMs: this.attendanceLogger.elapsed(startedAt),
        success: true,
        metadata: { windowDays, windowStart: windowStart.toISOString(), limit, rowsFetched: rows.length, mappedCount: punches.length },
      });

      return punches;
    } catch (err) {
      this.attendanceLogger.error('Oracle attendance backfill sweep failed', {
        processingStage: 'ORACLE_ERROR',
        executionTimeMs: this.attendanceLogger.elapsed(startedAt),
      }, err);
      throw err;
    }
  }

  /**
   * Parses attendance.runtime.punchStartDate / ATTENDANCE_PUNCH_START_DATE.
   * Accepts 'YYYY-MM-DD' (interpreted as midnight UTC) or full ISO-8601.
   * Returns null when unset or unparseable (logged once per poll at debug level).
   */
  private parsePunchStartDate(raw: string): Date | null {
    const value = (raw ?? '').trim();
    if (!value) return null;
    const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? new Date(`${value}T00:00:00.000Z`)
      : new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      this.attendanceLogger.warn('Invalid ATTENDANCE_PUNCH_START_DATE ignored', {
        processingStage: 'ORACLE_POLLING',
        success: false,
        metadata: { punchStartDate: value },
      });
      return null;
    }
    return parsed;
  }

  async resetCursor(date: Date): Promise<void> {
    await this.redis.set(CURSOR_KEY, date.toISOString());
  }

  async getCursorInfo(): Promise<{ key: string; cursor: string }> {
    const cursor = await this.getCursor();
    return { key: CURSOR_KEY, cursor: cursor.toISOString() };
  }

  private async getCursor(): Promise<Date> {
    const stored = await this.redis.get(CURSOR_KEY);

    if (stored) {
      return new Date(stored);
    }

    // GAP-10 fix: first-startup cursor is now configurable via
    // attendance.runtime.initialCursor (vendor portal) or ATTENDANCE_INITIAL_CURSOR env var.
    // When absent we default to midnight UTC today so that only today's punches
    // are processed on a fresh deployment.
    const rc2 = await this.attendanceConfig.getRuntimeConfig();
    const initial = rc2.initialCursor
      ? new Date(rc2.initialCursor)
      : new Date(new Date().setUTCHours(0, 0, 0, 0));

    this.attendanceLogger.info('Attendance cursor initialized', {
      processingStage: 'ORACLE_POLLING',
      success: true,
      metadata: {
        cursor: initial.toISOString(),
        source: rc2.initialCursor ? 'attendance.runtime.initialCursor / ATTENDANCE_INITIAL_CURSOR' : 'default (midnight UTC today)',
      },
    });

    await this.redis.set(CURSOR_KEY, initial.toISOString());

    return initial;
  }

  private mapRow(row: Record<string, unknown>): AttlogPunch | null {
    const employeeCode = String(row.employeeCode ?? '').trim();
    const rawDate = row.logDateTime;
    if (!employeeCode || !rawDate) return null;

    const logDateTime = rawDate instanceof Date ? rawDate : new Date(String(rawDate));
    const rawDirection = row.direction == null ? null : String(row.direction);
    const punch: AttlogPunch = {
      sourceId: '',
      employeeCode,
      logDateTime,
      deviceName: row.deviceName == null ? null : String(row.deviceName),
      direction: this.normalizeDirection(rawDirection),
      rawDirection,
      ipAddress: row.ipAddress == null ? null : String(row.ipAddress),
      serialNumber: row.serialNumber == null ? null : String(row.serialNumber),
      intraBranchId: row.intraBranchId == null ? null : String(row.intraBranchId),
      createdAt: row.createdAt ? new Date(String(row.createdAt)) : null,
      raw: row,
    };
    punch.sourceId = this.punchHistory.makeSourceId(punch);
    return punch;
  }

  private normalizeDirection(value: string | null): PunchDirection {
    const normalized = (value ?? '').trim().toUpperCase();
    if (['IN', 'I', '0', 'ENTRY'].includes(normalized)) return 'IN';
    if (['OUT', 'O', '1', 'EXIT'].includes(normalized)) return 'OUT';
    return 'UNKNOWN';
  }
}
