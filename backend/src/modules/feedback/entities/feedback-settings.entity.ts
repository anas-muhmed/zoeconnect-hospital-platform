import { Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn } from 'typeorm';

/**
 * FeedbackSettings --- module-wide, admin-tunable parameters, replacing
 * the hardcoded constants scattered across the module's earlier phases
 * (submission caps, Google Review default copy, splash duration bounds,
 * complaint categories, the WhatsApp resolution template). Same
 * singleton-row pattern as CMSSettings (`cms_settings` -- see that
 * entity's doc comment): `FeedbackSettingsService` always operates on one
 * row, seeded by the migration via `INSERT ... DEFAULT VALUES`.
 *
 * `branchId` exists now, nullable, even though nothing writes a
 * branch-specific row yet -- it makes the *shape* branch-override-ready
 * (global row has `branch_id IS NULL`; a future branch row would be
 * looked up first and fall back to the global row) without having to
 * migrate the schema again later just to add the column. See
 * `FeedbackSettingsService.get()` for the actual fallback resolution.
 */
@Entity('feedback_settings')
export class FeedbackSettings {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', name: 'branch_id', length: 30, nullable: true })
  branchId: string | null;

  /**
   * Tenant Foundation (Phase 1, Checkpoint A2) — nullable, unread by any
   * code yet. No relation/FK yet (deferred to Stage B); kept here purely
   * so the entity stays in sync with the database schema.
   */
  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string | null;

  // -- Submission spam prevention (see FeedbackPublicService) -----------------------

  @Column({ type: 'int', name: 'max_submissions_per_device', default: 3 })
  maxSubmissionsPerDevice: number;

  @Column({ type: 'int', name: 'submission_limit_window_hours', default: 24 })
  submissionLimitWindowHours: number;

  @Column({ type: 'int', name: 'duplicate_submission_window_seconds', default: 30 })
  duplicateSubmissionWindowSeconds: number;

  // -- Google Review flow defaults (per-campaign settings still override these) -----

  @Column({ type: 'numeric', name: 'default_google_review_threshold', precision: 2, scale: 1, default: 4 })
  defaultGoogleReviewThreshold: number;

  @Column({ type: 'text', name: 'default_google_review_thank_you_message', nullable: true })
  defaultGoogleReviewThankYouMessage: string | null;

  @Column({ type: 'text', name: 'default_google_review_invitation_message', nullable: true })
  defaultGoogleReviewInvitationMessage: string | null;

  @Column({ type: 'text', name: 'default_thank_you_message', nullable: true })
  defaultThankYouMessage: string | null;

  // -- Splash screen defaults/bounds (see FeedbackFormController) -------------------

  @Column({ type: 'int', name: 'default_splash_duration_seconds', default: 3 })
  defaultSplashDurationSeconds: number;

  @Column({ type: 'int', name: 'min_splash_duration_seconds', default: 1 })
  minSplashDurationSeconds: number;

  @Column({ type: 'int', name: 'max_splash_duration_seconds', default: 15 })
  maxSplashDurationSeconds: number;

  // -- Complaint flow -----------------------------------------------------------------

  /** Shown as the category dropdown on the public portal's complaint opt-in screen. */
  @Column({ type: 'jsonb', name: 'complaint_categories' })
  complaintCategories: string[];

  /**
   * Meta-approved WhatsApp template name for the "your complaint was
   * resolved" patient notification -- moved here from an env var
   * (`FEEDBACK_COMPLAINT_RESOLVED_WHATSAPP_TEMPLATE`) so it's editable
   * without a redeploy. Null/empty means the notification is a no-op, same
   * as when the env var was unset -- see FeedbackComplaintService.
   */
  @Column({ type: 'varchar', name: 'complaint_resolved_whatsapp_template', length: 200, nullable: true })
  complaintResolvedWhatsappTemplate: string | null;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
