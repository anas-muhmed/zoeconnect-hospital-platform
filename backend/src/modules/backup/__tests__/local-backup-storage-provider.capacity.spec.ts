import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { LocalBackupStorageProvider } from '../providers/local-backup-storage.provider';

describe('LocalBackupStorageProvider — testConnection() / getCapacity()', () => {
  let tmpRoot: string;

  function createProvider(rootDir: string) {
    const configService = { get: jest.fn().mockReturnValue(rootDir) } as any;
    return new LocalBackupStorageProvider(configService);
  }

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'zoeconnect-local-provider-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('testConnection() succeeds (write+read+delete round trip) against a writable directory', async () => {
    const provider = createProvider(tmpRoot);
    const result = await provider.testConnection();
    expect(result.ok).toBe(true);
    expect(result.message).toMatch(/write|read|delete/i);
    // The marker file must have been cleaned up -- no leftover files in rootDir.
    expect(fs.readdirSync(tmpRoot)).toEqual([]);
  });

  it('testConnection() never throws, and reports ok:false when the destination is not writable', async () => {
    // A path nested under a file (not a directory) can never be mkdir'd into -- deterministic failure without relying on OS permission bits.
    const blockerFile = path.join(tmpRoot, 'blocker');
    fs.writeFileSync(blockerFile, 'x');
    const provider = createProvider(path.join(blockerFile, 'nested', 'unwritable'));
    await expect(provider.testConnection()).resolves.toEqual(expect.objectContaining({ ok: false }));
  });

  it('getCapacity() reports healthy:false with a clear message when the directory does not exist yet', async () => {
    const provider = createProvider(path.join(tmpRoot, 'does-not-exist-yet'));
    const capacity = await provider.getCapacity();
    expect(capacity.healthy).toBe(false);
    expect(capacity.message).toMatch(/does not exist/i);
    expect(capacity.availableBytes).toBeNull();
  });

  it('getCapacity() never throws and always returns usedByBackupsBytes: null (computed by the caller, not the provider)', async () => {
    const provider = createProvider(tmpRoot);
    const capacity = await provider.getCapacity();
    expect(capacity.usedByBackupsBytes).toBeNull();
    expect(typeof capacity.healthy).toBe('boolean');
  });
});
