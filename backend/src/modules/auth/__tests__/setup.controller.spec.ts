import { ConflictException, ForbiddenException } from '@nestjs/common';
import { SetupController } from '../setup.controller';

// ── Fix verification: SetupController's two @Public() routes used to call
// VendorSyncService.getRegistration() directly -- a deliberately-global,
// tenant-unaware lookup meant only for machine-token-authenticated routes
// (webhook, oracle-test). On a shared cloud backend this leaked one
// tenant's registration status/hospital name onto every other tenant's
// public login page, and could block a second tenant from bootstrapping
// its own registration entirely. These tests exercise the controller
// directly (no NestJS TestingModule needed -- both dependencies are
// plain constructor params, no other DI wiring involved) to confirm the
// fix: req.tenantId (set ambiently by SubdomainTenantMiddleware on every
// request, authenticated or not) now drives which tenant's data is used.

function mockVendorSyncService() {
  return {
    getRegistration: jest.fn(),
    getRegistrationForCurrentTenant: jest.fn(),
    register: jest.fn(),
  };
}

function mockAuditService() {
  return { log: jest.fn().mockResolvedValue(undefined) };
}

function buildReq(tenantId?: string): any {
  return { headers: {}, ip: '127.0.0.1', tenantId };
}

describe('SetupController tenant isolation (cross-tenant leak fix)', () => {
  describe('getVendorRegistrationStatus', () => {
    it('scopes to the requesting tenant via req.tenantId, not the global getRegistration()', async () => {
      const vendorSyncService = mockVendorSyncService();
      const controller = new SetupController(vendorSyncService as any, mockAuditService() as any);
      vendorSyncService.getRegistrationForCurrentTenant.mockResolvedValue({
        hospitalName: 'Tenant A Hospital',
        registeredAt: new Date(),
      });

      const result = await controller.getVendorRegistrationStatus(buildReq('tenant-a'));

      expect(vendorSyncService.getRegistrationForCurrentTenant).toHaveBeenCalled();
      expect(vendorSyncService.getRegistration).not.toHaveBeenCalled();
      expect(result).toEqual(expect.objectContaining({ registered: true, hospitalName: 'Tenant A Hospital' }));
    });

    it('does not leak another tenant\'s registration when this tenant has none of its own', async () => {
      const vendorSyncService = mockVendorSyncService();
      const controller = new SetupController(vendorSyncService as any, mockAuditService() as any);
      // Simulates the exact bug: some OTHER tenant's registration exists
      // globally, but this tenant's own scoped lookup correctly finds none.
      vendorSyncService.getRegistration.mockResolvedValue({ hospitalName: 'Some Other Tenant', registeredAt: new Date() });
      vendorSyncService.getRegistrationForCurrentTenant.mockResolvedValue(null);

      const result = await controller.getVendorRegistrationStatus(buildReq('tenant-b'));

      expect(result).toEqual({ registered: false });
    });

    it('falls back to the global lookup when req.tenantId is unset (defensive, matches pre-fix behavior)', async () => {
      const vendorSyncService = mockVendorSyncService();
      const controller = new SetupController(vendorSyncService as any, mockAuditService() as any);
      vendorSyncService.getRegistration.mockResolvedValue({ hospitalName: 'Default', registeredAt: new Date() });

      const result = await controller.getVendorRegistrationStatus(buildReq(undefined));

      expect(vendorSyncService.getRegistration).toHaveBeenCalled();
      expect(vendorSyncService.getRegistrationForCurrentTenant).not.toHaveBeenCalled();
      expect(result.registered).toBe(true);
    });
  });

  describe('setupVendorRegistration', () => {
    const dto = { vendorApiUrl: 'http://vendor.local', publicIp: '1.1.1.1', publicPort: 3000 } as any;

    it('registers scoped to the requesting tenant', async () => {
      const vendorSyncService = mockVendorSyncService();
      const controller = new SetupController(vendorSyncService as any, mockAuditService() as any);
      vendorSyncService.register.mockResolvedValue({
        instanceToken: 'tok-1', status: 'ACTIVE', registeredAt: new Date(), vendorApiUrl: 'http://vendor.local',
      });

      const result = await controller.setupVendorRegistration(dto, buildReq('tenant-a'));

      expect(vendorSyncService.register).toHaveBeenCalledWith(dto);
      expect(result.registered).toBe(true);
    });

    it('translates register()\'s ConflictException into the existing 403 INSTANCE_ALREADY_REGISTERED shape', async () => {
      const vendorSyncService = mockVendorSyncService();
      const controller = new SetupController(vendorSyncService as any, mockAuditService() as any);
      vendorSyncService.register.mockRejectedValue(new ConflictException('already registered'));

      await expect(controller.setupVendorRegistration(dto, buildReq('tenant-a')))
        .rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rethrows non-conflict errors unchanged', async () => {
      const vendorSyncService = mockVendorSyncService();
      const controller = new SetupController(vendorSyncService as any, mockAuditService() as any);
      vendorSyncService.register.mockRejectedValue(new Error('vendor unreachable'));

      await expect(controller.setupVendorRegistration(dto, buildReq('tenant-a')))
        .rejects.toThrow('vendor unreachable');
    });
  });
});
