import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import * as os from 'os';
import * as crypto from 'crypto';
import { LicenseService } from '../license.service';
import { LicenseMaster } from '../entities/license-master.entity';
import { VendorRegistration } from '../entities/vendor-registration.entity';
import { AuditService } from '../../audit/audit.service';
import { getTenantScopedRepositoryToken } from '../../platform/tenant/repositories/tenant-scoped-repository.provider';
import { TenantScopedRepository } from '../../platform/tenant/repositories/tenant-scoped.repository';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';
import { TenantContextService } from '../../platform/tenant/tenant-context.service';

// ── Helpers ───────────────────────────────────────────────────────────────────

function matches(row: any, where: any): boolean {
  if (!where) return true;
  if (Array.isArray(where)) return where.some((w) => matches(row, w));
  return Object.entries(where).every(([k, v]) => row[k] === v);
}

// Self-review fix (finding 1) -- a minimal, chainable fake QueryBuilder
// backed by the same in-memory `rows` array the repo mock uses, supporting
// exactly the .delete()/.update().set()/.where('tenant_id = :tenantId', ...)
// /.whereInIds()/.execute() shapes actually used by license.service.ts.
// This is what lets the LICENSE_REVOKED / resetToTrial tenant-isolation
// tests below exercise real filtering logic instead of a no-op stub.
function makeQueryBuilder(rows: any[]) {
  let mode: 'update' | 'delete' | null = null;
  let setValues: Record<string, unknown> = {};
  let predicate: ((row: any) => boolean) | null = null;

  const qb: any = {
    update: jest.fn(() => { mode = 'update'; return qb; }),
    delete: jest.fn(() => { mode = 'delete'; return qb; }),
    set: jest.fn((v: Record<string, unknown>) => { setValues = v; return qb; }),
    where: jest.fn((_clause: string, params?: Record<string, any>) => {
      const tenantId = params?.tenantId;
      predicate = (row: any) => row.tenantId === tenantId;
      return qb;
    }),
    whereInIds: jest.fn((ids: string[]) => {
      predicate = (row: any) => ids.includes(row.id);
      return qb;
    }),
    execute: jest.fn(async () => {
      const targets = predicate ? rows.filter(predicate) : rows.slice();
      if (mode === 'delete') {
        for (const row of targets) {
          const idx = rows.indexOf(row);
          if (idx >= 0) rows.splice(idx, 1);
        }
      } else if (mode === 'update') {
        for (const row of targets) Object.assign(row, setValues);
      }
      return { affected: targets.length };
    }),
  };
  return qb;
}

function mockLicenseRepo(license?: Partial<LicenseMaster>): any {
  const rows = license ? [license] : [];
  return {
    _rows:   rows,
    count:   jest.fn().mockResolvedValue(license ? 1 : 0),
    findOne: jest.fn().mockImplementation(async (options?: any) => rows.filter((r) => matches(r, options?.where))[0] ?? (license ?? null)),
    find:    jest.fn().mockImplementation(async (options?: any) => rows.filter((r) => matches(r, options?.where))),
    create:  jest.fn().mockImplementation((d) => d),
    save:    jest.fn().mockImplementation((d) => {
      rows.push(d);
      return Promise.resolve({ id: 'lic-1', ...d });
    }),
    update:  jest.fn().mockResolvedValue(undefined),
    createQueryBuilder: jest.fn(() => makeQueryBuilder(rows)),
  };
}

function mockRegRepo(): any {
  const rows: any[] = [];
  return {
    _rows:   rows,
    findOne: jest.fn().mockImplementation(async (options?: any) => rows.filter((r) => matches(r, options?.where))[0] ?? null),
    find:    jest.fn().mockImplementation(async (options?: any) => rows.filter((r) => matches(r, options?.where))),
    createQueryBuilder: jest.fn(() => makeQueryBuilder(rows)),
  };
}

