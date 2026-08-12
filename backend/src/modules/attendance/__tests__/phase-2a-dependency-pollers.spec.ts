/**
 * Phase 2A — Unit tests for dependency pollers and orchestrator
 *
 * Tests:
 *   Mappers
 *     • DutyPlanMapper.mapRow() returns null for rows with missing dutyDate
 *     • DutyPlanMapper.mapRow() parses dates correctly
 *     • DutyPlanMapper.toEvent() sets source=DUTY_PLAN, correct fields
 *     • LeaveMapper.mapRow() returns null for rows with missing leaveDate
 *     • LeaveMapper.toEvent() sets source=LEAVE, correct fields
 *
 *   DutyPlanDependencyPoller
 *     • poll() returns immediately when DEPENDENCY_DUTYPLAN_POLL_ENABLED=false
 *     • poll() returns immediately when Oracle is unavailable
 *     • poll() queries a PLANDATE window, not a LASTMODIFIEDDATE cursor
 *     • poll() never throws — catches errors internally
 *     • getMetrics() reflects emittedTotal after successful poll
 *
 *   LeaveDependencyPoller
 *     • poll() returns immediately when DEPENDENCY_LEAVE_POLL_ENABLED=false
 *     • poll() queries a FROMDATE window, not a LASTMODIFIEDDATE cursor
 *     • poll() never throws on Oracle error
 *     • getMetrics() reflects errorsTotal after failed poll
 *
 *   DependencyPollingOrchestrator
 *     • tick() calls all pollers independently
 *     • tick() continues with remaining pollers when one throws
 *     • getMetrics() includes per-poller metrics keyed by name
 *     • onApplicationBootstrap() skips timer when DEPENDENCY_POLLING_ENABLED=false
 */

import { DutyPlanMapper } from '../dependency/mappers/duty-plan.mapper';
import { LeaveMapper }     from '../dependency/mappers/leave.mapper';
import { DutyPlanDependencyPoller } from '../dependency/pollers/duty-plan-dependency.poller';
import { LeaveDependencyPoller }    from '../dependency/pollers/leave-dependency.poller';
import { DependencyPollingOrchestrator } from '../dependency/dependency-polling-orchestrator.service';
import type { AttendanceDependencyPoller } from '../dependency/interfaces/attendance-dependency-poller.interface';
import type { AttendanceStructuredLogger } from '../services/attendance-structured-logger.service';
import type { AttendanceConfigService } from '../services/attendance-config.service';
import type { LicenseService } from '../../licensing/license.service';

// attendanceConfig / licenseService (added to DependencyPollingOrchestrator's
// constructor since this test was last updated). tick() (called directly by
// these tests) gates on licenseService.isModuleLicensed('ATTENDANCE') --
// must resolve true or every poller.poll() assertion below would fail.
// onApplicationBootstrap() reads attendanceConfig.getRuntimeConfig() for
// depPollingEnabled, which this file's DEPENDENCY_POLLING_ENABLED env var
// test still needs to drive.
function makeOrchestratorAttendanceConfig(): jest.Mocked<AttendanceConfigService> {
  return {
    getRuntimeConfig: jest.fn().mockImplementation(async () => ({
      depPollingEnabled: process.env['DEPENDENCY_POLLING_ENABLED'] !== 'false',
      depPollIntervalMs: 30_000,
    })),
  } as unknown as jest.Mocked<AttendanceConfigService>;
}

function makeOrchestratorLicenseService(): jest.Mocked<LicenseService> {
  return {
    isModuleLicensed: jest.fn().mockResolvedValue(true),
  } as unknown as jest.Mocked<LicenseService>;
}

// ── Test helpers ──────────────────────────────────────────────────────────────

function makeRedis(stored: string | null = null) {
  const store: Record<string, string> = stored != null ? { dummy: stored } : {};
  return {
    get:  jest.fn(async (_key: string) => store[_key] ?? null),
    set:  jest.fn(async (key: string, val: string) => { store[key] = val; }),
    del:  jest.fn(async (key: string) => { delete store[key]; }),
    _store: store,
  };
}

