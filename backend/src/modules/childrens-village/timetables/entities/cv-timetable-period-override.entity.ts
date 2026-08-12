import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { CvTimetablePeriod } from './cv-timetable-period.entity';

/**
 * A single-date exception to a recurring `cv_timetable_periods` slot.
 *
 * The base timetable grid is a weekly *template* (keyed by `dayOfWeek`, no
 * concrete date) -- editing it always changes every future occurrence of
 * that weekday. This table exists so a teacher can instead say "just move
 * today's 10am Math to Room 4" without touching every future Tuesday.
 *
 * Any column left null means "inherit the value from the base period" --
 * only the fields the teacher actually changed for that one date are
 * stored here. `(period_id, date)` is unique: at most one override per
 * period per calendar date.
 */
@Entity('cv_timetable_period_overrides')
@Index('IDX_CV_TT_PERIOD_OVERRIDE_PERIOD_DATE', ['periodId', 'date'], { unique: true })
export class CvTimetablePeriodOverride {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'hospital_id', type: 'uuid', nullable: true })
  hospitalId: string | null;

  @Column({ name: 'period_id', type: 'uuid' })
  periodId: string;

  @Column({ name: 'date', type: 'date' })
  date: string; // 'YYYY-MM-DD' -- the single calendar day this exception applies to

  @Column({ name: 'subject_id', type: 'uuid', nullable: true })
  subjectId: string | null;

  @Column({ name: 'room', type: 'varchar', length: 100, nullable: true })
  room: string | null;

  @Column({ name: 'start_time', type: 'time', nullable: true })
  startTime: string | null;

  @Column({ name: 'end_time', type: 'time', nullable: true })
  endTime: string | null;

  /**
   * Phase 7 (Teacher Requests) additions -- all nullable/additive, unused
   * by the pre-existing THIS_DAY room/time-only override flow in
   * `CvTimetableService.updatePeriod`. Populated only when this override
   * row was created (or updated) by an approved exchange/swap/substitute
   * request: `teacherId` is who actually teaches this slot on this date,
   * `originalTeacherId` is who they're replacing (for display + as the
   * rollback target), `changeRequestId` links back to the
   * `CvTimetableChangeRequest` that produced this row.
   */
  @Column({ name: 'teacher_id', type: 'uuid', nullable: true })
  teacherId: string | null;

  @Column({ name: 'original_teacher_id', type: 'uuid', nullable: true })
  originalTeacherId: string | null;

  @Column({ name: 'change_request_id', type: 'uuid', nullable: true })
  changeRequestId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy: string | null;

  @ManyToOne(() => CvTimetablePeriod)
  @JoinColumn({ name: 'period_id' })
  period: CvTimetablePeriod;
}
