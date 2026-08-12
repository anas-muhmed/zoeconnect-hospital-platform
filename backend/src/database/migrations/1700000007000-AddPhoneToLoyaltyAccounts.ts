import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration 007 — Add phone to loyalty_accounts
 * Also adds notification_logs and notification_templates columns
 * needed by the Phase 6 entity definitions.
 */
export class AddPhoneToLoyaltyAccounts1700000007000 implements MigrationInterface {
  name = 'AddPhoneToLoyaltyAccounts1700000007000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add phone column to loyalty_accounts
    await queryRunner.query(`
      ALTER TABLE "loyalty_accounts"
        ADD COLUMN IF NOT EXISTS "phone" VARCHAR(20)
    `);

    // Add index for phone on notification_logs (may already exist from migration 006)
    // Using IF NOT EXISTS via DO block to be idempotent
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_indexes
          WHERE tablename = 'loyalty_accounts' AND indexname = 'idx_loyalty_accounts_phone'
        ) THEN
          CREATE INDEX "idx_loyalty_accounts_phone"
            ON "loyalty_accounts" ("phone") WHERE "phone" IS NOT NULL;
        END IF;
      END
      $$
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_loyalty_accounts_phone"`);
    await queryRunner.query(`ALTER TABLE "loyalty_accounts" DROP COLUMN IF EXISTS "phone"`);
  }
}