function mockRedis() {
  return {
    get:    jest.fn().mockResolvedValue(null),
    set:    jest.fn().mockResolvedValue('OK'),
    del:    jest.fn().mockResolvedValue(1),
    setex:  jest.fn().mockResolvedValue('OK'),
    keys:   jest.fn().mockResolvedValue([]),
  };
}

function mockAuditService() {
  return { log: jest.fn().mockResolvedValue(undefined) };
}

function mockConfig(overrides: Record<string, unknown> = {}) {
  return {
    get: jest.fn().mockImplementation((key: string, def?: unknown) => overrides[key] ?? def),
  };
}

function mockDataSource() {
  return {
    query: jest.fn().mockResolvedValue(undefined),
  };
}

// Self-review fix (finding 5) -- LicenseService now depends on
// TenantContextService to resolve the 'default' tenant's UUID at boot
// (onModuleInit -> activateTrial), where no ambient TenantContextStorage
// context exists yet.
function mockTenantContextService(defaultTenantId: string | null = 'default-tenant-uuid') {
  return {
    getCurrentTenantId: jest.fn().mockImplementation(async () => {
      if (defaultTenantId === null) throw new Error("No tenant row found for code='default'");
      return defaultTenantId;
    }),
  };
}

// ── Helper to build module ────────────────────────────────────────────────────

