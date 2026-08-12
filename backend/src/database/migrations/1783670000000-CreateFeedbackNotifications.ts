import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Patient Feedback -- Notification Engine phase. Creates
 * feedback_notifications, a lightweight in-app feed for staff (currently
 * just "a new complaint arrived"). Reuses the existing
 * FEEDBACK:COMPLAINT:VIEW permission rather than adding a new one --
 * seeing these notifications is a subset of the complaint-visibility
 * permission an admin already needs to act on them.
 */
export class CreateFeedbackNotifications1783670000000 implements MigrationInterface {
  name = 'CreateFeedbackNotifications1783670000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "feedback_notifications" (
        "id"           UUID NOT NULL DEFAULT gen_random_uuid(),
        "branch_id"    VARCHAR(30),
        "type"         VARCHAR(30) NOT NULL,
        "complaint_id" UUID,
        "message"      TEXT NOT NULL,
        "is_read"      BOOLEAN NOT NULL DEFAULT FALSE,
        "created_at"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_feedback_notifications" PRIMARY KEY ("id"),
        CONSTRAINT "FK_feedback_notifications_complaint" FOREIGN KEY ("complaint_id") REFERENCES "feedback_complaints" ("id") ON DELETE CASCADE
      );
      CREATE INDEX "IDX_feedback_notifications_branch_unread" ON "feedback_notifications" ("branch_id", "is_read", "created_at");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "feedback_notifications";`);
  }
}
