import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SecureJsonStore } from '../secure-json-store';

/**
 * Task #103 ("HDSP Connector Manager," 2026-07-22) -- tests for the
 * non-Windows (AES-256-GCM-local-key) fallback backend, since this
 * sandbox has no Windows machine to exercise the real DPAPI path against
 * (see `dpapi.ts`'s doc comment). The DPAPI backend itself is exercised
 * only by `isDpapiAvailable()` returning false here, which is the correct,
 * honest behavior on this platform -- not a test double standing in for
 * DPAPI.
 */
describe('SecureJsonStore (non-Windows fallback backend)', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hdsp-connector-secure-store-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('round-trips a value through save()/load()', () => {
    const store = new SecureJsonStore<{ a: number; b: string }>(dir, 'test.enc.json');
    store.save({ a: 1, b: 'hello' });
    expect(store.load()).toEqual({ a: 1, b: 'hello' });
  });

  it('returns null when nothing has been saved yet', () => {
    const store = new SecureJsonStore<{ a: number }>(dir, 'missing.enc.json');
    expect(store.load()).toBeNull();
  });

  it('writes the file and key with restrictive permissions', () => {
    const store = new SecureJsonStore<{ a: number }>(dir, 'perm-test.enc.json');
    store.save({ a: 1 });
    const filePath = path.join(dir, 'perm-test.enc.json');
    const mode = fs.statSync(filePath).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it('does not store the plaintext value anywhere in the on-disk file', () => {
    const store = new SecureJsonStore<{ secret: string }>(dir, 'secret.enc.json');
    store.save({ secret: 'super-secret-oracle-password' });
    const raw = fs.readFileSync(path.join(dir, 'secret.enc.json'), 'utf8');
    expect(raw).not.toContain('super-secret-oracle-password');
  });

  it('clear() removes the stored file', () => {
    const store = new SecureJsonStore<{ a: number }>(dir, 'clear-test.enc.json');
    store.save({ a: 1 });
    store.clear();
    expect(store.load()).toBeNull();
  });

  it('two different stores in the same dir do not collide', () => {
    const storeA = new SecureJsonStore<{ v: string }>(dir, 'a.enc.json');
    const storeB = new SecureJsonStore<{ v: string }>(dir, 'b.enc.json');
    storeA.save({ v: 'A' });
    storeB.save({ v: 'B' });
    expect(storeA.load()).toEqual({ v: 'A' });
    expect(storeB.load()).toEqual({ v: 'B' });
  });
});
