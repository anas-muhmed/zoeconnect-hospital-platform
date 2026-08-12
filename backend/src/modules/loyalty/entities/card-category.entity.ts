import {
  Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn,
} from 'typeorm';

/** One threshold row inside the discountThresholds JSONB array.
 *  min_value: monetary card-value in Rs. that must be reached.
 *  discount_pct: percentage discount applied to the bill amount.
 *  Keys are snake_case because TypeORM stores/reads JSONB as-is. */
export interface DiscountThreshold {
  min_value: number;
  discount_pct: number;
}

@Entity('card_categories')
export class CardCategory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 20, unique: true })
  code: string;                        // SILVER | GOLD | PLATINUM

  @Column({ length: 100 })
  name: string;

  /** Minimum lifetime spend (Rs.) to be assigned this tier */
  @Column({ name: 'min_spend', type: 'numeric', precision: 12, scale: 2 })
  minSpend: number;

  /** Maximum lifetime spend (Rs.) for this tier -- null = no upper limit */
  @Column({ name: 'max_spend', type: 'numeric', precision: 12, scale: 2, nullable: true })
  maxSpend: number | null;

  /** Points earned per Rs.100 of bill amount (e.g. 1 -> Rs.100 = 1 pt) */
  @Column({ name: 'earn_rate_per_100', type: 'numeric', precision: 5, scale: 2, default: 1 })
  earnRatePer100: number;

  /** Monetary value (Rs.) of 100 accumulated points (e.g. 25 for Silver) */
  @Column({ name: 'point_value_per_100', type: 'numeric', precision: 8, scale: 2 })
  pointValuePer100: number;

  /** Sorted discount brackets keyed by card-value (Rs.) thresholds */
  @Column({ name: 'discount_thresholds', type: 'jsonb', default: '[]' })
  discountThresholds: DiscountThreshold[];

  @Column({ name: 'base_discount_pct', type: 'numeric', precision: 5, scale: 2, nullable: true })
  baseDiscountPct: number | null;

  @Column({ name: 'display_order', type: 'smallint', default: 0 })
  displayOrder: number;

  @Column({ name: 'colour_hex', length: 7, default: '#808080' })
  colourHex: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy: string | null;

  /**
   * Tenant Foundation (Phase 1, Checkpoint A7) -- nullable, unread by any
   * code yet. No relation/FK yet (deferred to Stage B); kept here purely
   * so the entity stays in sync with the database schema. Whether card
   * categories end up tenant-owned or remain shared/global config is an
   * open architectural question, not decided by this column's presence.
   */
  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string | null;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
