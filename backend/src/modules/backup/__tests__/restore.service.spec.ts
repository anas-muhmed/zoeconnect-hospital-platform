import { ForbiddenException } from '@nestjs/common';
import { RestoreService } from '../restore.service';

describe('RestoreService.checkVersionCompatibility', () => {
  const MIN_COMPATIBLE = '2.0.0';

  it('classifies an identical version as "same"', () => {
    expect(RestoreService.checkVersionCompatibility('3.2.1', '3.2.1', MIN_COMPATIBLE)).toBe('same');
  });

  it('classifies a backup from an older version (same major) as "older"', () => {
    expect(RestoreService.checkVersionCompatibility('3.1.0', '3.2.1', MIN_COMPATIBLE)).toBe('older');
  });

  it('classifies a backup from a newer version (same major) as "newer"', () => {
    expect(RestoreService.checkVersionCompatibility('3.5.0', '3.2.1', MIN_COMPATIBLE)).toBe('newer');
  });

  it('classifies a backup from an older major version (still >= min compatible) as "older"', () => {
    expect(RestoreService.checkVersionCompatibility('2.9.9', '3.2.1', MIN_COMPATIBLE)).toBe('older');
  });

  it('classifies a backup below the minimum compatible major version as "incompatible"', () => {
    expect(RestoreService.checkVersionCompatibility('1.9.9', '3.2.1', MIN_COMPATIBLE)).toBe('incompatible');
  });

  it('treats missing/malformed version strings as 0.0.0 rather than throwing', () => {
    expect(RestoreService.checkVersionCompatibility('', '3.2.1', MIN_COMPATIBLE)).toBe('incompatible');
    expect(() => RestoreService.checkVersionCompatibility('not-a-version', '3.2.1', MIN_COMPATIBLE)).not.toThrow();
  });
});

describe('RestoreService.assertTenantOwnership', () => {
  it('is a no-op in self-hosted mode regardless of tenant ids', () => {
    expect(() => RestoreService.assertTenantOwnership('self_hosted', null, null)).not.toThrow();
    expect(() => RestoreService.assertTenantOwnership('self_hosted', 'tenant-a', 'tenant-b')).not.toThrow();
  });

  it('allows a cloud restore when the caller tenant matches the backup tenant', () => {
    expect(() => RestoreService.assertTenantOwnership('cloud', 'tenant-a', 'tenant-a')).not.toThrow();
  });

  it('BLOCKS a cloud restore when the caller has no established tenant context', () => {
    expect(() => RestoreService.assertTenantOwnership('cloud', null, 'tenant-a')).toThrow(ForbiddenException);
  });

  it('BLOCKS a cloud restore when the backup belongs to a DIFFERENT tenant — the core cross-tenant isolation guarantee', () => {
    expect(() => RestoreService.assertTenantOwnership('cloud', 'tenant-a', 'tenant-b')).toThrow(ForbiddenException);
  });

  it('BLOCKS a cloud restore of a backup with no tenant stamped at all (e.g. a self-hosted backup imported into cloud)', () => {
    expect(() => RestoreService.assertTenantOwnership('cloud', 'tenant-a', null)).toThrow(ForbiddenException);
  });
});

