import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { IObjectStorageProvider, ObjectMetadata } from '../interfaces/object-storage-provider.interface';

/**
 * S3 implementation of IObjectStorageProvider (Phase 3 "Storage Providers").
 *
 * Bound instead of LocalStorageProvider only when STORAGE_DRIVER=s3
 * (StorageModule's mode-selection factory). Not consumed unless a
 * deployment explicitly opts in -- default behavior everywhere else is
 * unchanged (see LocalStorageProvider).
 *
 * Object-key convention: callers pass "<subdir>/<filename>" as `filename`,
 * exactly as they do for LocalStorageProvider (e.g. "cms-media/172-abc.png").
 * When a `tenantId` is supplied, the actual S3 key becomes
 * "<tenantId>/<subdir>/<filename>" -- this is the tenant-prefixing Task 3.3
 * introduces. When no tenantId is supplied (background/system-scope writes,
 * or callers not yet threading tenant context through), the key falls back
 * to the bare "<subdir>/<filename>" with no prefix, matching today's
 * single-namespace behavior. The returned object ID is always the full S3
 * key actually used, so download()/delete()/getMetadata() need no separate
 * tenant argument -- the ID is self-describing.
 */
@Injectable()
export class S3StorageProvider implements IObjectStorageProvider {
  readonly id = 's3';
  readonly name = 'S3 Object Storage Provider';

  private readonly logger = new Logger(S3StorageProvider.name);
  private _client: S3Client | undefined;
  private readonly bucket: string;

  constructor(private readonly configService: ConfigService) {
    this.bucket = this.configService.get<string>('S3_BUCKET', '');
    // S3Client construction is deferred to first actual use (see `client`
    // getter below) rather than done here. StorageModule always registers
    // S3StorageProvider as an ordinary provider so Nest instantiates it on
    // every boot regardless of STORAGE_DRIVER (see that module's doc
    // comment) -- but the AWS SDK v3's S3Client constructor synchronously
    // validates config and throws "Region is missing" if region resolves
    // to an empty string, which it always does when STORAGE_DRIVER=local
    // (the default) and no S3_* env vars are set. Building the client
    // eagerly therefore crashed every boot that wasn't explicitly
    // configured for S3 -- a real bug, not the "doesn't connect eagerly ==
    // safe to construct unconditionally" behavior the original doc comment
    // assumed. env.validation.ts already refuses to boot if
    // STORAGE_DRIVER=s3 is set without the required S3_* fields, so by the
    // time this getter is actually called (i.e. StorageModule's factory
    // picked this provider), those fields are guaranteed present.
  }

  private get client(): S3Client {
    if (!this._client) {
      const region = this.configService.get<string>('S3_REGION', '');
      const endpoint = this.configService.get<string>('S3_ENDPOINT', '');
      const forcePathStyle = this.configService.get<boolean>('S3_FORCE_PATH_STYLE', false);

      this._client = new S3Client({
        region,
        // Only set an explicit endpoint when one is configured (S3-compatible
        // services like MinIO/R2). Leaving it undefined lets the SDK resolve
        // AWS S3's standard regional endpoint.
        ...(endpoint ? { endpoint, forcePathStyle } : {}),
        credentials: {
          accessKeyId: this.configService.get<string>('S3_ACCESS_KEY_ID', ''),
          secretAccessKey: this.configService.get<string>('S3_SECRET_ACCESS_KEY', ''),
        },
      });
    }
    return this._client;
  }

  private _key(filename: string, tenantId?: string | null): string {
    return tenantId ? `${tenantId}/${filename}` : filename;
  }

  /**
   * Uses @aws-sdk/lib-storage's Upload helper (handles multipart for large
   * buffers automatically) rather than a single PutObjectCommand, so this
   * doesn't silently break on files above S3's 5GB single-PUT limit.
   */
  async upload(buffer: Buffer, filename: string, mimeType: string, metadata?: Record<string, string>, tenantId?: string | null): Promise<string> {
    const key = this._key(filename, tenantId);
    const upload = new Upload({
      client: this.client,
      params: {
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
        Metadata: metadata,
      },
    });
    await upload.done();
    return key;
  }

  async download(objectId: string): Promise<Buffer> {
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: objectId }));
    const stream = result.Body as NodeJS.ReadableStream;
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      // AWS SDK v3's stream typing allows a chunk to statically be `string`
      // (e.g. when the underlying stream is in non-binary/object mode),
      // which doesn't structurally overlap with `Uint8Array` -- a direct
      // `as Uint8Array` cast is what TS flags as "may be a mistake" (real
      // for the string case; every chunk actually observed from S3's
      // GetObjectCommand response body is Buffer/Uint8Array in practice).
      // Handle the string case explicitly instead of casting past it.
      if (Buffer.isBuffer(chunk)) {
        chunks.push(chunk);
      } else if (typeof chunk === 'string') {
        chunks.push(Buffer.from(chunk, 'utf-8'));
      } else {
        chunks.push(Buffer.from(chunk as unknown as Uint8Array));
      }
    }
    return Buffer.concat(chunks);
  }

  async getMetadata(objectId: string): Promise<ObjectMetadata> {
    const head = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: objectId }));
    return {
      id: objectId,
      filename: objectId.split('/').pop() ?? objectId,
      mimeType: head.ContentType ?? '',
      sizeBytes: head.ContentLength ?? 0,
      tags: (head.Metadata as Record<string, string>) ?? {},
      createdAt: head.LastModified ?? new Date(0),
      updatedAt: head.LastModified ?? new Date(0),
    };
  }

  async delete(objectId: string): Promise<void> {
    // DeleteObjectCommand is idempotent on S3 -- deleting a non-existent
    // key is not an error, matching LocalStorageProvider's ENOENT-swallowing
    // behavior without needing a try/catch here.
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: objectId }));
  }

  async getPresignedDownloadUrl(objectId: string, expirationSeconds = 3600): Promise<string> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: objectId });
    return getSignedUrl(this.client, command, { expiresIn: expirationSeconds });
  }
}
