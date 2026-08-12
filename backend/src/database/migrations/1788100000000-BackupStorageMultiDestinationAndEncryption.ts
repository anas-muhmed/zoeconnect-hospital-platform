import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Backup Storage — Multi-Destination, Priority/Failover, and Credential
 * Encryption-at-Rest (follow-up to CreateBackupModule1788000000000).
 *
 * A NEW migration rather than editing the already-applied
 * 1788000000000-CreateBackupModule.ts in place, per house rule.
 *
 * Adds:
 *   - backup_storage_configs: purpose, environment, priority, shareable,
 *     encrypted_credentials columns.
 *   - backup_jobs / backup_schedules: write_mode column.
 *   - backup_jobs: destination_ids (jsonb) column.
 *   - backup_schedules: storage_config_ids (jsonb) column.
 *   - new backup_job_destinations table (per-destination fan-out results).
 *
 * EXISTING-DATA MIGRATION PATH for plaintext credentials already sitting in
 * `backup_storage_configs.config` (per-row, driver-dependent secret field
 * names -- see BackupCredentialCipherService.CREDENTIAL_FIELDS_BY_DRIVER):
 * this migration deliberately does NOT attempt to auto-encrypt existing
 * rows' plaintext credential sub-fields in SQL (no access to
 * BACKUP_CREDENTIALS_ENCRYPTION_KEY or Node's crypto module from a
 * QueryRunner, and blindly trusting the key exists at migration-run time
 * would violate the fail-fast contract). Existing rows keep whatever
 * plaintext credential fields they already had inside `config` (still
 * functionally readable by BackupStorageProviderFactory.forStorageConfig(),
 * since it merges `config` with the decrypted-if-present
 * `encryptedCredentials` blob) until an admin re-saves each destination
 * through PATCH /backups/storage-providers/:id (even a no-op update that
 * re-submits the same credentials) -- BackupStorageConfigService.update()
 * always re-encrypts and moves credential fields out of `config` on any
 * write that includes them. This migration only adds the new column and
 * schema; it does not remove any existing plaintext credential fields from
 * `config` for rows that are never touched again post-upgrade -- flagged
 * here rather than silently assumed complete.
 */
export class BackupStorageMultiDestinationAndEncryption1788100000000 implements MigrationInterface {
  name = 'BackupStorageMultiDestinationAndEncryption1788100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "backup_storage_configs"
        ADD COLUMN IF NOT EXISTS "encrypted_credentials" TEXT,
        ADD COLUMN IF NOT EXISTS "purpose"                VARCHAR(20) NOT NULL DEFAULT 'both',
        ADD COLUMN IF NOT EXISTS "environment"             VARCHAR(50),
        ADD COLUMN IF NOT EXISTS "priority"                INT NOT NULL DEFAULT 100,
        ADD COLUMN IF NOT EXISTS "shareable"                BOOLEAN NOT NULL DEFAULT FALSE;
    `);

    await queryRunner.query(`
      ALTER TABLE "backup_jobs"
        ADD COLUMN IF NOT EXISTS "write_mode"       VARCHAR(20) NOT NULL DEFAULT 'failover',
        ADD COLUMN IF NOT EXISTS "destination_ids"   JSONB;
    `);
    // Backfill 'partial' as a legal status value has no CHECK constraint to update --
    // status is a plain VARCHAR here (see CreateBackupModule1788000000000), not an enum.

    await queryRunner.query(`
      ALTER TABLE "backup_schedules"
        ADD COLUMN IF NOT EXISTS "write_mode"           VARCHAR(20) NOT NULL DEFAULT 'failover',
        ADD COLUMN IF NOT EXISTS "storage_config_ids"    JSONB;
    `);

    await queryRunner.query(`
      CREATE TABLE "backup_job_destinations" (
        "id"                UUID NOT NULL DEFAULT gen_random_uuid(),
        "backup_job_id"     UUID NOT NULL,
        "storage_config_id" UUID NOT NULL,
        "status"            VARCHAR(20) NOT NULL DEFAULT 'pending',
        "priority"          INT NOT NULL DEFAULT 100,
        "storage_key"       VARCHAR(1000),
        "bytes_written"     BIGINT,
        "error_message"     TEXT,
        "started_at"        TIMESTAMPTZ,
        "completed_at"      TIMESTAMPTZ,
        "created_at"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_backup_job_destinations" PRIMARY KEY ("id"),
        CONSTRAINT "FK_backup_job_destinations_job"
          FOREIGN KEY ("backup_job_id") REFERENCES "backup_jobs" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_backup_job_destinations_storage_config"
          FOREIGN KEY ("storage_config_id") REFERENCES "backup_storage_configs" ("id") ON DELETE CASCADE
      );
      CREATE INDEX "IDX_backup_job_destinations_job" ON "backup_job_destinations" ("backup_job_id");
      CREATE INDEX "IDX_backup_job_destinations_storage_config" ON "backup_job_destinations" ("storage_config_id");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "backup_job_destinations" CASCADE;`);

    await queryRunner.query(`
      ALTER TABLE "backup_schedules"
        DROP COLUMN IF EXISTS "write_mode",
        DROP COLUMN IF EXISTS "storage_config_ids";
    `);

    await queryRunner.query(`
      ALTER TABLE "backup_jobs"
        DROP COLUMN IF EXISTS "write_mode",
        DROP COLUMN IF EXISTS "destination_ids";
    `);

    await queryRunner.query(`
      ALTER TABLE "backup_storage_configs"
        DROP COLUMN IF EXISTS "encrypted_credentials",
        DROP COLUMN IF EXISTS "purpose",
        DROP COLUMN IF EXISTS "environment",
        DROP COLUMN IF EXISTS "priority",
        DROP COLUMN IF EXISTS "shareable";
    `);
  }
}
