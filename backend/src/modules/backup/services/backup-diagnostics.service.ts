import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { PgEngineService } from './pg-engine.service';
import { BackupStorageConfigService } from './backup-storage-config.service';
import { BackupStorageProviderFactory } from '../providers/backup-storage-provider.factory';
import { BackupJob } from '../entities/backup-job.entity';
import { isDatabaseReachable, hasCreatePrivilegeHeuristic, getCurrentDatabaseSizeBytes } from '../utils/db-reachability.util';
import { compareVersions, CompatibilityLevel } from '../utils/version-compatibility.util';

/** Conservative fallback throughput (bytes/second) used to estimate backup duration when no prior completed BackupJob exists to derive real throughput from. Documented as a rough guess, not a measurement. */
const FALLBACK_THROUGHPUT_BYTES_PER_SEC = 5 * 1024 * 1024; // 5 MB/s

export interface DiagnosticsVersionCompatibility {
  serverVersion: string | null;
  clientVersion: string | null;
  compatibility: CompatibilityLevel;
  message: string;
}

export interface DiagnosticsReport {
  databaseReachable: boolean;
  backupToolOk: boolean;
  restoreToolOk: boolean;
  /** Heuristic only -- see hasCreatePrivilegeHeuristic()'s doc comment. Not a real pg_dump dry run. */
  permissionsOk: boolean;
  storageWritable: boolean;
  estimatedBackupSizeBytes: number;
  estimatedDurationSeconds: number;
  /** True when estimatedDurationSeconds is a fallback guess (no prior completed backup to derive real throughput from) rather than based on this environment's own history. */
  estimatedDurationIsRoughGuess: boolean;
  versionCompatibility: DiagnosticsVersionCompatibility;
  messages: string[];
  checkedAt: string;
}

/**
 * BackupDiagnosticsService — "is this environment ready to back up" report
 * (point 4 of the "Database Backup Service" review). Every field here is a
 * REAL check against live state (the app's own DataSource, the resolved
 * pg execution strategy, the configured default storage destination, and
 * this environment's own backup-job history) -- nothing is faked/always-green.
 *
 * Deliberately a separate service from PgEngineService (which already owns
 * strategy resolution/detection/validation) -- this composes PgEngineService,
 * BackupStorageConfigService, and direct DataSource queries, none of which
 * PgEngineService itself needs for its own job.
 */
@Injectable()
export class BackupDiagnosticsService {
  private readonly logger = new Logger(BackupDiagnosticsService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(BackupJob) private readonly backupJobRepo: Repository<BackupJob>,
    private readonly pgEngineService: PgEngineService,
    private readonly storageConfigService: BackupStorageConfigService,
    private readonly storageProviderFactory: BackupStorageProviderFactory,
  ) {}

  async runDiagnostics(): Promise<DiagnosticsReport> {
    const messages: string[] = [];

    const [databaseReachable, permissionsOk, toolCheck, storage, dbSizeBytes, filesSizeBytes, versionCompatibility] =
      await Promise.all([
        isDatabaseReachable(this.dataSource),
        hasCreatePrivilegeHeuristic(this.dataSource),
        this.pgEngineService.testConfiguration(),
        this.checkStorageWritable(),
        getCurrentDatabaseSizeBytes(this.dataSource),
        this.filesModuleSizeBytes(),
        this.checkVersionCompatibility(),
      ]);

    messages.push('permissionsOk is a heuristic (CREATE privilege check), not a full pg_dump/pg_restore dry run.');
    if (dbSizeBytes === null) messages.push('Could not determine current database size (pg_database_size query failed) -- estimatedBackupSizeBytes excludes it.');

    const estimatedBackupSizeBytes = (dbSizeBytes ?? 0) + filesSizeBytes;
    const { seconds: estimatedDurationSeconds, isRoughGuess: estimatedDurationIsRoughGuess } =
      await this.estimateDuration(estimatedBackupSizeBytes);
    if (estimatedDurationIsRoughGuess) {
      messages.push('No prior completed backup found in this environment -- estimatedDurationSeconds uses a conservative fallback throughput, not measured history.');
    }

    // testConfiguration() runs a single combined check covering both
    // pg_dump and pg_restore together (see PgToolsService.testConfiguration/
    // IPgExecutionStrategy.testConfiguration's contract) -- if the first
    // binary it checks (pg_dump) fails, it never gets to check pg_restore at
    // all, so backupToolOk/restoreToolOk are both driven off the same `ok`
    // flag rather than being independently probed. Documented rather than
    // silently implying two independent checks were run.
    const backupToolOk = toolCheck.ok;
    const restoreToolOk = toolCheck.ok;
    if (!toolCheck.ok) messages.push(`Backup/restore tool check failed: ${toolCheck.message}`);

    return {
      databaseReachable,
      backupToolOk,
      restoreToolOk,
      permissionsOk,
      storageWritable: storage.ok,
      estimatedBackupSizeBytes,
      estimatedDurationSeconds,
      estimatedDurationIsRoughGuess,
      versionCompatibility,
      messages: storage.ok ? messages : [...messages, `Default storage destination check failed: ${storage.message}`],
      checkedAt: new Date().toISOString(),
    };
  }

