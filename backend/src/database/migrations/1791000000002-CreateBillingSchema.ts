import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ZoeConnect Billing, Phase 1 (Architecture & Database).
 *
 * Creates the new `billing_*` domain: quotes, subscriptions, subscription
 * items, payments, invoices, and webhook events. This is deliberately a
 * NEW domain, not a rename/reuse of `subscription_licenses`
 * (licensing module) -- `subscription_licenses` remains the existing,
 * unchanged ENTITLEMENT read table that `SubscriptionLicenseProvider`/
 * `LicenseGuard` already consult. The new `billing_subscriptions` table is
 * the commercial/billing record (what was bought, from whom, at what
 * price, in what payment-provider-neutral shape); a later phase's
 * BillingEntitlementSyncService is the single writer that projects
 * `billing_subscriptions` + `billing_subscription_items` state into
 * `subscription_licenses.licensed_modules` / `subscription_status` /
 * `current_period_end` -- i.e. Payment -> Subscription -> Entitlements ->
 * existing License/Access layer, exactly as designed. No existing table
 * is altered by this migration except the additive columns already added
 * in 1791000000000 (module_registry) and 1791000000003
 * (subscription_licenses provider columns).
 *
 * All new tables are tenant-scoped with `tenant_id UUID NOT NULL
 * REFERENCES "tenant"("id")` -- unlike the older licensing-module tables
 * (which predate mature tenant infrastructure and keep tenant_id
 * nullable), tenant infrastructure (TenantModule/TenantScopedRepository)
 * is now mature, so every new billing table enforces tenant scoping at
 * the schema level from day one.
 *
 * Provider-neutral naming throughout (`provider`, `provider_customer_id`,
 * `provider_order_id`, `provider_payment_id`, `provider_subscription_id`)
 * per the payment-provider-abstraction requirement -- no Razorpay- or
 * Stripe-specific column names. `billing_webhook_events` has a
 * `UNIQUE(provider, event_id)` constraint, which is the idempotency
 * mechanism duplicate webhook deliveries rely on.
 */
export class CreateBillingSchema1791000000002 implements MigrationInterface {
  name = 'CreateBillingSchema1791000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      -- Quotes: immutable, short-lived, server-calculated price snapshots.
      -- A payment is only ever created against a quote id -- never against
      -- browser-supplied amounts/modules.
      CREATE TABLE "billing_quotes" (
        "id"             UUID NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id"      UUID NOT NULL REFERENCES "tenant"("id"),
        "billing_cycle"  VARCHAR(16) NOT NULL,
        "modules"        JSONB NOT NULL,
        "currency"       VARCHAR(8) NOT NULL DEFAULT 'INR',
        "base_amount"    NUMERIC(12,2) NOT NULL DEFAULT 0,
        "module_amount"  NUMERIC(12,2) NOT NULL DEFAULT 0,
        "discount"       NUMERIC(12,2) NOT NULL DEFAULT 0,
        "tax"            NUMERIC(12,2) NOT NULL DEFAULT 0,
        "total"          NUMERIC(12,2) NOT NULL DEFAULT 0,
        "status"         VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
        "expires_at"     TIMESTAMPTZ NOT NULL,
        "created_by"     UUID,
        "created_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_billing_quotes" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_billing_quotes_billing_cycle" CHECK ("billing_cycle" IN ('MONTHLY','YEARLY')),
        CONSTRAINT "CHK_billing_quotes_status" CHECK ("status" IN ('ACTIVE','CONSUMED','EXPIRED'))
      );
      CREATE INDEX "IDX_billing_quotes_tenant_id" ON "billing_quotes" ("tenant_id");
      CREATE INDEX "IDX_billing_quotes_status" ON "billing_quotes" ("status");

      -- Subscriptions: the billing-domain subscription record.
      CREATE TABLE "billing_subscriptions" (
        "id"                        UUID NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id"                 UUID NOT NULL REFERENCES "tenant"("id"),
        "status"                    VARCHAR(24) NOT NULL DEFAULT 'TRIAL',
        "billing_cycle"             VARCHAR(16) NOT NULL DEFAULT 'MONTHLY',
        "currency"                  VARCHAR(8) NOT NULL DEFAULT 'INR',
        "start_date"                TIMESTAMPTZ,
        "current_period_start"      TIMESTAMPTZ,
        "current_period_end"        TIMESTAMPTZ,
        "cancel_at_period_end"      BOOLEAN NOT NULL DEFAULT false,
        "provider"                  VARCHAR(32),
        "provider_customer_id"      VARCHAR(128),
        "provider_subscription_id"  VARCHAR(128),
        "created_at"                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_billing_subscriptions" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_billing_subscriptions_status" CHECK ("status" IN
          ('TRIAL','ACTIVE','PAST_DUE','CANCEL_AT_PERIOD_END','CANCELLED','SUSPENDED','INCOMPLETE')),
        CONSTRAINT "CHK_billing_subscriptions_billing_cycle" CHECK ("billing_cycle" IN ('MONTHLY','YEARLY'))
      );
      CREATE INDEX "IDX_billing_subscriptions_tenant_id" ON "billing_subscriptions" ("tenant_id");
      -- At most one non-terminal (TRIAL/ACTIVE/PAST_DUE/CANCEL_AT_PERIOD_END/
      -- SUSPENDED/INCOMPLETE) subscription per tenant. CANCELLED rows are
      -- excluded so a tenant can have unlimited historical cancelled
      -- subscriptions but only one "current" one.
      CREATE UNIQUE INDEX "UQ_billing_subscriptions_tenant_active"
        ON "billing_subscriptions" ("tenant_id")
        WHERE "status" <> 'CANCELLED';

