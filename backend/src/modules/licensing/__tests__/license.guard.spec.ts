import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { LicenseGuard } from '../license.guard';

function buildContext(user: any, requiredModule: string | undefined): ExecutionContext {
  const request = { user };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('LicenseGuard', () => {
  function buildGuard(requiredModule: string | undefined, getStatus: jest.Mock) {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(requiredModule) } as unknown as Reflector;
    const licenseProvider = { getStatus };
    return new LicenseGuard(reflector, licenseProvider as any);
  }

  it('passes through when no @RequireModule decorator is present, without calling getStatus()', async () => {
    const getStatus = jest.fn();
    const guard = buildGuard(undefined, getStatus);
    const result = await guard.canActivate(buildContext({ tenantId: 'tenant-a' }, undefined));
    expect(result).toBe(true);
    expect(getStatus).not.toHaveBeenCalled();
  });

  it('passes request.user.tenantId to getStatus() (the Phase 1 fix) rather than calling it with no argument', async () => {
    const getStatus = jest.fn().mockResolvedValue({ isValid: true, licensedModules: ['LOYALTY'] });
    const guard = buildGuard('LOYALTY', getStatus);

    await guard.canActivate(buildContext({ id: 'u1', tenantId: 'tenant-a' }, 'LOYALTY'));

    expect(getStatus).toHaveBeenCalledWith('tenant-a');
  });

  it('passes undefined when request.user has no tenantId (e.g. a workstation/capability principal), preserving prior behavior for those', async () => {
    const getStatus = jest.fn().mockResolvedValue({ isValid: true, licensedModules: ['LOYALTY'] });
    const guard = buildGuard('LOYALTY', getStatus);

    await guard.canActivate(buildContext({ id: 'w1', isWorkstationToken: true }, 'LOYALTY'));

    expect(getStatus).toHaveBeenCalledWith(undefined);
  });

  it('two tenants sharing one backend get independent module-gating decisions', async () => {
    // Simulates SubscriptionLicenseProvider-like behavior: tenant A is
    // licensed for LOYALTY, tenant B is not.
    const getStatus = jest.fn().mockImplementation(async (tenantId?: string) => ({
      isValid: true,
      licensedModules: tenantId === 'tenant-a' ? ['LOYALTY'] : [],
    }));
    const guard = buildGuard('LOYALTY', getStatus);

    await expect(guard.canActivate(buildContext({ tenantId: 'tenant-a' }, 'LOYALTY'))).resolves.toBe(true);
    await expect(guard.canActivate(buildContext({ tenantId: 'tenant-b' }, 'LOYALTY'))).rejects.toThrow();
  });

  it('throws ServiceUnavailableException when the license is invalid', async () => {
    const getStatus = jest.fn().mockResolvedValue({ isValid: false, licensedModules: [] });
    const guard = buildGuard('LOYALTY', getStatus);
    await expect(guard.canActivate(buildContext({ tenantId: 'tenant-a' }, 'LOYALTY'))).rejects.toThrow();
  });
});
