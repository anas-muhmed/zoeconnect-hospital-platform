import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

/**
 * FeedbackCampaign --- a named purpose for collecting feedback (spec §14:
 * "Reception Survey", "Laboratory Survey", "Pharmacy Survey", "Billing
 * Survey", "Doctor Feedback"), each bound to exactly one form. QR codes
 * point at a campaign, never directly at a form -- this is the one level
 * of indirection that lets an admin swap which form a QR resolves to
 * (e.g. seasonal form update) without reprinting/regenerating the QR.
 */
@Entity('feedback_campaigns')
export class FeedbackCampaign {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', name: 'branch_id', length: 30, nullable: true })
  branchId: string | null;

  @Column({ type: 'uuid', name: 'form_id' })
  formId: string;

  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive: boolean;

  // -- Google Review flow (post-submission redirect for high ratings) --------------
  // Scoped to the campaign, not the form: the same form can be reused by several
  // campaigns (e.g. different branches/counters), each of which may want to point
  // at a different Google Business listing. Deliberately just a URL + threshold +
  // two editable message strings -- no review text is ever sent to Google
  // automatically; the patient always submits it themselves (see
  // FeedbackPublicService.submit's doc comment on `showGoogleReview`).

  @Column({ type: 'boolean', name: 'google_review_enabled', default: false })
  googleReviewEnabled: boolean;

  @Column({ type: 'varchar', name: 'google_review_url', length: 500, nullable: true })
  googleReviewUrl: string | null;

  @Column({ type: 'numeric', name: 'google_review_threshold', precision: 2, scale: 1, default: 4 })
  googleReviewThreshold: number;

  @Column({ type: 'text', name: 'google_review_thank_you_message', nullable: true })
  googleReviewThankYouMessage: string | null;

  @Column({ type: 'text', name: 'google_review_invitation_message', nullable: true })
  googleReviewInvitationMessage: string | null;

  @Column({ type: 'varchar', name: 'created_by', length: 100 })
  createdBy: string;

  /**
   * Tenant Foundation (Phase 1, Checkpoint A12) — nullable, unread by any
   * code yet. No relation/FK yet (deferred to Stage B); kept here purely
   * so the entity stays in sync with the database schema.
   */
  @Column({ type: 'uuid', name: 'tenant_id', nullable: true })
  tenantId: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
