import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

export type RewardType = 'DISCOUNT' | 'GIFT' | 'UPGRADE' | 'CASHBACK';

@Entity('reward_catalog')
export class RewardCatalog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 200 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'points_required', type: 'int' })
  pointsRequired: number;

  @Column({ name: 'reward_type', length: 20 })
  rewardType: RewardType;

  @Column({ name: 'value', type: 'numeric', precision: 10, scale: 2, nullable: true })
  value: number | null;            // discount %, cashback Rs., etc.

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'stock_qty', type: 'int', nullable: true })
  stockQty: number | null;         // null = unlimited

  /**
   * Tenant Foundation (Phase 1, Checkpoint A7) -- nullable, unread by any
   * code yet. No relation/FK yet (deferred to Stage B); kept here purely
   * so the entity stays in sync with the database schema. Whether the
   * reward catalog ends up tenant-owned or remains shared/global is an
   * open architectural question, not decided by this column's presence.
   */
  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
