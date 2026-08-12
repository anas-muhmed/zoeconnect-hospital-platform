import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Patient Feedback & Experience Management -- Phase 1 (Foundation: Form
 * Builder). Creates the form/section/question/option/condition schema and
 * registers FEEDBACK:FORM:{VIEW,CREATE,EDIT,DELETE,PUBLISH} permissions,
 * granted to SUPER_ADMIN/HOSPITAL_ADMIN, following the exact pattern
 * established in 1783490000000-CreateCmsModule.
 *
 * Deliberately independent of HIS/patient-lookup -- no table here references
 * a patient record, only an optional branch_id (same branch-scoping model as
 * CMS/Token). QR codes, campaigns, submissions, complaints, analytics,
 * reports, settings, and notifications are later phases.
 *
 * Also creates feedback_audit_logs -- a dedicated table (mirrors CMS's
 * cms_audit_logs), NOT the shared `@Audit()`/`audit_logs` mechanism most
 * other HDSP modules use. That mechanism turned out to be dead code
 * (AuditInterceptor is never registered as a global interceptor and its
 * own `request.auditEvent` write is never read by anything), so every
 * `@Audit(...)`-decorated route across the codebase currently logs
 * nothing. Rather than fix that platform-wide gap as a side effect of this
 * module, Feedback uses the same proven, directly-called pattern CMS
 * already uses successfully -- see FeedbackAuditLog's doc comment.
 */
