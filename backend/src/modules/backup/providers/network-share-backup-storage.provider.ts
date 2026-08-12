import { Injectable, NotImplementedException } from '@nestjs/common';
import { Readable } from 'stream';
import {
  IBackupStorageProvider, BackupStorageProviderMetadata, BackupStorageTestConnectionResult, BackupStorageCapacity,
} from './backup-storage-provider.interface';

/**
 * STUB — Network Share (SMB/NFS) backup destination. See
 * AzureBackupStorageProvider's doc comment for the pluggability contract; a
 * real implementation would treat this like LocalBackupStorageProvider but
 * against an OS-mounted share path (or a userspace SMB client for
 * unmounted-share access), with the same streaming fs semantics.
 */
@Injectable()
export class NetworkShareBackupStorageProvider implements IBackupStorageProvider {
  readonly driver = 'network_share';
  readonly displayName = 'Network Share / SMB / NFS (not yet implemented)';

  private notImplemented(): never {
    throw new NotImplementedException(
      'NetworkShareBackupStorageProvider is registered but not yet implemented. ' +
      'Configure a different backup destination driver, or mount the share and use the local driver against its mount path.',
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
