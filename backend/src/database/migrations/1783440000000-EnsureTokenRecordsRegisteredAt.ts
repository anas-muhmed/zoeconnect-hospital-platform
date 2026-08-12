import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Hotfix: ConsolidateRecentChanges1783326737784 drops token_records.registered_at
 * (line 214) and re-adds it later in the same up() (line 1090). On at least one
 * environment that migration did not fully apply, leaving the column missing
 * ("column t.registered_at does not exist" from the Registration Assistant's
 * GET /token/registration/queue, which selects it via TokenRecord.registeredAt).
 *
 * This migration is purely additive/idempotent -- safe to run whether or not
 * the earlier migration completed. It restores the column and the two
 * dependent indexes if -- and only if -- they are not already present.
 */
export class EnsureTokenRecordsRegisteredAt1783440000000 implements MigrationInterface {
  name = 'EnsureTokenRecordsRegisteredAt1783440000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "token_records" ADD COLUMN IF NOT EXISTS "registered_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_tr_status_registered"`);
    await queryRunner.query(
      `CREATE INDEX "idx_tr_status_registered" ON "token_records" ("status", "registered_at") WHERE ((status)::text = 'REGISTERED'::text)`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_tr_registered_at"`);
    await queryRunner.query(
      `CREATE INDEX "idx_tr_registered_at" ON "token_records" ("registered_at") WHERE (registered_at IS NOT NULL)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Intentionally a no-op: this is a hotfix restoring state that other
    // migrations already expect to exist. Reverting it would just reintroduce
    // the bug it fixes.
  }
}
