import { BackupDestinationWriterService } from '../services/backup-destination-writer.service';
import type { BackupStorageConfig } from '../entities/backup-storage-config.entity';

function fakeDestination(id: string, priority: number): BackupStorageConfig {
  return { id, priority, driver: 'local', name: `dest-${id}` } as BackupStorageConfig;
}

/** In-memory fake for Repository<BackupJobDestination> -- only the methods the writer calls. */
function fakeDestinationRepo() {
  const rows = new Map<string, any>();
  let counter = 0;
  return {
    rows,
    create: jest.fn((data: any) => ({ id: `row-${++counter}`, ...data })),
    save: jest.fn(async (row: any) => { rows.set(row.id, row); return row; }),
    update: jest.fn(async (id: string, patch: any) => { rows.set(id, { ...rows.get(id), ...patch }); }),
  };
}

describe('BackupDestinationWriterService — failover vs redundant_all orchestration', () => {
  function createService(opts: {
    packToLocalFile?: jest.Mock;
    packAndUpload?: jest.Mock;
    uploadOutcomes: Record<string, 'success' | 'fail'>; // keyed by destination id
  }) {
    const archiveService = {
      packToLocalFile: opts.packToLocalFile ?? jest.fn().mockResolvedValue({ sizeBytes: 1000, compressedSizeBytes: 400, checksumSha256: 'abc123' }),
      packAndUpload: opts.packAndUpload ?? jest.fn().mockResolvedValue({ sizeBytes: 1000, compressedSizeBytes: 400, checksumSha256: 'abc123' }),
      uploadLocalFileToProvider: jest.fn(async (_file: string, _provider: unknown, key: string) => {
        // key is built as `key-for-<destId>` by the tests below, so we can look up the outcome from it.
        const destId = key.replace('key-for-', '');
        if (opts.uploadOutcomes[destId] === 'fail') throw new Error(`upload failed for ${destId}`);
      }),
    } as any;
    const storageProviderFactory = { forStorageConfig: jest.fn().mockReturnValue({}) } as any;
    const destinationRepo = fakeDestinationRepo();
    const service = new BackupDestinationWriterService(archiveService, storageProviderFactory, destinationRepo as any);
    return { service, archiveService, destinationRepo };
  }

  const buildKey = (d: BackupStorageConfig) => `key-for-${d.id}`;

  it('single destination: uses packAndUpload() directly (no staging file), never calls packToLocalFile', async () => {
    const { service, archiveService } = createService({ uploadOutcomes: {} });
    const dest = fakeDestination('d1', 10);
    const result = await service.write({
      backupJobId: 'job1', stagingDir: '/tmp/staging', destinations: [dest], writeMode: 'failover', buildKey, encrypt: false,
    });
    expect(archiveService.packToLocalFile).not.toHaveBeenCalled();
    expect(archiveService.packAndUpload).toHaveBeenCalledTimes(1);
    expect(result.overallStatus).toBe('completed');
    expect(result.primary).toEqual({ storageConfigId: 'd1', storageKey: 'key-for-d1' });
  });

  it('redundant_all: attempts every destination and reports "partial" when some (not all) fail', async () => {
    const { service, destinationRepo } = createService({
      uploadOutcomes: { d1: 'success', d2: 'fail', d3: 'success' },
    });
    const destinations = [fakeDestination('d1', 10), fakeDestination('d2', 20), fakeDestination('d3', 30)];
    const result = await service.write({
      backupJobId: 'job1', stagingDir: '/tmp/staging', destinations, writeMode: 'redundant_all', buildKey, encrypt: false,
    });

    expect(result.overallStatus).toBe('partial');
    // Primary is the highest-priority (lowest number) SUCCEEDED destination.
    expect(result.primary).toEqual({ storageConfigId: 'd1', storageKey: 'key-for-d1' });
    const byId = Object.fromEntries(result.perDestination.map((p) => [p.storageConfigId, p.status]));
    expect(byId).toEqual({ d1: 'completed', d2: 'failed', d3: 'completed' });
    // Every destination was attempted -- redundant_all never skips.
    expect(result.perDestination.some((p) => p.status === 'skipped')).toBe(false);
    // Repo rows reflect the outcome per destination.
    expect([...destinationRepo.rows.values()].filter((r: any) => r.status === 'failed')).toHaveLength(1);
  });

  it('redundant_all: reports overallStatus "completed" when every destination succeeds', async () => {
    const { service } = createService({ uploadOutcomes: { d1: 'success', d2: 'success' } });
    const destinations = [fakeDestination('d1', 10), fakeDestination('d2', 20)];
    const result = await service.write({
      backupJobId: 'job1', stagingDir: '/tmp/staging', destinations, writeMode: 'redundant_all', buildKey, encrypt: false,
    });
    expect(result.overallStatus).toBe('completed');
  });

  it('redundant_all: throws when every destination fails', async () => {
    const { service } = createService({ uploadOutcomes: { d1: 'fail', d2: 'fail' } });
    const destinations = [fakeDestination('d1', 10), fakeDestination('d2', 20)];
    await expect(service.write({
      backupJobId: 'job1', stagingDir: '/tmp/staging', destinations, writeMode: 'redundant_all', buildKey, encrypt: false,
    })).rejects.toThrow(/All 2 configured destination/);
  });

  it('failover: stops at the first success and SKIPS (never attempts) lower-priority destinations', async () => {
    const { service } = createService({ uploadOutcomes: { d1: 'success', d2: 'success', d3: 'success' } });
    const destinations = [fakeDestination('d1', 10), fakeDestination('d2', 20), fakeDestination('d3', 30)];
    const result = await service.write({
      backupJobId: 'job1', stagingDir: '/tmp/staging', destinations, writeMode: 'failover', buildKey, encrypt: false,
    });
    expect(result.overallStatus).toBe('completed');
    expect(result.primary).toEqual({ storageConfigId: 'd1', storageKey: 'key-for-d1' });
    const byId = Object.fromEntries(result.perDestination.map((p) => [p.storageConfigId, p.status]));
    expect(byId).toEqual({ d1: 'completed', d2: 'skipped', d3: 'skipped' });
  });

  it('failover: falls through to the next destination only on a destination-level failure', async () => {
    const { service } = createService({ uploadOutcomes: { d1: 'fail', d2: 'success', d3: 'success' } });
    const destinations = [fakeDestination('d1', 10), fakeDestination('d2', 20), fakeDestination('d3', 30)];
    const result = await service.write({
      backupJobId: 'job1', stagingDir: '/tmp/staging', destinations, writeMode: 'failover', buildKey, encrypt: false,
    });
    expect(result.overallStatus).toBe('completed');
    expect(result.primary).toEqual({ storageConfigId: 'd2', storageKey: 'key-for-d2' });
    const byId = Object.fromEntries(result.perDestination.map((p) => [p.storageConfigId, p.status]));
    expect(byId).toEqual({ d1: 'failed', d2: 'completed', d3: 'skipped' });
  });

  it('failover: throws when every destination in the list fails', async () => {
    const { service } = createService({ uploadOutcomes: { d1: 'fail', d2: 'fail' } });
    const destinations = [fakeDestination('d1', 10), fakeDestination('d2', 20)];
    await expect(service.write({
      backupJobId: 'job1', stagingDir: '/tmp/staging', destinations, writeMode: 'failover', buildKey, encrypt: false,
    })).rejects.toThrow(/All 2 configured failover destination/);
  });
});
