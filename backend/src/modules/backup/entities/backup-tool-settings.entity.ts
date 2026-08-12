import { Entity, PrimaryColumn, Column, UpdateDateColumn } from 'typeorm';

/**
 * BackupToolSettings — singleton row holding the admin-configured
 * `pg_dump`/`pg_restore` binary paths.
 *
 * Deliberately a NEW, small table (not the existing `SystemSetting` /
 * `system_settings` bulk key-value store in `../../settings/`) because this
 * is a host/infrastructure-level concern, not tenant data: the exact same
 * physical `pg_dump` binary path applies no matter which tenant happens to
 * be making a request in cloud mode. `SystemSetting` is always resolved
 * relative to an ambient tenant context (`tenantId ?? IsNull()`); reusing it
 * here would make "which pg_dump path applies" implicitly tenant-shaped,
 * which it structurally isn't. This entity has no `tenantId` column at all.
 *
 * Modeled as a literal singleton row (fixed, well-known primary key) rather
 * than a generic key/value table -- there are only ever 2-4 logical
 * settings here, and a typed singleton row is simpler to read/write/test
 * than a key/value table for that shape (see PgToolsService, the only
 * consumer). `id` is always SINGLETON_ID; PgToolsService upserts against
 * that fixed id rather than ever creating a second row.
 */
@Entity('backup_tool_settings')
export class BackupToolSettings {
  @PrimaryColumn({ type: 'varchar', length: 40 })
  id: string;

  /** Admin-configured, explicitly saved path -- resolution order's highest-priority source. */
  @Column({ name: 'pg_dump_path', type: 'varchar', length: 1000, nullable: true })
  pgDumpPath: string | null;

  @Column({ name: 'pg_restore_path', type: 'varchar', length: 1000, nullable: true })
  pgRestorePath: string | null;

  /**
   * Cached result of the most recent detectInstallations() scan -- kept
   * separate from the admin-configured pgDumpPath/pgRestorePath above so
   * "detect" never silently overwrites an explicit admin choice, and so
   * PgToolsService.resolvePgDumpPath() doesn't need to re-scan the
   * filesystem on every backup/restore run (resolution order step 2).
   */
  @Column({ name: 'detected_pg_dump_path', type: 'varchar', length: 1000, nullable: true })
  detectedPgDumpPath: string | null;

  @Column({ name: 'detected_pg_restore_path', type: 'varchar', length: 1000, nullable: true })
  detectedPgRestorePath: string | null;

  @Column({ name: 'detected_version', type: 'varchar', length: 50, nullable: true })
  detectedVersion: string | null;

  @Column({ name: 'last_tested_at', type: 'timestamptz', nullable: true })
  lastTestedAt: Date | null;

  @Column({ name: 'last_test_status', type: 'varchar', length: 20, nullable: true })
  lastTestStatus: 'success' | 'failure' | null;

  @Column({ name: 'last_test_message', type: 'text', nullable: true })
  lastTestMessage: string | null;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy: string | null;

  /**
   * Admin execution-mode override for PgEngineService's strategy
   * resolution -- 'auto' (default) tries local detection then falls back to
   * Docker detection; 'local'/'docker'/'remote'/'bundled' force that
   * strategy directly (bypassing detection), used only for unusual
   * deployments via the Advanced section. 'remote' is functionally
   * identical to 'local' (same local-binary-spawn mechanics, connecting to
   * `database.host`) but is surfaced as a distinctly-labeled choice for the
   * common enterprise case of "pg_dump/pg_restore installed on this app
   * server, but Postgres runs on a different host" -- see
   * PgEngineService.resolveStrategy()'s doc comment. Never touched by
   * detectInstallations()/Docker detection -- purely admin-set.
   */
  @Column({ name: 'execution_mode', type: 'varchar', length: 20, default: 'auto' })
  executionMode: 'auto' | 'local' | 'docker' | 'remote' | 'bundled';

  /** Admin-configured Docker container name override -- required when executionMode === 'docker'. */
  @Column({ name: 'docker_container_name', type: 'varchar', length: 255, nullable: true })
  dockerContainerName: string | null;

  /** Cached result of the most recent Docker auto-detection (PgDockerDetectionService), mirroring the detectedPgDumpPath/pgDumpPath pattern -- never overwrites dockerContainerName. */
  @Column({ name: 'detected_docker_container_name', type: 'varchar', length: 255, nullable: true })
  detectedDockerContainerName: string | null;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

/** Fixed primary key -- this table only ever has (at most) one row. */
export const BACKUP_TOOL_SETTINGS_SINGLETON_ID = 'singleton';
