import { MigrationInterface, QueryRunner } from 'typeorm';

/** Frontend integration Phase 1 — licensing/module-registry foundation. Same pattern as `1787300000000-RegisterIncidentModule.ts`. */
export class RegisterLifeGenXModule1798200000000 implements MigrationInterface {
  name = 'RegisterLifeGenXModule1798200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "module_registry" ("id", "code", "name", "route", "version", "is_active", "license_required", "display_order", "description")
      VALUES (gen_random_uuid(), 'LIFEGENX', 'LifeGenX', '/lifegenx', '1.0.0', false, true, 13, 'AI-assisted clinical symptom extraction and differential diagnosis from consultation audio')
      ON CONFLICT ("code") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "module_registry" WHERE "code" = 'LIFEGENX'
    `);
  }
}
