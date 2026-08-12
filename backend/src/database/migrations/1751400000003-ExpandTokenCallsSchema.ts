import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * GAP-3: Expand token_calls to the full audit-trail schema.
 *
 * Adds new columns to the existing token_calls table so that every operator
 * action (call, recall, transfer, hold, skip, complete, cancel, miss, reissue)
 * is recorded with a typed action enum and full context.
 *
 * All new columns are NULLABLE so existing rows and existing insert code are
 * not broken — this is a purely additive migration.
 *
 * New columns:
 *   token_record_id  — FK to token_records (links call audit to persistent record)
 *   action           — what the operator did (defaults to 'CALLED' for legacy rows)
 *   from_counter_id  — source counter for TRANSFERRED actions
 *   to_counter_id    — destination counter for TRANSFERRED actions
 *   performed_by     — user id of the operator (alias for existing called_by)
 *   performed_at     — timestamp of action (alias for existing called_at)
 *   notes            — free-text note
 *
 * Renamed from 1751400000002 to 1751400000003 to avoid timestamp collision
 * with AddResetToAuditLogAction1751400000002.
 */
export class ExpandTokenCallsSchema1751400000003 implements MigrationInterface {
  name = 'ExpandTokenCallsSchema1751400000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "token_calls"
        ADD COLUMN IF NOT EXISTS "token_record_id" UUID,
        ADD COLUMN IF NOT EXISTS "action"           VARCHAR(20),
        ADD COLUMN IF NOT EXISTS "from_counter_id"  UUID,
        ADD COLUMN IF NOT EXISTS "to_counter_id"    UUID,
        ADD COLUMN IF NOT EXISTS "performed_by"     VARCHAR(100),
        ADD COLUMN IF NOT EXISTS "performed_at"     TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS "notes"            TEXT
    `);

    // Backfill existing rows so they have action = 'CALLED'
    await queryRunner.query(`
      UPDATE "token_calls"
         SET "action"       = 'CALLED',
             "performed_by" = "called_by",
             "performed_at" = "called_at"
       WHERE "action" IS NULL
    `);

    // Soft FK index only — avoids failures for tokens issued before GAP-1 fix
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_tc_token_record"
        ON "token_calls" ("token_record_id")
        WHERE "token_record_id" IS NOT NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_tc_action_date"
        ON "token_calls" ("action", "called_at" DESC)
        WHERE "action" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_tc_action_date"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_tc_token_record"`);

    await queryRunner.query(`
      ALTER TABLE "token_calls"
        DROP COLUMN IF EXISTS "notes",
        DROP COLUMN IF EXISTS "performed_at",
        DROP COLUMN IF EXISTS "performed_by",
        DROP COLUMN IF EXISTS "to_counter_id",
        DROP COLUMN IF EXISTS "from_counter_id",
        DROP COLUMN IF EXISTS "action",
        DROP COLUMN IF EXISTS "token_record_id"
    `);
  }
}
