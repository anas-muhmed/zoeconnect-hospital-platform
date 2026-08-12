import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePasswordResetRequestsTable1783400000000
  implements MigrationInterface
{
  name = 'CreatePasswordResetRequestsTable1783400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "password_reset_request_type_enum" AS ENUM (
        'EMPLOYEE_TO_SUPERADMIN',
        'SUPERADMIN_TO_VENDOR'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "password_reset_request_status_enum" AS ENUM (
        'REQUESTED',
        'APPROVED',
        'REJECTED',
        'EXPIRED',
        'COMPLETED'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "password_reset_requests" (
        "id"                   UUID                                   NOT NULL DEFAULT gen_random_uuid(),
        "request_type"         "password_reset_request_type_enum"     NOT NULL,
        "user_id"              UUID                                   NOT NULL,
        "username"             VARCHAR(100)                           NOT NULL,
        "requested_by_ip"      VARCHAR(100)                           NOT NULL DEFAULT '',
        "requested_user_agent" TEXT                                   NOT NULL DEFAULT '',
        "reason"               TEXT                                   NULL,
        "status"               "password_reset_request_status_enum"   NOT NULL DEFAULT 'REQUESTED',
        "attempt_count"        SMALLINT                               NOT NULL DEFAULT 1,
        "reviewed_by"          UUID                                   NULL,
        "reviewed_at"          TIMESTAMPTZ                            NULL,
        "approval_note"        TEXT                                   NULL,
        "rejection_reason"     TEXT                                   NULL,
        "vendor_request_id"    VARCHAR(255)                           NULL,
        "expires_at"           TIMESTAMPTZ                            NOT NULL,
        "completed_at"         TIMESTAMPTZ                            NULL,
        "requested_at"         TIMESTAMPTZ                            NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_password_reset_requests" PRIMARY KEY ("id"),
        CONSTRAINT "fk_password_reset_user" FOREIGN KEY ("user_id")
          REFERENCES "users" ("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_one_active_reset_per_user"
        ON "password_reset_requests" ("user_id")
        WHERE "status" IN ('REQUESTED', 'APPROVED')
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_password_reset_status"
        ON "password_reset_requests" ("status")
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_password_reset_user"
        ON "password_reset_requests" ("user_id")
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
        ADD COLUMN IF NOT EXISTS "password_reset_at"          TIMESTAMPTZ NULL,
        ADD COLUMN IF NOT EXISTS "password_reset_expires_at"  TIMESTAMPTZ NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "password_reset_expires_at"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "password_reset_at"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "password_reset_requests"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "password_reset_request_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "password_reset_request_type_enum"`);
  }
}
