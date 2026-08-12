import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration 006 — Notification V2 Schema
 *
 * Drops the placeholder notification tables from migration 004 and creates
 * the production-aligned tables matching our TypeORM entities:
 *   - notification_templates  (maps to NotificationTemplate entity)
 *   - notification_logs       (maps to NotificationLog entity)
 */
export class CreateNotificationV2Schema1700000006000 implements MigrationInterface {
  name = 'CreateNotificationV2Schema1700000006000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop placeholder tables from migration 004
    await queryRunner.query(`DROP TABLE IF EXISTS "notifications" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "notification_templates" CASCADE`);

    // ── notification_templates ─────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "notification_templates" (
        "id"                 UUID          NOT NULL DEFAULT gen_random_uuid(),
        "name"               VARCHAR(120)  NOT NULL,
        "event_type"         VARCHAR(60)   NOT NULL,
        "channel"            VARCHAR(20)   NOT NULL,
        "template_name"      VARCHAR(120)  NOT NULL,
        "language_code"      VARCHAR(10)   NOT NULL DEFAULT 'en_US',
        "param_descriptions" JSONB         NOT NULL DEFAULT '[]',
        "body_preview"       TEXT,
        "is_active"          BOOLEAN       NOT NULL DEFAULT true,
        "created_at"         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        "updated_at"         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_notification_templates" PRIMARY KEY ("id"),
        CONSTRAINT "uq_notification_templates_event_channel" UNIQUE ("event_type", "channel"),
        CONSTRAINT "chk_notification_templates_channel"
          CHECK ("channel" IN ('WHATSAPP', 'SMS', 'EMAIL')),
        CONSTRAINT "chk_notification_templates_event_type"
          CHECK ("event_type" IN (
            'WELCOME', 'EARN_POINTS', 'REDEEM_POINTS',
            'BIRTHDAY_BONUS', 'CAMPAIGN_BONUS', 'TIER_UPGRADE',
            'ACCOUNT_EXPIRY_WARNING', 'CUSTOM'
          ))
      )
    `);

    // ── notification_logs ──────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "notification_logs" (
        "id"                   UUID          NOT NULL DEFAULT gen_random_uuid(),
        "phone"                VARCHAR(20)   NOT NULL,
        "channel"              VARCHAR(20)   NOT NULL,
        "event_type"           VARCHAR(60)   NOT NULL,
        "template_name"        VARCHAR(120)  NOT NULL,
        "language_code"        VARCHAR(10)   NOT NULL DEFAULT 'en_US',
        "template_params"      JSONB         NOT NULL DEFAULT '[]',
        "status"               VARCHAR(20)   NOT NULL DEFAULT 'PENDING',
        "provider_message_id"  VARCHAR(120),
        "error_message"        TEXT,
        "attempts"             SMALLINT      NOT NULL DEFAULT 0,
        "loyalty_account_id"   UUID,
        "mrn"                  VARCHAR(40),
        "metadata"             JSONB,
        "created_at"           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        "updated_at"           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_notification_logs" PRIMARY KEY ("id"),
        CONSTRAINT "chk_notification_logs_status"
          CHECK ("status" IN ('PENDING', 'SENT', 'FAILED', 'DELIVERED')),
        CONSTRAINT "chk_notification_logs_channel"
          CHECK ("channel" IN ('WHATSAPP', 'SMS', 'EMAIL'))
      )
    `);

    // ── Indexes ────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE INDEX "idx_notification_logs_phone"
        ON "notification_logs" ("phone")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_notification_logs_status_created"
        ON "notification_logs" ("status", "created_at")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_notification_logs_loyalty_account"
        ON "notification_logs" ("loyalty_account_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_notification_logs_event_loyalty"
        ON "notification_logs" ("loyalty_account_id", "event_type")
    `);

    // Seed default WhatsApp templates
    await queryRunner.query(`
      INSERT INTO "notification_templates"
        ("name", "event_type", "channel", "template_name", "language_code", "param_descriptions", "body_preview")
      VALUES
        ('Welcome Message',     'WELCOME',       'WHATSAPP', 'hdsp_welcome',       'en_US',
          '["Patient name", "Card number", "Tier name"]'::jsonb,
          'Welcome {{1}}! Your loyalty card {{2}} ({{3}}) is now active.'),

        ('Points Earned',       'EARN_POINTS',   'WHATSAPP', 'hdsp_earn_points',   'en_US',
          '["Patient name", "Points earned", "Total balance", "Bill reference"]'::jsonb,
          'Hi {{1}}, you earned {{2}} points on bill {{4}}. Total balance: {{3}} pts.'),

        ('Points Redeemed',     'REDEEM_POINTS', 'WHATSAPP', 'hdsp_redeem_points', 'en_US',
          '["Patient name", "Points redeemed", "Remaining balance"]'::jsonb,
          'Hi {{1}}, {{2}} points have been redeemed. Remaining balance: {{3}} pts.'),

        ('Birthday Bonus',      'BIRTHDAY_BONUS','WHATSAPP', 'hdsp_birthday_bonus','en_US',
          '["Patient name", "Bonus points", "Total balance"]'::jsonb,
          'Happy Birthday {{1}}! We have added {{2}} bonus points to your account. Balance: {{3}} pts.'),

        ('Campaign Bonus',      'CAMPAIGN_BONUS','WHATSAPP', 'hdsp_campaign_bonus','en_US',
          '["Patient name", "Campaign name", "Bonus points", "Total balance"]'::jsonb,
          'Hi {{1}}, you received {{3}} bonus points from our {{2}} campaign! Balance: {{4}} pts.'),

        ('Tier Upgrade',        'TIER_UPGRADE',  'WHATSAPP', 'hdsp_tier_upgrade',  'en_US',
          '["Patient name", "New tier name", "Old tier name"]'::jsonb,
          'Congratulations {{1}}! You have been upgraded from {{3}} to {{2}} tier.')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "notification_logs" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "notification_templates" CASCADE`);
  }
}
