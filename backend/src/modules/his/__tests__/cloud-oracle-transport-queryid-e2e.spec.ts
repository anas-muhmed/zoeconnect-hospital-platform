import { Test, TestingModule } from '@nestjs/testing';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NestFastifyApplication, FastifyAdapter } from '@nestjs/platform-fastify';
import { CloudOracleTransport } from '../cloud-oracle.transport';
import { ConnectorGateway } from '../../platform/connector/connector.gateway';
import { ConnectorDirectoryService } from '../../platform/connector/connector-directory.service';
import { ConnectorInstance } from '../../platform/connector/entities/connector-instance.entity';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';
import { Connector, WebSocketMessageTransport, SqlTemplateRegistry } from '@hdsp/connector';
import type { SyncedTemplateDefinition } from '@hdsp/connector';
import type { OracleClientLogger } from '@hdsp/oracle-client';

/**
 * D.4 ("Dynamic Per-Tenant HIS Query Architecture" — DYNAMIC_HIS_QUERY_ARCHITECTURE.md
 * §9/§14) full-path validation: proves a Business Service call carrying
 * `opts.queryId` -- NOT a raw SQL string CloudOracleTransport's
 * `knownTemplates` allow-list has ever seen -- still reaches a live
 * Connector and executes successfully, once that queryId's compiled
 * definition has arrived via the D.3 sync-templates channel.
 *
 *   IOracleTransport.queryOne(sql, binds, { queryId }) -> CloudOracleTransport
 *     (bypasses resolveTemplate(sql) entirely, uses queryId directly as
 *      sqlTemplateId) -> ConnectorGateway -> WebSocket -> Connector
 *     (queryId resolved via SqlTemplateRegistry, populated here by
 *      simulating exactly what HisQueryDefinitionPublisherService's
 *      publishFull()/pushTemplateSync() round trip does) -> mocked
 *      OracleClient -> response.
 *
 * This mirrors `cloud-oracle-transport-websocket-e2e.spec.ts`'s (Phase C)
 * and `connector-template-sync-e2e.spec.ts`'s (D.3) established patterns
 * and sandbox boundaries (no live Redis/Bull; `ConnectorJobDispatchService`
 * stood in with a shape-compatible fake calling
 * `gateway.dispatchToConnector()` directly -- see those files' doc comments
 * for why that boundary is acceptable).
 *
 * Deliberately does NOT go through `PatientService.getByMrn()` itself (that
 * would require a live Postgres for `HisConfigService`/Redis for its
 * request cache) -- this test's job is to prove `CloudOracleTransport`'s
 * OWN new `queryId` branch end-to-end, exactly the same scoping choice the
 * Phase C test made for `query()`/raw SQL.
 */
