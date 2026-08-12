import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

export type SequenceReferenceType = 'LOCATION' | 'SERVICE_CENTER';

/**
 * TokenSequence --- daily token number sequence per service center or location.
 *
 * current_number is incremented atomically with:
 *   UPDATE token_sequences
 *      SET current_number = current_number + 1
 *    WHERE branch_id = $1
 *      AND reference_type = $2
 *      AND reference_id = $3
 *      AND seq_date = CURRENT_DATE
 *   RETURNING current_number;
 *
 * A row is upserted on first issue of the day.
 */
@Entity('token_sequences')
export class TokenSequence {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'branch_id', length: 30 })
  branchId: string;

  /** LOCATION or SERVICE_CENTER */
  @Column({ name: 'reference_type', length: 20 })
  referenceType: SequenceReferenceType;

  /** location.id (UUID) or service_center_id (Oracle varchar) */
  @Column({ name: 'reference_id', length: 60 })
  referenceId: string;

  @Column({ name: 'seq_date', type: 'date' })
  seqDate: string;

  @Column({ name: 'current_number', type: 'int', default: 0 })
  currentNumber: number;

  @Column({ name: 'reset_at', type: 'timestamptz', nullable: true })
  resetAt: Date | null;

  /**
   * Tenant Foundation (Phase 1, Checkpoint A13) — nullable, unread by any
   * code yet. No relation/FK yet (deferred to Stage B). NOT part of the
   * uq_token_sequences_unique constraint (branch_id, reference_type,
   * reference_id, seq_date) — confirmed during this checkpoint's
   * concurrency audit that this column addition has zero effect on the
   * atomic INSERT...ON CONFLICT...RETURNING sequence-increment primitive.
   */
  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string | null;
}
