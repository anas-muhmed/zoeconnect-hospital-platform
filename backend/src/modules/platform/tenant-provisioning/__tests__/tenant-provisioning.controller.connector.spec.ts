import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';
import { TenantProvisioningController } from '../tenant-provisioning.controller';
import { TenantProvisioningService } from '../tenant-provisioning.service';
import { ConnectorDirectoryService } from '../../connector/connector-directory.service';
import { ConnectorGateway } from '../../connector/connector.gateway';
import { AuditService } from '../../../audit/audit.service';
import { HisQueryDefinitionPublisherService } from '../../../his/config/his-query-definition-publisher.service';

/**
 * Task #102 ("Vendor Portal Connector Management," 2026-07-22) -- tests for
 * the new Connector-admin surface added to TenantProvisioningController:
 * republish/resync (thin delegation to HisQueryDefinitionPublisherService,
 * both audit-logged), the activity read, the installer-info read, and the
 * actor-resolution helper both mutation endpoints rely on
 * (SUPER_ADMIN-JWT user vs. Vendor Portal API-key caller). The pre-existing
 * provisioning-flow endpoints (provision/resume/deprovision/etc.) are
 * intentionally not re-tested here -- no test file existed for this
 * controller before this task; scope is the new surface only.
 */
describe('TenantProvisioningController -- Connector Management (Task #102)', () => {
  async function createController(overrides: { config?: Record<string, string> } = {}) {
    const provisioningService = {
      regenerateConnectorActivationCode: jest.fn(),
    };
    const connectorDirectory = {
      findInstanceForTenant: jest.fn(),
      findConnectorIdForTenant: jest.fn(),
    };
    const connectorGateway = { isConnected: jest.fn() };
    const auditService = { log: jest.fn().mockResolvedValue(undefined), findRecentForTenant: jest.fn() };
    const publisher = { publishFull: jest.fn(), getDefinitionsSummary: jest.fn() };
    const configValues: Record<string, string> = overrides.config ?? {};
    const config = { get: jest.fn((key: string, def?: string) => configValues[key] ?? def) };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TenantProvisioningController],
      providers: [
        { provide: TenantProvisioningService, useValue: provisioningService },
        { provide: ConnectorDirectoryService, useValue: connectorDirectory },
        { provide: ConnectorGateway, useValue: connectorGateway },
        { provide: AuditService, useValue: auditService },
        { provide: HisQueryDefinitionPublisherService, useValue: publisher },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    return {
      controller: module.get(TenantProvisioningController),
      provisioningService, connectorDirectory, connectorGateway, auditService, publisher,
    };
  }

  describe('republishConnectorDefinitions', () => {
    it('delegates to publishFull(tenantId) and audit-logs with the SUPER_ADMIN actor id', async () => {
      const { controller, publisher, auditService } = await createController();
      publisher.publishFull.mockResolvedValue({ tenantId: 't1', changedQueryIds: ['a'], skippedQueryIds: [], pushed: true });

      const result = await controller.republishConnectorDefinitions('t1', { id: 'user-1' } as any, {});

      expect(publisher.publishFull).toHaveBeenCalledWith('t1');
      expect(result).toEqual({ ok: true, tenantId: 't1', changedQueryIds: ['a'], skippedQueryIds: [], pushed: true });
      expect(auditService.log).toHaveBeenCalledWith(expect.objectContaining({
        action: 'HIS_QUERY_DEFINITIONS_REPUBLISHED',
        userId: 'user-1',
        entityId: 't1',
      }));
    });

    it('audit-logs with the vendor-portal actor label when no JWT user is present', async () => {
      const { controller, publisher, auditService } = await createController();
      publisher.publishFull.mockResolvedValue({ tenantId: 't1', changedQueryIds: [], skippedQueryIds: [], pushed: false });

      await controller.republishConnectorDefinitions('t1', undefined, { isVendorPortal: true });

      expect(auditService.log).toHaveBeenCalledWith(expect.objectContaining({
        userId: undefined,
        metadata: expect.objectContaining({ triggeredBy: 'vendor-portal' }),
      }));
    });
  });

  describe('resyncConnector', () => {
    it('throws NotFoundException when the tenant has no registered connector', async () => {
      const { controller, connectorDirectory } = await createController();
      connectorDirectory.findConnectorIdForTenant.mockResolvedValue(null);

      await expect(controller.resyncConnector('t1', { id: 'user-1' } as any, {}))
        .rejects.toThrow(NotFoundException);
    });

    it('publishes to the resolved connectorId and audit-logs against it', async () => {
      const { controller, connectorDirectory, publisher, auditService } = await createController();
      connectorDirectory.findConnectorIdForTenant.mockResolvedValue('connector-1');
      publisher.publishFull.mockResolvedValue({ tenantId: 't1', changedQueryIds: [], skippedQueryIds: [], pushed: true });

      const result = await controller.resyncConnector('t1', { id: 'user-1' } as any, {});

      expect(publisher.publishFull).toHaveBeenCalledWith('t1', 'connector-1');
      expect(result).toEqual(expect.objectContaining({ ok: true, connectorId: 'connector-1' }));
      expect(auditService.log).toHaveBeenCalledWith(expect.objectContaining({
        action: 'CONNECTOR_RESYNC_TRIGGERED',
        entityType: 'connector',
        entityId: 'connector-1',
      }));
    });
  });

  describe('regenerateConnectorActivationCode', () => {
    it('delegates to the service and audit-logs without leaking the raw activation code', async () => {
      const { controller, provisioningService, auditService } = await createController();
      provisioningService.regenerateConnectorActivationCode.mockResolvedValue({
        pairingId: 'pairing-1', activationCode: 'ABCD-EFGH-JKLM', status: 'pending', expiresAt: '2026-07-25T00:00:00Z',
      });

      const result = await controller.regenerateConnectorActivationCode('t1', { id: 'user-1' } as any, {});

      expect(result.activationCode).toBe('ABCD-EFGH-JKLM'); // still returned to the caller once
      const loggedCall = auditService.log.mock.calls[0][0];
      expect(JSON.stringify(loggedCall)).not.toContain('ABCD-EFGH-JKLM'); // never persisted to the audit trail
      expect(loggedCall.action).toBe('CONNECTOR_ACTIVATION_CODE_REGENERATED');
    });
  });

  describe('getConnectorStatus', () => {
    it('returns registered:false with no definitions lookup when no instance exists', async () => {
      const { controller, connectorDirectory, publisher } = await createController();
      connectorDirectory.findInstanceForTenant.mockResolvedValue(null);

      const result = await controller.getConnectorStatus('t1');

      expect(result).toEqual({ registered: false });
      expect(publisher.getDefinitionsSummary).not.toHaveBeenCalled();
    });

    it('includes the definitions health summary when an instance exists', async () => {
      const { controller, connectorDirectory, connectorGateway, publisher } = await createController();
      connectorDirectory.findInstanceForTenant.mockResolvedValue({
        id: 'connector-1', status: 'online', hostname: 'host-1', version: null,
        lastHeartbeatAt: null, createdAt: new Date('2026-07-01T00:00:00Z'),
      });
      connectorGateway.isConnected.mockReturnValue(true);
      publisher.getDefinitionsSummary.mockResolvedValue({ definitionCount: 8, lastCompiledAt: '2026-07-20T00:00:00Z' });

      const result = await controller.getConnectorStatus('t1');

      expect(result).toEqual(expect.objectContaining({
        registered: true,
        connectorId: 'connector-1',
        isConnected: true,
        definitions: { definitionCount: 8, lastCompiledAt: '2026-07-20T00:00:00Z' },
      }));
    });
  });

  describe('getConnectorActivity', () => {
    it('queries AuditService scoped to the connector-lifecycle action set', async () => {
      const { controller, auditService } = await createController();
      auditService.findRecentForTenant.mockResolvedValue([
        { id: '1', action: 'CONNECTOR_RESYNC_TRIGGERED', entityType: 'connector', entityId: 'connector-1', newValue: {}, metadata: {}, createdAt: new Date() },
      ]);

      const result = await controller.getConnectorActivity('t1', undefined);

      expect(auditService.findRecentForTenant).toHaveBeenCalledWith('t1', {
        actions: ['HIS_QUERY_DEFINITIONS_REPUBLISHED', 'CONNECTOR_RESYNC_TRIGGERED', 'CONNECTOR_ACTIVATION_CODE_REGENERATED'],
        limit: 50,
      });
      expect(result).toHaveLength(1);
    });

    it('clamps an out-of-range limit query param to [1, 200]', async () => {
      const { controller, auditService } = await createController();
      auditService.findRecentForTenant.mockResolvedValue([]);

      await controller.getConnectorActivity('t1', '99999');

      expect(auditService.findRecentForTenant).toHaveBeenCalledWith('t1', expect.objectContaining({ limit: 200 }));
    });
  });

  describe('getConnectorInstaller', () => {
    it('reports unavailable when no download URL is configured', async () => {
      const { controller } = await createController({ config: {} });
      expect(controller.getConnectorInstaller()).toEqual({ available: false });
    });

    it('reports version/downloadUrl when configured', async () => {
      const { controller } = await createController({
        config: {
          'deployment.connectorInstallerVersion': '1.2.0',
          'deployment.connectorInstallerDownloadUrl': 'https://cdn.example.com/hdsp-connector-1.2.0.exe',
        },
      });
      expect(controller.getConnectorInstaller()).toEqual({
        available: true,
        version: '1.2.0',
        downloadUrl: 'https://cdn.example.com/hdsp-connector-1.2.0.exe',
        releaseNotes: null,
      });
    });
  });
});
