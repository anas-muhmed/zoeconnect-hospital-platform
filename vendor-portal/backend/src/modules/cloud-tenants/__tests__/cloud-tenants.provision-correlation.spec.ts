import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { CloudTenantsService } from '../cloud-tenants.service';
import { CloudTenant } from '../entities/cloud-tenant.entity';
import { Hospital } from '../../hospitals/entities/hospital.entity';

/**
 * ZoeConnect Identity Architecture Migration -- workflow tests for
 * `CloudTenantsService.provision()`'s retry/resume correlation logic,
 * added at the user's explicit request before merging this branch.
 *
 * Real incident (2026-07-30): Phase 6 correlated "is this a retry of a
 * failed attempt" by `adminEmail` alone (subdomain is no longer a reliable
 * per-organization identity anchor). This vendor portal's own test/demo
 * workflow reuses the same generic admin email across many DIFFERENT
 * hospital names, so a brand-new, unrelated hospital's provisioning
 * request got silently treated as a *retry* of an older, unrelated
 * hospital's failed run -- `resumeHdspProvisioning()` reused that old run,
 * whose `create_super_admin_user` step had already succeeded, so ZoeConnect
 * skipped re-creating the admin entirely. The Vendor Portal still displayed
 * a fresh temp password and a success banner for a completely different
 * account than the one actually left behind.
 *
 * Fix under test: correlation now requires BOTH `adminEmail` AND
 * `hospitalName` to match. These tests exercise the REAL
 * `CloudTenantsService.provision()` method (not a re-implementation of its
 * logic) against a small in-memory fake `cloud_tenants` table and a mocked
 * `fetch` standing in for the real ZoeConnect backend, asserting which HTTP
 * endpoint (fresh provision vs. resume of a specific prior run) actually
 * gets called for each scenario.
 */
