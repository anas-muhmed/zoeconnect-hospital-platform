import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tenant Foundation (Phase 1 — Hybrid Architecture roadmap, Checkpoint A9).
 *
 * Adds a nullable `tenant_id` to `attendance_dependency_events` in
 * isolation from the other 8 Attendance tables (see the sibling migration
 * 1783780000000-AddTenantIdToAttendanceTables.ts), because this table
 * measured ~156,947 rows in the verified environment — the only
 * materially large table found in this checkpoint's audit.
 *
 * Per the evidence-driven batching threshold established at A5/A7/A8 and
 * reaffirmed here: >100,000 rows warrants separating the high-volume
 * table into its own migration file, but this row count does not reach
 * the >500,000/millions tier that would additionally require a
 * chunked/batched UPDATE loop — a single UPDATE statement against ~157k
 * rows is still fast and safe. Isolating it into its own file is about
 * migration/rollback hygiene (not coupling a large-ish operation with 8
 * trivial ones in the same transaction), not about needing batched
 * writes.
 *
 * This table also has the module-wide relationship caveat: no Postgres
 * join can derive tenant here (employee identity lives in Oracle HIS),
 * and scope=GLOBAL/CONFIG rows are genuinely ownerless by design (see
 * the sibling migration's docstring and HYBRID_ARCHITECTURE_LOG.md's A9
 * entry). Stage A's blanket 'default' backfill is correct for today's
 * single-tenant reality only.
 *
 * Not NOT NULL, not a foreign key — deferred to Stage B.
 */
export class AddTenantIdToAttendanceDependencyEvents1783780000001 implements MigrationInterface {
  name = 'AddTenantIdToAttendanceDependencyEvents1783780000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "attendance_dependency_events" ADD COLUMN "tenant_id" UUID;`,
    );
    await queryRunner.query(`
      UPDATE "attendance_dependency_events"
      SET "tenant_id" = (SELECT "id" FROM "tenant" WHERE "code" = 'default')
      WHERE "tenant_id" IS NULL;
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_attendance_dependency_events_tenant_id" ON "attendance_dependency_events" ("tenant_id");`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_attendance_dependency_events_tenant_id";`);
    await queryRunner.query(
      `ALTER TABLE "attendance_dependency_events" DROP COLUMN "tenant_id";`,
    );
  }
}
