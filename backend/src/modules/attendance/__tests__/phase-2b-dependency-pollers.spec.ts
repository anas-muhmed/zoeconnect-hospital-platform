/**
 * Phase 2B — Unit tests for HolidayDependencyPoller, ShiftTypeDependencyPoller,
 * and the scope field on Phase 2A mappers.
 *
 * Tests:
 *   Scope field on Phase 2A mappers (regression)
 *     • DutyPlanMapper.toEvent() sets scope='EMPLOYEE'
 *     • LeaveMapper.toEvent() sets scope='EMPLOYEE'
 *
 *   HolidayMapper
 *     • mapRow() returns null when lastModifiedDate is absent
 *     • mapRow() returns null when lastModifiedDate is invalid
 *     • mapRow() parses Date objects directly
 *     • mapRow() parses ISO string timestamps
 *     • mapRow() carries holidayDate as Date
 *     • toEvent() sets source='HOLIDAY', scope='GLOBAL'
 *     • toEvent() sets employeeCode=null (global — no specific employee)
 *     • toEvent() sets dutyDate=holidayDate
 *     • toEvent() uses lastModifiedDate as triggeredAt
 *     • toEvent() assigns a unique correlationId per call
 *     • toEvent() carries shiftId/shiftCode in payload (n/a — holiday carries holidayDate)
 *
 *   ShiftTypeMapper
 *     • mapRow() returns null when lastModifiedDate is absent
 *     • mapRow() parses dates and extracts shiftId / shiftCode
 *     • toEvent() sets source='SHIFT_TYPE', scope='CONFIG'
 *     • toEvent() sets employeeCode=null and dutyDate=null
 *     • toEvent() carries shiftId and shiftCode in payload
 *     • toEvent() assigns a unique correlationId per call
 *
 *   HolidayDependencyPoller
 *     • poll() returns immediately when DEPENDENCY_HOLIDAY_POLL_ENABLED != 'true'
 *     • poll() returns immediately when Oracle is unavailable
 *     • poll() emits GLOBAL-scope events and advances cursor after success
 *     • poll() does NOT advance cursor when no rows are returned
 *     • poll() never throws — catches errors internally
 *     • poll() increments errorsTotal on Oracle error
 *     • poll() does not run concurrent polls
 *     • resetCursor() writes ISO string to Redis and updates metrics.cursor
 *
 *   ShiftTypeDependencyPoller
 *     • poll() returns immediately when DEPENDENCY_SHIFTTYPE_POLL_ENABLED != 'true'
 *     • poll() returns immediately when Oracle is unavailable
 *     • poll() emits CONFIG-scope events with shiftId/shiftCode in payload
 *     • poll() advances cursor after success
 *     • poll() never throws on Oracle error
 *     • getMetrics() reflects errorsTotal after failed poll
 *     • resetCursor() updates Redis cursor
 *
 *   DependencyPollingOrchestrator (4-poller regression)
 *     • tick() calls all four pollers independently
 *     • tick() continues when one poller throws
 *     • getMetrics() keys include all four poller names
 */

import { HolidayMapper }   from '../dependency/mappers/holiday.mapper';
import { ShiftTypeMapper }  from '../dependency/mappers/shift-type.mapper';
import { DutyPlanMapper }   from '../dependency/mappers/duty-plan.mapper';
import { LeaveMapper }      from '../dependency/mappers/leave.mapper';
import { HolidayDependencyPoller }   from '../dependency/pollers/holiday-dependency.poller';
import { ShiftTypeDependencyPoller } from '../dependency/pollers/shift-type-dependency.poller';
import { DutyPlanDependencyPoller }  from '../dependency/pollers/duty-plan-dependency.poller';
import { LeaveDependencyPoller }     from '../dependency/pollers/leave-dependency.poller';
import { DependencyPollingOrchestrator } from '../dependency/dependency-polling-orchestrator.service';
import type { AttendanceDependencyPoller } from '../dependency/interfaces/attendance-dependency-poller.interface';
import type { AttendanceStructuredLogger } from '../services/attendance-structured-logger.service';
import type { AttendanceConfigService } from '../services/attendance-config.service';
import type { LicenseService } from '../../licensing/license.service';

