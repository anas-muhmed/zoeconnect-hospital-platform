import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the full CMS (digital signage) schema: cms_media, cms_playlists,
 * cms_playlist_items, cms_publish_versions, cms_display_assignments.
 *
 * All tables are brand new and fully independent from the existing
 * Custom Display / display_pages tables -- no shared tables, no data
 * migration from Custom Display. Also seeds CMS module permissions for
 * SUPER_ADMIN and HOSPITAL_ADMIN roles.
 */
export class CreateCmsModule1783490000000 implements MigrationInterface {
  name = 'CreateCmsModule1783490000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "cms_media" (
        "id"               UUID NOT NULL DEFAULT gen_random_uuid(),
        "branch_id"        VARCHAR(30),
        "filename"         VARCHAR(255) NOT NULL,
        "original_name"    VARCHAR(255) NOT NULL,
        "url"              VARCHAR(500) NOT NULL,
        "mime_type"        VARCHAR(100) NOT NULL,
        "media_type"       VARCHAR(10) NOT NULL,
        "size"             BIGINT NOT NULL,
        "duration_seconds" INT,
        "uploaded_by"      VARCHAR(100) NOT NULL,
        "created_at"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_cms_media" PRIMARY KEY ("id")
      );
      CREATE INDEX "IDX_cms_media_branch" ON "cms_media" ("branch_id");

      CREATE TABLE "cms_playlists" (
        "id"                       UUID NOT NULL DEFAULT gen_random_uuid(),
        "branch_id"                VARCHAR(30),
        "name"                     VARCHAR(200) NOT NULL,
        "description"              TEXT,
        "is_archived"              BOOLEAN NOT NULL DEFAULT FALSE,
        "published_version_id"     UUID,
        "has_unpublished_changes"  BOOLEAN NOT NULL DEFAULT FALSE,
        "created_by"               VARCHAR(100) NOT NULL,
        "updated_by"               VARCHAR(100),
        "created_at"               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_cms_playlists" PRIMARY KEY ("id")
      );
      CREATE INDEX "IDX_cms_playlists_branch" ON "cms_playlists" ("branch_id");

      CREATE TABLE "cms_playlist_items" (
        "id"               UUID NOT NULL DEFAULT gen_random_uuid(),
        "playlist_id"      UUID NOT NULL,
        "media_id"         UUID NOT NULL,
        "display_order"    INT NOT NULL,
        "enabled"          BOOLEAN NOT NULL DEFAULT TRUE,
        "duration_seconds" INT,
        "muted"            BOOLEAN NOT NULL DEFAULT TRUE,
        "loop_playback"    BOOLEAN NOT NULL DEFAULT FALSE,
        "play_full"        BOOLEAN NOT NULL DEFAULT TRUE,
        "created_at"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_cms_playlist_items" PRIMARY KEY ("id"),
        CONSTRAINT "FK_cms_playlist_items_playlist" FOREIGN KEY ("playlist_id") REFERENCES "cms_playlists" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_cms_playlist_items_media" FOREIGN KEY ("media_id") REFERENCES "cms_media" ("id") ON DELETE RESTRICT
      );
      CREATE INDEX "IDX_cms_playlist_items_playlist" ON "cms_playlist_items" ("playlist_id", "display_order");
      CREATE INDEX "IDX_cms_playlist_items_media" ON "cms_playlist_items" ("media_id");

      CREATE TABLE "cms_publish_versions" (
        "id"             UUID NOT NULL DEFAULT gen_random_uuid(),
        "playlist_id"    UUID NOT NULL,
        "version_number" INT NOT NULL,
        "snapshot"       JSONB NOT NULL,
        "published_by"   VARCHAR(100) NOT NULL,
        "published_at"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_cms_publish_versions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_cms_publish_versions_playlist" FOREIGN KEY ("playlist_id") REFERENCES "cms_playlists" ("id") ON DELETE CASCADE,
        CONSTRAINT "UQ_cms_publish_versions_playlist_version" UNIQUE ("playlist_id", "version_number")
      );
      CREATE INDEX "IDX_cms_publish_versions_playlist" ON "cms_publish_versions" ("playlist_id");

      ALTER TABLE "cms_playlists"
        ADD CONSTRAINT "FK_cms_playlists_published_version"
        FOREIGN KEY ("published_version_id") REFERENCES "cms_publish_versions" ("id") ON DELETE SET NULL;

      CREATE TABLE "cms_display_assignments" (
        "id"            UUID NOT NULL DEFAULT gen_random_uuid(),
        "branch_id"     VARCHAR(30),
        "name"          VARCHAR(200) NOT NULL,
        "slug"          VARCHAR(100) NOT NULL,
        "playlist_id"   UUID,
        "is_active"     BOOLEAN NOT NULL DEFAULT TRUE,
        "last_seen_at"  TIMESTAMPTZ,
        "last_seen_ip"  VARCHAR(45),
        "created_by"    VARCHAR(100) NOT NULL,
        "created_at"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_cms_display_assignments" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_cms_display_assignments_slug" UNIQUE ("slug"),
        CONSTRAINT "FK_cms_display_assignments_playlist" FOREIGN KEY ("playlist_id") REFERENCES "cms_playlists" ("id") ON DELETE SET NULL
      );
      CREATE INDEX "IDX_cms_display_assignments_branch" ON "cms_display_assignments" ("branch_id");
      CREATE INDEX "IDX_cms_display_assignments_playlist" ON "cms_display_assignments" ("playlist_id");
    `);

    // ── Permission seeding (CMS module) ──────────────────────────────────────
    const permissions: Array<[string, string, string, string]> = [
      ['CMS', 'MEDIA',      'MANAGE', 'Upload, view, and delete CMS media library assets'],
      ['CMS', 'PLAYLIST',   'MANAGE', 'Create, edit, publish, and delete CMS playlists'],
      ['CMS', 'DISPLAY',    'MANAGE', 'Create and manage CMS display assignments'],
    ];

    for (const [moduleCode, resource, action, description] of permissions) {
      await queryRunner.query(
        `INSERT INTO permissions (module_code, resource, action, description)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (module_code, resource, action) DO NOTHING`,
        [moduleCode, resource, action, description],
      );

      await queryRunner.query(
        `INSERT INTO role_permissions (role_id, permission_id)
         SELECT r.id, p.id
         FROM roles r, permissions p
         WHERE r.name IN ('SUPER_ADMIN', 'HOSPITAL_ADMIN')
           AND p.module_code = $1 AND p.resource = $2 AND p.action = $3
         ON CONFLICT DO NOTHING`,
        [moduleCode, resource, action],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM role_permissions rp
        USING permissions p
        WHERE rp.permission_id = p.id AND p.module_code = 'CMS';
      DELETE FROM permissions WHERE module_code = 'CMS';

      ALTER TABLE "cms_playlists" DROP CONSTRAINT IF EXISTS "FK_cms_playlists_published_version";
      DROP TABLE IF EXISTS "cms_display_assignments";
      DROP TABLE IF EXISTS "cms_publish_versions";
      DROP TABLE IF EXISTS "cms_playlist_items";
      DROP TABLE IF EXISTS "cms_playlists";
      DROP TABLE IF EXISTS "cms_media";
    `);
  }
}
