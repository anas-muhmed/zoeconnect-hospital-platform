import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { CloudTenantsService } from '../cloud-tenants.service';
import { CloudTenant } from '../entities/cloud-tenant.entity';
import { Hospital } from '../../hospitals/entities/hospital.entity';

/**
 * Task #102 ("Vendor Portal Connector Management," 2026-07-22) -- tests for
 * the Connector-proxy methods added to `CloudTenantsService`. No test
 * infrastructure (jest wasn't even a devDependency) existed anywhere in
 * this backend before this task -- see package.json's new "jest"
 * devDependencies/config block, added alongside this file so these tests
 * are actually runnable, not just written. Scope here is the new
 * Connector methods only; `provision()`/`deprovision()`/etc. are
 * untouched by this task and not retroactively tested.
 */
describe('CloudTenantsService -- Connector Management proxy methods', () => {
  const TENANT = {
    id: 'local-tenant-1',
    hdspTenantId: 'hdsp-tenant-1',
  } as CloudTenant;

  async function createService() {
    const cloudTenantRepo = { findOne: jest.fn().mockResolvedValue(TENANT) };
    const hospitalRepo = { findOne: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CloudTenantsService,
        { provide: getRepositoryToken(CloudTenant), useValue: cloudTenantRepo },
        { provide: getRepositoryToken(Hospital), useValue: hospitalRepo },
      ],
    }).compile();

    return { service: module.get(CloudTenantsService), cloudTenantRepo };
  }

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

  function mockFetchOnce(body: unknown, ok = true, status = 200) {
    global.fetch = jest.fn().mockResolvedValue({
      ok,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    }) as any;
  }

  it('getConnectorStatus() proxies to the ZoeConnect tenant-scoped connector-status route', async () => {
    mockFetchOnce({ registered: false });
    const { service } = await createService();

    const result = await service.getConnectorStatus('local-tenant-1');

    expect(result).toEqual({ registered: false });
    expect(global.fetch).toHaveBeenCalledWith(
      'http://hdsp.test/api/v1/platform/tenant-provisioning/tenants/hdsp-tenant-1/connector',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('getConnectorActivity() appends a limit query param when given', async () => {
    mockFetchOnce([]);
    const { service } = await createService();

    await service.getConnectorActivity('local-tenant-1', 20);

    expect(global.fetch).toHaveBeenCalledWith(
      'http://hdsp.test/api/v1/platform/tenant-provisioning/tenants/hdsp-tenant-1/connector/activity?limit=20',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('republishConnectorDefinitions() POSTs to the republish route', async () => {
    mockFetchOnce({ ok: true, tenantId: 'hdsp-tenant-1', changedQueryIds: [], skippedQueryIds: [], pushed: true });
    const { service } = await createService();

    const result = await service.republishConnectorDefinitions('local-tenant-1');

    expect(result.pushed).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      'http://hdsp.test/api/v1/platform/tenant-provisioning/tenants/hdsp-tenant-1/connector/republish',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('resyncConnector() POSTs to the resync route', async () => {
    mockFetchOnce({ ok: true, connectorId: 'connector-1', tenantId: 'hdsp-tenant-1', changedQueryIds: [], skippedQueryIds: [], pushed: true });
    const { service } = await createService();

    const result = await service.resyncConnector('local-tenant-1');

    expect(result.connectorId).toBe('connector-1');
    expect(global.fetch).toHaveBeenCalledWith(
      'http://hdsp.test/api/v1/platform/tenant-provisioning/tenants/hdsp-tenant-1/connector/resync',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('regenerateConnectorActivationCode() POSTs to the activation-code regenerate route and returns the code once', async () => {
    mockFetchOnce({ pairingId: 'p1', activationCode: 'ABCD-EFGH-JKLM', status: 'pending', expiresAt: '2026-07-25T00:00:00Z' });
    const { service } = await createService();

    const result = await service.regenerateConnectorActivationCode('local-tenant-1');

    expect(result.activationCode).toBe('ABCD-EFGH-JKLM');
    expect(global.fetch).toHaveBeenCalledWith(
      'http://hdsp.test/api/v1/platform/tenant-provisioning/tenants/hdsp-tenant-1/connector-activation-code/regenerate',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('getConnectorInstaller() is not tenant-scoped -- never resolves a CloudTenant row', async () => {
    mockFetchOnce({ available: false });
    const { service, cloudTenantRepo } = await createService();

    const result = await service.getConnectorInstaller();

    expect(result).toEqual({ available: false });
    expect(cloudTenantRepo.findOne).not.toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledWith(
      'http://hdsp.test/api/v1/platform/tenant-provisioning/connector-installer',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('rejects with a clear error when the local tenant row has no hdspTenantId yet', async () => {
    const { service, cloudTenantRepo } = await createService();
    cloudTenantRepo.findOne.mockResolvedValue({ id: 'local-tenant-2', hdspTenantId: null } as CloudTenant);

    await expect(service.getConnectorStatus('local-tenant-2')).rejects.toThrow(BadRequestException);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
