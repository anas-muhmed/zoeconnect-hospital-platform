import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';

export type BackupType =
  | 'full' | 'incremental' | 'differential' | 'manual' | 'scheduled'
  | 'pre_upgrade' | 'pre_restore';

export type BackupStatus =
  // 'partial' = redundant_all write mode where at least one but not all
  // configured destinations succeeded -- deliberately distinct from
  // 'completed' so the job's overall status never silently claims full
  // success when some destinations actually failed. See
  // BackupDestinationWriterService.
  | 'pending' | 'running' | 'verifying' | 'completed' | 'partial' | 'failed' | 'cancelled';

export type BackupModuleName = 'database' | 'files' | 'configuration' | 'licensing' | 'tenant_configuration';

/**
 * redundant_all: write to every configured destination in parallel; job
 *   succeeds ('completed') if at least one destination succeeds, and is
 *   marked 'partial' (not silently 'completed') if some but not all did.
 * failover: try destinations in ascending `priority` order, stop at the
 *   first success; only fall through to the next on a destination-level
 *   failure.
 */
export type BackupWriteMode = 'redundant_all' | 'failover';

/**
 * BackupJob — one row per backup run (manual, scheduled, or system-triggered
 * pre-upgrade/pre-restore safety snapshot). This is the durable record the
 * Bull job (BackupQueueProcessor) reports progress against and the REST API
 * (BackupController) reads from -- the Bull job payload itself only ever
 * carries this row's id.
 *
 * All spec-required metadata fields live here: id/version/timestamp/creator
 * are the entity's own id/appVersion/createdAt/createdById; the rest
 * (modulesIncluded, dbVersion, tenantId, fileCount, databaseSizeBytes,
 * archiveSizeBytes/compressedSizeBytes, compressionRatio,
 * encrypted/checksum, durationMs, status) are explicit columns. The same
 * data is also embedded as a JSON manifest inside the archive itself (see
 * BackupManifestService) so a backup remains self-describing even if this
 * row is lost/restored into a different environment.
 */
@Entity('backup_jobs')
@Index(['tenantId', 'status'])
@Index(['tenantId', 'createdAt'])
@Index(['tenantId', 'type'])
export class BackupJob {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** null in self-hosted (single-tenant); required per-backup isolation in cloud. */
  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string | null;

  @Column({ type: 'varchar', length: 20 })
  type: BackupType;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: BackupStatus;

  /** e.g. ['database','files','configuration','licensing'] */
  @Column({ type: 'jsonb', default: '[]' })
  modules: BackupModuleName[];

  /**
   * Primary/first-resolved destination -- kept for backward compatibility
   * with single-destination reads (download/verify/manifest endpoints all
   * resolve via this + storageKey). When 2+ destinations are configured,
   * this is: the (only) succeeded destination in failover mode, or the
   * highest-priority succeeded destination in redundant_all mode. The full
   * per-destination breakdown lives in BackupJobDestination rows.
   */
  @Column({ name: 'storage_config_id', type: 'uuid', nullable: true })
  storageConfigId: string | null;

  /** Key/path of the archive within the primary storage destination (see storageConfigId doc comment). */
  @Column({ name: 'storage_key', type: 'varchar', length: 1000, nullable: true })
  storageKey: string | null;

  /** How this job's destination list (BackupJobDestination rows, when 2+) should be written. Irrelevant for single-destination jobs. */
  @Column({ name: 'write_mode', type: 'varchar', length: 20, default: 'failover' })
  writeMode: BackupWriteMode;

  /**
   * The full destination list (BackupStorageConfig ids, priority-ordered)
   * resolved by BackupDestinationResolverService at job-creation time --
   * resolved once here rather than re-resolved inside execute(), so a
   * destination being edited/deactivated between "create" and "run" can't
   * silently change what an already-queued job targets. Null/empty means
   * "resolve the process-wide local default at execute time" (no
   * destinations configured at all).
   */
  @Column({ name: 'destination_ids', type: 'jsonb', nullable: true })
  destinationIds: string[] | null;

  /** Full manifest snapshot (see BackupManifestService) for quick API reads without re-downloading the archive. */
  @Column({ type: 'jsonb', nullable: true })
  manifest: Record<string, unknown> | null;

  @Column({ name: 'checksum_sha256', type: 'varchar', length: 64, nullable: true })
  checksumSha256: string | null;

  @Column({ name: 'size_bytes', type: 'bigint', default: 0 })
  sizeBytes: string; // bigint surfaces as string via pg driver

  @Column({ name: 'compressed_size_bytes', type: 'bigint', default: 0 })
  compressedSizeBytes: string;

  @Column({ name: 'compression_ratio', type: 'numeric', precision: 6, scale: 3, nullable: true })
  compressionRatio: string | null;

  @Column({ name: 'encrypted', default: false })
  encrypted: boolean;

  @Column({ name: 'app_version', type: 'varchar', length: 50, nullable: true })
  appVersion: string | null;

  @Column({ name: 'db_version', type: 'varchar', length: 50, nullable: true })
  dbVersion: string | null;

  @Column({ name: 'file_count', type: 'int', default: 0 })
  fileCount: number;

  @Column({ name: 'database_size_bytes', type: 'bigint', nullable: true })
  databaseSizeBytes: string | null;

  @Column({ name: 'duration_ms', type: 'int', nullable: true })
  durationMs: number | null;

  @Column({ name: 'progress', type: 'int', default: 0 })
  progress: number;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ name: 'created_by_id', type: 'uuid', nullable: true })
  createdById: string | null;

  @Column({ name: 'schedule_id', type: 'uuid', nullable: true })
  scheduleId: string | null;

  @Column({ name: 'bull_job_id', type: 'varchar', length: 100, nullable: true })
  bullJobId: string | null;

  @Column({ name: 'cancel_requested', default: false })
  cancelRequested: boolean;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  /** Retention: rows past this are eligible for automatic expiry deletion. */
  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
