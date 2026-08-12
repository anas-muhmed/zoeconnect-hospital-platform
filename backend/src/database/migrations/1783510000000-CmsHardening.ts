import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * CMS Phase 1 hardening: media metadata + soft delete columns on cms_media,
 * and a dedicated cms_audit_logs table for CMS operation traceability.
 */
export class CmsHardening1783510000000 implements MigrationInterface {
  name = 'CmsHardening1783510000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "cms_media"
        ADD COLUMN "checksum"   VARCHAR(64),
        ADD COLUMN "width"      INT,
        ADD COLUMN "height"     INT,
        ADD COLUMN "deleted_at" TIMESTAMPTZ;

      CREATE INDEX "IDX_cms_media_deleted_at" ON "cms_media" ("deleted_at");

      CREATE TABLE "cms_audit_logs" (
        "id"          UUID NOT NULL DEFAULT gen_random_uuid(),
        "branch_id"   VARCHAR(30),
        "entity_type" VARCHAR(60) NOT NULL,
        "entity_id"   VARCHAR(100),
        "action"      VARCHAR(30) NOT NULL,
        "summary"     TEXT,
        "changed_by"  VARCHAR(100) NOT NULL,
        "changed_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_cms_audit_logs" PRIMARY KEY ("id")
      );
      CREATE INDEX "IDX_cms_audit_logs_entity" ON "cms_audit_logs" ("entity_type", "entity_id");
      CREATE INDEX "IDX_cms_audit_logs_changed_at" ON "cms_audit_logs" ("changed_at");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS "cms_audit_logs";
      ALTER TABLE "cms_media"
        DROP COLUMN IF EXISTS "checksum",
        DROP COLUMN IF EXISTS "width",
        DROP COLUMN IF EXISTS "height",
        DROP COLUMN IF EXISTS "deleted_at";
    `);
  }
}
