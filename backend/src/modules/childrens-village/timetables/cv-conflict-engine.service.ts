import { Inject, Injectable } from '@nestjs/common';
import { LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { CvTimetable, CvTimetableStatus } from './entities/cv-timetable.entity';
import { CvTimetablePeriod } from './entities/cv-timetable-period.entity';
import { CvTeacherAvailability } from './entities/cv-teacher-availability.entity';
import { CvStudentScheduleOverride } from './entities/cv-student-schedule-override.entity';
import { CvTeacherProfile } from './entities/cv-teacher-profile.entity';
import { CvClassSubjectTeacher } from './entities/cv-class-subject-teacher.entity';
import { CvCalendarEvent } from '../academic-years/entities/cv-calendar-event.entity';
import { CvClassroom } from '../resources/entities/cv-classroom.entity';
import { getTenantScopedRepositoryToken } from '../../platform/tenant/repositories/tenant-scoped-repository.provider';
import type { TenantScopedRepository } from '../../platform/tenant/repositories/tenant-scoped.repository';

/**
 * Timetable statuses whose periods represent a "live" (not historical,
 * not dead) claim on a teacher/room/time slot. REJECTED, SUPERSEDED, and
 * ARCHIVED versions are deliberately excluded -- their periods no longer
 * represent a real commitment, so they shouldn't generate conflicts
 * against a brand new draft.
 */
const LIVE_TIMETABLE_STATUSES: CvTimetableStatus[] = [
  'DRAFT', 'IN_REVIEW', 'PENDING_APPROVAL', 'APPROVED', 'PUBLISHED', 'ACTIVE', 'SUSPENDED',
];

export type CvConflictType =
  | 'TEACHER_DOUBLE_BOOKING'
  | 'ROOM_DOUBLE_BOOKING'
  | 'CLASS_DOUBLE_BOOKING'
  | 'TEACHER_UNAVAILABLE'
  | 'SPECIAL_DAY'
  | 'STUDENT_EXCEPTION'
  | 'TEACHER_UNQUALIFIED'
  | 'TEACHER_WORKLOAD_EXCEEDED'
  | 'TEACHER_NOT_ASSIGNED_TO_CLASS_SUBJECT'
  | 'ROOM_INACTIVE'
  | 'ROOM_UNDER_MAINTENANCE';

export type CvConflictSeverity = 'HARD_BLOCK' | 'SOFT_WARN' | 'INFO';

export interface CvConflictWarning {
  type: CvConflictType;
  severity: CvConflictSeverity;
  message: string;
  conflictingEntityId?: string;
  conflictingEntityType?: string;
  metadata?: Record<string, unknown>;
}

export interface CvConflictCandidatePeriod {
  timetableId: string;
  classId?: string;
  subjectId?: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  teacherId: string;
  resourceId?: string | null;
  /** When checking an existing period (e.g. an update), exclude it from matching against itself. */
  excludePeriodId?: string;
}

const DAY_NAMES = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

export interface CvTeacherWorkloadSummary {
  periodsPerDay: Record<string, number>;
  periodsPerWeek: number;
  maxPeriodsPerDay: number | null;
  maxPeriodsPerWeek: number | null;
}

export interface CvConflictReport {
  hasHardConflicts: boolean;
  hasSoftConflicts: boolean;
  conflicts: CvConflictWarning[];
}

/**
 * Timetable Management Phase 4 -- Conflict Engine.
 *
 * REPORT-ONLY per the phase scope: every method here returns a list of
 * `CvConflictWarning`s, never throws for a detected conflict, and is not
 * wired into any write path in a way that blocks it. `CvTimetableService`
 * (period CRUD) and `CvTimetableLifecycleService` (version lifecycle) are
 * both left completely unmodified by this phase -- this is purely a new,
 * additional, read-only service that callers (the controller, and later
 * phases) can consult and choose to surface as warnings.
 *
 * The design spec's own risk note is followed here: production data may
 * already contain double-bookings from before this engine existed, so
 * shipping this as a silent HARD_BLOCK would risk locking up legitimate
 * in-flight edits. A future phase can add a tenant-level "blocking mode"
 * setting once real conflict volume has been observed via this report-only
 * rollout -- that setting does not exist yet, deliberately, per the
 * phased-rollout instruction.
 *
 * Read-only against tables that already exist (Phase 1): no new entities,
 * no new migration, this service is pure query logic.
 */
@Injectable()
export class CvConflictEngineService {
  constructor(
    @Inject(getTenantScopedRepositoryToken(CvTimetablePeriod))
    private readonly periodReadRepo: TenantScopedRepository<CvTimetablePeriod>,

    @Inject(getTenantScopedRepositoryToken(CvTeacherAvailability))
    private readonly availabilityReadRepo: TenantScopedRepository<CvTeacherAvailability>,

    @Inject(getTenantScopedRepositoryToken(CvCalendarEvent))
    private readonly calendarEventReadRepo: TenantScopedRepository<CvCalendarEvent>,

    @Inject(getTenantScopedRepositoryToken(CvStudentScheduleOverride))
    private readonly studentOverrideReadRepo: TenantScopedRepository<CvStudentScheduleOverride>,

    @Inject(getTenantScopedRepositoryToken(CvTeacherProfile))
    private readonly teacherProfileReadRepo: TenantScopedRepository<CvTeacherProfile>,

    @Inject(getTenantScopedRepositoryToken(CvClassSubjectTeacher))
    private readonly classSubjectTeacherReadRepo: TenantScopedRepository<CvClassSubjectTeacher>,

    @Inject(getTenantScopedRepositoryToken(CvClassroom))
    private readonly classroomReadRepo: TenantScopedRepository<CvClassroom>,
  ) {}

  // ── Structural (template-level, no calendar date needed) ───────────

  async checkTeacherConflict(candidate: CvConflictCandidatePeriod): Promise<CvConflictWarning[]> {
    const qb = await this.periodReadRepo.createQueryBuilder('period');
    qb.innerJoin(CvTimetable, 'tt', 'tt.id = period.timetableId')
      .where('period.teacherId = :teacherId', { teacherId: candidate.teacherId })
      .andWhere('period.dayOfWeek = :dayOfWeek', { dayOfWeek: candidate.dayOfWeek })
      .andWhere('period.startTime < :endTime', { endTime: candidate.endTime })
      .andWhere('period.endTime > :startTime', { startTime: candidate.startTime })
      .andWhere('tt.status IN (:...liveStatuses)', { liveStatuses: LIVE_TIMETABLE_STATUSES });
    if (candidate.excludePeriodId) {
      qb.andWhere('period.id != :excludeId', { excludeId: candidate.excludePeriodId });
    }

    const rows = await qb.getMany();
    return rows.map((row) => ({
      type: 'TEACHER_DOUBLE_BOOKING' as const,
      severity: 'HARD_BLOCK' as const,
      message: `Teacher is already scheduled for another period on ${candidate.dayOfWeek} at an overlapping time`,
      conflictingEntityId: row.id,
      conflictingEntityType: 'cv_timetable_periods',
      metadata: { timetableId: row.timetableId, startTime: row.startTime, endTime: row.endTime },
    }));
  }

  async checkRoomConflict(candidate: CvConflictCandidatePeriod): Promise<CvConflictWarning[]> {
    if (!candidate.resourceId) return [];

    const qb = await this.periodReadRepo.createQueryBuilder('period');
    qb.innerJoin(CvTimetable, 'tt', 'tt.id = period.timetableId')
      .where('period.resourceId = :resourceId', { resourceId: candidate.resourceId })
      .andWhere('period.dayOfWeek = :dayOfWeek', { dayOfWeek: candidate.dayOfWeek })
      .andWhere('period.startTime < :endTime', { endTime: candidate.endTime })
      .andWhere('period.endTime > :startTime', { startTime: candidate.startTime })
      .andWhere('tt.status IN (:...liveStatuses)', { liveStatuses: LIVE_TIMETABLE_STATUSES });
    if (candidate.excludePeriodId) {
      qb.andWhere('period.id != :excludeId', { excludeId: candidate.excludePeriodId });
    }

    const rows = await qb.getMany();
    return rows.map((row) => ({
      type: 'ROOM_DOUBLE_BOOKING' as const,
      severity: 'SOFT_WARN' as const,
      message: `Room/resource is already booked for another period on ${candidate.dayOfWeek} at an overlapping time`,
      conflictingEntityId: row.id,
      conflictingEntityType: 'cv_timetable_periods',
      metadata: { timetableId: row.timetableId, startTime: row.startTime, endTime: row.endTime },
    }));
  }

  /**
   * Checked within the SAME timetable version only (a class can't be in
   * two subjects at once within one timetable). Does not check across
   * different timetable versions for the same class -- Phase 1 deferred
   * the DB-level "one ACTIVE version per class" constraint pending a
   * production data audit, so a cross-version class check here could
   * currently generate false positives against pre-existing data; revisit
   * once that audit (flagged in the Phase 1/2 reports) has run.
   */
  async checkClassConflict(candidate: CvConflictCandidatePeriod): Promise<CvConflictWarning[]> {
    const qb = await this.periodReadRepo.createQueryBuilder('period');
    qb.where('period.timetableId = :timetableId', { timetableId: candidate.timetableId })
      .andWhere('period.dayOfWeek = :dayOfWeek', { dayOfWeek: candidate.dayOfWeek })
      .andWhere('period.startTime < :endTime', { endTime: candidate.endTime })
      .andWhere('period.endTime > :startTime', { startTime: candidate.startTime });
    if (candidate.excludePeriodId) {
      qb.andWhere('period.id != :excludeId', { excludeId: candidate.excludePeriodId });
    }

    const rows = await qb.getMany();
    return rows.map((row) => ({
      type: 'CLASS_DOUBLE_BOOKING' as const,
      severity: 'HARD_BLOCK' as const,
      message: `This class already has another subject scheduled on ${candidate.dayOfWeek} at an overlapping time`,
      conflictingEntityId: row.id,
      conflictingEntityType: 'cv_timetable_periods',
      metadata: { subjectId: row.subjectId, startTime: row.startTime, endTime: row.endTime },
    }));
  }

  // ── Resources (Phase 8) ──────────────────────────────────────────────

  /**
   * Soft-warns (never blocks, same report-only philosophy as everything
   * else here) when a candidate period's `resourceId` points at a
   * `CvClassroom` that's inactive, or -- when a concrete `date` is given --
   * falls inside that room's maintenance window (Phase 8's addition to
   * `CvClassroom`). No `resourceId` or an unknown/deleted one is silent,
   * not a conflict -- matches `checkRoomConflict`'s existing "no
   * resourceId, no check" behavior.
   */
  async checkResourceAvailability(resourceId: string | null | undefined, date?: string): Promise<CvConflictWarning[]> {
    if (!resourceId) return [];
    const room = await this.classroomReadRepo.findOne({ where: { id: resourceId } });
    if (!room) return [];

    const warnings: CvConflictWarning[] = [];
    if (!room.isActive) {
      warnings.push({
        type: 'ROOM_INACTIVE',
        severity: 'SOFT_WARN',
        message: `Room/resource '${room.name}' is marked inactive`,
        conflictingEntityId: room.id,
        conflictingEntityType: 'cv_classrooms',
      });
    }

    if (date && room.maintenanceFrom && room.maintenanceTo) {
      const dayStart = new Date(`${date}T00:00:00`);
      const dayEnd = new Date(`${date}T23:59:59.999`);
      if (room.maintenanceFrom <= dayEnd && room.maintenanceTo >= dayStart) {
        warnings.push({
          type: 'ROOM_UNDER_MAINTENANCE',
          severity: 'SOFT_WARN',
          message: `Room/resource '${room.name}' is under maintenance on ${date}${room.maintenanceNotes ? ` (${room.maintenanceNotes})` : ''}`,
          conflictingEntityId: room.id,
          conflictingEntityType: 'cv_classrooms',
          metadata: { maintenanceFrom: room.maintenanceFrom, maintenanceTo: room.maintenanceTo },
        });
      }
    }

    return warnings;
  }

  // ── Calendar-date-specific (needs a concrete date, not just a weekday) ──

  async checkAvailabilityConflict(teacherId: string, date: string): Promise<CvConflictWarning[]> {
    const dayStart = new Date(`${date}T00:00:00`);
    const dayEnd = new Date(`${date}T23:59:59.999`);

    const rows = await this.availabilityReadRepo.find({
      where: {
        teacherId,
        startDatetime: LessThanOrEqual(dayEnd),
        endDatetime: MoreThanOrEqual(dayStart),
      },
    });

    return rows.map((row) => ({
      type: 'TEACHER_UNAVAILABLE' as const,
      severity: row.severity,
      message: `Teacher has a recorded ${row.type} on ${date}${row.reason ? ` (${row.reason})` : ''}`,
      conflictingEntityId: row.id,
      conflictingEntityType: 'cv_teacher_availability',
      metadata: { type: row.type, startDatetime: row.startDatetime, endDatetime: row.endDatetime },
    }));
  }

  async checkSpecialDayConflict(classId: string, date: string): Promise<CvConflictWarning[]> {
    const day = new Date(`${date}T00:00:00`);

    const rows = await this.calendarEventReadRepo.find({
      where: {
        startDate: LessThanOrEqual(day),
        endDate: MoreThanOrEqual(day),
      },
    });

    return rows
      .filter((row) => row.affectsAllClasses || (row.affectedClassIds ?? []).includes(classId))
      .map((row) => ({
        type: 'SPECIAL_DAY' as const,
        severity: 'SOFT_WARN' as const,
        message: `${date} is a declared ${row.type}${row.title ? ` (${row.title})` : ''}`,
        conflictingEntityId: row.id,
        conflictingEntityType: 'cv_calendar_events',
        metadata: { calendarEventType: row.type, timetableBehavior: row.timetableBehavior },
      }));
  }

  /**
   * Informational only (severity INFO, never blocks anything even in a
   * future blocking mode): flags which students have a pull-out override
   * tied to this specific period, so an author/reviewer knows some
   * students won't actually be present. Matched by `periodId` only (not
   * by exact date), since `CvStudentScheduleOverride.date` is nullable
   * (null means "applies weekly by day_of_week") and reconciling that
   * against a specific calendar date here would duplicate logic that
   * already lives in `CvTimetableService.getTeacherScheduleForDay` --
   * this method's job is just "does this period have known exceptions",
   * not to resolve them for one exact day.
   */
  async checkStudentExceptionConflict(periodId: string): Promise<CvConflictWarning[]> {
    const rows = await this.studentOverrideReadRepo.find({ where: { periodId }, relations: ['student'] });

    return rows.map((row) => ({
      type: 'STUDENT_EXCEPTION' as const,
      severity: 'INFO' as const,
      message: `A student has a scheduled exception for this period (${row.reason})`,
      conflictingEntityId: row.id,
      conflictingEntityType: 'cv_student_schedule_overrides',
      metadata: { studentId: row.studentId, reason: row.reason, dayOfWeek: row.dayOfWeek, date: row.date },
    }));
  }

  // ── Teacher Assignment (Phase 5) ────────────────────────────────────

  /**
   * All of a teacher's periods across every LIVE timetable version,
   * tenant-wide -- the same "live" definition `checkTeacherConflict` uses.
   * Shared by `checkTeacherWorkload` and `getTeacherWorkloadSummary` so the
   * two can never disagree about what counts as "currently assigned".
   */
  private async getLiveTeacherPeriods(teacherId: string): Promise<CvTimetablePeriod[]> {
    const qb = await this.periodReadRepo.createQueryBuilder('period');
    qb.innerJoin(CvTimetable, 'tt', 'tt.id = period.timetableId')
      .where('period.teacherId = :teacherId', { teacherId })
      .andWhere('tt.status IN (:...liveStatuses)', { liveStatuses: LIVE_TIMETABLE_STATUSES });
    return qb.getMany();
  }

  /**
   * Soft-warns when a teacher is assigned a subject outside their
   * `CvTeacherProfile.subjectsQualified` list. No profile, or a profile
   * with no `subjectsQualified` recorded, means "no data" -- deliberately
   * not treated as a violation (avoids false positives for tenants that
   * haven't populated profiles yet, matching the Conflict Engine's
   * report-only, opt-in-by-data philosophy from Phase 4).
   */
  async checkTeacherQualification(teacherId: string, subjectId: string): Promise<CvConflictWarning[]> {
    const profile = await this.teacherProfileReadRepo.findOne({ where: { userId: teacherId } });
    if (!profile || !profile.subjectsQualified || profile.subjectsQualified.length === 0) return [];
    if (profile.subjectsQualified.includes(subjectId)) return [];

    return [{
      type: 'TEACHER_UNQUALIFIED',
      severity: 'SOFT_WARN',
      message: 'Teacher is not marked as qualified for this subject in their teacher profile',
      conflictingEntityId: profile.id,
      conflictingEntityType: 'cv_teacher_profiles',
      metadata: { subjectId, subjectsQualified: profile.subjectsQualified },
    }];
  }

  /**
   * Soft-warns when adding/keeping this period would put the teacher at
   * or over their declared `maxPeriodsPerDay`/`maxPeriodsPerWeek`. No
   * profile, or a profile with neither limit set, means no check runs.
   * Counts are computed AFTER the write (this is called post-save by the
   * controller, same timing as every other Phase 4 check), so the
   * candidate period itself is already included in the count -- no manual
   * "+1" needed here.
   */
  async checkTeacherWorkload(teacherId: string, dayOfWeek: string): Promise<CvConflictWarning[]> {
    const profile = await this.teacherProfileReadRepo.findOne({ where: { userId: teacherId } });
    if (!profile || (profile.maxPeriodsPerDay == null && profile.maxPeriodsPerWeek == null)) return [];

    const periods = await this.getLiveTeacherPeriods(teacherId);
    const warnings: CvConflictWarning[] = [];

    if (profile.maxPeriodsPerDay != null) {
      const dayCount = periods.filter((p) => p.dayOfWeek === dayOfWeek).length;
      if (dayCount > profile.maxPeriodsPerDay) {
        warnings.push({
          type: 'TEACHER_WORKLOAD_EXCEEDED',
          severity: 'SOFT_WARN',
          message: `Teacher now has ${dayCount} periods on ${dayOfWeek}, exceeding their configured max of ${profile.maxPeriodsPerDay} per day`,
          conflictingEntityId: profile.id,
          conflictingEntityType: 'cv_teacher_profiles',
          metadata: { dayOfWeek, dayCount, maxPeriodsPerDay: profile.maxPeriodsPerDay },
        });
      }
    }

    if (profile.maxPeriodsPerWeek != null && periods.length > profile.maxPeriodsPerWeek) {
      warnings.push({
        type: 'TEACHER_WORKLOAD_EXCEEDED',
        severity: 'SOFT_WARN',
        message: `Teacher now has ${periods.length} periods this week, exceeding their configured max of ${profile.maxPeriodsPerWeek} per week`,
        conflictingEntityId: profile.id,
        conflictingEntityType: 'cv_teacher_profiles',
        metadata: { weekCount: periods.length, maxPeriodsPerWeek: profile.maxPeriodsPerWeek },
      });
    }

    return warnings;
  }

  /**
   * Informational: flags when a teacher teaching a class/subject isn't
   * one of the teachers on record in `cv_class_subject_teachers` for that
   * class+subject. If no roster rows exist at all for the class+subject,
   * this is silent -- an unpopulated roster is not itself a conflict, it
   * just means this check has nothing to compare against yet.
   */
  async checkClassSubjectAssignment(classId: string, subjectId: string, teacherId: string): Promise<CvConflictWarning[]> {
    const roster = await this.classSubjectTeacherReadRepo.find({ where: { classId, subjectId } });
    if (roster.length === 0) return [];
    if (roster.some((r) => r.teacherId === teacherId)) return [];

    return [{
      type: 'TEACHER_NOT_ASSIGNED_TO_CLASS_SUBJECT',
      severity: 'INFO',
      message: 'This teacher is not on the recorded subject-teacher roster for this class and subject',
      conflictingEntityType: 'cv_class_subject_teachers',
      metadata: { classId, subjectId, rosterTeacherIds: roster.map((r) => r.teacherId) },
    }];
  }

  /**
   * Read-only workload snapshot for a teacher -- used by the new
   * `CvTeacherProfileController` "workload" endpoint (Phase 5), and shares
   * its counting logic with `checkTeacherWorkload` above so the two can
   * never disagree.
   */
  async getTeacherWorkloadSummary(teacherId: string): Promise<CvTeacherWorkloadSummary> {
    const [profile, periods] = await Promise.all([
      this.teacherProfileReadRepo.findOne({ where: { userId: teacherId } }),
      this.getLiveTeacherPeriods(teacherId),
    ]);

    const periodsPerDay = DAY_NAMES.reduce((acc, day) => {
      acc[day] = 0;
      return acc;
    }, {} as Record<string, number>);
    periods.forEach((p) => {
      periodsPerDay[p.dayOfWeek] = (periodsPerDay[p.dayOfWeek] ?? 0) + 1;
    });

    return {
      periodsPerDay,
      periodsPerWeek: periods.length,
      maxPeriodsPerDay: profile?.maxPeriodsPerDay ?? null,
      maxPeriodsPerWeek: profile?.maxPeriodsPerWeek ?? null,
    };
  }

  // ── Aggregate ────────────────────────────────────────────────────

  /**
   * Runs the structural checks (teacher/room/class) always, and the
   * calendar-date-specific checks (availability/special-day) only when
   * `date` is supplied. Student-exception checks only run when
   * `candidate.excludePeriodId` (i.e. an existing, already-persisted
   * period) is supplied -- a not-yet-created period can't have exceptions
   * tied to it yet.
   */
  async checkAll(candidate: CvConflictCandidatePeriod, date?: string): Promise<CvConflictReport> {
    const [teacherConflicts, roomConflicts, classConflicts, workloadConflicts] = await Promise.all([
      this.checkTeacherConflict(candidate),
      this.checkRoomConflict(candidate),
      this.checkClassConflict(candidate),
      this.checkTeacherWorkload(candidate.teacherId, candidate.dayOfWeek),
    ]);

    let availabilityConflicts: CvConflictWarning[] = [];
    let specialDayConflicts: CvConflictWarning[] = [];
    if (date) {
      [availabilityConflicts, specialDayConflicts] = await Promise.all([
        this.checkAvailabilityConflict(candidate.teacherId, date),
        candidate.classId ? this.checkSpecialDayConflict(candidate.classId, date) : Promise.resolve([]),
      ]);
    }

    let qualificationConflicts: CvConflictWarning[] = [];
    let rosterConflicts: CvConflictWarning[] = [];
    if (candidate.subjectId) {
      qualificationConflicts = await this.checkTeacherQualification(candidate.teacherId, candidate.subjectId);
      if (candidate.classId) {
        rosterConflicts = await this.checkClassSubjectAssignment(candidate.classId, candidate.subjectId, candidate.teacherId);
      }
    }

    const studentExceptionConflicts = candidate.excludePeriodId
      ? await this.checkStudentExceptionConflict(candidate.excludePeriodId)
      : [];

    const resourceAvailabilityConflicts = await this.checkResourceAvailability(candidate.resourceId, date);

    const conflicts = [
      ...teacherConflicts,
      ...roomConflicts,
      ...classConflicts,
      ...workloadConflicts,
      ...availabilityConflicts,
      ...specialDayConflicts,
      ...qualificationConflicts,
      ...rosterConflicts,
      ...studentExceptionConflicts,
      ...resourceAvailabilityConflicts,
    ];

    return {
      hasHardConflicts: conflicts.some((c) => c.severity === 'HARD_BLOCK'),
      hasSoftConflicts: conflicts.some((c) => c.severity === 'SOFT_WARN'),
      conflicts,
    };
  }
}
