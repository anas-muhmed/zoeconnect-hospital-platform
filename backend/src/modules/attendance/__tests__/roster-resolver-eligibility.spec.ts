/**
 * RosterResolver.resolve() — punch-eligibility gate.
 *
 * Confirmed by the user directly against production Oracle (2026-07):
 *   - EMPLOYEE.ISPUNCHREQUIRED must be 1
 *   - EMPLOYEE.EMP_STATUS must equal the configured "active" value (default '75')
 *   - PMS_EMPLOYEE.RELIEVINGDATE: employee still counts ON that date, excluded
 *     starting the day after
 *   - the employee must have a currently-ACTIVE EMPLOYEESCMAPFORDUTYROSTER row
 *     (surfaced as activeServiceCenterId)
 */

import { RosterResolver } from '../services/roster-resolver.service';
import type { OraclePoolService } from '../../his/oracle-pool.service';
import type { AttendanceConfigService } from '../services/attendance-config.service';
import type { AttendanceStructuredLogger } from '../services/attendance-structured-logger.service';

function makeOracle(row: Record<string, unknown> | null) {
  return {
    query: jest.fn().mockResolvedValue([]),
    queryOne: jest.fn().mockResolvedValue(row),
    execute: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<OraclePoolService>;
}

function makeAttendanceConfig() {
  const defaults: Record<string, string> = {
    'attendance.employee.table': 'EMPLOYEE',
    'attendance.employee.id': 'EMPLOYEE_ID',
    'attendance.employee.code': 'EMPNO',
    'attendance.roster.table': 'DUTYPLANVALUES',
    'attendance.roster.id': 'DUTYPLANVALUEID',
    'attendance.roster.employeeId': 'EMPID',
    'attendance.roster.dutyDate': 'PLANDATE',
    'attendance.roster.primaryShift': 'SHIFTPLAN',
    'attendance.roster.secondShift': 'SECONDSHIFT',
    'attendance.roster.intraBranchId': 'INTRABRANCHID',
    'attendance.shift.table': 'SHIFT_TYPE',
    'attendance.shift.id': 'ID',
    'attendance.shift.code': 'CODE',
    'attendance.shift.start': 'START_TIMING',
    'attendance.shift.end': 'END_TIMING',
    'attendance.shift.secondStart': 'SECONDSHIFT_STARTTIMING',
    'attendance.shift.secondEnd': 'SECONDSHIFT_ENDTTIMING',
    'attendance.shift.isNight': 'IS_NIGHT',
    'attendance.shift.isLeave': 'ISLEAVE',
    'attendance.shift.isHoliday': 'NATIONAL_HOLIDAY',
    'attendance.shift.isWeekOff': 'ISWEEKOFF',
    'attendance.shift.isWorkShift': 'ISWORKSHIFT',
    'attendance.shift.leaveMaster': 'LEAVEMASTER',
    'attendance.leave.table': 'LEAVEMASTER',
    'attendance.leave.id': 'ID',
    'attendance.leave.name': 'NAME',
    'attendance.employeeLeave.table': 'EMPLOYEELEAVELIST',
    'attendance.employeeLeave.dayPart': 'LEAVESLOT',
    'attendance.employeeLeave.leaveDetailId': 'LEAVEDETAILID',
    'attendance.appliedLeave.table': 'APPLIEDLEAVES',
    'attendance.appliedLeave.id': 'ID',
    'attendance.appliedLeave.employeeId': 'EMPID',
    'attendance.appliedLeave.fromDate': 'FROMDATE',
    'attendance.appliedLeave.toDate': 'TODATE',
    'attendance.appliedLeave.leaveMaster': 'LEAVEMASTER',
    'attendance.appliedLeave.status': 'STATUS',
    'attendance.employee.isPunchRequired': 'ISPUNCHREQUIRED',
    'attendance.employee.punchCount': 'PUNCH',
    'attendance.employee.status': 'EMP_STATUS',
    'attendance.employee.forHis': 'FOR_HIS',
    'attendance.pmsEmployee.table': 'PMS_EMPLOYEE',
    'attendance.pmsEmployee.employeeId': 'EMPLOYEEID',
    'attendance.pmsEmployee.relievingDate': 'RELIEVINGDATE',
    'attendance.serviceCenterMap.table': 'EMPLOYEESCMAPFORDUTYROSTER',
    'attendance.serviceCenterMap.employeeId': 'EMPLOYEE',
    'attendance.serviceCenterMap.serviceCenterId': 'SERVICECENTER',
    'attendance.serviceCenterMap.isActive': 'ISACTIVE',
    'attendance.serviceCenterMap.updatedAt': 'UPDATEDDATETIME',
    'attendance.serviceCenterMap.createdAt': 'CREATEDDATETIME',
    'attendance.roster.dutyPlansFk': 'DUTYPLANS',
    'attendance.dutyRosterEmployee.table': 'DUTYROSTEREMPLOYEE',
    'attendance.dutyRosterEmployee.id': 'EMPDUTYID',
    'attendance.dutyRosterEmployee.dutyRosterId': 'DUTYROSTERID',
    'attendance.dutyRosterMaster.table': 'DUTYROSTERMASTER',
    'attendance.dutyRosterMaster.id': 'DUTYROSTERID',
    'attendance.dutyRosterMaster.serviceCenterId': 'SERVICECENTER',
  };
  return {
    getConfig: jest.fn().mockResolvedValue({ 'attendance.employee.activeStatusValue': '75' }),
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

function baseRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    employeeId: 1001,
    employeeCode: 'EMP001',
    isPunchRequired: 1,
    punchesRequired: 2,
    empStatus: '75',
    forHis: 0,
    relievingDate: null,
    activeServiceCenterId: 501,
    rosterId: 'R1',
    dutyDate: '2026-07-04',
    primaryShiftId: 1,
    secondShiftId: null,
    intraBranchId: null,
    shiftCode: 'SFD0',
    plannedIn: '09:00',
    plannedOut: '17:00',
    secondPlannedIn: null,
    secondPlannedOut: null,
    isNight: 0,
    isLeave: 0,
    isHoliday: 0,
    isWeekOff: 0,
    isWorkShift: 1,
    leaveType: null,
    leaveDayPart: null,
    ...overrides,
  };
}

describe('RosterResolver.resolve() — eligibility gate', () => {
  const punchDate = new Date('2026-07-04T09:00:00.000Z');

  it('is eligible when punch-required, active status, no relieving date, and an active servicecenter mapping all hold', async () => {
    const oracle = makeOracle(baseRow());
    const resolver = new RosterResolver(oracle, makeAttendanceConfig(), makeLogger());

    const roster = await resolver.resolve('EMP001', punchDate);

    expect(roster.isEligibleForPunch).toBe(true);
    expect(roster.ineligibleReason).toBeNull();
    expect(roster.punchesRequired).toBe(2);
    expect(roster.activeServiceCenterId).toBe(501);
  });

  it('is ineligible when ISPUNCHREQUIRED is 0', async () => {
    const oracle = makeOracle(baseRow({ isPunchRequired: 0 }));
    const resolver = new RosterResolver(oracle, makeAttendanceConfig(), makeLogger());

    const roster = await resolver.resolve('EMP001', punchDate);

    expect(roster.isEligibleForPunch).toBe(false);
    expect(roster.ineligibleReason).toMatch(/ISPUNCHREQUIRED/);
  });

  it('is ineligible when ISPUNCHREQUIRED is null', async () => {
    const oracle = makeOracle(baseRow({ isPunchRequired: null }));
    const resolver = new RosterResolver(oracle, makeAttendanceConfig(), makeLogger());

    const roster = await resolver.resolve('EMP001', punchDate);

    expect(roster.isEligibleForPunch).toBe(false);
  });

  it('is ineligible when FOR_HIS = 1 (system/admin account, not a real employee)', async () => {
    const oracle = makeOracle(baseRow({ forHis: 1 }));
    const resolver = new RosterResolver(oracle, makeAttendanceConfig(), makeLogger());

    const roster = await resolver.resolve('EMP001', punchDate);

    expect(roster.isEligibleForPunch).toBe(false);
    expect(roster.ineligibleReason).toMatch(/FOR_HIS/);
  });

  it('is eligible when FOR_HIS is null (normal employee)', async () => {
    const oracle = makeOracle(baseRow({ forHis: null }));
    const resolver = new RosterResolver(oracle, makeAttendanceConfig(), makeLogger());

    const roster = await resolver.resolve('EMP001', punchDate);

    expect(roster.isEligibleForPunch).toBe(true);
  });

  it('is ineligible when EMP_STATUS does not match the active status value', async () => {
    const oracle = makeOracle(baseRow({ empStatus: '80' }));
    const resolver = new RosterResolver(oracle, makeAttendanceConfig(), makeLogger());

    const roster = await resolver.resolve('EMP001', punchDate);

    expect(roster.isEligibleForPunch).toBe(false);
    expect(roster.ineligibleReason).toMatch(/EMP_STATUS/);
  });

  it('is ineligible when there is no active EMPLOYEESCMAPFORDUTYROSTER mapping', async () => {
    const oracle = makeOracle(baseRow({ activeServiceCenterId: null }));
    const resolver = new RosterResolver(oracle, makeAttendanceConfig(), makeLogger());

    const roster = await resolver.resolve('EMP001', punchDate);

    expect(roster.isEligibleForPunch).toBe(false);
    expect(roster.ineligibleReason).toMatch(/EMPLOYEESCMAPFORDUTYROSTER/);
    expect(roster.activeServiceCenterId).toBeNull();
  });

  it('still counts the employee as eligible ON the relieving date itself', async () => {
    const oracle = makeOracle(baseRow({ relievingDate: '2026-07-04' }));
    const resolver = new RosterResolver(oracle, makeAttendanceConfig(), makeLogger());

    const roster = await resolver.resolve('EMP001', punchDate); // punchDate is also 2026-07-04

    expect(roster.isEligibleForPunch).toBe(true);
  });

  it('is ineligible the day after the relieving date', async () => {
    const oracle = makeOracle(baseRow({ relievingDate: '2026-07-03' }));
    const resolver = new RosterResolver(oracle, makeAttendanceConfig(), makeLogger());

    const roster = await resolver.resolve('EMP001', punchDate); // punchDate is 2026-07-04, one day after

    expect(roster.isEligibleForPunch).toBe(false);
    expect(roster.ineligibleReason).toMatch(/relieved/);
  });

  it('is still eligible before the relieving date', async () => {
    const oracle = makeOracle(baseRow({ relievingDate: '2026-07-10' }));
    const resolver = new RosterResolver(oracle, makeAttendanceConfig(), makeLogger());

    const roster = await resolver.resolve('EMP001', punchDate);

    expect(roster.isEligibleForPunch).toBe(true);
  });

  it('surfaces punchesRequired = 1 for a single-punch employee (EMPLOYEE.PUNCH = 1)', async () => {
    const oracle = makeOracle(baseRow({ punchesRequired: 1 }));
    const resolver = new RosterResolver(oracle, makeAttendanceConfig(), makeLogger());

    const roster = await resolver.resolve('EMP001', punchDate);

    expect(roster.punchesRequired).toBe(1);
  });

  it('defaults punchesRequired to 2 when EMPLOYEE.PUNCH is null/unset', async () => {
    const oracle = makeOracle(baseRow({ punchesRequired: null }));
    const resolver = new RosterResolver(oracle, makeAttendanceConfig(), makeLogger());

    const roster = await resolver.resolve('EMP001', punchDate);

    expect(roster.punchesRequired).toBe(2);
  });

  it('scopes the DUTYPLANVALUES join through DUTYROSTEREMPLOYEE/DUTYROSTERMASTER to the current active servicecenter', async () => {
    const oracle = makeOracle(baseRow());
    const resolver = new RosterResolver(oracle, makeAttendanceConfig(), makeLogger());

    await resolver.resolve('EMP001', punchDate);

    const sql = (oracle.queryOne as jest.Mock).mock.calls[0][0] as string;
    expect(sql).toContain('DUTYROSTEREMPLOYEE');
    expect(sql).toContain('DUTYROSTERMASTER');
    expect(sql).toContain('EMPLOYEESCMAPFORDUTYROSTER');
    expect(sql).toContain('EXISTS');
  });

  it('marks the employee ineligible when EMPLOYEE itself is not found', async () => {
    const oracle = makeOracle(null);
    const resolver = new RosterResolver(oracle, makeAttendanceConfig(), makeLogger());

    const roster = await resolver.resolve('UNKNOWN', punchDate);

    expect(roster.employeeId).toBeNull();
    expect(roster.isEligibleForPunch).toBe(false);
  });
});
