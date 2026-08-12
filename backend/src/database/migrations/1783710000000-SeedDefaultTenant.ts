import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tenant Foundation (Phase 1 — Hybrid Architecture roadmap, Task 1.1).
 *
 * Seeds exactly one row: the 'default' tenant every existing self-hosted
 * install implicitly is. Deterministic, fixed values only — deliberately
 * does not read `system_settings` or any other application data, so this
 * migration's outcome never depends on what's already in the database.
 */
export class SeedDefaultTenant1783710000000 implements MigrationInterface {
  name = 'SeedDefaultTenant1783710000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "tenant" ("id", "code", "name", "status", "is_system")
      VALUES ('11111111-1111-1111-1111-111111111111', 'default', 'Default Hospital', 'active', true);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "tenant" WHERE "code" = 'default';
    `);
  }
}
