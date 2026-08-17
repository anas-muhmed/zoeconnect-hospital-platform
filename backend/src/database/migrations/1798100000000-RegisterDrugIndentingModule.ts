import { MigrationInterface, QueryRunner } from 'typeorm';

/** Frontend integration Phase 1 — licensing/module-registry foundation. Same pattern as `1787300000000-RegisterIncidentModule.ts`. */
export class RegisterDrugIndentingModule1798100000000 implements MigrationInterface {
  name = 'RegisterDrugIndentingModule1798100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "module_registry" ("id", "code", "name", "route", "version", "is_active", "license_required", "display_order", "description")
      VALUES (gen_random_uuid(), 'DRUG_INDENTING', 'Drug Indenting', '/drug-indenting', '1.0.0', false, true, 12, 'Drug request submission, multi-stage approval workflow, DTC review, and order/inventory tracking')
      ON CONFLICT ("code") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "module_registry" WHERE "code" = 'DRUG_INDENTING'
    `);
  }
}
