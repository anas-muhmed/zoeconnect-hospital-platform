import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { BackupArchiveService } from './backup-archive.service';
import { BackupStorageProviderFactory } from '../providers/backup-storage-provider.factory';
import { BackupJobDestination } from '../entities/backup-job-destination.entity';
import { BackupStorageConfig } from '../entities/backup-storage-config.entity';
import type { BackupWriteMode } from '../entities/backup-job.entity';

export interface WriteResult {
  overallStatus: 'completed' | 'partial' | 'failed';
  /** Highest-priority destination that succeeded -- BackupJob.storageConfigId/storageKey mirror this. Null only when overallStatus === 'failed'. */
  primary: { storageConfigId: string; storageKey: string } | null;
  sizeBytes: number;
  compressedSizeBytes: number;
  checksumSha256: string;
  perDestination: Array<{ storageConfigId: string; status: 'completed' | 'failed' | 'skipped'; storageKey: string; errorMessage?: string; bytesWritten?: number }>;
}

/**
 * BackupDestinationWriterService — implements points 8 & 9 of the storage-
 * hardening brief: writing a single backup to multiple destinations, with
 * two explicit modes:
 *   - `redundant_all`: write to every configured destination in parallel
 *     (Promise.allSettled); the job succeeds if AT LEAST ONE destination
 *     succeeds, but the overall status is 'partial' (not silently
 *     'completed') when some-but-not-all destinations failed. Only if
 *     EVERY destination fails is the whole write considered failed.
 *   - `failover`: try destinations in ascending `priority` order, stop at
 *     the first success; only fall through to the next destination on a
 *     destination-level failure. Every destination after the first success
 *     is recorded as 'skipped', not attempted.
 *
 * The archive is produced exactly ONCE regardless of destination count --
 * see BackupArchiveService.packAndUpload() (single destination, still
 * direct streaming, no staging file, no regression) vs.
 * packToLocalFile()+uploadLocalFileToProvider() (2+ destinations, bounded
 * local staging file, see that method's doc comment for the full tradeoff
 * writeup). The staging file is always cleaned up here, success or
 * failure, in a `finally`.
 */
@Injectable()
export class BackupDestinationWriterService {
  private readonly logger = new Logger(BackupDestinationWriterService.name);

  constructor(
    private readonly archiveService: BackupArchiveService,
    private readonly storageProviderFactory: BackupStorageProviderFactory,
    @InjectRepository(BackupJobDestination) private readonly destinationRepo: Repository<BackupJobDestination>,
  ) {}

  async write(params: {
    backupJobId: string;
    stagingDir: string;
    destinations: BackupStorageConfig[]; // must already be sorted ascending by priority
    writeMode: BackupWriteMode;
    buildKey: (destination: BackupStorageConfig) => string;
    encrypt: boolean;
    passphrase?: string;
  }): Promise<WriteResult> {
    const { backupJobId, stagingDir, destinations, writeMode, buildKey, encrypt, passphrase } = params;
    if (destinations.length === 0) {
      throw new Error('BackupDestinationWriterService.write() called with an empty destination list');
    }

    if (destinations.length === 1) {
      return this.writeSingle(backupJobId, stagingDir, destinations[0], buildKey, encrypt, passphrase);
    }

    return writeMode === 'redundant_all'
      ? this.writeRedundantAll(backupJobId, stagingDir, destinations, buildKey, encrypt, passphrase)
      : this.writeFailover(backupJobId, stagingDir, destinations, buildKey, encrypt, passphrase);
  }

  // ── Single destination: direct streaming, no staging file (no regression) ──

  private async writeSingle(
    backupJobId: string,
    stagingDir: string,
    destination: BackupStorageConfig,
    buildKey: (d: BackupStorageConfig) => string,
    encrypt: boolean,
    passphrase?: string,
  ): Promise<WriteResult> {
    const key = buildKey(destination);
    const provider = this.storageProviderFactory.forStorageConfig(destination);
    const row = await this.destinationRepo.save(this.destinationRepo.create({
      backupJobId, storageConfigId: destination.id, priority: destination.priority, status: 'uploading', storageKey: key, startedAt: new Date(),
    }));
    try {
      const result = await this.archiveService.packAndUpload(stagingDir, provider, key, { encrypt, passphrase });
      await this.destinationRepo.update(row.id, {
        status: 'completed', bytesWritten: String(result.compressedSizeBytes), completedAt: new Date(),
      });
      return {
        overallStatus: 'completed',
        primary: { storageConfigId: destination.id, storageKey: key },
        sizeBytes: result.sizeBytes,
        compressedSizeBytes: result.compressedSizeBytes,
        checksumSha256: result.checksumSha256,
        perDestination: [{ storageConfigId: destination.id, status: 'completed', storageKey: key, bytesWritten: result.compressedSizeBytes }],
      };
    } catch (err) {
      await this.destinationRepo.update(row.id, { status: 'failed', errorMessage: (err as Error).message, completedAt: new Date() });
      throw err;
    }
  }

  // ── 2+ destinations: pack once to a staging file, fan out ──────────────────

