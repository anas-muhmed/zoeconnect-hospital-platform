import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Patient Feedback -- adds an optional hospital logo/banner header to a
 * form, shown above the title on the public portal. Just two nullable
 * columns on feedback_forms (a form has at most one header image, not a
 * library) -- upload storage follows the same pattern as CMS media
 * (uploads/feedback-media/ + a static-file route registered in main.ts),
 * but doesn't need its own catalog table since there's nothing to browse
 * or reuse across forms.
 */
export class AddFeedbackFormHeaderImage1783580000000 implements MigrationInterface {
  name = 'AddFeedbackFormHeaderImage1783580000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "feedback_forms"
        ADD COLUMN "header_image_url" VARCHAR(500),
        ADD COLUMN "header_image_type" VARCHAR(20);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "feedback_forms"
        DROP COLUMN IF EXISTS "header_image_url",
        DROP COLUMN IF EXISTS "header_image_type";
    `);
  }
}
