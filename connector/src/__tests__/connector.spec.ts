import { OracleClient, HisUnavailableError } from '@hdsp/oracle-client';
import { Connector } from '../connector';
import { SqlTemplateRegistry } from '../protocol/sql-template-registry';
import type {
  IMessageTransport,
  MessageTransportRequest,
  MessageTransportResponse,
} from '../protocol/message-transport.interface';

/**
 * In-memory mock transport (Phase 6 Task 6.3's testing checklist item:
 * "Message Transport protocol round-trips correctly against a mock
 * backend endpoint, not the real one"). Calls the registered handler
 * directly, in-process -- no Redis, no network.
 */
class InMemoryMockTransport implements IMessageTransport {
  private handler: ((req: MessageTransportRequest) => Promise<MessageTransportResponse>) | null = null;

  onRequest(handler: (req: MessageTransportRequest) => Promise<MessageTransportResponse>): void {
    this.handler = handler;
  }

  async send(req: MessageTransportRequest): Promise<MessageTransportResponse> {
    if (!this.handler) throw new Error('No handler registered');
    return this.handler(req);
  }

  async start(): Promise<void> {}
  async stop(): Promise<void> {}
}

describe('Connector', () => {
  // node-oracledb's pool alias registry is PROCESS-WIDE (see
  // OracleClientConfig.poolAlias's own doc comment in
  // packages/oracle-client/src/oracle-client.ts) -- every OracleClient
  // constructed below defaulted to the same 'HDSP_HIS' alias with no
  // teardown between tests, so the first test's connector.start() left a
  // live pool registered under that alias and every subsequent test's
  // connect() attempt failed with "NJS-046: pool alias already exists",
  // retried 3 times, and blew past Jest's 5000ms default test timeout.
  // Fixed by giving each test's OracleClient its own unique alias.
  let poolAliasCounter = 0;
  // Tracks every OracleClient this file creates so afterEach can close its
  // pool -- otherwise each test leaks a live oracledb pool for the rest of
  // the process's lifetime (contributing to the "worker process failed to
  // exit gracefully" warning jest reports at the end of a run).
  const createdClients: OracleClient[] = [];

  afterEach(async () => {
    await Promise.all(createdClients.map((c) => c.close().catch(() => {})));
    createdClients.length = 0;
  });

  function makeConnector() {
    const oracleClient = new OracleClient({
      user: 'u', password: 'p', host: 'h', service: 's',
      poolAlias: `TEST_CONNECTOR_${Date.now()}_${poolAliasCounter++}`,
    });
    createdClients.push(oracleClient);
    const transport = new InMemoryMockTransport();
    const templates = new SqlTemplateRegistry();
    templates.register({
      id: 'get-patient-by-mrn',
      kind: 'query',
      sql: 'SELECT * FROM patients WHERE mrn = :mrn',
      expectedBinds: ['mrn'],
      description: 'test',
    });
    templates.register({
      id: 'update-patient-phone',
      kind: 'execute',
      sql: "UPDATE patients SET phone = :phone WHERE mrn = :mrn",
      expectedBinds: ['mrn', 'phone'],
      description: 'test',
    });
    const connector = new Connector(oracleClient, transport, templates, { log: () => {}, warn: () => {}, error: () => {} });
    return { connector, transport, oracleClient };
  }

  it('round-trips a query template through the mock transport and returns rows', async () => {
    const { connector, transport, oracleClient } = makeConnector();
    jest.spyOn(oracleClient, 'query').mockResolvedValue([{ mrn: '123', name: 'Alice' }]);
    await connector.start();

    const response = await transport.send({ correlationId: 'c1', sqlTemplateId: 'get-patient-by-mrn', binds: { mrn: '123' } });

    expect(response.ok).toBe(true);
    if (response.ok) {
      expect(response.rows).toEqual([{ mrn: '123', name: 'Alice' }]);
    }
  });

  it('round-trips an execute template and returns rowsAffected', async () => {
    const { connector, transport, oracleClient } = makeConnector();
    jest.spyOn(oracleClient, 'execute').mockResolvedValue(1);
    await connector.start();

    const response = await transport.send({ correlationId: 'c2', sqlTemplateId: 'update-patient-phone', binds: { mrn: '123', phone: '555' } });

    expect(response.ok).toBe(true);
    if (response.ok) {
      expect(response.rowsAffected).toBe(1);
    }
  });

  it('rejects an unknown sqlTemplateId with a structured, non-throwing error response', async () => {
    const { connector, transport } = makeConnector();
    await connector.start();

    const response = await transport.send({ correlationId: 'c3', sqlTemplateId: 'drop-everything', binds: {} });

    expect(response.ok).toBe(false);
    if (!response.ok) {
      expect(response.error.message).toContain('Unknown or unregistered SQL template');
      expect(response.error.retryable).toBe(false);
    }
  });

  it('marks an Oracle-unavailable failure as retryable', async () => {
    const { connector, transport, oracleClient } = makeConnector();
    jest.spyOn(oracleClient, 'query').mockRejectedValue(new HisUnavailableError());
    await connector.start();

    const response = await transport.send({ correlationId: 'c4', sqlTemplateId: 'get-patient-by-mrn', binds: { mrn: '123' } });

    expect(response.ok).toBe(false);
    if (!response.ok) {
      expect(response.error.retryable).toBe(true);
    }
  });

  it('isHealthy() reflects OracleClient.isAvailable', async () => {
    const { connector, oracleClient } = makeConnector();
    jest.spyOn(oracleClient, 'connect').mockImplementation(async () => {
      Object.defineProperty(oracleClient, 'isAvailable', { get: () => true, configurable: true });
    });
    await connector.start();
    expect(connector.isHealthy()).toEqual({ oracle: true, connector: true });
  });
});
