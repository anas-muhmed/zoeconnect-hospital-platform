import { Injectable } from '@nestjs/common';
import type { AttendanceDecision, AttendanceRuleSet, RosterContext } from '../attendance.types';
import { AttendanceEvent } from '../entities/attendance-event.entity';

@Injectable()
export class AttendanceDecisionEngine {
  evaluate(roster: RosterContext, punches: AttendanceEvent[], rules: AttendanceRuleSet): AttendanceDecision {
    const usablePunches = this.removeDuplicates(punches, rules.duplicateWindowSeconds)
      .filter((punch) => this.isWithinSafetyBounds(punch.logDateTime, roster.dutyDate, rules));
    const punchSet = this.getDirectionalPunches(usablePunches);

    if (!roster.isEligibleForPunch) {
      return this.decision('INELIGIBLE', null, null, 0, 0, 0, 'PUNCH_NOT_APPLICABLE', roster.ineligibleReason ?? 'Employee is not eligible for punch tracking.', rules, usablePunches.length, false);
    }
    if (!roster.rosterId && !roster.shiftCode && !roster.plannedStatus) {
      return this.decision('NO_ROSTER', null, null, 0, 0, 0, 'NO_ROSTER', 'Employee has no roster for this duty date.', rules, usablePunches.length, true);
    }
    if (roster.isResigned) {
      return this.decision('INVALID', null, null, 0, 0, 0, 'RESIGNED_EMPLOYEE', 'Punch received for resigned employee.', rules, usablePunches.length, true);
    }
    if (roster.approvedLeaveType) {
      return this.evaluateLeave(roster, punchSet, rules, usablePunches.length);
    }
    if (roster.isHoliday) {
      return this.evaluateNonWorkingDay('HOLIDAY', rules.holidayPunchBehaviour, punchSet, rules, usablePunches.length);
    }
    if (roster.isWeekOff) {
      return this.evaluateNonWorkingDay('WEEK_OFF', rules.weekOffPunchBehaviour, punchSet, rules, usablePunches.length);
    }
    if (usablePunches.length === 0) {
      return this.decision('NPNL', null, null, 0, 0, 0, 'NO_PUNCH', 'No punch found for rostered duty.', rules, 0, false);
    }

    const inPunch = punchSet.inPunch;
    const outPunch = punchSet.outPunch;
    // roster.punchesRequired === 1 comes from EMPLOYEE.PUNCH, set per-employee
    // by HR on the employee master — distinct from the shift/rule-level
    // allowSinglePunchAsPresent (e.g. allowSinglePunchForNightShift), which
    // remains an OR'd fallback so an existing shift-level override still works.
    const singlePunchAccepted = roster.punchesRequired === 1 || rules.allowSinglePunchAsPresent;
    if (!inPunch && outPunch) {
      if (singlePunchAccepted) {
        return this.decision('PRESENT', null, outPunch, 0, this.earlyGoingMinutes(roster, outPunch, rules), 0, 'SINGLE_OUT_ALLOWED', 'Single out punch accepted (employee configured for single-punch attendance).', rules, usablePunches.length, true);
      }
      return this.decision('MISSING_IN', null, outPunch, 0, this.earlyGoingMinutes(roster, outPunch, rules), 0, 'OUT_WITHOUT_IN', 'Out punch received before any valid in punch.', rules, usablePunches.length, true);
    }
    if (inPunch && !outPunch) {
      if (singlePunchAccepted) {
        return this.decision('PRESENT', inPunch, null, this.lateMinutes(roster, inPunch, rules), 0, 0, 'SINGLE_IN_ALLOWED', 'Single in punch accepted (employee configured for single-punch attendance).', rules, usablePunches.length, true);
      }
      return this.decision('MISSING_OUT', inPunch, null, this.lateMinutes(roster, inPunch, rules), 0, 0, 'IN_WITHOUT_OUT', 'In punch found without a valid out punch.', rules, usablePunches.length, true);
    }
    if (!inPunch && !outPunch) {
      return this.decision('MISS_PUNCH', first(usablePunches), last(usablePunches), 0, 0, this.workMinutesFromDates(first(usablePunches), last(usablePunches)), 'UNKNOWN_PUNCH_DIRECTION', 'Punch direction could not identify valid in/out.', rules, usablePunches.length, true);
    }

    const workMinutes = this.workMinutesFromDates(inPunch, outPunch);
    const lateMinutes = inPunch ? this.lateMinutes(roster, inPunch, rules) : 0;
    const earlyGoingMinutes = outPunch ? this.earlyGoingMinutes(roster, outPunch, rules) : 0;

    if (workMinutes < rules.minimumWorkMinutesForHalfDay) {
      return this.decision('MISS_PUNCH', inPunch, outPunch, lateMinutes, earlyGoingMinutes, workMinutes, 'INSUFFICIENT_WORK_MINUTES', 'Work duration is below half-day threshold.', rules, usablePunches.length, true);
    }
    if (workMinutes < rules.minimumWorkMinutesForPresent) {
      return this.decision('HALF_DAY', inPunch, outPunch, lateMinutes, earlyGoingMinutes, workMinutes, 'HALF_DAY_DURATION', 'Work duration meets half-day threshold only.', rules, usablePunches.length, false);
    }
    if (lateMinutes > 0 || earlyGoingMinutes > 0) {
      const status = lateMinutes > 0 ? 'LATE_COMING' : 'EARLY_GOING';
      const reasonCode = lateMinutes > 0 ? 'LATE_IN' : 'EARLY_OUT';
      const reason = lateMinutes > 0 ? 'In punch exceeds configured late threshold.' : 'Out punch is earlier than configured early-going threshold.';
      return this.decision(status, inPunch, outPunch, lateMinutes, earlyGoingMinutes, workMinutes, reasonCode, reason, rules, usablePunches.length, false, rules.lateEarlyPenaltyShiftCode);
    }
    return this.decision('PRESENT', inPunch, outPunch, lateMinutes, earlyGoingMinutes, workMinutes, 'NORMAL_IN_OUT', 'Normal in/out attendance.', rules, usablePunches.length, false);
  }

