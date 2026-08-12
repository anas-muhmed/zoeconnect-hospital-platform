import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tenant Foundation (Phase 1 — Hybrid Architecture roadmap, Checkpoint A2).
 *
 * Adds a nullable `tenant_id` to the three singleton-row settings tables
 * (system_settings, cms_settings, feedback_settings) and backfills every
 * existing row to the seeded 'default' tenant (looked up by `code`, since
 * `tenant.id` is a generated UUID unknown at migration-write time — see
 * Checkpoint A1).
 *
 * Deliberately NOT NULL and NOT a foreign key yet — both deferred to
 * Stage B, once tenant_id backfill is verified complete across every
 * batch (A2–A13). This migration alone cannot change any observable
 * application behavior: nothing reads `tenant_id` on any of these three
 * entities yet.
 */
export class AddTenantIdToSettingsTables1783720000000 implements MigrationInterface {
  name = 'AddTenantIdToSettingsTables1783720000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const tables = ['system_settings', 'cms_settings', 'feedback_settings'];

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
    const tables = ['system_settings', 'cms_settings', 'feedback_settings'];

    for (const table of tables) {
      await queryRunner.query(`DROP INDEX "IDX_${table}_tenant_id";`);
      await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN "tenant_id";`);
    }
  }
}
