import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `TOKEN` ("Token Queue") is a vestigial `module_registry` row -- the live
 * Token Queue nav group (frontend layout.tsx) is actually gated on
 * `requiresModule: 'QUEUE'`, not `'TOKEN'`, and `QUEUE` ("Queue Management")
 * already has real pricing (SeedModuleCatalogPricing). `TOKEN` never got a
 * price, so it surfaced on the billing Subscribe page as an unpriced
 * "Contact sales" duplicate of QUEUE. Deactivating it (not deleting) mirrors
 * the ATTENDANCE precedent in FixModuleRegistryVisibility -- is_active is a
 * billing/catalog-only concern, so this only removes it from the
 * purchasable catalog and doesn't touch any tenant already licensed for it.
 */
export class DeactivateTokenQueueModule1791700000000 implements MigrationInterface {
  name = 'DeactivateTokenQueueModule1791700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE "module_registry" SET "is_active" = false WHERE "code" = 'TOKEN'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE "module_registry" SET "is_active" = true WHERE "code" = 'TOKEN'`);
  }
}
