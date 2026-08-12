/**
 * RosterResolver.findNpnlSweepCandidates() — early NPNL flagging bulk scan.
 *
 * Verifies the grace-period filter: an employee is only returned as a
 * candidate once (now - shiftStartTime) >= graceMinutes, and rows with no
 * resolvable shift-start time are skipped rather than guessed at.
 */

import { RosterResolver } from '../services/roster-resolver.service';
import type { OraclePoolService } from '../../his/oracle-pool.service';
import type { AttendanceConfigService } from '../services/attendance-config.service';
import type { AttendanceStructuredLogger } from '../services/attendance-structured-logger.service';

function makeOracle(rows: Record<string, unknown>[]) {
  return {
    query: jest.fn().mockResolvedValue(rows),
    queryOne: jest.fn().mockResolvedValue(null),
    execute: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<OraclePoolService>;
}

function makeAttendanceConfig() {
  const defaults: Record<string, string> = {
    'attendance.employee.table': 'EMPLOYEE',
    'attendance.employee.id': 'EMPLOYEE_ID',
    'attendance.employee.code': 'EMPNO',
    'attendance.roster.table': 'DUTYPLANVALUES',
    'attendance.roster.employeeId': 'EMPID',
    'attendance.roster.dutyDate': 'PLANDATE',
    'attendance.roster.primaryShift': 'SHIFTID',
    'attendance.shift.table': 'SHIFT_TYPE',
    'attendance.shift.id': 'SHIFT_ID',
    'attendance.shift.start': 'STARTTIMING',
  };
  return {
    getConfig: jest.fn().mockResolvedValue({}),
    ident: jest.fn((_cfg: unknown, key: string) => defaults[key] ?? `"${key}"`),
  } as unknown as jest.Mocked<AttendanceConfigService>;
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

describe('RosterResolver.findNpnlSweepCandidates', () => {
  // RosterResolver.parseOracleDate()/startOfDay() both interpret Oracle's
  // "HH:MM" shift-start strings and the duty-date boundary using LOCAL
  // Date methods (setHours, not setUTCHours) -- shift times are the
  // hospital's own local wall-clock time, and `now` is compared against
  // them as real elapsed milliseconds, which is correct regardless of the
  // server's timezone AS LONG AS `now` is constructed the same "local
  // wall-clock" way. The previous version of this test hardcoded `NOW` as
  // a UTC ISO string (`'2026-07-04T10:00:00.000Z'`) and assumed "09:50"
  // meant 10 minutes before that in UTC terms -- which only happened to
  // hold when the test runner's local timezone was UTC. On a machine in a
  // different timezone (confirmed here: IST, UTC+5:30), local-midnight and
  // local-09:50 shift several hours away from the UTC string, breaking the
  // "10 minutes ago" assumption and returning a real (5h40m-elapsed)
  // candidate instead. Constructing NOW via local Date field setters (like
  // parseOracleDate itself does) makes this test's arithmetic timezone-
  // invariant: local 10:00 on the duty day is consistently "1h after 09:00"
  // and "10min after 09:50" no matter what timezone the test runs in.
  const NOW = (() => {
    const d = new Date(2026, 6, 4); // local July 4, 2026 (month is 0-indexed)
    d.setHours(10, 0, 0, 0);
    return d;
  })();

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns an employee whose shift started more than graceMinutes ago', async () => {
    const oracle = makeOracle([
      { employeeCode: 'EMP001', plannedIn: '09:00' }, // started 1h ago
    ]);
    const resolver = new RosterResolver(oracle, makeAttendanceConfig(), makeLogger());

    const candidates = await resolver.findNpnlSweepCandidates(NOW, 15);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].employeeCode).toBe('EMP001');
  });

  it('excludes an employee whose shift started less than graceMinutes ago', async () => {
    const oracle = makeOracle([
      { employeeCode: 'EMP002', plannedIn: '09:50' }, // started 10 min ago, grace is 15
    ]);
    const resolver = new RosterResolver(oracle, makeAttendanceConfig(), makeLogger());

    const candidates = await resolver.findNpnlSweepCandidates(NOW, 15);

    expect(candidates).toHaveLength(0);
  });

  it('skips a roster row with no resolvable shift-start time rather than guessing', async () => {
    const oracle = makeOracle([
      { employeeCode: 'EMP003', plannedIn: null },
    ]);
    const resolver = new RosterResolver(oracle, makeAttendanceConfig(), makeLogger());

    const candidates = await resolver.findNpnlSweepCandidates(NOW, 15);

    expect(candidates).toHaveLength(0);
  });

  it('skips a row with a blank/unresolvable employeeCode', async () => {
    const oracle = makeOracle([
      { employeeCode: null, plannedIn: '08:00' },
    ]);
    const resolver = new RosterResolver(oracle, makeAttendanceConfig(), makeLogger());

    const candidates = await resolver.findNpnlSweepCandidates(NOW, 15);

    expect(candidates).toHaveLength(0);
  });

  it('passes the configured limit through as an Oracle ROWNUM bind', async () => {
    const oracle = makeOracle([]);
    const resolver = new RosterResolver(oracle, makeAttendanceConfig(), makeLogger());

    await resolver.findNpnlSweepCandidates(NOW, 15, 1234);

    expect(oracle.query).toHaveBeenCalledWith(
      expect.stringContaining('ROWNUM <= :limit'),
      expect.objectContaining({ limit: 1234 }),
      expect.objectContaining({ maxRows: 1234 }),
    );
  });
});
