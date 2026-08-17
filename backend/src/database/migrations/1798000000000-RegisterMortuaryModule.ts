import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Frontend integration Phase 1 — licensing/module-registry foundation.
 * Same pattern as `1787300000000-RegisterIncidentModule.ts` (`is_active:
 * false`, `license_required: true`, matching CMS/Incident/Children's
 * Village's own registration rows exactly).
 */
export class RegisterMortuaryModule1798000000000 implements MigrationInterface {
  name = 'RegisterMortuaryModule1798000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "module_registry" ("id", "code", "name", "route", "version", "is_active", "license_required", "display_order", "description")
      VALUES (gen_random_uuid(), 'MORTUARY', 'Mortuary Management', '/mortuary', '1.0.0', false, true, 11, 'Body registration, cabin allocation, billing, and release workflow')
      ON CONFLICT ("code") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "module_registry" WHERE "code" = 'MORTUARY'
    `);
  }
}
