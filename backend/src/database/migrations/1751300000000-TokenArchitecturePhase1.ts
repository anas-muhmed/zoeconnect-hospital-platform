import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Token Architecture Phase 1 --- New tables for enterprise token management.
 *
 * New tables:
 *   token_branch_config      --- per-branch mode (SERVICE_CENTER_BASED | LOCATION_BASED)
 *   token_kiosks             --- permanent kiosk registry (kiosk_slug never changes)
 *   token_kiosk_assignments  --- maps kiosks to locations or service centers
 *   token_sc_configs         --- per-service-center config (HIS-based mode)
 *   token_records            --- every issued token (persistent, replaces ephemeral Redis)
 *   token_sequences          --- daily atomic sequence per location/SC
 *   token_kiosk_branding     --- per-branch kiosk branding (logo, colors, messages)
 *   token_analytics_daily    --- pre-aggregated daily analytics
 *   token_audit_logs         --- immutable config-change audit trail
 *
 * Existing tables (token_locations, token_counters, token_calls, display_pages)
 * are NOT modified --- full backward compatibility is preserved.
 */
export class TokenArchitecturePhase11751300000000 implements MigrationInterface {
  name = 'TokenArchitecturePhase11751300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ------ 1. token_branch_config ------------------------------------------------------------------------------------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "token_branch_config" (
        "id"               UUID        NOT NULL DEFAULT gen_random_uuid(),
        "branch_id"        VARCHAR(30) NOT NULL,
        "mode"             VARCHAR(30) NOT NULL DEFAULT 'LOCATION_BASED',
        "daily_reset_time" TIME        NOT NULL DEFAULT '00:00:00',
        "timezone"         VARCHAR(60) NOT NULL DEFAULT 'Asia/Kolkata',
        "created_at"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_by"       VARCHAR(100),
        CONSTRAINT "pk_token_branch_config" PRIMARY KEY ("id"),
        CONSTRAINT "uq_token_branch_config_branch" UNIQUE ("branch_id"),
        CONSTRAINT "chk_token_branch_config_mode"
          CHECK ("mode" IN ('SERVICE_CENTER_BASED', 'LOCATION_BASED'))
      )
    `);

    // ------ 2. token_kiosks ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "token_kiosks" (
        "id"           UUID         NOT NULL DEFAULT gen_random_uuid(),
        "branch_id"    VARCHAR(30)  NOT NULL,
        "kiosk_slug"   VARCHAR(12)  NOT NULL,
        "name"         VARCHAR(100) NOT NULL,
        "kiosk_type"   VARCHAR(20)  NOT NULL DEFAULT 'MULTIPLE',
        "description"  TEXT,
        "is_active"    BOOLEAN      NOT NULL DEFAULT TRUE,
        "is_archived"  BOOLEAN      NOT NULL DEFAULT FALSE,
        "archived_at"  TIMESTAMPTZ,
        "archived_by"  VARCHAR(100),
        "created_at"   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "updated_at"   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "created_by"   VARCHAR(100),
        CONSTRAINT "pk_token_kiosks" PRIMARY KEY ("id"),
        CONSTRAINT "uq_token_kiosks_slug" UNIQUE ("kiosk_slug"),
        CONSTRAINT "chk_token_kiosks_type"
          CHECK ("kiosk_type" IN ('MULTIPLE', 'SINGLE', 'DISPLAY_ONLY'))
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_token_kiosks_branch"
        ON "token_kiosks" ("branch_id", "is_active")
    `);

    // ------ 3. token_kiosk_assignments ------------------------------------------------------------------------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "token_kiosk_assignments" (
        "id"                  UUID         NOT NULL DEFAULT gen_random_uuid(),
        "kiosk_id"            UUID         NOT NULL,
        "branch_id"           VARCHAR(30)  NOT NULL,
        "assignment_type"     VARCHAR(20)  NOT NULL,
        -- SERVICE_CENTER mode fields:
        "department_id"       VARCHAR(30),
        "department_name"     VARCHAR(255),
        "service_center_id"   VARCHAR(30),
        "service_center_name" VARCHAR(255),
        "intrabranchid"       VARCHAR(30),
        -- LOCATION mode fields:
        "location_id"         UUID,
        "display_order"       INT          NOT NULL DEFAULT 0,
        "is_active"           BOOLEAN      NOT NULL DEFAULT TRUE,
        "merged_at"           TIMESTAMPTZ,
        "merged_by"           VARCHAR(100),
        "created_at"          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_token_kiosk_assignments" PRIMARY KEY ("id"),
        CONSTRAINT "fk_tka_kiosk"
          FOREIGN KEY ("kiosk_id") REFERENCES "token_kiosks"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_tka_location"
          FOREIGN KEY ("location_id") REFERENCES "token_locations"("id") ON DELETE SET NULL,
        CONSTRAINT "chk_tka_type"
          CHECK ("assignment_type" IN ('SERVICE_CENTER', 'LOCATION'))
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_tka_kiosk"
        ON "token_kiosk_assignments" ("kiosk_id", "is_active")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_tka_location"
        ON "token_kiosk_assignments" ("location_id")
        WHERE "location_id" IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_tka_sc"
        ON "token_kiosk_assignments" ("branch_id", "service_center_id")
        WHERE "service_center_id" IS NOT NULL
    `);

    // ------ 4. token_sc_configs ---------------------------------------------------------------------------------------------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "token_sc_configs" (
        "id"                   UUID         NOT NULL DEFAULT gen_random_uuid(),
        "branch_id"            VARCHAR(30)  NOT NULL,
        "department_id"        VARCHAR(30)  NOT NULL,
        "department_name"      VARCHAR(255) NOT NULL,
        "service_center_id"    VARCHAR(30)  NOT NULL,
        "service_center_name"  VARCHAR(255) NOT NULL,
        "intrabranchid"        VARCHAR(30),
        "token_prefix"         VARCHAR(10)  NOT NULL DEFAULT '',
        "start_number"         INT          NOT NULL DEFAULT 1,
        "max_number"           INT          NOT NULL DEFAULT 999,
        "reset_daily"          BOOLEAN      NOT NULL DEFAULT TRUE,
        "is_active"            BOOLEAN      NOT NULL DEFAULT TRUE,
        "created_at"           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "updated_at"           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_token_sc_configs" PRIMARY KEY ("id"),
        CONSTRAINT "uq_token_sc_configs_branch_sc"
          UNIQUE ("branch_id", "service_center_id")
      )
    `);

    // ------ 5. token_sequences ------------------------------------------------------------------------------------------------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "token_sequences" (
        "id"             UUID        NOT NULL DEFAULT gen_random_uuid(),
        "branch_id"      VARCHAR(30) NOT NULL,
        "reference_type" VARCHAR(20) NOT NULL,
        "reference_id"   VARCHAR(60) NOT NULL,
        "seq_date"       DATE        NOT NULL DEFAULT CURRENT_DATE,
        "current_number" INT         NOT NULL DEFAULT 0,
        "reset_at"       TIMESTAMPTZ,
        CONSTRAINT "pk_token_sequences" PRIMARY KEY ("id"),
        CONSTRAINT "uq_token_sequences_unique"
          UNIQUE ("branch_id", "reference_type", "reference_id", "seq_date"),
        CONSTRAINT "chk_token_sequences_type"
          CHECK ("reference_type" IN ('LOCATION', 'SERVICE_CENTER'))
      )
    `);

    // ------ 6. token_records ------------------------------------------------------------------------------------------------------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "token_records" (
        "id"                     UUID         NOT NULL DEFAULT gen_random_uuid(),
        "branch_id"              VARCHAR(30)  NOT NULL,
        "reference_type"         VARCHAR(20)  NOT NULL,
        "reference_id"           VARCHAR(60)  NOT NULL,
        "token_number"           INT          NOT NULL,
        "token_prefix"           VARCHAR(10)  NOT NULL DEFAULT '',
        "full_token"             VARCHAR(20)  NOT NULL,
        "token_type"             VARCHAR(20)  NOT NULL DEFAULT 'WALK_IN',
        "priority"               INT          NOT NULL DEFAULT 100,
        "status"                 VARCHAR(20)  NOT NULL DEFAULT 'WAITING',
        "counter_id"             UUID,
        "kiosk_id"               UUID,
        "appointment_id"         VARCHAR(100),
        "called_by"              VARCHAR(100),
        "called_at"              TIMESTAMPTZ,
        "served_at"              TIMESTAMPTZ,
        "completed_at"           TIMESTAMPTZ,
        "estimated_wait_seconds" INT,
        "issued_at"              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "created_at"             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "reissued_from_id"       UUID,
        "reissued_to_id"         UUID,
        CONSTRAINT "pk_token_records" PRIMARY KEY ("id"),
        CONSTRAINT "fk_tr_counter"
          FOREIGN KEY ("counter_id") REFERENCES "token_counters"("id") ON DELETE SET NULL,
        CONSTRAINT "fk_tr_kiosk"
          FOREIGN KEY ("kiosk_id") REFERENCES "token_kiosks"("id") ON DELETE SET NULL,
        CONSTRAINT "fk_tr_reissued_from"
          FOREIGN KEY ("reissued_from_id") REFERENCES "token_records"("id") ON DELETE SET NULL,
        CONSTRAINT "fk_tr_reissued_to"
          FOREIGN KEY ("reissued_to_id") REFERENCES "token_records"("id") ON DELETE SET NULL,
        CONSTRAINT "chk_token_records_type"
          CHECK ("token_type" IN ('WALK_IN','VIP','APPOINTMENT','EMERGENCY','ONLINE')),
        CONSTRAINT "chk_token_records_status"
          CHECK ("status" IN ('WAITING','CALLED','SERVING','COMPLETED','MISSED',
                              'CANCELLED','ON_HOLD','RECALLED','SKIPPED','REISSUED')),
        CONSTRAINT "chk_token_records_ref_type"
          CHECK ("reference_type" IN ('LOCATION', 'SERVICE_CENTER'))
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_tr_branch_ref_date"
        ON "token_records" ("branch_id", "reference_id", "issued_at" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_tr_status"
        ON "token_records" ("status")
        WHERE "status" IN ('WAITING','CALLED','SERVING','ON_HOLD')
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_tr_counter"
        ON "token_records" ("counter_id", "issued_at" DESC)
        WHERE "counter_id" IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_tr_kiosk"
        ON "token_records" ("kiosk_id", "issued_at" DESC)
        WHERE "kiosk_id" IS NOT NULL
    `);

    // ------ 7. token_kiosk_branding ---------------------------------------------------------------------------------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "token_kiosk_branding" (
        "id"               UUID         NOT NULL DEFAULT gen_random_uuid(),
        "branch_id"        VARCHAR(30)  NOT NULL,
        "hospital_name"    VARCHAR(255),
        "logo_url"         VARCHAR(500),
        "primary_color"    VARCHAR(20)  NOT NULL DEFAULT '#059669',
        "secondary_color"  VARCHAR(20)  NOT NULL DEFAULT '#0f172a',
        "background_url"   VARCHAR(500),
        "welcome_message"  JSONB        NOT NULL DEFAULT '{"en":"Welcome"}',
        "available_langs"  TEXT[]       NOT NULL DEFAULT ARRAY['en'],
        "font_size_mode"   VARCHAR(20)  NOT NULL DEFAULT 'NORMAL',
        "footer_text"      TEXT,
        "updated_at"       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "updated_by"       VARCHAR(100),
        CONSTRAINT "pk_token_kiosk_branding" PRIMARY KEY ("id"),
        CONSTRAINT "uq_token_kiosk_branding_branch" UNIQUE ("branch_id"),
        CONSTRAINT "chk_tkb_font_size"
          CHECK ("font_size_mode" IN ('NORMAL','LARGE','EXTRA_LARGE'))
      )
    `);

    // ------ 8. token_analytics_daily ------------------------------------------------------------------------------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "token_analytics_daily" (
        "id"               UUID        NOT NULL DEFAULT gen_random_uuid(),
        "branch_id"        VARCHAR(30) NOT NULL,
        "reference_type"   VARCHAR(20) NOT NULL,
        "reference_id"     VARCHAR(60) NOT NULL,
        "analytics_date"   DATE        NOT NULL,
        "total_issued"     INT         NOT NULL DEFAULT 0,
        "total_called"     INT         NOT NULL DEFAULT 0,
        "total_completed"  INT         NOT NULL DEFAULT 0,
        "total_missed"     INT         NOT NULL DEFAULT 0,
        "total_cancelled"  INT         NOT NULL DEFAULT 0,
        "total_on_hold"    INT         NOT NULL DEFAULT 0,
        "avg_wait_seconds" INT,
        "avg_serve_seconds" INT,
        "peak_hour"        SMALLINT,
        "peak_hour_volume" INT,
        "by_type"          JSONB       NOT NULL DEFAULT '{}',
        "by_counter"       JSONB       NOT NULL DEFAULT '{}',
        "created_at"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_token_analytics_daily" PRIMARY KEY ("id"),
        CONSTRAINT "uq_token_analytics_daily_unique"
          UNIQUE ("branch_id", "reference_type", "reference_id", "analytics_date")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_tad_branch_date"
        ON "token_analytics_daily" ("branch_id", "analytics_date" DESC)
    `);

    // ------ 9. token_audit_logs ---------------------------------------------------------------------------------------------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "token_audit_logs" (
        "id"           UUID         NOT NULL DEFAULT gen_random_uuid(),
        "branch_id"    VARCHAR(30),
        "entity_type"  VARCHAR(60)  NOT NULL,
        "entity_id"    VARCHAR(100),
        "action"       VARCHAR(30)  NOT NULL,
        "changed_by"   VARCHAR(100) NOT NULL,
        "changed_at"   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "before_state" JSONB,
        "after_state"  JSONB,
        "ip_address"   VARCHAR(45),
        "user_agent"   TEXT,
        CONSTRAINT "pk_token_audit_logs" PRIMARY KEY ("id"),
        CONSTRAINT "chk_tal_action"
          CHECK ("action" IN ('CREATE','UPDATE','DELETE','ARCHIVE','ENABLE','DISABLE'))
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_tal_branch_date"
        ON "token_audit_logs" ("branch_id", "changed_at" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_tal_entity"
        ON "token_audit_logs" ("entity_type", "entity_id")
    `);

    // ------ 10. New permissions ---------------------------------------------------------------------------------------------------------------------------------------------------------
    await queryRunner.query(`
      INSERT INTO "permissions" ("module_code","resource","action","description") VALUES
        ('TOKEN','KIOSK',    'MANAGE',   'Create/edit/archive kiosks and assignments'),
        ('TOKEN','ANALYTICS','READ',     'View token analytics and reports'),
        ('TOKEN','CONFIG',   'WRITE',    'Configure branch token mode and settings'),
        ('TOKEN','COUNTER',  'OPERATE',  'Call tokens from a counter')
      ON CONFLICT ("module_code","resource","action") DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id","permission_id")
      SELECT r.id, p.id
      FROM   "roles" r
      CROSS JOIN "permissions" p
      WHERE  r.name IN ('SUPER_ADMIN','HOSPITAL_ADMIN')
        AND  p.module_code = 'TOKEN'
        AND  p.resource IN ('KIOSK','ANALYTICS','CONFIG')
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "token_audit_logs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "token_analytics_daily"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "token_kiosk_branding"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "token_records"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "token_sequences"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "token_sc_configs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "token_kiosk_assignments"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "token_kiosks"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "token_branch_config"`);

    await queryRunner.query(`
      DELETE FROM "permissions"
      WHERE "module_code" = 'TOKEN'
        AND "resource" IN ('KIOSK','ANALYTICS')
        AND "action" IN ('MANAGE','READ')
    `);
  }
}
