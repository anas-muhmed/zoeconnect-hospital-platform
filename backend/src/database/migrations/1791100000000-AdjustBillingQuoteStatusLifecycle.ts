import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ZoeConnect Billing, Phase 2 (Pricing Engine + Quote + Subscription
 * Services). CreateBillingSchema (1791000000002) shipped `billing_quotes`
 * with a 3-state status (`ACTIVE`/`CONSUMED`/`EXPIRED`) before the quote
 * lifecycle was fully specified. This migration replaces that CHECK
 * constraint with the approved 5-state lifecycle:
 *
 *   CREATED -> READY -> CHECKOUT_STARTED -> CONSUMED
 *                  \-> EXPIRED
 *
 * BillingQuoteService.createQuote() creates a quote directly in READY
 * (pricing is computed synchronously and atomically, so there's no
 * observable CREATED-but-not-yet-priced window today) -- CREATED is
 * modeled for symmetry/future async pricing and is safe to leave unused
 * for now. No existing rows exist at migration time in any real
 * deployment (billing_quotes was created and shipped in the same phase as
 * this fix, before any application code wrote to it), so no data
 * backfill is needed; the `UPDATE` in `up()` is a defensive no-op for any
 * environment that already inserted a test row with the old 'ACTIVE'
 * value.
 */
export class AdjustBillingQuoteStatusLifecycle1791100000000 implements MigrationInterface {
  name = 'AdjustBillingQuoteStatusLifecycle1791100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "billing_quotes" SET "status" = 'READY' WHERE "status" = 'ACTIVE';

      ALTER TABLE "billing_quotes" DROP CONSTRAINT IF EXISTS "CHK_billing_quotes_status";
      ALTER TABLE "billing_quotes"
        ADD CONSTRAINT "CHK_billing_quotes_status"
        CHECK ("status" IN ('CREATED','READY','CHECKOUT_STARTED','CONSUMED','EXPIRED'));

      ALTER TABLE "billing_quotes" ALTER COLUMN "status" SET DEFAULT 'CREATED';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "billing_quotes" SET "status" = 'ACTIVE' WHERE "status" IN ('CREATED','READY','CHECKOUT_STARTED');

      ALTER TABLE "billing_quotes" DROP CONSTRAINT IF EXISTS "CHK_billing_quotes_status";
      ALTER TABLE "billing_quotes"
        ADD CONSTRAINT "CHK_billing_quotes_status"
        CHECK ("status" IN ('ACTIVE','CONSUMED','EXPIRED'));

      ALTER TABLE "billing_quotes" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';
    `);
  }
}
