import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { TokenRecord } from '../../entities/token-record.entity';

export type ReservationReleaseReason = 'MAPPED' | 'EXPIRED' | 'MANUAL_RELEASE';

/**
 * TokenReservation -- temporary lock held by a receptionist before HIS registration.
 *
 * This is a technical mechanism, NOT a business state.
 * The parent token_record.status stays CALLED (or WAITING).
 * The token simply disappears from other widgets' queue lists while
 * an active (released_at IS NULL) reservation exists.
 *
 * Uniqueness is enforced by two partial DB indexes:
 *   idx_one_reservation_per_token -- one active reservation per token
 *   idx_one_reservation_per_user  -- one active reservation per receptionist
 */
@Entity('token_reservations')
export class TokenReservation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'token_record_id', type: 'uuid' })
  tokenRecordId: string;

  @ManyToOne(() => TokenRecord, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'token_record_id' })
  tokenRecord: TokenRecord;

  @Column({ name: 'token_number', length: 20 })
  tokenNumber: string;

  /** Client-generated UUID, created at Confirm click -- identifies this reservation session */
  @Column({ name: 'reservation_id', type: 'uuid' })
  reservationId: string;

  /** Authenticated ZoeConnect user ID -- reservation owned by the person, not the browser */
  @Column({ name: 'reserved_by_user', length: 100 })
  reservedByUser: string;

  @CreateDateColumn({ name: 'reserved_at' })
  reservedAt: Date;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'last_heartbeat_at', type: 'timestamptz', default: () => 'NOW()' })
  lastHeartbeatAt: Date;

  /** Null while reservation is active */
  @Column({ name: 'released_at', type: 'timestamptz', nullable: true })
  releasedAt: Date | null;

  @Column({ name: 'release_reason', type: 'varchar', length: 30, nullable: true })
  releaseReason: ReservationReleaseReason | null;

  /**
   * Tenant Foundation (Phase 1, Checkpoint A13) — nullable, unread by any
   * code yet. No relation/FK yet (deferred to Stage B). The reservation
   * itself is created by an authenticated receptionist, but the
   * underlying token may have been anonymously issued — tenant is
   * derivable via token_record_id → token_records. Confirmed this
   * column's addition does not affect the two partial unique indexes
   * (idx_one_reservation_per_token, idx_one_reservation_per_user) backing
   * this table's concurrency guarantees.
   */
  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string | null;
}
