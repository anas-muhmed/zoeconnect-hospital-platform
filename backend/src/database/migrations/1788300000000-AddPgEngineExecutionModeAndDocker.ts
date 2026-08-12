import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds Docker/execution-mode columns to `backup_tool_settings`, follow-up to
 * CreateBackupToolSettings1788200000000. Supports the new "Database Backup
 * Engine" health-card UI (PgEngineService) which can now resolve pg_dump/
 * pg_restore to a LOCAL install, a DOCKER container running Postgres, or a
 * BUNDLED distribution -- see PgEngineService's doc comment for the full
 * resolution precedence.
 *
 * A NEW migration rather than editing CreateBackupToolSettings1788200000000
 * in place, per house rule.
 */
export class AddPgEngineExecutionModeAndDocker1788300000000 implements MigrationInterface {
  name = 'AddPgEngineExecutionModeAndDocker1788300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "backup_tool_settings"
        ADD COLUMN IF NOT EXISTS "execution_mode" VARCHAR(20) NOT NULL DEFAULT 'auto',
        ADD COLUMN IF NOT EXISTS "docker_container_name" VARCHAR(255),
        ADD COLUMN IF NOT EXISTS "detected_docker_container_name" VARCHAR(255);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "backup_tool_settings"
        DROP COLUMN IF EXISTS "execution_mode",
        DROP COLUMN IF EXISTS "docker_container_name",
        DROP COLUMN IF EXISTS "detected_docker_container_name";
    `);
  }
}
