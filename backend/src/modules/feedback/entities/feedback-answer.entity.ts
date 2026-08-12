import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

/**
 * FeedbackAnswer --- one question's answer within a submission. Value is
 * stored in a single jsonb column rather than typed columns (answer_text,
 * answer_number, ...) because the 17 question types need genuinely
 * different shapes (a single string, a number, an array of selected
 * option values, a file reference) and a jsonb value keeps the read/write
 * path uniform across all of them instead of a wide sparse table.
 */
@Entity('feedback_answers')
export class FeedbackAnswer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'submission_id' })
  submissionId: string;

  @Column({ type: 'uuid', name: 'question_id' })
  questionId: string;

  /** Denormalized so the question can be deleted/edited later without losing what was actually asked. */
  @Column({ type: 'text', name: 'question_text_snapshot' })
  questionTextSnapshot: string;

  @Column({ type: 'varchar', name: 'question_type', length: 30 })
  questionType: string;

  /**
   * Raw stored value -- for option-based question types (RADIO, CHECKBOX,
   * DROPDOWN, MULTI_SELECT) this is the option's internal `value` (e.g. a
   * short code like "C"), NOT the human-readable label the patient actually
   * saw and picked ("Cafeteria"). Builders are free to set `value` to
   * anything (a code, an id, ...) independent of `label`, so this alone
   * isn't fit for display -- see `displayValue`. Nullable: an optional
   * (non-required) question left blank submits `null` -- not every
   * question a patient sees gets answered, and that's meant to be
   * representable (distinct from the row not existing at all, which would
   * lose the fact the question was shown but skipped).
   */
  @Column({ type: 'jsonb', name: 'value', nullable: true })
  value: unknown;

  /**
   * Human-readable rendering of `value`, computed once at submission time
   * (see FeedbackPublicService.submit) by resolving option value(s) to
   * their label(s) against the live question. Snapshotted rather than
   * resolved on read so a submission still displays correctly even if the
   * question's options are later renamed or deleted. Nullable so older
   * submissions written before this column existed fall back to rendering
   * `value` directly (see the admin Responses page).
   */
  @Column({ type: 'text', name: 'display_value', nullable: true })
  displayValue: string | null;

  /**
   * Tenant Foundation (Phase 1, Checkpoint A12) — nullable, unread by any
   * code yet. No relation/FK yet (deferred to Stage B). Written from the
   * same anonymous public endpoint as FeedbackSubmission (no auth
   * context) — tenant_id must be derived server-side, not sourced from a
   * request-scoped session (see HYBRID_ARCHITECTURE_LOG.md's A12 entry).
   * Tenant is derivable via submission_id → feedback_submissions.
   */
  @Column({ type: 'uuid', name: 'tenant_id', nullable: true })
  tenantId: string | null;
}
