import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Final E2E validation pass finding: `1798000000000-RegisterMortuaryModule`,
 * `1798100000000-RegisterDrugIndentingModule`, and
 * `1798200000000-RegisterLifeGenXModule` all seeded their `module_registry`
 * row with `is_active = false` — the exact same mistake
 * `1791300000000-FixModuleRegistryVisibility` already fixed for
 * LOYALTY/FORMS/QUEUE/FEEDBACK/CMS/INCIDENT/CHILDRENS_VILLAGE. Per that
 * migration's own doc comment, `is_active` is a billing/catalog-only
 * concern (`ModuleCatalogService.listCatalog()`, the source of
 * `GET /billing/modules`) — runtime licensing/routing reads
 * `subscription_licenses` via `LicenseGuard` and never touches this table,
 * so this did not block the frontend integration work itself. It does mean
 * these three modules were silently invisible in the purchasable module
 * catalog. Fixed the same way, for the same reason.
 */
export class ActivateMortuaryDrugIndentingLifeGenXCatalog1798300000000 implements MigrationInterface {
  name = 'ActivateMortuaryDrugIndentingLifeGenXCatalog1798300000000';

  private readonly toActivate = ['MORTUARY', 'DRUG_INDENTING', 'LIFEGENX'];

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "module_registry" SET "is_active" = true WHERE "code" = ANY($1)`,
      [this.toActivate],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "module_registry" SET "is_active" = false WHERE "code" = ANY($1)`,
      [this.toActivate],
    );
  }
}
