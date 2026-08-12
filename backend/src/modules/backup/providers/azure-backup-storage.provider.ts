import { Injectable, NotImplementedException } from '@nestjs/common';
import { Readable } from 'stream';
import {
  IBackupStorageProvider, BackupStorageProviderMetadata, BackupStorageTestConnectionResult, BackupStorageCapacity,
} from './backup-storage-provider.interface';

/**
 * STUB — Azure Blob Storage backup destination.
 *
 * Registered in BackupStorageProviderFactory so `driver: 'azure'` is a
 * selectable, discoverable option today (GET /backups/storage-providers
 * lists it), but every method throws NotImplementedException. Wiring a real
 * implementation later means: add `@azure/storage-blob`, implement these
 * methods against BlobServiceClient's streaming upload/download, and this
 * class is the ONLY file that changes -- BackupService/RestoreService/
 * BackupQueueProcessor never reference a concrete provider class.
 */
@Injectable()
export class AzureBackupStorageProvider implements IBackupStorageProvider {
  readonly driver = 'azure';
  readonly displayName = 'Azure Blob Storage (not yet implemented)';

  private notImplemented(): never {
    throw new NotImplementedException(
      'AzureBackupStorageProvider is registered but not yet implemented. ' +
      'Configure a different backup destination driver, or implement this provider against @azure/storage-blob.',
    );
  }

  configure(_cfg: Record<string, unknown>): this { return this; }
  async uploadStream(_key: string, _source: Readable): Promise<void> { this.notImplemented(); }
  async downloadStream(_key: string): Promise<Readable> { this.notImplemented(); }
  async exists(_key: string): Promise<boolean> { this.notImplemented(); }
  async getMetadata(_key: string): Promise<BackupStorageProviderMetadata> { this.notImplemented(); }
  async delete(_key: string): Promise<void> { this.notImplemented(); }
  async list(_prefix: string): Promise<BackupStorageProviderMetadata[]> { this.notImplemented(); }
  async getDownloadUrl(_key: string): Promise<string> { this.notImplemented(); }

  // testConnection()/getCapacity() are the two exceptions to "every method
  // throws" -- a "test connection"/"view capacity" UI action must degrade
  // gracefully for a stub provider, not crash.
  async testConnection(): Promise<BackupStorageTestConnectionResult> {
    return { ok: false, message: 'Provider not yet implemented' };
  }

  async getCapacity(): Promise<BackupStorageCapacity> {
    return {
      availableBytes: null, totalBytes: null, usedByBackupsBytes: null,
      healthy: false, message: 'Provider not yet implemented',
    };
  }
}
