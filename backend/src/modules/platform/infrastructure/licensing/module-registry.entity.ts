import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

/**
 * TypeORM entity for the `module_registry` table, which previously existed
 * only as raw SQL (seed-platform.ts / migrations like
 * RegisterCmsModule/RegisterChildrensVillageModule/RegisterIncidentModule)
 * with no ORM-level reader anywhere in the codebase -- module metadata for
 * runtime logic instead lived in `ALL_MODULE_CODES`
 * (licensing/license.service.ts) and `ALL_MODULES`
 * (frontend/lib/api/license.api.ts).
 *
 * ZoeConnect Billing, Phase 1/2: `module_registry` is now also the module
 * PRICING catalog (see 1791000000000-AddBillingPricingToModuleRegistry.ts),
 * read live by SubscriptionPricingService and the `/billing/modules`
 * endpoint. This entity lives under platform/infrastructure/licensing (not
 * inside the billing module) because it is shared, table-owning
 * infrastructure -- both the licensing module and the billing module
 * import it via TypeOrmModule.forFeature, avoiding two competing entity
 * classes mapped to the same table.
 */
@Entity('module_registry')
export class ModuleRegistry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'code', type: 'varchar', length: 64, unique: true })
  code: string;

  @Column({ name: 'name', type: 'varchar', length: 128 })
  name: string;

  @Column({ name: 'route', type: 'varchar', length: 255, nullable: true })
  route: string | null;

  @Column({ name: 'version', type: 'varchar', length: 32, nullable: true })
  version: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'license_required', type: 'boolean', default: true })
  licenseRequired: boolean;

  @Column({ name: 'display_order', type: 'int', default: 0 })
  displayOrder: number;

  @Column({ name: 'description', type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'monthly_price', type: 'numeric', precision: 12, scale: 2, nullable: true, transformer: { to: (v: number | null) => v, from: (v: string | null) => (v === null ? null : Number(v)) } })
  monthlyPrice: number | null;

  @Column({ name: 'yearly_price', type: 'numeric', precision: 12, scale: 2, nullable: true, transformer: { to: (v: number | null) => v, from: (v: string | null) => (v === null ? null : Number(v)) } })
  yearlyPrice: number | null;

  @Column({ name: 'is_core', type: 'boolean', default: false })
  isCore: boolean;

  @Column({ name: 'is_purchasable', type: 'boolean', default: true })
  isPurchasable: boolean;

  @Column({ name: 'short_description', type: 'varchar', length: 255, nullable: true })
  shortDescription: string | null;

  @Column({ name: 'category', type: 'varchar', length: 64, nullable: true })
  category: string | null;

  @Column({ name: 'icon', type: 'varchar', length: 64, nullable: true })
  icon: string | null;

  @Column({ name: 'features', type: 'jsonb', default: () => "'[]'" })
  features: string[];
}
