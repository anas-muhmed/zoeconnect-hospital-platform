import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Patient Feedback -- Google Review flow. Adds configuration to
 * feedback_campaigns so that, after a patient submits feedback with a high
 * enough overall rating, the public portal can invite them to leave a
 * Google review. Scoped to the campaign (not the form) since one form can
 * be reused by multiple campaigns that should each point at their own
 * Google Business listing.
 *
 * Hard constraint (per spec): nothing here ever posts a review on the
 * patient's behalf. This is purely: threshold check -> show an invite ->
 * open the hospital's Google Review URL in a new tab, patient does the
 * rest themselves. No automation, no unofficial APIs.
 */
export class AddFeedbackCampaignGoogleReview1783620000000 implements MigrationInterface {
  name = 'AddFeedbackCampaignGoogleReview1783620000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "feedback_campaigns"
        ADD COLUMN "google_review_enabled" BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN "google_review_url" VARCHAR(500),
        ADD COLUMN "google_review_threshold" NUMERIC(2,1) NOT NULL DEFAULT 4,
        ADD COLUMN "google_review_thank_you_message" TEXT,
        ADD COLUMN "google_review_invitation_message" TEXT;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "feedback_campaigns"
        DROP COLUMN IF EXISTS "google_review_enabled",
        DROP COLUMN IF EXISTS "google_review_url",
        DROP COLUMN IF EXISTS "google_review_threshold",
        DROP COLUMN IF EXISTS "google_review_thank_you_message",
        DROP COLUMN IF EXISTS "google_review_invitation_message";
    `);
  }
}
