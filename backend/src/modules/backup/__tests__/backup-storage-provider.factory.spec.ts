import { BadRequestException, NotImplementedException } from '@nestjs/common';
import { BackupStorageProviderFactory } from '../providers/backup-storage-provider.factory';
import { LocalBackupStorageProvider } from '../providers/local-backup-storage.provider';
import { S3BackupStorageProvider } from '../providers/s3-backup-storage.provider';
import { AzureBackupStorageProvider } from '../providers/azure-backup-storage.provider';
import { GcsBackupStorageProvider } from '../providers/gcs-backup-storage.provider';
import { SftpBackupStorageProvider } from '../providers/sftp-backup-storage.provider';
import { NetworkShareBackupStorageProvider } from '../providers/network-share-backup-storage.provider';

describe('BackupStorageProviderFactory', () => {
  function createFactory() {
    const configService = { get: jest.fn() } as any;
    const local = new LocalBackupStorageProvider(configService);
    const s3 = new S3BackupStorageProvider();
    const azure = new AzureBackupStorageProvider();
    const gcs = new GcsBackupStorageProvider();
    const sftp = new SftpBackupStorageProvider();
    const networkShare = new NetworkShareBackupStorageProvider();
    // forStorageConfig() decrypts+merges credentials via BackupCredentialCipherService;
    // forDriver() (used by every test below) never touches it, so a minimal stub is enough here.
    const credentialCipher = { decrypt: jest.fn().mockReturnValue({}), mergeCredentials: jest.fn((a: any, b: any) => ({ ...a, ...b })) } as any;
    const factory = new BackupStorageProviderFactory(configService, local, s3, azure, gcs, sftp, networkShare, credentialCipher);
    return { factory, local, s3, azure, gcs, sftp, networkShare, credentialCipher };
  }

  it('lists every registered driver with an implemented flag', () => {
    const { factory } = createFactory();
    const drivers = factory.listAvailableDrivers();
    expect(drivers.map((d) => d.driver).sort()).toEqual(
      ['azure', 'gcs', 'local', 'network_share', 's3', 'sftp'].sort(),
    );
    expect(drivers.find((d) => d.driver === 'local')?.implemented).toBe(true);
    expect(drivers.find((d) => d.driver === 's3')?.implemented).toBe(true);
    expect(drivers.find((d) => d.driver === 'azure')?.implemented).toBe(false);
    expect(drivers.find((d) => d.driver === 'gcs')?.implemented).toBe(false);
    expect(drivers.find((d) => d.driver === 'sftp')?.implemented).toBe(false);
    expect(drivers.find((d) => d.driver === 'network_share')?.implemented).toBe(false);
  });

  it('forDriver("local") returns the LocalBackupStorageProvider instance', () => {
    const { factory, local } = createFactory();
    expect(factory.forDriver('local')).toBe(local);
  });

  it('forDriver("s3") configures and returns the S3BackupStorageProvider instance', () => {
    const { factory, s3 } = createFactory();
    const provider = factory.forDriver('s3', {
      bucket: 'my-bucket', region: 'us-east-1', accessKeyId: 'AKIA...', secretAccessKey: 'secret',
    });
    expect(provider).toBe(s3);
  });

  it('forDriver("s3") throws BadRequestException when required config fields are missing', () => {
    const { factory } = createFactory();
    expect(() => factory.forDriver('s3', { bucket: 'only-bucket' })).toThrow(BadRequestException);
  });

  it.each(['azure', 'gcs', 'sftp', 'network_share'])(
    'forDriver("%s") returns a provider whose methods throw NotImplementedException clearly',
    async (driver) => {
      const { factory } = createFactory();
      const provider = factory.forDriver(driver, {});
      await expect(provider.exists('some-key')).rejects.toThrow(NotImplementedException);
      await expect(provider.exists('some-key')).rejects.toThrow(/not yet implemented/i);
    },
  );

  it('forDriver() with an unknown driver throws BadRequestException', () => {
    const { factory } = createFactory();
    expect(() => factory.forDriver('carrier-pigeon')).toThrow(BadRequestException);
  });
});
