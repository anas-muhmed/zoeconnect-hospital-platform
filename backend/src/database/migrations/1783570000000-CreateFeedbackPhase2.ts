import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Patient Feedback & Experience Management -- Phase 2 (QR Codes + Campaigns
 * + Public Portal + Submission Engine). Creates feedback_campaigns,
 * feedback_qr_codes, feedback_submissions, feedback_answers, and registers
 * FEEDBACK:CAMPAIGN:*, FEEDBACK:QR:*, FEEDBACK:RESPONSE:VIEW permissions,
 * following the exact pattern established in 1783560000000-CreateFeedbackModule.
 *
 * QR -> Campaign -> Form is a deliberate indirection (see FeedbackCampaign's
 * doc comment): a QR's printed token never changes even if the admin swaps
 * which form the campaign points at. Submissions/answers remain independent
 * of HIS/patient data -- only an optional branch_id and a random per-device
 * anonymous_id, never a patient identifier.
 */
export class CreateFeedbackPhase21783570000000 implements MigrationInterface {
  name = 'CreateFeedbackPhase21783570000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "feedback_campaigns" (
        "id"          UUID NOT NULL DEFAULT gen_random_uuid(),
        "branch_id"   VARCHAR(30),
        "form_id"     UUID NOT NULL,
        "name"        VARCHAR(200) NOT NULL,
        "description" TEXT,
        "is_active"   BOOLEAN NOT NULL DEFAULT TRUE,
        "created_by"  VARCHAR(100) NOT NULL,
        "created_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_feedback_campaigns" PRIMARY KEY ("id"),
        CONSTRAINT "FK_feedback_campaigns_form" FOREIGN KEY ("form_id") REFERENCES "feedback_forms" ("id") ON DELETE RESTRICT
      );
      CREATE INDEX "IDX_feedback_campaigns_branch" ON "feedback_campaigns" ("branch_id", "is_active");
      CREATE INDEX "IDX_feedback_campaigns_form" ON "feedback_campaigns" ("form_id");

      CREATE TABLE "feedback_qr_codes" (
        "id"          UUID NOT NULL DEFAULT gen_random_uuid(),
        "branch_id"   VARCHAR(30),
        "campaign_id" UUID NOT NULL,
        "token"       VARCHAR(64) NOT NULL,
        "target_type" VARCHAR(30) NOT NULL,
        "target_ref"  VARCHAR(150),
        "label"       VARCHAR(200) NOT NULL,
        "is_active"   BOOLEAN NOT NULL DEFAULT TRUE,
        "expires_at"  TIMESTAMPTZ,
        "created_by"  VARCHAR(100) NOT NULL,
        "created_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_feedback_qr_codes" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_feedback_qr_codes_token" UNIQUE ("token"),
        CONSTRAINT "FK_feedback_qr_codes_campaign" FOREIGN KEY ("campaign_id") REFERENCES "feedback_campaigns" ("id") ON DELETE CASCADE
      );
      CREATE INDEX "IDX_feedback_qr_codes_campaign" ON "feedback_qr_codes" ("campaign_id");
      CREATE INDEX "IDX_feedback_qr_codes_branch" ON "feedback_qr_codes" ("branch_id", "is_active");

      CREATE TABLE "feedback_submissions" (
        "id"              UUID NOT NULL DEFAULT gen_random_uuid(),
        "branch_id"       VARCHAR(30),
        "form_id"         UUID NOT NULL,
        "campaign_id"     UUID NOT NULL,
        "qr_code_id"      UUID,
        "anonymous_id"    VARCHAR(64),
        "overall_rating"  NUMERIC(4,2),
        "status"          VARCHAR(30) NOT NULL DEFAULT 'RECEIVED',
        "user_agent"      VARCHAR(500),
        "ip_hash"         VARCHAR(128),
        "language"        VARCHAR(10),
        "submitted_at"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_feedback_submissions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_feedback_submissions_form" FOREIGN KEY ("form_id") REFERENCES "feedback_forms" ("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_feedback_submissions_campaign" FOREIGN KEY ("campaign_id") REFERENCES "feedback_campaigns" ("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_feedback_submissions_qr" FOREIGN KEY ("qr_code_id") REFERENCES "feedback_qr_codes" ("id") ON DELETE SET NULL
      );
      CREATE INDEX "IDX_feedback_submissions_form" ON "feedback_submissions" ("form_id", "submitted_at");
      CREATE INDEX "IDX_feedback_submissions_campaign" ON "feedback_submissions" ("campaign_id", "submitted_at");
      CREATE INDEX "IDX_feedback_submissions_branch" ON "feedback_submissions" ("branch_id", "submitted_at");
      CREATE INDEX "IDX_feedback_submissions_dedup" ON "feedback_submissions" ("qr_code_id", "anonymous_id", "submitted_at");

      CREATE TABLE "feedback_answers" (
        "id"                     UUID NOT NULL DEFAULT gen_random_uuid(),
        "submission_id"          UUID NOT NULL,
        "question_id"            UUID NOT NULL,
        "question_text_snapshot" TEXT NOT NULL,
        "question_type"          VARCHAR(30) NOT NULL,
        "value"                  JSONB NOT NULL,
        CONSTRAINT "PK_feedback_answers" PRIMARY KEY ("id"),
        CONSTRAINT "FK_feedback_answers_submission" FOREIGN KEY ("submission_id") REFERENCES "feedback_submissions" ("id") ON DELETE CASCADE
      );
      CREATE INDEX "IDX_feedback_answers_submission" ON "feedback_answers" ("submission_id");
      CREATE INDEX "IDX_feedback_answers_question" ON "feedback_answers" ("question_id");
    `);

    const permissions: Array<[string, string, string, string]> = [
      ['FEEDBACK', 'CAMPAIGN', 'VIEW',   'View patient feedback campaigns'],
      ['FEEDBACK', 'CAMPAIGN', 'CREATE', 'Create patient feedback campaigns'],
      ['FEEDBACK', 'CAMPAIGN', 'EDIT',   'Edit patient feedback campaigns'],
      ['FEEDBACK', 'CAMPAIGN', 'DELETE', 'Delete patient feedback campaigns'],
      ['FEEDBACK', 'QR',       'VIEW',   'View patient feedback QR codes'],
      ['FEEDBACK', 'QR',       'CREATE', 'Generate patient feedback QR codes'],
      ['FEEDBACK', 'QR',       'EDIT',   'Edit/disable patient feedback QR codes'],
      ['FEEDBACK', 'QR',       'DELETE', 'Delete patient feedback QR codes'],
      ['FEEDBACK', 'RESPONSE', 'VIEW',   'View patient feedback submissions/responses'],
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
      DELETE FROM role_permissions WHERE permission_id IN (
        SELECT id FROM permissions WHERE module_code = 'FEEDBACK' AND resource IN ('CAMPAIGN','QR','RESPONSE')
      );
      DELETE FROM permissions WHERE module_code = 'FEEDBACK' AND resource IN ('CAMPAIGN','QR','RESPONSE');
      DROP TABLE IF EXISTS "feedback_answers";
      DROP TABLE IF EXISTS "feedback_submissions";
      DROP TABLE IF EXISTS "feedback_qr_codes";
      DROP TABLE IF EXISTS "feedback_campaigns";
    `);
  }
}
