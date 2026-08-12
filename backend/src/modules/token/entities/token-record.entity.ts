import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { TokenCounter } from './token-counter.entity';
import { TokenKiosk } from './token-kiosk.entity';

export type TokenType   = 'WALK_IN' | 'VIP' | 'APPOINTMENT' | 'EMERGENCY' | 'ONLINE';
export type TokenStatus =
  | 'WAITING' | 'CALLED' | 'SERVING' | 'COMPLETED'
  | 'MISSED'  | 'CANCELLED' | 'ON_HOLD' | 'RECALLED'
  | 'SKIPPED' | 'REISSUED' | 'REGISTERED';
export type RecordReferenceType = 'LOCATION' | 'SERVICE_CENTER';

/**
 * TokenRecord --- every token ever issued.
 *
 * This is the central fact table. Replaces the ephemeral Redis-only approach.
 * All analytics, audit, and display data is derived from this table.
 *
 * State machine:
 *   WAITING --- CALLED --- SERVING --- COMPLETED
 *   WAITING --- ON_HOLD --- WAITING (re-queued, priority downgraded)
 *   WAITING --- CANCELLED | SKIPPED
 *   CALLED  --- MISSED (no-show)
 *   MISSED  --- RECALLED --- CALLED
 *   * --- REISSUED (new TokenRecord created, this one marked REISSUED)
 */
@Entity('token_records')
export class TokenRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'branch_id', length: 30 })
  branchId: string;

  /** LOCATION or SERVICE_CENTER */
  @Column({ name: 'reference_type', length: 20 })
  referenceType: RecordReferenceType;

  /** location.id (UUID string) or service_center_id (Oracle varchar) */
  @Column({ name: 'reference_id', length: 60 })
  referenceId: string;

  @Column({ name: 'token_number', type: 'int' })
  tokenNumber: number;

  /** Configured prefix for this location/SC on this day (e.g. "R") */
  @Column({ name: 'token_prefix', length: 10, default: '' })
  tokenPrefix: string;

  /** Formatted display token, e.g. "R-042" */
  @Column({ name: 'full_token', length: 20 })
  fullToken: string;

  @Column({ name: 'token_type', length: 20, default: 'WALK_IN' })
  tokenType: TokenType;

  /** Lower = higher priority. EMERGENCY=10, APPOINTMENT=30, VIP=50, WALK_IN=100 */
  @Column({ type: 'int', default: 100 })
  priority: number;

  @Column({ length: 20, default: 'WAITING' })
  status: TokenStatus;

  @Column({ name: 'counter_id', type: 'uuid', nullable: true })
  counterId: string | null;

  @ManyToOne(() => TokenCounter, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'counter_id' })
  counter: TokenCounter | null;

  @Column({ name: 'kiosk_id', type: 'uuid', nullable: true })
  kioskId: string | null;

  @ManyToOne(() => TokenKiosk, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'kiosk_id' })
  kiosk: TokenKiosk | null;

  /** HIS appointment reference, if issued for an appointment */
  @Column({ type: 'varchar', name: 'appointment_id', length: 100, nullable: true })
  appointmentId: string | null;

  @Column({ type: 'varchar', name: 'called_by', length: 100, nullable: true })
  calledBy: string | null;

  @Column({ name: 'called_at', type: 'timestamptz', nullable: true })
  calledAt: Date | null;

  @Column({ name: 'served_at', type: 'timestamptz', nullable: true })
  servedAt: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @Column({ name: 'estimated_wait_seconds', type: 'int', nullable: true })
  estimatedWaitSeconds: number | null;

  @Column({ name: 'issued_at', type: 'timestamptz', default: () => 'NOW()' })
  issuedAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  // -- Reissue tracking -----------------------------------------------------

  @Column({ name: 'reissued_from_id', type: 'uuid', nullable: true })
  reissuedFromId: string | null;

  @Column({ name: 'reissued_to_id', type: 'uuid', nullable: true })
  reissuedToId: string | null;

  // -- Registration tracking (added by migration 1751800000001) -------------

  /** Set when this token is mapped to an HIS patient via the registration widget */
  @Column({ name: 'registered_at', type: 'timestamptz', nullable: true })
  registeredAt: Date | null;

  /** Authenticated ZoeConnect username/id of the receptionist who completed registration */
  @Column({ name: 'registration_user', type: 'varchar', length: 100, nullable: true })
  registrationUser: string | null;

  /** Set when a supervisor manually resets this token's status (e.g. after a stuck mapping) */
  @Column({ name: 'supervisor_reset_at', type: 'timestamptz', nullable: true })
  supervisorResetAt: Date | null;

  @Column({ name: 'supervisor_reset_by', type: 'varchar', length: 100, nullable: true })
  supervisorResetBy: string | null;

  @Column({ name: 'supervisor_reset_note', type: 'text', nullable: true })
  supervisorResetNote: string | null;

  /**
   * Tenant Foundation (Phase 1, Checkpoint A13) — nullable, unread by any
   * code yet. No relation/FK yet (deferred to Stage B). The central fact
   * table of the module and its highest-volume table — written by
   * unauthenticated kiosk/workstation issue paths with no request-scoped
   * session, so Stage B must derive tenant_id server-side from the
   * resolved location/kiosk chain, never from client input (same
   * chain-derived pattern as A12's public feedback submissions; see
   * HYBRID_ARCHITECTURE_LOG.md's A13 entry).
   */
  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string | null;
}