  private removeDuplicates(punches: AttendanceEvent[], _duplicateWindowSeconds: number): AttendanceEvent[] {
    const sorted = [...punches].sort((a, b) => a.logDateTime.getTime() - b.logDateTime.getTime());
    const seen = new Set<string>();
    const result: AttendanceEvent[] = [];
    for (const punch of sorted) {
      const exactKey = `${punch.logDateTime.getTime()}:${punch.direction}`;
      if (seen.has(exactKey)) {
        continue;
      }
      seen.add(exactKey);
      result.push(punch);
    }
    return result;
  }

  private getDirectionalPunches(punches: AttendanceEvent[]): { inPunch: Date | null; outPunch: Date | null } {
    const inPunch = punches.find((punch) => punch.direction === 'IN')?.logDateTime ?? null;
    const outPunch = [...punches].reverse().find((punch) => punch.direction === 'OUT')?.logDateTime ?? null;
    return { inPunch, outPunch };
  }

  private evaluateLeave(
    roster: RosterContext,
    punches: { inPunch: Date | null; outPunch: Date | null },
    rules: AttendanceRuleSet,
    punchCount: number,
  ): AttendanceDecision {
    const leaveReason = `Approved leave: ${roster.approvedLeaveType}.`;
    if (roster.approvedLeaveDayPart === 'MORNING_HALF') {
      return this.evaluateWorkedSession(
        { ...roster, plannedIn: roster.secondPlannedIn, plannedOut: roster.secondPlannedOut, primaryShiftId: roster.secondShiftId },
        punches,
        rules,
        punchCount,
        'MORNING_HALF_LEAVE',
        `${leaveReason} Attendance evaluated for second session.`,
      );
    }
    if (roster.approvedLeaveDayPart === 'AFTERNOON_HALF') {
      return this.evaluateWorkedSession(roster, punches, rules, punchCount, 'AFTERNOON_HALF_LEAVE', `${leaveReason} Attendance evaluated for first session.`);
    }
    if (!punches.inPunch && !punches.outPunch || rules.leavePunchBehaviour === 'TREAT_AS_LEAVE') {
      return this.decision('LEAVE', null, null, 0, 0, 0, 'APPROVED_LEAVE', leaveReason, rules, punchCount, false);
    }
    if (rules.leavePunchBehaviour === 'TREAT_AS_WORKED_SHIFT') {
      return this.evaluateWorkedSession(roster, punches, rules, punchCount, 'LEAVE_PUNCH_WORKED', 'Approved leave exists, but punch policy treats the day as worked.');
    }
    return this.decision('LEAVE', punches.inPunch, punches.outPunch, 0, 0, this.workMinutesFromDates(punches.inPunch, punches.outPunch), 'LEAVE_PUNCH_REVIEW', 'Punch received during approved leave; configured for manual/custom handling.', rules, punchCount, true);
  }

