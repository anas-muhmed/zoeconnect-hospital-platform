import {
  Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn,
} from 'typeorm';

/**
 * Mortuary integration (Phase 2, Stage A).
 *
 * Ports the original `system_settings` table (one row per hospital,
 * enforced by a unique constraint on `hospital_id` in the source schema —
 * preserved here as `unique: true` on `tenantId`). Billing/pricing
 * calculation logic that reads these fields (Stage C) is unchanged;
 * only the storage shape (tenant-scoped TypeORM entity vs. raw-SQL row)
 * changes.
 *
 * Note: the source schema had BOTH `hospitals.logo` and
 * `system_settings.mortuary_logo` as separate columns — an apparent
 * pre-existing duplication in zoe-platform, not something introduced by
 * this port. Preserved as-is (see `mortuaryLogoObjectKey` here vs.
 * `logoObjectKey` on `MortuaryHospitalProfile`) rather than silently
 * resolved, since which one the UI/business actually treats as
 * authoritative wasn't established from the code alone — flag for
 * Stage C when the settings controller is ported.
 */
@Entity('mortuary_system_settings')
export class MortuarySystemSettings {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid', unique: true })
  tenantId: string;

  @Column({ name: 'mortuary_name', type: 'varchar', length: 255, default: 'MOSC Medical College Mortuary', nullable: true })
  mortuaryName: string | null;

  /** Object-repository storage key (Stage E). See class doc re: duplication with MortuaryHospitalProfile.logoObjectKey. */
  @Column({ name: 'mortuary_logo_object_key', type: 'text', nullable: true })
  mortuaryLogoObjectKey: string | null;

  @Column({ name: 'first_day_charge', type: 'numeric', precision: 10, scale: 2, default: 2100.0 })
  firstDayCharge: string;

  @Column({ name: 'hourly_charge_after_24hrs', type: 'numeric', precision: 10, scale: 2, default: 130.0 })
  hourlyChargeAfter24hrs: string;

  @Column({
    name: 'pricing_model',
    type: 'enum',
    enum: ['tiered_flat_hourly', 'flat_daily', 'free'],
    default: 'tiered_flat_hourly',
  })
  pricingModel: 'tiered_flat_hourly' | 'flat_daily' | 'free';

  @Column({ name: 'daily_rate', type: 'numeric', precision: 10, scale: 2, default: 500.0, nullable: true })
  dailyRate: string | null;

  @Column({ name: 'staff_discount_percent', type: 'numeric', precision: 5, scale: 2, default: 100 })
  staffDiscountPercent: string;

  /** Free-text label of who last changed settings, ported as-is from the source column (not a FK). */
  @Column({ name: 'updated_by', type: 'varchar', length: 255, nullable: true })
  updatedBy: string | null;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
