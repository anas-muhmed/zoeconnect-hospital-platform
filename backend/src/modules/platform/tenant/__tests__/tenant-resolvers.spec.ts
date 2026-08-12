/**
 * Stage B (Checkpoint B1) — unit tests for the three tenant-resolution
 * primitives (`STAGE_B_DESIGN.md` §3). All three are plain, stateless
 * classes with a single `TenantContextService` dependency, mocked here the
 * same way `roster-resolver-eligibility.spec.ts` mocks `OraclePoolService` —
 * no Nest TestingModule bootstrap needed. Exercised against the seeded
 * 'default' tenant per B1's verification note; no module wiring is tested
 * here since B1 introduces no new call sites.
 */

import { SessionTenantResolver } from '../resolvers/session-tenant.resolver';
import { OracleTenantResolver } from '../resolvers/oracle-tenant.resolver';
import { ChainTenantResolver } from '../resolvers/chain-tenant.resolver';
import type { TenantContextService } from '../tenant-context.service';

const DEFAULT_TENANT_ID = '11111111-1111-1111-1111-111111111111';

function makeTenantContext() {
  return {
    getCurrentTenantId: jest.fn().mockResolvedValue(DEFAULT_TENANT_ID),
    getCurrentTenantCode: jest.fn().mockReturnValue('default'),
  } as unknown as jest.Mocked<TenantContextService>;
}

describe('SessionTenantResolver', () => {
  it('returns the principal\'s own tenantId when present', async () => {
    const tenantContext = makeTenantContext();
    const resolver = new SessionTenantResolver(tenantContext);

    const result = await resolver.resolve({ tenantId: 'principal-tenant-id' });

    expect(result).toBe('principal-tenant-id');
    expect(tenantContext.getCurrentTenantId).not.toHaveBeenCalled();
  });

  it('falls back to the default tenant when the principal has no tenantId', async () => {
    const tenantContext = makeTenantContext();
    const resolver = new SessionTenantResolver(tenantContext);

    const result = await resolver.resolve({ tenantId: null });

    expect(result).toBe(DEFAULT_TENANT_ID);
    expect(tenantContext.getCurrentTenantId).toHaveBeenCalledTimes(1);
  });

  it('falls back to the default tenant when no principal is passed at all', async () => {
    const tenantContext = makeTenantContext();
    const resolver = new SessionTenantResolver(tenantContext);

    const result = await resolver.resolve();

    expect(result).toBe(DEFAULT_TENANT_ID);
    expect(tenantContext.getCurrentTenantId).toHaveBeenCalledTimes(1);
  });
});

describe('OracleTenantResolver', () => {
  it('resolves any branch to the default tenant (single-tenant environment)', async () => {
    const tenantContext = makeTenantContext();
    const resolver = new OracleTenantResolver(tenantContext);

    const result = await resolver.resolveForBranch(42);

    expect(result).toBe(DEFAULT_TENANT_ID);
    expect(tenantContext.getCurrentTenantId).toHaveBeenCalledTimes(1);
  });

  it('resolves a null branch (unresolved employee) to the default tenant', async () => {
    const tenantContext = makeTenantContext();
    const resolver = new OracleTenantResolver(tenantContext);

    const result = await resolver.resolveForBranch(null);

    expect(result).toBe(DEFAULT_TENANT_ID);
  });
});

describe('ChainTenantResolver', () => {
  it('resolves a known branch to the default tenant (single-tenant environment)', async () => {
    const tenantContext = makeTenantContext();
    const resolver = new ChainTenantResolver(tenantContext);

    const result = await resolver.resolveDefaultTenantIgnoringBranch('branch-123');

    expect(result).toBe(DEFAULT_TENANT_ID);
    expect(tenantContext.getCurrentTenantId).toHaveBeenCalledTimes(1);
  });

  it('resolves a null branch to the default tenant', async () => {
    const tenantContext = makeTenantContext();
    const resolver = new ChainTenantResolver(tenantContext);

    const result = await resolver.resolveDefaultTenantIgnoringBranch(null);

    expect(result).toBe(DEFAULT_TENANT_ID);
  });
});
