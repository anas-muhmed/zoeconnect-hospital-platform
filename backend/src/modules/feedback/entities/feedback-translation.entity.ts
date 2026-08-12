import { Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn } from 'typeorm';

export type FeedbackTranslatableEntityType = 'FORM' | 'SECTION' | 'QUESTION' | 'OPTION';

/**
 * FeedbackTranslation --- a single generic (entity, field, language) ->
 * text row. Deliberately EAV-style rather than a dedicated translations
 * table per entity (form_translations, section_translations, ...): the
 * set of translatable fields is small and stable (name/description,
 * title/description, questionText/helpText/placeholder, label) and a
 * generic table means adding a translatable field to any entity later
 * needs zero schema changes -- same tradeoff FeedbackAnswer made using a
 * single jsonb `value` column instead of per-type answer tables.
 *
 * `formId` is denormalized onto every row (also derivable by walking
 * section/question up to its form) purely so "get every translation for
 * this form in language X" -- the actual public-portal query -- doesn't
 * need a join through sections/questions/options.
 */
@Entity('feedback_translations')
export class FeedbackTranslation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'form_id' })
  formId: string;

  @Column({ type: 'varchar', name: 'entity_type', length: 20 })
  entityType: FeedbackTranslatableEntityType;

  /** The section/question/option id -- or the form's own id when entityType is 'FORM'. */
  @Column({ type: 'uuid', name: 'entity_id' })
  entityId: string;

  /** e.g. 'name', 'description', 'title', 'questionText', 'helpText', 'placeholder', 'label' */
  @Column({ type: 'varchar', name: 'field_name', length: 50 })
  fieldName: string;

  @Column({ type: 'varchar', name: 'language_code', length: 10 })
  languageCode: string;

  @Column({ type: 'text' })
  value: string;

  /**
   * Tenant Foundation (Phase 1, Checkpoint A12) — nullable, unread by any
   * code yet. No relation/FK yet (deferred to Stage B). Tenant is
   * derivable via form_id → feedback_forms.
   */
  @Column({ type: 'uuid', name: 'tenant_id', nullable: true })
  tenantId: string | null;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
