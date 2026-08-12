import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { FeedbackFormStatus } from './feedback-question-type.enum';
import { FeedbackSection } from './feedback-section.entity';

/**
 * FeedbackForm --- Patient Feedback & Experience Management, Phase 1
 * (Foundation: Form Builder). A dynamic, versionless-for-now questionnaire
 * (Google-Forms-style: General Info > Sections > Questions), completely
 * independent of HIS/patient-lookup per the module's hard constraint -- a
 * form never references a patient record, only a branch.
 *
 * Later phases attach to this without touching it: QR codes/campaigns point
 * at a form by id, submissions reference a form + published snapshot of its
 * structure (mirroring how CMSPublishVersion snapshots a playlist), and
 * settings/complaints/analytics all read from submissions, never from the
 * form definition directly.
 */
@Entity('feedback_forms')
export class FeedbackForm {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', name: 'branch_id', length: 30, nullable: true })
  branchId: string | null;

  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  /** BCP-47-ish language tag for this form's authored text (e.g. 'en', 'ar'). Full
   *  per-string translation (feedback_languages) is a later phase -- see module memory. */
  @Column({ type: 'varchar', length: 10, default: 'en' })
  language: string;

  @Column({ type: 'varchar', length: 20, default: 'DRAFT' })
  status: FeedbackFormStatus;

  @Column({ type: 'timestamptz', name: 'published_at', nullable: true })
  publishedAt: Date | null;

  @Column({ type: 'varchar', name: 'created_by', length: 100 })
  createdBy: string;

  @Column({ type: 'varchar', name: 'updated_by', length: 100, nullable: true })
  updatedBy: string | null;

  /**
   * Optional hospital branding shown above the form's own title on the
   * public portal -- a relative `/uploads/feedback-media/...` URL, same
   * static-serving pattern as CMS media (see main.ts). `headerImageType`
   * drives layout only (LOGO = small, centered; BANNER = full-width hero
   * image); both are nullable together since a form may have no header at
   * all. Deliberately mutable even on a PUBLISHED form (see
   * FeedbackFormService.setHeaderImage) -- swapping a logo doesn't change
   * what a question means, unlike structural edits, so it's exempt from the
   * "published forms are frozen" rule.
   */
  @Column({ type: 'varchar', name: 'header_image_url', length: 500, nullable: true })
  headerImageUrl: string | null;

  @Column({ type: 'varchar', name: 'header_image_type', length: 20, nullable: true })
  headerImageType: 'LOGO' | 'BANNER' | null;

  /**
   * Optional full-screen splash image shown for `splashDurationSeconds`
   * (or until tapped) before the form itself appears on the public portal
   * -- a hospital welcome/branding screen, distinct from `headerImageUrl`
   * which stays visible alongside the form content. Same
   * `/uploads/feedback-media/...` storage as the header image. Null url
   * means "no splash screen, go straight to the form". Like the header
   * image, deliberately mutable even on a PUBLISHED form -- see
   * FeedbackFormService.setSplashImage.
   */
  @Column({ type: 'varchar', name: 'splash_image_url', length: 500, nullable: true })
  splashImageUrl: string | null;

  @Column({ type: 'int', name: 'splash_duration_seconds', nullable: true })
  splashDurationSeconds: number | null;

  /**
   * Tenant Foundation (Phase 1, Checkpoint A12) — nullable, unread by any
   * code yet. No relation/FK yet (deferred to Stage B); kept here purely
   * so the entity stays in sync with the database schema. Root entity for
   * the module's ownership chain (sections/questions/campaigns/submissions
   * all derive tenant via a join back to this table).
   */
  @Column({ type: 'uuid', name: 'tenant_id', nullable: true })
  tenantId: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => FeedbackSection, section => section.form)
  sections: FeedbackSection[];
}
