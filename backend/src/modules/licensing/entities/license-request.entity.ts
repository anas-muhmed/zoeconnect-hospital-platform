import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

export type LicenseRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'REVOKED' | 'CANCELLED';

@Entity('license_requests')
export class LicenseRequestEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** ID assigned by the vendor platform after the request is received */
  @Column({ name: 'vendor_request_id', type: 'varchar', length: 128, nullable: true })
  vendorRequestId: string | null;

  /**
   * Tenant Foundation (Phase 1, Checkpoint A3) — nullable, unread by any
   * code yet. No relation/FK yet (deferred to Stage B); kept here purely
   * so the entity stays in sync with the database schema.
   */
  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string | null;

  /** Modules the hospital requested, e.g. ['LOYALTY','QUEUE'] */
  @Column({ name: 'requested_modules', type: 'jsonb', default: [] })
  requestedModules: string[];

  /** Free-text remarks from the hospital admin */
  @Column({ name: 'remarks', type: 'text', nullable: true })
  remarks: string | null;

  @Column({ name: 'status', type: 'varchar', length: 32, default: 'PENDING' })
  status: LicenseRequestStatus;

  /** Populated when vendor rejects */
  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason: string | null;

  @CreateDateColumn({ name: 'submitted_at' })
  submittedAt: Date;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
