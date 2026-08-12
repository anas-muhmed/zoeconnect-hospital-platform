import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { CvTimetablePeriod } from './cv-timetable-period.entity';
import { CvTimetablePeriodOverride } from './cv-timetable-period-override.entity';

export type CvLessonCompletionStatus =
  | 'COMPLETED'
  | 'PARTIALLY_COMPLETED'
  | 'NOT_COMPLETED'
  | 'CANCELLED'
  | 'SUBSTITUTED'
  | 'MOVED'
  | 'RESCHEDULED';

/**
 * Phase 1 (Foundation) -- optional, post-hoc record of whether a period
 * was actually delivered on a given date. Per the design brief, marking
 * this is optional: the ABSENCE of a row for (period, date) means "not yet
 * marked", not an error state -- callers should never treat a missing
 * record as NOT_COMPLETED without checking first.
 */
@Entity('cv_lesson_completion_records')
@Index('IDX_CV_LCR_PERIOD_DATE', ['periodId', 'date'], { unique: true })
@Index('IDX_CV_LCR_TENANT_DATE', ['tenantId', 'date'])
export class CvLessonCompletionRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'hospital_id', type: 'uuid', nullable: true })
  hospitalId: string | null;

  @Column({ name: 'period_id', type: 'uuid' })
  periodId: string;

  @Column({ name: 'override_id', type: 'uuid', nullable: true })
  overrideId: string | null;

  @Column({ name: 'date', type: 'date' })
  date: string; // 'YYYY-MM-DD'

  @Column({ name: 'teacher_id', type: 'uuid' })
  teacherId: string; // the teacher who actually delivered it -- may differ from the period's scheduled teacher (substitution)

  @Column({ name: 'status', type: 'varchar', length: 20, default: 'COMPLETED' })
  status: CvLessonCompletionStatus;

  @Column({ name: 'notes', type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'marked_by', type: 'uuid', nullable: true })
  markedBy: string | null;

  @Column({ name: 'marked_at', type: 'timestamp', nullable: true })
  markedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => CvTimetablePeriod, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'period_id' })
  period: CvTimetablePeriod;

  @ManyToOne(() => CvTimetablePeriodOverride, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'override_id' })
  override: CvTimetablePeriodOverride | null;
}
