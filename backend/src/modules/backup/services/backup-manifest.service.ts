import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { BackupModuleName, BackupType } from '../entities/backup-job.entity';

export const MANIFEST_SCHEMA_VERSION = 1;

/**
 * BackupManifest — the full self-describing metadata bundle embedded inside
 * every archive as `manifest.json` (pre-compression, so it survives even if
 * the BackupJob database row is lost — e.g. restoring into a brand new
 * environment). Covers every field the spec's "Backup metadata (store all)"
 * list requires.
 */
export interface BackupManifest {
  schemaVersion: number;
  backupId: string;
  createdAt: string; // ISO-8601
  createdBy: string | null;
  deploymentType: 'self_hosted' | 'cloud';
  tenantId: string | null;
  backupType: BackupType;
  modules: BackupModuleName[];
  appVersion: string;
  dbVersion: string | null;
  fileCount: number;
  databaseSizeBytes: number | null;
  encrypted: boolean;
  // Populated only after the archive is fully written (sizeBytes/
  // compressedSizeBytes/compressionRatio/durationMs/status/checksum) — see
  // `finalize()`. Zero/placeholder values below are what a fresh
  // `build()` call yields before the backup run completes.
  sizeBytes: number;
  compressedSizeBytes: number;
  compressionRatio: number | null;
  durationMs: number | null;
  status: string;
  checksumSha256: string | null;
}

@Injectable()
export class BackupManifestService {
  constructor(private readonly configService: ConfigService) {}

  resolveAppVersion(): string {
    return this.configService.get<string>('backup.appVersion') || process.env.npm_package_version || '1.0.0';
  }

  build(params: {
    backupId: string;
    createdBy: string | null;
    deploymentType: 'self_hosted' | 'cloud';
    tenantId: string | null;
    backupType: BackupType;
    modules: BackupModuleName[];
    dbVersion: string | null;
    fileCount: number;
    databaseSizeBytes: number | null;
    encrypted: boolean;
  }): BackupManifest {
    return {
      schemaVersion: MANIFEST_SCHEMA_VERSION,
      backupId: params.backupId,
      createdAt: new Date().toISOString(),
      createdBy: params.createdBy,
      deploymentType: params.deploymentType,
      tenantId: params.tenantId,
      backupType: params.backupType,
      modules: params.modules,
      appVersion: this.resolveAppVersion(),
      dbVersion: params.dbVersion,
      fileCount: params.fileCount,
      databaseSizeBytes: params.databaseSizeBytes,
      encrypted: params.encrypted,
      sizeBytes: 0,
      compressedSizeBytes: 0,
      compressionRatio: null,
      durationMs: null,
      status: 'running',
      checksumSha256: null,
    };
  }

  /** Applied after the archive finishes writing, once final sizes/duration/checksum are known. */
  finalize(manifest: BackupManifest, results: {
    sizeBytes: number;
    compressedSizeBytes: number;
    durationMs: number;
    status: string;
    checksumSha256: string | null;
  }): BackupManifest {
    return {
      ...manifest,
      sizeBytes: results.sizeBytes,
      compressedSizeBytes: results.compressedSizeBytes,
      compressionRatio: results.sizeBytes > 0
        ? Number((results.compressedSizeBytes / results.sizeBytes).toFixed(3))
        : null,
      durationMs: results.durationMs,
      status: results.status,
      checksumSha256: results.checksumSha256,
    };
  }

  toJsonBuffer(manifest: BackupManifest): Buffer {
    return Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8');
  }

  parse(raw: string | Buffer): BackupManifest {
    const text = typeof raw === 'string' ? raw : raw.toString('utf-8');
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error('Backup manifest is not valid JSON — archive is corrupted or not a ZoeConnect backup.');
    }
    if (
      typeof parsed !== 'object' || parsed === null ||
      typeof (parsed as BackupManifest).backupId !== 'string' ||
      typeof (parsed as BackupManifest).appVersion !== 'string'
    ) {
      throw new Error('Backup manifest is missing required fields — archive is corrupted or not a ZoeConnect backup.');
    }
    return parsed as BackupManifest;
  }
}