describe('CloudOracleTransport (queryId dispatch) — D.4 full execution path e2e', () => {
  let app: NestFastifyApplication;
  let gateway: ConnectorGateway;
  let baseUrl: string;

  const CONNECTOR_ID = 'connector-d4-1';
  const TENANT_ID = 'tenant-d4-1';
  const CONNECTOR_SECRET = 'd4-connector-secret-please-32-chars-minimum';
  const QUERY_ID = 'patient.getByMrn';
  const COMPILED_SQL = 'SELECT mrn AS "mrn", first_name AS "firstName" FROM patients WHERE mrn = :mrn';

  const instance = {
    id: CONNECTOR_ID,
    tenantId: TENANT_ID,
    pairingId: 'pairing-d4-1',
    status: 'registered',
    version: null,
    hostname: 'd4-test-host',
    lastHeartbeatAt: null,
    createdAt: new Date(),
    revokedAt: null,
  };

  const gatewayInstanceRepo = {
    findOne: jest.fn().mockResolvedValue(instance),
    save: jest.fn(async (x: any) => x),
  };

  const directoryInstanceRepo = {
    findOne: jest.fn().mockResolvedValue(instance),
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        JwtModule.register({}),
      ],
      providers: [
        ConnectorGateway,
        ConnectorDirectoryService,
        { provide: getRepositoryToken(ConnectorInstance), useValue: gatewayInstanceRepo },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, def?: any) =>
              key === 'jwt.connectorSecret' ? CONNECTOR_SECRET : def,
          },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    gateway = moduleRef.get(ConnectorGateway);

    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    await app.listen(0);

    const address = app.getHttpServer().address();
    const port = typeof address === 'object' && address ? address.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;
  }, 15000);

  afterAll(async () => {
    await app.close();
  });

  const connectorDirectory = new ConnectorDirectoryService(directoryInstanceRepo as any);

  it('dispatches opts.queryId directly, bypassing the raw-SQL allow-list, once synced to the Connector', async () => {
    const jwt = new JwtService();
    const accessToken = jwt.sign(
      { sub: CONNECTOR_ID, tenantId: TENANT_ID, type: 'connector_access', jti: 'jti-d4-1' },
      { secret: CONNECTOR_SECRET, expiresIn: '5m' },
    );

    const jobDispatch = { dispatch: (_tenantId: string, connectorId: string, req: any, timeoutMs: number) =>
      gateway.dispatchToConnector(connectorId, req, timeoutMs) } as any;

    const config = {
      get: (key: string, def?: any) => {
        const values: Record<string, any> = {
          CLOUD_ORACLE_TRANSPORT_MODE: 'websocket',
          CONNECTOR_REQUEST_TIMEOUT_MS: 10_000,
        };
        return values[key] ?? def;
      },
    } as unknown as ConfigService;

    const transport = new CloudOracleTransport(config, new TenantContextStorage(), jobDispatch, connectorDirectory);

    // Connector-side registry deliberately starts EMPTY of `patient.getByMrn`
    // -- same premise as connector-template-sync-e2e.spec.ts: it must only
    // become resolvable once the sync-templates push applies it, proving
    // this isn't accidentally passing via a build-time-registered template.
    const templates = new SqlTemplateRegistry();

    const fakeOracleClient = {
      isAvailable: true,
      connect: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
      query: jest.fn().mockResolvedValue([{ mrn: 'MRN042', firstName: 'JANE' }]),
      execute: jest.fn(),
    };
    const quietLogger: OracleClientLogger = { log: () => {}, warn: () => {}, error: () => {} };

    const wsTransport = new WebSocketMessageTransport({
      cloudUrl: baseUrl,
      getAccessToken: () => accessToken,
      logger: { log: () => {}, warn: () => {}, error: () => {} },
    });
    // Mirrors index.ts's buildWebSocketTransport() wiring (same as D.3's
    // sync test): apply every synced definition via registerOrReplace().
    wsTransport.onTemplateSync((definitions: SyncedTemplateDefinition[]) => {
      for (const def of definitions) {
        templates.registerOrReplace({
          id: def.sqlTemplateId,
          kind: def.kind,
          sql: def.sql,
          expectedBinds: def.expectedBinds,
          description: `synced (v${def.definitionVersion})`,
        });
      }
    });

    const connectorProcess = new Connector(fakeOracleClient as any, wsTransport, templates, quietLogger);
    await connectorProcess.start();

    try {
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(gateway.isConnected(CONNECTOR_ID)).toBe(true);

      // Before the sync push: CloudOracleTransport happily dispatches
      // `queryId` as-is (it never checks a local allow-list for it), but the
      // Connector itself rejects the unknown sqlTemplateId -- proving the
      // real authorization boundary is Connector-side registry membership,
      // not anything client-side.
      await expect(
        TenantContextStorage.run(TENANT_ID, () =>
          transport.queryOne(
            'SELECT mrn FROM patients WHERE mrn = :mrn', // caller's sql is IGNORED once queryId is present
            { mrn: 'MRN042' },
            { queryId: QUERY_ID },
          ),
        ),
      ).rejects.toThrow();

      // Push the compiled definition live -- exactly what
      // HisQueryDefinitionPublisherService.publishFull()/publishChanged()
      // does via ConnectorGateway.pushTemplateSync() (D.3).
      gateway.pushTemplateSync(CONNECTOR_ID, [{
        queryId: QUERY_ID,
        sqlTemplateId: QUERY_ID,
        kind: 'query',
        sql: COMPILED_SQL,
        expectedBinds: ['mrn'],
        checksum: 'd4checksum0000001',
        definitionVersion: 1,
      }]);

      await new Promise((resolve) => setTimeout(resolve, 50));

      // The actual D.4 milestone assertion: a caller passing `opts.queryId`
      // (exactly PatientService.getByMrn()'s call shape after its D.4
      // migration) resolves through the full WS path to a live Connector,
      // with the caller's own `sql` argument never even inspected.
      const row = await TenantContextStorage.run(TENANT_ID, () =>
        transport.queryOne<{ mrn: string; firstName: string }>(
          'this raw sql text is intentionally wrong/unregistered and must be ignored',
          { mrn: 'MRN042' },
          { queryId: QUERY_ID },
        ),
      );

      expect(row).toEqual({ mrn: 'MRN042', firstName: 'JANE' });
      expect(fakeOracleClient.query).toHaveBeenCalledWith(COMPILED_SQL, { mrn: 'MRN042' });
    } finally {
      await connectorProcess.stop();
    }
  }, 15000);
});
