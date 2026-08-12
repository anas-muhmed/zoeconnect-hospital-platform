/**
 * ZoeConnect Identity Architecture Migration, Phase 1 -- unit coverage for
 * OrganizationBranchService: create, getDefault, and the
 * at-most-one-default-per-tenant invariant (create()/update() unset any
 * prior default inside a transaction before setting the new one -- the DB's
 * own partial unique index is the real enforcement, but this test verifies
 * the app-level unset-then-set path that keeps a fresh row from ever
 * violating it).
 *
 * Constructed directly (matches this repo's existing precedent, e.g.
 * tenant-provisioning.step-issue-trial-license.spec.ts) rather than via a
 * full Nest TestingModule, since the transaction path only needs a fake
 * DataSource.transaction() that hands back a fake EntityManager.
 */
import { NotFoundException, ConflictException } from '@nestjs/common';
import { OrganizationBranchService } from '../organization-branch.service';

function makeRepo(overrides: Record<string, jest.Mock> = {}) {
  return {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn((v: any) => v),
    save: jest.fn(async (v: any) => ({ id: 'generated-id', ...v })),
    update: jest.fn(),
    ...overrides,
  };
}

function makeDataSource(repo: ReturnType<typeof makeRepo>) {
  return {
    transaction: jest.fn(async (cb: (em: any) => Promise<any>) => {
      const em = { getRepository: jest.fn(() => repo) };
      return cb(em);
    }),
  };
}

describe('OrganizationBranchService', () => {
  function buildService(repo = makeRepo()) {
    const dataSource = makeDataSource(repo);
    const service = new OrganizationBranchService(repo as any, dataSource as any);
    return { service, repo, dataSource };
  }

  describe('listForTenant', () => {
    it('lists branches scoped to the given tenant only, ordered by name', async () => {
      const repo = makeRepo({ find: jest.fn().mockResolvedValue([{ id: 'b1' }]) });
      const { service } = buildService(repo);

      const result = await service.listForTenant('tenant-1');

      expect(repo.find).toHaveBeenCalledWith({ where: { tenantId: 'tenant-1' }, order: { name: 'ASC' } });
      expect(result).toEqual([{ id: 'b1' }]);
    });
  });

  describe('getDefault', () => {
    it('returns the tenant default branch when one exists', async () => {
      const repo = makeRepo({ findOne: jest.fn().mockResolvedValue({ id: 'b1', isDefault: true }) });
      const { service } = buildService(repo);

      const result = await service.getDefault('tenant-1');

      expect(repo.findOne).toHaveBeenCalledWith({ where: { tenantId: 'tenant-1', isDefault: true } });
      expect(result.id).toBe('b1');
    });

    it('throws NotFoundException when the tenant has no default branch', async () => {
      const { service } = buildService();
      await expect(service.getDefault('tenant-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('throws ConflictException when the code already exists for this tenant', async () => {
      const repo = makeRepo({ findOne: jest.fn().mockResolvedValue({ id: 'existing' }) });
      const { service } = buildService(repo);

      await expect(
        service.create('tenant-1', { name: 'West Wing', code: 'west-wing' }),
      ).rejects.toThrow(ConflictException);
    });

    it('creates a non-default branch directly (no transaction) when isDefault is not set', async () => {
      const repo = makeRepo();
      const { service, dataSource } = buildService(repo);

      const result = await service.create('tenant-1', { name: 'West Wing', code: 'west-wing' });

      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: 'tenant-1', name: 'West Wing', code: 'west-wing', isDefault: false }),
      );
      expect(result.code).toBe('west-wing');
    });

    it('unsets any prior default for the tenant before creating a new default, inside a transaction', async () => {
      const repo = makeRepo();
      const { service, dataSource } = buildService(repo);

      await service.create('tenant-1', { name: 'Main', code: 'main', isDefault: true });

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(repo.update).toHaveBeenCalledWith({ tenantId: 'tenant-1', isDefault: true }, { isDefault: false });
      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: 'tenant-1', code: 'main', isDefault: true }),
      );
    });
  });

  describe('update', () => {
    it('promotes a non-default branch to default inside a transaction, unsetting the prior one first', async () => {
      const repo = makeRepo({
        findOne: jest.fn().mockResolvedValue({ id: 'b2', tenantId: 'tenant-1', name: 'East Wing', isDefault: false, status: 'active' }),
      });
      const { service, dataSource } = buildService(repo);

      await service.update('tenant-1', 'b2', { isDefault: true });

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(repo.update).toHaveBeenCalledWith({ tenantId: 'tenant-1', isDefault: true }, { isDefault: false });
      expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ id: 'b2', isDefault: true }));
    });

    it('throws NotFoundException for a branch belonging to a different tenant', async () => {
      const repo = makeRepo({ findOne: jest.fn().mockResolvedValue(null) });
      const { service } = buildService(repo);

      await expect(service.update('tenant-1', 'not-mine', { name: 'x' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('ensureDefaultForTenant', () => {
    it('returns the existing default without creating a duplicate (idempotent)', async () => {
      const repo = makeRepo({ findOne: jest.fn().mockResolvedValue({ id: 'existing-default', isDefault: true }) });
      const { service } = buildService(repo);

      const result = await service.ensureDefaultForTenant('tenant-1', 'Apollo Hospital');

      expect(repo.save).not.toHaveBeenCalled();
      expect(result.id).toBe('existing-default');
    });

    it('creates a Main Branch / code "main" default when none exists yet', async () => {
      const repo = makeRepo();
      const { service } = buildService(repo);

      const result = await service.ensureDefaultForTenant('tenant-1', 'Apollo Hospital');

      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: 'tenant-1', name: 'Main Branch', code: 'main', isDefault: true }),
      );
      expect(result.code).toBe('main');
    });

    it('treats a unique-constraint race as already-provisioned and returns the raced row', async () => {
      const raced = { id: 'raced-row', tenantId: 'tenant-1', code: 'main', isDefault: true };
      const repo = makeRepo({
        findOne: jest.fn()
          .mockResolvedValueOnce(null)   // initial "does a default already exist" check
          .mockResolvedValueOnce(raced), // re-lookup after the 23505 catch
        save: jest.fn().mockRejectedValue({ code: '23505' }),
      });
      const { service } = buildService(repo);

      const result = await service.ensureDefaultForTenant('tenant-1', 'Apollo Hospital');

      expect(result).toBe(raced);
    });
  });
});
