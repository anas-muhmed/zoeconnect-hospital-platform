import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn,
} from 'typeorm';
import { LoyaltyAccount } from './loyalty-account.entity';
import { RewardCatalog } from './reward-catalog.entity';

export type RedemptionStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'FULFILLED';

@Entity('reward_redemptions')
export class RewardRedemption {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'account_id', type: 'uuid' })
  accountId: string;

  @ManyToOne(() => LoyaltyAccount, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'account_id' })
  account: LoyaltyAccount;

  @Column({ name: 'reward_id', type: 'uuid' })
  rewardId: string;

  @ManyToOne(() => RewardCatalog, { eager: true })
  @JoinColumn({ name: 'reward_id' })
  reward: RewardCatalog;

  @Column({ name: 'points_used', type: 'int' })
  pointsUsed: number;

  @Column({ name: 'status', length: 20, default: 'PENDING' })
  status: RedemptionStatus;

  @Column({ name: 'processed_by', type: 'uuid', nullable: true })
  processedBy: string | null;

  @Column({ name: 'notes', type: 'text', nullable: true })
  notes: string | null;

  /**
   * Tenant Foundation (Phase 1, Checkpoint A7) -- nullable, unread by any
   * code yet. No relation/FK yet (deferred to Stage B); kept here purely
   * so the entity stays in sync with the database schema.
   */
  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
