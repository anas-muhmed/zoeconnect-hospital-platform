import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { PgEngineService } from './pg-engine.service';
import { BackupStorageConfigService } from './backup-storage-config.service';
import { BackupStorageProviderFactory } from '../providers/backup-storage-provider.factory';
import { BackupSchedulerService } from '../scheduler/backup-scheduler.service';
import { BackupEncryptionService } from './backup-encryption.service';
import { AuditService } from '../../audit/audit.service';
import { isDatabaseReachable } from '../utils/db-reachability.util';

export type HealthCheckItemStatus = 'pass' | 'warn' | 'fail';

export interface HealthCheckItem {
  key: string;
  label: string;
  status: HealthCheckItemStatus;
  message: string;
}

export interface HealthCheckReport {
  overallStatus: HealthCheckItemStatus;
  items: HealthCheckItem[];
  checkedAt: string;
}

/**
 * BackupHealthCheckService — "Run Health Check" (point 7 of the "Database
 * Backup Service" review), replacing the old separate "Validate"/
 * "Re-detect Installation" buttons with one aggregated report. Runs EVERY
 * check below regardless of whether an earlier one failed (spec requirement:
 * "should run ALL checks and report all results, not stop at the first red
 * item") -- each check is individually wrapped so a thrown error in one
 * becomes a 'fail' item rather than aborting the rest.
 *
 * A dedicated service rather than a new method on PgEngineService (which
 * this composes, not replaces) since a full health check touches storage,
 * scheduler, and encryption concerns PgEngineService has no reason to know
 * about.
 */
@Injectable()
export class BackupHealthCheckService {
  private readonly logger = new Logger(BackupHealthCheckService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly pgEngineService: PgEngineService,
    private readonly storageConfigService: BackupStorageConfigService,
    private readonly storageProviderFactory: BackupStorageProviderFactory,
    private readonly schedulerService: BackupSchedulerService,
    private readonly encryptionService: BackupEncryptionService,
    private readonly auditService: AuditService,
  ) {}

  async runFullHealthCheck(actorId?: string): Promise<HealthCheckReport> {
    // Every check below is run independently (Promise.allSettled) so one
    // failing/throwing check can never prevent the others from running or
    // being reported -- each `run()` call already catches its own errors
    // and turns them into a 'fail' item, but allSettled is an extra belt-
    // and-braces guarantee against a check that somehow still rejects.
    const results = await Promise.allSettled([
      this.run('detect_provider', 'Detect Database Provider', () => this.checkDetectProvider()),
      this.run('db_connectivity', 'Database Connectivity', () => this.checkDbConnectivity()),
      this.run('backup_tool', 'Backup Tool (pg_dump)', () => this.checkBackupTool()),
      this.run('restore_tool', 'Restore Tool (pg_restore)', () => this.checkRestoreTool()),
      this.run('storage_capacity', 'Storage Free Disk Space', () => this.checkStorageCapacity()),
      this.run('default_destination', 'Default Backup Destination', () => this.checkDefaultDestination()),
      this.run('scheduler', 'Backup Scheduler', () => this.checkScheduler()),
      this.run('encryption_config', 'Encryption Configuration', () => this.checkEncryptionConfig()),
    ]);

    const items: HealthCheckItem[] = results.map((r, idx) =>
      r.status === 'fulfilled'
        ? r.value
        : { key: `check_${idx}`, label: 'Unknown check', status: 'fail' as const, message: (r.reason as Error)?.message ?? 'Unknown error' },
    );

    const overallStatus: HealthCheckItemStatus = items.some((i) => i.status === 'fail')
      ? 'fail'
      : items.some((i) => i.status === 'warn')
        ? 'warn'
        : 'pass';

    const report: HealthCheckReport = { overallStatus, items, checkedAt: new Date().toISOString() };

    await this.auditService.log({
      action: 'BACKUP_HEALTH_CHECK_RUN', module: 'BACKUP', entityType: 'backup_tool_settings',
      userId: actorId, metadata: { overallStatus, itemStatuses: Object.fromEntries(items.map((i) => [i.key, i.status])) },
    });

    return report;
  }

  /** Wraps a single check so a thrown error becomes a 'fail' item instead of aborting the whole health check. */
  private async run(key: string, label: string, fn: () => Promise<Omit<HealthCheckItem, 'key' | 'label'>>): Promise<HealthCheckItem> {
    try {
      const result = await fn();
      return { key, label, ...result };
    } catch (err) {
      return { key, label, status: 'fail', message: (err as Error).message };
    }
  }

