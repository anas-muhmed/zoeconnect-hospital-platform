import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The per-device submission cap (FeedbackPublicService._enforceSubmissionLimit)
 * moved from scoping by QR code to scoping by campaign -- so it now filters by
 * (campaign_id, anonymous_id, submitted_at) or (campaign_id, ip_hash,
 * submitted_at), neither of which the original `IDX_feedback_submissions_dedup`
 * (qr_code_id, anonymous_id, submitted_at) can serve efficiently. Adds two
 * matching indexes; the old QR-scoped one is left in place since it's still a
 * reasonable index for QR-level analytics/lookups, just no longer load-bearing
 * for the submission cap.
 */
export class AddFeedbackSubmissionCampaignDedupIndex1783600000000 implements MigrationInterface {
  name = 'AddFeedbackSubmissionCampaignDedupIndex1783600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX "IDX_feedback_submissions_campaign_anon" ON "feedback_submissions" ("campaign_id", "anonymous_id", "submitted_at");
      CREATE INDEX "IDX_feedback_submissions_campaign_iphash" ON "feedback_submissions" ("campaign_id", "ip_hash", "submitted_at");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_feedback_submissions_campaign_anon";
      DROP INDEX IF EXISTS "IDX_feedback_submissions_campaign_iphash";
    `);
  }
}
