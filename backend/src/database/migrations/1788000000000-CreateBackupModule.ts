import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Backup & Restore Module — v1.0 Schema
 *
 * Creates: backup_storage_configs, backup_jobs, backup_schedules, restore_jobs.
 * Follows the established HDSP pattern (see CreateIncidentManagementSchema):
 * tenant_id (nullable — null in self-hosted) on every table, gen_random_uuid()
 * PK default, TIMESTAMPTZ timestamps, explicit named constraints, and 8
 * RBAC permissions seeded + granted to SUPER_ADMIN/HOSPITAL_ADMIN.
 */
export class CreateBackupModule1788000000000 implements MigrationInterface {
  name = 'CreateBackupModule1788000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "backup_storage_configs" (
        "id"             UUID NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id"      UUID,
        "name"           VARCHAR(200) NOT NULL,
        "driver"         VARCHAR(30) NOT NULL,
        "config"         JSONB NOT NULL DEFAULT '{}',
        "is_default"     BOOLEAN NOT NULL DEFAULT FALSE,
        "is_active"      BOOLEAN NOT NULL DEFAULT TRUE,
        "created_by_id"  UUID,
        "created_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_backup_storage_configs" PRIMARY KEY ("id")
      );
      CREATE INDEX "IDX_backup_storage_configs_tenant" ON "backup_storage_configs" ("tenant_id", "is_active");
    `);

    await queryRunner.query(`
      CREATE TABLE "backup_schedules" (
        "id"                   UUID NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id"            UUID,
        "name"                 VARCHAR(200) NOT NULL,
        "cron_expression"      VARCHAR(100) NOT NULL,
        "backup_type"          VARCHAR(20) NOT NULL DEFAULT 'full',
        "modules"              JSONB NOT NULL DEFAULT '["database","files","configuration"]',
        "storage_config_id"    UUID,
        "retention_count"      INT,
        "retention_days"       INT,
        "encrypt"              BOOLEAN NOT NULL DEFAULT FALSE,
        "is_active"            BOOLEAN NOT NULL DEFAULT TRUE,
        "last_run_at"          TIMESTAMPTZ,
        "last_backup_job_id"   UUID,
        "next_run_at"          TIMESTAMPTZ,
        "created_by_id"        UUID,
        "created_at"           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_backup_schedules" PRIMARY KEY ("id"),
        CONSTRAINT "FK_backup_schedules_storage_config"
          FOREIGN KEY ("storage_config_id") REFERENCES "backup_storage_configs" ("id") ON DELETE SET NULL
      );
      CREATE INDEX "IDX_backup_schedules_tenant" ON "backup_schedules" ("tenant_id", "is_active");
    `);

    await queryRunner.query(`
      CREATE TABLE "backup_jobs" (
        "id"                      UUID NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id"               UUID,
        "type"                    VARCHAR(20) NOT NULL,
        "status"                  VARCHAR(20) NOT NULL DEFAULT 'pending',
        "modules"                 JSONB NOT NULL DEFAULT '[]',
        "storage_config_id"       UUID,
        "storage_key"             VARCHAR(1000),
        "manifest"                JSONB,
        "checksum_sha256"         VARCHAR(64),
        "size_bytes"              BIGINT NOT NULL DEFAULT 0,
        "compressed_size_bytes"   BIGINT NOT NULL DEFAULT 0,
        "compression_ratio"       NUMERIC(6,3),
        "encrypted"               BOOLEAN NOT NULL DEFAULT FALSE,
        "app_version"             VARCHAR(50),
        "db_version"              VARCHAR(50),
        "file_count"              INT NOT NULL DEFAULT 0,
        "database_size_bytes"     BIGINT,
        "duration_ms"             INT,
        "progress"                INT NOT NULL DEFAULT 0,
        "error_message"           TEXT,
        "created_by_id"           UUID,
        "schedule_id"             UUID,
        "bull_job_id"             VARCHAR(100),
        "cancel_requested"        BOOLEAN NOT NULL DEFAULT FALSE,
        "started_at"              TIMESTAMPTZ,
        "completed_at"            TIMESTAMPTZ,
        "expires_at"              TIMESTAMPTZ,
        "created_at"              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_backup_jobs" PRIMARY KEY ("id"),
        CONSTRAINT "FK_backup_jobs_storage_config"
          FOREIGN KEY ("storage_config_id") REFERENCES "backup_storage_configs" ("id") ON DELETE SET NULL,
        CONSTRAINT "FK_backup_jobs_schedule"
          FOREIGN KEY ("schedule_id") REFERENCES "backup_schedules" ("id") ON DELETE SET NULL
      );
      CREATE INDEX "IDX_backup_jobs_tenant_status" ON "backup_jobs" ("tenant_id", "status");
      CREATE INDEX "IDX_backup_jobs_tenant_created" ON "backup_jobs" ("tenant_id", "created_at" DESC);
      CREATE INDEX "IDX_backup_jobs_tenant_type" ON "backup_jobs" ("tenant_id", "type");
    `);

    await queryRunner.query(`
      CREATE TABLE "restore_jobs" (
        "id"                        UUID NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id"                 UUID,
        "source_backup_job_id"      UUID NOT NULL,
        "mode"                      VARCHAR(30) NOT NULL DEFAULT 'entire_application',
        "modules"                   JSONB NOT NULL DEFAULT '[]',
        "status"                    VARCHAR(20) NOT NULL DEFAULT 'pending',
        "confirmed"                 BOOLEAN NOT NULL DEFAULT FALSE,
        "pre_restore_backup_job_id" UUID,
        "version_compatibility"     VARCHAR(20),
        "restart_required"          BOOLEAN NOT NULL DEFAULT FALSE,
        "rolled_back"               BOOLEAN NOT NULL DEFAULT FALSE,
        "validation_report"         JSONB,
        "progress"                  INT NOT NULL DEFAULT 0,
        "error_message"             TEXT,
        "created_by_id"             UUID,
        "bull_job_id"               VARCHAR(100),
        "cancel_requested"          BOOLEAN NOT NULL DEFAULT FALSE,
        "started_at"                TIMESTAMPTZ,
        "completed_at"              TIMESTAMPTZ,
        "created_at"                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_restore_jobs" PRIMARY KEY ("id"),
        CONSTRAINT "FK_restore_jobs_source_backup"
          FOREIGN KEY ("source_backup_job_id") REFERENCES "backup_jobs" ("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_restore_jobs_pre_restore_backup"
          FOREIGN KEY ("pre_restore_backup_job_id") REFERENCES "backup_jobs" ("id") ON DELETE SET NULL
      );
      CREATE INDEX "IDX_restore_jobs_tenant_status" ON "restore_jobs" ("tenant_id", "status");
      CREATE INDEX "IDX_restore_jobs_tenant_created" ON "restore_jobs" ("tenant_id", "created_at" DESC);
    `);

    // ── RBAC Permissions ─────────────────────────────────────────────────────
    await queryRunner.query(`
      INSERT INTO "permissions" ("module_code", "resource", "action", "description", "tenant_id")
      VALUES
        ('BACKUP', 'BACKUP', 'READ',     'View backups, manifests, and restore jobs',            NULL),
        ('BACKUP', 'BACKUP', 'CREATE',   'Create/trigger a manual backup',                        NULL),
        ('BACKUP', 'BACKUP', 'DOWNLOAD', 'Download a backup archive',                             NULL),
        ('BACKUP', 'BACKUP', 'DELETE',   'Delete a backup archive and its record',                NULL),
        ('BACKUP', 'BACKUP', 'RESTORE',  'Restore from a backup (destructive)',                   NULL),
        ('BACKUP', 'BACKUP', 'SCHEDULE', 'Create/update/delete backup schedules',                 NULL),
        ('BACKUP', 'BACKUP', 'VERIFY',   'Verify a backup archive''s integrity',                  NULL),
        ('BACKUP', 'BACKUP', 'SETTINGS', 'Configure backup storage destinations and settings',    NULL)
      ON CONFLICT ("module_code", "resource", "action") DO NOTHING;
    `);

    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT r.id, p.id
      FROM "roles" r
      CROSS JOIN "permissions" p
      WHERE r.name IN ('SUPER_ADMIN', 'HOSPITAL_ADMIN')
        AND p.module_code = 'BACKUP'
      ON CONFLICT DO NOTHING;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "role_permissions"
      WHERE "permission_id" IN (SELECT id FROM "permissions" WHERE "module_code" = 'BACKUP');
    `);
    await queryRunner.query(`DELETE FROM "permissions" WHERE "module_code" = 'BACKUP';`);

    await queryRunner.query(`DROP TABLE IF EXISTS "restore_jobs" CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS "backup_jobs" CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS "backup_schedules" CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS "backup_storage_configs" CASCADE;`);
  }
}
