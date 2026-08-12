import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export type FeedbackComplaintStatus = 'NEW' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';

/**
 * FeedbackComplaint --- the "complaint/suggestion flow" the Google Review
 * flow's spec deferred to "a later phase" (see FeedbackPublicService's doc
 * comment on `_buildPostSubmitResponse`). Created only when a patient
 * *opts in* on the public portal after a low-rated submission -- the
 * portal always offers a "No thanks" skip, this table only has a row when
 * someone actually chose to say more.
 *
 * Deliberately tied to a `submissionId` (not a bare standalone complaint
 * form) so admins reviewing a complaint can see exactly which answers
 * prompted it. Like every other Feedback entity, no patient/HIS reference
 * -- contact info is optional and freely typed by the patient themselves,
 * purely so staff can follow up if offered, never cross-referenced against
 * any patient record.
 */
@Entity('feedback_complaints')
export class FeedbackComplaint {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', name: 'branch_id', length: 30, nullable: true })
  branchId: string | null;

  @Column({ type: 'uuid', name: 'submission_id' })
  submissionId: string;

  @Column({ type: 'uuid', name: 'form_id' })
  formId: string;

  @Column({ type: 'uuid', name: 'campaign_id' })
  campaignId: string;

  @Column({ type: 'varchar', length: 60 })
  category: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'varchar', name: 'contact_name', length: 150, nullable: true })
  contactName: string | null;

  @Column({ type: 'varchar', name: 'contact_phone', length: 30, nullable: true })
  contactPhone: string | null;

  @Column({ type: 'varchar', name: 'contact_email', length: 200, nullable: true })
  contactEmail: string | null;

  @Column({ type: 'varchar', length: 20, default: 'NEW' })
  status: FeedbackComplaintStatus;

  @Column({ type: 'varchar', name: 'assigned_to', length: 100, nullable: true })
  assignedTo: string | null;

  @Column({ type: 'text', name: 'resolution_notes', nullable: true })
  resolutionNotes: string | null;

  @Column({ type: 'timestamptz', name: 'resolved_at', nullable: true })
  resolvedAt: Date | null;

  /**
   * Tenant Foundation (Phase 1, Checkpoint A12) — nullable, unread by any
   * code yet. No relation/FK yet (deferred to Stage B). The initial
   * public-opt-in create path (FeedbackPublicController, no auth context)
   * must derive tenant_id server-side from the resolved submission/
   * campaign chain, same as FeedbackSubmission/FeedbackAnswer — the
   * admin update() path is authenticated and unaffected.
   */
  @Column({ type: 'uuid', name: 'tenant_id', nullable: true })
  tenantId: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
