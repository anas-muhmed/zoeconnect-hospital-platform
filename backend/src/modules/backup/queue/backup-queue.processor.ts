import { Processor, Process, OnQueueFailed } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { QUEUE_NAMES } from '../../../config/redis.config';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';
import { BackupService } from '../backup.service';
import { RestoreService } from '../restore.service';
import { BackupVerificationService } from '../services/backup-verification.service';

interface RunBackupJobData { backupJobId: string; tenantId: string | null; passphrase: string | null }
interface RunRestoreJobData { restoreJobId: string; tenantId: string | null; passphrase: string | null }
interface VerifyJobData { backupJobId: string; tenantId: string | null; passphrase: string | null }
interface DeleteJobData { backupJobId: string; tenantId: string | null }

/**
 * BackupQueueProcessor — async run-backup/run-restore/verify/delete jobs via
 * the existing Bull queue infra (QUEUE_NAMES.BACKUP), with live progress
 * (`job.progress(n)`), retry (Bull's own `attempts`/`backoff`, configured at
 * enqueue time in BackupService/RestoreService), and safe cancel (checked
 * cooperatively at each progress checkpoint via the job row's
 * `cancelRequested` flag — Bull itself has no true mid-job preemption, so
 * this is "checked and honored at the next safe point", not instant kill).
 *
 * Runs in the worker process (`PROCESS_ROLE=worker` or the default 'all').
 * Since a Bull job executes outside any HTTP request's async call graph, it
 * has no ambient `TenantContextStorage` context on its own — `runInTenantScope()`
 * establishes one explicitly from the job payload's `tenantId`, mirroring
 * `AuditService.log()`/`NotificationService.send()`'s pattern of resolving
 * tenant context at enqueue time and carrying it explicitly through the job
 * payload.
 */
@Processor(QUEUE_NAMES.BACKUP)
export class BackupQueueProcessor {
  private readonly logger = new Logger(BackupQueueProcessor.name);

  constructor(
    private readonly backupService: BackupService,
    private readonly restoreService: RestoreService,
    private readonly verificationService: BackupVerificationService,
  ) {}

  private runInTenantScope<T>(tenantId: string | null, fn: () => Promise<T>): Promise<T> {
    return tenantId ? TenantContextStorage.run(tenantId, fn) : TenantContextStorage.runAsSystem(fn);
  }

  @Process('run-backup')
  async handleRunBackup(job: Job<RunBackupJobData>): Promise<void> {
    const { backupJobId, tenantId, passphrase } = job.data;
    this.logger.log(`Processing run-backup job=${job.id} backupJobId=${backupJobId}`);
    await this.runInTenantScope(tenantId, () =>
      this.backupService.execute(backupJobId, passphrase, async (pct) => { await job.progress(pct); }),
    );
  }

  @Process('run-restore')
  async handleRunRestore(job: Job<RunRestoreJobData>): Promise<void> {
    const { restoreJobId, tenantId, passphrase } = job.data;
    this.logger.log(`Processing run-restore job=${job.id} restoreJobId=${restoreJobId}`);
    await this.runInTenantScope(tenantId, () =>
      this.restoreService.execute(restoreJobId, passphrase, async (pct) => { await job.progress(pct); }),
    );
  }

  @Process('verify-backup')
  async handleVerifyBackup(job: Job<VerifyJobData>): Promise<{ valid: boolean; checksum: string }> {
    const { backupJobId, tenantId, passphrase } = job.data;
    return this.runInTenantScope(tenantId, async () => {
      const backupJob = await this.backupService.findOne(backupJobId);
      if (!backupJob.storageKey || !backupJob.checksumSha256) {
        throw new Error('Backup has no stored archive/checksum to verify');
      }
      const provider = await this.backupService.resolveProvider(backupJob.storageConfigId);
      const stream = await provider.downloadStream(backupJob.storageKey);
      await job.progress(50);
      const checksum = await this.verificationService.verifyChecksum(stream, backupJob.checksumSha256);
      await job.progress(100);
      return { valid: true, checksum };
    });
  }

  @Process('delete-backup')
  async handleDeleteBackup(job: Job<DeleteJobData>): Promise<void> {
    const { backupJobId, tenantId } = job.data;
    await this.runInTenantScope(tenantId, () => this.backupService.delete(backupJobId));
  }

  @OnQueueFailed()
  onFailed(job: Job, err: Error): void {
    this.logger.error(`Backup queue job ${job.id} (${job.name}) failed: ${err.message}`, err.stack);
  }
}
