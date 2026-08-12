import { MigrationInterface, QueryRunner } from 'typeorm';

export class RegisterIncidentModule1787300000000 implements MigrationInterface {
  name = 'RegisterIncidentModule1787300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "module_registry" ("id", "code", "name", "route", "version", "is_active", "license_required", "display_order", "description")
      VALUES (gen_random_uuid(), 'INCIDENT', 'Incident Management', '/incident', '1.0.0', false, true, 9, 'Incident reporting, severity/risk tracking, and notification routing')
      ON CONFLICT ("code") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "module_registry" WHERE "code" = 'INCIDENT'
    `);
  }
}
