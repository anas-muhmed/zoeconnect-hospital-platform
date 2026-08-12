import { MigrationInterface, QueryRunner } from 'typeorm';

// Children's Village was built out across migrations 1789200000000 through
// 1789900000000 (schema, permissions, role_permissions) but was never
// registered as a row in module_registry -- unlike every other module
// (see 1785000000000-RegisterCmsModule.ts, 1787300000000-RegisterIncidentModule.ts),
// which each got a dedicated "Register*Module" migration inserting into
// module_registry. Without that row, the module can't appear in
// Manage License, can't be licensed/activated, and licensedModules never
// contains CHILDRENS_VILLAGE -- so the frontend's requiresModule check
// (frontend/src/app/(platform)/layout.tsx) hides it from the sidebar and
// dashboard entirely, even for SUPER_ADMIN.
export class RegisterChildrensVillageModule1790000000000 implements MigrationInterface {
  name = 'RegisterChildrensVillageModule1790000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "module_registry" ("id", "code", "name", "route", "version", "is_active", "license_required", "display_order", "description")
      VALUES (gen_random_uuid(), 'CHILDRENS_VILLAGE', 'Children''s Village', '/childrens-village', '1.0.0', false, true, 10, 'Early childhood education management -- admissions, classes, timetables, attendance, curriculum, and development tracking')
      ON CONFLICT ("code") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "module_registry" WHERE "code" = 'CHILDRENS_VILLAGE'
    `);
  }
}
