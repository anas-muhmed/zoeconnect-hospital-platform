import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn
} from 'typeorm';
import { CvAcademicYear } from './cv-academic-year.entity';

@Entity('cv_calendar_events')
@Index('IDX_CV_CALENDAR_EVENTS_TENANT', ['tenantId', 'academicYearId'])
export class CvCalendarEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Stage B Tenant Isolation */
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'academic_year_id', type: 'uuid' })
  academicYearId: string;

  @Column({ name: 'title', type: 'varchar', length: 255 })
  title: string;

  @Column({ name: 'type', type: 'varchar', length: 50 })
  // e.g. HOLIDAY, WORKING_DAY, EXAM_DAY, INSET_DAY
  type: string;

  @Column({ name: 'start_date', type: 'date' })
  startDate: Date;

  @Column({ name: 'end_date', type: 'date' })
  endDate: Date;

  @Column({ name: 'is_full_day', type: 'boolean', default: true })
  isFullDay: boolean;

  @Column({ name: 'affects_attendance', type: 'boolean', default: true })
  // e.g. Holidays typically block attendance logs
  affectsAttendance: boolean;

  /**
   * Phase 1 (Foundation) additions -- Timetable Management "Special Days"
   * requirement, folded into this existing calendar rather than a new
   * `cv_special_days` table (see migration 1790300000000's header comment
   * for the reasoning). `type` remains a free varchar, so the design
   * spec's extra special-day types (HALF_DAY, FESTIVAL, SPORTS_DAY,
   * ANNUAL_DAY, ASSESSMENT_WEEK, PARENT_MEETING, MEDICAL_CAMP,
   * THERAPY_CAMP, SCHOOL_CLOSURE, UNEXPECTED_CLOSURE, RAIN_HOLIDAY,
   * EMERGENCY_CLOSURE) need no schema change, only a value in `type`.
   */
  @Column({ name: 'affects_all_classes', type: 'boolean', default: true })
  affectsAllClasses: boolean;

  @Column({ name: 'affected_class_ids', type: 'uuid', array: true, nullable: true })
  affectedClassIds: string[] | null;

  @Column({ name: 'timetable_behavior', type: 'varchar', length: 20, nullable: true })
  // e.g. SUSPEND_ALL, HALF_DAY_TRUNCATE, CUSTOM_SCHEDULE
  timetableBehavior: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => CvAcademicYear, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'academic_year_id' })
  academicYear: CvAcademicYear;
}