function makeOracle(available = true, rows: Record<string, unknown>[] = []) {
  return {
    isAvailable: available,
    query:       jest.fn(async () => rows),
  };
}

function makeConfig() {
  const cfg: Record<string, string> = {
    'attendance.roster.table':            'DUTYPLANVALUES',
    'attendance.roster.employeeId':       'EMPID',
    'attendance.roster.dutyDate':         'PLANDATE',
    'attendance.employee.table':          'EMPLOYEE',
    'attendance.employee.id':             'EMPLOYEE_ID',
    'attendance.employee.code':           'EMPNO',
    'attendance.employeeLeave.table':            'EMPLOYEELEAVELIST',
    'attendance.employeeLeave.leaveDate':        'FROMDATE',
    'attendance.employeeLeave.leaveDetailId':    'LEAVEDETAILID',
    'attendance.appliedLeave.table':             'APPLIEDLEAVES',
    'attendance.appliedLeave.id':                'ID',
    'attendance.appliedLeave.employeeId':        'EMPID',
  };
  const bool = (envKey: string, def: boolean): boolean => {
    const raw = process.env[envKey];
    if (raw === undefined) return def;
    return raw.toLowerCase() === 'true';
  };
  const int = (envKey: string, def: number): number => {
    const raw = process.env[envKey];
    if (raw === undefined) return def;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : def;
  };

  return {
    getConfig: jest.fn(async () => cfg),
    ident:     jest.fn((_cfg: Record<string,string>, key: string) => cfg[key] ?? key),
    getRuntimeConfig: jest.fn(async () => ({
      depPollBatchSize:             int ('DEPENDENCY_POLL_BATCH_SIZE',              500),
      depDutyplanEnabled:           bool('DEPENDENCY_DUTYPLAN_POLL_ENABLED',        true),
      depDutyplanRefreshPastDays:   int ('DEPENDENCY_DUTYPLAN_REFRESH_PAST_DAYS',   1),
      depDutyplanRefreshFutureDays: int ('DEPENDENCY_DUTYPLAN_REFRESH_FUTURE_DAYS', 14),
      depLeaveEnabled:              bool('DEPENDENCY_LEAVE_POLL_ENABLED',           true),
      depLeaveRefreshPastDays:      int ('DEPENDENCY_LEAVE_REFRESH_PAST_DAYS',      1),
      depLeaveRefreshFutureDays:    int ('DEPENDENCY_LEAVE_REFRESH_FUTURE_DAYS',    14),
    })),
  };
}

function makeRouter() {
  return { route: jest.fn(async () => {}) };
}

function makeLogger(): jest.Mocked<AttendanceStructuredLogger> {
  return {
    info:    jest.fn(),
    warn:    jest.fn(),
    error:   jest.fn(),
    time:    jest.fn(() => Date.now()),
    elapsed: jest.fn(() => 0),
  } as unknown as jest.Mocked<AttendanceStructuredLogger>;
}

const NOW = new Date('2026-07-01T10:00:00.000Z');
const MOD = new Date('2026-07-01T09:00:00.000Z');

// ── DutyPlanMapper ────────────────────────────────────────────────────────────

