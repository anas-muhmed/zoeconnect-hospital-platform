import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException } from '@nestjs/common';
import * as crypto from 'crypto';
import { VendorSyncService } from '../vendor-sync.service';
import { VendorRegistration } from '../entities/vendor-registration.entity';
import { LicenseRequestEntity } from '../entities/license-request.entity';
import { LicenseService } from '../license.service';
import { getTenantScopedRepositoryToken } from '../../platform/tenant/repositories/tenant-scoped-repository.provider';
import { TenantScopedRepository } from '../../platform/tenant/repositories/tenant-scoped.repository';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';

// ── In-memory fake repo (real filtering, not a jest.fn() stub) ────────────────
// TenantScopedRepository is real production code, not mocked here -- it's
// constructed for real, wrapping this fake raw repo, so these tests exercise
// the actual tenant-predicate-merging logic, not a re-implementation of it.

function matches(row: any, where: any): boolean {
  if (!where) return true;
  if (Array.isArray(where)) return where.some((w) => matches(row, w));
  return Object.entries(where).every(([k, v]) => row[k] === v);
}

function createInMemoryRepo(rows: any[] = []) {
  let seq = 0;
  return {
    _rows: rows,
    // TenantScopedRepository.entityName reads `this.repo.metadata.name`
    // (used in its debug/dry-run logging, notably the runAsSystem() branch)
    // -- a real TypeORM Repository always has this; this in-memory mock
    // needs it stubbed too or that getter throws on `undefined.name`.
    metadata: { name: 'MockEntity' },
    findOne: jest.fn(async (options?: any) => {
      const list = rows.filter((r) => matches(r, options?.where));
      if (options?.order) {
        const [key, dir] = Object.entries(options.order)[0] as [string, string];
        list.sort((a, b) => (dir === 'DESC' ? (b[key] > a[key] ? 1 : -1) : (a[key] > b[key] ? 1 : -1)));
      }
      return list[0] ?? null;
    }),
    find: jest.fn(async (options?: any) => rows.filter((r) => matches(r, options?.where))),
    count: jest.fn(async (options?: any) => rows.filter((r) => matches(r, options?.where)).length),
    create: jest.fn((partial: any) => ({ id: `id-${++seq}`, ...partial })),
    save: jest.fn(async (entity: any) => {
      const idx = rows.findIndex((r) => r.id === entity.id);
      if (idx >= 0) rows[idx] = { ...rows[idx], ...entity };
      else rows.push(entity);
      return entity;
    }),
    update: jest.fn(async (criteria: any, partial: any) => {
      rows.filter((r) => matches(r, criteria)).forEach((r) => Object.assign(r, partial));
      return { affected: rows.filter((r) => matches(r, criteria)).length };
    }),
  };
}

function mockLicenseService() {
  return {
    getMachineFingerprint: jest.fn().mockReturnValue('a'.repeat(32)),
    getStatus: jest.fn().mockResolvedValue({
      isValid: true, isTrial: false, hospitalName: 'Test', hospitalCode: 'T1',
      licensedModules: ['PLATFORM'], maxUsers: 10, expiresAt: null,
    }),
  };
}

async function createService(opts: { regRows?: any[]; reqRows?: any[] } = {}) {
  const regRepo = createInMemoryRepo(opts.regRows ?? []);
  const reqRepo = createInMemoryRepo(opts.reqRows ?? []);
  const licenseService = mockLicenseService();
  const tenantContext = new TenantContextStorage();

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      VendorSyncService,
      { provide: getRepositoryToken(VendorRegistration),   useValue: regRepo },
      { provide: getRepositoryToken(LicenseRequestEntity), useValue: reqRepo },
      { provide: LicenseService, useValue: licenseService },
      {
        provide: getTenantScopedRepositoryToken(VendorRegistration),
        useValue: new TenantScopedRepository(regRepo as any, tenantContext),
      },
      {
        provide: getTenantScopedRepositoryToken(LicenseRequestEntity),
        useValue: new TenantScopedRepository(reqRepo as any, tenantContext),
      },
      { provide: TenantContextStorage, useValue: tenantContext },
    ],
  }).compile();

  return {
    service: module.get<VendorSyncService>(VendorSyncService),
    regRepo,
    reqRepo,
  };
}

const PAYLOAD = {
  instanceToken:  'tok-abc',
  instanceSecret: 'sec-xyz',
  vendorApiUrl:   'http://vendor.example.com',
  hospitalName:   'Test Hospital',
  hospitalCode:   'TH01',
};

