import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Registration Widget — Phase 1a
 *
 * Extends token_records to support the HIS Registration Widget workflow.
 *
 * Changes to token_records:
 *   - Adds REGISTERED to the status CHECK constraint
 *   - registered_at          — timestamp when HIS registration completed
 *   - registration_user      — HDSP user who performed the mapping
 *   - supervisor_reset_at    — timestamp of supervisor override (nullable)
 *   - supervisor_reset_by    — supervisor user ID (nullable)
 *   - supervisor_reset_note  — reason given for override (nullable)
 *
 * REGISTERED is a terminal queue state:
 *   - Token disappears from the waiting queue
 *   - Recall and re-queue actions are disabled
 *   - Only a supervisor may reset it back to CALLED or WAITING
 *
 * TAT fields enabled by registered_at:
 *   Queue Wait Time      = called_at   - issued_at
 *   Registration Time    = registered_at - called_at
 *   Total Registration   = registered_at - issued_at
 */
export class AddRegistrationColumnsToTokenRecords1751800000001
  implements MigrationInterface
{
  name = 'AddRegistrationColumnsToTokenRecords1751800000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. Extend the status CHECK constraint to include REGISTERED ──────
    // Drop the existing constraint, then recreate with the new value.
    // All existing status values are preserved verbatim.
    await queryRunner.query(`
      ALTER TABLE "token_records"
        DROP CONSTRAINT IF EXISTS "chk_token_records_status"
    `);

    await queryRunner.query(`
      ALTER TABLE "token_records"
        ADD CONSTRAINT "chk_token_records_status"
        CHECK ("status" IN (
          'WAITING', 'CALLED', 'SERVING', 'COMPLETED', 'MISSED',
          'CANCELLED', 'ON_HOLD', 'RECALLED', 'SKIPPED', 'REISSUED',
          'REGISTERED'
        ))
    `);

    // ── 2. Add registration columns (all nullable — additive only) ───────
    await queryRunner.query(`
      ALTER TABLE "token_records"
        ADD COLUMN IF NOT EXISTS "registered_at"         TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS "registration_user"     VARCHAR(100),
        ADD COLUMN IF NOT EXISTS "supervisor_reset_at"   TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS "supervisor_reset_by"   VARCHAR(100),
        ADD COLUMN IF NOT EXISTS "supervisor_reset_note" TEXT
    `);

    // ── 3. Index for TAT queries and queue filtering ─────────────────────
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_tr_registered_at"
        ON "token_records" ("registered_at")
        WHERE "registered_at" IS NOT NULL
    `);

    // Partial index: all REGISTERED tokens for fast exclusion from queue list
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_tr_status_registered"
        ON "token_records" ("status", "registered_at" DESC)
        WHERE "status" = 'REGISTERED'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_tr_status_registered"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_tr_registered_at"`);

    await queryRunner.query(`
      ALTER TABLE "token_records"
        DROP COLUMN IF EXISTS "supervisor_reset_note",
        DROP COLUMN IF EXISTS "supervisor_reset_by",
        DROP COLUMN IF EXISTS "supervisor_reset_at",
        DROP COLUMN IF EXISTS "registration_user",
        DROP COLUMN IF EXISTS "registered_at"
    `);

    // Restore original CHECK constraint without REGISTERED
    await queryRunner.query(`
      ALTER TABLE "token_records"
        DROP CONSTRAINT IF EXISTS "chk_token_records_status"
    `);

    await queryRunner.query(`
      ALTER TABLE "token_records"
        ADD CONSTRAINT "chk_token_records_status"
        CHECK ("status" IN (
          'WAITING', 'CALLED', 'SERVING', 'COMPLETED', 'MISSED',
          'CANCELLED', 'ON_HOLD', 'RECALLED', 'SKIPPED', 'REISSUED'
        ))
    `);
  }
}
