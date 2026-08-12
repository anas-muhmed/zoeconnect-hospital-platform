import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { FeedbackQuestionType } from './feedback-question-type.enum';
import { FeedbackSection } from './feedback-section.entity';
import { FeedbackQuestionOption } from './feedback-question-option.entity';
import { FeedbackQuestionCondition } from './feedback-question-condition.entity';

/**
 * FeedbackQuestion --- one question within a section. `formId` is denormalized
 * (also derivable via section.formId) purely so form-level queries (e.g. "does
 * this form have any rating question for the Google Review threshold check" in
 * a later phase) don't need a join -- same tradeoff CMS made denormalizing
 * currentPlaylistId onto CMSDisplayAssignment.
 *
 * `config` is a free-form jsonb bag for type-specific settings that don't
 * warrant their own columns (NPS scale endpoints/labels, star icon count,
 * emoji set, file-upload accepted types) -- keeps this entity stable as new
 * question types are added, mirroring CMSPlaylistItem.configuration for widgets.
 */
@Entity('feedback_questions')
export class FeedbackQuestion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'form_id' })
  formId: string;

  @Column({ type: 'uuid', name: 'section_id' })
  sectionId: string;

  @Column({ type: 'varchar', name: 'question_type', length: 30 })
  questionType: FeedbackQuestionType;

  @Column({ type: 'text', name: 'question_text' })
  questionText: string;

  @Column({ type: 'text', name: 'help_text', nullable: true })
  helpText: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  placeholder: string | null;

  @Column({ type: 'boolean', name: 'is_required', default: false })
  isRequired: boolean;

  @Column({ type: 'int', name: 'display_order', default: 0 })
  displayOrder: number;

  @Column({ type: 'int', name: 'min_length', nullable: true })
  minLength: number | null;

  @Column({ type: 'int', name: 'max_length', nullable: true })
  maxLength: number | null;

  @Column({ type: 'text', name: 'default_value', nullable: true })
  defaultValue: string | null;

  @Column({ type: 'jsonb', nullable: true })
  config: Record<string, unknown> | null;

  /**
   * Tenant Foundation (Phase 1, Checkpoint A12) — nullable, unread by any
   * code yet. No relation/FK yet (deferred to Stage B). Tenant is
   * derivable via form_id → feedback_forms.
   */
  @Column({ type: 'uuid', name: 'tenant_id', nullable: true })
  tenantId: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => FeedbackSection, section => section.questions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'section_id' })
  section: FeedbackSection;

  @OneToMany(() => FeedbackQuestionOption, option => option.question)
  options: FeedbackQuestionOption[];

  @OneToMany(() => FeedbackQuestionCondition, condition => condition.question)
  conditions: FeedbackQuestionCondition[];
}
