import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';
import type { BackupModuleName, BackupType, BackupWriteMode } from './backup-job.entity';

/**
 * BackupSchedule — an admin-configurable, dynamic (not fixed-in-code) cron
 * schedule. BackupSchedulerService loads every `isActive` row at module init
 * and registers a `CronJob` per row via `SchedulerRegistry`; it also adds/
 * updates/removes the corresponding `CronJob` whenever a row changes through
 * the API, so no application restart is needed to pick up a new/edited
 * schedule.
 */
@Entity('backup_schedules')
@Index(['tenantId', 'isActive'])
export class BackupSchedule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string | null;

  @Column({ type: 'varchar', length: 200 })
  name: string;

  /** Standard 5-field cron expression (SchedulerRegistry / cron package format). */
  @Column({ name: 'cron_expression', type: 'varchar', length: 100 })
  cronExpression: string;

  @Column({ name: 'backup_type', type: 'varchar', length: 20, default: 'full' })
  backupType: BackupType;

  @Column({ type: 'jsonb', default: '["database","files","configuration"]' })
  modules: BackupModuleName[];

  /** Legacy/default single destination; superseded by storageConfigIds when that array is non-empty. */
  @Column({ name: 'storage_config_id', type: 'uuid', nullable: true })
  storageConfigId: string | null;

  /** Multi-destination target list for this schedule's runs (point 8/9 of the storage hardening brief). Null/empty means "fall back to storageConfigId, or the tenant's scheduled-purpose default". */
  @Column({ name: 'storage_config_ids', type: 'jsonb', nullable: true })
  storageConfigIds: string[] | null;

  @Column({ name: 'write_mode', type: 'varchar', length: 20, default: 'failover' })
  writeMode: BackupWriteMode;

  @Column({ name: 'retention_count', type: 'int', nullable: true })
  retentionCount: number | null;

  @Column({ name: 'retention_days', type: 'int', nullable: true })
  retentionDays: number | null;

  @Column({ name: 'encrypt', default: false })
  encrypt: boolean;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'last_run_at', type: 'timestamptz', nullable: true })
  lastRunAt: Date | null;

  @Column({ name: 'last_backup_job_id', type: 'uuid', nullable: true })
  lastBackupJobId: string | null;

  @Column({ name: 'next_run_at', type: 'timestamptz', nullable: true })
  nextRunAt: Date | null;

  @Column({ name: 'created_by_id', type: 'uuid', nullable: true })
  createdById: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
