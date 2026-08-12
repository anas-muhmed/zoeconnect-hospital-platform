import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tenant Foundation (Phase 1 — Hybrid Architecture roadmap, Checkpoint A13
 * — final Stage A checkpoint).
 *
 * Adds a nullable `tenant_id` to all 17 entity-backed Token Management
 * tables (locations, counters, calls, display pages, branch config,
 * kiosks, kiosk assignments, kiosk branding, service-center config,
 * sequences, records, analytics, audit trail, reservations, patient
 * mapping, mapping audit trail, workstation config), backfilling every
 * existing row to the seeded 'default' tenant (looked up by `code` — see
 * Checkpoint A1-A5, A7-A9, A11-A12).
 *
 * Deliberately NOT included: `token_display_config` — has a migration and
 * is actively used (print/display config, 2 fixed global rows) but has no
 * TypeORM `@Entity()` at all, managed entirely via raw SQL in
 * token.service.ts. Adding tenant_id there would require a pure-SQL
 * ALTER with no entity to reflect it; deferred alongside the same open
 * "should this stay global" question already raised for A12's
 * feedback_languages and this checkpoint's own display_pages.
 *
 * Row-count check before this migration (real environment):
 *   token_records          115
 *   token_calls            106
 *   token_audit_logs        49
 *   mapping_audit_log        3
 *   token_reservations       1
 *   token_patient_mapping    1
 *   token_analytics_daily    0
 * All comfortably under the 100k separate-migration threshold established
 * at A5/A7/A8/A9/A11/A12 — including token_records, which was flagged
 * pre-audit as the likely highest-volume table in the whole migration but
 * measured far smaller than expected. A single migration covers all 17
 * tables; no split, mirroring the outcome (not the mechanism) of A9's
 * split-only-when-warranted precedent.
 *
 * Ownership pattern verdict (see HYBRID_ARCHITECTURE_LOG.md's A13 entry
 * for full detail): Token introduces no third ownership pattern. It is
 * the first module to combine two previously-established patterns within
 * one schema:
 *   - Pattern 1 (session-derived): the majority of config/counter/audit/
 *     analytics tables — direct branch_id or FK-derived, authenticated
 *     writers.
 *   - Pattern 3 (A12-style anonymous chain-derived): token_records,
 *     token_reservations, and hdsp_workstation_configuration are written
 *     by unauthenticated kiosk-slug or workstation walk-up flows; Stage B
 *     must derive tenant_id server-side from the local kiosk/location
 *     config chain, never from client input.
 * Pattern 2 (A9-style External/Oracle-derived ownership) was explicitly
 * NOT needed — branch_id/intrabranchid are already cached as plain local
 * Postgres columns (TokenLocation, TokenScConfig, TokenKioskAssignment),
 * so Postgres-side ownership never depends on a live Oracle round-trip
 * here, unlike Attendance.
 *
 * Not NOT NULL, not a foreign key — deferred to Stage B. Also deferred:
 * (1) display_pages has no branch column at all (Shared/Global, same
 * category as A12's feedback_languages) — open Stage B architectural
 * question, not resolved by this column's presence; (2) two scheduled
 * jobs (TokenDailyResetService every minute, TokenAnalyticsService
 * nightly aggregation) will need explicit tenant_id threading in Stage B;
 * (3) a pre-existing, unrelated raw-SQL bug was found during this
 * checkpoint's audit — TokenSequenceService.manualResetSequences
 * references "token_sc_config" (singular) instead of "token_sc_configs",
 * silently defeating configured start numbers on bulk sequence reset —
 * flagged for separate follow-up, not fixed here; (4) admin controllers
 * return raw entities without projection, and the kiosk/workstation
 * public surfaces need Stage B write-path review — tracked as A13.5.
 */
export class AddTenantIdToTokenTables1783810000000 implements MigrationInterface {
  name = 'AddTenantIdToTokenTables1783810000000';

  private readonly tables = [
    'token_locations',
    'token_counters',
    'token_calls',
    'display_pages',
    'token_branch_config',
    'token_kiosks',
    'token_kiosk_assignments',
    'token_kiosk_branding',
    'token_sc_configs',
    'token_sequences',
    'token_records',
    'token_analytics_daily',
    'token_audit_logs',
    'token_reservations',
    'token_patient_mapping',
    'mapping_audit_log',
    'hdsp_workstation_configuration',
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