  private evaluateNonWorkingDay(
    status: 'HOLIDAY' | 'WEEK_OFF',
    behaviour: AttendanceRuleSet['holidayPunchBehaviour'],
    punches: { inPunch: Date | null; outPunch: Date | null },
    rules: AttendanceRuleSet,
    punchCount: number,
  ): AttendanceDecision {
    const label = status === 'HOLIDAY' ? 'holiday' : 'week off';
    if ((!punches.inPunch && !punches.outPunch) || behaviour === 'KEEP_NON_WORKING_DAY') {
      return this.decision(status, punches.inPunch, punches.outPunch, 0, 0, this.workMinutesFromDates(punches.inPunch, punches.outPunch), status, `Attendance remains ${label}.`, rules, punchCount, false);
    }
    if (behaviour === 'TREAT_AS_WORKED_SHIFT' || behaviour === 'TREAT_AS_OVERTIME') {
      return this.decision('PRESENT', punches.inPunch, punches.outPunch, 0, 0, this.workMinutesFromDates(punches.inPunch, punches.outPunch), `${status}_PUNCH_WORKED`, `Punch on ${label} treated as ${behaviour === 'TREAT_AS_OVERTIME' ? 'overtime' : 'worked shift'}.`, rules, punchCount, behaviour === 'TREAT_AS_OVERTIME');
    }
    return this.decision(status, punches.inPunch, punches.outPunch, 0, 0, this.workMinutesFromDates(punches.inPunch, punches.outPunch), `${status}_PUNCH_REVIEW`, `Punch received on ${label}; configured for custom handling.`, rules, punchCount, true);
  }

  private evaluateWorkedSession(
    roster: RosterContext,
    punches: { inPunch: Date | null; outPunch: Date | null },
    rules: AttendanceRuleSet,
    punchCount: number,
    reasonCode: string,
    reason: string,
  ): AttendanceDecision {
    const singlePunchAccepted = roster.punchesRequired === 1 || rules.allowSinglePunchAsPresent;
    if (!punches.inPunch && punches.outPunch) {
      if (singlePunchAccepted) return this.decision('PRESENT', null, punches.outPunch, 0, this.earlyGoingMinutes(roster, punches.outPunch, rules), 0, reasonCode, `${reason} Single out punch accepted (employee configured for single-punch attendance).`, rules, punchCount, true);
      return this.decision('MISSING_IN', null, punches.outPunch, 0, this.earlyGoingMinutes(roster, punches.outPunch, rules), 0, reasonCode, reason, rules, punchCount, true);
    }
    if (punches.inPunch && !punches.outPunch) {
      if (singlePunchAccepted) return this.decision('PRESENT', punches.inPunch, null, this.lateMinutes(roster, punches.inPunch, rules), 0, 0, reasonCode, `${reason} Single in punch accepted (employee configured for single-punch attendance).`, rules, punchCount, true);
      return this.decision('MISSING_OUT', punches.inPunch, null, this.lateMinutes(roster, punches.inPunch, rules), 0, 0, reasonCode, reason, rules, punchCount, true);
    }
    if (!punches.inPunch && !punches.outPunch) return this.decision('NPNL', null, null, 0, 0, 0, reasonCode, reason, rules, punchCount, false);
    const inPunch = punches.inPunch as Date;
    const outPunch = punches.outPunch as Date;
    const workMinutes = this.workMinutesFromDates(inPunch, outPunch);
    const lateMinutes = this.lateMinutes(roster, inPunch, rules);
    const earlyGoingMinutes = this.earlyGoingMinutes(roster, outPunch, rules);
    if (lateMinutes > 0 || earlyGoingMinutes > 0) return this.decision(lateMinutes > 0 ? 'LATE_COMING' : 'EARLY_GOING', inPunch, outPunch, lateMinutes, earlyGoingMinutes, workMinutes, reasonCode, reason, rules, punchCount, false, rules.lateEarlyPenaltyShiftCode);
    return this.decision('PRESENT', inPunch, outPunch, lateMinutes, earlyGoingMinutes, workMinutes, reasonCode, reason, rules, punchCount, false);
  }

