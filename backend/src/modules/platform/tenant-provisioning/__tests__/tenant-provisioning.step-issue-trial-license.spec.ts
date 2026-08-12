/**
 * Cloud Licensing API (2026-07-29) -- unit coverage for
 * TenantProvisioningService.stepIssueTrialLicense()'s new field values
 * (licensedModules: ['PLATFORM'], a real currentPeriodEnd) and its eager
 * VendorRegistration creation, both landed as part of wiring the cloud
 * licensing path up for real. `stepIssueTrialLicense` is private, so this
 * calls it via a typed `as any` cast, matching how this repo's other
 * private-method-focused specs (see license-provider.conformance.spec.ts's
 * direct construction of the class under test) avoid a full Nest
 * TestingModule for a single method.
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

describe('TenantProvisioningService.stepIssueTrialLicense', () => {
  function buildService(opts: {
    licenseRepo?: ReturnType<typeof makeRepo>;
    vendorRegRepo?: ReturnType<typeof makeRepo>;
    trialDays?: number;
  } = {}) {
    const licenseRepo = opts.licenseRepo ?? makeRepo();
    const vendorRegRepo = opts.vendorRegRepo ?? makeRepo({ findOne: jest.fn().mockResolvedValue(null) });
    const config = {
      get: jest.fn((key: string, def?: unknown) => (key === 'LICENSE_TRIAL_DAYS' ? (opts.trialDays ?? 30) : def)),
    } as unknown as ConfigService;

    const service = new TenantProvisioningService(
      makeRepo() as any, // runRepo
      makeRepo() as any, // stepRepo
      makeRepo() as any, // pairingRepo
      makeRepo() as any, // tenantRepo
      makeRepo() as any, // roleRepo
      makeRepo() as any, // permissionRepo
      licenseRepo as any, // licenseRepo
      vendorRegRepo as any, // vendorRegRepo
      makeRepo() as any, // userRepo
      {} as any, // authService
      { emit: jest.fn() } as any, // eventEmitter
      config,
      { ensureDefaultForTenant: jest.fn() } as any, // orgBranchService
    );
    return { service, licenseRepo, vendorRegRepo, config };
  }

  const run = { id: 'run-1', tenantId: 'tenant-1' } as unknown as TenantProvisioningRun;
  const dto = { hospitalName: 'Apollo', subdomain: 'apollo' } as unknown as ProvisionTenantDto;

  it('is a no-op for self-hosted, unchanged from before', async () => {
    const { service, licenseRepo, vendorRegRepo } = buildService();
    const result = await (service as any).stepIssueTrialLicense(run, dto, 'self_hosted');
    expect(result.skipped).toBe(true);
    expect(licenseRepo.save).not.toHaveBeenCalled();
    expect(vendorRegRepo.save).not.toHaveBeenCalled();
  });

  it('cloud: issues a trial license with licensedModules=[PLATFORM] and a real 30-day currentPeriodEnd', async () => {
    const before = Date.now();
    const { service, licenseRepo } = buildService({ trialDays: 30 });

    const result = await (service as any).stepIssueTrialLicense(run, dto, 'cloud');

    expect(licenseRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        subscriptionStatus: 'trialing',
        licensedModules: ['PLATFORM'],
        maxUsers: 5,
      }),
    );
    const savedArg = licenseRepo.save.mock.calls[0][0];
    expect(savedArg.currentPeriodEnd).toBeInstanceOf(Date);
    const deltaMs = savedArg.currentPeriodEnd.getTime() - before;
    // Should be ~30 days out, generous tolerance for test execution time.
    expect(deltaMs).toBeGreaterThan(29 * 24 * 60 * 60 * 1000);
    expect(deltaMs).toBeLessThan(31 * 24 * 60 * 60 * 1000);
    expect(result.subscriptionStatus).toBe('trialing');
    expect(result.currentPeriodEnd).toBeTruthy();
  });

  it('cloud: eagerly creates a VendorRegistration row and surfaces instanceToken/instanceSecret in resultData', async () => {
    const vendorRegRepo = makeRepo({ findOne: jest.fn().mockResolvedValue(null) });
    const { service } = buildService({ vendorRegRepo });

    const result = await (service as any).stepIssueTrialLicense(run, dto, 'cloud');

    expect(vendorRegRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-1', status: 'ACTIVE' }),
    );
    expect(typeof result.instanceToken).toBe('string');
    expect(typeof result.instanceSecret).toBe('string');
    expect(result.instanceToken.length).toBeGreaterThan(0);
    expect(result.instanceSecret.length).toBeGreaterThan(0);
  });

  it('cloud: reuses an existing VendorRegistration row instead of creating a duplicate (idempotent resume)', async () => {
    const existing = { instanceToken: 'existing-token', instanceSecret: 'existing-secret', tenantId: 'tenant-1' };
    const vendorRegRepo = makeRepo({ findOne: jest.fn().mockResolvedValue(existing) });
    const { service } = buildService({ vendorRegRepo });

    const result = await (service as any).stepIssueTrialLicense(run, dto, 'cloud');

    expect(vendorRegRepo.save).not.toHaveBeenCalled();
    expect(result.instanceToken).toBe('existing-token');
    expect(result.instanceSecret).toBe('existing-secret');
  });
});
