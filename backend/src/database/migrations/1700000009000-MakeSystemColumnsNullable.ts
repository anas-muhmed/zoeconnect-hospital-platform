import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration 009 — Make system-actor columns nullable
 *
 * TABLES CHANGED:
 *   loyalty_accounts      — enrolled_by UUID column made nullable
 *   loyalty_transactions  — created_by  UUID column made nullable
 *
 * WHY:
 *   The HIS auto-sync scheduler (HisSyncService) creates loyalty accounts and
 *   earn transactions on behalf of the system, not a human user. Both FK columns
 *   previously had NOT NULL constraints that prevented system-initiated records.
 *
 * IMPACT:
 *   NULL in enrolled_by  → account was auto-created by HIS sync
 *   NULL in created_by   → transaction was auto-processed by HIS sync
 *   Existing rows are unaffected (they all have valid user UUIDs).
 */
export class MakeSystemColumnsNullable1700000009000 implements MigrationInterface {
  name = 'MakeSystemColumnsNullable1700000009000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── loyalty_accounts.enrolled_by ──────────────────────────────────────
    // TABLE : loyalty_accounts
    // COLUMN: enrolled_by  UUID  FK → users.id
    await queryRunner.query(`
      ALTER TABLE "loyalty_accounts"
        ALTER COLUMN "enrolled_by" DROP NOT NULL
    `);

    // ── loyalty_transactions.created_by ───────────────────────────────────
    // TABLE : loyalty_transactions
    // COLUMN: created_by   UUID  FK → users.id
    await queryRunner.query(`
      ALTER TABLE "loyalty_transactions"
        ALTER COLUMN "created_by" DROP NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restore NOT NULL — will fail if any NULL rows exist
    await queryRunner.query(`
      ALTER TABLE "loyalty_accounts"
        ALTER COLUMN "enrolled_by" SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "loyalty_transactions"
        ALTER COLUMN "created_by" SET NOT NULL
    `);
  }
}
