import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ZoeConnect Billing -- subscription upgrade strategy change: adding a
 * module to an ALREADY-ACTIVE subscription now goes through the normal
 * quote -> checkout -> payment pipeline (charged immediately, no
 * proration, no waiting for renewal) instead of being deferred via
 * `billing_subscription_changes`. `quote_type` is how
 * PaymentConfirmedWorkflow tells the two cases apart post-payment:
 *
 *   SUBSCRIPTION     -- a brand new subscription or a reactivation. The
 *                       whole module set replaces subscription items and
 *                       the billing period resets (existing behavior).
 *   MODULE_ADDITION  -- one or more NEW modules being added to a
 *                       subscription that is already ACTIVE/PAST_DUE/
 *                       CANCEL_AT_PERIOD_END/SUSPENDED. Items are ADDED
 *                       (never replace what's already licensed) and the
 *                       subscription's billing period is left untouched --
 *                       the new module simply rides along on the next
 *                       renewal at its full price from then on.
 *
 * Defaults every existing row to 'SUBSCRIPTION' -- Subscription Change
 * Management didn't exist before this, so every historical quote really
 * was a new-subscription/reactivation quote.
 */
export class AddQuoteTypeToBillingQuotes1791500000000 implements MigrationInterface {
  name = 'AddQuoteTypeToBillingQuotes1791500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "billing_quotes"
      ADD COLUMN "quote_type" varchar(20) NOT NULL DEFAULT 'SUBSCRIPTION'
    `);
    await queryRunner.query(`
      ALTER TABLE "billing_quotes"
      ADD CONSTRAINT "CHK_billing_quotes_quote_type"
      CHECK ("quote_type" IN ('SUBSCRIPTION', 'MODULE_ADDITION'))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "billing_quotes" DROP CONSTRAINT "CHK_billing_quotes_quote_type"`);
    await queryRunner.query(`ALTER TABLE "billing_quotes" DROP COLUMN "quote_type"`);
  }
}
