import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  ManyToOne, JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export type PasswordResetRequestType = 'EMPLOYEE_TO_SUPERADMIN' | 'SUPERADMIN_TO_VENDOR';
export type PasswordResetRequestStatus = 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'COMPLETED';

@Entity('password_reset_requests')
export class PasswordResetRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'request_type', type: 'enum', enum: ['EMPLOYEE_TO_SUPERADMIN', 'SUPERADMIN_TO_VENDOR'] })
  requestType: PasswordResetRequestType;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, { eager: false })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'username', length: 100 })
  username: string;

  /**
   * Tenant Foundation (Phase 1, Checkpoint A4) — nullable, unread by any
   * code yet. No relation/FK yet (deferred to Stage B); kept here purely
   * so the entity stays in sync with the database schema.
   */
  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string | null;

  @Column({ name: 'requested_by_ip', length: 100, default: '' })
  requestedByIp: string;

  @Column({ name: 'requested_user_agent', type: 'text', default: '' })
  requestedUserAgent: string;

  @Column({ name: 'reason', type: 'text', nullable: true })
  reason: string | null;

  @Column({
    name: 'status',
    type: 'enum',
    enum: ['REQUESTED', 'APPROVED', 'REJECTED', 'EXPIRED', 'COMPLETED'],
    default: 'REQUESTED',
  })
  status: PasswordResetRequestStatus;

  @Column({ name: 'attempt_count', type: 'smallint', default: 1 })
  attemptCount: number;

  @Column({ name: 'reviewed_by', type: 'uuid', nullable: true })
  reviewedBy: string | null;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt: Date | null;

  @Column({ name: 'approval_note', type: 'text', nullable: true })
  approvalNote: string | null;

  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason: string | null;

  @Column({ name: 'vendor_request_id', type: 'varchar', length: 255, nullable: true })
  vendorRequestId: string | null;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @CreateDateColumn({ name: 'requested_at' })
  requestedAt: Date;
}
