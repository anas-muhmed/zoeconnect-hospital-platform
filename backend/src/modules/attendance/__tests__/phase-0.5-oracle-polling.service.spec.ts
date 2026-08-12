/**
 * Phase 0.5 — GAP-10 regression test + console.log removal verification
 *
 * Verifies:
 * 1. getCursor() uses ATTENDANCE_INITIAL_CURSOR env var when present.
 * 2. getCursor() defaults to midnight UTC today when the env var is absent.
 * 3. getCursor() uses the Redis-stored value on subsequent calls (unchanged behaviour).
 * 4. No console.log calls are made during fetchNewPunches (production path).
 */

import { OraclePollingService } from '../services/oracle-polling.service';
import type { OraclePoolService } from '../../his/oracle-pool.service';
import type { AttendanceConfigService } from '../services/attendance-config.service';
import type { PunchHistoryService } from '../services/punch-history.service';
import type { AttendanceStructuredLogger } from '../services/attendance-structured-logger.service';
import type { ConfigService } from '@nestjs/config';

// ── helpers ─────────────────────────────────────────────────────────────────

function makeRedis(stored: string | null = null) {
  return {
    get: jest.fn().mockResolvedValue(stored),
    set: jest.fn().mockResolvedValue('OK'),
  };
}

function makeOracle(available = true, rows: unknown[] = []) {
  return {
    isAvailable: available,
    query: jest.fn().mockResolvedValue(rows),
  } as unknown as jest.Mocked<OraclePoolService>;
}

function makeConfig(enabled = true) {
  return {
    get: jest.fn().mockReturnValue(enabled),
  } as unknown as jest.Mocked<ConfigService>;
}

function makeAttendanceConfig() {
  return {
    getConfig: jest.fn().mockResolvedValue({}),
    ident: jest.fn((_, key: string) => `"${key}"`),
    // AttendanceConfigService.getRuntimeConfig() reads env/DB-backed settings
    // at call time -- this mock reads process.env['ATTENDANCE_INITIAL_CURSOR']
    // at call time too (not captured once at mock-creation time), matching
    // the real service closely enough for these cursor-selection tests,
    // which mutate process.env between assertions within the same test.
    getRuntimeConfig: jest.fn(async () => ({
      realtimeEnabled:    true,
      initialCursor:      process.env['ATTENDANCE_INITIAL_CURSOR'] ?? '',
      punchStartDate:     '',
      pollIntervalMs:     30_000,
      pollBatchSize:      500,
      debug:              false,
      staleQueuedMs:      5 * 60_000,
      backfillEnabled:    false,
      backfillWindowDays: 7,
      backfillIntervalMs: 60 * 60_000,
      backfillBatchSize:  2000,
      npnlSweepEnabled:   false,
      npnlGraceMinutes:   15,
      npnlSweepIntervalMs: 5 * 60_000,
      npnlSweepBatchSize: 200,
      reconCron:          '0 2 * * *',
      reconBatchSize:     500,
      reconStrategy:      'ACCEPT_HIS',
    })),
  } as unknown as jest.Mocked<AttendanceConfigService>;
}

function makePunchHistory() {
  return {
    makeSourceId: jest.fn().mockReturnValue('mock-source-id'),
  } as unknown as jest.Mocked<PunchHistoryService>;
}

function makeLogger() {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    time: jest.fn(() => Date.now()),
    elapsed: jest.fn(() => 1),
  } as unknown as jest.Mocked<AttendanceStructuredLogger>;
}

function buildService(redisOverride?: ReturnType<typeof makeRedis>) {
  const redis = redisOverride ?? makeRedis();
  const oracle = makeOracle();
  const attendanceConfig = makeAttendanceConfig();
  const punchHistory = makePunchHistory();
  const logger = makeLogger();
  const config = makeConfig();

  // OraclePollingService uses constructor injection — we use Reflect to inject
  // private dependencies since this is a unit test without the NestJS DI container.
  const service = new (OraclePollingService as any)(
    redis,
    oracle,
    attendanceConfig,
    punchHistory,
    logger,
    config,
  ) as OraclePollingService;

  return { service, redis, oracle, logger };
}

// ── tests ───────────────────────────────────────────────────────────────────

