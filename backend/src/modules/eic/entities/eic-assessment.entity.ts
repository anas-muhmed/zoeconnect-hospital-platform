import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany, JoinColumn,
} from 'typeorm';
import { EicTherapyEnrollment } from './eic-therapy-enrollment.entity';
import { EicGoal } from './eic-goal.entity';
import { EicDiscipline } from '../common/enums/discipline.enum';
import { EicAssessmentStatus } from '../common/enums/assessment-status.enum';

@Entity('eic_assessments')
export class EicAssessment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'enrollment_id', type: 'uuid' })
  enrollmentId: string;

  @Column({ name: 'discipline', type: 'enum', enum: EicDiscipline })
  discipline: EicDiscipline;

  @Column({ name: 'assessment_type', type: 'varchar', length: 30, default: 'INITIAL' })
  assessmentType: string;

  @Column({
    name: 'status',
    type: 'enum',
    enum: EicAssessmentStatus,
    default: EicAssessmentStatus.DRAFT,
  })
  status: EicAssessmentStatus;

  @Column({ name: 'therapist_id', type: 'varchar', length: 100 })
  therapistId: string;

  @Column({ name: 'therapist_name', type: 'varchar', length: 200 })
  therapistName: string;

  @Column({ name: 'countersigned_by', type: 'uuid', nullable: true })
  countersignedBy: string | null;

  @Column({ name: 'countersigned_at', type: 'timestamptz', nullable: true })
  countersignedAt: Date | null;

  @Column({ name: 'countersign_notes', type: 'text', nullable: true })
  countersignNotes: string | null;

  @Column({ name: 'parent_assessment_id', type: 'uuid', nullable: true })
  parentAssessmentId: string | null;

  // Clinical data — discipline-specific JSONB blobs
  @Column({ name: 'socio_demographic', type: 'jsonb', nullable: true, default: {} })
  socioDemographic: Record<string, unknown>;

  @Column({ name: 'background_history', type: 'jsonb', nullable: true, default: {} })
  backgroundHistory: Record<string, unknown>;

  @Column({ name: 'clinical_observations', type: 'jsonb', nullable: true, default: {} })
  clinicalObservations: Record<string, unknown>;

  @Column({ name: 'formal_evaluations', type: 'jsonb', nullable: true, default: {} })
  formalEvaluations: Record<string, unknown>;

  @Column({ name: 'assessment_tool_scores', type: 'jsonb', nullable: true, default: [] })
  assessmentToolScores: Array<{ tool: string; score: number | string; interpretation: string }>;

  @Column({ name: 'recommendations', type: 'text', nullable: true })
  recommendations: string | null;

  @Column({ name: 'goals_section', type: 'jsonb', nullable: true, default: {} })
  goalsSection: Record<string, unknown>;

  @Column({ name: 'additional_notes', type: 'text', nullable: true })
  additionalNotes: string | null;

  @Column({ name: 'submitted_at', type: 'timestamptz', nullable: true })
  submittedAt: Date | null;

  @Column({ name: 'finalised_at', type: 'timestamptz', nullable: true })
  finalisedAt: Date | null;

  /**
   * Tenant Foundation (Phase 1, Checkpoint A8) — nullable, unread by any
   * code yet. No relation/FK yet (deferred to Stage B). Tenant is
   * derivable via enrollment_id → eic_therapy_enrollments → eic_patients.
   */
  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // Relations
  @ManyToOne(() => EicTherapyEnrollment, (e) => e.assessments)
  @JoinColumn({ name: 'enrollment_id' })
  enrollment: EicTherapyEnrollment;

  @OneToMany(() => EicGoal, (g) => g.assessment)
  goals: EicGoal[];
}
