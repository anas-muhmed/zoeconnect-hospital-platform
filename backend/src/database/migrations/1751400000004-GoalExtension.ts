import { MigrationInterface, QueryRunner } from 'typeorm';

export class GoalExtension1751400000004 implements MigrationInterface {
  name = 'GoalExtension1751400000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "eic_goals"
        ADD COLUMN IF NOT EXISTS "original_target_date" DATE         NULL,
        ADD COLUMN IF NOT EXISTS "extended_target_date" DATE         NULL,
        ADD COLUMN IF NOT EXISTS "extension_remarks"    TEXT         NULL,
        ADD COLUMN IF NOT EXISTS "extended_at"          TIMESTAMPTZ  NULL,
        ADD COLUMN IF NOT EXISTS "extended_by"          UUID         NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "eic_goals"
        DROP COLUMN IF EXISTS "original_target_date",
        DROP COLUMN IF EXISTS "extended_target_date",
        DROP COLUMN IF EXISTS "extension_remarks",
        DROP COLUMN IF EXISTS "extended_at",
        DROP COLUMN IF EXISTS "extended_by"
    `);
  }
}
