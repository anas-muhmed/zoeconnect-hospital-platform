import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ZoeConnect Billing, post-Phase-6 bug fix. `ModuleCatalogService.listCatalog()`
 * (the source of `GET /billing/modules`, i.e. everything the "Available
 * Modules" section of the subscription page can possibly show) filters
 * strictly on `module_registry.is_active = true` -- and it turns out most
 * of `ALL_MODULE_CODES` (license.service.ts) were seeded with
 * `is_active = false`:
 *
 *   - seed-platform.ts inserted LOYALTY, FORMS, QUEUE, FEEDBACK, CMS with
 *     `is_active = false` from day one (pre-billing; nothing read that
 *     flag for catalog purposes back then).
 *   - 1785000000000-RegisterCmsModule.ts, 1787300000000-RegisterIncidentModule.ts,
 *     and 1790000000000-RegisterChildrensVillageModule.ts each inserted
 *     their module with `is_active = false` too.
 *   - 1791000000001-SeedModuleCatalogPricing.ts (Phase 1 of billing) gave
 *     every one of these a real price/description/category, but only ever
 *     UPDATEs those specific columns -- it never touches `is_active`, so
 *     none of that pricing work made them visible.
 *   - EIC never got a `module_registry` row at all from the automated
 *     migration path -- it only exists in the standalone,
 *     not-migration-runner-wired `seeds/patch-eic-permissions.sql`, so most
 *     environments have no EIC row whatsoever.
 *
 * Net effect: the billing catalog only ever showed PLATFORM, TOKEN, and
 * ATTENDANCE (the only ALL_MODULE_CODES entries seeded `is_active = true`),
 * silently hiding LOYALTY/FORMS/QUEUE/FEEDBACK/CMS/INCIDENT/
 * CHILDRENS_VILLAGE/EIC even though all but EIC already had real pricing
 * rows sitting in the table.
 *
 * This migration:
 *   1. Flips `is_active = true` for the modules above so they surface in
 *      the catalog (module_registry.is_active is confirmed to be a
 *      billing/catalog-only concern -- see ModuleCatalogService and
 *      SubscriptionPricingService, the only two consumers; runtime
 *      licensing/routing reads `subscription_licenses` via LicenseGuard
 *      instead and never touches this table, so this is safe).
 *   2. Inserts the EIC row if it's missing (ON CONFLICT DO NOTHING, so
 *      this is a no-op on any environment where patch-eic-permissions.sql
 *      was already run manually).
 *   3. Sets `is_active = false` for ATTENDANCE -- an explicit product
 *      decision (not a bug fix) to remove it from the purchasable catalog.
 *      Confirmed safe: is_active is never consulted for tenants who
 *      already have ATTENDANCE licensed (that's subscription_licenses'
 *      job), so this only stops it from being offered as a new purchase.
 */
export class FixModuleRegistryVisibility1791300000000 implements MigrationInterface {
  name = 'FixModuleRegistryVisibility1791300000000';

  private readonly toActivate = ['LOYALTY', 'FORMS', 'QUEUE', 'FEEDBACK', 'CMS', 'INCIDENT', 'CHILDRENS_VILLAGE'];

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "module_registry" SET "is_active" = true WHERE "code" = ANY($1)`,
      [this.toActivate],
    );

    await queryRunner.query(`
      INSERT INTO "module_registry"
        ("id","code","name","route","version","is_active","license_required","display_order","description")
      VALUES
        (gen_random_uuid(), 'EIC', 'Early Intervention Centre', '/eic', '1.0.0', true, true, 5, 'Therapy enrollment, assessments, sessions and discharge')
      ON CONFLICT ("code") DO UPDATE SET "is_active" = true
    `);

    await queryRunner.query(`UPDATE "module_registry" SET "is_active" = false WHERE "code" = 'ATTENDANCE'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "module_registry" SET "is_active" = false WHERE "code" = ANY($1)`,
      [this.toActivate],
    );
    await queryRunner.query(`UPDATE "module_registry" SET "is_active" = false WHERE "code" = 'EIC'`);
    await queryRunner.query(`UPDATE "module_registry" SET "is_active" = true WHERE "code" = 'ATTENDANCE'`);
  }
}
