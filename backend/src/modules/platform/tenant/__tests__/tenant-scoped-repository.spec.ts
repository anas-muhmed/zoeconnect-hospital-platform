/**
 * Stage B (Checkpoint B2) — unit tests for `TenantScopedRepository`, the
 * single enforcement seam. `Repository<T>` and `TenantScope` are both
 * mocked; no database, no Nest TestingModule.
 */

import type { Repository } from 'typeorm';
import type { TenantScope } from '../context/tenant-scope.interface';
import { TenantScopedRepository } from '../repositories/tenant-scoped.repository';

interface Widget {
  id: string;
  tenantId: string | null;
  name: string;
}

function makeRepo(overrides: Partial<jest.Mocked<Repository<Widget>>> = {}) {
  const qb = {
    andWhere: jest.fn().mockReturnThis(),
  };
  return {
    metadata: { name: 'Widget' },
    find: jest.fn().mockResolvedValue([]),
    findBy: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    findOneBy: jest.fn().mockResolvedValue(null),
    count: jest.fn().mockResolvedValue(0),
    exist: jest.fn().mockResolvedValue(false),
    createQueryBuilder: jest.fn().mockReturnValue(qb),
    update: jest.fn().mockResolvedValue({ affected: 0 }),
    delete: jest.fn().mockResolvedValue({ affected: 0 }),
    softDelete: jest.fn().mockResolvedValue({ affected: 0 }),
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
    ...overrides,
  } as unknown as jest.Mocked<Repository<Widget>>;
}

function makeTenantScope(tenantId: string | null, isSystem = false): jest.Mocked<TenantScope> {
  return {
    currentTenantId: jest.fn().mockResolvedValue(tenantId),
    isSystemScope: jest.fn().mockReturnValue(isSystem),
  };
}

describe('TenantScopedRepository — enforced mode (default)', () => {
  it('find() injects tenant_id into the where clause', async () => {
    const repo = makeRepo();
    const scoped = new TenantScopedRepository(repo, makeTenantScope('tenant-a'));

    await scoped.find({ where: { name: 'widget-1' } as never } as never);

    expect(repo.find).toHaveBeenCalledWith({
      where: { name: 'widget-1', tenantId: 'tenant-a' },
    });
  });

  it('findOneBy() injects tenant_id alongside existing criteria', async () => {
    const repo = makeRepo();
    const scoped = new TenantScopedRepository(repo, makeTenantScope('tenant-a'));

    await scoped.findOneBy({ id: 'w1' } as never);

    expect(repo.findOneBy).toHaveBeenCalledWith({ id: 'w1', tenantId: 'tenant-a' });
  });

  it('count() and exist() are scoped the same way', async () => {
    const repo = makeRepo();
    const scoped = new TenantScopedRepository(repo, makeTenantScope('tenant-a'));

    await scoped.count();
    await scoped.exist();

    expect(repo.count).toHaveBeenCalledWith({ where: { tenantId: 'tenant-a' } });
    expect(repo.exist).toHaveBeenCalledWith({ where: { tenantId: 'tenant-a' } });
  });

  it('findAndCount() injects tenant_id into the where clause (added during B3.1)', async () => {
    const repo = makeRepo();
    const scoped = new TenantScopedRepository(repo, makeTenantScope('tenant-a'));

    await scoped.findAndCount({ take: 20, skip: 0 } as never);

    expect(repo.findAndCount).toHaveBeenCalledWith({
      take: 20,
      skip: 0,
      where: { tenantId: 'tenant-a' },
    });
  });

  it('update()/delete()/softDelete() scope the criteria to the current tenant', async () => {
    const repo = makeRepo();
    const scoped = new TenantScopedRepository(repo, makeTenantScope('tenant-a'));

    await scoped.update({ id: 'w1' } as never, { name: 'renamed' });
    await scoped.delete({ id: 'w1' } as never);
    await scoped.softDelete({ id: 'w1' } as never);

    expect(repo.update).toHaveBeenCalledWith({ id: 'w1', tenantId: 'tenant-a' }, { name: 'renamed' });
    expect(repo.delete).toHaveBeenCalledWith({ id: 'w1', tenantId: 'tenant-a' });
    expect(repo.softDelete).toHaveBeenCalledWith({ id: 'w1', tenantId: 'tenant-a' });
  });

  it('createQueryBuilder() is always scoped — no unscoped path under this name', async () => {
    const repo = makeRepo();
    const scoped = new TenantScopedRepository(repo, makeTenantScope('tenant-a'));

    const qb = await scoped.createQueryBuilder('w');

    expect(repo.createQueryBuilder).toHaveBeenCalledWith('w');
    expect(qb.andWhere).toHaveBeenCalledWith('w.tenantId = :tenantScopedTenantId', {
      tenantScopedTenantId: 'tenant-a',
    });
  });

  it('has no save/insert/upsert methods (deferred to B6)', () => {
    const repo = makeRepo();
    const scoped = new TenantScopedRepository(repo, makeTenantScope('tenant-a')) as unknown as Record<string, unknown>;

    expect(scoped.save).toBeUndefined();
    expect(scoped.insert).toBeUndefined();
    expect(scoped.upsert).toBeUndefined();
  });
});

