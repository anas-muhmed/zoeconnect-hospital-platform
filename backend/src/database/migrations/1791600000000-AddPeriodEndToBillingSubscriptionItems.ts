import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ZoeConnect Billing -- per-module prepayment. Each `billing_subscription_items`
 * row now tracks its OWN paid-through date (`period_end`), independent of
 * the parent subscription's `current_period_end`. This is what makes "buy
 * N more months for a module I already have" a coherent operation: the
 * module's own entitlement window extends without touching the rest of
 * the subscription's items or its shared billing-cycle bookkeeping
 * (cancellation date, "Renewal Date" on the My Subscription page, etc,
 * which remain driven by `billing_subscriptions.current_period_end`).
 *
 * Backfill: existing rows get `now() + 1 month` -- this codebase has no
 * production tenants yet (Subscription Change Management, the whole
 * billing domain, shipped in this same development cycle), so an exact
 * historical value isn't recoverable/meaningful; 1 month matches the
 * default `months` a purchase implies when unspecified.
 */
export class AddPeriodEndToBillingSubscriptionItems1791600000000 implements MigrationInterface {
  name = 'AddPeriodEndToBillingSubscriptionItems1791600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "billing_subscription_items"
      ADD COLUMN "period_end" timestamptz
    `);
    await queryRunner.query(`
      UPDATE "billing_subscription_items" SET "period_end" = now() + interval '1 month' WHERE "period_end" IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "billing_subscription_items" ALTER COLUMN "period_end" SET NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "billing_subscription_items" DROP COLUMN "period_end"`);
  }
}
