import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Preschool enhancements:
 *  1. Fix teacher_id UUID → VARCHAR(100) (HIS doctor codes are not UUIDs)
 *  2. Add participation_level + overall_day_rating to daily reports (FR-062)
 *  3. Support multiple assessments per enrollment (reassessment flow)
 *     - Add is_current + assessment_number columns
 *     - Drop unique constraint on preschool_enrollment_id if it exists
 *  4. Seed default back-date limit setting (FR-063)
 */
export class PreschoolEnhancements1700000013000 implements MigrationInterface {
  name = 'PreschoolEnhancements1700000013000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. teacher_id: UUID → VARCHAR(100) ─────────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE "eic_preschool_enrollments"
        ALTER COLUMN "teacher_id" TYPE VARCHAR(100) USING "teacher_id"::text
    `);

    // ── 2. Daily report: participation_level + overall_day_rating ───────────────
    await queryRunner.query(`
      ALTER TABLE "eic_preschool_daily_reports"
        ADD COLUMN IF NOT EXISTS "participation_level" VARCHAR(20) NULL,
        ADD COLUMN IF NOT EXISTS "overall_day_rating"  VARCHAR(20) NULL
    `);

    // ── 3. Assessment: support multiple per enrollment (reassessment) ────────────
    // Drop unique index on preschool_enrollment_id if TypeORM created one
    await queryRunner.query(`
      DO $$
      DECLARE
        _con text;
      BEGIN
        SELECT conname INTO _con
        FROM pg_constraint
        WHERE conrelid = 'eic_preschool_assessments'::regclass
          AND contype = 'u'
          AND conname ILIKE '%preschool_enrollment%';
        IF _con IS NOT NULL THEN
          EXECUTE 'ALTER TABLE eic_preschool_assessments DROP CONSTRAINT ' || quote_ident(_con);
        END IF;
      END $$
    `);

    await queryRunner.query(`
      ALTER TABLE "eic_preschool_assessments"
        ADD COLUMN IF NOT EXISTS "is_current"        BOOLEAN  NOT NULL DEFAULT true,
        ADD COLUMN IF NOT EXISTS "assessment_number" INTEGER  NOT NULL DEFAULT 1
    `);

    // Mark all existing assessments as current assessment #1
    await queryRunner.query(`
      UPDATE "eic_preschool_assessments"
        SET "is_current" = true, "assessment_number" = 1
      WHERE "assessment_number" = 1
    `);

    // ── 4. Seed default back-date limit setting ─────────────────────────────────
    await queryRunner.query(`
      INSERT INTO "settings" ("id", "module", "key", "value", "data_type", "description")
      VALUES (
        gen_random_uuid(),
        'EIC',
        'preschool.backdate_limit_days',
        '7',
        'integer',
        'Maximum number of calendar days in the past a preschool daily report can be submitted. Set to 0 for no limit.'
      )
      ON CONFLICT ("module", "key") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "settings" WHERE "module" = 'EIC' AND "key" = 'preschool.backdate_limit_days'`);
    await queryRunner.query(`ALTER TABLE "eic_preschool_assessments" DROP COLUMN IF EXISTS "assessment_number"`);
    await queryRunner.query(`ALTER TABLE "eic_preschool_assessments" DROP COLUMN IF EXISTS "is_current"`);
    await queryRunner.query(`ALTER TABLE "eic_preschool_daily_reports" DROP COLUMN IF EXISTS "overall_day_rating"`);
    await queryRunner.query(`ALTER TABLE "eic_preschool_daily_reports" DROP COLUMN IF EXISTS "participation_level"`);
    // Note: cannot safely revert teacher_id back to UUID if HIS codes exist in the column
  }
}
