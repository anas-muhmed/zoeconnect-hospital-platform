import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Patient Feedback -- adds `display_value` to feedback_answers so the admin
 * Responses page can show what the patient actually saw/picked (an option's
 * label, e.g. "Cafeteria") instead of its raw internal `value` (e.g. a short
 * code like "C") for option-based question types. Nullable + backfilled as
 * NULL for existing rows -- FeedbackPublicService.submit now populates it
 * for every new submission; the frontend falls back to rendering `value`
 * directly for older rows where this is NULL.
 */
export class AddFeedbackAnswerDisplayValue1783590000000 implements MigrationInterface {
  name = 'AddFeedbackAnswerDisplayValue1783590000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "feedback_answers" ADD COLUMN "display_value" TEXT;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "feedback_answers" DROP COLUMN IF EXISTS "display_value";
    `);
  }
}
