import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';

export type CvTeacherAvailabilityType =
  | 'ABSENT'
  | 'LEAVE'
  | 'TRAINING'
  | 'MEETING'
  | 'HOSPITAL_VISIT'
  | 'THERAPY_SESSION'
  | 'OFF_SITE_ASSIGNMENT'
  | 'OTHER';

export type CvTeacherAvailabilitySeverity = 'HARD_BLOCK' | 'SOFT_WARN';

/**
 * Phase 1 (Foundation) -- a time-ranged record of a teacher being
 * unavailable (or partially unavailable) for a reason. Modeled as a set of
 * ranged records with a type + severity, not a single boolean, because a
 * teacher can be simultaneously "on approved leave" and have a partially
 * overlapping "training" entry (design spec Section 1.3).
 */
@Entity('cv_teacher_availability')
@Index('IDX_CV_TEACHER_AVAILABILITY_TEACHER_SLOT', ['teacherId', 'startDatetime', 'endDatetime'])
export class CvTeacherAvailability {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'hospital_id', type: 'uuid', nullable: true })
  hospitalId: string | null;

  @Column({ name: 'teacher_id', type: 'uuid' })
  teacherId: string;

  @Column({ name: 'type', type: 'varchar', length: 30 })
  type: CvTeacherAvailabilityType;

  @Column({ name: 'severity', type: 'varchar', length: 10, default: 'HARD_BLOCK' })
  severity: CvTeacherAvailabilitySeverity;

  @Column({ name: 'start_datetime', type: 'timestamp' })
  startDatetime: Date;

  @Column({ name: 'end_datetime', type: 'timestamp' })
  endDatetime: Date;

  @Column({ name: 'reason', type: 'text', nullable: true })
  reason: string | null;

  @Column({ name: 'source', type: 'varchar', length: 20, default: 'MANUAL' })
  // e.g. MANUAL, HR_SYNC, LEAVE_SYSTEM
  source: string;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
