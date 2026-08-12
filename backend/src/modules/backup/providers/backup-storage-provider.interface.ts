import { Readable } from 'stream';

/**
 * IBackupStorageProvider — the pluggable backup-destination abstraction.
 *
 * Deliberately a SEPARATE interface family from the generic
 * IObjectStorageProvider (src/modules/platform/services/object-repository),
 * per this module's design brief: object-repository storage is one
 * process-wide driver selected by STORAGE_DRIVER, used for user-facing
 * uploaded objects (CMS media, attachments, exports). Backup storage is
 * admin-configurable PER DESTINATION (a BackupStorageConfig row) -- an
 * installation can have several destinations of different drivers active
 * simultaneously (e.g. "Local nightly" + "S3 offsite weekly"), and the
 * provider must stream arbitrarily large archives rather than buffer them
 * (IObjectStorageProvider.upload/download are Buffer-in/Buffer-out, which
 * is exactly the "load a multi-GB archive into memory" failure mode the
 * spec's performance requirement rules out).
 *
 * Every method that moves archive bytes works with Node `Readable`/
 * `Writable`-compatible streams. `uploadStream()` mirrors
 * S3StorageProvider's use of `@aws-sdk/lib-storage`'s `Upload` helper for
 * multipart streaming; `LocalBackupStorageProvider` uses `fs.createWriteStream`
 * for the same call.
 *
 * New providers (Azure/GCS/SFTP/Network-Share today; anything future) are
 * added by implementing this interface and registering the class in
 * `BackupStorageProviderFactory` -- no change to BackupService/RestoreService
 * is required, satisfying the "pluggable without changing core backup logic"
 * requirement.
 */
export interface BackupStorageProviderMetadata {
  key: string;
  sizeBytes: number;
  lastModified?: Date;
}

export interface BackupStorageTestConnectionResult {
  ok: boolean;
  message: string;
  details?: Record<string, unknown>;
}

export interface BackupStorageCapacity {
  /** null when the underlying storage doesn't expose a meaningful figure (e.g. most cloud object stores) or it's unavailable on this platform. */
  availableBytes: number | null;
  /** null for cloud object stores with no fixed "total" (S3/Azure/GCS-style unbounded storage). */
  totalBytes: number | null;
  /** Sum of archive_size_bytes for completed BackupJob rows pointing at this destination -- computed by the caller (BackupService/controller), not the provider itself, since providers have no DB access. Always null from a provider's own getCapacity(); the controller merges it in. */
  usedByBackupsBytes: number | null;
  healthy: boolean;
  message?: string;
}

export interface IBackupStorageProvider {
  /** Machine-readable driver id, matches BackupStorageConfig.driver ('local' | 's3' | ...). */
  readonly driver: string;
  readonly displayName: string;

  /**
   * Streams `source` to the destination under `key`. Must not buffer the
   * entire archive in memory -- implementations pipe `source` directly into
   * whatever the underlying SDK/fs call expects.
   */
  uploadStream(key: string, source: Readable, sizeHint?: number): Promise<void>;

  /**
   * Returns a Readable over the object at `key`. Caller is responsible for
   * piping this into decompression/decryption/consumption -- this method
   * itself never reads the stream to completion.
   */
  downloadStream(key: string): Promise<Readable>;

  /** True if an object exists at `key` (used by validate-archive-exists checks). */
  exists(key: string): Promise<boolean>;

  getMetadata(key: string): Promise<BackupStorageProviderMetadata>;

  delete(key: string): Promise<void>;

  /**
   * Lists keys under `prefix` (used by retention-policy sweeps and the
   * storage-health endpoint). Drivers that can't cheaply list (e.g. a
   * network share mounted read-only) may throw NotImplementedException --
   * callers must not assume this always succeeds.
   */
  list(prefix: string): Promise<BackupStorageProviderMetadata[]>;

  /** Optional pre-signed/temporary download URL; local/SFTP providers may not support this. */
  getDownloadUrl?(key: string, expirationSeconds?: number): Promise<string>;

  /**
   * Tests connectivity/writability of this destination WITHOUT throwing --
   * every implementation, including the stub providers, must resolve
   * (never reject) so a "test connection" UI action can always render a
   * result instead of crashing. Stub providers return
   * `{ ok: false, message: 'Provider not yet implemented' }`. Real
   * providers do a cheap, side-effect-bounded probe (Local: write+read+
   * delete a small marker file; S3: head-bucket or put+delete a marker
   * object) -- never a full upload/download of real data.
   */
  testConnection(): Promise<BackupStorageTestConnectionResult>;

  /**
   * Reports available/total space and destination health. Never throws --
   * on any failure, returns `{ ..., healthy: false, message: '<reason>' }`
   * so the storage-health endpoint degrades gracefully per-destination
   * rather than failing the whole request.
   */
  getCapacity(): Promise<BackupStorageCapacity>;
}
