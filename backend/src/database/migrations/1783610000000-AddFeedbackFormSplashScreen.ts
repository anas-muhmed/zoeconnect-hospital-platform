import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Patient Feedback -- adds an optional full-screen splash image (shown
 * before the form itself, for a configurable duration or until tapped) to
 * feedback_forms. Distinct from the header logo/banner added earlier:
 * the header stays visible alongside the form; the splash is a one-time
 * screen shown first and then dismissed. Same nullable-columns-on-the-form
 * pattern as `1783580000000-AddFeedbackFormHeaderImage` -- no separate
 * media-library table, since a form has at most one splash image.
 */
export class AddFeedbackFormSplashScreen1783610000000 implements MigrationInterface {
  name = 'AddFeedbackFormSplashScreen1783610000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "feedback_forms"
        ADD COLUMN "splash_image_url" VARCHAR(500),
        ADD COLUMN "splash_duration_seconds" INT;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "feedback_forms"
        DROP COLUMN IF EXISTS "splash_image_url",
        DROP COLUMN IF EXISTS "splash_duration_seconds";
    `);
  }
}
