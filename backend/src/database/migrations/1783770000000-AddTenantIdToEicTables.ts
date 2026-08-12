import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tenant Foundation (Phase 1 — Hybrid Architecture roadmap, Checkpoint A8).
 *
 * Adds a nullable `tenant_id` to all 16 EIC (Early Intervention Centre)
 * tables, backfilling every existing row to the seeded 'default' tenant
 * (looked up by `code` — see Checkpoint A1-A5, A7). EIC is a pediatric
 * multi-discipline therapy module (patient intake mirrored read-only from
 * Oracle HIS, enrollment, assessments, goals, session notes, quarterly
 * progress reports, discharge, plus a preschool track) — see
 * HYBRID_ARCHITECTURE_LOG.md's Checkpoint A8 entry for the full pre-flight
 * findings (persistence gate, ownership classification, relationship
 * audit).
 *
 * Row-count check before this migration (real environment): the three
 * tables flagged as architecturally high-volume — eic_therapy_sessions,
 * eic_session_entries, eic_preschool_daily_reports — all had 0 rows.
 * Per the same evidence-driven threshold used in A5 (audit_logs) and A7
 * (loyalty_transactions), a single migration covering all 16 tables was
 * used instead of a batched/split migration. This is a data-volume call
 * for *today's* environment, not a structural exemption — a live,
 * longer-running deployment should re-evaluate batching based on actual
 * row counts before this migration set is run against a real customer
 * database with real clinical history.
 *
 * Tables are ordered to match dependency depth (root → leaf) purely for
 * readability; the ALTER/UPDATE/CREATE INDEX statements below have no
 * FK-ordering requirement since no tenant FK is added in Stage A.
 *
 * Not NOT NULL, not a foreign key — deferred to Stage B. Also deferred to
 * Stage B (tracked in HYBRID_ARCHITECTURE_LOG.md, not addressed here):
 * (1) all ~16 identified write paths (every `.save()`/`.create()` call
 * across the EIC services) will keep inserting tenant_id=NULL until
 * Stage B adds tenant-context resolution, (2) the relationship audit
 * confirming tenant is derivable for every child table via a join back to
 * eic_patients (the only table with a pre-existing ownership column,
 * branch_id) without introducing any new ownership column.
 */
export class AddTenantIdToEicTables1783770000000 implements MigrationInterface {
  name = 'AddTenantIdToEicTables1783770000000';

  private readonly tables = [
    'eic_patients',
    'eic_developmental_histories',
    'eic_therapy_enrollments',
    'eic_therapy_team_members',
    'eic_assessments',
    'eic_goals',
    'eic_therapy_sessions',
    'eic_session_entries',
    'eic_progress_reports',
    'eic_discipline_progress_sections',
    'eic_discharge_summaries',
    'eic_discharge_sections',
    'eic_preschool_enrollments',
    'eic_preschool_assessments',
    'eic_preschool_daily_reports',
    'eic_enrollment_discipline_assignments',
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