describe('TenantScopedRepository — system scope bypass', () => {
  it('find() passes through unfiltered when isSystemScope() is true', async () => {
    const repo = makeRepo();
    const scoped = new TenantScopedRepository(repo, makeTenantScope(null, true));

    await scoped.find();

    expect(repo.find).toHaveBeenCalledWith(undefined);
  });

  it('createQueryBuilder() returns unscoped in system scope', async () => {
    const repo = makeRepo();
    const scoped = new TenantScopedRepository(repo, makeTenantScope(null, true));

    const qb = await scoped.createQueryBuilder('w');

    expect(qb.andWhere).not.toHaveBeenCalled();
  });

  it('createSystemQueryBuilder() always bypasses regardless of scope', () => {
    const repo = makeRepo();
    const scoped = new TenantScopedRepository(repo, makeTenantScope('tenant-a', false));

    const qb = scoped.createSystemQueryBuilder('w');

    expect(repo.createQueryBuilder).toHaveBeenCalledWith('w');
    expect(qb.andWhere).not.toHaveBeenCalled();
  });
});

describe('TenantScopedRepository — dry-run mode', () => {
  it('find() returns the unfiltered result unchanged (zero behavior change)', async () => {
    const rows = [{ id: 'w1', tenantId: 'tenant-b', name: 'cross-tenant-row' }];
    const repo = makeRepo({ find: jest.fn().mockResolvedValue(rows), count: jest.fn().mockResolvedValue(0) } as never);
    const scoped = new TenantScopedRepository(repo, makeTenantScope('tenant-a'), { mode: 'dry-run' });

    const result = await scoped.find();

    expect(result).toBe(rows);
    expect(repo.count).toHaveBeenCalledWith({ where: { tenantId: 'tenant-a' } });
  });

  it('find() in dry-run + system scope skips the comparison query entirely', async () => {
    const rows = [{ id: 'w1', tenantId: null, name: 'system-row' }];
    const repo = makeRepo({ find: jest.fn().mockResolvedValue(rows) } as never);
    const scoped = new TenantScopedRepository(repo, makeTenantScope(null, true), { mode: 'dry-run' });

    const result = await scoped.find();

    expect(result).toBe(rows);
    expect(repo.count).not.toHaveBeenCalled();
  });

  it('findAndCount() returns the unfiltered result unchanged, logging the would-be comparison', async () => {
    const rows = [{ id: 'w1', tenantId: 'tenant-b', name: 'cross-tenant-row' }];
    const repo = makeRepo({
      findAndCount: jest.fn().mockResolvedValue([rows, 1]),
      count: jest.fn().mockResolvedValue(0),
    } as never);
    const scoped = new TenantScopedRepository(repo, makeTenantScope('tenant-a'), { mode: 'dry-run' });

    const [resultRows, resultTotal] = await scoped.findAndCount();

    expect(resultRows).toBe(rows);
    expect(resultTotal).toBe(1);
    expect(repo.count).toHaveBeenCalledWith({ where: { tenantId: 'tenant-a' } });
  });

  /**
   * Regression coverage for the production bug found live (2026-07-14):
   * `findOne()`, `findOneBy()`, `findBy()`, `count()`, `exist()`,
   * `createQueryBuilder()`, `update()`, `delete()`, `softDelete()` were all
   * unconditionally applying the enforced predicate even under
   * `mode: 'dry-run'`, ignoring `this.mode` entirely. Combined with write
   * paths not yet stamping `tenant_id` (deferred to B6), this made a
   * freshly-inserted row (`tenantId: null`) invisible to a dry-run-mode
   * `findOne()` immediately after creation — `POST /api/v1/users` returned
   * 404 "User not found" right after a successful insert. Every method
   * below must now return the unfiltered/unscoped result exactly like
   * `find()`/`findAndCount()` already did.
   */
  it('findOne() returns the unfiltered row unchanged, even when it has no tenantId yet (newly-inserted row)', async () => {
    const row = { id: 'w1', tenantId: null, name: 'brand-new-row' };
    const repo = makeRepo({ findOne: jest.fn().mockResolvedValue(row) } as never);
    const scoped = new TenantScopedRepository(repo, makeTenantScope('tenant-a'), { mode: 'dry-run' });

    const result = await scoped.findOne({ where: { id: 'w1' } } as never);

    expect(result).toBe(row);
    expect(repo.findOne).toHaveBeenCalledWith({ where: { id: 'w1' } });
  });

  it('findOneBy() returns the unfiltered row unchanged in dry-run mode', async () => {
    const row = { id: 'w1', tenantId: null, name: 'brand-new-row' };
    const repo = makeRepo({ findOneBy: jest.fn().mockResolvedValue(row) } as never);
    const scoped = new TenantScopedRepository(repo, makeTenantScope('tenant-a'), { mode: 'dry-run' });

    const result = await scoped.findOneBy({ id: 'w1' } as never);

    expect(result).toBe(row);
    expect(repo.findOneBy).toHaveBeenCalledWith({ id: 'w1' });
  });

  it('findBy() returns the unfiltered rows unchanged in dry-run mode', async () => {
    const rows = [{ id: 'w1', tenantId: null, name: 'brand-new-row' }];
    const repo = makeRepo({ findBy: jest.fn().mockResolvedValue(rows), count: jest.fn().mockResolvedValue(0) } as never);
    const scoped = new TenantScopedRepository(repo, makeTenantScope('tenant-a'), { mode: 'dry-run' });

    const result = await scoped.findBy({ id: 'w1' } as never);

    expect(result).toBe(rows);
    expect(repo.findBy).toHaveBeenCalledWith({ id: 'w1' });
  });

  it('count() returns the unfiltered count unchanged in dry-run mode', async () => {
    const repo = makeRepo({ count: jest.fn().mockResolvedValue(5) } as never);
    const scoped = new TenantScopedRepository(repo, makeTenantScope('tenant-a'), { mode: 'dry-run' });

    const result = await scoped.count();

    expect(result).toBe(5);
    expect(repo.count).toHaveBeenNthCalledWith(1, undefined);
  });

  it('exist() returns the unfiltered result unchanged in dry-run mode', async () => {
    const repo = makeRepo({ exist: jest.fn().mockResolvedValue(true) } as never);
    const scoped = new TenantScopedRepository(repo, makeTenantScope('tenant-a'), { mode: 'dry-run' });

    const result = await scoped.exist();

    expect(result).toBe(true);
    expect(repo.exist).toHaveBeenNthCalledWith(1, undefined);
  });

  it('createQueryBuilder() returns an unscoped builder in dry-run mode', async () => {
    const repo = makeRepo();
    const scoped = new TenantScopedRepository(repo, makeTenantScope('tenant-a'), { mode: 'dry-run' });

    const qb = await scoped.createQueryBuilder('w');

    expect(repo.createQueryBuilder).toHaveBeenCalledWith('w');
    expect(qb.andWhere).not.toHaveBeenCalled();
  });

  it('update()/delete()/softDelete() pass through unscoped criteria in dry-run mode', async () => {
    const repo = makeRepo();
    const scoped = new TenantScopedRepository(repo, makeTenantScope('tenant-a'), { mode: 'dry-run' });

    await scoped.update({ id: 'w1' } as never, { name: 'renamed' });
    await scoped.delete({ id: 'w1' } as never);
    await scoped.softDelete({ id: 'w1' } as never);

    expect(repo.update).toHaveBeenCalledWith({ id: 'w1' }, { name: 'renamed' });
    expect(repo.delete).toHaveBeenCalledWith({ id: 'w1' });
    expect(repo.softDelete).toHaveBeenCalledWith({ id: 'w1' });
  });
});
