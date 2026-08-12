import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';
import type { BackupModuleName } from './backup-job.entity';

export type RestoreMode =
  | 'entire_application' | 'database_only' | 'files_only'
  | 'configuration_only' | 'selected_modules' | 'selected_tenant';

export type RestoreStatus =
  | 'pending' | 'validating' | 'running' | 'rolled_back'
  | 'completed' | 'failed' | 'cancelled';

export type VersionCompatibility = 'same' | 'older' | 'newer' | 'incompatible';

/**
 * RestoreJob — one row per restore attempt, and the durable record the
 * restore state machine (RestoreService) advances through validate ->
 * verify checksum -> version/db compatibility -> pre-restore safety backup
 * -> confirm -> restore db/files/config -> mark-restart-required -> post
 * validation -> report, per the spec's exact required ordering.
 *
 * `validationReport` holds the final "restore report" (spec requirement) --
 * per-step outcome, warnings, and the post-restore validation result.
 */
@Entity('restore_jobs')
@Index(['tenantId', 'status'])
@Index(['tenantId', 'createdAt'])
export class RestoreJob {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string | null;

  @Column({ name: 'source_backup_job_id', type: 'uuid' })
  sourceBackupJobId: string;

  @Column({ type: 'varchar', length: 30, default: 'entire_application' })
  mode: RestoreMode;

  @Column({ type: 'jsonb', default: '[]' })
  modules: BackupModuleName[];

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: RestoreStatus;

  /** Explicit confirmation flag the API caller must set to true (spec: "confirmation required"). */
  @Column({ default: false })
  confirmed: boolean;

  /** Automatic safety snapshot taken before any destructive step -- always created, spec requirement. */
  @Column({ name: 'pre_restore_backup_job_id', type: 'uuid', nullable: true })
  preRestoreBackupJobId: string | null;

  @Column({ name: 'version_compatibility', type: 'varchar', length: 20, nullable: true })
  versionCompatibility: VersionCompatibility | null;

  @Column({ name: 'restart_required', default: false })
  restartRequired: boolean;

  @Column({ name: 'rolled_back', default: false })
  rolledBack: boolean;

  @Column({ name: 'validation_report', type: 'jsonb', nullable: true })
  validationReport: Record<string, unknown> | null;

  @Column({ name: 'progress', type: 'int', default: 0 })
  progress: number;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ name: 'created_by_id', type: 'uuid', nullable: true })
  createdById: string | null;

  @Column({ name: 'bull_job_id', type: 'varchar', length: 100, nullable: true })
  bullJobId: string | null;

  @Column({ name: 'cancel_requested', default: false })
  cancelRequested: boolean;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
