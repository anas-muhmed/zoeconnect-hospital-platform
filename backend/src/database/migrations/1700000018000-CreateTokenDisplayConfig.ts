import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration 018 — Token display configuration
 *
 * Single-row table that stores the active display board theme as JSONB.
 * The row is upserted (id = 'global') — there is always at most one config.
 * The public endpoint returns this row; the display board applies it on load
 * and hot-reloads whenever a config:updated WebSocket event is received.
 */
export class CreateTokenDisplayConfig1700000018000 implements MigrationInterface {
  name = 'CreateTokenDisplayConfig1700000018000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "token_display_config" (
        "id"         VARCHAR(50)  NOT NULL DEFAULT 'global',
        "config"     JSONB        NOT NULL DEFAULT '{}',
        "updated_at" TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "updated_by" UUID         REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "pk_token_display_config" PRIMARY KEY ("id")
      )
    `);

    /* Seed the default row so GET always returns something */
    await queryRunner.query(`
      INSERT INTO "token_display_config" ("id", "config")
      VALUES ('global', '{}')
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "token_display_config"`);
  }
}