describe('VendorSyncService.internalProvision', () => {
  it('provisions a fresh instance when no registration exists', async () => {
    const { service, regRepo } = await createService();
    const result = await service.internalProvision(PAYLOAD);

    expect(regRepo.save).toHaveBeenCalledTimes(1);
    expect(result.instanceToken).toBe(PAYLOAD.instanceToken);
    expect(result.status).toBe('ACTIVE');
  });

  it('is idempotent: identical resubmission (same token + hospitalCode) returns the existing row without a second insert', async () => {
    const existing = { id: 'existing-1', instanceToken: PAYLOAD.instanceToken, hospitalCode: PAYLOAD.hospitalCode, status: 'ACTIVE' };
    const { service, regRepo } = await createService({ regRows: [existing] });

    const result = await service.internalProvision(PAYLOAD);

    expect(result).toEqual(existing);
    expect(regRepo.save).not.toHaveBeenCalled();
  });

  it('rejects a resubmission with different credentials for an already-registered instance', async () => {
    const existing = { id: 'existing-1', instanceToken: 'some-other-token', hospitalCode: PAYLOAD.hospitalCode, status: 'ACTIVE' };
    const { service } = await createService({ regRows: [existing] });

    await expect(service.internalProvision(PAYLOAD)).rejects.toBeInstanceOf(ConflictException);
  });

  it('resolves a concurrent-duplicate-request race idempotently instead of throwing a raw DB error', async () => {
    const { service, regRepo } = await createService();

    const dbError: any = new Error('duplicate key value violates unique constraint');
    dbError.code = '23505';
    regRepo.save.mockRejectedValueOnce(dbError);

    const raceWinner = { id: 'winner-1', instanceToken: PAYLOAD.instanceToken, hospitalCode: PAYLOAD.hospitalCode, status: 'ACTIVE' };
    regRepo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(raceWinner);

    const result = await service.internalProvision(PAYLOAD);
    expect(result).toEqual(raceWinner);
  });

  it('surfaces a Conflict (not a raw 500) when the race winner has different credentials', async () => {
    const { service, regRepo } = await createService();

    const dbError: any = new Error('duplicate key value violates unique constraint');
    dbError.code = '23505';
    regRepo.save.mockRejectedValueOnce(dbError);

    const raceWinner = { id: 'winner-1', instanceToken: 'a-completely-different-token', hospitalCode: 'OTHER_CODE', status: 'ACTIVE' };
    regRepo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(raceWinner);

    await expect(service.internalProvision(PAYLOAD)).rejects.toBeInstanceOf(ConflictException);
  });

  it('rethrows non-unique-violation DB errors unchanged', async () => {
    const { service, regRepo } = await createService();
    const dbError: any = new Error('connection terminated');
    dbError.code = '57P01';
    regRepo.save.mockRejectedValueOnce(dbError);

    await expect(service.internalProvision(PAYLOAD)).rejects.toThrow('connection terminated');
  });
});

describe('VendorSyncService.verifyWebhookSignature / resolveVerifiedWebhookRegistration', () => {
  const rawBody = Buffer.from(JSON.stringify({ type: 'LICENSE_APPROVED' }));
  const instanceSecret = 'test-instance-secret';

  function validSignature(): string {
    return `sha256=${crypto.createHmac('sha256', instanceSecret).update(rawBody).digest('hex')}`;
  }

  it('returns true for a correctly-signed body', async () => {
    const { service } = await createService({ regRows: [{ id: 'r1', instanceSecret, status: 'ACTIVE' }] });
    await expect(service.verifyWebhookSignature(rawBody, validSignature())).resolves.toBe(true);
  });

  it('returns false (does not throw) for a signature header of a different length than expected', async () => {
    const { service } = await createService({ regRows: [{ id: 'r1', instanceSecret, status: 'ACTIVE' }] });
    await expect(service.verifyWebhookSignature(rawBody, 'sha256=tooshort')).resolves.toBe(false);
  });

  it('returns false when no registration exists', async () => {
    const { service } = await createService();
    await expect(service.verifyWebhookSignature(rawBody, validSignature())).resolves.toBe(false);
  });

  it('returns false when the signature header is empty', async () => {
    const { service } = await createService({ regRows: [{ id: 'r1', instanceSecret, status: 'ACTIVE' }] });
    await expect(service.verifyWebhookSignature(rawBody, '')).resolves.toBe(false);
  });

  it('resolveVerifiedWebhookRegistration returns the matched registration (with its tenantId) on success', async () => {
    const reg = { id: 'r1', instanceSecret, status: 'ACTIVE', tenantId: 'tenant-a' };
    const { service } = await createService({ regRows: [reg] });
    await expect(service.resolveVerifiedWebhookRegistration(rawBody, validSignature())).resolves.toEqual(reg);
  });

  it('resolveVerifiedWebhookRegistration returns null on an invalid signature', async () => {
    const { service } = await createService({ regRows: [{ id: 'r1', instanceSecret, status: 'ACTIVE' }] });
    await expect(service.resolveVerifiedWebhookRegistration(rawBody, 'sha256=bad')).resolves.toBeNull();
  });
});

