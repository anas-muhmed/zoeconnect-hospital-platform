import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';
import { AttendanceRule } from '../entities/attendance-rule.entity';
import type { AttendanceRuleSet, RosterContext } from '../attendance.types';

export const DEFAULT_ATTENDANCE_RULES: AttendanceRuleSet = {
  duplicateWindowSeconds: 60,
  earlyGraceMinutes: 120,
  lateGraceMinutes: 10,
  earlyGoingGraceMinutes: 10,
  minimumWorkMinutesForPresent: 360,
  minimumWorkMinutesForHalfDay: 240,
  maxFuturePunchMinutes: 10,
  maxBackdatedPunchDays: 7,
  nightShiftOutGraceHours: 8,
  defaultShiftHours: 8,
  allowSinglePunchAsPresent: false,
  lateEarlyPenaltyShiftCode: '15MNPL',
  leavePunchBehaviour: 'TREAT_AS_LEAVE',
  weekOffPunchBehaviour: 'KEEP_NON_WORKING_DAY',
  holidayPunchBehaviour: 'KEEP_NON_WORKING_DAY',
};

@Injectable()
export class ShiftRuleEngine {
  constructor(
    @InjectRepository(AttendanceRule)
    private readonly ruleRepo: Repository<AttendanceRule>,
  ) {}

  async getRulesFor(roster: RosterContext): Promise<AttendanceRuleSet> {
    const dutyDate = roster.dutyDate.toISOString().slice(0, 10);
    const rule = await this.ruleRepo.findOne({
      where: [
        { code: roster.shiftCode ?? 'DEFAULT', isActive: true, effectiveFrom: LessThanOrEqual(dutyDate) },
        { code: 'DEFAULT', isActive: true, effectiveFrom: LessThanOrEqual(dutyDate) },
      ],
      order: { code: 'ASC', effectiveFrom: 'DESC' },
    });

    if (!rule) return DEFAULT_ATTENDANCE_RULES;
    if (rule.effectiveTo && rule.effectiveTo < dutyDate) return DEFAULT_ATTENDANCE_RULES;
    return { ...DEFAULT_ATTENDANCE_RULES, ...rule.rules };
  }

  getEvaluationWindow(roster: RosterContext, rules: AttendanceRuleSet): { from: Date; to: Date } {
    const base = new Date(roster.dutyDate);
    const plannedIn = roster.plannedIn ?? this.withTime(base, 8, 0);
    let plannedOut = roster.plannedOut ?? new Date(plannedIn.getTime() + rules.defaultShiftHours * 60 * 60 * 1000);

    if (plannedOut <= plannedIn) {
      plannedOut = new Date(plannedOut.getTime() + 24 * 60 * 60 * 1000);
    }

    return {
      from: new Date(plannedIn.getTime() - rules.earlyGraceMinutes * 60 * 1000),
      to: new Date(plannedOut.getTime() + rules.nightShiftOutGraceHours * 60 * 60 * 1000),
    };
  }

  private withTime(date: Date, hours: number, minutes: number): Date {
    const copy = new Date(date);
    copy.setHours(hours, minutes, 0, 0);
    return copy;
  }
}
