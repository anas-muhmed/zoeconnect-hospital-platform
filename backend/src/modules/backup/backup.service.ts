import { Inject, Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import * as fs from 'fs';
import * as path from 'path';
import { In, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { QUEUE_NAMES } from '../../config/redis.config';
import { BackupJob, BackupModuleName, BackupStatus, BackupType, BackupWriteMode } from './entities/backup-job.entity';
import { BackupStorageConfig } from './entities/backup-storage-config.entity';
import { BackupDestinationResolverService } from './services/backup-destination-resolver.service';
import { BackupDestinationWriterService } from './services/backup-destination-writer.service';
import { getTenantScopedRepositoryToken } from '../platform/tenant/repositories/tenant-scoped-repository.provider';
import type { TenantScopedRepository } from '../platform/tenant/repositories/tenant-scoped.repository';
import { TenantContextStorage } from '../platform/tenant/context/tenant-context-storage';
import { BackupArchiveService } from './services/backup-archive.service';
import { BackupManifestService } from './services/backup-manifest.service';
import { BackupEncryptionService } from './services/backup-encryption.service';
import { DatabaseBackupProviderRegistry } from './providers/database-backup-provider.registry';
import { BackupStorageProviderFactory } from './providers/backup-storage-provider.factory';
import { AuditService } from '../audit/audit.service';
import { SettingsService } from '../settings/settings.service';
import { LicenseService } from '../licensing/license.service';
import { NotificationService } from '../notifications/notification.service';

const ALL_MODULES: BackupModuleName[] = ['database', 'files', 'configuration', 'licensing', 'tenant_configuration'];

/** Env var name patterns never included in a "configuration" module backup, even when includeEnvVars is on. */
const ENV_SECRET_KEY_PATTERNS = [/SECRET/i, /PASSWORD/i, /_KEY$/i, /TOKEN/i, /CREDENTIAL/i];

export interface CreateBackupParams {
  type?: BackupType;
  modules?: BackupModuleName[];
  storageConfigId?: string;
  /** 2+ destinations for redundant/failover fan-out writes (points 8/9). Takes precedence over storageConfigId when non-empty. */
  storageConfigIds?: string[];
  writeMode?: BackupWriteMode;
  /** 'scheduled' when triggered by BackupSchedulerService, else 'manual' (default) -- drives BackupDestinationResolverService's purpose filter. */
  purpose?: 'manual' | 'scheduled';
  encrypt?: boolean;
  passphrase?: string;
  createdById?: string | null;
}

@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);

  constructor(
    private readonly configService: ConfigService,
    @InjectQueue(QUEUE_NAMES.BACKUP) private readonly backupQueue: Queue,
    @InjectRepository(BackupJob) private readonly rawBackupJobRepo: Repository<BackupJob>,
    @InjectRepository(BackupStorageConfig) private readonly rawStorageConfigRepo: Repository<BackupStorageConfig>,
    @Inject(getTenantScopedRepositoryToken(BackupJob)) private readonly backupJobRepo: TenantScopedRepository<BackupJob>,
    @Inject(getTenantScopedRepositoryToken(BackupStorageConfig)) private readonly storageConfigRepo: TenantScopedRepository<BackupStorageConfig>,
    private readonly tenantContext: TenantContextStorage,
    private readonly archiveService: BackupArchiveService,
    private readonly manifestService: BackupManifestService,
    private readonly encryptionService: BackupEncryptionService,
    private readonly providerRegistry: DatabaseBackupProviderRegistry,
    private readonly storageProviderFactory: BackupStorageProviderFactory,
    private readonly destinationResolver: BackupDestinationResolverService,
    private readonly destinationWriter: BackupDestinationWriterService,
    private readonly auditService: AuditService,
    private readonly settingsService: SettingsService,
    private readonly licenseService: LicenseService,
    private readonly notificationService: NotificationService,
  ) {}

  private get deploymentMode(): 'self_hosted' | 'cloud' {
    return this.configService.get<string>('deployment.mode') === 'cloud' ? 'cloud' : 'self_hosted';
  }

  // ── Create (enqueue) ───────────────────────────────────────────────────────

  async create(params: CreateBackupParams): Promise<BackupJob> {
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    const modules = params.modules?.length ? params.modules : ALL_MODULES;
    const encrypt = params.encrypt ?? this.configService.get<boolean>('backup.encryptionEnabledByDefault') ?? false;
    if (encrypt) {
      // Fail fast at creation time, not deep inside the queue processor,
      // if encryption was requested but no passphrase can be resolved.
      this.encryptionService.resolvePassphrase(params.passphrase);
    }

    const retentionDays = this.configService.get<number>('backup.retentionDays');
    // Resolved once, here, at creation time -- see BackupJob.destinationIds's
    // doc comment for why (a destination edited/deactivated after this point
    // must not silently change what an already-queued job targets).
    const destinations = await this.destinationResolver.resolveForJob({
      tenantId,
      purpose: params.purpose ?? 'manual',
      explicitIds: params.storageConfigIds ?? null,
      legacySingleId: params.storageConfigId ?? null,
    });
    const job = this.rawBackupJobRepo.create({
      tenantId,
      type: params.type ?? 'manual',
      status: 'pending',
      modules,
      storageConfigId: destinations[0]?.id ?? null,
      destinationIds: destinations.length > 0 ? destinations.map((d) => d.id) : null,
      writeMode: params.writeMode ?? 'failover',
      encrypted: encrypt,
      createdById: params.createdById ?? null,
      expiresAt: retentionDays ? new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000) : null,
    });
    const saved = await this.rawBackupJobRepo.save(job);

    const bullJob = await this.backupQueue.add(
      'run-backup',
      { backupJobId: saved.id, tenantId, passphrase: encrypt ? (params.passphrase ?? null) : null },
      { attempts: 1, removeOnComplete: 100, removeOnFail: 50 },
    );
    await this.rawBackupJobRepo.update(saved.id, { bullJobId: String(bullJob.id) });

    await this.auditService.log({
      action: 'BACKUP_CREATE_REQUESTED', module: 'BACKUP', entityType: 'backup_job', entityId: saved.id,
      userId: params.createdById ?? undefined,
      metadata: { type: saved.type, modules, encrypt },
    });

    return saved;
  }

  /**
   * Like `create()`, but runs the backup inline (no Bull enqueue) and
   * resolves only once it's finished. Used by RestoreService for the
   * spec-mandated automatic pre-restore safety snapshot -- the restore
   * state machine must not advance to any destructive step until this
   * snapshot genuinely exists on disk/in storage, so it cannot be a
   * fire-and-forget queue job here.
   */
  async createAndRunSynchronously(params: CreateBackupParams): Promise<BackupJob> {
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    const modules = params.modules?.length ? params.modules : ALL_MODULES;
    const encrypt = params.encrypt ?? false;
    const job = this.rawBackupJobRepo.create({
      tenantId,
      type: params.type ?? 'manual',
      status: 'pending',
      modules,
      storageConfigId: params.storageConfigId ?? null,
      encrypted: encrypt,
      createdById: params.createdById ?? null,
    });
    const saved = await this.rawBackupJobRepo.save(job);
    await this.execute(saved.id, encrypt ? (params.passphrase ?? null) : null, async () => undefined);
    return this.findOne(saved.id);
  }

  /**
   * Hook point for other code (e.g. a future app-upgrade orchestrator) to
   * trigger an automatic pre-upgrade safety backup. Per the task brief:
   * exposed as a callable method, deliberately NOT wired into any actual
   * migration/upgrade lifecycle hook here (no obvious existing hook was
   * found in this codebase to attach to without inventing new
   * infrastructure out of scope for this change).
   */
  async triggerBeforeUpgradeBackup(createdById?: string | null): Promise<BackupJob> {
    return this.create({ type: 'pre_upgrade', modules: ALL_MODULES, createdById });
  }

  // ── Reads ────────────────────────────────────────────────────────────────

  async findAll(opts: { page?: number; limit?: number; status?: BackupStatus } = {}): Promise<{ data: BackupJob[]; total: number }> {
    const page = opts.page ?? 1;
    const limit = Math.min(opts.limit ?? 20, 100);
    const [data, total] = await this.backupJobRepo.findAndCount({
      where: opts.status ? { status: opts.status } : {},
      order: { createdAt: 'DESC' },
      take: limit,
      skip: (page - 1) * limit,
    });
    return { data, total };
  }

  async findOne(id: string): Promise<BackupJob> {
    const job = await this.backupJobRepo.findOne({ where: { id } });
    if (!job) throw new NotFoundException(`Backup ${id} not found`);
    return job;
  }

  async getManifest(id: string, passphrase?: string): Promise<Record<string, unknown>> {
    const job = await this.findOne(id);
    if (!job.storageKey) throw new BadRequestException('Backup has no stored archive yet');
    const provider = await this.resolveProvider(job.storageConfigId);
    const buf = await this.archiveService.readManifestOnly(provider, job.storageKey, {
      encrypted: job.encrypted, passphrase,
    });
    return JSON.parse(buf.toString('utf-8'));
  }

  async getDownloadStream(id: string) {
    const job = await this.findOne(id);
    if (!job.storageKey) throw new BadRequestException('Backup has no stored archive yet');
    const provider = await this.resolveProvider(job.storageConfigId);
    return { stream: await provider.downloadStream(job.storageKey), job };
  }

  async cancel(id: string): Promise<BackupJob> {
    const job = await this.findOne(id);
    if (job.status !== 'pending' && job.status !== 'running') {
      throw new BadRequestException(`Cannot cancel a backup in status '${job.status}'`);
    }
    await this.rawBackupJobRepo.update(id, { cancelRequested: true });
    if (job.bullJobId) {
      const bullJob = await this.backupQueue.getJob(job.bullJobId);
      if (bullJob && (await bullJob.isActive()) === false) {
        await bullJob.remove().catch(() => undefined);
      }
    }
    return this.findOne(id);
  }

  async delete(id: string): Promise<void> {
    const job = await this.findOne(id);
    if (job.storageKey) {
      const provider = await this.resolveProvider(job.storageConfigId);
      await provider.delete(job.storageKey).catch((err) => {
        this.logger.warn(`Failed to delete archive for backup ${id}: ${(err as Error).message}`);
      });
    }
    await this.backupJobRepo.delete({ id });
    await this.auditService.log({ action: 'BACKUP_DELETE', module: 'BACKUP', entityType: 'backup_job', entityId: id });
  }

  async health(): Promise<{ storageProviders: unknown[]; recentFailures: number; oldestUnexpiredBackup: Date | null }> {
    const providers = this.storageProviderFactory.listAvailableDrivers();
    const recentFailures = await this.backupJobRepo.count({ where: { status: 'failed' } });
    const [oldest] = await this.backupJobRepo.find({ order: { createdAt: 'ASC' }, take: 1 });
    return { storageProviders: providers, recentFailures, oldestUnexpiredBackup: oldest?.createdAt ?? null };
  }

  // ── Storage destination resolution ──────────────────────────────────────

  async resolveProvider(storageConfigId: string | null) {
    if (storageConfigId) {
      const cfg = await this.storageConfigRepo.findOne({ where: { id: storageConfigId } });
      if (!cfg) throw new NotFoundException(`Backup storage destination ${storageConfigId} not found`);
      return this.storageProviderFactory.forStorageConfig(cfg);
    }
    return this.storageProviderFactory.forDefaultLocal();
  }

  // ── Execution (called by BackupQueueProcessor) ───────────────────────────

  /**
   * Runs the actual backup: stages module data into a temp directory, packs
   * + streams it to the destination, updates the BackupJob row, applies
   * retention, and notifies. Reports progress via `onProgress`.
   */
  async execute(jobId: string, passphrase: string | null, onProgress: (pct: number) => Promise<void>): Promise<void> {
    const job = await this.rawBackupJobRepo.findOne({ where: { id: jobId } });
    if (!job) throw new NotFoundException(`Backup job ${jobId} not found`);

    const startedAt = new Date();
    await this.rawBackupJobRepo.update(jobId, { status: 'running', startedAt });
    const stagingDir = this.archiveService.createTempStagingDir();
    let fileCount = 0;
    let databaseSizeBytes: number | null = null;
    let dbVersion: string | null = null;

    try {
      await onProgress(5);
      if (job.modules.includes('database')) {
        const result = await this.stageDatabase(stagingDir);
        databaseSizeBytes = result.sizeBytes;
        dbVersion = result.dbVersion;
      }
      await onProgress(35);
      if (job.modules.includes('files')) {
        fileCount = await this.stageFiles(stagingDir);
      }
      await onProgress(60);
      if (job.modules.includes('configuration')) {
        await this.stageConfiguration(stagingDir, job.tenantId);
      }
      if (job.modules.includes('licensing')) {
        await this.stageLicensing(stagingDir, job.tenantId);
      }
      if (job.modules.includes('tenant_configuration') && job.tenantId) {
        await this.stageTenantConfiguration(stagingDir, job.tenantId);
      }
      await onProgress(70);

      const manifest = this.manifestService.build({
        backupId: job.id,
        createdBy: job.createdById,
        deploymentType: this.deploymentMode,
        tenantId: job.tenantId,
        backupType: job.type,
        modules: job.modules,
        dbVersion,
        fileCount,
        databaseSizeBytes,
        encrypted: job.encrypted,
      });
      fs.writeFileSync(path.join(stagingDir, 'manifest.json'), this.manifestService.toJsonBuffer(manifest));

      await onProgress(75);
      const destinations = await this.resolveDestinationRows(job);
      const resolvedPassphrase = job.encrypted ? this.encryptionService.resolvePassphrase(passphrase) : undefined;
      const key = this.buildStorageKey(job);
      // No BackupStorageConfig rows resolved at all (fresh install, nothing
      // configured yet) -- fall back to the process-wide local default
      // provider directly, exactly as before this change, rather than
      // routing through the destination writer (which requires at least
      // one real BackupStorageConfig row to attribute BackupJobDestination
      // rows to).
      const result = destinations.length === 0
        ? await this.archiveService.packAndUpload(stagingDir, this.storageProviderFactory.forDefaultLocal(), key, { encrypt: job.encrypted, passphrase: resolvedPassphrase })
          .then((r) => ({ overallStatus: 'completed' as const, primary: { storageConfigId: null as unknown as string, storageKey: key }, ...r, perDestination: [] as unknown[] }))
        : await this.destinationWriter.write({
          backupJobId: job.id,
          stagingDir,
          destinations,
          writeMode: job.writeMode ?? 'failover',
          buildKey: () => key,
          encrypt: job.encrypted,
          passphrase: resolvedPassphrase,
        });
      await onProgress(95);

      const durationMs = Date.now() - startedAt.getTime();
      // result.overallStatus is 'completed' | 'partial' -- writer.write() throws
      // (caught below, -> 'failed') if every configured destination failed.
      await this.rawBackupJobRepo.update(jobId, {
        status: result.overallStatus,
        storageConfigId: result.primary?.storageConfigId ?? job.storageConfigId,
        storageKey: result.primary?.storageKey ?? null,
        checksumSha256: result.checksumSha256,
        sizeBytes: String(result.sizeBytes),
        compressedSizeBytes: String(result.compressedSizeBytes),
        compressionRatio: result.sizeBytes > 0 ? (result.compressedSizeBytes / result.sizeBytes).toFixed(3) : null,
        fileCount,
        databaseSizeBytes: databaseSizeBytes !== null ? String(databaseSizeBytes) : null,
        dbVersion,
        appVersion: manifest.appVersion,
        durationMs,
        completedAt: new Date(),
        progress: 100,
      });

      await this.auditService.log({
        action: result.overallStatus === 'partial' ? 'BACKUP_COMPLETED_PARTIAL' : 'BACKUP_COMPLETED',
        module: 'BACKUP', entityType: 'backup_job', entityId: jobId,
        metadata: {
          durationMs, sizeBytes: result.sizeBytes, compressedSizeBytes: result.compressedSizeBytes,
          writeMode: job.writeMode, destinations: result.perDestination,
        },
      });
      if (result.overallStatus === 'partial') {
        await this.notifyBestEffort('Backup completed with some destination failures', `Backup ${jobId} completed in ${Math.round(durationMs / 1000)}s but not every configured destination succeeded -- see BackupJobDestination rows.`);
      } else {
        await this.notifyBestEffort('Backup completed', `Backup ${jobId} completed successfully in ${Math.round(durationMs / 1000)}s.`);
      }

      await this.applyRetentionPolicy(job.tenantId);
    } catch (err) {
      const durationMs = Date.now() - startedAt.getTime();
      await this.rawBackupJobRepo.update(jobId, {
        status: 'failed', errorMessage: (err as Error).message, durationMs, completedAt: new Date(),
      });
      await this.auditService.log({
        action: 'BACKUP_FAILED', module: 'BACKUP', entityType: 'backup_job', entityId: jobId,
        metadata: { error: (err as Error).message },
      });
      await this.notifyBestEffort('Backup failed', `Backup ${jobId} failed: ${(err as Error).message}`);
      throw err;
    } finally {
      await this.archiveService.cleanupDir(stagingDir);
    }
  }

  /** Loads the BackupStorageConfig rows referenced by job.destinationIds (set once at create() time), preserving their resolved priority order. */
  private async resolveDestinationRows(job: BackupJob): Promise<BackupStorageConfig[]> {
    if (!job.destinationIds || job.destinationIds.length === 0) return [];
    const rows = await this.rawStorageConfigRepo.find({ where: { id: In(job.destinationIds) } });
    const byId = new Map(rows.map((r) => [r.id, r]));
    // Preserve destinationIds' original (priority-sorted) order; silently drop
    // any id that was deleted between job creation and execution.
    return job.destinationIds.map((id) => byId.get(id)).filter((r): r is BackupStorageConfig => !!r);
  }

  private buildStorageKey(job: BackupJob): string {
    const datePart = new Date().toISOString().replace(/[:.]/g, '-');
    const tenantPrefix = job.tenantId ? `${job.tenantId}/` : '';
    return `${tenantPrefix}${job.type}-${datePart}-${job.id}.tar.gz${job.encrypted ? '.enc' : ''}`;
  }

  // ── Module staging ───────────────────────────────────────────────────────

  private async stageDatabase(stagingDir: string): Promise<{ sizeBytes: number; dbVersion: string | null }> {
    const provider = this.providerRegistry.getActiveProvider();
    const dumpStream = await provider.dump();
    const destPath = path.join(stagingDir, 'database.dump');
    await new Promise<void>((resolve, reject) => {
      const ws = fs.createWriteStream(destPath);
      dumpStream.pipe(ws);
      dumpStream.on('error', reject);
      ws.on('error', reject);
      ws.on('finish', () => resolve());
    });
    const stat = await fs.promises.stat(destPath);
    const dbVersion = await provider.getServerVersion();
    return { sizeBytes: stat.size, dbVersion };
  }

  /**
   * Copies the object-repository's local storage root (`<cwd>/uploads` --
   * see LocalStorageProvider, which already fans out cms-media/
   * display-media/feedback-media/etc. subdirectories under this single
   * root) into the staging tree so it's included in the same tar as
   * everything else.
   *
   * NOTE (documented deviation): this uses `fs.cp()` (a real, streaming
   * per-file copy -- never buffers a whole file in memory) rather than a
   * true zero-copy multi-root tar stream, so a files-module backup
   * temporarily doubles disk usage for the uploads tree during the backup
   * run. A fully zero-copy pipeline would need a custom tar-entry stream
   * that isn't rooted at a single `cwd` the way the `tar` package's
   * `create()` is -- out of scope for this iteration; flagged here rather
   * than silently accepted.
   */
  private async stageFiles(stagingDir: string): Promise<number> {
    const uploadsRoot = path.join(process.cwd(), 'uploads');
    const destRoot = path.join(stagingDir, 'files');
    if (!fs.existsSync(uploadsRoot)) return 0;
    await fs.promises.cp(uploadsRoot, destRoot, { recursive: true });
    return this.countFiles(destRoot);
  }

  private async countFiles(dir: string): Promise<number> {
    let count = 0;
    const entries = await fs.promises.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) count += await this.countFiles(full);
      else count += 1;
    }
    return count;
  }

  private async stageConfiguration(stagingDir: string, tenantId: string | null): Promise<void> {
    const settings = await this.settingsService.getSettings(tenantId ?? undefined);
    const includeEnv = this.configService.get<boolean>('backup.includeEnvVars');
    const env: Record<string, string> = {};
    if (includeEnv) {
      for (const [key, value] of Object.entries(process.env)) {
        if (value === undefined) continue;
        if (ENV_SECRET_KEY_PATTERNS.some((pattern) => pattern.test(key))) continue;
        env[key] = value;
      }
    }
    const bundle = { settings, env: includeEnv ? env : undefined, capturedAt: new Date().toISOString() };
    fs.writeFileSync(path.join(stagingDir, 'configuration.json'), JSON.stringify(bundle, null, 2));
  }

  private async stageLicensing(stagingDir: string, tenantId: string | null): Promise<void> {
    try {
      const status = await this.licenseService.getStatus(tenantId ?? undefined);
      fs.writeFileSync(path.join(stagingDir, 'licensing.json'), JSON.stringify(status, null, 2));
    } catch (err) {
      this.logger.warn(`Failed to include licensing data in backup: ${(err as Error).message}`);
    }
  }

  private async stageTenantConfiguration(stagingDir: string, tenantId: string): Promise<void> {
    // Only the tenant's own row (never another tenant's) -- scoped repo
    // reads elsewhere in this service already enforce this; this method
    // only ever receives the backup job's own tenantId.
    fs.writeFileSync(path.join(stagingDir, 'tenant.json'), JSON.stringify({ tenantId }, null, 2));
  }

  private async notifyBestEffort(subject: string, message: string): Promise<void> {
    // Best-effort only: NotificationService's send() is a WhatsApp/SMS/Email
    // template-driven API designed for patient-facing loyalty notifications
    // (phone + registered template name), not a generic "notify an admin"
    // channel -- there is no admin phone/template wiring to send backup
    // lifecycle alerts through today. Logging + AuditService.log() (already
    // called at each lifecycle point) are the real notification channel for
    // this iteration; this is a documented deviation, not silently dropped.
    this.logger.log(`[notification] ${subject}: ${message}`);
  }

  // ── Retention ────────────────────────────────────────────────────────────

  async applyRetentionPolicy(tenantId: string | null): Promise<number> {
    const retentionCount = this.configService.get<number>('backup.retentionCount') ?? 30;
    const now = new Date();

    const run = async () => {
      const expired = await this.backupJobRepo.find({
        where: { status: 'completed' },
        order: { createdAt: 'DESC' },
      });
      const toDelete = expired.filter((j) => j.expiresAt && j.expiresAt.getTime() < now.getTime())
        .concat(expired.slice(retentionCount));
      const uniqueIds = Array.from(new Set(toDelete.map((j) => j.id)));
      for (const id of uniqueIds) {
        await this.delete(id).catch((err) => this.logger.warn(`Retention cleanup failed for ${id}: ${(err as Error).message}`));
      }
      if (uniqueIds.length > 0) {
        await this.auditService.log({ action: 'BACKUP_RETENTION_CLEANUP', module: 'BACKUP', metadata: { deletedCount: uniqueIds.length } });
        await this.notifyBestEffort('Retention cleanup executed', `Deleted ${uniqueIds.length} expired backup(s).`);
      }
      return uniqueIds.length;
    };

    return tenantId ? TenantContextStorage.run(tenantId, run) : TenantContextStorage.runAsSystem(run);
  }
}