describe('RestoreService.checkRestoreReadiness()', () => {
  function createService(overrides: {
    backupJob?: any;
    dbQuery?: () => Promise<any>;
    testConfiguration?: () => Promise<any>;
    getServerVersion?: () => Promise<any>;
    getCapacity?: () => Promise<any>;
    manifest?: any;
    checksumOk?: boolean;
    manifestValid?: boolean;
  } = {}) {
    const backupJob = overrides.backupJob ?? {
      id: 'backup-1',
      storageKey: 'key-1',
      storageConfigId: null,
      encrypted: false,
      checksumSha256: 'abc123',
      compressedSizeBytes: '1000000',
      sizeBytes: '2000000',
      appVersion: '3.2.1',
      dbVersion: '17.4',
    };

    const configService = { get: jest.fn().mockReturnValue('1.0.0') } as any;
    const backupQueue = {} as any;
    const rawRestoreJobRepo = {} as any;
    const rawBackupJobRepo = { findOne: jest.fn().mockResolvedValue(backupJob) } as any;
    const dataSource = { query: overrides.dbQuery ?? jest.fn().mockResolvedValue([{}]) } as any;
    const restoreJobRepo = {} as any;
    const backupJobRepo = {} as any;
    const tenantContext = {} as any;
    const manifestService = {
      resolveAppVersion: jest.fn().mockReturnValue('3.2.1'),
      parse: jest.fn().mockReturnValue(overrides.manifest ?? { backupId: 'backup-1', appVersion: '3.2.1', createdAt: new Date().toISOString(), deploymentType: 'self_hosted', modules: ['database'] }),
    } as any;
    const archiveService = {
      readManifestOnly: jest.fn().mockResolvedValue(Buffer.from('{}')),
    } as any;
    const verificationService = {
      validateManifestStructure: overrides.manifestValid === false
        ? jest.fn().mockImplementation(() => { throw new Error('invalid manifest'); })
        : jest.fn(),
      verifyChecksum: overrides.checksumOk === false
        ? jest.fn().mockRejectedValue(new Error('checksum mismatch'))
        : jest.fn().mockResolvedValue('abc123'),
    } as any;
    const encryptionService = {} as any;
    const providerRegistry = {
      getActiveProvider: jest.fn().mockReturnValue({
        testConfiguration: overrides.testConfiguration ?? jest.fn().mockResolvedValue({ ok: true, message: 'ok' }),
        getServerVersion: overrides.getServerVersion ?? jest.fn().mockResolvedValue('17.4'),
        dump: jest.fn(), restore: jest.fn(), describe: jest.fn(), runDiagnostics: jest.fn(),
      }),
    } as any;
    const storageProviderFactory = {
      forDefaultLocal: jest.fn().mockReturnValue({
        getCapacity: overrides.getCapacity ?? jest.fn().mockResolvedValue({ availableBytes: 10 * 1024 * 1024 * 1024, totalBytes: null, usedByBackupsBytes: null, healthy: true }),
        downloadStream: jest.fn(),
      }),
    } as any;
    const backupService = {
      resolveProvider: jest.fn().mockResolvedValue({ downloadStream: jest.fn().mockResolvedValue({} as any) }),
    } as any;
    const settingsService = {} as any;
    const auditService = { log: jest.fn().mockResolvedValue(undefined) } as any;

    const service = new RestoreService(
      configService, backupQueue, rawRestoreJobRepo, rawBackupJobRepo, dataSource,
      restoreJobRepo, backupJobRepo, tenantContext, archiveService, manifestService,
      verificationService, encryptionService, providerRegistry, storageProviderFactory,
      backupService, settingsService, auditService,
    );
    return { service, backupJob };
  }

  it('reports a fully-ready report when every check passes', async () => {
    const { service } = createService();
    const report = await service.checkRestoreReadiness('backup-1');
    expect(report.diskSpaceOk).toBe(true);
    expect(report.databaseReachable).toBe(true);
    expect(report.clientToolsOk).toBe(true);
    expect(report.backupArchiveOk).toBe(true);
    expect(report.versionCompatibilityOk).toBe(true);
    expect(report.overallReady).toBe(true);
    expect(report.backupJobId).toBe('backup-1');
  });

  it('flags backupArchiveOk=false and overallReady=false when checksum verification fails', async () => {
    const { service } = createService({ checksumOk: false });
    const report = await service.checkRestoreReadiness('backup-1');
    expect(report.backupArchiveOk).toBe(false);
    expect(report.overallReady).toBe(false);
  });

  it('flags versionCompatibilityOk=false on a major PostgreSQL version mismatch', async () => {
    const { service } = createService({ getServerVersion: jest.fn().mockResolvedValue('14.1') });
    const report = await service.checkRestoreReadiness('backup-1');
    expect(report.details.dbVersionCompatibility).toBe('incompatible');
    expect(report.versionCompatibilityOk).toBe(false);
    expect(report.overallReady).toBe(false);
  });

  it('flags clientToolsOk=false when the active provider reports its tools are broken', async () => {
    const { service } = createService({ testConfiguration: jest.fn().mockResolvedValue({ ok: false, message: 'pg_dump not found' }) });
    const report = await service.checkRestoreReadiness('backup-1');
    expect(report.clientToolsOk).toBe(false);
    expect(report.overallReady).toBe(false);
  });

  it('flags diskSpaceOk=false when available disk space is smaller than the required margin', async () => {
    const { service } = createService({ getCapacity: jest.fn().mockResolvedValue({ availableBytes: 100, totalBytes: null, usedByBackupsBytes: null, healthy: true }) });
    const report = await service.checkRestoreReadiness('backup-1');
    expect(report.diskSpaceOk).toBe(false);
    expect(report.overallReady).toBe(false);
  });
});
