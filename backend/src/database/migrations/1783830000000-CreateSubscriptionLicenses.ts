import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 4 ("Licensing Providers", Task 4.2). Creates `subscription_licenses`,
 * the local table `SubscriptionLicenseProvider` reads from -- HDSP's own
 * mirror of the billing-shaped fields (stripeCustomerId, planId, billing
 * status) the prior audit recommended adding to the Vendor Portal's
 * Hospital/IssuedLicense schema. Purely additive: no existing table is
 * touched, nothing yet writes to or reads from this table in production
 * (SubscriptionLicenseProvider is not bound as the active LICENSE_PROVIDER
 * anywhere -- default stays `file`, see Task 4.3). Zero observable behavior
 * change for any deployment.
 */
export class CreateSubscriptionLicenses1783830000000 implements MigrationInterface {
  name = 'CreateSubscriptionLicenses1783830000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "subscription_licenses" (
        "id"                      UUID NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id"               UUID,
        "hospital_name"           VARCHAR(255) NOT NULL,
        "hospital_code"           VARCHAR(64) NOT NULL,
        "stripe_customer_id"      VARCHAR(128),
        "stripe_subscription_id"  VARCHAR(128),
        "plan_id"                 VARCHAR(64),
        "subscription_status"     VARCHAR(32) NOT NULL DEFAULT 'trialing',
        "licensed_modules"        JSONB NOT NULL DEFAULT '[]',
        "max_users"               INT NOT NULL DEFAULT 5,
        "current_period_end"      TIMESTAMPTZ,
        "machine_fingerprint"     VARCHAR(64),
        "created_at"              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_subscription_licenses" PRIMARY KEY ("id")
      );

      CREATE INDEX "IDX_subscription_licenses_tenant_id" ON "subscription_licenses" ("tenant_id");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_subscription_licenses_tenant_id";
      DROP TABLE "subscription_licenses";
    `);
  }
}
