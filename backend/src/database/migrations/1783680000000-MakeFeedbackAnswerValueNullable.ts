import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bugfix: feedback_answers.value was NOT NULL, but an optional
 * (non-required) question left blank on the public portal submits
 * `value: null` for that answer -- every submit with at least one
 * unanswered optional question was failing with a 500
 * ("null value in column \"value\" ... violates not-null constraint").
 * Required questions are still enforced earlier in
 * FeedbackPublicService.submit() before any row is written, so this
 * doesn't weaken that validation -- it just lets a legitimately-skipped
 * optional question be stored as what it is.
 */
export class MakeFeedbackAnswerValueNullable1783680000000 implements MigrationInterface {
  name = 'MakeFeedbackAnswerValueNullable1783680000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "feedback_answers" ALTER COLUMN "value" DROP NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Backfill any nulls before re-adding NOT NULL so the down-migration doesn't itself fail.
    await queryRunner.query(`
      UPDATE "feedback_answers" SET "value" = 'null'::jsonb WHERE "value" IS NULL;
      ALTER TABLE "feedback_answers" ALTER COLUMN "value" SET NOT NULL;
    `);
  }
}
