import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateImportJobsTable1783300000000 implements MigrationInterface {
  name = 'CreateImportJobsTable1783300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "import_jobs" (
        "id"                    UUID          NOT NULL DEFAULT gen_random_uuid(),
        "status"                VARCHAR(50)   NOT NULL DEFAULT 'pending',
        "original_file_name"    VARCHAR(120)  NOT NULL,
        "mime_type"             VARCHAR(64)   NOT NULL,
        "original_file_bytes"   BYTEA,
        "page_count"            INT           NOT NULL DEFAULT 1,
        "ocr_result"            JSONB,
        "layout_elements"       JSONB,
        "classified_fields"     JSONB,
        "generated_schema"      JSONB,
        "suggestions"           JSONB,
        "overall_confidence"    DECIMAL(5,4),
        "error_message"         TEXT,
        "ai_provider"           VARCHAR(64),
        "finalized_document_id" UUID,
        "created_by"            UUID,
        "reviewed_by"           UUID,
        "finalized_at"          TIMESTAMPTZ,
        "created_at"            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        "updated_at"            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_import_jobs" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_import_jobs_status"     ON "import_jobs" ("status");
      CREATE INDEX "IDX_import_jobs_created_by" ON "import_jobs" ("created_by");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "import_jobs"`);
  }
}
