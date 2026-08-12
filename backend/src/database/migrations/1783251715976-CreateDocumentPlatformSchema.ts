import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Document Platform Schema — Milestone 1 (docs/architecture/MILESTONE_PLAN.md).
 * Creates the generic Document Engine tables (ADR-001, ADR-002, ADR-011):
 * documents, document_versions, document_overrides, document_override_versions,
 * document_instances, document_signatures, document_field_audit.
 *
 * These tables are deliberately generic (documentTypeId, not a form-specific
 * shape) — 'form' is registered as one DocumentTypeDefinition by a later
 * milestone's dynamic-forms module, not hardcoded here. See Phase 4A §2.2 and
 * ADR-002 (Document Platform Abstraction).
 */
export class CreateDocumentPlatformSchema1783251715976 implements MigrationInterface {
  name = 'CreateDocumentPlatformSchema1783251715976';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── documents ──────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "documents" (
        "id"                          UUID         NOT NULL DEFAULT gen_random_uuid(),
        "document_type_id"            VARCHAR(50)  NOT NULL,
        "name"                        VARCHAR(200) NOT NULL,
        "category"                    VARCHAR(50)  NOT NULL,
        "is_multi_branch"             BOOLEAN      NOT NULL DEFAULT true,
        "current_published_version_id" UUID        NULL,
        "created_by"                  UUID         NOT NULL,
        "created_at"                  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "updated_at"                  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_documents" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_documents_type" ON "documents" ("document_type_id")`);

    // ── document_versions ─────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "document_versions" (
        "id"           UUID         NOT NULL DEFAULT gen_random_uuid(),
        "document_id"  UUID         NOT NULL REFERENCES "documents"("id") ON DELETE CASCADE,
        "version_no"   INT          NOT NULL,
        "status"       VARCHAR(20)  NOT NULL DEFAULT 'draft',
        "payload"      JSONB        NOT NULL,
        "author_id"    UUID         NOT NULL,
        "created_at"   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_document_versions" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_document_versions_doc_version" UNIQUE ("document_id", "version_no")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_document_versions_status" ON "document_versions" ("status")`);
    await queryRunner.query(`CREATE INDEX "IDX_document_versions_payload_gin" ON "document_versions" USING GIN ("payload" jsonb_path_ops)`);

    // ── document_overrides ────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "document_overrides" (
        "id"               UUID        NOT NULL DEFAULT gen_random_uuid(),
        "document_id"      UUID        NOT NULL REFERENCES "documents"("id") ON DELETE CASCADE,
        "scope"            VARCHAR(20) NOT NULL,
        "branch_id"        VARCHAR(30) NULL,
        "department_code"  VARCHAR(50) NULL,
        "created_at"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_document_overrides" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_document_overrides_scope_cols" CHECK (
          ("scope" = 'branch' AND "branch_id" IS NOT NULL AND "department_code" IS NULL) OR
          ("scope" = 'department' AND "branch_id" IS NOT NULL AND "department_code" IS NOT NULL)
        )
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_document_overrides_lookup" ON "document_overrides" ("document_id", "branch_id", "department_code")`);

    // ── document_override_versions ────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "document_override_versions" (
        "id"                  UUID        NOT NULL DEFAULT gen_random_uuid(),
        "override_id"         UUID        NOT NULL REFERENCES "document_overrides"("id") ON DELETE CASCADE,
        "version_no"          INT         NOT NULL,
        "patch"               JSONB       NOT NULL,
        "metadata_overrides"  JSONB       NULL,
        "status"              VARCHAR(20) NOT NULL DEFAULT 'draft',
        "created_at"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_document_override_versions" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_document_override_versions" UNIQUE ("override_id", "version_no")
      )
    `);

    // ── document_instances ────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "document_instances" (
        "id"                    UUID        NOT NULL DEFAULT gen_random_uuid(),
        "document_version_id"   UUID        NOT NULL REFERENCES "document_versions"("id"),
        "override_version_id"   UUID        NULL REFERENCES "document_override_versions"("id"),
        "branch_id"             VARCHAR(30) NULL,
        "department_code"       VARCHAR(50) NULL,
        "patient_id"            VARCHAR(50) NULL,
        "visit_id"              VARCHAR(50) NULL,
        "encounter_id"          VARCHAR(50) NULL,
        "answers"               JSONB       NOT NULL DEFAULT '{}',
        "status"                VARCHAR(20) NOT NULL DEFAULT 'in_progress',
        "submitted_by"          UUID        NULL,
        "created_at"            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_document_instances" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_document_instances_patient" ON "document_instances" ("patient_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_document_instances_answers_gin" ON "document_instances" USING GIN ("answers" jsonb_path_ops)`);

    // ── document_signatures ───────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "document_signatures" (
        "id"                UUID         NOT NULL DEFAULT gen_random_uuid(),
        "instance_id"       UUID         NOT NULL REFERENCES "document_instances"("id") ON DELETE CASCADE,
        "field_key"         VARCHAR(100) NOT NULL,
        "signature_vector"  JSONB        NOT NULL,
        "signer_role"       VARCHAR(30)  NOT NULL,
        "signed_by_user_id" UUID         NULL,
        "ip_address"        INET         NULL,
        "user_agent"        VARCHAR(500) NULL,
        "integrity_hash"    VARCHAR(128) NOT NULL,
        "signed_at"         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_document_signatures" PRIMARY KEY ("id")
      )
    `);

    // ── document_field_audit ──────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "document_field_audit" (
        "id"           BIGSERIAL    NOT NULL,
        "entity_type"  VARCHAR(50)  NOT NULL,
        "entity_id"    VARCHAR(100) NOT NULL,
        "field_key"    VARCHAR(100) NULL,
        "old_value"    JSONB        NULL,
        "new_value"    JSONB        NULL,
        "changed_by"   UUID         NULL,
        "changed_at"   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_document_field_audit" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_document_field_audit_entity" ON "document_field_audit" ("entity_type", "entity_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "document_field_audit"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "document_signatures"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "document_instances"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "document_override_versions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "document_overrides"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "document_versions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "documents"`);
  }
}
