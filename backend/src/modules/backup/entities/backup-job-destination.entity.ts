import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';

export type BackupJobDestinationStatus = 'pending' | 'uploading' | 'completed' | 'failed' | 'skipped';

/**
 * BackupJobDestination — one row per (BackupJob, BackupStorageConfig) pair
 * when a job targets 2+ destinations (redundant-all fan-out, or a
 * failover list where every attempted destination -- including ones that
 * lost the race/were skipped -- gets recorded).
 *
 * A single-destination job (the common case) does NOT create rows here --
 * BackupJob.storageConfigId/storageKey alone describe it, exactly as
 * before this change, and BackupArchiveService.packAndUpload() keeps
 * streaming straight to that one destination with no staging file. Rows
 * here only exist for the 2+-destination path, orchestrated by
 * BackupDestinationWriterService.
 *
 * `status='skipped'` covers failover destinations after the first
 * success -- they were never attempted, but the row still records that
 * they were configured for this job's write-mode list.
 */
@Entity('backup_job_destinations')
@Index(['backupJobId'])
@Index(['storageConfigId'])
export class BackupJobDestination {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'backup_job_id', type: 'uuid' })
  backupJobId: string;

  @Column({ name: 'storage_config_id', type: 'uuid' })
  storageConfigId: string;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: BackupJobDestinationStatus;

  /** Priority this destination was attempted at, copied from BackupStorageConfig.priority at job-run time (destination priority can change later without rewriting history). */
  @Column({ type: 'int', default: 100 })
  priority: number;

  @Column({ name: 'storage_key', type: 'varchar', length: 1000, nullable: true })
  storageKey: string | null;

  @Column({ name: 'bytes_written', type: 'bigint', nullable: true })
  bytesWritten: string | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
