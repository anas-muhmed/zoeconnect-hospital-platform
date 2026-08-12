import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';

/**
 * Phase 1 (Foundation) -- thin, additive teacher profile. Deliberately NOT
 * a full HR entity (no name/contact/employment fields) to avoid
 * duplicating an eventual platform User/HR module; it only carries the
 * scheduling-relevant attributes the Timetable module needs (subject
 * qualifications, workload limits, substitute eligibility). One row per
 * (tenant, user). Populated lazily/upserted on first assignment rather
 * than requiring a separate onboarding step.
 *
 * `userId` is a bare, unenforced uuid presumed to reference the platform
 * User table -- matching the existing codebase-wide convention
 * (`CvTimetablePeriod.teacherId`, `CvClass.classTeacherId`, etc. are all
 * unenforced uuids too; see design spec Section 14 / Risk Analysis).
 */
@Entity('cv_teacher_profiles')
@Index('IDX_CV_TEACHER_PROFILES_TENANT_USER', ['tenantId', 'userId'], { unique: true })
export class CvTeacherProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'hospital_id', type: 'uuid', nullable: true })
  hospitalId: string | null;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'subjects_qualified', type: 'uuid', array: true, nullable: true })
  subjectsQualified: string[] | null;

  @Column({ name: 'max_periods_per_day', type: 'int', nullable: true })
  maxPeriodsPerDay: number | null;

  @Column({ name: 'max_periods_per_week', type: 'int', nullable: true })
  maxPeriodsPerWeek: number | null;

  @Column({ name: 'is_substitute_eligible', type: 'boolean', default: true })
  isSubstituteEligible: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