describe('OraclePollingService — Phase 0.5 (GAP-10, console.log)', () => {

  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
    delete process.env['ATTENDANCE_INITIAL_CURSOR'];
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  // ── GAP-10: cursor initialization ───────────────────────────────────────

  describe('getCursorInfo() — initial cursor selection (GAP-10)', () => {
    it('uses ATTENDANCE_INITIAL_CURSOR env var when set', async () => {
      const envDate = '2026-01-01T00:00:00.000Z';
      process.env['ATTENDANCE_INITIAL_CURSOR'] = envDate;

      // No stored cursor in Redis
      const redis = makeRedis(null);
      const { service } = buildService(redis);

      const { cursor } = await service.getCursorInfo();

      expect(cursor).toBe(envDate);
      expect(redis.set).toHaveBeenCalledWith(
        'attendance:attlogs:cursor',
        envDate,
      );
    });

    it('defaults to midnight UTC today when env var is absent', async () => {
      // No stored cursor, no env var
      const redis = makeRedis(null);
      const { service } = buildService(redis);

      const { cursor } = await service.getCursorInfo();

      const parsed = new Date(cursor);
      const todayMidnightUTC = new Date(new Date().setUTCHours(0, 0, 0, 0));

      expect(parsed.getUTCHours()).toBe(0);
      expect(parsed.getUTCMinutes()).toBe(0);
      expect(parsed.getUTCSeconds()).toBe(0);
      expect(parsed.getUTCMilliseconds()).toBe(0);
      // Date part matches today
      expect(parsed.toISOString().slice(0, 10)).toBe(
        todayMidnightUTC.toISOString().slice(0, 10),
      );
    });

    it('does NOT use "2026-06-28" as a hardcoded fallback', async () => {
      const redis = makeRedis(null);
      const { service } = buildService(redis);

      const { cursor } = await service.getCursorInfo();

      expect(cursor).not.toBe('2026-06-28T00:00:00.000Z');
    });

    it('uses Redis-stored value and ignores env var when cursor already set', async () => {
      const stored = '2026-07-01T12:30:00.000Z';
      process.env['ATTENDANCE_INITIAL_CURSOR'] = '2026-01-01T00:00:00.000Z';

      const redis = makeRedis(stored);
      const { service } = buildService(redis);

      const { cursor } = await service.getCursorInfo();

      expect(cursor).toBe(stored);
      // Should NOT overwrite an existing cursor
      expect(redis.set).not.toHaveBeenCalled();
    });
  });

  // ── resetCursor ──────────────────────────────────────────────────────────

  describe('resetCursor()', () => {
    it('writes the provided date to Redis', async () => {
      const redis = makeRedis('2026-07-01T00:00:00.000Z');
      const { service } = buildService(redis);
      const newDate = new Date('2026-06-01T00:00:00.000Z');

      await service.resetCursor(newDate);

      expect(redis.set).toHaveBeenCalledWith(
        'attendance:attlogs:cursor',
        '2026-06-01T00:00:00.000Z',
      );
    });
  });

  // ── console.log removal ──────────────────────────────────────────────────

  describe('fetchNewPunches() — no console.log in production path', () => {
    it('does not call console.log on successful poll', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const redis = makeRedis('2026-07-01T00:00:00.000Z');
      const { service } = buildService(redis);

      await service.fetchNewPunches(10);

      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('does not call console.error on failure (uses structured logger instead)', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const redis = makeRedis('2026-07-01T00:00:00.000Z');
      const oracle = makeOracle(true);
      (oracle.query as jest.Mock).mockRejectedValue(new Error('Oracle timeout'));

      const service = new (OraclePollingService as any)(
        redis,
        oracle,
        makeAttendanceConfig(),
        makePunchHistory(),
        makeLogger(),
        makeConfig(),
      ) as OraclePollingService;

      await expect(service.fetchNewPunches(10)).rejects.toThrow('Oracle timeout');
      expect(consoleErrorSpy).not.toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  // ── Oracle unavailable guard ─────────────────────────────────────────────

  describe('fetchNewPunches() — Oracle unavailable', () => {
    it('returns empty array and logs warn when Oracle is unavailable', async () => {
      const redis = makeRedis('2026-07-01T00:00:00.000Z');
      const oracle = makeOracle(false);
      const logger = makeLogger();

      const service = new (OraclePollingService as any)(
        redis,
        oracle,
        makeAttendanceConfig(),
        makePunchHistory(),
        logger,
        makeConfig(),
      ) as OraclePollingService;

      const result = await service.fetchNewPunches(10);

      expect(result).toEqual([]);
      expect(logger.warn).toHaveBeenCalledWith(
        'Oracle unavailable for attendance polling',
        expect.objectContaining({ success: false, failure: true }),
      );
    });
  });
});