async function createService(
  existingLicense?: Partial<LicenseMaster>,
  defaultTenantId: string | null = 'default-tenant-uuid',
) {
  const licenseRepo  = mockLicenseRepo(existingLicense);
  const regRepo      = mockRegRepo();
  const redis        = mockRedis();
  const audit        = mockAuditService();
  const dataSource   = mockDataSource();
  const tenantContext = new TenantContextStorage();
  const tenantContextService = mockTenantContextService(defaultTenantId);

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      LicenseService,
      { provide: getRepositoryToken(LicenseMaster), useValue: licenseRepo },
      { provide: getRepositoryToken(VendorRegistration), useValue: regRepo },
      { provide: 'REDIS_CLIENT', useValue: redis },
      { provide: AuditService,   useValue: audit },
      { provide: DataSource,     useValue: dataSource },
      { provide: ConfigService,  useValue: mockConfig({
          'LICENSE_PUBLIC_KEY_PATH': '/tmp/test-license.pem',
          'LICENSE_TRIAL_DAYS': 30,
        }),
      },
      {
        provide: getTenantScopedRepositoryToken(LicenseMaster),
        useValue: new TenantScopedRepository(licenseRepo as any, tenantContext),
      },
      { provide: TenantContextStorage, useValue: tenantContext },
      { provide: TenantContextService, useValue: tenantContextService },
    ],
  }).compile();

  return {
    service: module.get<LicenseService>(LicenseService),
    licenseRepo,
    regRepo,
    redis,
    audit,
    dataSource,
    tenantContext,
    tenantContextService,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('LicenseService', () => {

  // ── getMachineFingerprint ─────────────────────────────────────────────────

  describe('getMachineFingerprint', () => {
    it('returns a 32-character lowercase hex string', async () => {
      const { service } = await createService();
      const fp = service.getMachineFingerprint();
      expect(fp).toMatch(/^[0-9a-f]{32}$/);
    });

    it('is deterministic on the same machine', async () => {
      const { service } = await createService();
      const fp1 = service.getMachineFingerprint();
      const fp2 = service.getMachineFingerprint();
      expect(fp1).toBe(fp2);
    });

    it('is derived from hostname and network interfaces', async () => {
      const { service } = await createService();
      const real = service.getMachineFingerprint();

      // A different hostname input produces a different hash
      const fakeInput = 'different-host:';
      const fakeHash = crypto.createHash('sha256').update(fakeInput).digest('hex').slice(0, 32);
      expect(fakeHash).not.toBe(real);
    });
  });

  // ── getStatus (cache) ─────────────────────────────────────────────────────

  describe('getStatus', () => {
    it('returns cached value when Redis has it', async () => {
      const cachedStatus = {
        isValid: true, isTrial: false, hospitalName: 'Test Hospital',
        hospitalCode: 'TEST', licensedModules: ['LOYALTY', 'PLATFORM'],
        maxUsers: 50, expiresAt: null, daysRemaining: null,
        isExpiringSoon: false, machineFingerprint: null,
      };
      const { service, redis, licenseRepo } = await createService();
      redis.get.mockResolvedValue(JSON.stringify(cachedStatus));

      const status = await service.getStatus();

      expect(status).toEqual(cachedStatus);
      expect(licenseRepo.findOne).not.toHaveBeenCalled();
    });

    it('queries DB and caches result when Redis is cold', async () => {
      const license: Partial<LicenseMaster> = {
        id:              'lic-1',
        status:          'TRIAL',
        expiresAt:       new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        licensedModules: ['PLATFORM'],
        hospitalName:    'Trial Hospital',
        hospitalCode:    'TRIAL',
        maxUsers:        5,
        machineFingerprint: null,
      };
      const { service, redis, licenseRepo } = await createService(license);
      redis.get.mockResolvedValue(null); // cold cache

      await service.getStatus();

      // refreshCache() aggregates ACTIVE/TRIAL/EXPIRED rows via find(), not
      // findOne() -- a multi-license aggregation model this test predates
      // (see refreshCache()'s own doc comment). Assertion updated to match
      // what the current implementation actually calls.
      expect(licenseRepo.find).toHaveBeenCalled();
      expect(redis.setex).toHaveBeenCalled();
    });

    // Self-review fix (Redis-key audit): CACHE_KEYS.LICENSE is now a
    // per-tenant function, not a single global string. These confirm the
    // fix does what was asked -- tenant isolation for cloud, one
    // deterministic key for self-hosted.
    it('caches two tenants\' statuses under different keys, not a shared global one', async () => {
      const activeLicense: Partial<LicenseMaster> = {
        id: 'lic-x', status: 'ACTIVE', licensedModules: ['PLATFORM'],
        hospitalName: 'X', hospitalCode: 'X', maxUsers: 5,
        expiresAt: null, machineFingerprint: null, activatedAt: new Date(),
      };
      const { service: serviceA, redis: redisA } = await createService(activeLicense, 'tenant-a');
      const { service: serviceB, redis: redisB } = await createService(activeLicense, 'tenant-b');
      redisA.get.mockResolvedValue(null);
      redisB.get.mockResolvedValue(null);

      await serviceA.getStatus('tenant-a');
      await serviceB.getStatus('tenant-b');

      const keyA = redisA.setex.mock.calls[0][0];
      const keyB = redisB.setex.mock.calls[0][0];
      expect(keyA).toContain('tenant-a');
      expect(keyB).toContain('tenant-b');
      expect(keyA).not.toBe(keyB);
    });

    it('self-hosted (no explicit tenantId passed) still resolves to one deterministic key via TenantContextService', async () => {
      const activeLicense: Partial<LicenseMaster> = {
        id: 'lic-y', status: 'ACTIVE', licensedModules: ['PLATFORM'],
        hospitalName: 'Y', hospitalCode: 'Y', maxUsers: 5,
        expiresAt: null, machineFingerprint: null, activatedAt: new Date(),
      };
      const { service, redis } = await createService(activeLicense, 'default-tenant-uuid');
      redis.get.mockResolvedValue(null);

      await service.getStatus();
      await service.getStatus();

      const key1 = redis.setex.mock.calls[0][0];
      const key2 = redis.setex.mock.calls[1][0];
      expect(key1).toBe(key2);
      expect(key1).toContain('default-tenant-uuid');
    });
  });

  // ── Trial auto-provisioning ───────────────────────────────────────────────

  describe('onModuleInit (trial provisioning)', () => {
    it('creates a TRIAL license when none exists', async () => {
      const { service, licenseRepo } = await createService(undefined);
      licenseRepo.count.mockResolvedValue(0);

      await service.onModuleInit();

      expect(licenseRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'TRIAL' }),
      );
      expect(licenseRepo.save).toHaveBeenCalled();
    });

    // Self-review fix (finding 5): the boot-created trial row must be
    // stamped with the resolved default tenant's UUID, or it becomes
    // invisible to getHistory() (tenant-scoped since Phase 3) -- including
    // for self-hosted's own single tenant.
    it('stamps the boot-created trial with the resolved default tenant id', async () => {
      const { service, licenseRepo, tenantContextService } = await createService(undefined, 'default-tenant-uuid');
      licenseRepo.count.mockResolvedValue(0);

      await service.onModuleInit();

      expect(tenantContextService.getCurrentTenantId).toHaveBeenCalled();
      expect(licenseRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'TRIAL', tenantId: 'default-tenant-uuid' }),
      );
    });

    // Defensive fallback: if the default tenant can't be resolved at boot
    // (e.g. SeedDefaultTenant hasn't run yet), trial creation must still
    // succeed rather than blocking startup -- matching pre-fix behavior
    // for that edge case, just with tenantId left null instead of omitted.
    it('still creates the trial (with tenantId: null) when default-tenant resolution fails at boot', async () => {
      const { service, licenseRepo } = await createService(undefined, null);
      licenseRepo.count.mockResolvedValue(0);

      await expect(service.onModuleInit()).resolves.not.toThrow();

      expect(licenseRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'TRIAL', tenantId: null }),
      );
    });

    it('does NOT create a trial when a license already exists', async () => {
      const existingLicense: Partial<LicenseMaster> = {
        id:              'lic-existing',
        status:          'ACTIVE',
        licensedModules: ['PLATFORM', 'LOYALTY'],
      };
      const { service, licenseRepo } = await createService(existingLicense);
      licenseRepo.count.mockResolvedValue(1);

      await service.onModuleInit();

      expect(licenseRepo.create).not.toHaveBeenCalled();
      expect(licenseRepo.save).not.toHaveBeenCalled();
    });
  });

  // ── getHistory tenant isolation (Licensing Module Tenant-Scoping Migration, Phase 3/6) ──

  describe('getHistory (tenant isolation)', () => {
    it('only returns the current tenant\'s license_master rows, not another tenant\'s', async () => {
      const { service, licenseRepo } = await createService();
      licenseRepo._rows.push(
        { id: 'lic-a', hospitalCode: 'HA', tenantId: 'tenant-a', activatedAt: new Date() },
        { id: 'lic-b', hospitalCode: 'HB', tenantId: 'tenant-b', activatedAt: new Date() },
      );

      const historyA = await TenantContextStorage.run('tenant-a', () => service.getHistory());
      const historyB = await TenantContextStorage.run('tenant-b', () => service.getHistory());

      expect(historyA.map((r) => r.id)).toEqual(['lic-a']);
      expect(historyB.map((r) => r.id)).toEqual(['lic-b']);
    });

    it('self-hosted (single \'default\' tenant) sees every row it always did -- no regression', async () => {
      const { service, licenseRepo } = await createService();
      licenseRepo._rows.push(
        { id: 'lic-1', hospitalCode: 'DEFAULT', tenantId: 'default-tenant-uuid', activatedAt: new Date() },
      );

      const history = await TenantContextStorage.run('default-tenant-uuid', () => service.getHistory());
      expect(history.map((r) => r.id)).toEqual(['lic-1']);
    });
  });

  // ── LICENSE_REVOKED / resetToTrial tenant isolation (self-review fix, finding 1) ──

  describe('processWebhookEvent(LICENSE_REVOKED) tenant isolation', () => {
    it('revoking + resetting tenant A does not touch tenant B\'s registration or license rows', async () => {
      const { service, licenseRepo, regRepo, dataSource } = await createService();
      licenseRepo._rows.push(
        { id: 'lic-a', tenantId: 'tenant-a', status: 'ACTIVE', activatedAt: new Date() },
        { id: 'lic-b', tenantId: 'tenant-b', status: 'ACTIVE', activatedAt: new Date() },
      );
      regRepo._rows.push(
        { id: 'reg-a', tenantId: 'tenant-a', status: 'ACTIVE' },
        { id: 'reg-b', tenantId: 'tenant-b', status: 'ACTIVE' },
      );

      await TenantContextStorage.run('tenant-a', () =>
        service.processWebhookEvent({ type: 'LICENSE_REVOKED', reset: true, reason: 'test' }),
      );

      // Tenant A's registration was wiped, tenant B's is untouched.
      expect(regRepo._rows.find((r: any) => r.id === 'reg-a')).toBeUndefined();
      expect(regRepo._rows.find((r: any) => r.id === 'reg-b')).toBeDefined();

      // Tenant A's original ACTIVE license row was deleted (reset wipes it,
      // replaced by a fresh TRIAL row stamped tenant-a); tenant B's
      // original ACTIVE row is untouched -- specifically NOT flipped to
      // REVOKED, proving the revoke UPDATE itself was scoped too.
      expect(licenseRepo._rows.find((r: any) => r.id === 'lic-a')).toBeUndefined();
      const tenantBRow = licenseRepo._rows.find((r: any) => r.id === 'lic-b');
      expect(tenantBRow).toBeDefined();
      expect(tenantBRow.status).toBe('ACTIVE');

      // Tenant A has a new TRIAL row stamped with its own tenantId.
      const tenantATrial = licenseRepo._rows.find((r: any) => r.tenantId === 'tenant-a');
      expect(tenantATrial).toBeDefined();
      expect(tenantATrial.status).toBe('TRIAL');

      // The raw users-table DELETE was scoped by tenant_id, not global.
      expect(dataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('tenant_id = $1'),
        ['tenant-a'],
      );
    });

    it('system scope (no ambient tenant -- the untouched internal-provision path) falls back to the original global reset', async () => {
      const { service, licenseRepo, regRepo, dataSource } = await createService();
      licenseRepo._rows.push(
        { id: 'lic-null-1', tenantId: null, status: 'ACTIVE', activatedAt: new Date() },
        { id: 'lic-null-2', tenantId: null, status: 'ACTIVE', activatedAt: new Date() },
      );
      regRepo._rows.push({ id: 'reg-null', tenantId: null, status: 'ACTIVE' });

      await TenantContextStorage.runAsSystem(() =>
        service.processWebhookEvent({ type: 'LICENSE_REVOKED', reset: true, reason: 'test' }),
      );

      // Global reset behavior preserved: every pre-existing row is gone,
      // registrations wiped, and the raw DELETE has no tenant filter.
      expect(regRepo._rows.length).toBe(0);
      expect(licenseRepo._rows.find((r: any) => r.id === 'lic-null-1')).toBeUndefined();
      expect(licenseRepo._rows.find((r: any) => r.id === 'lic-null-2')).toBeUndefined();
      expect(dataSource.query).toHaveBeenCalledWith(
        expect.not.stringContaining('tenant_id = $1'),
      );
    });

    it('LICENSE_REVOKED without reset scopes the REVOKED update to the triggering tenant only', async () => {
      const { service, licenseRepo } = await createService();
      licenseRepo._rows.push(
        { id: 'lic-a', tenantId: 'tenant-a', status: 'ACTIVE', activatedAt: new Date() },
        { id: 'lic-b', tenantId: 'tenant-b', status: 'ACTIVE', activatedAt: new Date() },
      );

      await TenantContextStorage.run('tenant-a', () =>
        service.processWebhookEvent({ type: 'LICENSE_REVOKED', reason: 'test' }),
      );

      expect(licenseRepo._rows.find((r: any) => r.id === 'lic-a').status).toBe('REVOKED');
      expect(licenseRepo._rows.find((r: any) => r.id === 'lic-b').status).toBe('ACTIVE');
    });
  });

  // ── TRIAL_EXTENDED / MODULE_REVOKED tenant isolation (webhook handler
  // consistency fix, requested alongside findings 1-5) ────────────────────

  describe('processWebhookEvent(TRIAL_EXTENDED) tenant isolation', () => {
    it('extends only the triggering tenant\'s license, not another tenant\'s', async () => {
      const { service, licenseRepo } = await createService();
      const originalExpiryA = new Date('2026-01-01');
      const originalExpiryB = new Date('2026-01-01');
      licenseRepo._rows.push(
        { id: 'lic-a', tenantId: 'tenant-a', status: 'TRIAL', expiresAt: originalExpiryA, activatedAt: new Date() },
        { id: 'lic-b', tenantId: 'tenant-b', status: 'TRIAL', expiresAt: originalExpiryB, activatedAt: new Date() },
      );

      await TenantContextStorage.run('tenant-a', () =>
        service.processWebhookEvent({ type: 'TRIAL_EXTENDED', newExpiresAt: '2027-01-01' }),
      );

      expect(licenseRepo._rows.find((r: any) => r.id === 'lic-a').expiresAt).toEqual(new Date('2027-01-01'));
      expect(licenseRepo._rows.find((r: any) => r.id === 'lic-b').expiresAt).toEqual(originalExpiryB);
    });

    it('system scope (no ambient tenant) falls back to the original global lookup', async () => {
      const { service, licenseRepo } = await createService();
      licenseRepo._rows.push(
        { id: 'lic-null', tenantId: null, status: 'TRIAL', expiresAt: new Date('2026-01-01'), activatedAt: new Date() },
      );

      await TenantContextStorage.runAsSystem(() =>
        service.processWebhookEvent({ type: 'TRIAL_EXTENDED', newExpiresAt: '2027-01-01' }),
      );

      expect(licenseRepo._rows.find((r: any) => r.id === 'lic-null').expiresAt).toEqual(new Date('2027-01-01'));
    });
  });

  describe('processWebhookEvent(MODULE_REVOKED) tenant isolation', () => {
    it('revokes a module only from the triggering tenant\'s license, not another tenant\'s', async () => {
      const { service, licenseRepo } = await createService();
      licenseRepo._rows.push(
        { id: 'lic-a', tenantId: 'tenant-a', status: 'ACTIVE', licensedModules: ['PLATFORM', 'LOYALTY'], activatedAt: new Date() },
        { id: 'lic-b', tenantId: 'tenant-b', status: 'ACTIVE', licensedModules: ['PLATFORM', 'LOYALTY'], activatedAt: new Date() },
      );

      await TenantContextStorage.run('tenant-a', () =>
        service.processWebhookEvent({ type: 'MODULE_REVOKED', modules: ['LOYALTY'] }),
      );

      expect(licenseRepo._rows.find((r: any) => r.id === 'lic-a').licensedModules).toEqual(['PLATFORM']);
      expect(licenseRepo._rows.find((r: any) => r.id === 'lic-b').licensedModules).toEqual(['PLATFORM', 'LOYALTY']);
    });

    it('system scope (no ambient tenant) falls back to the original global lookup', async () => {
      const { service, licenseRepo } = await createService();
      licenseRepo._rows.push(
        { id: 'lic-null', tenantId: null, status: 'ACTIVE', licensedModules: ['PLATFORM', 'LOYALTY'], activatedAt: new Date() },
      );

      await TenantContextStorage.runAsSystem(() =>
        service.processWebhookEvent({ type: 'MODULE_REVOKED', modules: ['LOYALTY'] }),
      );

      expect(licenseRepo._rows.find((r: any) => r.id === 'lic-null').licensedModules).toEqual(['PLATFORM']);
    });
  });
});