export class CreateFeedbackModule1783560000000 implements MigrationInterface {
  name = 'CreateFeedbackModule1783560000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "feedback_forms" (
        "id"           UUID NOT NULL DEFAULT gen_random_uuid(),
        "branch_id"    VARCHAR(30),
        "name"         VARCHAR(200) NOT NULL,
        "description"  TEXT,
        "language"     VARCHAR(10) NOT NULL DEFAULT 'en',
        "status"       VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
        "published_at" TIMESTAMPTZ,
        "created_by"   VARCHAR(100) NOT NULL,
        "updated_by"   VARCHAR(100),
        "created_at"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_feedback_forms" PRIMARY KEY ("id")
      );
      CREATE INDEX "IDX_feedback_forms_branch_status" ON "feedback_forms" ("branch_id", "status");

      CREATE TABLE "feedback_sections" (
        "id"            UUID NOT NULL DEFAULT gen_random_uuid(),
        "form_id"       UUID NOT NULL,
        "title"         VARCHAR(200) NOT NULL,
        "description"   TEXT,
        "display_order" INT NOT NULL DEFAULT 0,
        "created_at"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_feedback_sections" PRIMARY KEY ("id"),
        CONSTRAINT "FK_feedback_sections_form" FOREIGN KEY ("form_id") REFERENCES "feedback_forms" ("id") ON DELETE CASCADE
      );
      CREATE INDEX "IDX_feedback_sections_form" ON "feedback_sections" ("form_id", "display_order");

      CREATE TABLE "feedback_questions" (
        "id"             UUID NOT NULL DEFAULT gen_random_uuid(),
        "form_id"        UUID NOT NULL,
        "section_id"     UUID NOT NULL,
        "question_type"  VARCHAR(30) NOT NULL,
        "question_text"  TEXT NOT NULL,
        "help_text"      TEXT,
        "placeholder"    VARCHAR(255),
        "is_required"    BOOLEAN NOT NULL DEFAULT FALSE,
        "display_order"  INT NOT NULL DEFAULT 0,
        "min_length"     INT,
        "max_length"     INT,
        "default_value"  TEXT,
        "config"         JSONB,
        "created_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_feedback_questions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_feedback_questions_form" FOREIGN KEY ("form_id") REFERENCES "feedback_forms" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_feedback_questions_section" FOREIGN KEY ("section_id") REFERENCES "feedback_sections" ("id") ON DELETE CASCADE
      );
      CREATE INDEX "IDX_feedback_questions_section" ON "feedback_questions" ("section_id", "display_order");
      CREATE INDEX "IDX_feedback_questions_form" ON "feedback_questions" ("form_id");

      CREATE TABLE "feedback_question_options" (
        "id"            UUID NOT NULL DEFAULT gen_random_uuid(),
        "question_id"   UUID NOT NULL,
        "label"         VARCHAR(255) NOT NULL,
        "value"         VARCHAR(255) NOT NULL,
        "display_order" INT NOT NULL DEFAULT 0,
        CONSTRAINT "PK_feedback_question_options" PRIMARY KEY ("id"),
        CONSTRAINT "FK_feedback_question_options_question" FOREIGN KEY ("question_id") REFERENCES "feedback_questions" ("id") ON DELETE CASCADE
      );
      CREATE INDEX "IDX_feedback_question_options_question" ON "feedback_question_options" ("question_id", "display_order");

      CREATE TABLE "feedback_question_conditions" (
        "id"                UUID NOT NULL DEFAULT gen_random_uuid(),
        "question_id"       UUID NOT NULL,
        "source_question_id" UUID NOT NULL,
        "operator"          VARCHAR(20) NOT NULL,
        "comparison_value"  VARCHAR(255) NOT NULL,
        "action"            VARCHAR(10) NOT NULL DEFAULT 'SHOW',
        "created_at"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_feedback_question_conditions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_feedback_question_conditions_question" FOREIGN KEY ("question_id") REFERENCES "feedback_questions" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_feedback_question_conditions_source" FOREIGN KEY ("source_question_id") REFERENCES "feedback_questions" ("id") ON DELETE CASCADE
      );
      CREATE INDEX "IDX_feedback_question_conditions_question" ON "feedback_question_conditions" ("question_id");

      CREATE TABLE "feedback_audit_logs" (
        "id"          UUID NOT NULL DEFAULT gen_random_uuid(),
        "branch_id"   VARCHAR(30),
        "entity_type" VARCHAR(60) NOT NULL,
        "entity_id"   VARCHAR(100),
        "action"      VARCHAR(30) NOT NULL,
        "summary"     TEXT,
        "changed_by"  VARCHAR(100) NOT NULL,
        "changed_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_feedback_audit_logs" PRIMARY KEY ("id")
      );
      CREATE INDEX "IDX_feedback_audit_logs_entity" ON "feedback_audit_logs" ("entity_type", "entity_id");
      CREATE INDEX "IDX_feedback_audit_logs_branch" ON "feedback_audit_logs" ("branch_id", "changed_at");
    `);

    const permissions: Array<[string, string, string, string]> = [
      ['FEEDBACK', 'FORM', 'VIEW',    'View patient feedback forms'],
      ['FEEDBACK', 'FORM', 'CREATE',  'Create patient feedback forms'],
      ['FEEDBACK', 'FORM', 'EDIT',    'Edit patient feedback forms, sections, and questions'],
      ['FEEDBACK', 'FORM', 'DELETE',  'Delete patient feedback forms'],
      ['FEEDBACK', 'FORM', 'PUBLISH', 'Publish or unpublish patient feedback forms'],
    ];
    for (const [moduleCode, resource, action, description] of permissions) {
      await queryRunner.query(
        `INSERT INTO permissions (module_code, resource, action, description)
         VALUES ($1,$2,$3,$4) ON CONFLICT (module_code, resource, action) DO NOTHING`,
        [moduleCode, resource, action, description],
      );
      await queryRunner.query(
        `INSERT INTO role_permissions (role_id, permission_id)
         SELECT r.id, p.id FROM roles r, permissions p
         WHERE r.name IN ('SUPER_ADMIN','HOSPITAL_ADMIN')
           AND p.module_code=$1 AND p.resource=$2 AND p.action=$3
         ON CONFLICT DO NOTHING`, [moduleCode, resource, action],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM role_permissions WHERE permission_id IN (SELECT id FROM permissions WHERE module_code = 'FEEDBACK');
      DELETE FROM permissions WHERE module_code = 'FEEDBACK';
      DROP TABLE IF EXISTS "feedback_audit_logs";
      DROP TABLE IF EXISTS "feedback_question_conditions";
      DROP TABLE IF EXISTS "feedback_question_options";
      DROP TABLE IF EXISTS "feedback_questions";
      DROP TABLE IF EXISTS "feedback_sections";
      DROP TABLE IF EXISTS "feedback_forms";
    `);
  }
}