  private async writeRedundantAll(
    backupJobId: string,
    stagingDir: string,
    destinations: BackupStorageConfig[],
    buildKey: (d: BackupStorageConfig) => string,
    encrypt: boolean,
    passphrase?: string,
  ): Promise<WriteResult> {
    const { stagingFile, packResult } = await this.pack(stagingDir, encrypt, passphrase);
    try {
      const rows = await Promise.all(destinations.map((d) => this.destinationRepo.save(this.destinationRepo.create({
        backupJobId, storageConfigId: d.id, priority: d.priority, status: 'uploading', storageKey: buildKey(d), startedAt: new Date(),
      }))));

      const outcomes = await Promise.allSettled(destinations.map(async (d, i) => {
        const key = buildKey(d);
        const provider = this.storageProviderFactory.forStorageConfig(d);
        await this.archiveService.uploadLocalFileToProvider(stagingFile, provider, key);
        await this.destinationRepo.update(rows[i].id, { status: 'completed', bytesWritten: String(packResult.compressedSizeBytes), completedAt: new Date() });
        return { storageConfigId: d.id, status: 'completed' as const, storageKey: key, bytesWritten: packResult.compressedSizeBytes };
      }));

      const perDestination = await Promise.all(outcomes.map(async (outcome, i) => {
        if (outcome.status === 'fulfilled') return outcome.value;
        const d = destinations[i];
        const message = (outcome.reason as Error)?.message ?? String(outcome.reason);
        await this.destinationRepo.update(rows[i].id, { status: 'failed', errorMessage: message, completedAt: new Date() });
        this.logger.warn(`redundant_all: destination ${d.id} (${d.name}) failed for backup job ${backupJobId}: ${message}`);
        return { storageConfigId: d.id, status: 'failed' as const, storageKey: buildKey(d), errorMessage: message };
      }));

      const succeeded = perDestination.filter((p) => p.status === 'completed');
      if (succeeded.length === 0) {
        throw new Error(`All ${destinations.length} configured destination(s) failed: ${perDestination.map((p) => (p.status === 'failed' ? p.errorMessage : undefined)).filter(Boolean).join('; ')}`);
      }
      // Primary = highest-priority (lowest number) succeeded destination, since `destinations` is priority-sorted.
      const primaryDest = destinations.find((d) => succeeded.some((s) => s.storageConfigId === d.id))!;
      const primaryResult = succeeded.find((s) => s.storageConfigId === primaryDest.id)!;

      return {
        overallStatus: succeeded.length === destinations.length ? 'completed' : 'partial',
        primary: { storageConfigId: primaryDest.id, storageKey: primaryResult.storageKey },
        sizeBytes: packResult.sizeBytes,
        compressedSizeBytes: packResult.compressedSizeBytes,
        checksumSha256: packResult.checksumSha256,
        perDestination,
      };
    } finally {
      await this.cleanupFile(stagingFile);
    }
  }

  private async writeFailover(
    backupJobId: string,
    stagingDir: string,
    destinations: BackupStorageConfig[],
    buildKey: (d: BackupStorageConfig) => string,
    encrypt: boolean,
    passphrase?: string,
  ): Promise<WriteResult> {
    const { stagingFile, packResult } = await this.pack(stagingDir, encrypt, passphrase);
    try {
      const perDestination: WriteResult['perDestination'] = [];
      let primary: WriteResult['primary'] = null;

      for (const d of destinations) {
        const key = buildKey(d);
        if (primary) {
          // Already succeeded at a higher-priority destination -- record as skipped, do not attempt.
          await this.destinationRepo.save(this.destinationRepo.create({
            backupJobId, storageConfigId: d.id, priority: d.priority, status: 'skipped', storageKey: key,
          }));
          perDestination.push({ storageConfigId: d.id, status: 'skipped', storageKey: key });
          continue;
        }
        const row = await this.destinationRepo.save(this.destinationRepo.create({
          backupJobId, storageConfigId: d.id, priority: d.priority, status: 'uploading', storageKey: key, startedAt: new Date(),
        }));
        try {
          const provider = this.storageProviderFactory.forStorageConfig(d);
          await this.archiveService.uploadLocalFileToProvider(stagingFile, provider, key);
          await this.destinationRepo.update(row.id, { status: 'completed', bytesWritten: String(packResult.compressedSizeBytes), completedAt: new Date() });
          perDestination.push({ storageConfigId: d.id, status: 'completed', storageKey: key, bytesWritten: packResult.compressedSizeBytes });
          primary = { storageConfigId: d.id, storageKey: key };
        } catch (err) {
          const message = (err as Error).message;
          await this.destinationRepo.update(row.id, { status: 'failed', errorMessage: message, completedAt: new Date() });
          perDestination.push({ storageConfigId: d.id, status: 'failed', storageKey: key, errorMessage: message });
          this.logger.warn(`failover: destination ${d.id} (${d.name}) failed for backup job ${backupJobId}, trying next: ${message}`);
        }
      }

      if (!primary) {
        throw new Error(`All ${destinations.length} configured failover destination(s) failed: ${perDestination.map((p) => p.errorMessage).filter(Boolean).join('; ')}`);
      }

      return {
        overallStatus: 'completed', // failover either fully succeeds (at the destination that worked) or the whole write throws -- no partial state in this mode by design.
        primary,
        sizeBytes: packResult.sizeBytes,
        compressedSizeBytes: packResult.compressedSizeBytes,
        checksumSha256: packResult.checksumSha256,
        perDestination,
      };
    } finally {
      await this.cleanupFile(stagingFile);
    }
  }

  private async pack(stagingDir: string, encrypt: boolean, passphrase?: string) {
    const stagingFile = path.join(os.tmpdir(), `zoeconnect-backup-staging-${randomUUID()}.tar.gz${encrypt ? '.enc' : ''}`);
    const packResult = await this.archiveService.packToLocalFile(stagingDir, stagingFile, { encrypt, passphrase });
    return { stagingFile, packResult };
  }

  private async cleanupFile(filePath: string): Promise<void> {
    await fs.promises.unlink(filePath).catch(() => undefined);
  }
}