describe('VendorSyncService tenant isolation (two tenants, one shared table)', () => {
  it('register(): two tenants each get their own registration, stamped with their own tenantId, and neither sees the other\'s via getRegistrationForCurrentTenant()', async () => {
    const { service, regRepo } = await createService();

    const originalFetch = global.fetch;
    let issuedTokenCounter = 0;
    global.fetch = jest.fn().mockImplementation(async () => ({
      ok: true,
      json: async () => ({ instanceToken: `tok-${++issuedTokenCounter}`, instanceSecret: `sec-${issuedTokenCounter}` }),
    })) as any;

    try {
      await TenantContextStorage.run('tenant-a', () =>
        service.register({ vendorApiUrl: 'http://vendor.local', publicIp: '1.1.1.1', publicPort: 3000, hospitalName: 'Hospital A', hospitalCode: 'HA' } as any),
      );
      await TenantContextStorage.run('tenant-b', () =>
        service.register({ vendorApiUrl: 'http://vendor.local', publicIp: '2.2.2.2', publicPort: 3000, hospitalName: 'Hospital B', hospitalCode: 'HB' } as any),
      );

      expect(regRepo._rows).toHaveLength(2);
      expect(regRepo._rows.find((r: any) => r.hospitalCode === 'HA').tenantId).toBe('tenant-a');
      expect(regRepo._rows.find((r: any) => r.hospitalCode === 'HB').tenantId).toBe('tenant-b');

      const seenByA = await TenantContextStorage.run('tenant-a', () => service.getRegistrationForCurrentTenant());
      const seenByB = await TenantContextStorage.run('tenant-b', () => service.getRegistrationForCurrentTenant());

      expect(seenByA?.hospitalCode).toBe('HA');
      expect(seenByB?.hospitalCode).toBe('HB');

      // Tenant A registering a second time must not be blocked/confused by
      // tenant B's row existing in the same table.
      await expect(
        TenantContextStorage.run('tenant-a', () =>
          service.register({ vendorApiUrl: 'http://vendor.local', publicIp: '1.1.1.1', publicPort: 3000, hospitalName: 'Hospital A', hospitalCode: 'HA' } as any),
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('submitRequest(): tenant A\'s pending request does not block tenant B from submitting one', async () => {
    // Seed one ACTIVE registration per tenant so submitRequest()'s
    // "Not registered" guard passes for both.
    const regRows = [
      { id: 'reg-a', instanceToken: 'tok-a', status: 'ACTIVE', tenantId: 'tenant-a', vendorApiUrl: 'http://vendor.local', hospitalName: 'A', hospitalCode: 'HA', machineFingerprint: 'fp' },
      { id: 'reg-b', instanceToken: 'tok-b', status: 'ACTIVE', tenantId: 'tenant-b', vendorApiUrl: 'http://vendor.local', hospitalName: 'B', hospitalCode: 'HB', machineFingerprint: 'fp' },
    ];
    const { service, reqRepo } = await createService({ regRows });

    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ requestId: 'vendor-req-1' }) }) as any;

    try {
      await TenantContextStorage.run('tenant-a', () =>
        service.submitRequest({ requestedModules: ['LOYALTY'] } as any),
      );

      // Tenant A now has a PENDING request. Tenant B must still be able to
      // submit its own -- the per-tenant scoping means A's pending row is
      // invisible to B's "already pending?" check.
      await expect(
        TenantContextStorage.run('tenant-b', () => service.submitRequest({ requestedModules: ['CMS'] } as any)),
      ).resolves.toBeDefined();

      // And a second submission from tenant A itself should still correctly conflict.
      await expect(
        TenantContextStorage.run('tenant-a', () => service.submitRequest({ requestedModules: ['EIC'] } as any)),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(reqRepo._rows.filter((r: any) => r.tenantId === 'tenant-a')).toHaveLength(1);
      expect(reqRepo._rows.filter((r: any) => r.tenantId === 'tenant-b')).toHaveLength(1);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('markRequestResolved(): resolving inside tenant A\'s context only updates tenant A\'s matching request', async () => {
    const reqRows = [
      { id: 'req-a', vendorRequestId: 'shared-vendor-id', status: 'PENDING', tenantId: 'tenant-a' },
    ];
    const { service, reqRepo } = await createService({ reqRows });

    await TenantContextStorage.run('tenant-a', () =>
      service.markRequestResolved('shared-vendor-id', 'APPROVED'),
    );

    expect(reqRepo._rows[0].status).toBe('APPROVED');
  });

  it('markRequestResolved(): running inside tenant B\'s context does not resolve tenant A\'s request of the same vendorRequestId', async () => {
    const reqRows = [
      { id: 'req-a', vendorRequestId: 'shared-vendor-id', status: 'PENDING', tenantId: 'tenant-a' },
    ];
    const { service, reqRepo } = await createService({ reqRows });

    await TenantContextStorage.run('tenant-b', () =>
      service.markRequestResolved('shared-vendor-id', 'APPROVED'),
    );

    // No row visible under tenant-b's scope, so nothing is mutated.
    expect(reqRepo._rows[0].status).toBe('PENDING');
  });

  it('runAsSystem(): a registration with tenantId=null (the untouched internal-provision path) does not throw when resolved with no tenant context', async () => {
    const reqRows = [{ id: 'req-x', vendorRequestId: 'orphan-vendor-id', status: 'PENDING', tenantId: null }];
    const { service, reqRepo } = await createService({ reqRows });

    await TenantContextStorage.runAsSystem(() =>
      service.markRequestResolved('orphan-vendor-id', 'APPROVED'),
    );

    expect(reqRepo._rows[0].status).toBe('APPROVED');
  });
});

// ── Self-review fix (finding 2): register()/submitRequest() previously let a
// raw Postgres 23505 (unique_violation) from the new per-tenant partial
// unique indexes surface as an unhandled 500, instead of the clean
// ConflictException internalProvision()'s own race-handling already
// produces for the identical class of check-then-insert race. ──

// ── Login-time cloud tenant auto-registration -- see AuthService.login()'s
// call site. Unlike register(), no external fetch() is performed here: the
// Vendor Portal already knows this tenant exists (it created it), so
// tokens/secret are generated locally and the row is written directly. ──

describe('VendorSyncService.autoRegisterCloudTenant', () => {
  it('creates an ACTIVE registration for a tenant with none yet, stamped with the current tenant id', async () => {
    const { service, regRepo } = await createService();

    const result = await TenantContextStorage.run('tenant-cloud-1', () =>
      service.autoRegisterCloudTenant('MOSC Hospital', 'mosc'),
    );

    expect(regRepo.save).toHaveBeenCalledTimes(1);
    expect(result?.status).toBe('ACTIVE');
    expect(result?.hospitalName).toBe('MOSC Hospital');
    expect(result?.hospitalCode).toBe('mosc');
    expect(regRepo._rows.find((r: any) => r.hospitalCode === 'mosc')?.tenantId).toBe('tenant-cloud-1');
  });

  it('is idempotent: a tenant that already has an ACTIVE registration is returned unchanged, no second insert', async () => {
    const existing = {
      id: 'reg-existing', instanceToken: 'tok-existing', status: 'ACTIVE',
      tenantId: 'tenant-cloud-1', hospitalName: 'MOSC Hospital', hospitalCode: 'mosc',
    };
    const { service, regRepo } = await createService({ regRows: [existing] });

    const result = await TenantContextStorage.run('tenant-cloud-1', () =>
      service.autoRegisterCloudTenant('MOSC Hospital', 'mosc'),
    );

    expect(result).toEqual(existing);
    expect(regRepo.save).not.toHaveBeenCalled();
  });

  it('two different cloud tenants each get their own row and never see the other\'s', async () => {
    const { service, regRepo } = await createService();

    await TenantContextStorage.run('tenant-cloud-1', () => service.autoRegisterCloudTenant('MOSC Hospital', 'mosc'));
    await TenantContextStorage.run('tenant-cloud-2', () => service.autoRegisterCloudTenant('Apollo Hospital', 'apollo'));

    expect(regRepo._rows).toHaveLength(2);
    const seenByMosc = await TenantContextStorage.run('tenant-cloud-1', () => service.getRegistrationForCurrentTenant());
    const seenByApollo = await TenantContextStorage.run('tenant-cloud-2', () => service.getRegistrationForCurrentTenant());
    expect(seenByMosc?.hospitalCode).toBe('mosc');
    expect(seenByApollo?.hospitalCode).toBe('apollo');
  });

  it('resolves a concurrent first-login race idempotently instead of throwing a raw DB error', async () => {
    const { service, regRepo } = await createService();

    const dbError: any = new Error('duplicate key value violates unique constraint');
    dbError.code = '23505';
    regRepo.save.mockRejectedValueOnce(dbError);

    const raceWinner = { id: 'winner-1', status: 'ACTIVE', tenantId: 'tenant-cloud-1', hospitalCode: 'mosc' };
    regRepo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(raceWinner);

    const result = await TenantContextStorage.run('tenant-cloud-1', () =>
      service.autoRegisterCloudTenant('MOSC Hospital', 'mosc'),
    );

    expect(result).toEqual(raceWinner);
  });

  it('rethrows non-unique-violation DB errors unchanged', async () => {
    const { service, regRepo } = await createService();
    const dbError: any = new Error('connection terminated');
    dbError.code = '57P01';
    regRepo.save.mockRejectedValueOnce(dbError);

    await expect(
      TenantContextStorage.run('tenant-cloud-1', () => service.autoRegisterCloudTenant('MOSC Hospital', 'mosc')),
    ).rejects.toThrow('connection terminated');
  });
});

describe('VendorSyncService concurrent-write race handling (self-review fix, finding 2)', () => {
  it('register(): a 23505 from the per-tenant singleton-active index surfaces as ConflictException, not a raw 500', async () => {
    const { service, regRepo } = await createService();

    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ instanceToken: 'tok-race', instanceSecret: 'sec-race' }),
    }) as any;

    const dbError: any = new Error('duplicate key value violates unique constraint "uq_vendor_registrations_single_active_per_tenant"');
    dbError.code = '23505';
    regRepo.save.mockRejectedValueOnce(dbError);

    try {
      await expect(
        TenantContextStorage.run('tenant-a', () =>
          service.register({ vendorApiUrl: 'http://vendor.local', publicIp: '1.1.1.1', publicPort: 3000, hospitalName: 'Hospital A', hospitalCode: 'HA' } as any),
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('register(): a non-unique-violation DB error is rethrown unchanged, not swallowed', async () => {
    const { service, regRepo } = await createService();

    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ instanceToken: 'tok-x', instanceSecret: 'sec-x' }),
    }) as any;

    const dbError: any = new Error('connection terminated');
    dbError.code = '57P01';
    regRepo.save.mockRejectedValueOnce(dbError);

    try {
      await expect(
        TenantContextStorage.run('tenant-a', () =>
          service.register({ vendorApiUrl: 'http://vendor.local', publicIp: '1.1.1.1', publicPort: 3000, hospitalName: 'Hospital A', hospitalCode: 'HA' } as any),
        ),
      ).rejects.toThrow('connection terminated');
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('submitRequest(): a 23505 from the new per-tenant pending-request index surfaces as ConflictException, not a raw 500', async () => {
    const regRows = [
      { id: 'reg-a', instanceToken: 'tok-a', status: 'ACTIVE', tenantId: 'tenant-a', vendorApiUrl: 'http://vendor.local', hospitalName: 'A', hospitalCode: 'HA', machineFingerprint: 'fp' },
    ];
    const { service, reqRepo } = await createService({ regRows });

    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ requestId: 'vendor-req-race' }) }) as any;

    const dbError: any = new Error('duplicate key value violates unique constraint "uq_license_requests_single_pending_per_tenant"');
    dbError.code = '23505';
    reqRepo.save.mockRejectedValueOnce(dbError);

    try {
      await expect(
        TenantContextStorage.run('tenant-a', () => service.submitRequest({ requestedModules: ['LOYALTY'] } as any)),
      ).rejects.toBeInstanceOf(ConflictException);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('submitRequest(): a non-unique-violation DB error is rethrown unchanged, not swallowed', async () => {
    const regRows = [
      { id: 'reg-a', instanceToken: 'tok-a', status: 'ACTIVE', tenantId: 'tenant-a', vendorApiUrl: 'http://vendor.local', hospitalName: 'A', hospitalCode: 'HA', machineFingerprint: 'fp' },
    ];
    const { service, reqRepo } = await createService({ regRows });

    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ requestId: 'vendor-req-x' }) }) as any;

    const dbError: any = new Error('connection terminated');
    dbError.code = '57P01';
    reqRepo.save.mockRejectedValueOnce(dbError);

    try {
      await expect(
        TenantContextStorage.run('tenant-a', () => service.submitRequest({ requestedModules: ['LOYALTY'] } as any)),
      ).rejects.toThrow('connection terminated');
    } finally {
      global.fetch = originalFetch;
    }
  });
});
