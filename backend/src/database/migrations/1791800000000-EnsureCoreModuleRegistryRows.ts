import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Root cause of "modules missing from the Subscribe page" on environments
 * that were provisioned via `migration:run` only (never `npm run seed`):
 *
 * PLATFORM, LOYALTY, FORMS, QUEUE, FEEDBACK (and the original TOKEN row)
 * were ONLY ever INSERTed into `module_registry` by `seed-platform.ts` --
 * a manual, one-time script (`npm run seed`), never wired into the
 * automated migration chain. By contrast CMS, INCIDENT, and
 * CHILDRENS_VILLAGE each have their own dedicated migration
 * (RegisterCmsModule/RegisterIncidentModule/RegisterChildrensVillageModule)
 * that inserts their row automatically, and EIC's row is inserted directly
 * inside FixModuleRegistryVisibility1791300000000.
 *
 * Both FixModuleRegistryVisibility1791300000000 (is_active flip) and
 * SeedModuleCatalogPricing1791000000001 (pricing/category) are UPDATE-only
 * by design ("running against a DB where a module code doesn't exist yet
 * ... simply updates 0 rows for that code rather than failing" -- see that
 * migration's own doc comment) -- so on any environment where the manual
 * seed script never ran, LOYALTY/FORMS/QUEUE/FEEDBACK/PLATFORM never
 * existed at all, and every later migration touching them silently no-opped.
 * That's why they never appeared in GET /billing/modules (ModuleCatalogService
 * only ever sees rows that exist) even though the sidebar showed them fine
 * (nav gating reads permissions + trial-widened licensedModules, not
 * module_registry).
 *
 * This migration makes module_registry self-sufficient from migrations
 * alone: INSERT ... ON CONFLICT DO NOTHING for every row seed-platform.ts
 * used to be solely responsible for, with the full billing catalog
 * metadata (price/category/is_core/is_purchasable) baked directly into the
 * insert so a newly-created row doesn't need SeedModuleCatalogPricing to
 * run again afterward. On environments where seed-platform.ts already ran,
 * every INSERT is a no-op (rows already exist, PK/unique conflict) -- fully
 * idempotent either way.
 */
export class EnsureCoreModuleRegistryRows1791800000000 implements MigrationInterface {
  name = 'EnsureCoreModuleRegistryRows1791800000000';

  private readonly rows: Array<{
    code: string; name: string; route: string; displayOrder: number; description: string;
    isCore: boolean; isPurchasable: boolean; monthly: number | null; yearly: number | null;
    shortDescription: string; category: string;
  }> = [
    { code: 'PLATFORM', name: 'Platform Core', route: '/platform', displayOrder: 0, description: 'Core platform services', isCore: true, isPurchasable: false, monthly: null, yearly: null, shortDescription: 'Core infrastructure, included with every subscription', category: 'Core' },
    { code: 'LOYALTY', name: 'Patient Loyalty', route: '/loyalty', displayOrder: 1, description: 'Patient loyalty card and rewards program', isCore: false, isPurchasable: true, monthly: 1500, yearly: 15000, shortDescription: 'Customer loyalty and rewards management', category: 'Customer Engagement' },
    { code: 'FORMS', name: 'Dynamic Forms', route: '/forms', displayOrder: 2, description: 'Configurable digital forms', isCore: false, isPurchasable: true, monthly: 800, yearly: 8000, shortDescription: 'Custom digital forms and data capture', category: 'Operations' },
    { code: 'QUEUE', name: 'Queue Management', route: '/queue', displayOrder: 3, description: 'Patient queue management system', isCore: false, isPurchasable: true, monthly: 1200, yearly: 12000, shortDescription: 'Queue and token management', category: 'Operations' },
    { code: 'FEEDBACK', name: 'Patient Feedback', route: '/feedback', displayOrder: 4, description: 'Patient satisfaction surveys', isCore: false, isPurchasable: true, monthly: 800, yearly: 8000, shortDescription: 'Customer feedback collection and analysis', category: 'Customer Engagement' },
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const r of this.rows) {
      await queryRunner.query(
        `INSERT INTO "module_registry"
           ("id","code","name","route","version","is_active","license_required","display_order","description",
            "monthly_price","yearly_price","is_core","is_purchasable","short_description","category")
         VALUES
           (gen_random_uuid(), $1, $2, $3, '1.0.0', true, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT ("code") DO NOTHING`,
        [
          r.code, r.name, r.route, !r.isCore, r.displayOrder, r.description,
          r.monthly, r.yearly, r.isCore, r.isPurchasable, r.shortDescription, r.category,
        ],
      );
    }

    // Belt-and-suspenders for environments where the row already existed
    // (seed-platform.ts ran) but an earlier bug/rollback left it inactive
    // or unpriced -- re-apply both fixes unconditionally.
    await queryRunner.query(
      `UPDATE "module_registry" SET "is_active" = true WHERE "code" = ANY($1)`,
      [this.rows.map((r) => r.code)],
    );
    for (const r of this.rows) {
      await queryRunner.query(
        `UPDATE "module_registry"
         SET "monthly_price" = COALESCE("monthly_price", $1), "yearly_price" = COALESCE("yearly_price", $2),
             "is_core" = $3, "is_purchasable" = $4,
             "short_description" = COALESCE("short_description", $5), "category" = COALESCE("category", $6)
         WHERE "code" = $7`,
        [r.monthly, r.yearly, r.isCore, r.isPurchasable, r.shortDescription, r.category, r.code],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Non-destructive by design -- this migration only ever fills gaps left
    // by a script that may or may not have run; reversing it by deleting
    // rows would risk deleting real seed-platform.ts data on environments
    // where this migration's INSERTs were themselves no-ops. Intentional no-op.
  }
}
