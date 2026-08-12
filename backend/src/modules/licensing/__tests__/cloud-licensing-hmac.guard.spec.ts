/**
 * Cloud Licensing API (2026-07-29) -- CloudLicensingHmacGuard verifies the
 * HMAC-SHA256 signature Vendor Portal sends over the raw request body,
 * keyed by the resolved tenant's VendorRegistration.instanceSecret. Same
 * verification shape as VendorSyncService.checkWebhookSignature() (see that
 * method's own spec in vendor-sync.service.spec.ts) -- this file is scoped
 * to the guard's own CanActivate wiring (route param lookup, header
 * presence, timing-safe compare via the real crypto module), not a
 * duplicate of that HMAC-format test.
 */
import * as crypto from 'crypto';
import { UnauthorizedException, BadRequestException, ExecutionContext } from '@nestjs/common';
import { CloudLicensingHmacGuard } from '../guards/cloud-licensing-hmac.guard';

function sign(secret: string, body: Buffer | string): string {
  return `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;
}

function makeContext(opts: {
  tenantId?: string;
  signature?: string;
  rawBody?: Buffer;
}): ExecutionContext {
  const request: any = {
    params: opts.tenantId !== undefined ? { tenantId: opts.tenantId } : {},
    headers: opts.signature !== undefined ? { 'x-vendor-signature': opts.signature } : {},
    rawBody: opts.rawBody,
  };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('CloudLicensingHmacGuard', () => {
  const instanceSecret = 'super-secret-value';
  const rawBody = Buffer.from(JSON.stringify({ subscriptionStatus: 'active', licensedModules: ['PLATFORM'] }));

  function makeRegRepo(record: { tenantId: string; instanceSecret: string } | null) {
    return { findOne: jest.fn().mockResolvedValue(record) } as any;
  }

  it('accepts a valid signature computed over the raw body with the resolved tenant\'s instanceSecret', async () => {
    const regRepo = makeRegRepo({ tenantId: 'tenant-1', instanceSecret });
    const guard = new CloudLicensingHmacGuard(regRepo);
    const validSignature = sign(instanceSecret, rawBody);
    const ctx = makeContext({ tenantId: 'tenant-1', signature: validSignature, rawBody });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(regRepo.findOne).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: 'tenant-1' } }));
  });

  it('rejects an invalid/wrong-secret signature with 401', async () => {
    const regRepo = makeRegRepo({ tenantId: 'tenant-1', instanceSecret });
    const guard = new CloudLicensingHmacGuard(regRepo);
    const wrongSignature = sign('a-completely-different-secret', rawBody);
    const ctx = makeContext({ tenantId: 'tenant-1', signature: wrongSignature, rawBody });

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a missing X-Vendor-Signature header with 401', async () => {
    const regRepo = makeRegRepo({ tenantId: 'tenant-1', instanceSecret });
    const guard = new CloudLicensingHmacGuard(regRepo);
    const ctx = makeContext({ tenantId: 'tenant-1', rawBody });

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects when no VendorRegistration exists for the tenant with 401', async () => {
    const regRepo = makeRegRepo(null);
    const guard = new CloudLicensingHmacGuard(regRepo);
    const validSignature = sign(instanceSecret, rawBody);
    const ctx = makeContext({ tenantId: 'unknown-tenant', signature: validSignature, rawBody });

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a mismatched-length signature without throwing an unhandled RangeError', async () => {
    const regRepo = makeRegRepo({ tenantId: 'tenant-1', instanceSecret });
    const guard = new CloudLicensingHmacGuard(regRepo);
    const ctx = makeContext({ tenantId: 'tenant-1', signature: 'sha256=tooshort', rawBody });

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a missing :tenantId route param with 400', async () => {
    const regRepo = makeRegRepo({ tenantId: 'tenant-1', instanceSecret });
    const guard = new CloudLicensingHmacGuard(regRepo);
    const ctx = makeContext({ signature: 'sha256=whatever', rawBody });

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a missing raw body with 400', async () => {
    const regRepo = makeRegRepo({ tenantId: 'tenant-1', instanceSecret });
    const guard = new CloudLicensingHmacGuard(regRepo);
    const ctx = makeContext({ tenantId: 'tenant-1', signature: 'sha256=whatever' });

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(BadRequestException);
  });
});
