import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  ManyToOne, JoinColumn,
} from 'typeorm';
import { TokenCounter } from './token-counter.entity';

export type TokenCallAction =
  | 'CALLED' | 'RECALLED' | 'TRANSFERRED' | 'HELD'
  | 'SKIPPED' | 'COMPLETED' | 'CANCELLED' | 'MISSED' | 'REISSUED';

/**
 * Audit trail for every operator action on a token.
 *
 * Legacy columns (counter_id, token_number, called_by, called_at) are kept
 * for backward compatibility with existing data and the legacy WS call path.
 *
 * New columns (added by GAP-3 migration):
 *   token_record_id - links to token_records for post-GAP-1 tokens
 *   action          - what the operator did
 *   from_counter_id / to_counter_id - for TRANSFERRED actions
 *   performed_by    - populated for new-style inserts (matches called_by for CALLED)
 *   performed_at    - populated for new-style inserts (matches called_at for CALLED)
 *   notes           - optional free-text
 */
@Entity('token_calls')
export class TokenCall {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // -- Legacy columns (unchanged) --------------------------------------------

  @ManyToOne(() => TokenCounter, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'counter_id' })
  counter: TokenCounter;

  @Column({ name: 'counter_id' })
  counterId: string;

  @Column({ name: 'token_number', type: 'int' })
  tokenNumber: number;

  @Column({ name: 'called_by', type: 'uuid' })
  calledBy: string;

  @CreateDateColumn({ name: 'called_at' })
  calledAt: Date;

  // -- New audit columns (nullable - added by GAP-3 migration) ---------------

  /** FK to token_records - present for tokens issued after GAP-1 fix */
  @Column({ name: 'token_record_id', type: 'uuid', nullable: true })
  tokenRecordId: string | null;

  /** The operator action that generated this log entry */
  @Column({ name: 'action', type: 'varchar', length: 20, nullable: true })
  action: TokenCallAction | null;

  /** Source counter UUID for TRANSFERRED actions */
  @Column({ name: 'from_counter_id', type: 'uuid', nullable: true })
  fromCounterId: string | null;

  /** Destination counter UUID for TRANSFERRED actions */
  @Column({ name: 'to_counter_id', type: 'uuid', nullable: true })
  toCounterId: string | null;

  /** Operator user id - mirrors called_by for CALLED, set for all new actions */
  @Column({ name: 'performed_by', type: 'varchar', length: 100, nullable: true })
  performedBy: string | null;

  /** Action timestamp - mirrors called_at for CALLED, set for all new actions */
  @Column({ name: 'performed_at', type: 'timestamptz', nullable: true })
  performedAt: Date | null;

  @Column({ name: 'notes', type: 'text', nullable: true })
  notes: string | null;

  /**
   * Tenant Foundation (Phase 1, Checkpoint A13) — nullable, unread by any
   * code yet. No relation/FK yet (deferred to Stage B). Tenant is
   * derivable via counter_id → token_counters → token_locations.
   */
  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string | null;
}
