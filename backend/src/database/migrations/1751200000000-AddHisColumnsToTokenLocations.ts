import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add HIS department, service-center, and intrabranchid columns to
 * token_locations so that each location maps directly to a HIS service center.
 *
 * Also update PRINT_DATA_DETAIL in Oracle — run the ALTER TABLE statement
 * manually from the bridge service comment if upgrading from the original schema.
 */
export class AddHisColumnsToTokenLocations1751200000000 implements MigrationInterface {
  name = 'AddHisColumnsToTokenLocations1751200000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "token_locations"
        ADD COLUMN IF NOT EXISTS "intrabranchid"       VARCHAR(30)  DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS "department_id"       VARCHAR(30)  DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS "department_name"     VARCHAR(255) DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS "service_center_id"   VARCHAR(30)  DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS "service_center_name" VARCHAR(255) DEFAULT NULL
    `);

    // Add a unique index on service_center_id so duplicate SC locations are
    // never accidentally created by concurrent kiosk requests.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_token_locations_sc_id"
        ON "token_locations" ("service_center_id")
        WHERE "service_center_id" IS NOT NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_token_locations_sc_id"`);
    await queryRunner.query(`
      ALTER TABLE "token_locations"
        DROP COLUMN IF EXISTS "intrabranchid",
        DROP COLUMN IF EXISTS "department_id",
        DROP COLUMN IF EXISTS "department_name",
        DROP COLUMN IF EXISTS "service_center_id",
        DROP COLUMN IF EXISTS "service_center_name"
    `);
  }
}
