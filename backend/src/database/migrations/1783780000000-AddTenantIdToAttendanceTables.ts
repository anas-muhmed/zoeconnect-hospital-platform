import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tenant Foundation (Phase 1 — Hybrid Architecture roadmap, Checkpoint A9).
 *
 * Adds a nullable `tenant_id` to the 8 low-volume Attendance tables,
 * backfilling every existing row to the seeded 'default' tenant (looked
 * up by `code` — see Checkpoint A1-A5, A7, A8). The 9th and highest-volume
 * Attendance table, `attendance_dependency_events` (~156,947 rows in the
 * verified environment), is deliberately handled in its own isolated
 * migration (1783780000001-AddTenantIdToAttendanceDependencyEvents.ts) —
 * see that file's docstring and HYBRID_ARCHITECTURE_LOG.md's Checkpoint
 * A9 entry for the full pre-flight findings (persistence gate, runtime
 * topology, relationship audit, row-count assessment).
 *
 * Row-count check before this migration (real environment):
 *   attendance_events                   58
 *   attendance_divergence_logs          60
 *   attendance_dependency_snapshots     58
 *   attendance_audit                 10,385
 *   attendance_skip_logs                 0
 *   attendance_rules                (seed only, trivial)
 *   attendance_reconciliation       (job run-log, trivial)
 *   attendance_governance_locks     (admin-triggered, trivial)
 * All comfortably under the single-migration threshold established at
 * A5/A7/A8 — no batching required for any of these 8.
 *
 * Attendance is structurally different from every prior checkpoint: no
 * table here has a Postgres FK to a local employee/tenant entity —
 * employee identity lives entirely in Oracle HIS, resolved live per
 * request via RosterResolver. Tenant_id cannot be derived via a local
 * join; Stage B must resolve it from Oracle's INTRABRANCHID (surfaced by
 * RosterResolver) and stamp it at write time. Additionally,
 * AttendanceGovernanceLock (scope=ALL) rows are genuinely ownerless by
 * design (a hospital-wide payroll freeze has no single employee/tenant
 * owner) — this requires an explicit Stage B policy decision, not
 * mechanical backfill; Stage A's blanket 'default' backfill is correct
 * for today's single-tenant reality but is not a precedent for how
 * scope=ALL rows should be tenant-stamped going forward.
 *
 * Not NOT NULL, not a foreign key — deferred to Stage B.
 */
export class AddTenantIdToAttendanceTables1783780000000 implements MigrationInterface {
  name = 'AddTenantIdToAttendanceTables1783780000000';

  private readonly tables = [
    'attendance_events',
    'attendance_audit',
    'attendance_rules',
    'attendance_reconciliation',
    'attendance_dependency_snapshots',
    'attendance_divergence_logs',
    'attendance_governance_locks',
    'attendance_skip_logs',
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
