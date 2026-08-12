import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration 002 -- Licensing Schema
 * Creates: license_master
 * Note: licensed_modules is stored as JSONB on license_master (not a separate table)
 */
export class CreateLicensingSchema1700000002000 implements MigrationInterface {
  name = 'CreateLicensingSchema1700000002000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "license_master" (
        "id"                    UUID          NOT NULL DEFAULT gen_random_uuid(),
        "license_key"           UUID          NOT NULL,
        "hospital_name"         VARCHAR(255)  NOT NULL,
        "hospital_code"         VARCHAR(50)   NOT NULL,
        "issued_at"             TIMESTAMPTZ   NOT NULL,
        "expires_at"            TIMESTAMPTZ,
        "licensed_modules"      JSONB         NOT NULL DEFAULT '[]',
        "max_users"             INTEGER       NOT NULL DEFAULT 50,
        "machine_fingerprint"   VARCHAR(64),
        "status"                VARCHAR(20)   NOT NULL DEFAULT 'ACTIVE',
        "raw_license"           JSONB         NOT NULL DEFAULT '{}',
        "metadata_hash"         VARCHAR(64)   NOT NULL,
        "activated_by"          UUID,
        "activated_at"          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        "updated_at"            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_license_master"  PRIMARY KEY ("id"),
        CONSTRAINT "uq_license_key"     UNIQUE ("license_key"),
        CONSTRAINT "chk_license_status" CHECK ("status" IN ('ACTIVE','EXPIRED','REVOKED','TRIAL'))
      )
    `);

    await queryRunner.query(`CREATE INDEX "idx_license_status"  ON "license_master"("status")`);
    await queryRunner.query(`CREATE INDEX "idx_license_expires" ON "license_master"("expires_at")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "license_master" CASCADE`);
  }
}
