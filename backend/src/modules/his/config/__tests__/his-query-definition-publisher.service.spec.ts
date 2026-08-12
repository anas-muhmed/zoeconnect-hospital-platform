import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bull';
import { HisQueryDefinitionPublisherService } from '../his-query-definition-publisher.service';
import { HisQueryTemplateCompiler } from '../his-query-template-compiler.service';
import { HisQueryDefinition } from '../entities/his-query-definition.entity';
import { ConnectorDirectoryService } from '../../../platform/connector/connector-directory.service';
import { ConnectorGateway } from '../../../platform/connector/connector.gateway';
import { QUEUE_NAMES } from '../../../../config/redis.config';

/**
 * D.6 ("production publication lifecycle," 2026-07-22) tests for the two
 * new durable-enqueue methods and the connector-reconnect trigger's
 * switch from a direct `publishFull()` call to `enqueuePublishFull()`.
 * `publish()`'s own compile/persist/push behavior is unchanged by D.6 and
 * isn't re-tested here.
 */
describe('HisQueryDefinitionPublisherService (D.6 enqueue methods)', () => {
  function makeGateway() {
    return {
      events: { on: jest.fn(), emit: jest.fn() },
      isConnected: jest.fn().mockReturnValue(false),
      pushTemplateSync: jest.fn(),
    };
  }

  async function createService() {
    const queue = { add: jest.fn().mockResolvedValue({ id: 'job-1' }) };
    const gateway = makeGateway();
    const compiler = { listQueryIds: jest.fn().mockReturnValue([]) };
    const repo = { findOne: jest.fn(), upsert: jest.fn(), find: jest.fn().mockResolvedValue([]) };
    const connectorDirectory = { findConnectorIdForTenant: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HisQueryDefinitionPublisherService,
        { provide: HisQueryTemplateCompiler, useValue: compiler },
        { provide: getRepositoryToken(HisQueryDefinition), useValue: repo },
        { provide: ConnectorDirectoryService, useValue: connectorDirectory },
        { provide: ConnectorGateway, useValue: gateway },
        { provide: getQueueToken(QUEUE_NAMES.HIS_QUERY_PUBLISH), useValue: queue },
      ],
    }).compile();

    return { service: module.get(HisQueryDefinitionPublisherService), queue, gateway, repo };
  }

  it('enqueuePublishFull() adds a publish-full job with tenantId/connectorId', async () => {
    const { service, queue } = await createService();
    await service.enqueuePublishFull('tenant-1', 'connector-1');
    expect(queue.add).toHaveBeenCalledWith('publish-full', { tenantId: 'tenant-1', connectorId: 'connector-1' });
  });

  it('enqueuePublishFull() omits connectorId when not given', async () => {
    const { service, queue } = await createService();
    await service.enqueuePublishFull('tenant-1');
    expect(queue.add).toHaveBeenCalledWith('publish-full', { tenantId: 'tenant-1', connectorId: undefined });
  });

  it('enqueuePublishChanged() adds a publish-changed job with tenantId', async () => {
    const { service, queue } = await createService();
    await service.enqueuePublishChanged('tenant-1');
    expect(queue.add).toHaveBeenCalledWith('publish-changed', { tenantId: 'tenant-1' });
  });

  it('the connector-reconnect ("connected") handler enqueues publish-full rather than calling publishFull() directly', async () => {
    const { service, queue, gateway } = await createService();

    // onModuleInit() registered a listener on gateway.events -- invoke it
    // the same way ConnectorGateway would on a real reconnect.
    const onConnected = gateway.events.on.mock.calls.find(([event]: [string]) => event === 'connected')![1];
    await onConnected({ connectorId: 'connector-1', tenantId: 'tenant-1' });

    expect(queue.add).toHaveBeenCalledWith('publish-full', { tenantId: 'tenant-1', connectorId: 'connector-1' });
    expect(service).toBeDefined();
  });
});

/**
 * Task #102 ("Vendor Portal Connector Management," 2026-07-22) --
 * `getDefinitionsSummary()`'s own tests. Separate `describe` block since
 * it's a read-only method with no relationship to the enqueue/publish
 * machinery above.
 */
describe('HisQueryDefinitionPublisherService.getDefinitionsSummary', () => {
  function makeGateway() {
    return { events: { on: jest.fn(), emit: jest.fn() }, isConnected: jest.fn(), pushTemplateSync: jest.fn() };
  }

  async function createService(defs: Array<{ compiledAt: Date }>) {
    const queue = { add: jest.fn() };
    const gateway = makeGateway();
    const compiler = { listQueryIds: jest.fn().mockReturnValue([]) };
    const repo = { findOne: jest.fn(), upsert: jest.fn(), find: jest.fn().mockResolvedValue(defs) };
    const connectorDirectory = { findConnectorIdForTenant: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HisQueryDefinitionPublisherService,
        { provide: HisQueryTemplateCompiler, useValue: compiler },
        { provide: getRepositoryToken(HisQueryDefinition), useValue: repo },
        { provide: ConnectorDirectoryService, useValue: connectorDirectory },
        { provide: ConnectorGateway, useValue: gateway },
        { provide: getQueueToken(QUEUE_NAMES.HIS_QUERY_PUBLISH), useValue: queue },
      ],
    }).compile();

    return { service: module.get(HisQueryDefinitionPublisherService), repo };
  }

  it('reports zero definitions and a null lastCompiledAt when nothing has been published', async () => {
    const { service } = await createService([]);
    const summary = await service.getDefinitionsSummary('tenant-1');
    expect(summary).toEqual({ definitionCount: 0, lastCompiledAt: null });
  });

  it('reports the count and most-recent compiledAt (repo already orders DESC)', async () => {
    const newest = new Date('2026-07-22T10:00:00Z');
    const older = new Date('2026-07-01T00:00:00Z');
    const { service, repo } = await createService([{ compiledAt: newest }, { compiledAt: older }] as any);

    const summary = await service.getDefinitionsSummary('tenant-1');

    expect(summary).toEqual({ definitionCount: 2, lastCompiledAt: newest.toISOString() });
    expect(repo.find).toHaveBeenCalledWith({ where: { tenantId: 'tenant-1' }, order: { compiledAt: 'DESC' } });
  });
});