      -- Subscription items: one row per licensed module on a subscription.
      CREATE TABLE "billing_subscription_items" (
        "id"               UUID NOT NULL DEFAULT gen_random_uuid(),
        "subscription_id"  UUID NOT NULL REFERENCES "billing_subscriptions"("id") ON DELETE CASCADE,
        "module_code"      VARCHAR(64) NOT NULL,
        "quantity"         INT NOT NULL DEFAULT 1,
        "unit_price"       NUMERIC(12,2) NOT NULL DEFAULT 0,
        "billing_cycle"    VARCHAR(16) NOT NULL,
        "created_at"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_billing_subscription_items" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_billing_subscription_items_sub_module" UNIQUE ("subscription_id", "module_code")
      );
      CREATE INDEX "IDX_billing_subscription_items_subscription_id" ON "billing_subscription_items" ("subscription_id");

      -- Payments: provider-neutral payment attempts, always tied to a quote.
      CREATE TABLE "billing_payments" (
        "id"                   UUID NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id"            UUID NOT NULL REFERENCES "tenant"("id"),
        "subscription_id"      UUID REFERENCES "billing_subscriptions"("id"),
        "quote_id"             UUID REFERENCES "billing_quotes"("id"),
        "provider"             VARCHAR(32) NOT NULL,
        "provider_payment_id"  VARCHAR(128),
        "provider_order_id"    VARCHAR(128),
        "amount"               NUMERIC(12,2) NOT NULL,
        "currency"             VARCHAR(8) NOT NULL DEFAULT 'INR',
        "status"               VARCHAR(24) NOT NULL DEFAULT 'CREATED',
        "paid_at"              TIMESTAMPTZ,
        "failure_reason"       TEXT,
        "metadata"             JSONB NOT NULL DEFAULT '{}',
        "created_at"           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_billing_payments" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_billing_payments_status" CHECK ("status" IN ('CREATED','PENDING','SUCCESS','FAILED'))
      );
      CREATE INDEX "IDX_billing_payments_tenant_id" ON "billing_payments" ("tenant_id");
      CREATE INDEX "IDX_billing_payments_provider_order_id" ON "billing_payments" ("provider_order_id");
      CREATE INDEX "IDX_billing_payments_provider_payment_id" ON "billing_payments" ("provider_payment_id");
      CREATE INDEX "IDX_billing_payments_quote_id" ON "billing_payments" ("quote_id");

      -- Invoices.
      CREATE TABLE "billing_invoices" (
        "id"               UUID NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id"        UUID NOT NULL REFERENCES "tenant"("id"),
        "subscription_id"  UUID REFERENCES "billing_subscriptions"("id"),
        "payment_id"       UUID REFERENCES "billing_payments"("id"),
        "invoice_number"   VARCHAR(64) NOT NULL,
        "amount"           NUMERIC(12,2) NOT NULL,
        "tax"              NUMERIC(12,2) NOT NULL DEFAULT 0,
        "currency"         VARCHAR(8) NOT NULL DEFAULT 'INR',
        "status"           VARCHAR(16) NOT NULL DEFAULT 'ISSUED',
        "issued_at"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_billing_invoices" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_billing_invoices_number" UNIQUE ("invoice_number")
      );
      CREATE INDEX "IDX_billing_invoices_tenant_id" ON "billing_invoices" ("tenant_id");

      -- Webhook events: idempotency ledger for inbound provider webhooks.
      CREATE TABLE "billing_webhook_events" (
        "id"            UUID NOT NULL DEFAULT gen_random_uuid(),
        "provider"      VARCHAR(32) NOT NULL,
        "event_id"      VARCHAR(255) NOT NULL,
        "event_type"    VARCHAR(128) NOT NULL,
        "payload"       JSONB NOT NULL,
        "processed"     BOOLEAN NOT NULL DEFAULT false,
        "processed_at"  TIMESTAMPTZ,
        "created_at"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_billing_webhook_events" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_billing_webhook_events_provider_event" UNIQUE ("provider", "event_id")
      );
      CREATE INDEX "IDX_billing_webhook_events_processed" ON "billing_webhook_events" ("processed");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS "billing_webhook_events";
      DROP TABLE IF EXISTS "billing_invoices";
      DROP TABLE IF EXISTS "billing_payments";
      DROP TABLE IF EXISTS "billing_subscription_items";
      DROP TABLE IF EXISTS "billing_subscriptions";
      DROP TABLE IF EXISTS "billing_quotes";
    `);
  }
}
