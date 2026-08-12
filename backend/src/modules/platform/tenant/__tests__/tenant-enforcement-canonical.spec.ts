/**
 * Stage B (Checkpoint B3.1) — the canonical "tenant enforcement actually
 * works" test, per the user's explicit request. Uses the real
 * `TenantContextStorage` (not a mocked `TenantScope`) together with
 * `TenantScopedRepository` in `mode: 'enforced'`, against a small in-memory
 * fake repository seeded with rows for two different tenants. This is the
 * scenario every later B3.x module's own version of this test should copy
 * with minimal changes: two tenants, one row each, confirm each tenant's
 * request only ever sees its own row.
 */

import type { Repository, FindManyOptions, FindOneOptions, FindOptionsWhere } from 'typeorm';
import { TenantContextStorage } from '../context/tenant-context-storage';
import { TenantScopedRepository } from '../repositories/tenant-scoped.repository';

interface FakeTemplate {
  id: string;
  tenantId: string;
  name: string;
}

/**
 * Minimal in-memory stand-in for a TypeORM `Repository<FakeTemplate>` —
 * just enough of `find`/`findOne`/`count` to exercise real predicate
 * matching, not a full TypeORM mock.
 */
function makeFakeRepo(rows: FakeTemplate[]): jest.Mocked<Repository<FakeTemplate>> {
  const matches = (row: FakeTemplate, where?: FindOptionsWhere<FakeTemplate> | FindOptionsWhere<FakeTemplate>[]) => {
    if (!where) return true;
    const clauses = Array.isArray(where) ? where : [where];
    return clauses.some((clause) =>
      Object.entries(clause).every(
        ([key, value]) => (row as unknown as Record<string, unknown>)[key] === value,
      ),
    );
  };

  return {
    metadata: { name: 'FakeTemplate' },
    find: jest.fn(async (options?: FindManyOptions<FakeTemplate>) =>
      rows.filter((row) => matches(row, options?.where)),
    ),
    findOne: jest.fn(async (options: FindOneOptions<FakeTemplate>) =>
      rows.find((row) => matches(row, options.where as FindOptionsWhere<FakeTemplate>)) ?? null,
    ),
    count: jest.fn(async (options?: FindManyOptions<FakeTemplate>) =>
      rows.filter((row) => matches(row, options?.where)).length,
    ),
  } as unknown as jest.Mocked<Repository<FakeTemplate>>;
}

describe('Canonical tenant enforcement test — two tenants, one row each', () => {
  const rows: FakeTemplate[] = [
    { id: 'template-a', tenantId: 'tenant-a', name: 'Template A' },
    { id: 'template-b', tenantId: 'tenant-b', name: 'Template B' },
  ];

  it('a request scoped to Tenant A only ever sees Template A', async () => {
    const repo = makeFakeRepo(rows);
    const tenantScope = new TenantContextStorage();
    const scoped = new TenantScopedRepository(repo, tenantScope); // mode: 'enforced' (default)

    const result = await TenantContextStorage.run('tenant-a', () => scoped.find());

    expect(result).toEqual([{ id: 'template-a', tenantId: 'tenant-a', name: 'Template A' }]);
  });

  it('a request scoped to Tenant B only ever sees Template B', async () => {
    const repo = makeFakeRepo(rows);
    const tenantScope = new TenantContextStorage();
    const scoped = new TenantScopedRepository(repo, tenantScope);

    const result = await TenantContextStorage.run('tenant-b', () => scoped.find());

    expect(result).toEqual([{ id: 'template-b', tenantId: 'tenant-b', name: 'Template B' }]);
  });

  it("Tenant A cannot read Tenant B's row by ID either", async () => {
    const repo = makeFakeRepo(rows);
    const tenantScope = new TenantContextStorage();
    const scoped = new TenantScopedRepository(repo, tenantScope);

    const result = await TenantContextStorage.run('tenant-a', () =>
      scoped.findOne({ where: { id: 'template-b' } }),
    );

    expect(result).toBeNull();
  });

  it('the same repository instance correctly isolates two sequential requests for different tenants', async () => {
    const repo = makeFakeRepo(rows);
    const tenantScope = new TenantContextStorage();
    const scoped = new TenantScopedRepository(repo, tenantScope);

    const asTenantA = await TenantContextStorage.run('tenant-a', () => scoped.find());
    const asTenantB = await TenantContextStorage.run('tenant-b', () => scoped.find());

    expect(asTenantA.map((r) => r.id)).toEqual(['template-a']);
    expect(asTenantB.map((r) => r.id)).toEqual(['template-b']);
  });

  it('system scope (e.g. an admin cross-tenant report) sees both rows', async () => {
    const repo = makeFakeRepo(rows);
    const tenantScope = new TenantContextStorage();
    const scoped = new TenantScopedRepository(repo, tenantScope);

    const result = await TenantContextStorage.runAsSystem(() => scoped.find());

    expect(result).toHaveLength(2);
  });
});
