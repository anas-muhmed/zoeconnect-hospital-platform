import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAttendanceDivergenceLog1751600000003 implements MigrationInterface {
  name = 'CreateAttendanceDivergenceLog1751600000003';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "attendance_divergence_logs" (
        "id"               uuid NOT NULL DEFAULT gen_random_uuid(),
        "employee_code"    character varying(40)  NOT NULL,
        "duty_date"        date                   NOT NULL,
        "hdsp_decision"    character varying(50),
        "his_attendance"   character varying(50),
        "outcome"          character varying(20)  NOT NULL,
        "strategy_applied" character varying(20),
        "reconciled_at"    timestamptz            NOT NULL,
        "created_at"       timestamptz            NOT NULL DEFAULT now(),
        CONSTRAINT "PK_att_divergence_logs" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_att_div_logs_emp_date"
        ON "attendance_divergence_logs" ("employee_code", "duty_date")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_att_div_logs_date_outcome"
        ON "attendance_divergence_logs" ("duty_date", "outcome")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_att_div_logs_reconciled_at"
        ON "attendance_divergence_logs" ("reconciled_at")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "attendance_divergence_logs"`);
  }
}