// attendanceConfig / licenseService (added to DependencyPollingOrchestrator's
// constructor since this test was last updated). tick() (called directly by
// these tests) gates on licenseService.isModuleLicensed('ATTENDANCE') --
// must resolve true or every poller.poll() assertion below would fail.
function makeOrchestratorAttendanceConfig(): jest.Mocked<AttendanceConfigService> {
  return {
    getRuntimeConfig: jest.fn().mockResolvedValue({
      depPollingEnabled: process.env['DEPENDENCY_POLLING_ENABLED'] !== 'false',
      depPollIntervalMs: 30_000,
    }),
  } as unknown as jest.Mocked<AttendanceConfigService>;
}

function makeOrchestratorLicenseService(): jest.Mocked<LicenseService> {
  return {
    isModuleLicensed: jest.fn().mockResolvedValue(true),
  } as unknown as jest.Mocked<LicenseService>;
}

// ── Shared test helpers ───────────────────────────────────────────────────────

function makeRedis(initialStore: Record<string, string> = {}) {
  const store: Record<string, string> = { ...initialStore };
  return {
    get:   jest.fn(async (_key: string) => store[_key] ?? null),
    set:   jest.fn(async (key: string, val: string) => { store[key] = val; }),
    _store: store,
  };
}

function makeOracle(available = true, rows: Record<string, unknown>[] = []) {
  return { isAvailable: available, query: jest.fn(async () => rows) };
}

function makeHolidayConfig() {
  const cfg: Record<string, string> = {
    'attendance.holiday.table':            'HOLIDAY',
    'attendance.holiday.date':             'HOLDATE',
    'attendance.holiday.lastModifiedDate': 'LASTMODIFIEDDATE',
  };
  return {
    getConfig: jest.fn(async () => cfg),
    ident:     jest.fn((_cfg: Record<string,string>, key: string) => cfg[key] ?? key),
  };
}

function makeShiftTypeConfig() {
  const cfg: Record<string, string> = {
    'attendance.shift.table':            'SHIFT_TYPE',
    'attendance.shift.id':               'ID',
    'attendance.shift.code':             'CODE',
    'attendance.shift.lastModifiedDate': 'LASTMODIFIEDDATE',
  };
  return {
    getConfig: jest.fn(async () => cfg),
    ident:     jest.fn((_cfg: Record<string,string>, key: string) => cfg[key] ?? key),
  };
}

function makeDutyPlanConfig() {
  // DUTYPLANVALUES has no modification-timestamp column in the HIS Oracle
  // schema — do not add an 'attendance.roster.lastModifiedDate' mapping here.
  const cfg: Record<string, string> = {
    'attendance.roster.table':            'DUTYPLANVALUES',
    'attendance.roster.employeeId':       'EMPID',
    'attendance.roster.dutyDate':         'PLANDATE',
    'attendance.employee.table':          'EMPLOYEE',
    'attendance.employee.id':             'EMPLOYEE_ID',
    'attendance.employee.code':           'EMPNO',
  };
  return {
    getConfig: jest.fn(async () => cfg),
    ident:     jest.fn((_cfg: Record<string,string>, key: string) => cfg[key] ?? key),
    getRuntimeConfig: jest.fn(async () => ({
      depPollBatchSize:             500,
      depDutyplanEnabled:           true,
      depDutyplanRefreshPastDays:   1,
      depDutyplanRefreshFutureDays: 14,
    })),
  };
}