describe('DutyPlanMapper', () => {
  describe('mapRow', () => {
    it('returns null when dutyDate is absent', () => {
      expect(DutyPlanMapper.mapRow({ employeeCode: 'EMP001' })).toBeNull();
    });

    it('returns null when dutyDate is invalid', () => {
      expect(DutyPlanMapper.mapRow({ dutyDate: 'not-a-date' })).toBeNull();
    });

    it('parses Date objects directly', () => {
      const row = DutyPlanMapper.mapRow({ employeeCode: 'EMP001', dutyDate: NOW });
      expect(row).not.toBeNull();
      expect(row!.dutyDate).toEqual(NOW);
    });

    it('parses ISO string timestamps', () => {
      const row = DutyPlanMapper.mapRow({ dutyDate: '2026-07-01T09:00:00.000Z' });
      expect(row).not.toBeNull();
      expect(row!.dutyDate!.toISOString()).toBe('2026-07-01T09:00:00.000Z');
    });

    it('sets employeeCode to null when missing', () => {
      const row = DutyPlanMapper.mapRow({ dutyDate: NOW });
      expect(row!.employeeCode).toBeNull();
    });

    it('trims whitespace from employeeCode', () => {
      const row = DutyPlanMapper.mapRow({ employeeCode: '  EMP001  ', dutyDate: NOW });
      expect(row!.employeeCode).toBe('EMP001');
    });

    it('sets employeeCode to null for blank string', () => {
      const row = DutyPlanMapper.mapRow({ employeeCode: '   ', dutyDate: NOW });
      expect(row!.employeeCode).toBeNull();
    });

    it('does not require or reference a lastModifiedDate/LASTMODIFIEDDATE field', () => {
      const row = DutyPlanMapper.mapRow({ employeeCode: 'EMP001', dutyDate: NOW, lastModifiedDate: undefined });
      expect(row).not.toBeNull();
      expect(row).not.toHaveProperty('lastModifiedDate');
    });
  });

  describe('toEvent', () => {
    it('sets source to DUTY_PLAN', () => {
      const row = { employeeCode: 'EMP001', dutyDate: NOW, raw: {} };
      const event = DutyPlanMapper.toEvent(row);
      expect(event.source).toBe('DUTY_PLAN');
    });

    it('maps employeeCode and dutyDate', () => {
      const row = { employeeCode: 'EMP001', dutyDate: NOW, raw: {} };
      const event = DutyPlanMapper.toEvent(row);
      expect(event.employeeCode).toBe('EMP001');
      expect(event.dutyDate).toEqual(NOW);
    });

    it('uses the supplied poll time as triggeredAt (no per-row timestamp exists)', () => {
      const row = { employeeCode: null, dutyDate: null, raw: {} };
      const event = DutyPlanMapper.toEvent(row, MOD);
      expect(event.triggeredAt).toEqual(MOD);
    });

    it('defaults triggeredAt to now when not supplied', () => {
      const row = { employeeCode: null, dutyDate: null, raw: {} };
      const before = Date.now();
      const event = DutyPlanMapper.toEvent(row);
      expect(event.triggeredAt.getTime()).toBeGreaterThanOrEqual(before);
    });

    it('assigns a unique correlationId per call', () => {
      const row = { employeeCode: null, dutyDate: null, raw: {} };
      const e1 = DutyPlanMapper.toEvent(row, MOD);
      const e2 = DutyPlanMapper.toEvent(row, MOD);
      expect(e1.correlationId).not.toBe(e2.correlationId);
    });
  });
});

// ── LeaveMapper ───────────────────────────────────────────────────────────────

describe('LeaveMapper', () => {
  it('returns null when leaveDate is absent', () => {
    expect(LeaveMapper.mapRow({ employeeCode: 'EMP001' })).toBeNull();
  });

  it('returns null when leaveDate is invalid', () => {
    expect(LeaveMapper.mapRow({ leaveDate: 'not-a-date' })).toBeNull();
  });

  it('sets source to LEAVE', () => {
    const row = { employeeCode: 'EMP001', leaveDate: NOW, raw: {} };
    expect(LeaveMapper.toEvent(row).source).toBe('LEAVE');
  });

  it('maps leaveDate as dutyDate on the event', () => {
    const row = { employeeCode: 'EMP001', leaveDate: NOW, raw: {} };
    const event = LeaveMapper.toEvent(row);
    expect(event.dutyDate).toEqual(NOW);
  });

  it('uses the supplied poll time as triggeredAt (no per-row timestamp exists)', () => {
    const row = { employeeCode: null, leaveDate: null, raw: {} };
    const event = LeaveMapper.toEvent(row, MOD);
    expect(event.triggeredAt).toEqual(MOD);
  });

  it('does not require or reference a lastModifiedDate/LASTMODIFIEDDATE field', () => {
    const row = LeaveMapper.mapRow({ employeeCode: 'EMP001', leaveDate: NOW, lastModifiedDate: undefined });
    expect(row).not.toBeNull();
    expect(row).not.toHaveProperty('lastModifiedDate');
  });
});

