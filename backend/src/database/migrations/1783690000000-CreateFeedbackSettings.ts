import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Patient Feedback -- Settings phase (v1.0 capstone). Creates
 * feedback_settings as a singleton-row table (same pattern as
 * `cms_settings`, see CMSSettings' doc comment), replacing the hardcoded
 * constants scattered across earlier phases:
 *   - MAX_SUBMISSIONS_PER_DEVICE / SUBMISSION_LIMIT_WINDOW_MS /
 *     DUPLICATE_SUBMISSION_WINDOW_MS (feedback-public.service.ts)
 *   - DEFAULT_GOOGLE_REVIEW_THANK_YOU / _INVITATION / DEFAULT_THANK_YOU_MESSAGE
 *     (feedback-public.service.ts) and the `?? 4` threshold default
 *     (feedback-campaign.service.ts)
 *   - DEFAULT/MIN/MAX_SPLASH_DURATION_SECONDS (feedback-form.controller.ts)
 *   - COMPLAINT_CATEGORIES (previously duplicated in both the backend DTO
 *     comment and the public portal frontend)
 *   - FEEDBACK_COMPLAINT_RESOLVED_WHATSAPP_TEMPLATE env var
 *     (feedback-complaint.service.ts) -- now DB-configurable instead
 *
 * The seed values below are the exact values those constants held, so
 * this migration is a pure refactor -- behavior is unchanged until an
 * admin actually edits something via `PATCH /feedback/settings`.
 *
 * `branch_id` is nullable and unused today (every lookup resolves the
 * single global row) -- see FeedbackSettings' doc comment for why it
 * exists already rather than being added in a later migration.
 */
export class CreateFeedbackSettings1783690000000 implements MigrationInterface {
  name = 'CreateFeedbackSettings1783690000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "feedback_settings" (
        "id"                                     UUID NOT NULL DEFAULT gen_random_uuid(),
        "branch_id"                               VARCHAR(30),
        "max_submissions_per_device"              INT NOT NULL DEFAULT 3,
        "submission_limit_window_hours"           INT NOT NULL DEFAULT 24,
        "duplicate_submission_window_seconds"     INT NOT NULL DEFAULT 30,
        "default_google_review_threshold"         NUMERIC(2,1) NOT NULL DEFAULT 4,
        "default_google_review_thank_you_message" TEXT,
        "default_google_review_invitation_message" TEXT,
        "default_thank_you_message"               TEXT,
        "default_splash_duration_seconds"         INT NOT NULL DEFAULT 3,
        "min_splash_duration_seconds"              INT NOT NULL DEFAULT 1,
        "max_splash_duration_seconds"              INT NOT NULL DEFAULT 15,
        "complaint_categories"                     JSONB NOT NULL,
        "complaint_resolved_whatsapp_template"      VARCHAR(200),
        "updated_at"                               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_feedback_settings" PRIMARY KEY ("id")
      );
      -- At most one global row (branch_id IS NULL) and at most one row per branch --
      -- both expressed as partial unique indexes rather than a plain UNIQUE("branch_id"),
      -- since a plain unique constraint would treat multiple NULLs as distinct (Postgres's
      -- usual NULL-not-equal-to-NULL behavior) and so wouldn't actually cap the global row at one.
      CREATE UNIQUE INDEX "UQ_feedback_settings_global" ON "feedback_settings" ((1)) WHERE "branch_id" IS NULL;
      CREATE UNIQUE INDEX "UQ_feedback_settings_branch" ON "feedback_settings" ("branch_id") WHERE "branch_id" IS NOT NULL;
    `);

    await queryRunner.query(`
      INSERT INTO "feedback_settings" (
        "default_google_review_thank_you_message",
        "default_google_review_invitation_message",
        "default_thank_you_message",
        "complaint_categories"
      ) VALUES (
        $1, $2, $3, $4::jsonb
      );
    `, [
      "Thank you for your valuable feedback! We're glad you had a good experience.",
      'Would you like to share your experience on Google to help others?',
      'Thank you for sharing your feedback with us.',
      JSON.stringify(['Cleanliness', 'Staff Behavior', 'Waiting Time', 'Billing', 'Medical Care', 'Facilities', 'Communication', 'Other']),
    ]);

    const permissions: Array<[string, string, string, string]> = [
      ['FEEDBACK', 'SETTINGS', 'MANAGE', 'View and edit module-wide patient feedback settings'],
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
        SELECT id FROM permissions WHERE module_code = 'FEEDBACK' AND resource = 'SETTINGS'
      );
      DELETE FROM permissions WHERE module_code = 'FEEDBACK' AND resource = 'SETTINGS';
      DROP TABLE IF EXISTS "feedback_settings";
    `);
  }
}
