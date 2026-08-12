import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds CMS Phase 2 scheduling: cms_playlist_schedules.
 * No new permissions -- schedule CRUD reuses CMS:DISPLAY:MANAGE (schedules
 * are edited from the Display Assignments page and only make sense in the
 * context of a specific display).
 */
export class CreateCmsScheduling1783500000000 implements MigrationInterface {
  name = 'CreateCmsScheduling1783500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "cms_playlist_schedules" (
        "id"                    UUID NOT NULL DEFAULT gen_random_uuid(),
        "display_assignment_id" UUID NOT NULL,
        "playlist_id"           UUID NOT NULL,
        "name"                  VARCHAR(200) NOT NULL,
        "start_time"            TIME,
        "end_time"              TIME,
        "start_date"            DATE,
        "end_date"              DATE,
        "priority"              INT NOT NULL DEFAULT 0,
        "is_active"             BOOLEAN NOT NULL DEFAULT TRUE,
        "created_by"            VARCHAR(100) NOT NULL,
        "created_at"            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_cms_playlist_schedules" PRIMARY KEY ("id"),
        CONSTRAINT "FK_cms_playlist_schedules_display" FOREIGN KEY ("display_assignment_id") REFERENCES "cms_display_assignments" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_cms_playlist_schedules_playlist" FOREIGN KEY ("playlist_id") REFERENCES "cms_playlists" ("id") ON DELETE CASCADE
      );
      CREATE INDEX "IDX_cms_playlist_schedules_display" ON "cms_playlist_schedules" ("display_assignment_id", "is_active");
      CREATE INDEX "IDX_cms_playlist_schedules_playlist" ON "cms_playlist_schedules" ("playlist_id");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "cms_playlist_schedules";`);
  }
}