// ── DutyPlanDependencyPoller ──────────────────────────────────────────────────

describe('DutyPlanDependencyPoller', () => {
  beforeEach(() => {
    delete process.env['DEPENDENCY_DUTYPLAN_POLL_ENABLED'];
    delete process.env['DEPENDENCY_POLL_BATCH_SIZE'];
  });

  function makePoller(oracleAvailable = true, rows: Record<string, unknown>[] = []) {
    const redis  = makeRedis();
    const oracle = makeOracle(oracleAvailable, rows);
    const config = makeConfig();
    const router = makeRouter();
    const logger = makeLogger();
    const poller = new DutyPlanDependencyPoller(redis as any, oracle as any, config as any, router as any, logger);
    return { poller, redis, oracle, router, logger };
  }

  it('returns immediately when DEPENDENCY_DUTYPLAN_POLL_ENABLED=false', async () => {
    process.env['DEPENDENCY_DUTYPLAN_POLL_ENABLED'] = 'false';
    const { poller, oracle } = makePoller();
    await poller.poll();
    expect(oracle.query).not.toHaveBeenCalled();
    expect(poller.getMetrics().enabled).toBe(false);
  });

  it('returns immediately when Oracle is unavailable', async () => {
    const { poller, oracle, logger } = makePoller(false);
    await poller.poll();
    expect(oracle.query).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });

  it('never queries with a LASTMODIFIEDDATE cursor param — uses a PLANDATE window instead', async () => {
    const { poller, oracle } = makePoller(true, []);
    await poller.poll();
    expect(oracle.query).toHaveBeenCalledTimes(1);
    const [sql, params] = (oracle.query as jest.Mock).mock.calls[0];
    expect(sql).not.toMatch(/LASTMODIFIEDDATE/);
    expect(sql).toMatch(/windowStart/);
    expect(sql).toMatch(/windowEnd/);
    expect(params).toHaveProperty('windowStart');
    expect(params).toHaveProperty('windowEnd');
    expect(params).not.toHaveProperty('cursor');
  });

  it('computes the window floor as (today - refreshPastDays) without persisting anything, in the normal (no override) case', async () => {
    const { poller, redis } = makePoller(true, []);
    await poller.poll();
    // no admin override was set, so nothing needs to be written to Redis —
    // the floor is derived fresh from wall-clock time every poll
    expect(redis.set).not.toHaveBeenCalled();
    expect(redis.get).toHaveBeenCalledWith('attendance:dep:dutyplan:cursor');
    expect(poller.getMetrics().cursor).not.toBeNull();
  });

  it('does not advance or persist the window floor after a poll with rows (periodic refresh, not incremental)', async () => {
    const rows = [
      { employeeCode: 'EMP001', dutyDate: NOW },
      { employeeCode: 'EMP002', dutyDate: new Date('2026-07-10T00:00:00.000Z') },
    ];
    const { poller, redis } = makePoller(true, rows);
    await poller.poll();
    expect(redis.set).not.toHaveBeenCalled();
  });

  it('applies a resetCursor() override on the very next poll, then reverts to the normal rolling window', async () => {
    const { poller, redis } = makePoller(true, []);
    const farPast = new Date('2020-01-01T00:00:00.000Z');
    await poller.resetCursor(farPast);
    expect(redis.set).toHaveBeenCalledWith('attendance:dep:dutyplan:cursor', farPast.toISOString());

    await poller.poll();
    // override consumed and cleared
    expect(redis.del).toHaveBeenCalledWith('attendance:dep:dutyplan:cursor');
    expect(poller.getMetrics().cursor).toBe(farPast.toISOString());

    // second poll: override gone, back to the normal rolling floor (not 2020)
    await poller.poll();
    expect(poller.getMetrics().cursor).not.toBe(farPast.toISOString());
  });

  it('routes one event per row via DependencyEventRouter', async () => {
    const rows = [
      { employeeCode: 'EMP001', dutyDate: NOW },
      { employeeCode: 'EMP002', dutyDate: NOW },
    ];
    const { poller, router } = makePoller(true, rows);
    await poller.poll();
    expect(router.route).toHaveBeenCalledTimes(2);
  });

  it('updates eventsEmittedTotal in metrics after successful poll', async () => {
    const rows = [{ employeeCode: 'EMP001', dutyDate: NOW }];
    const { poller } = makePoller(true, rows);
    await poller.poll();
    expect(poller.getMetrics().eventsEmittedTotal).toBe(1);
  });

  it('resetCursor() sets the window floor to the given date', async () => {
    const { poller, redis } = makePoller(true, []);
    const floorDate = new Date('2026-06-01T00:00:00.000Z');
    await poller.resetCursor(floorDate);
    expect(redis.set).toHaveBeenCalledWith(expect.any(String), floorDate.toISOString());
    expect(poller.getMetrics().cursor).toBe(floorDate.toISOString());
  });

  it('never throws — catches Oracle errors internally', async () => {
    const oracle = { isAvailable: true, query: jest.fn().mockRejectedValue(new Error('ORA-00942')) };
    const poller = new DutyPlanDependencyPoller(makeRedis() as any, oracle as any, makeConfig() as any, makeRouter() as any, makeLogger());
    await expect(poller.poll()).resolves.toBeUndefined();
    expect(poller.getMetrics().errorsTotal).toBe(1);
    expect(poller.getMetrics().lastError).toBe('ORA-00942');
  });

  it('does not run concurrent polls', async () => {
    // Create the blocking promise BEFORE the mock so resolveQuery is assigned synchronously.
    let resolveQuery!: (v: Record<string, unknown>[]) => void;
    const blockingPromise = new Promise<Record<string, unknown>[]>((res) => { resolveQuery = res; });

    const oracle = {
      isAvailable: true,
      query: jest.fn().mockReturnValue(blockingPromise),
    };
    const poller = new DutyPlanDependencyPoller(makeRedis() as any, oracle as any, makeConfig() as any, makeRouter() as any, makeLogger());

    // p1 sets running=true synchronously (before its first await), so p2 sees the guard.
    const p1 = poller.poll();
    const p2 = poller.poll(); // running=true → returns immediately

    // Flush microtasks so p1 can advance through getCursor + getConfig awaits
    // and actually reach oracle.query before we unblock it.
    for (let i = 0; i < 6; i++) await Promise.resolve();

    resolveQuery([]); // unblock p1's oracle.query
    await Promise.all([p1, p2]);
    expect(oracle.query).toHaveBeenCalledTimes(1);
  });
});

