import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tenant Foundation (Phase 1 — Hybrid Architecture roadmap, Checkpoint A3).
 *
 * Adds a nullable `tenant_id` to the licensing/HIS-config tables
 * (license_master, license_requests, vendor_registrations,
 * his_schema_configs) and backfills every existing row to the seeded
 * 'default' tenant, looked up by `code` (see Checkpoint A1/A2).
 *
 * Not NOT NULL, not a foreign key — deferred to Stage B. Raw-SQL review
 * (see chat record) confirmed no runtime SELECT statements against any
 * of these four tables would be affected by the added column; the only
 * consumers are TypeORM repository/query-builder calls, all of which are
 * either UPDATE/DELETE operations or default entity-column SELECTs that
 * simply gain one more, currently-unread column.
 */
export class AddTenantIdToLicensingTables1783730000000 implements MigrationInterface {
  name = 'AddTenantIdToLicensingTables1783730000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const tables = ['license_master', 'license_requests', 'vendor_registrations', 'his_schema_configs'];

    for (const table of tables) {
      await queryRunner.query(`ALTER TABLE "${table}" ADD COLUMN "tenant_id" UUID;`);
      await queryRunner.query(`
        UPDATE "${table}"
        SET "tenant_id" = (SELECT "id" FROM "tenant" WHERE "code" = 'default')
        WHERE "tenant_id" IS NULL;
      `);
      await queryRunner.query(
        `CREATE INDEX "IDX_${table}_tenant_id" ON "${table}" ("tenant_id");`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const tables = ['license_master', 'license_requests', 'vendor_registrations', 'his_schema_configs'];

    for (const table of tables) {
      await queryRunner.query(`DROP INDEX "IDX_${table}_tenant_id";`);
      await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN "tenant_id";`);
    }
  }
}
