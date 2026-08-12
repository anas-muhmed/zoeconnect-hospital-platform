import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { FeedbackForm } from './feedback-form.entity';
import { FeedbackQuestion } from './feedback-question.entity';

/** FeedbackSection --- a titled group of questions within a form, ordered top-to-bottom. */
@Entity('feedback_sections')
export class FeedbackSection {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'form_id' })
  formId: string;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'int', name: 'display_order', default: 0 })
  displayOrder: number;

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

  @ManyToOne(() => FeedbackForm, form => form.sections, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'form_id' })
  form: FeedbackForm;

  @OneToMany(() => FeedbackQuestion, question => question.section)
  questions: FeedbackQuestion[];
}