  private async checkDetectProvider(): Promise<Omit<HealthCheckItem, 'key' | 'label'>> {
    const status = await this.pgEngineService.redetect();
    if (status.status === 'healthy') return { status: 'pass', message: `Resolved: ${status.strategyLabel}${status.version ? ` (v${status.version})` : ''}.` };
    if (status.status === 'degraded') return { status: 'warn', message: status.lastValidationMessage || 'Provider resolved but the last validation reported a problem.' };
    return { status: 'fail', message: 'No usable database backup provider could be detected.' };
  }

  private async checkDbConnectivity(): Promise<Omit<HealthCheckItem, 'key' | 'label'>> {
    const ok = await isDatabaseReachable(this.dataSource);
    return ok ? { status: 'pass', message: 'Application database is reachable.' } : { status: 'fail', message: 'Could not reach the application database (SELECT 1 failed).' };
  }

  private async checkBackupTool(): Promise<Omit<HealthCheckItem, 'key' | 'label'>> {
    const result = await this.pgEngineService.testConfiguration();
    return result.ok ? { status: 'pass', message: result.message } : { status: 'fail', message: result.message };
  }

  private async checkRestoreTool(): Promise<Omit<HealthCheckItem, 'key' | 'label'>> {
    // Same combined check as checkBackupTool() -- see BackupDiagnosticsService's
    // doc comment on why pg_dump/pg_restore aren't independently probed today.
    const result = await this.pgEngineService.testConfiguration();
    return result.ok ? { status: 'pass', message: result.message } : { status: 'fail', message: result.message };
  }

  private async checkStorageCapacity(): Promise<Omit<HealthCheckItem, 'key' | 'label'>> {
    const configs = await this.storageConfigService.findAll();
    const defaultConfig = configs.find((c) => c.isDefault);
    const capacity = defaultConfig
      ? await this.storageConfigService.getCapacity(defaultConfig.id)
      : await this.storageProviderFactory.forDefaultLocal().getCapacity();
    if (!capacity.healthy) return { status: 'fail', message: capacity.message || 'Default storage destination is unhealthy.' };
    if (capacity.availableBytes !== null && capacity.availableBytes < 500 * 1024 * 1024) {
      return { status: 'warn', message: `Low free space on default backup destination: ${(capacity.availableBytes / (1024 * 1024)).toFixed(0)} MB available.` };
    }
    return { status: 'pass', message: capacity.availableBytes !== null ? `${(capacity.availableBytes / (1024 * 1024 * 1024)).toFixed(1)} GB available.` : 'Storage destination healthy (capacity not reported by this driver).' };
  }

  private async checkDefaultDestination(): Promise<Omit<HealthCheckItem, 'key' | 'label'>> {
    const configs = await this.storageConfigService.findAll();
    const defaultConfig = configs.find((c) => c.isDefault);
    const result = defaultConfig
      ? await this.storageConfigService.testConnection(defaultConfig.id)
      : await this.storageProviderFactory.forDefaultLocal().testConnection();
    return result.ok ? { status: 'pass', message: result.message } : { status: 'fail', message: result.message };
  }

  private async checkScheduler(): Promise<Omit<HealthCheckItem, 'key' | 'label'>> {
    const health = await this.schedulerService.getSchedulerHealth();
    if (health.activeSchedules === 0) return { status: 'pass', message: 'No active backup schedules configured.' };
    return health.running ? { status: 'pass', message: health.message } : { status: 'warn', message: health.message };
  }

  private async checkEncryptionConfig(): Promise<Omit<HealthCheckItem, 'key' | 'label'>> {
    const enabledByDefault = this.configService.get<boolean>('backup.encryptionEnabledByDefault');
    if (!enabledByDefault) {
      return { status: 'pass', message: 'Encryption-by-default is not enabled -- nothing to validate (per-job passphrases are still supported).' };
    }
    try {
      // Cheap check only -- resolves the configured default passphrase
      // without performing any real encrypt/decrypt round trip.
      this.encryptionService.resolvePassphrase();
      return { status: 'pass', message: 'Default encryption passphrase is configured.' };
    } catch (err) {
      return { status: 'fail', message: (err as Error).message };
    }
  }
}