  private isWithinSafetyBounds(punchDate: Date, dutyDate: Date, rules: AttendanceRuleSet): boolean {
    const now = Date.now();
    if (punchDate.getTime() - now > rules.maxFuturePunchMinutes * 60 * 1000) return false;
    if (dutyDate.getTime() < now - rules.maxBackdatedPunchDays * 24 * 60 * 60 * 1000) return false;
    return true;
  }

  private lateMinutes(roster: RosterContext, inPunch: Date, rules: AttendanceRuleSet): number {
    if (!roster.plannedIn) return 0;
    return Math.max(0, Math.round((inPunch.getTime() - roster.plannedIn.getTime()) / 60000) - rules.lateGraceMinutes);
  }

  private earlyGoingMinutes(roster: RosterContext, outPunch: Date, rules: AttendanceRuleSet): number {
    if (!roster.plannedOut) return 0;
    let plannedOut = roster.plannedOut;
    if (roster.plannedIn && plannedOut <= roster.plannedIn) plannedOut = new Date(plannedOut.getTime() + 24 * 60 * 60 * 1000);
    return Math.max(0, Math.round((plannedOut.getTime() - outPunch.getTime()) / 60000) - rules.earlyGoingGraceMinutes);
  }

  private workMinutes(punches: AttendanceEvent[]): number {
    const inPunch = first(punches);
    const outPunch = last(punches);
    return this.workMinutesFromDates(inPunch, outPunch);
  }

  private workMinutesFromDates(inPunch: Date | null, outPunch: Date | null): number {
    if (!inPunch || !outPunch || inPunch === outPunch) return 0;
    return Math.max(0, Math.round((outPunch.getTime() - inPunch.getTime()) / 60000));
  }

  private decision(
    status: AttendanceDecision['status'],
    inPunch: Date | null,
    outPunch: Date | null,
    lateMinutes: number,
    earlyGoingMinutes: number,
    workMinutes: number,
    reasonCode: string,
    reason: string,
    rules: AttendanceRuleSet,
    punchCount: number,
    requiresManualReview: boolean,
    actualShiftCode: string | null = null,
  ): AttendanceDecision {
    return {
      status,
      inPunch,
      outPunch,
      lateMinutes,
      earlyGoingMinutes,
      workMinutes,
      reasonCode,
      reason,
      confidence: requiresManualReview ? 'MEDIUM' : 'HIGH',
      requiresManualReview,
      actualShiftCode,
      ruleSnapshot: { ...rules },
      punchCount,
    };
  }
}

function first(punches: AttendanceEvent[]): Date | null {
  return punches[0]?.logDateTime ?? null;
}

function last(punches: AttendanceEvent[]): Date | null {
  return punches[punches.length - 1]?.logDateTime ?? null;
}
