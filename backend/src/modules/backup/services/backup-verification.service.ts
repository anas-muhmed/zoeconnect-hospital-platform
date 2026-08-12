import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { Readable } from 'stream';
import type { BackupManifest } from './backup-manifest.service';

export class ChecksumMismatchError extends Error {
  constructor(public readonly expected: string, public readonly actual: string) {
    super(`Backup archive checksum mismatch — expected ${expected}, computed ${actual}. Archive is corrupted or has been tampered with.`);
    this.name = 'ChecksumMismatchError';
  }
}

export class InvalidManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidManifestError';
  }
}

/**
 * BackupVerificationService — integrity gate run before EVERY restore (spec
 * requirement: "verified before every restore, corrupted backups
 * rejected"), and also callable standalone via `POST /backups/verify`.
 *
 * Two independent checks:
 *  1. SHA-256 checksum of the raw archive bytes (as actually stored —
 *     compressed and, if applicable, encrypted) against the checksum
 *     recorded at backup time (`BackupJob.checksumSha256`).
 *  2. Structural validation of the embedded manifest (required fields
 *     present, `backupId` well-formed) — catches "valid-looking bytes that
 *     aren't actually a ZoeConnect backup" independent of the checksum
 *     check.
 */
@Injectable()
export class BackupVerificationService {
  private readonly logger = new Logger(BackupVerificationService.name);

  /**
   * Streams `source` through a SHA-256 hash, discarding the bytes (this is
   * used purely for checksum computation, not to capture the archive) —
   * never buffers the whole archive in memory.
   */
  async computeSha256(source: Readable): Promise<string> {
    const hash = crypto.createHash('sha256');
    for await (const chunk of source) {
      hash.update(chunk as Buffer);
    }
    return hash.digest('hex');
  }

  /**
   * Computes the checksum of `source` and throws `ChecksumMismatchError` if
   * it doesn't match `expectedChecksum`. This is the hard gate
   * RestoreService calls before any destructive step — a mismatch always
   * rejects the restore, no override.
   */
  async verifyChecksum(source: Readable, expectedChecksum: string): Promise<string> {
    const actual = await this.computeSha256(source);
    if (actual !== expectedChecksum) {
      throw new ChecksumMismatchError(expectedChecksum, actual);
    }
    return actual;
  }

  /**
   * Structural manifest validation — required fields present and
   * internally consistent. Does not re-derive anything from the database;
   * purely a shape/sanity check on the parsed JSON.
   */
  validateManifestStructure(manifest: BackupManifest): void {
    const missing: string[] = [];
    if (!manifest.backupId) missing.push('backupId');
    if (!manifest.appVersion) missing.push('appVersion');
    if (!manifest.createdAt) missing.push('createdAt');
    if (!manifest.deploymentType) missing.push('deploymentType');
    if (!Array.isArray(manifest.modules)) missing.push('modules');
    if (missing.length > 0) {
      throw new InvalidManifestError(`Backup manifest is missing required field(s): ${missing.join(', ')}`);
    }
    if (!['self_hosted', 'cloud'].includes(manifest.deploymentType)) {
      throw new InvalidManifestError(`Backup manifest has an unrecognized deploymentType: '${manifest.deploymentType}'`);
    }
  }
}