describe('CloudTenantsService.provision() -- retry/resume correlation', () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env = { ...originalEnv, HDSP_BACKEND_URL: 'http://hdsp.test', HDSP_PROVISIONING_API_KEY: 'test-key' };
  });

  afterEach(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  // ── Fake in-memory `cloud_tenants` repository ──────────────────────────
  // Mirrors just enough of TypeORM's Repository/QueryBuilder surface for
  // provision() to run against real data instead of canned per-call return
  // values -- close to a genuine integration test without needing a real
  // Postgres for this backend's own small local table.
  function makeCloudTenantRepo(seed: Array<Partial<CloudTenant>> = []) {
    const rows: CloudTenant[] = seed.map((r, i) => ({
      id: r.id ?? `seed-${i}`,
      hospitalName: r.hospitalName!,
      subdomain: r.subdomain ?? null,
      subdomainReleasedAt: r.subdomainReleasedAt ?? null,
      hdspTenantId: r.hdspTenantId ?? null,
      instanceSecret: r.instanceSecret ?? null,
      instanceToken: r.instanceToken ?? null,
      adminUsername: r.adminUsername!,
      adminEmail: r.adminEmail!,
      loginUrl: r.loginUrl ?? null,
      provisioningStatus: r.provisioningStatus ?? 'PENDING',
      provisionedAt: r.provisionedAt ?? null,
      provisioningRunId: r.provisioningRunId ?? null,
      subscriptionPlan: r.subscriptionPlan ?? null,
      failureReason: r.failureReason ?? null,
      createdAt: r.createdAt ?? new Date(),
      updatedAt: r.updatedAt ?? new Date(),
    } as CloudTenant));

    const repo = {
      createQueryBuilder: jest.fn(() => {
        const params: Record<string, unknown> = {};
        const qb: any = {
          where: (_cond: string, p: Record<string, unknown>) => { Object.assign(params, p); return qb; },
          andWhere: (_cond: string, p: Record<string, unknown>) => { Object.assign(params, p); return qb; },
          orderBy: () => qb,
          getOne: async () => {
            const email = String(params.email ?? '').toLowerCase();
            const hospitalName = params.hospitalName as string | undefined;
            const matches = rows
              .filter((r) => r.adminEmail.toLowerCase() === email && r.hospitalName === hospitalName)
              .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
            return matches[0] ?? null;
          },
        };
        return qb;
      }),
      create: jest.fn((v: Partial<CloudTenant>) => ({ ...v })),
      save: jest.fn(async (v: CloudTenant) => {
        if (!v.id) {
          v.id = `created-${rows.length}`;
          v.createdAt = v.createdAt ?? new Date();
          rows.push(v);
          return v;
        }
        const idx = rows.findIndex((r) => r.id === v.id);
        if (idx >= 0) {
          rows[idx] = { ...rows[idx], ...v };
          return rows[idx];
        }
        rows.push(v);
        return v;
      }),
      findOne: jest.fn(async ({ where }: any) => rows.find((r) => r.id === where?.id) ?? null),
    };
    return repo;
  }

  async function createService(cloudTenantRepo: ReturnType<typeof makeCloudTenantRepo>) {
    const hospitalRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((v: any) => v),
      save: jest.fn(async (v: any) => v),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CloudTenantsService,
        { provide: getRepositoryToken(CloudTenant), useValue: cloudTenantRepo },
        { provide: getRepositoryToken(Hospital), useValue: hospitalRepo },
      ],
    }).compile();

    return { service: module.get(CloudTenantsService), hospitalRepo };
  }

  function jsonResponse(body: unknown, ok = true, status = 200) {
    return { ok, status, json: async () => body, text: async () => JSON.stringify(body) };
  }

  function summaryBody(tenantId: string, adminUsername: string) {
    return {
      run: { id: 'irrelevant-for-these-tests', status: 'completed' },
      summary: {
        tenantId, subdomain: null, adminUsername,
        loginUrl: 'https://zoeconnect.in/sign-in', status: 'completed', instanceSecret: null,
      },
    };
  }

  /**
   * Dispatches based on URL shape, and records which kind of call happened
   * so each test can assert exactly one of "fresh provision" / "resume of
   * run X" / "availability check" occurred -- never both a resume AND a
   * fresh provision in the same test run.
   */
  function mockFetch(opts: {
    onCheckAvailability?: () => unknown;
    onFreshProvision?: () => unknown;
    onResume?: (runId: string) => unknown;
  }) {
    const calls = { freshProvision: false, resumedRunId: null as string | null, checkedAvailability: false };

    global.fetch = jest.fn(async (url: string) => {
      if (url.endsWith('/api/v1/platform/tenant-provisioning/check-availability')) {
        calls.checkedAvailability = true;
        return jsonResponse(opts.onCheckAvailability?.() ?? { canProceed: true, fields: {} });
      }
      const resumeMatch = url.match(/\/tenant-provisioning\/([^/]+)\/resume$/);
      if (resumeMatch) {
        calls.resumedRunId = resumeMatch[1];
        return jsonResponse(opts.onResume?.(resumeMatch[1]) ?? summaryBody('t-resumed', 'resumed-admin'));
      }
      if (url.endsWith('/api/v1/platform/tenant-provisioning')) {
        calls.freshProvision = true;
        return jsonResponse(opts.onFreshProvision?.() ?? summaryBody('t-fresh', 'fresh-admin'));
      }
      throw new Error(`Unexpected fetch URL in test: ${url}`);
    }) as any;

    return calls;
  }

  // ── Scenario 4 ──────────────────────────────────────────────────────────
  it('retry with the same hospital and same admin email resumes the correct provisioning run', async () => {
    const cloudTenantRepo = makeCloudTenantRepo([
      {
        id: 'row-1',
        hospitalName: 'Apollo Multi-Specialty',
        adminEmail: 'admin@apollo.test',
        adminUsername: 'apolloadmin',
        provisioningStatus: 'FAILED',
        provisioningRunId: 'run-apollo-1',
        createdAt: new Date('2026-07-01'),
      },
    ]);
    const { service } = await createService(cloudTenantRepo);
    const calls = mockFetch({
      onResume: (runId) => summaryBody('t-apollo', 'apolloadmin'),
    });

    const result = await service.provision({
      hospitalName: 'Apollo Multi-Specialty',
      adminUsername: 'apolloadmin',
      adminEmail: 'admin@apollo.test',
    } as any);

    expect(calls.resumedRunId).toBe('run-apollo-1');
    expect(calls.freshProvision).toBe(false);
    // Availability is skipped when resuming -- the identity is EXPECTED to
    // already exist on ZoeConnect's side (this same run's own attempt).
    expect(calls.checkedAvailability).toBe(false);
    expect(result.provisioningStatus).toBe('ACTIVE');
    expect(result.hdspTenantId).toBe('t-apollo');
  });

  // ── Scenario 5 ──────────────────────────────────────────────────────────
  it('a different hospital reusing the same admin email creates a new provisioning run, not a resume', async () => {
    const cloudTenantRepo = makeCloudTenantRepo([
      {
        id: 'row-1',
        hospitalName: 'MOSC Hospital',
        adminEmail: 'shared.test@vendor.local',
        adminUsername: 'moscadmin',
        provisioningStatus: 'FAILED',
        provisioningRunId: 'run-mosc-1',
        createdAt: new Date('2026-07-01'),
      },
    ]);
    const { service } = await createService(cloudTenantRepo);
    const calls = mockFetch({
      onFreshProvision: () => summaryBody('t-mitera', 'miteraadmin'),
    });

    const result = await service.provision({
      hospitalName: 'MITERA Hospital',
      adminUsername: 'miteraadmin',
      adminEmail: 'shared.test@vendor.local',
    } as any);

    expect(calls.freshProvision).toBe(true);
    expect(calls.resumedRunId).toBeNull();
    expect(result.provisioningStatus).toBe('ACTIVE');
    expect(result.hdspTenantId).toBe('t-mitera');
  });

  // ── Scenario 6 ──────────────────────────────────────────────────────────
  it('the same hospital name with a different admin email creates a new provisioning run, not a resume', async () => {
    const cloudTenantRepo = makeCloudTenantRepo([
      {
        id: 'row-1',
        hospitalName: 'Apollo Multi-Specialty',
        adminEmail: 'admin@apollo.test',
        adminUsername: 'apolloadmin',
        provisioningStatus: 'FAILED',
        provisioningRunId: 'run-apollo-1',
        createdAt: new Date('2026-07-01'),
      },
    ]);
    const { service } = await createService(cloudTenantRepo);
    const calls = mockFetch({
      onFreshProvision: () => summaryBody('t-apollo-2', 'newadmin'),
    });

    const result = await service.provision({
      hospitalName: 'Apollo Multi-Specialty',
      adminUsername: 'newadmin',
      adminEmail: 'different@apollo.test',
    } as any);

    expect(calls.freshProvision).toBe(true);
    expect(calls.resumedRunId).toBeNull();
    expect(result.provisioningStatus).toBe('ACTIVE');
    expect(result.hdspTenantId).toBe('t-apollo-2');
  });

  // ── Adjacent guard, same code path ──────────────────────────────────────
  it('blocks provisioning outright when the same hospital + admin email already has a non-FAILED (live) cloud tenant', async () => {
    const cloudTenantRepo = makeCloudTenantRepo([
      {
        id: 'row-1',
        hospitalName: 'Apollo Multi-Specialty',
        adminEmail: 'admin@apollo.test',
        adminUsername: 'apolloadmin',
        provisioningStatus: 'ACTIVE',
        provisioningRunId: 'run-apollo-1',
        createdAt: new Date('2026-07-01'),
      },
    ]);
    const { service } = await createService(cloudTenantRepo);
    mockFetch({});

    await expect(
      service.provision({
        hospitalName: 'Apollo Multi-Specialty',
        adminUsername: 'apolloadmin',
        adminEmail: 'admin@apollo.test',
      } as any),
    ).rejects.toThrow(BadRequestException);
  });
});
