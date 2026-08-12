import { BackupManifestService } from '../services/backup-manifest.service';

describe('BackupManifestService', () => {
  function createService(appVersion = '2.3.1') {
    const configService = { get: jest.fn().mockReturnValue(appVersion) } as any;
    return new BackupManifestService(configService);
  }

  it('build() produces a manifest with all spec-required metadata fields', () => {
    const service = createService('2.3.1');
    const manifest = service.build({
      backupId: 'backup-1',
      createdBy: 'user-1',
      deploymentType: 'cloud',
      tenantId: 'tenant-1',
      backupType: 'full',
      modules: ['database', 'files'],
      dbVersion: '16.2',
      fileCount: 42,
      databaseSizeBytes: 1024,
      encrypted: true,
    });

    expect(manifest.backupId).toBe('backup-1');
    expect(manifest.createdBy).toBe('user-1');
    expect(manifest.deploymentType).toBe('cloud');
    expect(manifest.tenantId).toBe('tenant-1');
    expect(manifest.backupType).toBe('full');
    expect(manifest.modules).toEqual(['database', 'files']);
    expect(manifest.appVersion).toBe('2.3.1');
    expect(manifest.dbVersion).toBe('16.2');
    expect(manifest.fileCount).toBe(42);
    expect(manifest.databaseSizeBytes).toBe(1024);
    expect(manifest.encrypted).toBe(true);
    expect(manifest.status).toBe('running');
    expect(manifest.checksumSha256).toBeNull();
  });

  it('finalize() fills in size/duration/checksum/status and computes compression ratio', () => {
    const service = createService();
    const manifest = service.build({
      backupId: 'b1', createdBy: null, deploymentType: 'self_hosted', tenantId: null,
      backupType: 'manual', modules: ['database'], dbVersion: null, fileCount: 0, databaseSizeBytes: null, encrypted: false,
    });
    const finalized = service.finalize(manifest, {
      sizeBytes: 1000, compressedSizeBytes: 250, durationMs: 5000, status: 'completed', checksumSha256: 'abc123',
    });
    expect(finalized.compressionRatio).toBeCloseTo(0.25, 3);
    expect(finalized.durationMs).toBe(5000);
    expect(finalized.status).toBe('completed');
    expect(finalized.checksumSha256).toBe('abc123');
  });

  it('toJsonBuffer()/parse() round-trips a manifest', () => {
    const service = createService();
    const manifest = service.build({
      backupId: 'b2', createdBy: null, deploymentType: 'self_hosted', tenantId: null,
      backupType: 'manual', modules: ['files'], dbVersion: null, fileCount: 3, databaseSizeBytes: null, encrypted: false,
    });
    const buf = service.toJsonBuffer(manifest);
    const parsed = service.parse(buf);
    expect(parsed).toEqual(manifest);
  });

  it('parse() rejects invalid JSON', () => {
    const service = createService();
    expect(() => service.parse('not json')).toThrow(/not valid JSON/);
  });

  it('parse() rejects JSON missing required fields', () => {
    const service = createService();
    expect(() => service.parse(JSON.stringify({ foo: 'bar' }))).toThrow(/missing required fields/);
  });
});
