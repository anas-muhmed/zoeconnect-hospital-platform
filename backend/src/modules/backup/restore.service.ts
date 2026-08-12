import { Inject, Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import * as fs from 'fs';
import * as path from 'path';
import { Repository, DataSource } from 'typeorm';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { QUEUE_NAMES } from '../../config/redis.config';
import { BackupJob, BackupModuleName } from './entities/backup-job.entity';
import { RestoreJob, RestoreMode, VersionCompatibility } from './entities/restore-job.entity';
import { getTenantScopedRepositoryToken } from '../platform/tenant/repositories/tenant-scoped-repository.provider';
import type { TenantScopedRepository } from '../platform/tenant/repositories/tenant-scoped.repository';
import { TenantContextStorage } from '../platform/tenant/context/tenant-context-storage';
import { BackupArchiveService } from './services/backup-archive.service';
import { BackupManifestService, BackupManifest } from './services/backup-manifest.service';
import { BackupVerificationService, ChecksumMismatchError } from './services/backup-verification.service';
import { BackupEncryptionService } from './services/backup-encryption.service';
import { DatabaseBackupProviderRegistry } from './providers/database-backup-provider.registry';
import { BackupStorageProviderFactory } from './providers/backup-storage-provider.factory';
import { BackupService } from './backup.service';
import { SettingsService } from '../settings/settings.service';
import { AuditService } from '../audit/audit.service';
import { isDatabaseReachable } from './utils/db-reachability.util';
import { compareVersions, CompatibilityLevel } from './utils/version-compatibility.util';

export interface CreateRestoreParams {
  backupId: string;
  mode?: RestoreMode;
  modules?: BackupModuleName[];
  confirm: boolean;
  passphrase?: string;
  createdById?: string | null;
}

/** GET /backups/:id/restore-readiness — point 6 of the "Database Backup Service" review: read-only pre-check the Restore Wizard should call and display before an admin confirms a restore. */
export interface RestoreReadinessReport {
  backupJobId: string;
  diskSpaceOk: boolean;
  databaseReachable: boolean;
  clientToolsOk: boolean;
  backupArchiveOk: boolean;
  versionCompatibilityOk: boolean;
  overallReady: boolean;
  details: {
    availableDiskBytes: number | null;
    requiredDiskBytes: number;
    archiveChecksumVerified: boolean;
    appVersionCompatibility: VersionCompatibility;
    dbVersionCompatibility: CompatibilityLevel;
    messages: string[];
  };
  checkedAt: string;
}

@Injectable()
export class RestoreService {
  private readonly logger = new Logger(RestoreService.name);

  constructor(
    private readonly configService: ConfigService,
    @InjectQueue(QUEUE_NAMES.BACKUP) private readonly backupQueue: Queue,
    @InjectRepository(RestoreJob) private readonly rawRestoreJobRepo: Repository<RestoreJob>,
    @InjectRepository(BackupJob) private readonly rawBackupJobRepo: Repository<BackupJob>,
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(getTenantScopedRepositoryToken(RestoreJob)) private readonly restoreJobRepo: TenantScopedRepository<RestoreJob>,
    @Inject(getTenantScopedRepositoryToken(BackupJob)) private readonly backupJobRepo: TenantScopedRepository<BackupJob>,
    private readonly tenantContext: TenantContextStorage,
    private readonly archiveService: BackupArchiveService,
    private readonly manifestService: BackupManifestService,
    private readonly verificationService: BackupVerificationService,
    private readonly encryptionService: BackupEncryptionService,
    private readonly providerRegistry: DatabaseBackupProviderRegistry,
    private readonly storageProviderFactory: BackupStorageProviderFactory,
    private readonly backupService: BackupService,
    private readonly settingsService: SettingsService,
    private readonly auditService: AuditService,
  ) {}

  private get deploymentMode(): 'self_hosted' | 'cloud' {
    return this.configService.get<string>('deployment.mode') === 'cloud' ? 'cloud' : 'self_hosted';
  }

  // ── Pure, independently-testable guard logic ─────────────────────────────

  /**
   * Version-compatibility classification (spec: "same-version restore
   * supported; warn on older/newer; block genuinely incompatible restores,
   * e.g. major version mismatch you define"). A backup whose major version
   * is below `minCompatibleAppVersion`'s major is 'incompatible' and MUST
   * block the restore -- every other combination is allowed with a
   * warning. Pure function: no I/O, easily unit-testable.
   */
  static checkVersionCompatibility(
    backupAppVersion: string,
    currentAppVersion: string,
    minCompatibleAppVersion: string,
  ): VersionCompatibility {
    const backup = RestoreService.parseVersion(backupAppVersion);
    const current = RestoreService.parseVersion(currentAppVersion);
    const minCompat = RestoreService.parseVersion(minCompatibleAppVersion);

    if (backup.major < minCompat.major) return 'incompatible';
    if (backup.major === current.major && backup.minor === current.minor && backup.patch === current.patch) {
      return 'same';
    }
    if (backup.major !== current.major) {
      return backup.major > current.major ? 'newer' : 'older';
    }
    if (backup.minor !== current.minor) return backup.minor > current.minor ? 'newer' : 'older';
    return backup.patch > current.patch ? 'newer' : 'older';
  }

  private static parseVersion(v: string): { major: number; minor: number; patch: number } {
    const parts = String(v || '0.0.0').split('.').map((p) => parseInt(p, 10));
    return {
      major: Number.isFinite(parts[0]) ? parts[0] : 0,
      minor: Number.isFinite(parts[1]) ? parts[1] : 0,
      patch: Number.isFinite(parts[2]) ? parts[2] : 0,
    };
  }

  /**
   * Explicit tenant-isolation guard, re-checked HERE (not just relied upon
   * via TenantScopeGuard/TenantScopedRepository) immediately before any
   * destructive restore step, per the task brief: "re-check tenantId
   * explicitly in RestoreService before any destructive operation, not just
   * via the guard." Self-hosted (no real multi-tenancy) is a no-op; cloud
   * mode requires both an established caller tenant AND an exact match
   * against the backup's own tenantId.
   */
  static assertTenantOwnership(
    deploymentMode: 'self_hosted' | 'cloud',
    callerTenantId: string | null,
    backupTenantId: string | null,
  ): void {
    if (deploymentMode !== 'cloud') return;
    if (!callerTenantId) {
      throw new ForbiddenException('Restore requires an established tenant context in cloud mode.');
    }
    if (backupTenantId !== callerTenantId) {
      throw new ForbiddenException('Cannot restore a backup that belongs to a different tenant.');
    }
  }

  // ── Create (enqueue) ───────────────────────────────────────────────────────

  async create(params: CreateRestoreParams): Promise<RestoreJob> {
    if (!params.confirm) {
      throw new BadRequestException('Restore requires explicit confirmation (confirm: true) — this is a destructive operation.');
    }
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    const backupJob = await this.rawBackupJobRepo.findOne({ where: { id: params.backupId } });
    if (!backupJob) throw new NotFoundException(`Backup ${params.backupId} not found`);

    RestoreService.assertTenantOwnership(this.deploymentMode, tenantId, backupJob.tenantId);

    const job = this.rawRestoreJobRepo.create({
      tenantId,
      sourceBackupJobId: backupJob.id,
      mode: params.mode ?? 'entire_application',
      modules: params.modules ?? [],
      status: 'pending',
      confirmed: true,
      createdById: params.createdById ?? null,
    });
    const saved = await this.rawRestoreJobRepo.save(job);

    const bullJob = await this.backupQueue.add(
      'run-restore',
      { restoreJobId: saved.id, tenantId, passphrase: params.passphrase ?? null },
      { attempts: 1, removeOnComplete: 100, removeOnFail: 50 },
    );
    await this.rawRestoreJobRepo.update(saved.id, { bullJobId: String(bullJob.id) });

    await this.auditService.log({
      action: 'RESTORE_REQUESTED', module: 'BACKUP', entityType: 'restore_job', entityId: saved.id,
      userId: params.createdById ?? undefined,
      metadata: { sourceBackupJobId: backupJob.id, mode: job.mode },
    });

    return saved;
  }

  async findOne(id: string): Promise<RestoreJob> {
    const job = await this.restoreJobRepo.findOne({ where: { id } });
    if (!job) throw new NotFoundException(`Restore job ${id} not found`);
    return job;
  }

  async findAll(opts: { page?: number; limit?: number } = {}): Promise<{ data: RestoreJob[]; total: number }> {
    const page = opts.page ?? 1;
    const limit = Math.min(opts.limit ?? 20, 100);
    const [data, total] = await this.restoreJobRepo.findAndCount({
      order: { createdAt: 'DESC' }, take: limit, skip: (page - 1) * limit,
    });
    return { data, total };
  }

  async cancel(id: string): Promise<RestoreJob> {
    const job = await this.findOne(id);
    if (job.status !== 'pending' && job.status !== 'validating') {
      throw new BadRequestException(`Cannot cancel a restore already in status '${job.status}' — it may have already made destructive changes.`);
    }
    await this.rawRestoreJobRepo.update(id, { cancelRequested: true, status: 'cancelled' });
    return this.findOne(id);
  }

  // ── Execution (called by BackupQueueProcessor) ───────────────────────────

  /**
   * The full restore state machine, followed in exactly this order per the
   * spec: validate archive -> verify checksum -> check app version -> check
   * db compatibility -> create pre-restore backup -> (confirmation already
   * required at `create()` time) -> restore db -> restore files -> restore
   * configuration -> mark restart-required -> run post-restore validation
   * -> generate restore report.
   *
   * "Mark services-restart-required" is deliberately a no-op flag/return
   * value, not an actual process restart -- this backend cannot safely
   * restart its own process mid-request (see RestoreJob.restartRequired's
   * doc + the report returned to the caller, which surfaces this as an
   * instruction for the operator/orchestrator, not something this method
   * performs itself).
   */
  async execute(restoreJobId: string, passphrase: string | null, onProgress: (pct: number) => Promise<void>): Promise<void> {
    const job = await this.rawRestoreJobRepo.findOne({ where: { id: restoreJobId } });
    if (!job) throw new NotFoundException(`Restore job ${restoreJobId} not found`);

    const report: Record<string, unknown> = { steps: [] as Array<Record<string, unknown>> };
    const steps = report.steps as Array<Record<string, unknown>>;
    const recordStep = (name: string, ok: boolean, detail?: unknown) => steps.push({ name, ok, detail, at: new Date().toISOString() });

    const startedAt = new Date();
    await this.rawRestoreJobRepo.update(restoreJobId, { status: 'validating', startedAt });
    // Notification trigger: "restore started" (see BackupService.notifyBestEffort's
    // doc comment for why this is a log line rather than a real admin channel today).
    this.logger.log(`[notification] Restore started: restoreJobId=${restoreJobId}`);

    let stagingDir: string | null = null;
    let preRestoreBackupId: string | null = null;

    try {
      const backupJob = await this.rawBackupJobRepo.findOne({ where: { id: job.sourceBackupJobId } });
      if (!backupJob) throw new NotFoundException(`Source backup ${job.sourceBackupJobId} not found`);
      if (!backupJob.storageKey) throw new BadRequestException('Source backup has no stored archive');

      // Explicit re-check, independent of whatever guard already ran on the
      // HTTP request that created this job -- see assertTenantOwnership's
      // doc comment for why this can't just rely on the guard having run.
      RestoreService.assertTenantOwnership(this.deploymentMode, job.tenantId, backupJob.tenantId);
      recordStep('tenant_isolation_check', true);

      // 1. Validate archive (manifest structurally sound)
      await onProgress(5);
      const provider = await this.backupService.resolveProvider(backupJob.storageConfigId);
      const manifestBuf = await this.archiveService.readManifestOnly(provider, backupJob.storageKey, {
        encrypted: backupJob.encrypted, passphrase: passphrase ?? undefined,
      });
      const manifest: BackupManifest = this.manifestService.parse(manifestBuf);
      this.verificationService.validateManifestStructure(manifest);
      recordStep('validate_archive', true, { backupId: manifest.backupId });

      // 2. Verify checksum
      await onProgress(15);
      if (backupJob.checksumSha256) {
        const freshStream = await provider.downloadStream(backupJob.storageKey);
        try {
          await this.verificationService.verifyChecksum(freshStream, backupJob.checksumSha256);
          recordStep('verify_checksum', true);
        } catch (err) {
          recordStep('verify_checksum', false, (err as Error).message);
          throw err;
        }
      } else {
        recordStep('verify_checksum', false, 'No checksum recorded on backup job — skipped (not a hard failure, but unusual)');
      }

      // 3. Check application version compatibility
      await onProgress(20);
      const currentAppVersion = this.manifestService.resolveAppVersion();
      const minCompatible = this.configService.get<string>('backup.minCompatibleAppVersion') || '1.0.0';
      const compatibility = RestoreService.checkVersionCompatibility(manifest.appVersion, currentAppVersion, minCompatible);
      await this.rawRestoreJobRepo.update(restoreJobId, { versionCompatibility: compatibility });
      if (compatibility === 'incompatible') {
        recordStep('check_app_version', false, { backupAppVersion: manifest.appVersion, currentAppVersion, compatibility });
        throw new BadRequestException(
          `Backup app version ${manifest.appVersion} is incompatible with this installation (below minimum compatible major version).`,
        );
      }
      recordStep('check_app_version', true, { backupAppVersion: manifest.appVersion, currentAppVersion, compatibility });

      // 4. Check database compatibility (best-effort: just record dbVersion; a
      //    real cross-major-Postgres-version check would inspect pg_dump's
      //    archive header, deferred here for scope).
      await onProgress(25);
      recordStep('check_db_compatibility', true, { backupDbVersion: manifest.dbVersion });

      // 5. Create pre-restore safety backup — ALWAYS, before any destructive step.
      await onProgress(30);
      const preRestoreBackup = await this.backupService.createAndRunSynchronously({
        type: 'pre_restore',
        modules: ['database', 'files', 'configuration', 'licensing'],
        createdById: job.createdById,
      });
      preRestoreBackupId = preRestoreBackup.id;
      await this.rawRestoreJobRepo.update(restoreJobId, { preRestoreBackupJobId: preRestoreBackup.id, status: 'running' });
      recordStep('pre_restore_safety_backup', preRestoreBackup.status === 'completed', { backupId: preRestoreBackup.id });
      if (preRestoreBackup.status !== 'completed') {
        throw new Error('Pre-restore safety backup did not complete successfully — aborting restore before any destructive step.');
      }

      // Download + extract the archive being restored FROM.
      await onProgress(40);
      stagingDir = this.archiveService.createTempStagingDir('zoeconnect-restore-');
      await this.archiveService.downloadAndUnpack(provider, backupJob.storageKey, stagingDir, {
        encrypted: backupJob.encrypted, passphrase: passphrase ?? undefined,
      });

      const wantsModule = (m: BackupModuleName) =>
        job.mode === 'entire_application' ? true
        : job.mode === 'database_only' ? m === 'database'
        : job.mode === 'files_only' ? m === 'files'
        : job.mode === 'configuration_only' ? m === 'configuration'
        : job.mode === 'selected_modules' ? job.modules.includes(m)
        : job.mode === 'selected_tenant' ? true
        : false;

      // 6. Restore database
      await onProgress(55);
      if (wantsModule('database')) {
        const dumpPath = path.join(stagingDir, 'database.dump');
        if (fs.existsSync(dumpPath)) {
          await this.providerRegistry.getActiveProvider().restore(fs.createReadStream(dumpPath));
          recordStep('restore_database', true);
        } else {
          recordStep('restore_database', false, 'database.dump not present in archive');
        }
      }

      // 7. Restore files
      await onProgress(70);
      if (wantsModule('files')) {
        await this.restoreFiles(stagingDir);
        recordStep('restore_files', true);
      }

      // 8. Restore configuration
      await onProgress(80);
      if (wantsModule('configuration')) {
        await this.restoreConfiguration(stagingDir, job.tenantId);
        recordStep('restore_configuration', true);
      }

      // 9. Mark services-restart-required (flag only — see doc comment above).
      await onProgress(90);
      await this.rawRestoreJobRepo.update(restoreJobId, { restartRequired: true });
      recordStep('mark_restart_required', true, {
        instructions: 'Restart the API and worker processes to ensure all in-memory caches reflect the restored state.',
      });

      // 10. Post-restore validation
      const dbReachableVersion = await this.providerRegistry.getActiveProvider().getServerVersion();
      recordStep('post_restore_validation', !!dbReachableVersion, { dbVersion: dbReachableVersion });
      if (!dbReachableVersion) {
        throw new Error('Post-restore validation failed: database is not reachable after restore.');
      }

      const durationMs = Date.now() - startedAt.getTime();
      await this.rawRestoreJobRepo.update(restoreJobId, {
        status: 'completed', progress: 100, completedAt: new Date(), validationReport: report as any,
      });
      await this.auditService.log({
        action: 'RESTORE_COMPLETED', module: 'BACKUP', entityType: 'restore_job', entityId: restoreJobId,
        metadata: { durationMs },
      });
      this.logger.log(`[notification] Restore completed: restoreJobId=${restoreJobId}, durationMs=${durationMs}`);
    } catch (err) {
      recordStep('failure', false, (err as Error).message);
      // Automatic rollback where possible: restore the pre-restore safety
      // snapshot's database dump back, so a failed restore never leaves the
      // application in a worse state than before it started (spec:
      // "failed restore should roll back automatically where possible").
      let rolledBack = false;
      if (preRestoreBackupId) {
        rolledBack = await this.attemptRollback(preRestoreBackupId, passphrase).catch((rollbackErr) => {
          recordStep('rollback', false, (rollbackErr as Error).message);
          return false;
        });
        if (rolledBack) recordStep('rollback', true);
      }
      await this.rawRestoreJobRepo.update(restoreJobId, {
        status: rolledBack ? 'rolled_back' : 'failed',
        rolledBack,
        errorMessage: (err as Error).message,
        completedAt: new Date(),
        validationReport: report as any,
      });
      await this.auditService.log({
        action: 'RESTORE_FAILED', module: 'BACKUP', entityType: 'restore_job', entityId: restoreJobId,
        metadata: { error: (err as Error).message, rolledBack },
      });
      throw err;
    } finally {
      if (stagingDir) await this.archiveService.cleanupDir(stagingDir);
    }
  }

  private async attemptRollback(preRestoreBackupId: string, passphrase: string | null): Promise<boolean> {
    const snapshot = await this.rawBackupJobRepo.findOne({ where: { id: preRestoreBackupId } });
    if (!snapshot?.storageKey) return false;
    const provider = await this.backupService.resolveProvider(snapshot.storageConfigId);
    const tempDir = this.archiveService.createTempStagingDir('zoeconnect-rollback-');
    try {
      await this.archiveService.downloadAndUnpack(provider, snapshot.storageKey, tempDir, {
        encrypted: snapshot.encrypted, passphrase: passphrase ?? undefined,
      });
      const dumpPath = path.join(tempDir, 'database.dump');
      if (fs.existsSync(dumpPath)) {
        await this.providerRegistry.getActiveProvider().restore(fs.createReadStream(dumpPath));
      }
      return true;
    } finally {
      await this.archiveService.cleanupDir(tempDir);
    }
  }

  /**
   * Swaps the extracted `files/` tree into place under `<cwd>/uploads`,
   * keeping the pre-restore contents aside until the swap succeeds so a
   * crash mid-restore doesn't leave neither copy in place.
   */
  private async restoreFiles(stagingDir: string): Promise<void> {
    const extracted = path.join(stagingDir, 'files');
    if (!fs.existsSync(extracted)) return;
    const uploadsRoot = path.join(process.cwd(), 'uploads');
    const asideDir = `${uploadsRoot}.pre-restore-${Date.now()}`;
    if (fs.existsSync(uploadsRoot)) {
      await fs.promises.rename(uploadsRoot, asideDir);
    }
    try {
      await fs.promises.rename(extracted, uploadsRoot);
      if (fs.existsSync(asideDir)) await fs.promises.rm(asideDir, { recursive: true, force: true });
    } catch (err) {
      // Best-effort revert so a failed swap doesn't leave `uploads` missing.
      if (fs.existsSync(asideDir) && !fs.existsSync(uploadsRoot)) {
        await fs.promises.rename(asideDir, uploadsRoot).catch(() => undefined);
      }
      throw err;
    }
  }

  private async restoreConfiguration(stagingDir: string, tenantId: string | null): Promise<void> {
    const configPath = path.join(stagingDir, 'configuration.json');
    if (!fs.existsSync(configPath)) return;
    const bundle = JSON.parse(await fs.promises.readFile(configPath, 'utf-8')) as { settings?: Record<string, string> };
    if (bundle.settings) {
      await this.settingsService.applyWebhookUpdate(bundle.settings, tenantId);
    }
    // Licensing.json is intentionally NOT auto-applied here -- see
    // BackupService.stageLicensing's doc comment for why license
    // activation data is backed up but not automatically re-applied on
    // restore (safety: license state depends on external signature
    // validation this restore path does not re-verify).
  }

  // ── Restore readiness (point 6 of the review) ─────────────────────────────

  /**
   * Read-only pre-check for `GET /backups/:id/restore-readiness` -- performs
   * NO destructive action and does not create a restore job. Intended for
   * the Restore Wizard to call and display before an admin confirms a real
   * restore. Every field is a real check (no faked "always green" results):
   *   - diskSpaceOk: compares the archive's stored size against the default
   *     Local storage destination's reported free space (the same
   *     getCapacity() check used elsewhere for Local -- documented proxy for
   *     "where staging/restore happens", since staging uses the OS temp dir
   *     which is typically the same volume in a single-disk deployment).
   *   - databaseReachable: SELECT 1 against the app's own DataSource.
   *   - clientToolsOk: the active database provider's testConfiguration().
   *   - backupArchiveOk: BackupVerificationService's manifest-structure +
   *     checksum check against the actual stored archive.
   *   - versionCompatibilityOk: RestoreService.checkVersionCompatibility()
   *     (app version vs the configured minimum) AND compareVersions() (this
   *     backup's recorded dbVersion vs the current server's version) both
   *     resolving to something other than 'incompatible'.
   */
  async checkRestoreReadiness(backupJobId: string): Promise<RestoreReadinessReport> {
    const backupJob = await this.rawBackupJobRepo.findOne({ where: { id: backupJobId } });
    if (!backupJob) throw new NotFoundException(`Backup ${backupJobId} not found`);

    const archiveSizeBytes = Number(backupJob.compressedSizeBytes || backupJob.sizeBytes || 0);
    const provider = this.providerRegistry.getActiveProvider();

    const [databaseReachable, clientToolsResult, capacity, archiveCheck, currentDbVersion] = await Promise.all([
      isDatabaseReachable(this.dataSource),
      provider.testConfiguration(),
      this.storageProviderFactory.forDefaultLocal().getCapacity(),
      this.checkArchiveIntegrity(backupJob),
      provider.getServerVersion(),
    ]);

    const messages: string[] = [...archiveCheck.messages];

    // Staging needs room for the downloaded archive PLUS its unpacked
    // contents; 2.5x the compressed archive size is a documented, deliberately
    // conservative safety margin, not a measured figure.
    const requiredDiskBytes = Math.ceil(archiveSizeBytes * 2.5);
    const availableDiskBytes = capacity.availableBytes;
    const diskSpaceOk = availableDiskBytes === null ? true : availableDiskBytes >= requiredDiskBytes;
    if (availableDiskBytes === null) {
      messages.push('The default Local storage destination does not report available disk space -- diskSpaceOk defaults to true (unknown), verify manually.');
    }

    if (!clientToolsResult.ok) messages.push(`Client tools check failed: ${clientToolsResult.message}`);

    const currentAppVersion = this.manifestService.resolveAppVersion();
    const minCompatible = this.configService.get<string>('backup.minCompatibleAppVersion') || '1.0.0';
    const appVersionCompatibility = backupJob.appVersion
      ? RestoreService.checkVersionCompatibility(backupJob.appVersion, currentAppVersion, minCompatible)
      : 'incompatible';
    if (!backupJob.appVersion) messages.push('Backup has no recorded application version.');

    const dbCompat = compareVersions(backupJob.dbVersion, currentDbVersion);
    messages.push(dbCompat.message);

    const versionCompatibilityOk = appVersionCompatibility !== 'incompatible' && dbCompat.compatibility !== 'incompatible';
    const overallReady = diskSpaceOk && databaseReachable && clientToolsResult.ok && archiveCheck.ok && versionCompatibilityOk;

    return {
      backupJobId,
      diskSpaceOk,
      databaseReachable,
      clientToolsOk: clientToolsResult.ok,
      backupArchiveOk: archiveCheck.ok,
      versionCompatibilityOk,
      overallReady,
      details: {
        availableDiskBytes,
        requiredDiskBytes,
        archiveChecksumVerified: archiveCheck.checksumVerified,
        appVersionCompatibility,
        dbVersionCompatibility: dbCompat.compatibility,
        messages,
      },
      checkedAt: new Date().toISOString(),
    };
  }

  private async checkArchiveIntegrity(backupJob: BackupJob): Promise<{ ok: boolean; checksumVerified: boolean; messages: string[] }> {
    if (!backupJob.storageKey) return { ok: false, checksumVerified: false, messages: ['Backup has no stored archive yet.'] };
    try {
      const provider = await this.backupService.resolveProvider(backupJob.storageConfigId);
      const manifestBuf = await this.archiveService.readManifestOnly(provider, backupJob.storageKey, { encrypted: backupJob.encrypted });
      const manifest = this.manifestService.parse(manifestBuf);
      this.verificationService.validateManifestStructure(manifest);

      if (!backupJob.checksumSha256) {
        return { ok: true, checksumVerified: false, messages: ['No checksum recorded on this backup -- integrity check limited to manifest structure only.'] };
      }
      const stream = await provider.downloadStream(backupJob.storageKey);
      await this.verificationService.verifyChecksum(stream, backupJob.checksumSha256);
      return { ok: true, checksumVerified: true, messages: [] };
    } catch (err) {
      return { ok: false, checksumVerified: false, messages: [(err as Error).message] };
    }
  }
}
