import { MigrationInterface, QueryRunner } from 'typeorm';

export class RegisterCmsModule1785000000000 implements MigrationInterface {
  name = 'RegisterCmsModule1785000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "module_registry" ("id", "code", "name", "route", "version", "is_active", "license_required", "display_order", "description")
      VALUES (gen_random_uuid(), 'CMS', 'Digital Signage', '/cms', '1.0.0', false, true, 5, 'Digital signage and media management')
      ON CONFLICT ("code") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "module_registry" WHERE "code" = 'CMS'
    `);
  }
}
