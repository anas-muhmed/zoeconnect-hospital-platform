import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  ManyToOne, JoinColumn,
} from 'typeorm';
import { TokenRecord } from '../../entities/token-record.entity';
import { TokenPatientMapping } from './token-patient-mapping.entity';

export type MappingEventType =
  | 'RESERVATION_CREATED'
  | 'RESERVATION_HEARTBEAT'
  | 'RESERVATION_RELEASED'
  | 'RESERVATION_EXPIRED'
  | 'PATIENT_MAPPED'
  | 'VISIT_MAPPED'
  | 'SUPERVISOR_RESET'
  | 'MAPPING_FAILED';

/**
 * MappingAuditLog -- immutable append-only record of every event
 * in the patient mapping lifecycle.
 *
 * Rules:
 *   - Never update or delete rows
 *   - Every state change produces an entry
 *   - actor is always set (user ID or 'system' for expiry sweeps)
 */
@Entity('mapping_audit_log')
export class MappingAuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'token_record_id', type: 'uuid', nullable: true })
  tokenRecordId: string | null;

  @ManyToOne(() => TokenRecord, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'token_record_id' })
  tokenRecord: TokenRecord | null;

  @Column({ name: 'mapping_id', type: 'uuid', nullable: true })
  mappingId: string | null;

  @ManyToOne(() => TokenPatientMapping, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'mapping_id' })
  mapping: TokenPatientMapping | null;

  @Column({ name: 'event_type', type: 'varchar', length: 60 })
  eventType: MappingEventType;

  @Column({ name: 'old_status', type: 'varchar', length: 30, nullable: true })
  oldStatus: string | null;

  @Column({ name: 'new_status', type: 'varchar', length: 30, nullable: true })
  newStatus: string | null;

  @Column({ length: 100 })
  actor: string;

  @Column({ name: 'ip_address', type: 'inet', nullable: true })
  ipAddress: string | null;

  @Column({ type: 'jsonb', default: {} })
  payload: Record<string, unknown>;

  /**
   * Tenant Foundation (Phase 1, Checkpoint A13) — nullable, unread by any
   * code yet. No relation/FK yet (deferred to Stage B). Tenant is
   * derivable via token_record_id → token_records where present; some
   * events (expiry sweeps, actor='system') have no authenticated actor,
   * mirroring the same server-side-derivation requirement as
   * TokenRecord/TokenReservation.
   */
  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
