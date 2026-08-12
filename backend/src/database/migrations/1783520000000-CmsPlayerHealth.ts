import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * CMS Phase 3 (player robustness): adds a last-reported-health snapshot to
 * cms_display_assignments, populated by the player's periodic health POST
 * (POST /cms/player/:slug/health). One row per display, upserted -- not a
 * history table.
 */
export class CmsPlayerHealth1783520000000 implements MigrationInterface {
  name = 'CmsPlayerHealth1783520000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "cms_display_assignments"
        ADD COLUMN "is_player_online"       BOOLEAN,
        ADD COLUMN "current_playlist_id"    UUID,
        ADD COLUMN "current_item_label"     VARCHAR(255),
        ADD COLUMN "current_version_number" INT,
        ADD COLUMN "last_sync_at"           TIMESTAMPTZ,
        ADD COLUMN "cache_status"           VARCHAR(20),
        ADD COLUMN "last_error"             TEXT,
        ADD COLUMN "storage_usage_bytes"    BIGINT;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "cms_display_assignments"
        DROP COLUMN IF EXISTS "is_player_online",
        DROP COLUMN IF EXISTS "current_playlist_id",
        DROP COLUMN IF EXISTS "current_item_label",
        DROP COLUMN IF EXISTS "current_version_number",
        DROP COLUMN IF EXISTS "last_sync_at",
        DROP COLUMN IF EXISTS "cache_status",
        DROP COLUMN IF EXISTS "last_error",
        DROP COLUMN IF EXISTS "storage_usage_bytes";
    `);
  }
}