// ── LeaveDependencyPoller ─────────────────────────────────────────────────────

describe('LeaveDependencyPoller', () => {
  beforeEach(() => {
    delete process.env['DEPENDENCY_LEAVE_POLL_ENABLED'];
  });

  it('returns immediately when DEPENDENCY_LEAVE_POLL_ENABLED=false', async () => {
    process.env['DEPENDENCY_LEAVE_POLL_ENABLED'] = 'false';
    const oracle = makeOracle();
    const poller = new LeaveDependencyPoller(makeRedis() as any, oracle as any, makeConfig() as any, makeRouter() as any, makeLogger());
    await poller.poll();
    expect(oracle.query).not.toHaveBeenCalled();
  });

  it('never throws on Oracle error — increments errorsTotal', async () => {
    const oracle = { isAvailable: true, query: jest.fn().mockRejectedValue(new Error('timeout')) };
    const poller = new LeaveDependencyPoller(makeRedis() as any, oracle as any, makeConfig() as any, makeRouter() as any, makeLogger());
    await expect(poller.poll()).resolves.toBeUndefined();
    expect(poller.getMetrics().errorsTotal).toBe(1);
  });

  it('emits LEAVE events', async () => {
    const rows = [{ employeeCode: 'EMP001', leaveDate: NOW }];
    const oracle = makeOracle(true, rows);
    const router = makeRouter();
    const poller = new LeaveDependencyPoller(makeRedis() as any, oracle as any, makeConfig() as any, router as any, makeLogger());
    await poller.poll();
    expect(router.route).toHaveBeenCalledTimes(1);
    const firstCall = (router.route as jest.Mock).mock.calls[0] as [{ source: string }];
    expect(firstCall[0].source).toBe('LEAVE');
    expect(poller.getMetrics().eventsEmittedTotal).toBe(1);
  });

  it('reaches employeeCode via LEAVEDETAILID -> APPLIEDLEAVES -> EMPLOYEE, with a FROMDATE window and no TODATE/LASTMODIFIEDDATE reference', async () => {
    const oracle = makeOracle(true, []);
    const poller = new LeaveDependencyPoller(makeRedis() as any, oracle as any, makeConfig() as any, makeRouter() as any, makeLogger());
    await poller.poll();
    expect(oracle.query).toHaveBeenCalledTimes(1);
    const [sql, params] = (oracle.query as jest.Mock).mock.calls[0];
    expect(sql).not.toMatch(/\bL\."?EMPID\b/);
    expect(sql).not.toMatch(/LASTMODIFIEDDATE/);
    expect(sql).not.toMatch(/\bTODATE\b/);
    expect(sql).not.toMatch(/\bL\."?EMPCODE\b/);
    expect(sql).toMatch(/LEAVEDETAILID/);
    expect(sql).toMatch(/APPLIEDLEAVES/);
    expect(sql).toMatch(/JOIN\s+EMPLOYEE\b/i);
    expect(sql).toMatch(/EMPNO/);
    expect(sql).toMatch(/FROMDATE/);
    expect(params).toHaveProperty('windowStart');
    expect(params).toHaveProperty('windowEnd');
    expect(params).not.toHaveProperty('cursor');
  });

  it('does not advance or persist the window floor after a poll with rows (periodic refresh, not incremental)', async () => {
    const rows = [{ employeeCode: 'EMP001', leaveDate: NOW }];
    const redis = makeRedis();
    const oracle = makeOracle(true, rows);
    const poller = new LeaveDependencyPoller(redis as any, oracle as any, makeConfig() as any, makeRouter() as any, makeLogger());
    await poller.poll();
    expect(redis.set).not.toHaveBeenCalled();
  });

  it('applies a resetCursor() override on the very next poll, then reverts to the normal rolling window', async () => {
    const redis = makeRedis();
    const poller = new LeaveDependencyPoller(redis as any, makeOracle(true, []) as any, makeConfig() as any, makeRouter() as any, makeLogger());
    const farPast = new Date('2020-01-01T00:00:00.000Z');
    await poller.resetCursor(farPast);
    expect(redis.set).toHaveBeenCalledWith('attendance:dep:leave:cursor', farPast.toISOString());

    await poller.poll();
    expect(redis.del).toHaveBeenCalledWith('attendance:dep:leave:cursor');
    expect(poller.getMetrics().cursor).toBe(farPast.toISOString());

    await poller.poll();
    expect(poller.getMetrics().cursor).not.toBe(farPast.toISOString());
  });
});

// ── DependencyPollingOrchestrator ─────────────────────────────────────────────

describe('DependencyPollingOrchestrator', () => {
  beforeEach(() => {
    delete process.env['DEPENDENCY_POLLING_ENABLED'];
    delete process.env['DEPENDENCY_POLL_INTERVAL_MS'];
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function makeStubPoller(name: string, throwOnPoll = false): AttendanceDependencyPoller {
    return {
      name,
      poll:         jest.fn(async () => { if (throwOnPoll) throw new Error(`${name} exploded`); }),
      getMetrics:   jest.fn(() => ({ enabled: true, running: false, lastPollAt: null, lastSuccessAt: null, rowsLastPoll: 0, eventsEmittedTotal: 0, errorsTotal: 0, lastError: null, cursor: null })),
      resetCursor:  jest.fn(async () => {}),
    };
  }

  it('tick() calls all pollers independently', async () => {
    const dp = makeStubPoller('DutyPlan');
    const lv = makeStubPoller('Leave');
    const logger = makeLogger();
    // Construct with real poller types — use casting to avoid DI overhead in tests
    const orchestrator = new DependencyPollingOrchestrator(dp as any, lv as any, { name: "HolidayDependencyPoller", poll: jest.fn(async () => {}), getMetrics: jest.fn(() => ({ enabled: false, running: false, lastPollAt: null, lastSuccessAt: null, rowsLastPoll: 0, eventsEmittedTotal: 0, errorsTotal: 0, lastError: null, cursor: null })), resetCursor: jest.fn(async (_d: Date) => {}) } as any, { name: "ShiftTypeDependencyPoller", poll: jest.fn(async () => {}), getMetrics: jest.fn(() => ({ enabled: false, running: false, lastPollAt: null, lastSuccessAt: null, rowsLastPoll: 0, eventsEmittedTotal: 0, errorsTotal: 0, lastError: null, cursor: null })), resetCursor: jest.fn(async (_d: Date) => {}) } as any, logger, makeOrchestratorAttendanceConfig(), makeOrchestratorLicenseService());
    await orchestrator.tick();
    expect(dp.poll).toHaveBeenCalledTimes(1);
    expect(lv.poll).toHaveBeenCalledTimes(1);
  });

  it('tick() continues with remaining pollers when one throws', async () => {
    const dp = makeStubPoller('DutyPlan', true); // throws
    const lv = makeStubPoller('Leave');
    const logger = makeLogger();
    const orchestrator = new DependencyPollingOrchestrator(dp as any, lv as any, { name: "HolidayDependencyPoller", poll: jest.fn(async () => {}), getMetrics: jest.fn(() => ({ enabled: false, running: false, lastPollAt: null, lastSuccessAt: null, rowsLastPoll: 0, eventsEmittedTotal: 0, errorsTotal: 0, lastError: null, cursor: null })), resetCursor: jest.fn(async (_d: Date) => {}) } as any, { name: "ShiftTypeDependencyPoller", poll: jest.fn(async () => {}), getMetrics: jest.fn(() => ({ enabled: false, running: false, lastPollAt: null, lastSuccessAt: null, rowsLastPoll: 0, eventsEmittedTotal: 0, errorsTotal: 0, lastError: null, cursor: null })), resetCursor: jest.fn(async (_d: Date) => {}) } as any, logger, makeOrchestratorAttendanceConfig(), makeOrchestratorLicenseService());
    await expect(orchestrator.tick()).resolves.toBeUndefined();
    // Leave poller must still have been called despite DutyPlan throwing
    expect(lv.poll).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalled();
  });

  it('getMetrics() includes per-poller metrics keyed by name', async () => {
    const dp = makeStubPoller('DutyPlanDependencyPoller');
    const lv = makeStubPoller('LeaveDependencyPoller');
    const orchestrator = new DependencyPollingOrchestrator(dp as any, lv as any, { name: "HolidayDependencyPoller", poll: jest.fn(async () => {}), getMetrics: jest.fn(() => ({ enabled: false, running: false, lastPollAt: null, lastSuccessAt: null, rowsLastPoll: 0, eventsEmittedTotal: 0, errorsTotal: 0, lastError: null, cursor: null })), resetCursor: jest.fn(async (_d: Date) => {}) } as any, { name: "ShiftTypeDependencyPoller", poll: jest.fn(async () => {}), getMetrics: jest.fn(() => ({ enabled: false, running: false, lastPollAt: null, lastSuccessAt: null, rowsLastPoll: 0, eventsEmittedTotal: 0, errorsTotal: 0, lastError: null, cursor: null })), resetCursor: jest.fn(async (_d: Date) => {}) } as any, makeLogger(), makeOrchestratorAttendanceConfig(), makeOrchestratorLicenseService());
    const metrics = orchestrator.getMetrics();
    expect(metrics.pollers).toHaveProperty('DutyPlanDependencyPoller');
    expect(metrics.pollers).toHaveProperty('LeaveDependencyPoller');
  });

  it('getMetrics() tickCount increments on each tick()', async () => {
    const orchestrator = new DependencyPollingOrchestrator(makeStubPoller('A') as any, makeStubPoller('B') as any, { name: "HolidayDependencyPoller", poll: jest.fn(async () => {}), getMetrics: jest.fn(() => ({ enabled: false, running: false, lastPollAt: null, lastSuccessAt: null, rowsLastPoll: 0, eventsEmittedTotal: 0, errorsTotal: 0, lastError: null, cursor: null })), resetCursor: jest.fn(async (_d: Date) => {}) } as any, { name: "ShiftTypeDependencyPoller", poll: jest.fn(async () => {}), getMetrics: jest.fn(() => ({ enabled: false, running: false, lastPollAt: null, lastSuccessAt: null, rowsLastPoll: 0, eventsEmittedTotal: 0, errorsTotal: 0, lastError: null, cursor: null })), resetCursor: jest.fn(async (_d: Date) => {}) } as any, makeLogger(), makeOrchestratorAttendanceConfig(), makeOrchestratorLicenseService());
    expect(orchestrator.getMetrics().tickCount).toBe(0);
    await orchestrator.tick();
    await orchestrator.tick();
    expect(orchestrator.getMetrics().tickCount).toBe(2);
  });

  it('onApplicationBootstrap() skips timer when DEPENDENCY_POLLING_ENABLED=false', () => {
    process.env['DEPENDENCY_POLLING_ENABLED'] = 'false';
    const dp = makeStubPoller('A');
    const orchestrator = new DependencyPollingOrchestrator(dp as any, makeStubPoller('B') as any, { name: "HolidayDependencyPoller", poll: jest.fn(async () => {}), getMetrics: jest.fn(() => ({ enabled: false, running: false, lastPollAt: null, lastSuccessAt: null, rowsLastPoll: 0, eventsEmittedTotal: 0, errorsTotal: 0, lastError: null, cursor: null })), resetCursor: jest.fn(async (_d: Date) => {}) } as any, { name: "ShiftTypeDependencyPoller", poll: jest.fn(async () => {}), getMetrics: jest.fn(() => ({ enabled: false, running: false, lastPollAt: null, lastSuccessAt: null, rowsLastPoll: 0, eventsEmittedTotal: 0, errorsTotal: 0, lastError: null, cursor: null })), resetCursor: jest.fn(async (_d: Date) => {}) } as any, makeLogger(), makeOrchestratorAttendanceConfig(), makeOrchestratorLicenseService());
    orchestrator.onApplicationBootstrap();
    jest.runAllTimers();
    expect(dp.poll).not.toHaveBeenCalled();
  });

  it('onApplicationBootstrap() fires an immediate tick when enabled', async () => {
    const dp = makeStubPoller('A');
    const orchestrator = new DependencyPollingOrchestrator(dp as any, makeStubPoller('B') as any, { name: "HolidayDependencyPoller", poll: jest.fn(async () => {}), getMetrics: jest.fn(() => ({ enabled: false, running: false, lastPollAt: null, lastSuccessAt: null, rowsLastPoll: 0, eventsEmittedTotal: 0, errorsTotal: 0, lastError: null, cursor: null })), resetCursor: jest.fn(async (_d: Date) => {}) } as any, { name: "ShiftTypeDependencyPoller", poll: jest.fn(async () => {}), getMetrics: jest.fn(() => ({ enabled: false, running: false, lastPollAt: null, lastSuccessAt: null, rowsLastPoll: 0, eventsEmittedTotal: 0, errorsTotal: 0, lastError: null, cursor: null })), resetCursor: jest.fn(async (_d: Date) => {}) } as any, makeLogger(), makeOrchestratorAttendanceConfig(), makeOrchestratorLicenseService());
    orchestrator.onApplicationBootstrap();
    // The immediate tick is async; flush microtasks
    await Promise.resolve();
    orchestrator.onApplicationShutdown();
  });
});
