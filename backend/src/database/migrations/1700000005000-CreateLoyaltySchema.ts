import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration 005 — Loyalty Schema
 * Creates: card_categories, loyalty_accounts, loyalty_transactions,
 *          campaigns, point_rules, reward_catalog, reward_redemptions
 *
 * This is the core business schema for the Patient Loyalty Module.
 */
export class CreateLoyaltySchema1700000005000 implements MigrationInterface {
  name = 'CreateLoyaltySchema1700000005000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── card_categories ───────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "card_categories" (
        "id"                   UUID            NOT NULL DEFAULT gen_random_uuid(),
        "code"                 VARCHAR(20)     NOT NULL,
        "name"                 VARCHAR(100)    NOT NULL,
        "min_spend"            NUMERIC(12,2)   NOT NULL,
        "max_spend"            NUMERIC(12,2),
        "earn_rate_per_100"    NUMERIC(5,2)    NOT NULL DEFAULT 1.00,
        "point_value_per_100"  NUMERIC(8,2)    NOT NULL,
        "discount_thresholds"  JSONB           NOT NULL DEFAULT '[]',
        "base_discount_pct"    NUMERIC(5,2),
        "display_order"        SMALLINT        NOT NULL DEFAULT 0,
        "colour_hex"           VARCHAR(7)      DEFAULT '#808080',
        "is_active"            BOOLEAN         NOT NULL DEFAULT true,
        "updated_by"           UUID            REFERENCES "users"("id") ON DELETE SET NULL,
        "updated_at"           TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_card_categories" PRIMARY KEY ("id"),
        CONSTRAINT "uq_card_categories_code" UNIQUE ("code"),
        CONSTRAINT "chk_earn_rate" CHECK ("earn_rate_per_100" > 0),
        CONSTRAINT "chk_point_value" CHECK ("point_value_per_100" > 0),
        CONSTRAINT "chk_min_spend" CHECK ("min_spend" >= 0)
      )
    `);

    // ── loyalty_accounts ───────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "loyalty_accounts" (
        "id"                     UUID          NOT NULL DEFAULT gen_random_uuid(),
        "patient_mrn"            VARCHAR(50)   NOT NULL,
        "patient_name"           VARCHAR(255)  NOT NULL,
        "patient_mobile"         VARCHAR(20),
        "patient_dob"            DATE,
        "patient_gender"         CHAR(1),
        "card_number"            VARCHAR(30)   NOT NULL,
        "card_category_id"       UUID          NOT NULL REFERENCES "card_categories"("id"),
        "total_lifetime_spend"   NUMERIC(14,2) NOT NULL DEFAULT 0,
        "total_points_earned"    NUMERIC(14,2) NOT NULL DEFAULT 0,
        "total_points_redeemed"  NUMERIC(14,2) NOT NULL DEFAULT 0,
        "total_points_expired"   NUMERIC(14,2) NOT NULL DEFAULT 0,
        "available_points"       NUMERIC(14,2) NOT NULL DEFAULT 0,
        "card_value_balance"     NUMERIC(12,2) NOT NULL DEFAULT 0,
        "status"                 VARCHAR(20)   NOT NULL DEFAULT 'ACTIVE',
        "enrolled_by"            UUID          NOT NULL REFERENCES "users"("id"),
        "enrolled_at"            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        "last_transaction_at"    TIMESTAMPTZ,
        "notes"                  TEXT,
        "updated_at"             TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_loyalty_accounts" PRIMARY KEY ("id"),
        CONSTRAINT "uq_loyalty_patient_mrn" UNIQUE ("patient_mrn"),
        CONSTRAINT "uq_loyalty_card_number" UNIQUE ("card_number"),
        CONSTRAINT "chk_loyalty_status"
          CHECK ("status" IN ('ACTIVE','SUSPENDED','CANCELLED')),
        CONSTRAINT "chk_available_points" CHECK ("available_points" >= 0),
        CONSTRAINT "chk_card_value_balance" CHECK ("card_value_balance" >= 0)
      )
    `);

    // ── loyalty_transactions ───────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "loyalty_transactions" (
        "id"                 UUID          NOT NULL DEFAULT gen_random_uuid(),
        "account_id"         UUID          NOT NULL REFERENCES "loyalty_accounts"("id"),
        "transaction_type"   VARCHAR(30)   NOT NULL,
        "reference_type"     VARCHAR(30)   NOT NULL,
        "reference_id"       VARCHAR(100)  NOT NULL,
        "bill_amount"        NUMERIC(12,2),
        "points_delta"       NUMERIC(12,2) NOT NULL,
        "card_value_delta"   NUMERIC(10,2) NOT NULL DEFAULT 0,
        "discount_applied"   NUMERIC(10,2),
        "discount_percentage" NUMERIC(5,2),
        "balance_before"     NUMERIC(14,2) NOT NULL,
        "balance_after"      NUMERIC(14,2) NOT NULL,
        "campaign_id"        UUID,
        "created_by"         UUID          NOT NULL REFERENCES "users"("id"),
        "created_at"         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        "notes"              TEXT,
        CONSTRAINT "pk_loyalty_transactions" PRIMARY KEY ("id"),
        CONSTRAINT "chk_transaction_type"
          CHECK ("transaction_type" IN ('EARN','REDEEM','REVERSE','EXPIRE','ADJUST')),
        CONSTRAINT "chk_reference_type"
          CHECK ("reference_type" IN ('BILL','VISIT','CAMPAIGN','MANUAL'))
      )
    `);

    // Idempotency: each bill can only create ONE earn transaction per account
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_earn_per_bill"
        ON "loyalty_transactions"("account_id","reference_id")
        WHERE "transaction_type" = 'EARN' AND "reference_type" = 'BILL'
    `);

    // ── campaigns ─────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "campaigns" (
        "id"                    UUID          NOT NULL DEFAULT gen_random_uuid(),
        "name"                  VARCHAR(255)  NOT NULL,
        "campaign_type"         VARCHAR(50)   NOT NULL,
        "description"           TEXT,
        "start_date"            TIMESTAMPTZ   NOT NULL,
        "end_date"              TIMESTAMPTZ   NOT NULL,
        "eligible_card_codes"   VARCHAR(20)[] NOT NULL DEFAULT '{}',
        "earn_multiplier"       NUMERIC(5,2)  NOT NULL DEFAULT 1.00,
        "bonus_points_flat"     NUMERIC(10,2) NOT NULL DEFAULT 0,
        "conditions"            JSONB,
        "is_active"             BOOLEAN       NOT NULL DEFAULT true,
        "priority"              SMALLINT      NOT NULL DEFAULT 0,
        "created_by"            UUID          NOT NULL REFERENCES "users"("id"),
        "created_at"            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        "updated_at"            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_campaigns" PRIMARY KEY ("id"),
        CONSTRAINT "chk_campaign_type"
          CHECK ("campaign_type" IN ('FESTIVAL','BIRTHDAY','MANUAL','SCHEDULED')),
        CONSTRAINT "chk_campaign_dates" CHECK ("end_date" > "start_date"),
        CONSTRAINT "chk_earn_multiplier" CHECK ("earn_multiplier" > 0)
      )
    `);

    // ── point_rules ────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "point_rules" (
        "id"                UUID          NOT NULL DEFAULT gen_random_uuid(),
        "card_category_id"  UUID          NOT NULL REFERENCES "card_categories"("id"),
        "rule_type"         VARCHAR(50)   NOT NULL,
        "min_spend"         NUMERIC(12,2) NOT NULL DEFAULT 0,
        "max_spend"         NUMERIC(12,2),
        "earn_rate"         NUMERIC(5,2)  NOT NULL,
        "bonus_rate"        NUMERIC(5,2)  NOT NULL DEFAULT 0,
        "valid_from"        TIMESTAMPTZ   NOT NULL,
        "valid_to"          TIMESTAMPTZ,
        "priority"          SMALLINT      NOT NULL DEFAULT 0,
        "is_active"         BOOLEAN       NOT NULL DEFAULT true,
        "created_at"        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_point_rules" PRIMARY KEY ("id"),
        CONSTRAINT "chk_earn_rate_positive" CHECK ("earn_rate" >= 0)
      )
    `);

    // ── reward_catalog ─────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "reward_catalog" (
        "id"              UUID          NOT NULL DEFAULT gen_random_uuid(),
        "name"            VARCHAR(255)  NOT NULL,
        "description"     TEXT,
        "points_required" NUMERIC(10,2) NOT NULL,
        "reward_type"     VARCHAR(50)   NOT NULL,
        "value"           NUMERIC(10,2),
        "stock_quantity"  INTEGER,
        "valid_from"      TIMESTAMPTZ,
        "valid_to"        TIMESTAMPTZ,
        "is_active"       BOOLEAN       NOT NULL DEFAULT true,
        "created_at"      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        "updated_at"      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_reward_catalog" PRIMARY KEY ("id"),
        CONSTRAINT "chk_points_required" CHECK ("points_required" > 0)
      )
    `);

    // ── reward_redemptions ─────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "reward_redemptions" (
        "id"              UUID          NOT NULL DEFAULT gen_random_uuid(),
        "account_id"      UUID          NOT NULL REFERENCES "loyalty_accounts"("id"),
        "catalog_id"      UUID          NOT NULL REFERENCES "reward_catalog"("id"),
        "points_used"     NUMERIC(10,2) NOT NULL,
        "status"          VARCHAR(20)   NOT NULL DEFAULT 'PENDING',
        "redeemed_at"     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        "approved_by"     UUID          REFERENCES "users"("id"),
        "approved_at"     TIMESTAMPTZ,
        "notes"           TEXT,
        CONSTRAINT "pk_reward_redemptions" PRIMARY KEY ("id"),
        CONSTRAINT "chk_redemption_status"
          CHECK ("status" IN ('PENDING','APPROVED','REJECTED','CANCELLED'))
      )
    `);

    // ── Indexes ───────────────────────────────────────────────────
    await queryRunner.query(`CREATE INDEX "idx_la_category"          ON "loyalty_accounts"("card_category_id")`);
    await queryRunner.query(`CREATE INDEX "idx_la_status"            ON "loyalty_accounts"("status")`);
    await queryRunner.query(`CREATE INDEX "idx_la_last_txn"          ON "loyalty_accounts"("last_transaction_at" DESC)`);
    await queryRunner.query(`CREATE INDEX "idx_lt_account_date"      ON "loyalty_transactions"("account_id","created_at" DESC)`);
    await queryRunner.query(`CREATE INDEX "idx_lt_reference"         ON "loyalty_transactions"("reference_type","reference_id")`);
    await queryRunner.query(`CREATE INDEX "idx_campaigns_active"     ON "campaigns"("is_active","start_date","end_date") WHERE "is_active" = true`);
    await queryRunner.query(`CREATE INDEX "idx_campaigns_type"       ON "campaigns"("campaign_type","is_active")`);
    await queryRunner.query(`CREATE INDEX "idx_rr_account"           ON "reward_redemptions"("account_id","status")`);
    await queryRunner.query(`CREATE INDEX "idx_la_dob_month"         ON "loyalty_accounts"(EXTRACT(MONTH FROM "patient_dob")) WHERE "patient_dob" IS NOT NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "reward_redemptions" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "reward_catalog" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "point_rules" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "campaigns" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "loyalty_transactions" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "loyalty_accounts" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "card_categories" CASCADE`);
  }
}
