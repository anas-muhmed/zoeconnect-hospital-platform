import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration 004 — Notification Schema
 * Creates: notification_templates, notifications
 */
export class CreateNotificationSchema1700000004000 implements MigrationInterface {
  name = 'CreateNotificationSchema1700000004000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── notification_templates ─────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "notification_templates" (
        "id"              UUID         NOT NULL DEFAULT gen_random_uuid(),
        "code"            VARCHAR(100) NOT NULL,
        "channel"         VARCHAR(20)  NOT NULL,
        "name"            VARCHAR(255) NOT NULL,
        "subject"         VARCHAR(500),
        "body_template"   TEXT         NOT NULL,
        "variables_json"  JSONB        NOT NULL DEFAULT '[]',
        "is_active"       BOOLEAN      NOT NULL DEFAULT true,
        "created_at"      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "updated_at"      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_notification_templates" PRIMARY KEY ("id"),
        CONSTRAINT "uq_notification_templates" UNIQUE ("code", "channel"),
        CONSTRAINT "chk_notification_channel"
          CHECK ("channel" IN ('WHATSAPP','SMS','EMAIL','PUSH'))
      )
    `);

    // ── notifications (outbox) ─────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "notifications" (
        "id"              UUID         NOT NULL DEFAULT gen_random_uuid(),
        "account_id"      UUID,
        "recipient"       VARCHAR(255) NOT NULL,
        "channel"         VARCHAR(20)  NOT NULL,
        "template_id"     UUID         REFERENCES "notification_templates"("id"),
        "payload_json"    JSONB        NOT NULL,
        "status"          VARCHAR(20)  NOT NULL DEFAULT 'PENDING',
        "scheduled_at"    TIMESTAMPTZ,
        "sent_at"         TIMESTAMPTZ,
        "error_message"   TEXT,
        "retry_count"     SMALLINT     NOT NULL DEFAULT 0,
        "max_retries"     SMALLINT     NOT NULL DEFAULT 3,
        "created_at"      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "updated_at"      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_notifications" PRIMARY KEY ("id"),
        CONSTRAINT "chk_notification_status"
          CHECK ("status" IN ('PENDING','PROCESSING','SENT','FAILED','CANCELLED'))
      )
    `);

    // ── Indexes ───────────────────────────────────────────────────
    await queryRunner.query(`CREATE INDEX "idx_notifications_status"     ON "notifications"("status","created_at")`);
    await queryRunner.query(`CREATE INDEX "idx_notifications_account"    ON "notifications"("account_id")`);
    await queryRunner.query(`CREATE INDEX "idx_notifications_scheduled"  ON "notifications"("scheduled_at") WHERE "status" = 'PENDING'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "notifications" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "notification_templates" CASCADE`);
  }
}
