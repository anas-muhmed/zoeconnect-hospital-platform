import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TokenStore } from '../token-store';
import type { ConnectorCredentials } from '../registration';

/**
 * TokenStore tests (release-blocker fix, 2026-07-22 -- see
 * HDSP_CONNECTOR_OPERATIONAL_WORKFLOW_REVIEW.md §11): TokenStore is now a
 * thin wrapper around SecureJsonStore, so these tests exercise that it's
 * actually wired up correctly (round-trips credentials, uses the
 * DPAPI-on-Windows/AES-256-GCM-fallback-elsewhere backend rather than any
 * hand-rolled crypto) rather than re-testing SecureJsonStore's own crypto,
 * which already has its own test file
 * (security/__tests__/secure-json-store.spec.ts). Runs against the
 * non-Windows fallback backend in this sandbox, same honest limitation
 * already documented there -- the real DPAPI path is not exercised here.
 */
describe('TokenStore (migrated onto SecureJsonStore/DPAPI)', () => {
  let dir: string;
  const sampleCredentials: ConnectorCredentials = {
    connectorId: 'connector-1',
    tenantId: 'tenant-1',
    accessToken: 'access.jwt.token',
    refreshToken: 'refresh.jwt.token',
  };

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hdsp-connector-token-store-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('round-trips credentials through save()/load()', () => {
    const store = new TokenStore(dir);
    store.save(sampleCredentials);
    expect(store.load()).toEqual(sampleCredentials);
  });

  it('returns null when nothing has been saved yet', () => {
    const store = new TokenStore(dir);
    expect(store.load()).toBeNull();
  });

  it('clear() removes stored credentials', () => {
    const store = new TokenStore(dir);
    store.save(sampleCredentials);
    store.clear();
    expect(store.load()).toBeNull();
  });

  it('does not store the plaintext access/refresh token anywhere in the on-disk file', () => {
    const store = new TokenStore(dir);
    store.save(sampleCredentials);
    const raw = fs.readFileSync(path.join(dir, 'credentials.enc.json'), 'utf8');
    expect(raw).not.toContain(sampleCredentials.accessToken);
    expect(raw).not.toContain(sampleCredentials.refreshToken);
  });

  it('writes the store file via SecureJsonStore, not the old hand-rolled {iv, authTag, ciphertext} shape', () => {
    // The old TokenStore wrote {iv, authTag, ciphertext} directly at the
    // top level with no "backend" discriminator. SecureJsonStore always
    // writes a "backend" field ("dpapi" or "aes-256-gcm-local-key") --
    // asserting its presence is really asserting "this went through
    // SecureJsonStore," which is the whole point of this migration.
    const store = new TokenStore(dir);
    store.save(sampleCredentials);
    const raw = JSON.parse(fs.readFileSync(path.join(dir, 'credentials.enc.json'), 'utf8'));
    expect(raw.backend).toBeDefined();
    expect(['dpapi', 'aes-256-gcm-local-key']).toContain(raw.backend);
  });

  it('refreshAndPersist() throws if nothing has been saved yet', async () => {
    const store = new TokenStore(dir);
    await expect(store.refreshAndPersist('https://cloud.example.com')).rejects.toThrow(
      'No stored connector credentials to refresh',
    );
  });

  it('refreshAndPersist() persists the refreshed credentials on success', async () => {
    const store = new TokenStore(dir);
    store.save(sampleCredentials);

    const refreshed: ConnectorCredentials = {
      ...sampleCredentials,
      accessToken: 'new.access.jwt',
      refreshToken: 'new.refresh.jwt',
    };
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const registration = require('../registration');
    const spy = jest.spyOn(registration, 'refreshConnectorToken').mockResolvedValue(refreshed);

    const result = await store.refreshAndPersist('https://cloud.example.com');
    expect(result).toEqual(refreshed);
    expect(store.load()).toEqual(refreshed);

    spy.mockRestore();
  });
});
