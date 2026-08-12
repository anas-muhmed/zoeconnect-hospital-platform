import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand, ListObjectsV2Command,
  HeadBucketCommand, PutObjectCommand,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'stream';
import {
  IBackupStorageProvider, BackupStorageProviderMetadata, BackupStorageTestConnectionResult, BackupStorageCapacity,
} from './backup-storage-provider.interface';

export interface S3BackupDestinationConfig {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint?: string;
  forcePathStyle?: boolean;
  keyPrefix?: string;
}

/**
 * S3 IBackupStorageProvider. Mirrors S3StorageProvider's S3Client
 * construction style (Phase 3 "Storage Providers") for consistency, but is a
 * distinct class per-destination-configurable: each BackupStorageConfig row
 * with driver='s3' carries its OWN bucket/region/credentials in its `config`
 * JSONB column, so a single running process can have several independently
 * configured S3 backup destinations (unlike the object-repository's one
 * process-wide S3StorageProvider bound to global S3_* env vars).
 *
 * `configure()` must be called (by BackupStorageProviderFactory) before use,
 * passing the specific BackupStorageConfig row's `config` -- this class
 * itself carries no global env-derived S3 configuration.
 *
 * Uses `@aws-sdk/lib-storage`'s `Upload` helper for streaming multipart
 * upload (never buffers the whole archive), exactly like S3StorageProvider.
 */
@Injectable()
export class S3BackupStorageProvider implements IBackupStorageProvider {
  readonly driver = 's3';
  readonly displayName = 'Amazon S3 / S3-Compatible';

  private readonly logger = new Logger(S3BackupStorageProvider.name);
  private cfg: S3BackupDestinationConfig | null = null;
  private _client: S3Client | null = null;

  configure(cfg: S3BackupDestinationConfig): this {
    this.cfg = cfg;
    this._client = null; // rebuild lazily with new config
    return this;
  }

  private get config(): S3BackupDestinationConfig {
    if (!this.cfg) throw new Error('S3BackupStorageProvider used before configure() -- see BackupStorageProviderFactory');
    return this.cfg;
  }

  private get client(): S3Client {
    if (!this._client) {
      const { region, endpoint, forcePathStyle, accessKeyId, secretAccessKey } = this.config;
      this._client = new S3Client({
        region,
        ...(endpoint ? { endpoint, forcePathStyle: !!forcePathStyle } : {}),
        credentials: { accessKeyId, secretAccessKey },
      });
    }
    return this._client;
  }

  private fullKey(key: string): string {
    return this.config.keyPrefix ? `${this.config.keyPrefix.replace(/\/$/, '')}/${key}` : key;
  }

  async uploadStream(key: string, source: Readable, sizeHint?: number): Promise<void> {
    const upload = new Upload({
      client: this.client,
      params: {
        Bucket: this.config.bucket,
        Key: this.fullKey(key),
        Body: source,
        ...(sizeHint ? { ContentLength: sizeHint } : {}),
      },
      // Multipart part size default (5MB) is fine for archives of any size;
      // Upload handles chunking internally without buffering the full body.
    });
    await upload.done();
    this.logger.log(`Backup archive uploaded -> s3://${this.config.bucket}/${this.fullKey(key)}`);
  }

  async downloadStream(key: string): Promise<Readable> {
    try {
      const result = await this.client.send(new GetObjectCommand({ Bucket: this.config.bucket, Key: this.fullKey(key) }));
      return result.Body as Readable;
    } catch (err) {
      throw new NotFoundException(`Backup archive not found at key: ${key} (${(err as Error).message})`);
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.config.bucket, Key: this.fullKey(key) }));
      return true;
    } catch {
      return false;
    }
  }

  async getMetadata(key: string): Promise<BackupStorageProviderMetadata> {
    const head = await this.client.send(new HeadObjectCommand({ Bucket: this.config.bucket, Key: this.fullKey(key) }));
    return { key, sizeBytes: head.ContentLength ?? 0, lastModified: head.LastModified };
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: this.fullKey(key) }));
  }

  async list(prefix: string): Promise<BackupStorageProviderMetadata[]> {
    const result = await this.client.send(new ListObjectsV2Command({
      Bucket: this.config.bucket,
      Prefix: this.fullKey(prefix),
    }));
    return (result.Contents ?? []).map((obj) => ({
      key: obj.Key ?? '',
      sizeBytes: obj.Size ?? 0,
      lastModified: obj.LastModified,
    }));
  }

  async getDownloadUrl(key: string, expirationSeconds = 3600): Promise<string> {
    const command = new GetObjectCommand({ Bucket: this.config.bucket, Key: this.fullKey(key) });
    return getSignedUrl(this.client, command, { expiresIn: expirationSeconds });
  }

  /**
   * Real connectivity/permissions probe: HeadBucket confirms the bucket
   * exists and is reachable with these credentials; a put+delete of a tiny
   * marker object then confirms actual write permission (HeadBucket alone
   * can succeed with read-only/list-only credentials that can't actually
   * upload archives, which would be a misleading "ok"). Never throws.
   */
  async testConnection(): Promise<BackupStorageTestConnectionResult> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.config.bucket }));
    } catch (err) {
      return {
        ok: false,
        message: `Cannot reach S3 bucket '${this.config.bucket}': ${(err as Error).message}`,
        details: { bucket: this.config.bucket, region: this.config.region },
      };
    }
    const markerKey = this.fullKey(`.zoeconnect-test-${Date.now()}.tmp`);
    try {
      await this.client.send(new PutObjectCommand({ Bucket: this.config.bucket, Key: markerKey, Body: 'zoeconnect-backup-connection-test' }));
      await this.client.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: markerKey }));
      return { ok: true, message: `Bucket '${this.config.bucket}' is reachable and writable`, details: { bucket: this.config.bucket, region: this.config.region } };
    } catch (err) {
      return {
        ok: false,
        message: `Bucket '${this.config.bucket}' is reachable but not writable with these credentials: ${(err as Error).message}`,
        details: { bucket: this.config.bucket, region: this.config.region },
      };
    }
  }

  /**
   * S3 (and S3-compatible object stores) have no fixed "total capacity" the
   * way a local disk does, so availableBytes/totalBytes are always null --
   * bucket reachability (HeadBucket) is the health signal instead, per the
   * storage-hardening brief.
   */
  async getCapacity(): Promise<BackupStorageCapacity> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.config.bucket }));
      return {
        availableBytes: null, totalBytes: null, usedByBackupsBytes: null,
        healthy: true, message: 'S3 has no fixed capacity limit; health reflects bucket reachability only.',
      };
    } catch (err) {
      return {
        availableBytes: null, totalBytes: null, usedByBackupsBytes: null,
        healthy: false, message: `Bucket unreachable: ${(err as Error).message}`,
      };
    }
  }
}
