import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 1 — Attendance Dependency Resolution Engine
 *
 * Creates the `attendance_dependency_events` table.
 *
 * This table is intentionally separate from `attendance_events` (punch-only)
 * per the Phase 0 architectural decision (Q1).  It records every change
 * detected in external systems (DUTY_PLAN, LEAVE, HOLIDAY, SHIFT_TYPE) so
 * the DependencyEventRouter can route, debounce, and audit them.
 *
 * All data here is HDSP-internal — nothing is written to Oracle HIS.
 */
export class CreateAttendanceDependencyEvents1751500000001 implements MigrationInterface {
  name = 'CreateAttendanceDependencyEvents1751500000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "attendance_dependency_events" (
        "id"             UUID        NOT NULL DEFAULT gen_random_uuid(),
        "source"         VARCHAR(30) NOT NULL,
        "employee_code"  VARCHAR(40),
        "duty_date"      DATE,
        "triggered_at"   TIMESTAMPTZ NOT NULL,
        "status"         VARCHAR(20) NOT NULL DEFAULT 'PENDING',
        "payload"        JSONB       NOT NULL DEFAULT '{}',
        "correlation_id" VARCHAR(64) NOT NULL,
        "debounce_until" TIMESTAMPTZ,
        "last_error"     TEXT,
        "created_at"     TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"     TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_attendance_dependency_events" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_att_dep_evt_source_status_created"
        ON "attendance_dependency_events" ("source", "status", "created_at")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_att_dep_evt_employee_date"
        ON "attendance_dependency_events" ("employee_code", "duty_date")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_att_dep_evt_correlation"
        ON "attendance_dependency_events" ("correlation_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_att_dep_evt_debounce"
        ON "attendance_dependency_events" ("debounce_until")
        WHERE "status" = 'DEBOUNCED'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "attendance_dependency_events"`);
  }
}
