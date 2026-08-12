import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { FeedbackConditionAction, FeedbackConditionOperator } from './feedback-question-type.enum';
import { FeedbackQuestion } from './feedback-question.entity';

/**
 * FeedbackQuestionCondition --- conditional display logic (spec §3), e.g.
 * "IF Rating <= 2 THEN show Complaint Question" or "IF Pharmacy = No THEN
 * hide Pharmacy Questions". `questionId` is the question this condition
 * controls (shows/hides); `sourceQuestionId` is the question being evaluated
 * (the one the patient already answered). A question may have multiple
 * conditions -- Phase 1 stores them (CRUD only); the public portal (a later
 * phase) is what actually evaluates them at runtime against live answers, so
 * this entity is pure storage today, no evaluation engine attached yet.
 * Multiple conditions on the same question are combined with AND.
 */
@Entity('feedback_question_conditions')
export class FeedbackQuestionCondition {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'question_id' })
  questionId: string;

  @Column({ type: 'uuid', name: 'source_question_id' })
  sourceQuestionId: string;

  @Column({ type: 'varchar', length: 20 })
  operator: FeedbackConditionOperator;

  @Column({ type: 'varchar', name: 'comparison_value', length: 255 })
  comparisonValue: string;

  @Column({ type: 'varchar', length: 10, default: 'SHOW' })
  action: FeedbackConditionAction;

  /**
   * Tenant Foundation (Phase 1, Checkpoint A12) — nullable, unread by any
   * code yet. No relation/FK yet (deferred to Stage B). Tenant is
   * derivable via question_id → feedback_questions → feedback_forms.
   */
  @Column({ type: 'uuid', name: 'tenant_id', nullable: true })
  tenantId: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => FeedbackQuestion, question => question.conditions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'question_id' })
  question: FeedbackQuestion;

  @ManyToOne(() => FeedbackQuestion, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'source_question_id' })
  sourceQuestion: FeedbackQuestion;
}
