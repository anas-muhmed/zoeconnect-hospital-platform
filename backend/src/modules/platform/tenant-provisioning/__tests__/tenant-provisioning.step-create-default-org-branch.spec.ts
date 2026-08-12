/**
 * ZoeConnect Identity Architecture Migration, Phase 1 -- unit coverage for
 * TenantProvisioningService.stepCreateDefaultOrgBranch(), the new step
 * inserted between 'create_super_admin_user' and
 * 'emit_tenant_provisioned_event'. `stepCreateDefaultOrgBranch` is private,
 * so this calls it via an `as any` cast, matching this test file's sibling
 * spec (tenant-provisioning.step-issue-trial-license.spec.ts) for the same
 * private-method-focused reason.
 */
import { ConfigService } from '@nestjs/config';
import { TenantProvisioningService } from '../tenant-provisioning.service';
import { TenantProvisioningRun } from '../entities/tenant-provisioning-run.entity';
import { ProvisionTenantDto } from '../dto/provision-tenant.dto';

function makeRepo(overrides: Record<string, jest.Mock> = {}) {
  return {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn((v: any) => v),
    save: jest.fn(async (v: any) => ({ id: 'generated-id', ...v })),
    update: jest.fn(),
    ...overrides,
  };
}

describe('TenantProvisioningService.stepCreateDefaultOrgBranch', () => {
  function buildService(orgBranchService?: { ensureDefaultForTenant: jest.Mock }) {
    const orgBranchSvc = orgBranchService ?? {
      ensureDefaultForTenant: jest.fn().mockResolvedValue({ id: 'branch-1', code: 'main', isDefault: true }),
    };

    const service = new TenantProvisioningService(
      makeRepo() as any, // runRepo
      makeRepo() as any, // stepRepo
      makeRepo() as any, // pairingRepo
      makeRepo() as any, // tenantRepo
      makeRepo() as any, // roleRepo
      makeRepo() as any, // permissionRepo
      makeRepo() as any, // licenseRepo
      makeRepo() as any, // vendorRegRepo
      makeRepo() as any, // userRepo
      {} as any, // authService
      { emit: jest.fn() } as any, // eventEmitter
      { get: jest.fn() } as unknown as ConfigService,
      orgBranchSvc as any,
    );
    return { service, orgBranchSvc };
  }

  const run = { id: 'run-1', tenantId: 'tenant-1' } as unknown as TenantProvisioningRun;
  const dto = { hospitalName: 'Apollo', subdomain: 'apollo' } as unknown as ProvisionTenantDto;

  it('delegates to OrganizationBranchService.ensureDefaultForTenant(tenantId, hospitalName)', async () => {
    const { service, orgBranchSvc } = buildService();

    const result = await (service as any).stepCreateDefaultOrgBranch(run, dto);

    expect(orgBranchSvc.ensureDefaultForTenant).toHaveBeenCalledWith('tenant-1', 'Apollo');
    expect(result).toEqual({ organizationBranchId: 'branch-1', code: 'main', isDefault: true });
  });

  it('is idempotent on resume -- reuses whatever ensureDefaultForTenant returns without creating a second row itself', async () => {
    const orgBranchSvc = { ensureDefaultForTenant: jest.fn().mockResolvedValue({ id: 'existing', code: 'main', isDefault: true }) };
    const { service } = buildService(orgBranchSvc);

    const first = await (service as any).stepCreateDefaultOrgBranch(run, dto);
    const second = await (service as any).stepCreateDefaultOrgBranch(run, dto);

    expect(orgBranchSvc.ensureDefaultForTenant).toHaveBeenCalledTimes(2);
    expect(first).toEqual(second);
  });

  it('propagates a failure from ensureDefaultForTenant so the step ledger records it as failed', async () => {
    const orgBranchSvc = { ensureDefaultForTenant: jest.fn().mockRejectedValue(new Error('db unavailable')) };
    const { service } = buildService(orgBranchSvc);

    await expect((service as any).stepCreateDefaultOrgBranch(run, dto)).rejects.toThrow('db unavailable');
  });
});
