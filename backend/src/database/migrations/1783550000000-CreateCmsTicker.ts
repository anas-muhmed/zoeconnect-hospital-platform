import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Scrolling ticker for CMS displays: a persistent overlay bar, independent
 * of the playlist rotation, that an admin can enable per display -- same
 * idea as the token module's "Scrolling Ticker" canvas element, but as an
 * always-on layer rather than one element among many on a free-form canvas.
 *
 * Two pieces:
 *   1. New ticker_* columns on cms_display_assignments -- per-screen style
 *      and on/off toggle (mirrors the existing maintenance_mode/message
 *      columns added in CmsV1Stabilization).
 *   2. New cms_ticker_messages table -- the actual scrolling content, one-
 *      to-many per display, each independently prioritized and schedulable
 *      (reusing the exact time-of-day/date-range window shape already used
 *      by cms_playlist_schedules) and tagged with a source_type so future
 *      dynamic sources (emergency mirror, live queue feed, external API
 *      feed) can populate this same table without any player/rendering
 *      changes -- see CMSTickerMessage's source_type doc comment.
 */
export class CreateCmsTicker1783550000000 implements MigrationInterface {
  name = 'CreateCmsTicker1783550000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "cms_display_assignments"
        ADD COLUMN "ticker_enabled"            BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN "ticker_position"            VARCHAR(10) NOT NULL DEFAULT 'bottom',
        ADD COLUMN "ticker_speed"                NUMERIC(4,1) NOT NULL DEFAULT 3.0,
        ADD COLUMN "ticker_background_color"    VARCHAR(20),
        ADD COLUMN "ticker_text_color"          VARCHAR(20),
        ADD COLUMN "ticker_font_size"           NUMERIC(4,2) NOT NULL DEFAULT 1.4,
        ADD COLUMN "ticker_separator"           VARCHAR(50) NOT NULL DEFAULT '     •     ';

      CREATE TABLE "cms_ticker_messages" (
        "id"                     UUID NOT NULL DEFAULT gen_random_uuid(),
        "display_assignment_id"  UUID NOT NULL,
        "text"                   TEXT NOT NULL,
        "source_type"            VARCHAR(20) NOT NULL DEFAULT 'MANUAL',
        "source_ref"             VARCHAR(150),
        "priority"               INT NOT NULL DEFAULT 0,
        "start_time"             TIME,
        "end_time"               TIME,
        "start_date"             DATE,
        "end_date"               DATE,
        "is_active"              BOOLEAN NOT NULL DEFAULT TRUE,
        "created_by"             VARCHAR(100) NOT NULL,
        "created_at"             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_cms_ticker_messages" PRIMARY KEY ("id"),
        CONSTRAINT "FK_cms_ticker_messages_display" FOREIGN KEY ("display_assignment_id") REFERENCES "cms_display_assignments" ("id") ON DELETE CASCADE
      );
      CREATE INDEX "IDX_cms_ticker_messages_display_active" ON "cms_ticker_messages" ("display_assignment_id", "is_active");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS "cms_ticker_messages";
      ALTER TABLE "cms_display_assignments"
        DROP COLUMN IF EXISTS "ticker_enabled",
        DROP COLUMN IF EXISTS "ticker_position",
        DROP COLUMN IF EXISTS "ticker_speed",
        DROP COLUMN IF EXISTS "ticker_background_color",
        DROP COLUMN IF EXISTS "ticker_text_color",
        DROP COLUMN IF EXISTS "ticker_font_size",
        DROP COLUMN IF EXISTS "ticker_separator";
    `);
  }
}
