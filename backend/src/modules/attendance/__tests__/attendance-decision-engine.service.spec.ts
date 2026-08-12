import { AttendanceDecisionEngine } from '../services/attendance-decision-engine.service';
import { DEFAULT_ATTENDANCE_RULES } from '../services/shift-rule-engine.service';
import type { RosterContext } from '../attendance.types';
import { AttendanceEvent } from '../entities/attendance-event.entity';

describe('AttendanceDecisionEngine', () => {
  const engine = new AttendanceDecisionEngine();
  const dutyDate = new Date('2026-06-27T00:00:00.000Z');
  const testRules = {
    ...DEFAULT_ATTENDANCE_RULES,
    maxFuturePunchMinutes: 60 * 24 * 365,
    maxBackdatedPunchDays: 365,
  };

  function roster(overrides: Partial<RosterContext> = {}): RosterContext {
    return {
      employeeCode: '1001',
      employeeId: 1001,
      dutyDate,
      rosterId: 'R1',
      shiftCode: 'SFD0',
      primaryShiftId: 1,
      secondShiftId: null,
      plannedIn: new Date('2026-06-27T08:00:00.000Z'),
      plannedOut: new Date('2026-06-27T17:00:00.000Z'),
      secondPlannedIn: null,
      secondPlannedOut: null,
      plannedStatus: 'DUTY',
      actualStatus: null,
      approvedLeaveType: null,
      approvedLeaveDayPart: null,
      isHoliday: false,
      isWeekOff: false,
      isResigned: false,
      isNight: false,
      isWorkShift: true,
      intraBranchId: null,
      raw: {},
      isEligibleForPunch: true,
      ineligibleReason: null,
      punchesRequired: 2,
      activeServiceCenterId: 501,
      ...overrides,
    };
  }

  function punch(at: string, direction: 'IN' | 'OUT' | 'UNKNOWN' = 'UNKNOWN'): AttendanceEvent {
    return {
      logDateTime: new Date(at),
      direction,
    } as AttendanceEvent;
  }

  it('marks a normal in/out as present', () => {
    const decision = engine.evaluate(roster(), [
      punch('2026-06-27T08:01:00.000Z', 'IN'),
      punch('2026-06-27T17:05:00.000Z', 'OUT'),
    ], testRules);

    expect(decision.status).toBe('PRESENT');
    expect(decision.reasonCode).toBe('NORMAL_IN_OUT');
  });

  it('marks a single punch for manual review (two-punch employee)', () => {
    const decision = engine.evaluate(roster(), [
      punch('2026-06-27T08:01:00.000Z', 'IN'),
    ], testRules);

    expect(decision.status).toBe('MISSING_OUT');
    expect(decision.requiresManualReview).toBe(true);
  });

  describe('eligibility gate (EMPLOYEE.ISPUNCHREQUIRED / EMP_STATUS / RELIEVINGDATE / servicecenter mapping)', () => {
    it('returns INELIGIBLE without evaluating roster/punches when isEligibleForPunch is false', () => {
      const decision = engine.evaluate(
        roster({ isEligibleForPunch: false, ineligibleReason: 'Employee has no currently-ACTIVE EMPLOYEESCMAPFORDUTYROSTER mapping.' }),
        [punch('2026-06-27T08:01:00.000Z', 'IN'), punch('2026-06-27T17:05:00.000Z', 'OUT')],
        testRules,
      );

      expect(decision.status).toBe('INELIGIBLE');
      expect(decision.reason).toBe('Employee has no currently-ACTIVE EMPLOYEESCMAPFORDUTYROSTER mapping.');
      expect(decision.requiresManualReview).toBe(false);
    });

    it('takes the ineligibility gate before the NO_ROSTER check', () => {
      const decision = engine.evaluate(
        roster({ isEligibleForPunch: false, ineligibleReason: 'x', rosterId: null, shiftCode: null, plannedStatus: null }),
        [],
        testRules,
      );

      expect(decision.status).toBe('INELIGIBLE');
    });
  });

  describe('per-employee single-punch flow (EMPLOYEE.PUNCH = 1)', () => {
    it('marks a lone IN punch as PRESENT when punchesRequired is 1', () => {
      const decision = engine.evaluate(roster({ punchesRequired: 1 }), [
        punch('2026-06-27T08:01:00.000Z', 'IN'),
      ], testRules);

      expect(decision.status).toBe('PRESENT');
      expect(decision.reasonCode).toBe('SINGLE_IN_ALLOWED');
    });

    it('marks a lone OUT punch as PRESENT when punchesRequired is 1', () => {
      const decision = engine.evaluate(roster({ punchesRequired: 1 }), [
        punch('2026-06-27T17:05:00.000Z', 'OUT'),
      ], testRules);

      expect(decision.status).toBe('PRESENT');
      expect(decision.reasonCode).toBe('SINGLE_OUT_ALLOWED');
    });

    it('still requires both punches when punchesRequired is 2 (default/two-punch employee)', () => {
      const decision = engine.evaluate(roster({ punchesRequired: 2 }), [
        punch('2026-06-27T08:01:00.000Z', 'IN'),
      ], testRules);

      expect(decision.status).toBe('MISSING_OUT');
    });

    it('falls back to the global allowSinglePunchAsPresent rule for a two-punch employee if the rule is set', () => {
      const decision = engine.evaluate(roster({ punchesRequired: 2 }), [
        punch('2026-06-27T08:01:00.000Z', 'IN'),
      ], { ...testRules, allowSinglePunchAsPresent: true });

      expect(decision.status).toBe('PRESENT');
    });
  });

  it('uses the first in punch and latest out punch', () => {
    const decision = engine.evaluate(roster(), [
      punch('2026-06-27T07:55:00.000Z', 'IN'),
      punch('2026-06-27T08:01:00.000Z', 'IN'),
      punch('2026-06-27T17:40:00.000Z', 'OUT'),
      punch('2026-06-27T18:15:00.000Z', 'OUT'),
    ], testRules);

    expect(decision.status).toBe('PRESENT');
    expect(decision.inPunch?.toISOString()).toBe('2026-06-27T07:55:00.000Z');
    expect(decision.outPunch?.toISOString()).toBe('2026-06-27T18:15:00.000Z');
  });

  it('ignores exact duplicate punches with the same timestamp and direction', () => {
    const decision = engine.evaluate(roster(), [
      punch('2026-06-27T08:01:00.000Z', 'IN'),
      punch('2026-06-27T08:01:00.000Z', 'IN'),
      punch('2026-06-27T17:05:00.000Z', 'OUT'),
    ], testRules);

    expect(decision.status).toBe('PRESENT');
    expect(decision.punchCount).toBe(2);
  });

  it('does not drop later out punches inside the duplicate window', () => {
    const decision = engine.evaluate(roster(), [
      punch('2026-06-27T08:01:00.000Z', 'IN'),
      punch('2026-06-27T17:05:00.000Z', 'OUT'),
      punch('2026-06-27T17:05:30.000Z', 'OUT'),
    ], testRules);

    expect(decision.outPunch?.toISOString()).toBe('2026-06-27T17:05:30.000Z');
    expect(decision.punchCount).toBe(3);
  });

  it('marks out without in as missing in and keeps the out punch', () => {
    const decision = engine.evaluate(roster(), [
      punch('2026-06-27T17:05:00.000Z', 'OUT'),
    ], testRules);

    expect(decision.status).toBe('MISSING_IN');
    expect(decision.inPunch).toBeNull();
    expect(decision.outPunch?.toISOString()).toBe('2026-06-27T17:05:00.000Z');
  });

  it('supports shifts crossing midnight', () => {
    const decision = engine.evaluate(roster({
      plannedIn: new Date('2026-06-27T20:00:00.000Z'),
      plannedOut: new Date('2026-06-27T05:00:00.000Z'),
    }), [
      punch('2026-06-27T19:55:00.000Z', 'IN'),
      punch('2026-06-28T05:10:00.000Z', 'OUT'),
    ], testRules);

    expect(decision.status).toBe('PRESENT');
  });
});
