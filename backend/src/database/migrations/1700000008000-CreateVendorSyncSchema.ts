import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration 008 — Vendor Sync Schema
 * Creates:
 *   vendor_registrations — one row per HDSP instance registered with vendor
 *   license_requests     — local record of each request sent to vendor
 */
export class CreateVendorSyncSchema1700000008000 implements MigrationInterface {
  name = 'CreateVendorSyncSchema1700000008000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "vendor_registrations" (
        "id"                  UUID          NOT NULL DEFAULT gen_random_uuid(),
        "instance_token"      VARCHAR(64)   NOT NULL,
        "webhook_secret"      VARCHAR(128)  NOT NULL,
        "vendor_api_url"      VARCHAR(512)  NOT NULL,
        "hospital_name"       VARCHAR(255)  NOT NULL,
        "hospital_code"       VARCHAR(64)   NOT NULL,
        "public_ip"           VARCHAR(128)  NOT NULL,
        "public_port"         INTEGER       NOT NULL DEFAULT 3000,
        "machine_fingerprint" VARCHAR(64)   NOT NULL,
        "status"              VARCHAR(32)   NOT NULL DEFAULT 'PENDING',
        "registered_at"       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        "updated_at"          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_vendor_registrations"  PRIMARY KEY ("id"),
        CONSTRAINT "uq_instance_token"        UNIQUE ("instance_token"),
        CONSTRAINT "chk_vendor_reg_status"    CHECK ("status" IN ('PENDING','ACTIVE','SUSPENDED'))
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "license_requests" (
        "id"                UUID          NOT NULL DEFAULT gen_random_uuid(),
        "vendor_request_id" VARCHAR(128),
        "requested_modules" JSONB         NOT NULL DEFAULT '[]',
        "remarks"           TEXT,
        "status"            VARCHAR(32)   NOT NULL DEFAULT 'PENDING',
        "rejection_reason"  TEXT,
        "submitted_at"      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        "resolved_at"       TIMESTAMPTZ,
        "updated_at"        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_license_requests"      PRIMARY KEY ("id"),
        CONSTRAINT "chk_license_req_status"   CHECK ("status" IN ('PENDING','APPROVED','REJECTED','REVOKED'))
      )
    `);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_vendor_reg_status"     ON "vendor_registrations"("status")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_license_req_status"    ON "license_requests"("status")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_license_req_submitted" ON "license_requests"("submitted_at" DESC)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "license_requests"      CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "vendor_registrations"  CASCADE`);
  }
}