function makeLeaveConfig() {
  // EMPLOYEELEAVELIST has no modification-timestamp column, and no employee
  // column at all, in the HIS Oracle schema — do not add an
  // 'attendance.employeeLeave.lastModifiedDate' or '...employeeId' mapping.
  // The employee is reached via LEAVEDETAILID -> APPLIEDLEAVES.ID ->
  // APPLIEDLEAVES.EMPID -> EMPLOYEE.EMPLOYEE_ID -> EMPNO.
  const cfg: Record<string, string> = {
    'attendance.employeeLeave.table':            'EMPLOYEELEAVELIST',
    'attendance.employeeLeave.leaveDate':        'FROMDATE',
    'attendance.employeeLeave.leaveDetailId':    'LEAVEDETAILID',
    'attendance.appliedLeave.table':             'APPLIEDLEAVES',
    'attendance.appliedLeave.id':                'ID',
    'attendance.appliedLeave.employeeId':        'EMPID',
    'attendance.employee.table':                 'EMPLOYEE',
    'attendance.employee.id':                    'EMPLOYEE_ID',
    'attendance.employee.code':                  'EMPNO',
  };
  return {
    getConfig: jest.fn(async () => cfg),
    ident:     jest.fn((_cfg: Record<string,string>, key: string) => cfg[key] ?? key),
    getRuntimeConfig: jest.fn(async () => ({
      depPollBatchSize:          500,
      depLeaveEnabled:           true,
      depLeaveRefreshPastDays:   1,
      depLeaveRefreshFutureDays: 14,
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
    debug:   jest.fn(),
    time:    jest.fn(() => Date.now()),
    elapsed: jest.fn(() => 0),
  } as unknown as jest.Mocked<AttendanceStructuredLogger>;
}

const NOW = new Date('2026-07-03T10:00:00.000Z');
const MOD = new Date('2026-07-03T09:00:00.000Z');

// ── Scope field on Phase 2A mappers (regression) ──────────────────────────────

describe('Phase 2A mapper scope regression', () => {
  it('DutyPlanMapper.toEvent sets scope=EMPLOYEE', () => {
    const event = DutyPlanMapper.toEvent({ employeeCode: 'EMP001', dutyDate: NOW, raw: {} }, MOD);
    expect(event.scope).toBe('EMPLOYEE');
  });

  it('LeaveMapper.toEvent sets scope=EMPLOYEE', () => {
    const event = LeaveMapper.toEvent({ employeeCode: 'EMP001', leaveDate: NOW, raw: {} }, MOD);
    expect(event.scope).toBe('EMPLOYEE');
  });
});

// ── HolidayMapper ─────────────────────────────────────────────────────────────

describe('HolidayMapper', () => {
  describe('mapRow', () => {
    it('returns null when lastModifiedDate is absent', () => {
      expect(HolidayMapper.mapRow({ holidayDate: NOW })).toBeNull();
    });

    it('returns null when lastModifiedDate is invalid', () => {
      expect(HolidayMapper.mapRow({ lastModifiedDate: 'bad-date' })).toBeNull();
    });

    it('parses Date objects directly', () => {
      const row = HolidayMapper.mapRow({ holidayDate: NOW, lastModifiedDate: MOD });
      expect(row).not.toBeNull();
      expect(row!.lastModifiedDate).toEqual(MOD);
    });

    it('parses ISO string timestamps', () => {
      const row = HolidayMapper.mapRow({ lastModifiedDate: '2026-07-03T09:00:00.000Z' });
      expect(row).not.toBeNull();
      expect(row!.lastModifiedDate!.toISOString()).toBe('2026-07-03T09:00:00.000Z');
    });

    it('carries holidayDate as Date', () => {
      const row = HolidayMapper.mapRow({ holidayDate: NOW, lastModifiedDate: MOD });
      expect(row!.holidayDate).toEqual(NOW);
    });

    it('sets holidayDate to null when missing', () => {
      const row = HolidayMapper.mapRow({ lastModifiedDate: MOD });
      expect(row!.holidayDate).toBeNull();
    });
  });

  describe('toEvent', () => {
    const row = { holidayDate: NOW, lastModifiedDate: MOD, raw: { extra: 1 } };

    it('sets source=HOLIDAY', () => {
      expect(HolidayMapper.toEvent(row).source).toBe('HOLIDAY');
    });

    it('sets scope=GLOBAL', () => {
      expect(HolidayMapper.toEvent(row).scope).toBe('GLOBAL');
    });

    it('sets employeeCode=null (no specific employee)', () => {
      expect(HolidayMapper.toEvent(row).employeeCode).toBeNull();
    });

    it('sets dutyDate=holidayDate', () => {
      expect(HolidayMapper.toEvent(row).dutyDate).toEqual(NOW);
    });

    it('uses lastModifiedDate as triggeredAt', () => {
      expect(HolidayMapper.toEvent(row).triggeredAt).toEqual(MOD);
    });

    it('assigns a unique correlationId per call', () => {
      const e1 = HolidayMapper.toEvent(row);
      const e2 = HolidayMapper.toEvent(row);
      expect(e1.correlationId).not.toBe(e2.correlationId);
    });

    it('stores holidayDate ISO string in payload', () => {
      const event = HolidayMapper.toEvent(row);
      expect(event.payload['holidayDate']).toBe(NOW.toISOString());
    });
  });
});

// ── ShiftTypeMapper ───────────────────────────────────────────────────────────

describe('ShiftTypeMapper', () => {
  describe('mapRow', () => {
    it('returns null when lastModifiedDate is absent', () => {
      expect(ShiftTypeMapper.mapRow({ shiftId: 1, shiftCode: 'MORNING' })).toBeNull();
    });

    it('returns null when lastModifiedDate is invalid', () => {
      expect(ShiftTypeMapper.mapRow({ lastModifiedDate: 'nope', shiftId: 1 })).toBeNull();
    });

    it('parses timestamps and extracts shiftId / shiftCode', () => {
      const row = ShiftTypeMapper.mapRow({ shiftId: 42, shiftCode: 'NIGHT', lastModifiedDate: MOD });
      expect(row).not.toBeNull();
      expect(row!.shiftId).toBe(42);
      expect(row!.shiftCode).toBe('NIGHT');
      expect(row!.lastModifiedDate).toEqual(MOD);
    });

    it('trims whitespace from shiftCode', () => {
      const row = ShiftTypeMapper.mapRow({ shiftCode: '  DAY  ', lastModifiedDate: MOD });
      expect(row!.shiftCode).toBe('DAY');
    });

    it('sets shiftCode to null for blank string', () => {
      const row = ShiftTypeMapper.mapRow({ shiftCode: '   ', lastModifiedDate: MOD });
      expect(row!.shiftCode).toBeNull();
    });
  });

  describe('toEvent', () => {
    const row = { shiftId: 7, shiftCode: 'MORNING', lastModifiedDate: MOD, raw: {} };

    it('sets source=SHIFT_TYPE', () => {
      expect(ShiftTypeMapper.toEvent(row).source).toBe('SHIFT_TYPE');
    });

    it('sets scope=CONFIG', () => {
      expect(ShiftTypeMapper.toEvent(row).scope).toBe('CONFIG');
    });

    it('sets employeeCode=null', () => {
      expect(ShiftTypeMapper.toEvent(row).employeeCode).toBeNull();
    });

    it('sets dutyDate=null (config-level, not date-specific)', () => {
      expect(ShiftTypeMapper.toEvent(row).dutyDate).toBeNull();
    });

    it('uses lastModifiedDate as triggeredAt', () => {
      expect(ShiftTypeMapper.toEvent(row).triggeredAt).toEqual(MOD);
    });

    it('carries shiftId in payload', () => {
      const event = ShiftTypeMapper.toEvent(row);
      expect(event.payload['shiftId']).toBe(7);
    });

    it('carries shiftCode in payload', () => {
      const event = ShiftTypeMapper.toEvent(row);
      expect(event.payload['shiftCode']).toBe('MORNING');
    });

    it('assigns a unique correlationId per call', () => {
      const e1 = ShiftTypeMapper.toEvent(row);
      const e2 = ShiftTypeMapper.toEvent(row);
      expect(e1.correlationId).not.toBe(e2.correlationId);
    });
  });
});

// ── HolidayDependencyPoller ───────────────────────────────────────────────────

describe('HolidayDependencyPoller', () => {
  beforeEach(() => {
    delete process.env['DEPENDENCY_HOLIDAY_POLL_ENABLED'];
    delete process.env['DEPENDENCY_POLL_BATCH_SIZE'];
  });

  function makePoller(oracleAvailable = true, rows: Record<string, unknown>[] = []) {
    const redis  = makeRedis();
    const oracle = makeOracle(oracleAvailable, rows);
    const config = makeHolidayConfig();
    const router = makeRouter();
    const logger = makeLogger();
    const poller = new HolidayDependencyPoller(
      redis as any, oracle as any, config as any, router as any, logger,
    );
    return { poller, redis, oracle, router, logger };
  }

  it('poll() returns immediately when DEPENDENCY_HOLIDAY_POLL_ENABLED is not "true"', async () => {
    const { poller, oracle } = makePoller();
    // default env: undefined — isEnabled returns false
    await poller.poll();
    expect(oracle.query).not.toHaveBeenCalled();
    expect(poller.getMetrics().enabled).toBe(false);
  });

  it('poll() returns immediately when DEPENDENCY_HOLIDAY_POLL_ENABLED=false', async () => {
    process.env['DEPENDENCY_HOLIDAY_POLL_ENABLED'] = 'false';
    const { poller, oracle } = makePoller();
    await poller.poll();
    expect(oracle.query).not.toHaveBeenCalled();
  });

  it('poll() returns immediately when Oracle is unavailable', async () => {
    process.env['DEPENDENCY_HOLIDAY_POLL_ENABLED'] = 'true';
    const { poller, oracle, logger } = makePoller(false);
    await poller.poll();
    expect(oracle.query).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });

  it('poll() emits GLOBAL-scope events and advances cursor', async () => {
    process.env['DEPENDENCY_HOLIDAY_POLL_ENABLED'] = 'true';
    const holRow = { holidayDate: NOW, lastModifiedDate: MOD };
    const { poller, redis, router } = makePoller(true, [holRow]);

    await poller.poll();

    expect(router.route).toHaveBeenCalledTimes(1);
    const routed = (router.route as jest.Mock).mock.calls[0][0];
    expect(routed.source).toBe('HOLIDAY');
    expect(routed.scope).toBe('GLOBAL');
    expect(routed.employeeCode).toBeNull();
    expect(routed.dutyDate).toEqual(NOW);

    // Cursor advanced to MOD + 1ms
    expect(redis.set).toHaveBeenCalledWith(
      'attendance:dep:holiday:cursor',
      new Date(MOD.getTime() + 1).toISOString(),
    );
    expect(poller.getMetrics().eventsEmittedTotal).toBe(1);
    expect(poller.getMetrics().rowsLastPoll).toBe(1);
  });

  it('poll() does NOT advance cursor when no rows are returned', async () => {
    process.env['DEPENDENCY_HOLIDAY_POLL_ENABLED'] = 'true';
    const { poller, redis } = makePoller(true, []);

    await poller.poll();

    // Only the initial cursor write (getCursor default) — no advance
    expect(redis.set).toHaveBeenCalledTimes(1);
    expect(poller.getMetrics().eventsEmittedTotal).toBe(0);
  });

  it('poll() never throws — catches errors internally', async () => {
    process.env['DEPENDENCY_HOLIDAY_POLL_ENABLED'] = 'true';
    const { poller, oracle } = makePoller();
    oracle.query.mockRejectedValueOnce(new Error('Oracle timeout'));

    await expect(poller.poll()).resolves.toBeUndefined();
    expect(poller.getMetrics().errorsTotal).toBe(1);
    expect(poller.getMetrics().lastError).toBe('Oracle timeout');
  });

  it('poll() increments errorsTotal on each Oracle failure', async () => {
    process.env['DEPENDENCY_HOLIDAY_POLL_ENABLED'] = 'true';
    const { poller, oracle } = makePoller();
    oracle.query.mockRejectedValue(new Error('fail'));

    await poller.poll();
    await poller.poll();

    expect(poller.getMetrics().errorsTotal).toBe(2);
  });

  it('poll() does not run concurrent polls', async () => {
    process.env['DEPENDENCY_HOLIDAY_POLL_ENABLED'] = 'true';

    let resolveQuery!: (v: Record<string, unknown>[]) => void;
    const blockingPromise = new Promise<Record<string, unknown>[]>((res) => { resolveQuery = res; });

    const redis  = makeRedis();
    const oracle = { isAvailable: true, query: jest.fn().mockReturnValue(blockingPromise) };
    const config = makeHolidayConfig();
    const router = makeRouter();
    const logger = makeLogger();
    const poller = new HolidayDependencyPoller(
      redis as any, oracle as any, config as any, router as any, logger,
    );

    const p1 = poller.poll();
    const p2 = poller.poll(); // should return early

    for (let i = 0; i < 6; i++) await Promise.resolve();

    resolveQuery([]);
    await Promise.all([p1, p2]);

    // query called only once — second poll was skipped
    expect(oracle.query).toHaveBeenCalledTimes(1);
  });

  it('resetCursor() writes ISO string to Redis and updates metrics.cursor', async () => {
    const { poller, redis } = makePoller();
    const date = new Date('2026-01-01T00:00:00.000Z');

    await poller.resetCursor(date);

    expect(redis.set).toHaveBeenCalledWith(
      'attendance:dep:holiday:cursor',
      '2026-01-01T00:00:00.000Z',
    );
    expect(poller.getMetrics().cursor).toBe('2026-01-01T00:00:00.000Z');
  });

  it('getMetrics() reflects lastSuccessAt after a successful poll', async () => {
    process.env['DEPENDENCY_HOLIDAY_POLL_ENABLED'] = 'true';
    const { poller } = makePoller(true, []);

    expect(poller.getMetrics().lastSuccessAt).toBeNull();
    await poller.poll();
    expect(poller.getMetrics().lastSuccessAt).not.toBeNull();
  });
});

// ── ShiftTypeDependencyPoller ─────────────────────────────────────────────────

describe('ShiftTypeDependencyPoller', () => {
  beforeEach(() => {
    delete process.env['DEPENDENCY_SHIFTTYPE_POLL_ENABLED'];
    delete process.env['DEPENDENCY_POLL_BATCH_SIZE'];
  });

  function makePoller(oracleAvailable = true, rows: Record<string, unknown>[] = []) {
    const redis  = makeRedis();
    const oracle = makeOracle(oracleAvailable, rows);
    const config = makeShiftTypeConfig();
    const router = makeRouter();
    const logger = makeLogger();
    const poller = new ShiftTypeDependencyPoller(
      redis as any, oracle as any, config as any, router as any, logger,
    );
    return { poller, redis, oracle, router, logger };
  }

  it('poll() returns immediately when DEPENDENCY_SHIFTTYPE_POLL_ENABLED is not "true"', async () => {
    const { poller, oracle } = makePoller();
    await poller.poll();
    expect(oracle.query).not.toHaveBeenCalled();
    expect(poller.getMetrics().enabled).toBe(false);
  });

  it('poll() returns immediately when Oracle is unavailable', async () => {
    process.env['DEPENDENCY_SHIFTTYPE_POLL_ENABLED'] = 'true';
    const { poller, oracle } = makePoller(false);
    await poller.poll();
    expect(oracle.query).not.toHaveBeenCalled();
  });

  it('poll() emits CONFIG-scope events with shiftId and shiftCode in payload', async () => {
    process.env['DEPENDENCY_SHIFTTYPE_POLL_ENABLED'] = 'true';
    const stRow = { shiftId: 5, shiftCode: 'NIGHT', lastModifiedDate: MOD };
    const { poller, router } = makePoller(true, [stRow]);

    await poller.poll();

    expect(router.route).toHaveBeenCalledTimes(1);
    const routed = (router.route as jest.Mock).mock.calls[0][0];
    expect(routed.source).toBe('SHIFT_TYPE');
    expect(routed.scope).toBe('CONFIG');
    expect(routed.employeeCode).toBeNull();
    expect(routed.dutyDate).toBeNull();
    expect(routed.payload['shiftId']).toBe(5);
    expect(routed.payload['shiftCode']).toBe('NIGHT');
  });

  it('poll() advances cursor after success', async () => {
    process.env['DEPENDENCY_SHIFTTYPE_POLL_ENABLED'] = 'true';
    const stRow = { shiftId: 1, shiftCode: 'DAY', lastModifiedDate: MOD };
    const { poller, redis } = makePoller(true, [stRow]);

    await poller.poll();

    expect(redis.set).toHaveBeenCalledWith(
      'attendance:dep:shifttype:cursor',
      new Date(MOD.getTime() + 1).toISOString(),
    );
    expect(poller.getMetrics().eventsEmittedTotal).toBe(1);
  });

  it('poll() does NOT advance cursor when no rows are returned', async () => {
    process.env['DEPENDENCY_SHIFTTYPE_POLL_ENABLED'] = 'true';
    const { poller, redis } = makePoller(true, []);

    await poller.poll();

    // Only the initial cursor set
    expect(redis.set).toHaveBeenCalledTimes(1);
    expect(poller.getMetrics().eventsEmittedTotal).toBe(0);
  });

  it('poll() never throws on Oracle error', async () => {
    process.env['DEPENDENCY_SHIFTTYPE_POLL_ENABLED'] = 'true';
    const { poller, oracle } = makePoller();
    oracle.query.mockRejectedValueOnce(new Error('DB gone'));

    await expect(poller.poll()).resolves.toBeUndefined();
    expect(poller.getMetrics().errorsTotal).toBe(1);
    expect(poller.getMetrics().lastError).toBe('DB gone');
  });

  it('getMetrics() reflects errorsTotal across multiple failures', async () => {
    process.env['DEPENDENCY_SHIFTTYPE_POLL_ENABLED'] = 'true';
    const { poller, oracle } = makePoller();
    oracle.query.mockRejectedValue(new Error('fail'));

    await poller.poll();
    await poller.poll();

    expect(poller.getMetrics().errorsTotal).toBe(2);
  });

  it('poll() does not run concurrent polls', async () => {
    process.env['DEPENDENCY_SHIFTTYPE_POLL_ENABLED'] = 'true';

    let resolveQuery!: (v: Record<string, unknown>[]) => void;
    const blockingPromise = new Promise<Record<string, unknown>[]>((res) => { resolveQuery = res; });

    const redis  = makeRedis();
    const oracle = { isAvailable: true, query: jest.fn().mockReturnValue(blockingPromise) };
    const config = makeShiftTypeConfig();
    const router = makeRouter();
    const logger = makeLogger();
    const poller = new ShiftTypeDependencyPoller(
      redis as any, oracle as any, config as any, router as any, logger,
    );

    const p1 = poller.poll();
    const p2 = poller.poll();

    for (let i = 0; i < 6; i++) await Promise.resolve();

    resolveQuery([]);
    await Promise.all([p1, p2]);

    expect(oracle.query).toHaveBeenCalledTimes(1);
  });

  it('resetCursor() updates Redis and metrics.cursor', async () => {
    const { poller, redis } = makePoller();
    const date = new Date('2026-06-01T00:00:00.000Z');

    await poller.resetCursor(date);

    expect(redis.set).toHaveBeenCalledWith(
      'attendance:dep:shifttype:cursor',
      '2026-06-01T00:00:00.000Z',
    );
    expect(poller.getMetrics().cursor).toBe('2026-06-01T00:00:00.000Z');
  });
});

// ── DependencyPollingOrchestrator (4-poller regression) ──────────────────────

describe('DependencyPollingOrchestrator with 4 pollers', () => {
  function makeStubPoller(name: string, shouldThrow = false): jest.Mocked<AttendanceDependencyPoller> {
    return {
      name,
      poll:       jest.fn(async () => { if (shouldThrow) throw new Error(`${name} exploded`); }),
      getMetrics: jest.fn(() => ({
        enabled: true, running: false, lastPollAt: null, lastSuccessAt: null,
        rowsLastPoll: 0, eventsEmittedTotal: 0, errorsTotal: 0, lastError: null, cursor: null,
      })),
      resetCursor: jest.fn(async (_date: Date) => {}),
    };
  }

  function makeOrchestrator() {
    const dutyPlanPoller  = makeStubPoller('DutyPlanDependencyPoller') as unknown as DutyPlanDependencyPoller;
    const leavePoller     = makeStubPoller('LeaveDependencyPoller') as unknown as LeaveDependencyPoller;
    const holidayPoller   = makeStubPoller('HolidayDependencyPoller') as unknown as HolidayDependencyPoller;
    const shiftTypePoller = makeStubPoller('ShiftTypeDependencyPoller') as unknown as ShiftTypeDependencyPoller;
    const logger          = makeLogger();
    const orchestrator    = new DependencyPollingOrchestrator(
      dutyPlanPoller, leavePoller, holidayPoller, shiftTypePoller, logger,
      makeOrchestratorAttendanceConfig(), makeOrchestratorLicenseService(),
    );
    return { orchestrator, dutyPlanPoller, leavePoller, holidayPoller, shiftTypePoller, logger };
  }

  beforeEach(() => {
    delete process.env['DEPENDENCY_POLLING_ENABLED'];
  });

  it('tick() calls all four pollers independently', async () => {
    const { orchestrator, dutyPlanPoller, leavePoller, holidayPoller, shiftTypePoller } = makeOrchestrator();
    await orchestrator.tick();
    expect((dutyPlanPoller.poll  as jest.Mock)).toHaveBeenCalledTimes(1);
    expect((leavePoller.poll     as jest.Mock)).toHaveBeenCalledTimes(1);
    expect((holidayPoller.poll   as jest.Mock)).toHaveBeenCalledTimes(1);
    expect((shiftTypePoller.poll as jest.Mock)).toHaveBeenCalledTimes(1);
  });

  it('tick() continues with remaining pollers when one throws', async () => {
    const { logger } = makeOrchestrator();
    const dutyPlanPoller  = makeStubPoller('DutyPlanDependencyPoller', true) as unknown as DutyPlanDependencyPoller;
    const leavePoller     = makeStubPoller('LeaveDependencyPoller') as unknown as LeaveDependencyPoller;
    const holidayPoller   = makeStubPoller('HolidayDependencyPoller') as unknown as HolidayDependencyPoller;
    const shiftTypePoller = makeStubPoller('ShiftTypeDependencyPoller') as unknown as ShiftTypeDependencyPoller;
    const orchestrator    = new DependencyPollingOrchestrator(
      dutyPlanPoller, leavePoller, holidayPoller, shiftTypePoller, logger,
      makeOrchestratorAttendanceConfig(), makeOrchestratorLicenseService(),
    );

    await orchestrator.tick();

    // DutyPlan threw, but the remaining 3 still ran
    expect((leavePoller.poll     as jest.Mock)).toHaveBeenCalledTimes(1);
    expect((holidayPoller.poll   as jest.Mock)).toHaveBeenCalledTimes(1);
    expect((shiftTypePoller.poll as jest.Mock)).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalled();
  });

  it('getMetrics() keys include all four poller names', async () => {
    const { orchestrator } = makeOrchestrator();
    const metrics = orchestrator.getMetrics();

    expect(Object.keys(metrics.pollers)).toEqual(expect.arrayContaining([
      'DutyPlanDependencyPoller',
      'LeaveDependencyPoller',
      'HolidayDependencyPoller',
      'ShiftTypeDependencyPoller',
    ]));
  });

  it('onApplicationBootstrap() does NOT start timer when DEPENDENCY_POLLING_ENABLED=false', () => {
    process.env['DEPENDENCY_POLLING_ENABLED'] = 'false';
    const { orchestrator, logger } = makeOrchestrator();
    orchestrator.onApplicationBootstrap();
    expect(logger.warn).toHaveBeenCalled();
    // No timer set — safe to shutdown immediately
    orchestrator.onApplicationShutdown();
  });
});
