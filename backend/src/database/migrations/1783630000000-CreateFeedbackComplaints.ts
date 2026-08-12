import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Patient Feedback -- Complaint Diversion & Management. Creates
 * feedback_complaints (only ever populated when a patient opts in on the
 * post-submission "we're sorry, tell us more" screen for a low-rated
 * submission -- see FeedbackPublicService._buildPostSubmitResponse's
 * `showComplaintPrompt`) and registers FEEDBACK:COMPLAINT:* permissions,
 * following the exact pattern established in 1783570000000-CreateFeedbackPhase2.
 */
export class CreateFeedbackComplaints1783630000000 implements MigrationInterface {
  name = 'CreateFeedbackComplaints1783630000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "feedback_complaints" (
        "id"                UUID NOT NULL DEFAULT gen_random_uuid(),
        "branch_id"         VARCHAR(30),
        "submission_id"     UUID NOT NULL,
        "form_id"           UUID NOT NULL,
        "campaign_id"       UUID NOT NULL,
        "category"          VARCHAR(60) NOT NULL,
        "description"       TEXT NOT NULL,
        "contact_name"      VARCHAR(150),
        "contact_phone"     VARCHAR(30),
        "contact_email"     VARCHAR(200),
        "status"            VARCHAR(20) NOT NULL DEFAULT 'NEW',
        "assigned_to"       VARCHAR(100),
        "resolution_notes"  TEXT,
        "resolved_at"       TIMESTAMPTZ,
        "created_at"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_feedback_complaints" PRIMARY KEY ("id"),
        CONSTRAINT "FK_feedback_complaints_submission" FOREIGN KEY ("submission_id") REFERENCES "feedback_submissions" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_feedback_complaints_form" FOREIGN KEY ("form_id") REFERENCES "feedback_forms" ("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_feedback_complaints_campaign" FOREIGN KEY ("campaign_id") REFERENCES "feedback_campaigns" ("id") ON DELETE RESTRICT
      );
      CREATE INDEX "IDX_feedback_complaints_branch" ON "feedback_complaints" ("branch_id", "status");
      CREATE INDEX "IDX_feedback_complaints_campaign" ON "feedback_complaints" ("campaign_id", "status");
      CREATE INDEX "IDX_feedback_complaints_submission" ON "feedback_complaints" ("submission_id");
      CREATE INDEX "IDX_feedback_complaints_status" ON "feedback_complaints" ("status", "created_at");
    `);

    const permissions: Array<[string, string, string, string]> = [
      ['FEEDBACK', 'COMPLAINT', 'VIEW',   'View patient feedback complaints'],
      ['FEEDBACK', 'COMPLAINT', 'MANAGE', 'Assign, update status, and resolve patient feedback complaints'],
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
        SELECT id FROM permissions WHERE module_code = 'FEEDBACK' AND resource = 'COMPLAINT'
      );
      DELETE FROM permissions WHERE module_code = 'FEEDBACK' AND resource = 'COMPLAINT';
      DROP TABLE IF EXISTS "feedback_complaints";
    `);
  }
}
