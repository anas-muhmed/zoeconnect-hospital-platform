import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 2B — add `scope` column to attendance_dependency_events.
 *
 * Scope classifies the blast radius of a dependency change:
 *   EMPLOYEE — one employee on one date (DutyPlan, Leave)
 *   GLOBAL   — all employees on a specific date (Holiday)
 *   CONFIG   — all employees across all dates (ShiftType)
 *
 * The column is nullable so that rows persisted before this migration
 * (Phase 2A events) remain valid without a backfill.
 */
export class AddScopeToAttendanceDependencyEvents1751600000001
  implements MigrationInterface
{
  name = 'AddScopeToAttendanceDependencyEvents1751600000001';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "attendance_dependency_events"
      ADD COLUMN IF NOT EXISTS "scope" character varying(20)
    `);

    // Index the scope column — Phase 3 recalculation engine will filter by scope
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_att_dep_events_scope"
      ON "attendance_dependency_events" ("scope")
      WHERE "scope" IS NOT NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_att_dep_events_scope"
    `);
    await queryRunner.query(`
      ALTER TABLE "attendance_dependency_events"
      DROP COLUMN IF EXISTS "scope"
    `);
  }
}
