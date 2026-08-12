import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tenant Foundation (Phase 1 — Hybrid Architecture roadmap, Checkpoint A7).
 *
 * Adds a nullable `tenant_id` to all six Loyalty module tables
 * (loyalty_accounts, loyalty_transactions, card_categories, campaigns,
 * reward_catalog, reward_redemptions), backfilling every existing row to
 * the seeded 'default' tenant (looked up by `code` — see Checkpoint
 * A1-A5).
 *
 * Row-count check before this migration: loyalty_transactions — the
 * module's highest-volume, append-only ledger table, with 7 distinct
 * insert paths including two cron/queue-triggered ones — had 0 rows in
 * the verified environment. Per the same evidence-driven threshold used
 * in A5 (single-statement backfill under ~100k rows), a single migration
 * covering all six tables is appropriate; no batching, no split
 * migration. This is a data-volume call for *today's* environment, not a
 * structural exemption — a live, longer-running deployment may warrant
 * revisiting the batching question before this migration set is run
 * against a real customer database with real transaction history.
 *
 * Not NOT NULL, not a foreign key — deferred to Stage B. Also deferred to
 * Stage B (tracked in HYBRID_ARCHITECTURE_LOG.md, not addressed here):
 * (1) ownership classification for card_categories and reward_catalog
 * (global config vs. tenant-specific — an architectural decision, not a
 * migration-mechanics one), (2) the raw bulk `UPDATE loyalty_accounts SET
 * card_category_id = (...)` in card-config.service.ts's
 * recalculateTiers(), which will need explicit tenant scoping once
 * tenant_id is load-bearing, and (3) the two loyalty_transactions insert
 * paths triggered by cron/queue jobs (campaign.scheduler.ts,
 * loyalty.processor.ts) rather than request context, which will need
 * tenant resolution from the parent account rather than request-scoped
 * inference.
 */
export class AddTenantIdToLoyaltyTables1783760000000 implements MigrationInterface {
  name = 'AddTenantIdToLoyaltyTables1783760000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const tables = [
      'loyalty_accounts',
      'loyalty_transactions',
      'card_categories',
      'campaigns',
      'reward_catalog',
      'reward_redemptions',
    ];

    for (const table of tables) {
      await queryRunner.query(`ALTER TABLE "${table}" ADD COLUMN "tenant_id" UUID;`);
      await queryRunner.query(`
        UPDATE "${table}"
        SET "tenant_id" = (SELECT "id" FROM "tenant" WHERE "code" = 'default')
        WHERE "tenant_id" IS NULL;
      `);
      await queryRunner.query(
        `CREATE INDEX "IDX_${table}_tenant_id" ON "${table}" ("tenant_id");`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const tables = [
      'loyalty_accounts',
      'loyalty_transactions',
      'card_categories',
      'campaigns',
      'reward_catalog',
      'reward_redemptions',
    ];

    for (const table of tables) {
      await queryRunner.query(`DROP INDEX "IDX_${table}_tenant_id";`);
      await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN "tenant_id";`);
    }
  }
}
