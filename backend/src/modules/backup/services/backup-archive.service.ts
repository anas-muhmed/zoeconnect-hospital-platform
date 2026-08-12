import { Injectable, Logger } from '@nestjs/common';
import * as tar from 'tar';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { Readable, Transform, TransformCallback } from 'stream';
import { pipeline } from 'stream/promises';
import { randomUUID } from 'crypto';
import { BackupCompressionService } from './backup-compression.service';
import { BackupEncryptionService } from './backup-encryption.service';
import type { IBackupStorageProvider } from '../providers/backup-storage-provider.interface';

/** Counts bytes flowing through without buffering them. */
function byteCounter(onTotal: (n: number) => void): Transform {
  let total = 0;
  return new Transform({
    transform(chunk: Buffer, _enc, callback: TransformCallback) {
      total += chunk.length;
      callback(null, chunk);
    },
    flush(callback: TransformCallback) {
      onTotal(total);
      callback();
    },
  });
}

function hashingPassThrough(onDigest: (hex: string) => void): Transform {
  const hash = crypto.createHash('sha256');
  return new Transform({
    transform(chunk: Buffer, _enc, callback: TransformCallback) {
      hash.update(chunk);
      callback(null, chunk);
    },
    flush(callback: TransformCallback) {
      onDigest(hash.digest('hex'));
      callback();
    },
  });
}

function pipeForward(source: Readable, dest: Transform): Transform {
  source.pipe(dest);
  source.on('error', (err) => dest.destroy(err));
  return dest;
}

export interface PackResult {
  sizeBytes: number;
  compressedSizeBytes: number;
  checksumSha256: string;
}

/**
 * BackupArchiveService — generic tar/gzip/(optional encrypt)/storage
 * plumbing. Knows nothing about "database"/"files"/"configuration" module
 * semantics (that's BackupService's job, which populates a staging
 * directory before calling this); this service's only concerns are:
 *   staging directory -> tar -> gzip -> [encrypt] -> storage.uploadStream()
 * and the exact reverse for restore.
 *
 * Streaming throughout: `tar.create()` streams entries off disk as it reads
 * them, gzip/encryption are streaming transforms, and
 * `IBackupStorageProvider.uploadStream()` is itself a streaming sink (see
 * LocalBackupStorageProvider/S3BackupStorageProvider) — no stage buffers
 * the whole archive.
 */
@Injectable()
export class BackupArchiveService {
  private readonly logger = new Logger(BackupArchiveService.name);

  constructor(
    private readonly compressionService: BackupCompressionService,
    private readonly encryptionService: BackupEncryptionService,
  ) {}

