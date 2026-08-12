import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { EicPreschoolEnrollment } from './eic-preschool-enrollment.entity';

@Entity('eic_preschool_daily_reports')
export class EicPreschoolDailyReport {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'preschool_enrollment_id', type: 'uuid' })
  preschoolEnrollmentId: string;

  @Column({ name: 'report_date', type: 'date' })
  reportDate: string;

  @Column({ name: 'attendance', type: 'varchar', length: 20, default: 'PRESENT' })
  attendance: string;

  @Column({ name: 'mood_on_arrival', type: 'varchar', length: 30, nullable: true })
  moodOnArrival: string | null;

  @Column({ name: 'participation_level', type: 'varchar', length: 20, nullable: true })
  participationLevel: string | null;

  @Column({ name: 'overall_day_rating', type: 'varchar', length: 20, nullable: true })
  overallDayRating: string | null;

  @Column({ name: 'curriculum_activities', type: 'jsonb', nullable: true, default: [] })
  curriculumActivities: Array<{ activity: string; participation: string; remarks?: string }>;

  @Column({ name: 'adl_performance', type: 'jsonb', nullable: true, default: {} })
  adlPerformance: Record<string, string>;

  @Column({ name: 'behaviour_observations', type: 'text', nullable: true })
  behaviourObservations: string | null;

  @Column({ name: 'home_practice', type: 'text', nullable: true })
  homePractice: string | null;

  @Column({ name: 'teacher_remarks', type: 'text', nullable: true })
  teacherRemarks: string | null;

  @Column({ name: 'submitted_by', type: 'uuid', nullable: true })
  submittedBy: string | null;

  @Column({ name: 'submitted_at', type: 'timestamptz', nullable: true })
  submittedAt: Date | null;

  /**
   * Tenant Foundation (Phase 1, Checkpoint A8) — nullable, unread by any
   * code yet. No relation/FK yet (deferred to Stage B). High-volume table
   * (one row per child per school day); tenant is derivable via
   * preschool_enrollment_id → eic_preschool_enrollments → eic_patients.
   */
  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => EicPreschoolEnrollment, (e) => e.dailyReports)
  @JoinColumn({ name: 'preschool_enrollment_id' })
  preschoolEnrollment: EicPreschoolEnrollment;
}
