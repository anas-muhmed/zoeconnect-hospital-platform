/**
 * Stage B (Checkpoint B2) — unit tests for `TenantContextStorage`, the
 * `AsyncLocalStorage`-backed `TenantScope` implementation.
 */

import { TenantContextStorage } from '../context/tenant-context-storage';

describe('TenantContextStorage', () => {
  it('resolves currentTenantId() to the tenant established by run()', async () => {
    const result = await TenantContextStorage.run('tenant-a', async () => {
      const storage = new TenantContextStorage();
      return storage.currentTenantId();
    });
    expect(result).toBe('tenant-a');
  });

  it('isSystemScope() is false inside a normal run()', () => {
    TenantContextStorage.run('tenant-a', () => {
      const storage = new TenantContextStorage();
      expect(storage.isSystemScope()).toBe(false);
    });
  });

  it('isSystemScope() is true inside runAsSystem()', () => {
    TenantContextStorage.runAsSystem(() => {
      const storage = new TenantContextStorage();
      expect(storage.isSystemScope()).toBe(true);
    });
  });

  it('currentTenantId() throws when called inside runAsSystem()', async () => {
    await TenantContextStorage.runAsSystem(async () => {
      const storage = new TenantContextStorage();
      await expect(storage.currentTenantId()).rejects.toThrow(/system scope/i);
    });
  });

  it('currentTenantId() throws when called with no context established at all', async () => {
    const storage = new TenantContextStorage();
    await expect(storage.currentTenantId()).rejects.toThrow(/no tenant context established/i);
  });

  it('hasContext() reflects whether run()/runAsSystem() is active', () => {
    expect(TenantContextStorage.hasContext()).toBe(false);
    TenantContextStorage.run('tenant-a', () => {
      expect(TenantContextStorage.hasContext()).toBe(true);
    });
    expect(TenantContextStorage.hasContext()).toBe(false);
  });

  it('propagates context across an async continuation (the whole point of using AsyncLocalStorage)', async () => {
    const result = await TenantContextStorage.run('tenant-async', async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      const storage = new TenantContextStorage();
      return storage.currentTenantId();
    });
    expect(result).toBe('tenant-async');
  });

  it('nested runs use the innermost tenant for the duration of the inner callback, then restore the outer one', async () => {
    const storage = new TenantContextStorage();
    await TenantContextStorage.run('outer', async () => {
      await TenantContextStorage.run('inner', async () => {
        await expect(storage.currentTenantId()).resolves.toBe('inner');
      });
      await expect(storage.currentTenantId()).resolves.toBe('outer');
    });
  });
});
