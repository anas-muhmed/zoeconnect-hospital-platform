import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, OneToOne, JoinColumn,
} from 'typeorm';
import { EicPreschoolEnrollment } from './eic-preschool-enrollment.entity';

@Entity('eic_preschool_assessments')
export class EicPreschoolAssessment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'preschool_enrollment_id', type: 'uuid' })
  preschoolEnrollmentId: string;

  @Column({ name: 'assessment_date', type: 'date' })
  assessmentDate: string;

  @Column({ name: 'assessed_by', type: 'uuid', nullable: true })
  assessedBy: string | null;

  @Column({ name: 'assessor_name', type: 'varchar', length: 200, nullable: true })
  assessorName: string | null;

  @Column({ name: 'language_communication', type: 'jsonb', nullable: true, default: {} })
  languageCommunication: Record<string, unknown>;

  @Column({ name: 'adl_self_help', type: 'jsonb', nullable: true, default: {} })
  adlSelfHelp: Record<string, unknown>;

  @Column({ name: 'social_emotional', type: 'jsonb', nullable: true, default: {} })
  socialEmotional: Record<string, unknown>;

  @Column({ name: 'pre_academic', type: 'jsonb', nullable: true, default: {} })
  preAcademic: Record<string, unknown>;

  @Column({ name: 'conceptual_understanding', type: 'jsonb', nullable: true, default: {} })
  conceptualUnderstanding: Record<string, unknown>;

  @Column({ name: 'gross_motor', type: 'jsonb', nullable: true, default: {} })
  grossMotor: Record<string, unknown>;

  @Column({ name: 'fine_motor', type: 'jsonb', nullable: true, default: {} })
  fineMotor: Record<string, unknown>;

  @Column({ name: 'recommendations', type: 'text', nullable: true })
  recommendations: string | null;

  @Column({ name: 'goals', type: 'jsonb', nullable: true, default: [] })
  goals: Array<{ text: string; targetDate?: string }>;

  @Column({ name: 'status', type: 'varchar', length: 20, default: 'DRAFT' })
  status: string;

  @Column({ name: 'is_current', type: 'boolean', default: true })
  isCurrent: boolean;

  @Column({ name: 'assessment_number', type: 'int', default: 1 })
  assessmentNumber: number;

  /**
   * Tenant Foundation (Phase 1, Checkpoint A8) — nullable, unread by any
   * code yet. No relation/FK yet (deferred to Stage B). Tenant is
   * derivable via preschool_enrollment_id → eic_preschool_enrollments →
   * eic_patients.
   */
  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToOne(() => EicPreschoolEnrollment, (e) => e.assessment)
  @JoinColumn({ name: 'preschool_enrollment_id' })
  preschoolEnrollment: EicPreschoolEnrollment;
}
