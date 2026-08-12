import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ZoeConnect Billing, Phase 1 (Architecture & Database).
 *
 * Extends the existing `module_registry` table (see
 * `1785000000000-RegisterCmsModule.ts` and friends for the table's
 * origin) with the pricing/catalog fields the subscription pricing engine
 * needs, per the module catalog reuse requirement -- no separate
 * "subscription module catalog" table is created. `module_registry`
 * remains the single source of truth for both module metadata (name,
 * route, license_required) and now also commercial metadata
 * (monthly/yearly price, core/purchasable flags, marketing copy).
 *
 * Purely additive: all new columns are nullable or have safe defaults, so
 * every existing row (and every existing reader of this table) is
 * unaffected. Zero observable behavior change until Phase 2's pricing
 * service starts reading these columns.
 */
export class AddBillingPricingToModuleRegistry1791000000000 implements MigrationInterface {
  name = 'AddBillingPricingToModuleRegistry1791000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "module_registry"
        ADD COLUMN IF NOT EXISTS "monthly_price"     NUMERIC(12,2),
        ADD COLUMN IF NOT EXISTS "yearly_price"       NUMERIC(12,2),
        ADD COLUMN IF NOT EXISTS "is_core"            BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "is_purchasable"     BOOLEAN NOT NULL DEFAULT true,
        ADD COLUMN IF NOT EXISTS "short_description"  VARCHAR(255),
        ADD COLUMN IF NOT EXISTS "category"           VARCHAR(64),
        ADD COLUMN IF NOT EXISTS "icon"                VARCHAR(64),
        ADD COLUMN IF NOT EXISTS "features"           JSONB NOT NULL DEFAULT '[]';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "module_registry"
        DROP COLUMN IF EXISTS "monthly_price",
        DROP COLUMN IF EXISTS "yearly_price",
        DROP COLUMN IF EXISTS "is_core",
        DROP COLUMN IF EXISTS "is_purchasable",
        DROP COLUMN IF EXISTS "short_description",
        DROP COLUMN IF EXISTS "category",
        DROP COLUMN IF EXISTS "icon",
        DROP COLUMN IF EXISTS "features";
    `);
  }
}
