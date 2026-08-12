import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { FeedbackQuestion } from './feedback-question.entity';

/** FeedbackQuestionOption --- one selectable choice for RADIO/CHECKBOX/DROPDOWN/MULTI_SELECT questions. */
@Entity('feedback_question_options')
export class FeedbackQuestionOption {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'question_id' })
  questionId: string;

  @Column({ type: 'varchar', length: 255 })
  label: string;

  /** The value stored on submission (later phase) -- lets label wording change without breaking stored answers. */
  @Column({ type: 'varchar', length: 255 })
  value: string;

  @Column({ type: 'int', name: 'display_order', default: 0 })
  displayOrder: number;

  /**
   * Tenant Foundation (Phase 1, Checkpoint A12) — nullable, unread by any
   * code yet. No relation/FK yet (deferred to Stage B). Tenant is
   * derivable via question_id → feedback_questions → feedback_forms.
   */
  @Column({ type: 'uuid', name: 'tenant_id', nullable: true })
  tenantId: string | null;

  @ManyToOne(() => FeedbackQuestion, question => question.options, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'question_id' })
  question: FeedbackQuestion;
}
