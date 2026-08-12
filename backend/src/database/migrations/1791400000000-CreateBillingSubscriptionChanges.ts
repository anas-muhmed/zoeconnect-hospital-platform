import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ZoeConnect Billing -- Subscription Change Management foundation.
 * See BillingSubscriptionChange entity doc comment for the full rationale
 * (avoids proration by deferring mid-cycle module changes to the next
 * renewal instead of an immediate second checkout).
 *
 * The partial unique index enforces "at most one PENDING change per
 * (subscription, module)" at the database level, in addition to the
 * application-level check in BillingSubscriptionChangeService.createChange()
 * -- defense in depth, same pattern as
 * UQ_billing_subscriptions_tenant_active for "one non-CANCELLED
 * subscription per tenant".
 */
export class CreateBillingSubscriptionChanges1791400000000 implements MigrationInterface {
  name = 'CreateBillingSubscriptionChanges1791400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "billing_subscription_changes" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL REFERENCES "tenant"("id"),
        "subscription_id" uuid NOT NULL REFERENCES "billing_subscriptions"("id"),
        "module_code" varchar(64) NOT NULL,
        "action" varchar(16) NOT NULL,
        "effective_date" timestamptz NOT NULL,
        "status" varchar(16) NOT NULL DEFAULT 'PENDING',
        "created_by" uuid NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_billing_subscription_changes_action" CHECK ("action" IN ('ADD','REMOVE')),
        CONSTRAINT "CHK_billing_subscription_changes_status" CHECK ("status" IN ('PENDING','APPLIED','CANCELLED'))
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_billing_subscription_changes_tenant" ON "billing_subscription_changes" ("tenant_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_billing_subscription_changes_subscription" ON "billing_subscription_changes" ("subscription_id")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_billing_subscription_changes_pending_module"
      ON "billing_subscription_changes" ("subscription_id", "module_code")
      WHERE "status" = 'PENDING'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "billing_subscription_changes"`);
  }
}
