import { Injectable, Inject, NotFoundException, ForbiddenException } from '@nestjs/common';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';
import { AuditService } from '../../audit/audit.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { CvTimetable } from './entities/cv-timetable.entity';
import { CvTimetablePeriod } from './entities/cv-timetable-period.entity';
import { CvTimetablePeriodOverride } from './entities/cv-timetable-period-override.entity';
import { CvStudentScheduleOverride } from './entities/cv-student-schedule-override.entity';
import { CvEicIntegrationAdapter } from '../eic-integration/cv-eic-integration.adapter';

const DAY_NAMES = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

function dayOfWeekFromDate(date: Date): string {
  return DAY_NAMES[date.getDay()];
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Local calendar-day string ('YYYY-MM-DD') -- deliberately NOT toISOString(),
 * which is UTC and can land on the wrong day depending on server timezone. */
function toDateParam(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

@Injectable()
export class CvTimetableService {
  constructor(
    private readonly tenantContext: TenantContextStorage,
    private readonly auditService: AuditService,
    @InjectRepository(CvTimetable)
    private readonly timetableRepo: Repository<CvTimetable>,
    @InjectRepository(CvTimetablePeriod)
    private readonly periodRepo: Repository<CvTimetablePeriod>,
    @InjectRepository(CvStudentScheduleOverride)
    private readonly overrideRepo: Repository<CvStudentScheduleOverride>,
    @InjectRepository(CvTimetablePeriodOverride)
    private readonly periodOverrideRepo: Repository<CvTimetablePeriodOverride>,
    private readonly eicAdapter: CvEicIntegrationAdapter,
  ) {}

  async createTimetable(actorId: string, classId: string, academicYearId: string, termId?: string) {
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    if (!tenantId) throw new Error('Tenant context required');

    const timetable = this.timetableRepo.create({
      tenantId,
      classId,
      academicYearId,
      termId: termId || null,
      createdBy: actorId,
      updatedBy: actorId,
    });

    const saved = await this.timetableRepo.save(timetable);

    this.auditService.log({
      module: 'CHILDRENS_VILLAGE',
      action: 'CV_TIMETABLE_CREATED',
      tenantId,
      userId: actorId,
      entityId: saved.id,
      entityType: 'cv_timetables',
      metadata: { classId },
    });

    return saved;
  }

  async addPeriod(actorId: string, timetableId: string, periodData: Partial<CvTimetablePeriod>) {
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    if (!tenantId) throw new Error('Tenant context required');

    const period = this.periodRepo.create({
      ...periodData,
      timetableId,
      tenantId,
    });

    const saved = await this.periodRepo.save(period);
    
    this.auditService.log({
      module: 'CHILDRENS_VILLAGE',
      action: 'CV_TIMETABLE_PERIOD_ADDED',
      tenantId,
      userId: actorId,
      entityId: saved.id,
      entityType: 'cv_timetable_periods',
      metadata: { timetableId, subjectId: saved.subjectId },
    });

    return saved;
  }

  async getTimetableForClass(classId: string) {
    const timetables = await this.timetableRepo.find({
      where: { classId, isActive: true },
    });

    if (timetables.length === 0) return null;
    const timetable = timetables[0];

    const periods = await this.periodRepo.find({
      where: { timetableId: timetable.id },
      relations: ['subject'],
      order: { dayOfWeek: 'ASC', startTime: 'ASC' },
    });

    return { ...timetable, periods };
  }

  // Gets the teacher's schedule including any overrides pointing to them
  async getTeacherScheduleForDay(teacherId: string, dayOfWeek: string, date: Date, dateParam?: string) {
    // Regular periods for this teacher on this day
    const regularPeriods = await this.periodRepo.find({
      where: { teacherId, dayOfWeek },
      relations: ['timetable', 'timetable.cvClass', 'subject'],
      order: { startTime: 'ASC' }
    });

    // Single-date exceptions for the exact calendar date being viewed (see
    // `CvTimetablePeriodOverride`) -- overlaid on top of the recurring
    // template so "just move today's slot" doesn't touch every future
    // occurrence of this weekday. Subject reassignment is intentionally not
    // supported per-date (would require re-resolving the `subject` relation);
    // only room/start/end/teacher are overridable for a single day.
    const resolvedDateParam = dateParam ?? toDateParam(date);
    const periodIds = regularPeriods.map((p) => p.id);
    const overridesForDate = periodIds.length > 0
      ? await this.periodOverrideRepo.find({ where: { periodId: In(periodIds), date: resolvedDateParam } })
      : [];
    const overrideByPeriodId = new Map(overridesForDate.map((o) => [o.periodId, o]));

    // Phase 7 (Teacher Requests) -- an approved exchange/swap/substitute
    // writes `teacherId`/`originalTeacherId` onto the override row for that
    // date (see `CvTeacherRequestService.upsertTeacherOverride`). A regular
    // period reassigned AWAY from this teacher for this date is dropped
    // from their view entirely (not just flagged) -- it genuinely isn't
    // theirs to teach that day. `override.teacherId == null` (the common
    // case: no Phase 7 request ever touched this row, or it's a plain
    // room/time-only override from `updatePeriod`) means "no teacher
    // change", preserving every existing caller's behavior exactly.
    const periodsWithOverrides = regularPeriods
      .filter((p) => {
        const override = overrideByPeriodId.get(p.id);
        return !override?.teacherId || override.teacherId === teacherId;
      })
      .map((p) => {
        const override = overrideByPeriodId.get(p.id);
        if (!override) return { ...p, isOverriddenForDate: false };
        return {
          ...p,
          room: override.room ?? p.room,
          startTime: override.startTime ?? p.startTime,
          endTime: override.endTime ?? p.endTime,
          isOverriddenForDate: true,
        };
      });

    // The mirror case: periods NOT normally this teacher's, but reassigned
    // TO them for this exact date (they're covering an exchange/swap or
    // substituting). Looked up by override row, not by a period query, so
    // this only ever surfaces dates a Phase 7 request actually touched.
    const incomingOverrides = await this.periodOverrideRepo.find({
      where: { teacherId, date: resolvedDateParam },
    });
    const incomingPeriodIds = incomingOverrides
      .map((o) => o.periodId)
      .filter((id) => !periodIds.includes(id));
    const incomingPeriods = incomingPeriodIds.length > 0
      ? await this.periodRepo.find({
        where: { id: In(incomingPeriodIds) },
        relations: ['timetable', 'timetable.cvClass', 'subject'],
      })
      : [];
    const incomingOverrideByPeriodId = new Map(incomingOverrides.map((o) => [o.periodId, o]));
    const coveringPeriods = incomingPeriods.map((p) => {
      const override = incomingOverrideByPeriodId.get(p.id)!;
      return {
        ...p,
        room: override.room ?? p.room,
        startTime: override.startTime ?? p.startTime,
        endTime: override.endTime ?? p.endTime,
        isOverriddenForDate: true,
        isCoveringForTeacherId: override.originalTeacherId ?? null,
      };
    });

    const allPeriods = [...periodsWithOverrides, ...coveringPeriods].sort((a, b) => a.startTime.localeCompare(b.startTime));

    // Overrides that pull students TO this teacher (e.g. Speech Therapist)
    const pullOuts = await this.overrideRepo.find({
      where: [
        { overrideTeacherId: teacherId, dayOfWeek },
        { overrideTeacherId: teacherId, date } // specific date override
      ],
      relations: ['student'],
      order: { startTime: 'ASC' }
    });

    // EIC Therapy sessions (projected)
    let eicSessions: any[] = [];
    if (await this.eicAdapter.isAvailable()) {
      // Pass the teacherId which might map to an EIC therapist, projecting those sessions.
      eicSessions = await this.eicAdapter.getUpcomingSessions(teacherId, date, date);
    }

    return { regularPeriods: allPeriods, pullOuts, eicSessions };
  }

  /**
   * Date-aware wrapper around `getTeacherScheduleForDay`. Computes the real
   * weekday from `date` (fixing the controller's old hardcoded 'MONDAY')
   * and flags whether the requested date is in the past, so callers can
   * lock editing for days that have already happened.
   */
  async getTeacherScheduleForDate(teacherId: string, date: Date) {
    const dayOfWeek = dayOfWeekFromDate(date);
    const requestedStart = startOfDay(date);
    const dateParam = toDateParam(requestedStart);
    const schedule = await this.getTeacherScheduleForDay(teacherId, dayOfWeek, requestedStart, dateParam);
    const todayStart = startOfDay(new Date());

    return {
      date: dateParam,
      dayOfWeek,
      isToday: requestedStart.getTime() === todayStart.getTime(),
      isPast: requestedStart.getTime() < todayStart.getTime(),
      ...schedule,
    };
  }

  /**
   * Period counts per weekday for one teacher, across the whole recurring
   * timetable (not date-scoped -- periods repeat weekly). Powers a
   * week-at-a-glance strip without one query per day.
   */
  async getTeacherWeekOverview(teacherId: string): Promise<Record<string, number>> {
    const periods = await this.periodRepo.find({ where: { teacherId } });
    const counts = DAY_NAMES.reduce((acc, day) => {
      acc[day] = 0;
      return acc;
    }, {} as Record<string, number>);

    periods.forEach((p) => {
      counts[p.dayOfWeek] = (counts[p.dayOfWeek] ?? 0) + 1;
    });

    return counts;
  }

  /**
   * Inline edit of a period the teacher owns. `scope` decides where the
   * change lands:
   *  - 'THIS_DAY' (single-date exception): written to
   *    `cv_timetable_period_overrides` keyed on (periodId, date). The
   *    recurring template is untouched -- every other occurrence of this
   *    weekday is unaffected.
   *  - 'ALL_FUTURE' (default): edits the recurring weekly template itself,
   *    so every future occurrence of this weekday slot changes.
   * Either way, editing a day before today is rejected server-side, not
   * just hidden client-side, and only the period's own teacher may edit it.
   */
  async updatePeriod(
    actorId: string,
    periodId: string,
    updates: {
      date?: string;
      scope?: 'THIS_DAY' | 'ALL_FUTURE';
      room?: string | null;
      startTime?: string;
      endTime?: string;
    },
  ) {
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    if (!tenantId) throw new Error('Tenant context required');

    if (updates.date) {
      const viewedDay = startOfDay(new Date(updates.date));
      if (viewedDay.getTime() < startOfDay(new Date()).getTime()) {
        throw new ForbiddenException('Cannot edit a past day\'s schedule');
      }
    }

    const period = await this.periodRepo.findOne({ where: { id: periodId, tenantId } });
    if (!period) throw new NotFoundException('Timetable period not found');
    if (period.teacherId !== actorId) {
      throw new ForbiddenException('You can only edit your own schedule');
    }

    const scope = updates.scope ?? 'ALL_FUTURE';

    if (scope === 'THIS_DAY') {
      if (!updates.date) {
        throw new Error('A date is required when editing a single day only');
      }

      let override = await this.periodOverrideRepo.findOne({
        where: { periodId, date: updates.date, tenantId },
      });
      if (!override) {
        override = this.periodOverrideRepo.create({ tenantId, periodId, date: updates.date, createdBy: actorId });
      }
      if (updates.room !== undefined) override.room = updates.room;
      if (updates.startTime !== undefined) override.startTime = updates.startTime;
      if (updates.endTime !== undefined) override.endTime = updates.endTime;
      override.updatedBy = actorId;

      const savedOverride = await this.periodOverrideRepo.save(override);

      this.auditService.log({
        module: 'CHILDRENS_VILLAGE',
        action: 'CV_TIMETABLE_PERIOD_DAY_OVERRIDE_SAVED',
        tenantId,
        userId: actorId,
        entityId: period.id,
        entityType: 'cv_timetable_periods',
        metadata: { date: updates.date, overrideId: savedOverride.id, updates },
      });

      return { ...period, room: savedOverride.room ?? period.room, startTime: savedOverride.startTime ?? period.startTime, endTime: savedOverride.endTime ?? period.endTime, scope: 'THIS_DAY', date: updates.date };
    }

    // 'ALL_FUTURE' -- edit the recurring weekly template itself.
    if (updates.room !== undefined) period.room = updates.room;
    if (updates.startTime !== undefined) period.startTime = updates.startTime;
    if (updates.endTime !== undefined) period.endTime = updates.endTime;

    const saved = await this.periodRepo.save(period);

    this.auditService.log({
      module: 'CHILDRENS_VILLAGE',
      action: 'CV_TIMETABLE_PERIOD_UPDATED',
      tenantId,
      userId: actorId,
      entityId: saved.id,
      entityType: 'cv_timetable_periods',
      metadata: { updates, scope: 'ALL_FUTURE' },
    });

    return { ...saved, scope: 'ALL_FUTURE' };
  }

  /**
   * Timetable Management Phase 3 -- authoring-context period edit, distinct
   * from `updatePeriod()` above. `updatePeriod()` is the teacher
   * self-service path (ownership-gated: `period.teacherId !== actorId`
   * throws) used by the live teacher-workspace flow and is UNCHANGED by
   * this addition. This method is for the new `CvTimetableController`
   * (whole-timetable authoring by anyone holding `CV:TIMETABLE:UPDATE`,
   * e.g. an Administrator or Academic Coordinator building out a class's
   * schedule) and is intentionally NOT ownership-gated -- authorization is
   * the controller's permission check instead. To keep the two paths from
   * fighting each other, this only operates on periods whose parent
   * timetable is still `DRAFT`: once a version is submitted for review or
   * published it becomes the lifecycle service's territory (clone-to-edit),
   * not a free-form template edit.
   */
  async authorUpdatePeriod(
    actorId: string,
    periodId: string,
    updates: Partial<Pick<CvTimetablePeriod,
      'dayOfWeek' | 'startTime' | 'endTime' | 'subjectId' | 'teacherId' | 'room' | 'resourceId' | 'notes' | 'periodNumber'
    >>,
  ): Promise<CvTimetablePeriod> {
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    if (!tenantId) throw new Error('Tenant context required');

    const period = await this.periodRepo.findOne({ where: { id: periodId, tenantId } });
    if (!period) throw new NotFoundException('Timetable period not found');

    const timetable = await this.timetableRepo.findOne({ where: { id: period.timetableId, tenantId } });
    if (!timetable) throw new NotFoundException('Parent timetable not found');
    if (timetable.status !== 'DRAFT') {
      throw new ForbiddenException(
        `Cannot edit a period on a '${timetable.status}' timetable directly -- clone it into a new draft first`,
      );
    }

    Object.assign(period, updates);
    const saved = await this.periodRepo.save(period);

    this.auditService.log({
      module: 'CHILDRENS_VILLAGE',
      action: 'CV_TIMETABLE_PERIOD_AUTHORED_UPDATE',
      tenantId,
      userId: actorId,
      entityId: saved.id,
      entityType: 'cv_timetable_periods',
      metadata: { timetableId: timetable.id, updates },
    });

    return saved;
  }

  /**
   * Removes a period from a DRAFT timetable. Same draft-only guard and
   * authorization model as `authorUpdatePeriod()` above -- see its doc
   * comment.
   */
  async removePeriod(actorId: string, periodId: string): Promise<void> {
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    if (!tenantId) throw new Error('Tenant context required');

    const period = await this.periodRepo.findOne({ where: { id: periodId, tenantId } });
    if (!period) throw new NotFoundException('Timetable period not found');

    const timetable = await this.timetableRepo.findOne({ where: { id: period.timetableId, tenantId } });
    if (!timetable) throw new NotFoundException('Parent timetable not found');
    if (timetable.status !== 'DRAFT') {
      throw new ForbiddenException(
        `Cannot remove a period from a '${timetable.status}' timetable directly -- clone it into a new draft first`,
      );
    }

    await this.periodRepo.delete(periodId);

    this.auditService.log({
      module: 'CHILDRENS_VILLAGE',
      action: 'CV_TIMETABLE_PERIOD_REMOVED',
      tenantId,
      userId: actorId,
      entityId: periodId,
      entityType: 'cv_timetable_periods',
      metadata: { timetableId: timetable.id, subjectId: period.subjectId, dayOfWeek: period.dayOfWeek },
    });
  }
}
