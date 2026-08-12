import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany, JoinColumn,
} from 'typeorm';
import { EicAssessment } from './eic-assessment.entity';
import { EicTherapyEnrollment } from './eic-therapy-enrollment.entity';
import { EicSessionEntry } from './eic-session-entry.entity';
import { EicDiscipline } from '../common/enums/discipline.enum';
import { EicGoalStatus, EicGoalType } from '../common/enums/assessment-status.enum';

@Entity('eic_goals')
export class EicGoal {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'assessment_id', type: 'uuid' })
  assessmentId: string;

  @Column({ name: 'enrollment_id', type: 'uuid' })
  enrollmentId: string;

  @Column({ name: 'discipline', type: 'enum', enum: EicDiscipline })
  discipline: EicDiscipline;

  @Column({ name: 'goal_type', type: 'enum', enum: EicGoalType, default: EicGoalType.SHORT_TERM })
  goalType: EicGoalType;

  @Column({ name: 'goal_text', type: 'text' })
  goalText: string;

  @Column({ name: 'target_date', type: 'date', nullable: true })
  targetDate: string | null;

  @Column({ name: 'status', type: 'enum', enum: EicGoalStatus, default: EicGoalStatus.ACTIVE })
  status: EicGoalStatus;

  @Column({ name: 'achieved_at', type: 'timestamptz', nullable: true })
  achievedAt: Date | null;

  @Column({ name: 'achievement_notes', type: 'text', nullable: true })
  achievementNotes: string | null;


  @Column({ name: 'original_target_date', type: 'date', nullable: true })
  originalTargetDate: string | null;

  @Column({ name: 'extended_target_date', type: 'date', nullable: true })
  extendedTargetDate: string | null;

  @Column({ name: 'extension_remarks', type: 'text', nullable: true })
  extensionRemarks: string | null;

  @Column({ name: 'extended_at', type: 'timestamptz', nullable: true })
  extendedAt: Date | null;

  @Column({ name: 'extended_by', type: 'uuid', nullable: true })
  extendedBy: string | null;

  @Column({ name: 'session_count', type: 'int', default: 0 })
  sessionCount: number;

  @Column({ name: 'display_order', type: 'smallint', default: 0 })
  displayOrder: number;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

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
  @ManyToOne(() => EicAssessment, (a) => a.goals, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'assessment_id' })
  assessment: EicAssessment;

  @ManyToOne(() => EicTherapyEnrollment, (e) => e.goals, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'enrollment_id' })
  enrollment: EicTherapyEnrollment;

  @OneToMany(() => EicSessionEntry, (se) => se.goal)
  sessionEntries: EicSessionEntry[];
}
