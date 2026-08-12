import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

/** What a QR code is physically stuck to / represents (spec §4) -- purely descriptive/organizational, not a HIS reference. */
export type FeedbackQrTargetType =
  | 'HOSPITAL' | 'BRANCH' | 'DEPARTMENT' | 'PHARMACY' | 'LABORATORY'
  | 'BILLING' | 'RECEPTION' | 'DOCTOR' | 'CUSTOM';

/**
 * FeedbackQrCode --- a printable code that resolves (via its `token`) to a
 * campaign's form on the public portal. The token is the only thing ever
 * encoded in the QR image or exposed in the public URL
 * (`/feedback/f/<token>`) -- never the row's own `id`, never the campaign
 * or form id -- per the spec's hard requirement to never leak internal
 * database ids in a public-facing surface.
 */
@Entity('feedback_qr_codes')
export class FeedbackQrCode {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', name: 'branch_id', length: 30, nullable: true })
  branchId: string | null;

  @Column({ type: 'uuid', name: 'campaign_id' })
  campaignId: string;

  /** Cryptographically random (crypto.randomBytes, not a sequential id) -- see FeedbackQrService.generateToken(). */
  @Column({ type: 'varchar', length: 64, unique: true })
  token: string;

  @Column({ type: 'varchar', name: 'target_type', length: 30 })
  targetType: FeedbackQrTargetType;

  /** Free-text descriptor, e.g. a department name or doctor name -- display-only, not a HIS foreign key. */
  @Column({ type: 'varchar', name: 'target_ref', length: 150, nullable: true })
  targetRef: string | null;

  @Column({ type: 'varchar', length: 200 })
  label: string;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive: boolean;

  @Column({ type: 'timestamptz', name: 'expires_at', nullable: true })
  expiresAt: Date | null;

  @Column({ type: 'varchar', name: 'created_by', length: 100 })
  createdBy: string;

  /**
   * Tenant Foundation (Phase 1, Checkpoint A12) — nullable, unread by any
   * code yet. No relation/FK yet (deferred to Stage B); kept here purely
   * so the entity stays in sync with the database schema. NEVER exposed
   * publicly (only `token` is) — same discipline must apply to tenant_id
   * once it's load-bearing.
   */
  @Column({ type: 'uuid', name: 'tenant_id', nullable: true })
  tenantId: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
