import { MigrationInterface, QueryRunner } from 'typeorm';
import { DEFAULT_ATTENDANCE_RULES } from '../../modules/attendance/services/shift-rule-engine.service';

export class CreateAttendanceRealtimeSchema1700000020000 implements MigrationInterface {
  name = 'CreateAttendanceRealtimeSchema1700000020000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "attendance_events" (
        "id" UUID NOT NULL DEFAULT gen_random_uuid(),
        "source_id" VARCHAR(160) NOT NULL,
        "idempotency_key" VARCHAR(220) NOT NULL,
        "employee_code" VARCHAR(40) NOT NULL,
        "log_datetime" TIMESTAMPTZ NOT NULL,
        "device_name" VARCHAR(120),
        "direction" VARCHAR(20) NOT NULL DEFAULT 'UNKNOWN',
        "raw_direction" VARCHAR(60),
        "status" VARCHAR(30) NOT NULL DEFAULT 'NEW',
        "decision_status" VARCHAR(40),
        "attempt_count" INT NOT NULL DEFAULT 0,
        "last_error" TEXT,
        "processed_at" TIMESTAMPTZ,
        "raw_payload" JSONB NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_attendance_events" PRIMARY KEY ("id"),
        CONSTRAINT "uq_attendance_events_source_id" UNIQUE ("source_id")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_attendance_events_idempotency_key" ON "attendance_events" ("idempotency_key")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_attendance_events_employee_log" ON "attendance_events" ("employee_code", "log_datetime")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_attendance_events_status_created" ON "attendance_events" ("status", "created_at")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "attendance_audit" (
        "id" UUID NOT NULL DEFAULT gen_random_uuid(),
        "event_id" UUID,
        "employee_code" VARCHAR(40) NOT NULL,
        "duty_date" DATE NOT NULL,
        "mode" VARCHAR(30) NOT NULL,
        "old_status" VARCHAR(40),
        "new_status" VARCHAR(40) NOT NULL,
        "old_value" JSONB,
        "new_value" JSONB NOT NULL,
        "reason_code" VARCHAR(80) NOT NULL,
        "message" TEXT NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_attendance_audit" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_attendance_audit_employee_duty" ON "attendance_audit" ("employee_code", "duty_date")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_attendance_audit_event" ON "attendance_audit" ("event_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_attendance_audit_created" ON "attendance_audit" ("created_at")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "attendance_rules" (
        "id" UUID NOT NULL DEFAULT gen_random_uuid(),
        "code" VARCHAR(80) NOT NULL,
        "name" VARCHAR(160) NOT NULL,
        "rules" JSONB NOT NULL,
        "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
        "effective_from" DATE NOT NULL DEFAULT CURRENT_DATE,
        "effective_to" DATE,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_attendance_rules" PRIMARY KEY ("id"),
        CONSTRAINT "uq_attendance_rules_code" UNIQUE ("code")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_attendance_rules_active_effective" ON "attendance_rules" ("is_active", "effective_from")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "attendance_reconciliation" (
        "id" UUID NOT NULL DEFAULT gen_random_uuid(),
        "run_date" DATE NOT NULL,
        "from_datetime" TIMESTAMPTZ NOT NULL,
        "to_datetime" TIMESTAMPTZ NOT NULL,
        "status" VARCHAR(30) NOT NULL,
        "processed_count" INT NOT NULL DEFAULT 0,
        "failed_count" INT NOT NULL DEFAULT 0,
        "error_message" TEXT,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_attendance_reconciliation" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_attendance_reconciliation_run_status" ON "attendance_reconciliation" ("run_date", "status")`);

    await queryRunner.query(`
      INSERT INTO "attendance_rules" ("code", "name", "rules")
      VALUES ('DEFAULT', 'Default hospital attendance rules', $1::jsonb)
      ON CONFLICT ("code") DO UPDATE SET
        "rules" = EXCLUDED."rules",
        "updated_at" = NOW()
    `, [JSON.stringify(DEFAULT_ATTENDANCE_RULES)]);

    await queryRunner.query(`
      INSERT INTO "module_registry"
        ("code","name","route","version","is_active","license_required","display_order","description")
      VALUES
        ('ATTENDANCE','Punch Upload Integration','attendance','1.0.0',TRUE,FALSE,9,'Realtime HIS ATTLOGS to DUTYACTUALVALUE attendance processing')
      ON CONFLICT ("code") DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO "permissions" ("module_code","resource","action","description") VALUES
        ('ATTENDANCE','REALTIME','READ','View realtime attendance processing status'),
        ('ATTENDANCE','REALTIME','MANAGE','Manage realtime attendance cursor and reconciliation'),
        ('ATTENDANCE','MONITORING','READ','View attendance monitoring dashboard and diagnostics')
      ON CONFLICT ("module_code","resource","action") DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id","permission_id")
      SELECT r.id, p.id
      FROM "roles" r
      CROSS JOIN "permissions" p
      WHERE r.name IN ('SUPER_ADMIN','HOSPITAL_ADMIN','HR_ADMIN')
        AND p.module_code = 'ATTENDANCE'
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "role_permissions" WHERE "permission_id" IN (SELECT "id" FROM "permissions" WHERE "module_code" = 'ATTENDANCE')`);
    await queryRunner.query(`DELETE FROM "permissions" WHERE "module_code" = 'ATTENDANCE'`);
    await queryRunner.query(`DELETE FROM "module_registry" WHERE "code" = 'ATTENDANCE'`);
    await queryRunner.query(`DROP TABLE IF EXISTS "attendance_reconciliation"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "attendance_rules"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "attendance_audit"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "attendance_events"`);
  }
}
