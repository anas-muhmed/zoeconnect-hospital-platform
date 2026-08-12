import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Documents (via column comment) that `backup_tool_settings.execution_mode`
 * now also accepts 'remote' and 'bundled' in addition to 'auto'/'local'/
 * 'docker' (see PgEngineService.resolveStrategy()'s doc comment for what
 * each means -- 'remote' is functionally identical to 'local', just a
 * distinctly-labeled UI choice for "tools installed here, database
 * elsewhere"; 'bundled' selects the BACKUP_BUNDLED_PG_DIR-based strategy
 * explicitly rather than only via the env var always-wins path).
 *
 * No actual column-shape change is needed -- `execution_mode` was already
 * created as a plain `VARCHAR(20)` with no CHECK constraint (see
 * CreateBackupToolSettings1788200000000 / AddPgEngineExecutionModeAndDocker
 * 1788300000000), so it already accepts any string up to 20 characters. This
 * migration exists purely to keep the schema's documented intent (via
 * COMMENT ON COLUMN) in sync with the application-level enum, per house
 * rule that a new migration (not editing an old one in place) records every
 * schema-meaning change.
 */
export class AddRemoteAndBundledExecutionModes1788400000000 implements MigrationInterface {
  name = 'AddRemoteAndBundledExecutionModes1788400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      COMMENT ON COLUMN "backup_tool_settings"."execution_mode" IS
        'One of: auto | local | docker | remote | bundled. See PgEngineService.resolveStrategy().';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      COMMENT ON COLUMN "backup_tool_settings"."execution_mode" IS
        'One of: auto | local | docker. See PgEngineService.resolveStrategy().';
    `);
  }
}
