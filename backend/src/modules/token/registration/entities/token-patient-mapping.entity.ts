import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { TokenRecord } from '../../entities/token-record.entity';

/**
 * TokenPatientMapping -- binds a token to an HIS patient after successful registration.
 *
 * Stage 1 (mandatory): token -> patient  (his_patient_id + mrn populated)
 * Stage 2 (optional):  token -> visit    (visit_id updated later if a visit is created)
 *
 * One mapping per token enforced by UNIQUE constraint on token_record_id.
 * The mapping is never deleted -- supervisor reset preserves it with a metadata flag.
 */
@Entity('token_patient_mapping')
export class TokenPatientMapping {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'token_record_id', type: 'uuid' })
  tokenRecordId: string;

  @ManyToOne(() => TokenRecord, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'token_record_id' })
  tokenRecord: TokenRecord;

  @Column({ name: 'token_number', length: 20 })
  tokenNumber: string;

  /** HIS patient identifier (e.g. Oracle patient PK or HIS-internal ID) */
  @Column({ name: 'his_patient_id', length: 100 })
  hisPatientId: string;

  @Column({ length: 50 })
  mrn: string;

  @Column({ name: 'patient_name', type: 'varchar', length: 200, nullable: true })
  patientName: string | null;

  /** Nullable -- populated by Stage 2 (POST /token/map/visit) */
  @Column({ name: 'visit_id', type: 'varchar', length: 100, nullable: true })
  visitId: string | null;

  @Column({ name: 'mapped_by', length: 100 })
  mappedBy: string;

  @CreateDateColumn({ name: 'mapped_at' })
  mappedAt: Date;

  /** Set when visit_id is updated (Stage 2) */
  @Column({ name: 'visit_mapped_at', type: 'timestamptz', nullable: true })
  visitMappedAt: Date | null;

  @Column({ name: 'registration_completed_at', type: 'timestamptz', default: () => 'NOW()' })
  registrationCompletedAt: Date;

  /**
   * Extensible JSONB field for future features:
   * VIP flag, loyalty tier, AI alerts, supervisor reset flag, etc.
   */
  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, unknown>;

  /**
   * Tenant Foundation (Phase 1, Checkpoint A13) — nullable, unread by any
   * code yet. No relation/FK yet (deferred to Stage B). Written by a
   * JWT-authenticated registration flow; tenant is derivable via
   * token_record_id → token_records.
   */
  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
