import { NotFoundException } from '@nestjs/common';
import { LicenseController } from '../license.controller';

/**
 * D.6 ("production publication lifecycle," 2026-07-22) tests for the two
 * new permanent, authenticated manual-operation endpoints. Constructed
 * directly (same convention as `license.controller.internal-provision.spec.ts`)
 * since these methods don't depend on the guard stack to exercise their
 * own logic -- only real HTTP-level tests would prove the guards
 * themselves reject unauthorized callers, which is `PermissionsGuard`'s
 * own responsibility, already covered by its own test suite.
 */
function buildController(opts: {
  publishFull?: jest.Mock;
  findConnectorIdForTenant?: jest.Mock;
} = {}) {
  const hisQueryDefinitionPublisher = {
    publishFull: opts.publishFull ?? jest.fn().mockResolvedValue({
      tenantId: 'tenant-1', changedQueryIds: ['patient.getByMrn'], skippedQueryIds: [], pushed: true,
    }),
  };
  const connectorDirectory = {
    findConnectorIdForTenant: opts.findConnectorIdForTenant ?? jest.fn().mockResolvedValue('connector-1'),
  };
  const auditService = { log: jest.fn().mockResolvedValue(undefined) };

  const controller = new LicenseController(
    {} as any, // licenseService
    {} as any, // vendorSyncService
    {} as any, // hisConfigService
    hisQueryDefinitionPublisher as any,
    {} as any, // oraclePoolService
    {} as any, // settingsService
    {} as any, // config
    auditService as any,
    connectorDirectory as any,
  );

  return { controller, hisQueryDefinitionPublisher, connectorDirectory, auditService };
}

const ACTOR = { id: 'user-1' } as any;

describe('LicenseController.republishHisQueryDefinitions', () => {
  it('calls publishFull(tenantId) and returns the summary', async () => {
    const { controller, hisQueryDefinitionPublisher } = buildController();

    const result = await controller.republishHisQueryDefinitions('tenant-1', ACTOR);

    expect(hisQueryDefinitionPublisher.publishFull).toHaveBeenCalledWith('tenant-1');
    expect(result).toEqual(expect.objectContaining({ ok: true, tenantId: 'tenant-1', pushed: true }));
  });

  it('writes an audit log entry with the actor, tenant, and publish summary', async () => {
    const { controller, auditService } = buildController();

    await controller.republishHisQueryDefinitions('tenant-1', ACTOR);

    expect(auditService.log).toHaveBeenCalledWith(expect.objectContaining({
      action: 'HIS_QUERY_DEFINITIONS_REPUBLISHED',
      module: 'PLATFORM',
      userId: 'user-1',
      entityType: 'tenant',
      entityId: 'tenant-1',
    }));
  });
});

describe('LicenseController.resyncConnector', () => {
  it('throws NotFoundException when the tenant has no registered Connector', async () => {
    const { controller } = buildController({
      findConnectorIdForTenant: jest.fn().mockResolvedValue(null),
    });

    await expect(controller.resyncConnector('tenant-1', ACTOR)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('calls publishFull(tenantId, connectorId) and returns the summary with connectorId', async () => {
    const { controller, hisQueryDefinitionPublisher } = buildController();

    const result = await controller.resyncConnector('tenant-1', ACTOR);

    expect(hisQueryDefinitionPublisher.publishFull).toHaveBeenCalledWith('tenant-1', 'connector-1');
    expect(result).toEqual(expect.objectContaining({ ok: true, connectorId: 'connector-1', pushed: true }));
  });

  it('writes an audit log entry distinct from republish (CONNECTOR_RESYNC_TRIGGERED)', async () => {
    const { controller, auditService } = buildController();

    await controller.resyncConnector('tenant-1', ACTOR);

    expect(auditService.log).toHaveBeenCalledWith(expect.objectContaining({
      action: 'CONNECTOR_RESYNC_TRIGGERED',
      module: 'PLATFORM',
      userId: 'user-1',
      entityType: 'connector',
      entityId: 'connector-1',
    }));
  });

  it('does not call publishFull at all when no Connector is registered', async () => {
    const { controller, hisQueryDefinitionPublisher } = buildController({
      findConnectorIdForTenant: jest.fn().mockResolvedValue(null),
    });

    await expect(controller.resyncConnector('tenant-1', ACTOR)).rejects.toThrow();
    expect(hisQueryDefinitionPublisher.publishFull).not.toHaveBeenCalled();
  });
});
