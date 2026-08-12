import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

export type FeedbackSubmissionStatus = 'RECEIVED' | 'REVIEWED' | 'DIVERTED_COMPLAINT';

/**
 * FeedbackSubmission --- one completed public-portal fill-out. Deliberately
 * has NO patient/HIS reference of any kind (no MRN, no patient id, nothing)
 * per the module's hard independence constraint -- `anonymousId` is a
 * random per-submission token only used to let the *same device* be
 * rate-limited / de-duplicated against a QR code, not to identify a person.
 * `overallRating` is denormalized off the answers at submit time so the
 * (future) Google Review threshold check and analytics dashboard don't need
 * to re-scan every answer row to find "the" rating question.
 */
@Entity('feedback_submissions')
export class FeedbackSubmission {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', name: 'branch_id', length: 30, nullable: true })
  branchId: string | null;

  @Column({ type: 'uuid', name: 'form_id' })
  formId: string;

  @Column({ type: 'uuid', name: 'campaign_id' })
  campaignId: string;

  @Column({ type: 'uuid', name: 'qr_code_id', nullable: true })
  qrCodeId: string | null;

  /** Random per-device token (not derived from any personal identifier) -- see FeedbackPublicService.issueAnonymousId(). */
  @Column({ type: 'varchar', name: 'anonymous_id', length: 64, nullable: true })
  anonymousId: string | null;

  @Column({ type: 'numeric', name: 'overall_rating', precision: 4, scale: 2, nullable: true })
  overallRating: number | null;

  @Column({ type: 'varchar', length: 30, default: 'RECEIVED' })
  status: FeedbackSubmissionStatus;

  @Column({ type: 'varchar', name: 'user_agent', length: 500, nullable: true })
  userAgent: string | null;

  @Column({ type: 'varchar', name: 'ip_hash', length: 128, nullable: true })
  ipHash: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  language: string | null;

  /**
   * Tenant Foundation (Phase 1, Checkpoint A12) — nullable, unread by any
   * code yet. No relation/FK yet (deferred to Stage B). Written from a
   * fully anonymous, unauthenticated public endpoint
   * (FeedbackPublicController, no @UseGuards) — Stage B cannot source
   * tenant_id from a request-scoped user/session here and must derive it
   * server-side from the resolved QR → campaign → branch chain instead
   * (see HYBRID_ARCHITECTURE_LOG.md's A12 entry).
   */
  @Column({ type: 'uuid', name: 'tenant_id', nullable: true })
  tenantId: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'submitted_at' })
  submittedAt: Date;
}
