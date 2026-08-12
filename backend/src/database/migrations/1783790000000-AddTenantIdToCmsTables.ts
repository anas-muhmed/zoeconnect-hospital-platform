import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tenant Foundation (Phase 1 — Hybrid Architecture roadmap, Checkpoint A11).
 *
 * Adds a nullable `tenant_id` to the 12 remaining CMS tables (content/
 * display management: media, playlists, publishing, display registry,
 * scheduling, commands, emergency broadcasts, player logs, ticker
 * messages, audit trail), backfilling every existing row to the seeded
 * 'default' tenant (looked up by `code` — see Checkpoint A1-A5, A7-A9).
 * `cms_settings` (single-row config) already has a `tenant_id` column
 * from Checkpoint A2 and is not touched here.
 *
 * Row-count check before this migration (real environment):
 *   cms_publish_versions   5
 *   cms_audit_logs        81
 *   cms_player_logs      748
 *   cms_playlist_items     8
 * All well below the 100k separate-migration threshold established at
 * A5/A7/A8/A9. A single migration covers all 12 tables — architectural
 * expectations (several of these are append-only/high-churn by design)
 * were not used to justify splitting; measured row counts were.
 *
 * Relationship audit: no External Ownership Pattern found in this module
 * (contrast with A9/Attendance) — every table's ownership resolves via a
 * direct branch_id column or an internal Postgres FK join back to
 * cms_display_assignments/cms_playlists. Six of the twelve tables
 * (cms_playlist_items, cms_publish_versions, cms_playlist_schedules,
 * cms_display_commands, cms_player_logs, cms_ticker_messages) had no
 * branch/tenant column at all prior to this migration and relied on
 * join-only ownership; tenant_id is added to all twelve uniformly so
 * Stage B enforcement doesn't require an extra join-derivation step at
 * write time (same approach used for EIC's child tables at A8).
 *
 * Not NOT NULL, not a foreign key — deferred to Stage B. Also deferred:
 * (1) cms_emergency_broadcasts' branch_id=NULL is a legitimate "applies
 * to every display" sentinel, not an unmigrated row — whether
 * tenant_id=NULL should retain that same global-broadcast semantic is an
 * open Stage B design question; (2) no response DTOs or class-validator
 * request DTOs exist anywhere in this module (raw entities returned on
 * every GET, plain TS interfaces on every write) — logged as a follow-up
 * DTO/API-contract audit, not fixed here.
 */
export class AddTenantIdToCmsTables1783790000000 implements MigrationInterface {
  name = 'AddTenantIdToCmsTables1783790000000';

  private readonly tables = [
    'cms_media',
    'cms_playlists',
    'cms_playlist_items',
    'cms_publish_versions',
    'cms_display_assignments',
    'cms_playlist_schedules',
    'cms_audit_logs',
    'cms_display_groups',
    'cms_display_commands',
    'cms_emergency_broadcasts',
    'cms_player_logs',
    'cms_ticker_messages',
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of this.tables) {
      await queryRunner.query(`ALTER TABLE "${table}" ADD COLUMN "tenant_id" UUID;`);
      await queryRunner.query(`
        UPDATE "${table}"
        SET "tenant_id" = (SELECT "id" FROM "tenant" WHERE "code" = 'default')
        WHERE "tenant_id" IS NULL;
      `);
      await queryRunner.query(
        `CREATE INDEX "IDX_${table}_tenant_id" ON "${table}" ("tenant_id");`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of [...this.tables].reverse()) {
      await queryRunner.query(`DROP INDEX "IDX_${table}_tenant_id";`);
      await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN "tenant_id";`);
    }
  }
}
