import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ZoeConnect Billing, Phase 2 refinement pass (pre-Phase 3 review).
 *
 * 1. `billing_quotes` becomes a full pricing SNAPSHOT, not just a total:
 *    - `pricing_version` -- reserved for future module_registry pricing
 *      versioning (e.g. if the catalog itself starts tracking price
 *      history); currently always 1, written by BillingQuoteService.
 *    - `module_breakdown` -- per-module line items (code, name,
 *      unitPrice, isCore) as computed AT QUOTE CREATION TIME. If an
 *      admin changes a module's price in module_registry after a quote
 *      was issued, the quote's stored total/breakdown do not change --
 *      re-reading a quote never recalculates it (BillingQuoteService
 *      already only reads the stored row; this migration makes that
 *      snapshot complete down to the line-item level, not just the
 *      aggregate total).
 *    - `quote_hash` -- SHA-256 over (tenantId, modules, breakdown,
 *      currency, total, createdAt), computed once at quote creation and
 *      verified again before a payment intent is created for the quote,
 *      as a tamper-evidence check independent of the tenant-ownership
 *      check that already exists.
 *
 * 2. `billing_payment_intents` -- new table, sits between Quote and
 *    Payment (Quote -> PaymentIntent -> Gateway -> Payment), mirroring
 *    Stripe's PaymentIntent model. Created at POST /billing/checkout time
 *    (quote validated + hash-verified), before any gateway order exists;
 *    `billing_payments.payment_intent_id` links the eventual
 *    provider-specific payment attempt back to it. This decouples "we
 *    intend to charge this quote" bookkeeping from "a specific gateway
 *    order/attempt exists," so a retried/failed gateway call doesn't
 *    orphan the original intent.
 */
export class AddQuoteSnapshotAndPaymentIntents1791200000000 implements MigrationInterface {
  name = 'AddQuoteSnapshotAndPaymentIntents1791200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "billing_quotes"
        ADD COLUMN IF NOT EXISTS "pricing_version"  INT NOT NULL DEFAULT 1,
        ADD COLUMN IF NOT EXISTS "module_breakdown" JSONB NOT NULL DEFAULT '[]',
        ADD COLUMN IF NOT EXISTS "quote_hash"        VARCHAR(64);

      CREATE TABLE "billing_payment_intents" (
        "id"          UUID NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id"   UUID NOT NULL REFERENCES "tenant"("id"),
        "quote_id"    UUID NOT NULL REFERENCES "billing_quotes"("id"),
        "amount"      NUMERIC(12,2) NOT NULL,
        "currency"    VARCHAR(8) NOT NULL DEFAULT 'INR',
        "status"      VARCHAR(24) NOT NULL DEFAULT 'CREATED',
        "created_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_billing_payment_intents" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_billing_payment_intents_status" CHECK ("status" IN
          ('CREATED','PROCESSING','SUCCEEDED','FAILED','CANCELLED'))
      );
      CREATE INDEX "IDX_billing_payment_intents_tenant_id" ON "billing_payment_intents" ("tenant_id");
      CREATE INDEX "IDX_billing_payment_intents_quote_id" ON "billing_payment_intents" ("quote_id");

      ALTER TABLE "billing_payments"
        ADD COLUMN IF NOT EXISTS "payment_intent_id" UUID REFERENCES "billing_payment_intents"("id");
      CREATE INDEX "IDX_billing_payments_payment_intent_id" ON "billing_payments" ("payment_intent_id");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_billing_payments_payment_intent_id";
      ALTER TABLE "billing_payments" DROP COLUMN IF EXISTS "payment_intent_id";

      DROP TABLE IF EXISTS "billing_payment_intents";

      ALTER TABLE "billing_quotes"
        DROP COLUMN IF EXISTS "pricing_version",
        DROP COLUMN IF EXISTS "module_breakdown",
        DROP COLUMN IF EXISTS "quote_hash";
    `);
  }
}
