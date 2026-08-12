import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * CMS v1.0 stabilization: screen groups, display tags, remote commands,
 * maintenance mode, emergency broadcast override, global settings, and
 * server-side player log ingestion for remote diagnostics.
 */
export class CmsV1Stabilization1783530000000 implements MigrationInterface {
  name = 'CmsV1Stabilization1783530000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      -- Screen groups
      CREATE TABLE "cms_display_groups" (
        "id"          UUID NOT NULL DEFAULT gen_random_uuid(),
        "branch_id"   VARCHAR(30),
        "name"        VARCHAR(200) NOT NULL,
        "playlist_id" UUID,
        "created_by"  VARCHAR(100) NOT NULL,
        "created_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_cms_display_groups" PRIMARY KEY ("id"),
        CONSTRAINT "FK_cms_display_groups_playlist" FOREIGN KEY ("playlist_id") REFERENCES "cms_playlists" ("id") ON DELETE SET NULL
      );

      -- New columns on cms_display_assignments: group membership, tags, maintenance mode, pause state
      ALTER TABLE "cms_display_assignments"
        ADD COLUMN "group_id"             UUID,
        ADD COLUMN "tags"                 TEXT[] NOT NULL DEFAULT '{}',
        ADD COLUMN "maintenance_mode"     BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN "maintenance_message"  VARCHAR(255),
        ADD COLUMN "is_paused"            BOOLEAN NOT NULL DEFAULT FALSE;

      ALTER TABLE "cms_display_assignments"
        ADD CONSTRAINT "FK_cms_display_assignments_group" FOREIGN KEY ("group_id") REFERENCES "cms_display_groups" ("id") ON DELETE SET NULL;

      CREATE INDEX "IDX_cms_display_assignments_group" ON "cms_display_assignments" ("group_id");
      CREATE INDEX "IDX_cms_display_assignments_tags" ON "cms_display_assignments" USING GIN ("tags");

      -- Remote commands
      CREATE TABLE "cms_display_commands" (
        "id"                  UUID NOT NULL DEFAULT gen_random_uuid(),
        "display_assignment_id" UUID NOT NULL,
        "command_type"        VARCHAR(20) NOT NULL,
        "status"               VARCHAR(20) NOT NULL DEFAULT 'PENDING',
        "created_by"           VARCHAR(100) NOT NULL,
        "created_at"           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "acknowledged_at"      TIMESTAMPTZ,
        CONSTRAINT "PK_cms_display_commands" PRIMARY KEY ("id"),
        CONSTRAINT "FK_cms_display_commands_display" FOREIGN KEY ("display_assignment_id") REFERENCES "cms_display_assignments" ("id") ON DELETE CASCADE
      );
      CREATE INDEX "IDX_cms_display_commands_display_status" ON "cms_display_commands" ("display_assignment_id", "status");

      -- Emergency broadcast override
      CREATE TABLE "cms_emergency_broadcasts" (
        "id"               UUID NOT NULL DEFAULT gen_random_uuid(),
        "branch_id"        VARCHAR(30),
        "playlist_id"      UUID NOT NULL,
        "message"          VARCHAR(200) NOT NULL,
        "is_active"        BOOLEAN NOT NULL DEFAULT TRUE,
        "activated_by"     VARCHAR(100) NOT NULL,
        "activated_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "deactivated_by"   VARCHAR(100),
        "deactivated_at"   TIMESTAMPTZ,
        CONSTRAINT "PK_cms_emergency_broadcasts" PRIMARY KEY ("id"),
        CONSTRAINT "FK_cms_emergency_broadcasts_playlist" FOREIGN KEY ("playlist_id") REFERENCES "cms_playlists" ("id") ON DELETE CASCADE
      );
      CREATE INDEX "IDX_cms_emergency_broadcasts_active" ON "cms_emergency_broadcasts" ("branch_id", "is_active");

      -- Global settings (single row)
      CREATE TABLE "cms_settings" (
        "id"                             UUID NOT NULL DEFAULT gen_random_uuid(),
        "player_poll_interval_ms"        INT NOT NULL DEFAULT 30000,
        "heartbeat_interval_ms"          INT NOT NULL DEFAULT 30000,
        "retry_count"                    INT NOT NULL DEFAULT 4,
        "retry_delay_ms"                 INT NOT NULL DEFAULT 1000,
        "offline_timeout_ms"             INT NOT NULL DEFAULT 90000,
        "max_cache_size_mb"              INT NOT NULL DEFAULT 2048,
        "log_retention_days"             INT NOT NULL DEFAULT 30,
        "auto_cleanup_enabled"           BOOLEAN NOT NULL DEFAULT TRUE,
        "default_image_duration_seconds" INT NOT NULL DEFAULT 10,
        "updated_at"                     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_cms_settings" PRIMARY KEY ("id")
      );

      -- Player logs uploaded for remote diagnostics
      CREATE TABLE "cms_player_logs" (
        "id"                     UUID NOT NULL DEFAULT gen_random_uuid(),
        "display_assignment_id"  UUID NOT NULL,
        "category"               VARCHAR(30) NOT NULL,
        "message"                TEXT NOT NULL,
        "occurred_at"            TIMESTAMPTZ NOT NULL,
        "received_at"            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_cms_player_logs" PRIMARY KEY ("id"),
        CONSTRAINT "FK_cms_player_logs_display" FOREIGN KEY ("display_assignment_id") REFERENCES "cms_display_assignments" ("id") ON DELETE CASCADE
      );
      CREATE INDEX "IDX_cms_player_logs_display" ON "cms_player_logs" ("display_assignment_id", "received_at");
    `);

    // Seed the single settings row with defaults so the app never has to special-case "no row yet".
    await queryRunner.query(`INSERT INTO "cms_settings" DEFAULT VALUES;`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS "cms_player_logs";
      DROP TABLE IF EXISTS "cms_settings";
      DROP TABLE IF EXISTS "cms_emergency_broadcasts";
      DROP TABLE IF EXISTS "cms_display_commands";
      ALTER TABLE "cms_display_assignments" DROP CONSTRAINT IF EXISTS "FK_cms_display_assignments_group";
      ALTER TABLE "cms_display_assignments"
        DROP COLUMN IF EXISTS "group_id",
        DROP COLUMN IF EXISTS "tags",
        DROP COLUMN IF EXISTS "maintenance_mode",
        DROP COLUMN IF EXISTS "maintenance_message",
        DROP COLUMN IF EXISTS "is_paused";
      DROP TABLE IF EXISTS "cms_display_groups";
    `);
  }
}
