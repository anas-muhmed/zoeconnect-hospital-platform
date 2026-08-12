import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 5 Sprint 0: generalizes cms_playlist_items from "always a media file"
 * into a content-item model that also supports non-file-backed renderer
 * plugins (widgets) -- starting with the Queue Widget. A playlist item is
 * either media-backed (media_id set, widget_type null) or widget-backed
 * (media_id null, widget_type set, configuration holds the plugin's
 * settings as JSON) -- enforced with a CHECK constraint rather than two
 * separate tables, so ordering/reordering/enable-disable stay unified.
 */
export class CmsPluginConfig1783540000000 implements MigrationInterface {
  name = 'CmsPluginConfig1783540000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "cms_playlist_items" ALTER COLUMN "media_id" DROP NOT NULL;
      ALTER TABLE "cms_playlist_items" ADD COLUMN "widget_type" VARCHAR(50) NULL;
      ALTER TABLE "cms_playlist_items" ADD COLUMN "configuration" JSONB NULL;
      ALTER TABLE "cms_playlist_items" ADD CONSTRAINT "CHK_cms_playlist_items_content_source"
        CHECK (("media_id" IS NOT NULL AND "widget_type" IS NULL) OR ("media_id" IS NULL AND "widget_type" IS NOT NULL));
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "cms_playlist_items" DROP CONSTRAINT IF EXISTS "CHK_cms_playlist_items_content_source";
      ALTER TABLE "cms_playlist_items" DROP COLUMN IF EXISTS "configuration";
      ALTER TABLE "cms_playlist_items" DROP COLUMN IF EXISTS "widget_type";
      DELETE FROM "cms_playlist_items" WHERE "media_id" IS NULL;
      ALTER TABLE "cms_playlist_items" ALTER COLUMN "media_id" SET NOT NULL;
    `);
  }
}
