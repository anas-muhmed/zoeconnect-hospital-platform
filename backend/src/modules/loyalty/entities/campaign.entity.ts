import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

export type CampaignType = 'FESTIVAL' | 'BIRTHDAY' | 'MANUAL' | 'SCHEDULED';

@Entity('campaigns')
export class Campaign {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 255 })
  name: string;

  @Column({ name: 'campaign_type', length: 50 })
  campaignType: CampaignType;

  @Column({ name: 'description', type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'start_date', type: 'timestamptz' })
  startDate: Date;

  @Column({ name: 'end_date', type: 'timestamptz' })
  endDate: Date;

  @Column({ name: 'eligible_card_codes', type: 'varchar', array: true, default: '{}' })
  eligibleCardCodes: string[];

  @Column({ name: 'earn_multiplier', type: 'numeric', precision: 5, scale: 2, default: 1 })
  earnMultiplier: number;

  @Column({ name: 'bonus_points_flat', type: 'numeric', precision: 10, scale: 2, default: 0 })
  bonusPointsFlat: number;

  @Column({ name: 'conditions', type: 'jsonb', nullable: true })
  conditions: Record<string, unknown> | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'priority', type: 'smallint', default: 0 })
  priority: number;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

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
