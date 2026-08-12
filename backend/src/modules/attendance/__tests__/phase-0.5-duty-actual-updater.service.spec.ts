/**
 * Phase 0.5 — ROWNUM ordering bug regression test
 *
 * Verifies that resolveActualShiftId() and resolveShiftIdByCode() use the
 * correct Oracle subquery pattern:
 *
 *   SELECT "id" FROM (
 *     SELECT ... ORDER BY branch_col NULLS LAST
 *   ) WHERE ROWNUM = 1
 *
 * The old (broken) pattern placed ROWNUM = 1 inside the same SELECT as
 * ORDER BY, causing Oracle to apply ROWNUM before sorting, making ORDER BY
 * effectively a no-op and returning a non-deterministic row.
 *
 * These tests capture the SQL sent to OraclePoolService and assert the
 * correct subquery structure is present.
 */

import { DutyActualUpdater } from '../services/duty-actual-updater.service';
import type { OraclePoolService } from '../../his/oracle-pool.service';
import type { AttendanceConfigService } from '../services/attendance-config.service';
import type { AttendanceStructuredLogger } from '../services/attendance-structured-logger.service';
import type { RosterContext, AttendanceDecision } from '../attendance.types';

// ── helpers ──────────────────────────────────────────────────────────────────

function makeOracle() {
  return {
    query: jest.fn().mockResolvedValue([]),
    queryOne: jest.fn().mockResolvedValue(null),
    execute: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<OraclePoolService>;
}

function makeAttendanceConfig(columnMap: Record<string, string> = {}) {
  const defaults: Record<string, string> = {
    'attendance.actual.table': 'DUTYACTUALVALUES',
    'attendance.actual.id': 'DAV_ID',
    'attendance.actual.sequence': 'DAV_SEQ.NEXTVAL',
    'attendance.actual.employeeId': 'EMPLOYEE_ID',
    'attendance.actual.dutyDate': 'DUTY_DATE',
    'attendance.actual.dayOfMonth': 'DAY_OF_MONTH',
    'attendance.actual.primaryShift': 'PRIMARY_SHIFT_ID',
    'attendance.actual.secondShift': 'SECOND_SHIFT_ID',
    'attendance.actual.status': 'ATTENDANCE_STATUS',
    'attendance.actual.inPunch': 'IN_PUNCH',
    'attendance.actual.outPunch': 'OUT_PUNCH',
    'attendance.actual.inTime': 'IN_TIME',
    'attendance.actual.outTime': 'OUT_TIME',
    'attendance.actual.duration': 'DURATION_HRS',
    'attendance.actual.durationMinutes': 'DURATION_MIN',
    'attendance.actual.remarks': 'REMARKS',
    'attendance.actual.intraBranchId': 'BRANCH_ID',
    'attendance.actual.correspondingDutyDay': 'CORRESPONDING_DAY',
    'attendance.shift.table': 'SHIFT_TYPE',
    'attendance.shift.id': 'SHIFT_ID',
    'attendance.shift.code': 'SHIFT_CODE',
    'attendance.shift.missPunch': 'IS_MISS_PUNCH',
    'attendance.shift.noPunchNoLeave': 'IS_NPNL',
    'attendance.roster.intraBranchId': 'BRANCH_ID',
    ...columnMap,
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

function buildService(oracle?: jest.Mocked<OraclePoolService>) {
  const o = oracle ?? makeOracle();
  const cfg = makeAttendanceConfig();
  const logger = makeLogger();
  const service = new DutyActualUpdater(o, cfg, logger);
  return { service, oracle: o, cfg, logger };
}

function makeRoster(overrides: Partial<RosterContext> = {}): RosterContext {
  return {
    employeeCode: 'EMP001',
    employeeId: 1001,
    dutyDate: new Date('2026-07-01T00:00:00.000Z'),
    rosterId: 'R1',
    shiftCode: 'MISS',
    primaryShiftId: 99,
    secondShiftId: null,
    plannedIn: new Date('2026-07-01T08:00:00.000Z'),
    plannedOut: new Date('2026-07-01T17:00:00.000Z'),
    secondPlannedIn: null,
    secondPlannedOut: null,
    plannedStatus: 'DUTY',
    actualStatus: null,
    approvedLeaveType: null,
    isHoliday: false,
    isWeekOff: false,
    isNight: false,
    plannextin: null,
    intraBranchId: null,
    ...overrides,
  } as RosterContext;
}

function makeDecision(overrides: Partial<AttendanceDecision> = {}): AttendanceDecision {
  return {
    status: 'MISS_PUNCH',
    reason: 'Missing IN punch',
    reasonCode: 'MISSING_IN',
    confidence: 'HIGH',
    inPunch: null,
    outPunch: null,
    lateMinutes: null,
    earlyGoingMinutes: null,
    workMinutes: null,
    actualShiftCode: null,
    ...overrides,
  } as unknown as AttendanceDecision;
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('DutyActualUpdater — Phase 0.5 (ROWNUM fix)', () => {

  // Helper: extract the SQL string passed to queryOne
  function capturedSql(oracle: jest.Mocked<OraclePoolService>): string {
    const calls = (oracle.queryOne as jest.Mock).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    return (calls[calls.length - 1][0] as string).replace(/\s+/g, ' ').trim();
  }

  describe('resolveActualShiftId() for MISS_PUNCH / NPNL — subquery pattern', () => {
    it('places ORDER BY inside the subquery, ROWNUM outside (MISS_PUNCH)', async () => {
      const oracle = makeOracle();
      (oracle.queryOne as jest.Mock).mockResolvedValue(null);
      (oracle.execute as jest.Mock).mockResolvedValue(undefined);
      const { service } = buildService(oracle);

      const roster = makeRoster({ intraBranchId: null });
      const decision = makeDecision({ status: 'MISS_PUNCH' });

      await service.upsert(roster, decision);

      const sql = capturedSql(oracle);

      // Must NOT have ROWNUM inside the WHERE of the inner SELECT
      expect(sql).not.toMatch(/WHERE.*ROWNUM\s*=\s*1.*ORDER\s+BY/i);

      // Must have ORDER BY inside a subquery before ROWNUM
      expect(sql).toMatch(/FROM\s*\(.*ORDER\s+BY.*\)\s*WHERE\s+ROWNUM\s*=\s*1/is);
    });

    it('places ORDER BY inside the subquery, ROWNUM outside (NPNL)', async () => {
      const oracle = makeOracle();
      (oracle.queryOne as jest.Mock).mockResolvedValue(null);
      (oracle.execute as jest.Mock).mockResolvedValue(undefined);
      const { service } = buildService(oracle);

      const roster = makeRoster({ intraBranchId: null });
      const decision = makeDecision({ status: 'NPNL' });

      await service.upsert(roster, decision);

      const sql = capturedSql(oracle);
      expect(sql).toMatch(/FROM\s*\(.*ORDER\s+BY.*\)\s*WHERE\s+ROWNUM\s*=\s*1/is);
    });

    it('returns primaryShiftId as fallback when query finds no matching shift', async () => {
      const oracle = makeOracle();
      (oracle.queryOne as jest.Mock).mockResolvedValue(null);
      (oracle.execute as jest.Mock).mockResolvedValue(undefined);
      const { service } = buildService(oracle);

      const roster = makeRoster({ primaryShiftId: 42 });
      const decision = makeDecision({ status: 'MISS_PUNCH' });

      const result = await service.upsert(roster, decision);
      // The returned shiftActual should be the primaryShiftId fallback
      expect(result['shiftActual']).toBe(42);
    });

    it('returns the shift ID from DB when found', async () => {
      const oracle = makeOracle();
      (oracle.queryOne as jest.Mock).mockResolvedValue({ id: 77 });
      (oracle.execute as jest.Mock).mockResolvedValue(undefined);
      const { service } = buildService(oracle);

      const roster = makeRoster({ primaryShiftId: 42 });
      const decision = makeDecision({ status: 'MISS_PUNCH' });

      const result = await service.upsert(roster, decision);
      expect(result['shiftActual']).toBe(77);
    });

    it('always includes :branchId in the SQL and binds — regardless of whether roster.intraBranchId is set (NJS-098 regression)', async () => {
      // NJS-098 ("N bind placeholders were used ... but M bind values were
      // provided") fired in production whenever roster.intraBranchId was
      // null: the old code stripped ":branchId" out of the SQL text but
      // still passed a `branchId` key in the bind object, so the bind count
      // (1) didn't match the placeholder count (0). oracledb validates this
      // at the driver level, which a plain jest.fn() mock can't reproduce —
      // so this test instead asserts the invariant that prevents it: the
      // SQL always contains :branchId, and the bind object always has a
      // branchId key, whether or not roster.intraBranchId is set.
      const oracle = makeOracle();
      (oracle.queryOne as jest.Mock).mockResolvedValue(null);
      (oracle.execute as jest.Mock).mockResolvedValue(undefined);
      const { service } = buildService(oracle);

      const roster = makeRoster({ intraBranchId: null });
      const decision = makeDecision({ status: 'MISS_PUNCH' });

      await service.upsert(roster, decision);

      const sql = capturedSql(oracle);
      expect(sql).toMatch(/:branchId/);

      const lastCall = (oracle.queryOne as jest.Mock).mock.calls.slice(-1)[0];
      const binds = lastCall[1] as Record<string, unknown>;
      expect(binds).toHaveProperty('branchId');
      expect(binds.branchId).toBeNull();
    });
  });

  describe('resolveShiftIdByCode() — subquery pattern', () => {
    it('places ORDER BY inside subquery for shift-by-code lookup (PRESENT with actualShiftCode)', async () => {
      const oracle = makeOracle();
      (oracle.queryOne as jest.Mock).mockResolvedValue(null);
      (oracle.execute as jest.Mock).mockResolvedValue(undefined);
      const { service } = buildService(oracle);

      const roster = makeRoster({ intraBranchId: null });
      // PRESENT with actualShiftCode triggers resolveShiftIdByCode first
      const decision = makeDecision({ status: 'PRESENT', actualShiftCode: 'SFD0' });

      await service.upsert(roster, decision);

      const sql = capturedSql(oracle);
      // Subquery must be used — ORDER BY before outer ROWNUM
      expect(sql).toMatch(/FROM\s*\(.*ORDER\s+BY.*\)\s*WHERE\s+ROWNUM\s*=\s*1/is);
    });

    it('always includes :branchId in the SQL and binds — regardless of whether roster.intraBranchId is set (NJS-098 regression)', async () => {
      const oracle = makeOracle();
      (oracle.queryOne as jest.Mock).mockResolvedValue(null);
      (oracle.execute as jest.Mock).mockResolvedValue(undefined);
      const { service } = buildService(oracle);

      const roster = makeRoster({ intraBranchId: null });
      const decision = makeDecision({ status: 'PRESENT', actualShiftCode: 'SFD0' });

      await service.upsert(roster, decision);

      const sql = capturedSql(oracle);
      expect(sql).toMatch(/:branchId/);

      const lastCall = (oracle.queryOne as jest.Mock).mock.calls.slice(-1)[0];
      const binds = lastCall[1] as Record<string, unknown>;
      expect(binds).toHaveProperty('branchId');
      expect(binds.branchId).toBeNull();
    });
  });

  describe('upsert() — statuses that do NOT query shift table', () => {
    it('does not call queryOne when status is PRESENT with no actualShiftCode', async () => {
      const oracle = makeOracle();
      (oracle.execute as jest.Mock).mockResolvedValue(undefined);
      const { service } = buildService(oracle);

      const roster = makeRoster({ primaryShiftId: 5 });
      const decision = makeDecision({ status: 'PRESENT', actualShiftCode: null });

      await service.upsert(roster, decision);

      // No shift lookup — falls through to roster.primaryShiftId directly
      expect(oracle.queryOne).not.toHaveBeenCalled();
    });
  });
});
