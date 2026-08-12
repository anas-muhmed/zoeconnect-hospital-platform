import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IBackupStorageProvider } from './backup-storage-provider.interface';
import { LocalBackupStorageProvider } from './local-backup-storage.provider';
import { S3BackupStorageProvider, S3BackupDestinationConfig } from './s3-backup-storage.provider';
import { AzureBackupStorageProvider } from './azure-backup-storage.provider';
import { GcsBackupStorageProvider } from './gcs-backup-storage.provider';
import { SftpBackupStorageProvider } from './sftp-backup-storage.provider';
import { NetworkShareBackupStorageProvider } from './network-share-backup-storage.provider';
import { BackupStorageConfig } from '../entities/backup-storage-config.entity';
import { BackupCredentialCipherService } from '../services/backup-credential-cipher.service';

/**
 * BackupStorageProviderFactory — resolves the correct IBackupStorageProvider
 * instance for a given BackupStorageConfig row (or a bare driver name, for
 * `GET /backups/storage-providers` discovery).
 *
 * This is the single seam BackupService/RestoreService/BackupQueueProcessor
 * go through to get a provider -- none of them ever import a concrete
 * provider class directly. Adding a real Azure/GCS/SFTP/Network-Share
 * implementation later means only touching that provider's own file; this
 * factory's switch already routes to it.
 */
@Injectable()
export class BackupStorageProviderFactory {
  constructor(
    private readonly configService: ConfigService,
    private readonly local: LocalBackupStorageProvider,
    private readonly s3: S3BackupStorageProvider,
    private readonly azure: AzureBackupStorageProvider,
    private readonly gcs: GcsBackupStorageProvider,
    private readonly sftp: SftpBackupStorageProvider,
    private readonly networkShare: NetworkShareBackupStorageProvider,
    private readonly credentialCipher: BackupCredentialCipherService,
  ) {}

  /** All drivers this factory knows about, with an `implemented` flag for the discovery endpoint. */
  listAvailableDrivers(): Array<{ driver: string; displayName: string; implemented: boolean }> {
    return [
      { driver: this.local.driver, displayName: this.local.displayName, implemented: true },
      { driver: this.s3.driver, displayName: this.s3.displayName, implemented: true },
      { driver: this.azure.driver, displayName: this.azure.displayName, implemented: false },
      { driver: this.gcs.driver, displayName: this.gcs.displayName, implemented: false },
      { driver: this.sftp.driver, displayName: this.sftp.displayName, implemented: false },
      { driver: this.networkShare.driver, displayName: this.networkShare.displayName, implemented: false },
    ];
  }

  /**
   * Resolves a provider for a persisted destination row. S3's provider is
   * `configure()`d with this specific row's connection details (see that
   * class's doc comment on why it's per-instance-configured rather than
   * globally bound like the object-repository's S3StorageProvider).
   */
  forStorageConfig(storageConfig: BackupStorageConfig): IBackupStorageProvider {
    // Decrypt-and-merge happens here, not in the entity/repository layer,
    // so provider classes always receive one flat, fully-assembled plaintext
    // config object exactly like before the credential-encryption change --
    // see BackupCredentialCipherService's doc comment for the split design.
    const credentials = this.credentialCipher.decrypt(storageConfig.encryptedCredentials);
    const mergedConfig = this.credentialCipher.mergeCredentials(storageConfig.config ?? {}, credentials);
    return this.forDriver(storageConfig.driver, mergedConfig);
  }

  /** Resolves the process-wide default destination (backup.defaultStorageDriver), local-disk config. */
  forDefaultLocal(): IBackupStorageProvider {
    return this.local;
  }

  forDriver(driver: string, config?: Record<string, unknown>): IBackupStorageProvider {
    switch (driver) {
      case 'local':
        return this.local;
      case 's3':
        this.s3.configure(this.toS3Config(config));
        return this.s3;
      case 'azure':
        return this.azure.configure(config ?? {});
      case 'gcs':
        return this.gcs.configure(config ?? {});
      case 'sftp':
        return this.sftp.configure(config ?? {});
      case 'network_share':
        return this.networkShare.configure(config ?? {});
      default:
        throw new BadRequestException(`Unknown backup storage driver: '${driver}'`);
    }
  }

  private toS3Config(config?: Record<string, unknown>): S3BackupDestinationConfig {
    const c = config ?? {};
    const required = ['bucket', 'region', 'accessKeyId', 'secretAccessKey'];
    for (const key of required) {
      if (!c[key]) throw new BadRequestException(`S3 backup destination missing required config field: '${key}'`);
    }
    return {
      bucket: String(c.bucket),
      region: String(c.region),
      accessKeyId: String(c.accessKeyId),
      secretAccessKey: String(c.secretAccessKey),
      endpoint: c.endpoint ? String(c.endpoint) : undefined,
      forcePathStyle: !!c.forcePathStyle,
      keyPrefix: c.keyPrefix ? String(c.keyPrefix) : undefined,
    };
  }
}
