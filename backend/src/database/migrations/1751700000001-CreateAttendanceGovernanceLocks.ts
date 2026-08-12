import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAttendanceGovernanceLocks1751700000001 implements MigrationInterface {
  name = 'CreateAttendanceGovernanceLocks1751700000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "attendance_governance_locks" (
        "id"              uuid          NOT NULL DEFAULT gen_random_uuid(),
        "scope"           varchar(20)   NOT NULL,
        "employee_code"   varchar(40)   NULL,
        "department_code" varchar(40)   NULL,
        "period_from"     date          NOT NULL,
        "period_to"       date          NOT NULL,
        "locked_by"       varchar(120)  NOT NULL,
        "locked_at"       timestamptz   NOT NULL,
        "reason"          text          NULL,
        "is_active"       boolean       NOT NULL DEFAULT true,
        "created_at"      timestamptz   NOT NULL DEFAULT now(),
        "updated_at"      timestamptz   NOT NULL DEFAULT now(),
        CONSTRAINT "PK_attendance_governance_locks" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_gov_lock_active_period"
        ON "attendance_governance_locks" ("is_active", "period_from", "period_to")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_gov_lock_employee"
        ON "attendance_governance_locks" ("employee_code", "is_active")
        WHERE employee_code IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_gov_lock_department"
        ON "attendance_governance_locks" ("department_code", "is_active")
        WHERE department_code IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_gov_lock_department"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_gov_lock_employee"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_gov_lock_active_period"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "attendance_governance_locks"`);
  }
}
