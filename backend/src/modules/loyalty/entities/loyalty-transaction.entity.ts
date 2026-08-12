import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { LoyaltyAccount } from './loyalty-account.entity';

export type TransactionType = 'EARN' | 'REDEEM' | 'REVERSE' | 'EXPIRE' | 'ADJUST';
export type ReferenceType   = 'BILL' | 'VISIT' | 'CAMPAIGN' | 'MANUAL';

@Entity('loyalty_transactions')
export class LoyaltyTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'account_id', type: 'uuid' })
  accountId: string;

  @ManyToOne(() => LoyaltyAccount, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'account_id' })
  account: LoyaltyAccount;

  @Column({ name: 'transaction_type', type: 'varchar', length: 30 })
  transactionType: TransactionType;

  @Column({ name: 'reference_type', type: 'varchar', length: 30 })
  referenceType: ReferenceType;

  @Column({ name: 'reference_id', type: 'varchar', length: 100 })
  referenceId: string;

  @Column({ name: 'bill_amount', type: 'numeric', precision: 12, scale: 2, nullable: true })
  billAmount: number | null;

  @Column({ name: 'points_delta', type: 'numeric', precision: 12, scale: 2 })
  pointsDelta: number;                // positive = earn; negative = deduct

  @Column({ name: 'card_value_delta', type: 'numeric', precision: 10, scale: 2, default: 0 })
  cardValueDelta: number;

  @Column({ name: 'discount_applied', type: 'numeric', precision: 10, scale: 2, nullable: true })
  discountApplied: number | null;

  @Column({ name: 'discount_percentage', type: 'numeric', precision: 5, scale: 2, nullable: true })
  discountPercentage: number | null;

  @Column({ name: 'balance_before', type: 'numeric', precision: 14, scale: 2 })
  balanceBefore: number;

  @Column({ name: 'balance_after', type: 'numeric', precision: 14, scale: 2 })
  balanceAfter: number;

  @Column({ name: 'campaign_id', type: 'uuid', nullable: true })
  campaignId: string | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

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
}