  private async checkStorageWritable(): Promise<{ ok: boolean; message: string }> {
    try {
      const configs = await this.storageConfigService.findAll();
      const defaultConfig = configs.find((c) => c.isDefault);
      if (defaultConfig) {
        const result = await this.storageConfigService.testConnection(defaultConfig.id);
        return { ok: result.ok, message: result.message };
      }
      // No BackupStorageConfig row configured yet -- fall back to the
      // process-wide local default provider directly, mirroring
      // BackupService.execute()'s own "no destinations resolved" fallback.
      const result = await this.storageProviderFactory.forDefaultLocal().testConnection();
      return { ok: result.ok, message: result.message };
    } catch (err) {
      return { ok: false, message: (err as Error).message };
    }
  }

  /**
   * Sums the size of the `<cwd>/uploads` tree -- the same path
   * BackupService.stageFiles() copies for the 'files' module (see that
   * method's doc comment). Duplicated as a path constant here (rather than
   * calling a private method on BackupService) since this service has no
   * dependency on BackupService and shouldn't need to import it just for a
   * path; if that root ever changes, BackupService.stageFiles() is the
   * source of truth to update alongside this.
   */
  private async filesModuleSizeBytes(): Promise<number> {
    const uploadsRoot = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadsRoot)) return 0;
    return this.dirSizeBytes(uploadsRoot);
  }

  private async dirSizeBytes(dir: string): Promise<number> {
    let total = 0;
    const entries = await fs.promises.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        total += await this.dirSizeBytes(full);
      } else {
        total += await fs.promises.stat(full).then((s) => s.size).catch(() => 0);
      }
    }
    return total;
  }

  /**
   * Duration estimate (spec-documented heuristic, point 4): derives
   * bytes/second throughput from the most recent completed BackupJob
   * (archiveSizeBytes/durationMs), then projects that rate onto
   * `estimatedBackupSizeBytes`. Falls back to a fixed conservative rate,
   * clearly flagged via `isRoughGuess`, when no completed job exists yet.
   */
  private async estimateDuration(estimatedBackupSizeBytes: number): Promise<{ seconds: number; isRoughGuess: boolean }> {
    const lastCompleted = await this.backupJobRepo.findOne({
      where: { status: 'completed' },
      order: { completedAt: 'DESC' },
    }).catch(() => null);

    const durationMs = lastCompleted?.durationMs;
    const archiveSizeBytes = lastCompleted ? Number(lastCompleted.compressedSizeBytes) : 0;

    if (lastCompleted && durationMs && durationMs > 0 && archiveSizeBytes > 0) {
      const throughputBytesPerMs = archiveSizeBytes / durationMs;
      const seconds = throughputBytesPerMs > 0 ? Math.ceil((estimatedBackupSizeBytes / throughputBytesPerMs) / 1000) : 0;
      return { seconds, isRoughGuess: false };
    }

    const seconds = Math.ceil(estimatedBackupSizeBytes / FALLBACK_THROUGHPUT_BYTES_PER_SEC);
    return { seconds, isRoughGuess: true };
  }

  /** Server (Postgres) version vs resolved client tool version -- point 5 of the review. */
  private async checkVersionCompatibility(): Promise<DiagnosticsVersionCompatibility> {
    const [serverVersion, description] = await Promise.all([
      this.pgEngineService.getDatabaseVersion(),
      this.pgEngineService.resolveStrategy().then((s) => s.describe()),
    ]);
    const clientVersion = description.version;
    const { compatibility, message } = compareVersions(serverVersion, clientVersion);
    return { serverVersion, clientVersion, compatibility, message };
  }
}
