import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ZoeConnect Billing, Phase 1. Seeds commercial catalog metadata (price,
 * core flag, short description, category) onto the real, already-existing
 * `module_registry` rows for every code in `ALL_MODULE_CODES`
 * (license.service.ts). PLATFORM is marked `is_core = true` (always
 * included, never removable/priced-out, matching LicenseService/
 * LicenseGuard's existing treatment of it) and `is_purchasable = false`
 * (nothing to "add" -- it's implicit in every subscription).
 *
 * Prices are placeholder list prices (INR, illustrative) meant to be
 * tuned by the business; nothing downstream hardcodes them -- Phase 2's
 * SubscriptionPricingService reads these columns live, so updating a row
 * here is the only step needed to change pricing.
 *
 * Idempotent: uses UPDATE only, keyed by "code", so re-running is a no-op
 * and running against a DB where a module code doesn't exist yet
 * (e.g. a fresh, partially-migrated environment) simply updates 0 rows
 * for that code rather than failing.
 */
export class SeedModuleCatalogPricing1791000000001 implements MigrationInterface {
  name = 'SeedModuleCatalogPricing1791000000001';

  private readonly rows: Array<{
    code: string; monthly: number | null; yearly: number | null; isCore: boolean;
    isPurchasable: boolean; shortDescription: string; category: string;
  }> = [
    { code: 'PLATFORM', monthly: null, yearly: null, isCore: true, isPurchasable: false, shortDescription: 'Core infrastructure, included with every subscription', category: 'Core' },
    { code: 'LOYALTY', monthly: 1500, yearly: 15000, isCore: false, isPurchasable: true, shortDescription: 'Customer loyalty and rewards management', category: 'Customer Engagement' },
    { code: 'FORMS', monthly: 800, yearly: 8000, isCore: false, isPurchasable: true, shortDescription: 'Custom digital forms and data capture', category: 'Operations' },
    { code: 'QUEUE', monthly: 1200, yearly: 12000, isCore: false, isPurchasable: true, shortDescription: 'Queue and token management', category: 'Operations' },
    { code: 'FEEDBACK', monthly: 800, yearly: 8000, isCore: false, isPurchasable: true, shortDescription: 'Customer feedback collection and analysis', category: 'Customer Engagement' },
    { code: 'EIC', monthly: 2000, yearly: 20000, isCore: false, isPurchasable: true, shortDescription: 'Enterprise information console', category: 'Analytics' },
    { code: 'ATTENDANCE', monthly: 2500, yearly: 25000, isCore: false, isPurchasable: true, shortDescription: 'Workforce attendance and duty planning', category: 'HR & Workforce' },
    { code: 'CMS', monthly: 1200, yearly: 12000, isCore: false, isPurchasable: true, shortDescription: 'Digital signage and media management', category: 'Operations' },
    { code: 'INCIDENT', monthly: 1500, yearly: 15000, isCore: false, isPurchasable: true, shortDescription: 'Incident tracking and resolution management', category: 'Operations' },
    { code: 'CHILDRENS_VILLAGE', monthly: 3000, yearly: 30000, isCore: false, isPurchasable: true, shortDescription: 'Residential care and education management', category: 'Specialized' },
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const r of this.rows) {
      await queryRunner.query(
        `UPDATE "module_registry"
         SET "monthly_price" = $1, "yearly_price" = $2, "is_core" = $3,
             "is_purchasable" = $4, "short_description" = $5, "category" = $6
         WHERE "code" = $7`,
        [r.monthly, r.yearly, r.isCore, r.isPurchasable, r.shortDescription, r.category, r.code],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "module_registry"
      SET "monthly_price" = NULL, "yearly_price" = NULL, "is_core" = false,
          "is_purchasable" = true, "short_description" = NULL, "category" = NULL
    `);
  }
}
