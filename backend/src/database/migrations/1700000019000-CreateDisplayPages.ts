import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration 019 — Named display pages
 *
 * Each row is a standalone canvas layout accessible at /display/:slug.
 * The global default (token/display) continues to use token_display_config.
 */
export class CreateDisplayPages1700000019000 implements MigrationInterface {
  name = 'CreateDisplayPages1700000019000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "display_pages" (
        "id"          UUID         NOT NULL DEFAULT gen_random_uuid(),
        "slug"        VARCHAR(80)  NOT NULL,
        "title"       VARCHAR(120) NOT NULL DEFAULT '',
        "layout"      JSONB        NOT NULL DEFAULT '{}',
        "is_active"   BOOLEAN      NOT NULL DEFAULT TRUE,
        "created_by"  UUID         REFERENCES "users"("id") ON DELETE SET NULL,
        "created_at"  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "updated_at"  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_display_pages"   PRIMARY KEY ("id"),
        CONSTRAINT "uq_display_pages_slug" UNIQUE ("slug")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "display_pages"`);
  }
}
