import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn, Unique,
} from 'typeorm';
import { TokenLocation } from './token-location.entity';

/**
 * Represents one physical counter (seat) within a billing location.
 * Identified by (locationId, counterNumber) — e.g. Pharmacy Billing, Counter 2.
 * The counter row is auto-created the first time an operator joins it.
 */
@Entity('token_counters')
@Unique(['locationId', 'counterNumber'])
export class TokenCounter {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'location_id' })
  locationId: string;

  @ManyToOne(() => TokenLocation, (l) => l.counters, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'location_id' })
  location: TokenLocation;

  /** 1-based index within the location (1, 2, 3 ...) */
  @Column({ name: 'counter_number', type: 'int' })
  counterNumber: number;

  /** Last token called at this counter -- null = idle */
  @Column({ name: 'current_token', type: 'int', nullable: true })
  currentToken: number | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  /**
   * Tenant Foundation (Phase 1, Checkpoint A13) — nullable, unread by any
   * code yet. No relation/FK yet (deferred to Stage B). Tenant is
   * derivable via location_id → token_locations.
   */
  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
