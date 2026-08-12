import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAttendanceSkipLog1751700000002 implements MigrationInterface {
  name = 'CreateAttendanceSkipLog1751700000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "attendance_skip_logs" (
        "id"                   uuid         NOT NULL DEFAULT gen_random_uuid(),
        "employee_code"        varchar(40)  NOT NULL,
        "duty_date"            date         NOT NULL,
        "skip_reason"          varchar(40)  NOT NULL,
        "mode"                 varchar(30)  NOT NULL,
        "attendance_event_id"  uuid         NULL,
        "dependency_event_id"  uuid         NULL,
        "skipped_at"           timestamptz  NOT NULL,
        "metadata"             jsonb        NULL,
        "created_at"           timestamptz  NOT NULL DEFAULT now(),
        CONSTRAINT "PK_attendance_skip_logs" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_skip_log_employee_date"
        ON "attendance_skip_logs" ("employee_code", "duty_date")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_skip_log_reason_at"
        ON "attendance_skip_logs" ("skip_reason", "skipped_at")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_skip_log_skipped_at"
        ON "attendance_skip_logs" ("skipped_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_skip_log_skipped_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_skip_log_reason_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_skip_log_employee_date"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "attendance_skip_logs"`);
  }
}
