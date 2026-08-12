import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ZoeConnect Billing, Phase 1. Adds generic, provider-neutral columns to
 * the existing `subscription_licenses` table (see
 * `1783830000000-CreateSubscriptionLicenses.ts`) alongside its existing
 * `stripe_customer_id`/`stripe_subscription_id` columns. Per the payment
 * provider abstraction requirement, all new/active code paths (Phase 4's
 * BillingEntitlementSyncService) write `provider` / `provider_customer_id`
 * / `provider_subscription_id` here -- never provider-specific column
 * names. The old `stripe_*` columns are left in place, untouched and
 * still unpopulated (no data migration needed, since nothing has ever
 * written to them -- see that table's own doc comment), purely to avoid
 * an unnecessary destructive rename on a column TypeORM/other code may
 * still reference; they can be dropped in a later cleanup migration once
 * confirmed fully dead.
 */
export class AddProviderColumnsToSubscriptionLicenses1791000000003 implements MigrationInterface {
  name = 'AddProviderColumnsToSubscriptionLicenses1791000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "subscription_licenses"
        ADD COLUMN IF NOT EXISTS "provider"                  VARCHAR(32),
        ADD COLUMN IF NOT EXISTS "provider_customer_id"       VARCHAR(128),
        ADD COLUMN IF NOT EXISTS "provider_subscription_id"   VARCHAR(128),
        ADD COLUMN IF NOT EXISTS "billing_subscription_id"    UUID;

      CREATE INDEX IF NOT EXISTS "IDX_subscription_licenses_billing_subscription_id"
        ON "subscription_licenses" ("billing_subscription_id");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_subscription_licenses_billing_subscription_id";
      ALTER TABLE "subscription_licenses"
        DROP COLUMN IF EXISTS "provider",
        DROP COLUMN IF EXISTS "provider_customer_id",
        DROP COLUMN IF EXISTS "provider_subscription_id",
        DROP COLUMN IF EXISTS "billing_subscription_id";
    `);
  }
}
