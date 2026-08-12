import { UnauthorizedException } from '@nestjs/common';
import { LicenseController } from '../license.controller';

/**
 * Focused unit tests for the internal-provision secret check
 * (LicenseController.internalProvision / isValidProvisioningSecret).
 * Constructs the controller directly with plain mocks rather than through
 * Nest's HTTP pipeline -- guards/pipes aren't invoked this way, but the
 * method under test doesn't depend on them; this keeps the test fast and
 * focused on the auth logic itself.
 */
function buildController(configuredSecret: string) {
  const vendorSyncService = {
    internalProvision: jest.fn().mockResolvedValue({ status: 'ACTIVE' }),
  };
  const config = {
    get: jest.fn().mockImplementation((key: string, def?: unknown) =>
      key === 'deployment.provisioningSecret' ? configuredSecret : def,
    ),
  };

  const controller = new LicenseController(
    {} as any, // licenseService
    vendorSyncService as any,
    {} as any, // hisConfigService
    {} as any, // hisQueryDefinitionPublisher (D.3, HisQueryDefinitionPublisherService)
    {} as any, // oraclePoolService
    {} as any, // settingsService
    config as any,
    {} as any, // auditService (D.6, AuditService)
    {} as any, // connectorDirectory (D.6, ConnectorDirectoryService)
  );

  return { controller, vendorSyncService };
}

const BODY = {
  instanceToken: 'tok', instanceSecret: 'sec',
  vendorApiUrl: 'http://vendor.example.com',
  hospitalName: 'Test', hospitalCode: 'T1',
};

describe('LicenseController.internalProvision', () => {
  it('rejects when no secret header is supplied', async () => {
    const { controller } = buildController('CONFIGURED_SECRET_1234567890');
    await expect(controller.internalProvision(undefined as any, BODY as any))
      .rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects when the supplied secret does not match', async () => {
    const { controller } = buildController('CONFIGURED_SECRET_1234567890');
    await expect(controller.internalProvision('WRONG_SECRET', BODY as any))
      .rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects when the supplied secret has a different length than configured (regression guard for the timingSafeEqual crash)', async () => {
    const { controller } = buildController('CONFIGURED_SECRET_1234567890');
    // Previously: a plain `!==` comparison. Now goes through a length check
    // before timingSafeEqual specifically so a wrong-length header is
    // rejected cleanly instead of throwing a RangeError.
    await expect(controller.internalProvision('short', BODY as any))
      .rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects every request when PROVISIONING_SECRET is unset/empty, even with an empty header', async () => {
    const { controller } = buildController('');
    await expect(controller.internalProvision('', BODY as any))
      .rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('accepts and delegates to VendorSyncService when the secret matches exactly', async () => {
    const { controller, vendorSyncService } = buildController('CONFIGURED_SECRET_1234567890');
    const result = await controller.internalProvision('CONFIGURED_SECRET_1234567890', BODY as any);

    expect(vendorSyncService.internalProvision).toHaveBeenCalledWith(BODY);
    expect(result).toEqual({ ok: true, message: 'Tenant successfully provisioned', status: 'ACTIVE' });
  });
});