  createTempStagingDir(prefix = 'zoeconnect-backup-'): string {
    const dir = path.join(os.tmpdir(), `${prefix}${randomUUID()}`);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  async cleanupDir(dir: string): Promise<void> {
    await fs.promises.rm(dir, { recursive: true, force: true }).catch((err) => {
      this.logger.warn(`Failed to clean up temp directory ${dir}: ${(err as Error).message}`);
    });
  }

  /**
   * Packs everything under `stagingDir` into a tar.gz (optionally
   * encrypted) stream and uploads it to `storageProvider` under `key`.
   * Returns the uncompressed size, compressed/final size, and the SHA-256
   * checksum of the exact bytes that were stored (post-encryption if
   * enabled) — this is what gets persisted to BackupJob and verified before
   * every restore.
   */
  async packAndUpload(
    stagingDir: string,
    storageProvider: IBackupStorageProvider,
    key: string,
    options: { encrypt: boolean; passphrase?: string },
  ): Promise<PackResult> {
    const entries = await fs.promises.readdir(stagingDir);
    const tarStream = tar.create({ cwd: stagingDir, gzip: false, portable: true }, entries);

    let sizeBytes = 0;
    let compressedSizeBytes = 0;
    let checksumSha256 = '';

    const rawCounted = pipeForward(tarStream, byteCounter((n) => { sizeBytes = n; }));
    const gzipped = this.compressionService.compressStream(rawCounted);
    const compressedCounted = pipeForward(gzipped, byteCounter((n) => { compressedSizeBytes = n; }));

    let finalStream: Readable = compressedCounted;
    if (options.encrypt) {
      if (!options.passphrase) throw new Error('Encryption requested but no passphrase resolved.');
      finalStream = await this.encryptionService.encryptStream(compressedCounted, options.passphrase);
    }
    const hashed = pipeForward(finalStream, hashingPassThrough((hex) => { checksumSha256 = hex; }));

    await storageProvider.uploadStream(key, hashed);

    return { sizeBytes, compressedSizeBytes, checksumSha256 };
  }

  /**
   * Packs everything under `stagingDir` into a tar.gz (optionally
   * encrypted) file at `destFilePath` on local disk, WITHOUT uploading it
   * anywhere. Used only by the multi-destination (2+) fan-out path (see
   * BackupDestinationWriterService) -- single-destination jobs keep using
   * `packAndUpload()`'s direct stream-to-storage path with no regression.
   *
   * DOCUMENTED TRADEOFF: producing N independent, truly zero-buffering
   * simultaneous streams from one tar/gzip/encrypt pipeline would require
   * either (a) N-way stream teeing with backpressure coordination across N
   * heterogeneous destinations (a slow destination would stall/back-pressure
   * every other destination's upload), or (b) uploading to one destination
   * and copying provider-to-provider (couples every destination's
   * implementation to every other's). A bounded local staging file --
   * write the compressed/encrypted archive once, then upload that one file
   * to each destination in parallel via independent read streams -- is the
   * pragmatic, correct choice: disk usage is bounded by the archive's own
   * (already-compressed) size, exactly the same bound `stageFiles()`
   * already accepts for the files module, and every destination's upload
   * becomes fully independent (one slow/failing destination cannot stall
   * or corrupt another's).
   */
  async packToLocalFile(
    stagingDir: string,
    destFilePath: string,
    options: { encrypt: boolean; passphrase?: string },
  ): Promise<PackResult> {
    const entries = await fs.promises.readdir(stagingDir);
    const tarStream = tar.create({ cwd: stagingDir, gzip: false, portable: true }, entries);

    let sizeBytes = 0;
    let compressedSizeBytes = 0;
    let checksumSha256 = '';

    const rawCounted = pipeForward(tarStream, byteCounter((n) => { sizeBytes = n; }));
    const gzipped = this.compressionService.compressStream(rawCounted);
    const compressedCounted = pipeForward(gzipped, byteCounter((n) => { compressedSizeBytes = n; }));

    let finalStream: Readable = compressedCounted;
    if (options.encrypt) {
      if (!options.passphrase) throw new Error('Encryption requested but no passphrase resolved.');
      finalStream = await this.encryptionService.encryptStream(compressedCounted, options.passphrase);
    }
    const hashed = pipeForward(finalStream, hashingPassThrough((hex) => { checksumSha256 = hex; }));

    fs.mkdirSync(path.dirname(destFilePath), { recursive: true });
    await pipeline(hashed, fs.createWriteStream(destFilePath));

    return { sizeBytes, compressedSizeBytes, checksumSha256 };
  }

  /** Uploads an already-packed local file (from packToLocalFile()) to one storage destination via an independent read stream. */
  async uploadLocalFileToProvider(filePath: string, storageProvider: IBackupStorageProvider, key: string): Promise<void> {
    const stat = await fs.promises.stat(filePath);
    await storageProvider.uploadStream(key, fs.createReadStream(filePath), stat.size);
  }

  /**
   * Downloads the archive at `key` and extracts it fully into `targetDir`
   * (created if missing). Used both for real restores and for the
   * pre-restore safety-backup verification path.
   */
  async downloadAndUnpack(
    storageProvider: IBackupStorageProvider,
    key: string,
    targetDir: string,
    options: { encrypted: boolean; passphrase?: string },
  ): Promise<void> {
    fs.mkdirSync(targetDir, { recursive: true });
    const raw = await storageProvider.downloadStream(key);
    let stream: Readable = raw;
    if (options.encrypted) {
      if (!options.passphrase) throw new Error('Archive is encrypted but no passphrase was supplied for restore.');
      stream = this.encryptionService.decryptStream(stream, options.passphrase);
    }
    const gunzipped = this.compressionService.decompressStream(stream);
    await pipeline(gunzipped, tar.extract({ cwd: targetDir }));
  }

  /**
   * Extracts ONLY `manifest.json` from the archive without unpacking
   * everything else — used to read backup metadata (GET /backups/:id/manifest,
   * and RestoreService's "validate archive" step) without paying the cost
   * of a full database-dump + files extraction up front.
   */
  async readManifestOnly(
    storageProvider: IBackupStorageProvider,
    key: string,
    options: { encrypted: boolean; passphrase?: string },
  ): Promise<Buffer> {
    const tempDir = this.createTempStagingDir('zoeconnect-manifest-peek-');
    try {
      const raw = await storageProvider.downloadStream(key);
      let stream: Readable = raw;
      if (options.encrypted) {
        if (!options.passphrase) throw new Error('Archive is encrypted but no passphrase was supplied.');
        stream = this.encryptionService.decryptStream(stream, options.passphrase);
      }
      const gunzipped = this.compressionService.decompressStream(stream);
      await pipeline(gunzipped, tar.extract({ cwd: tempDir, filter: (p: string) => p === 'manifest.json' || p === './manifest.json' }));
      const manifestPath = path.join(tempDir, 'manifest.json');
      if (!fs.existsSync(manifestPath)) {
        throw new Error('Archive does not contain a manifest.json — not a valid ZoeConnect backup archive.');
      }
      return await fs.promises.readFile(manifestPath);
    } finally {
      await this.cleanupDir(tempDir);
    }
  }
}
