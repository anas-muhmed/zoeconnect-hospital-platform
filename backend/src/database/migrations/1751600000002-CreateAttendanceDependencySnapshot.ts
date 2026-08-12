import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAttendanceDependencySnapshot1751600000002 implements MigrationInterface {
  name = 'CreateAttendanceDependencySnapshot1751600000002';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "attendance_dependency_snapshots" (
        "id"              uuid NOT NULL DEFAULT gen_random_uuid(),
        "employee_code"   character varying(40)  NOT NULL,
        "duty_date"       date                   NOT NULL,
        "hdsp_decision"   character varying(50)  NOT NULL,
        "shift_code"      character varying(50),
        "processing_mode" character varying(30)  NOT NULL,
        "captured_at"     timestamptz            NOT NULL,
        "created_at"      timestamptz            NOT NULL DEFAULT now(),
        "updated_at"      timestamptz            NOT NULL DEFAULT now(),
        CONSTRAINT "PK_att_dep_snapshots" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_att_dep_snapshots_emp_date"
          UNIQUE ("employee_code", "duty_date")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_att_dep_snapshots_duty_date"
        ON "attendance_dependency_snapshots" ("duty_date")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_att_dep_snapshots_captured_at"
        ON "attendance_dependency_snapshots" ("captured_at")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "attendance_dependency_snapshots"`);
  }
}
