import { Test, TestingModule } from '@nestjs/testing';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NestFastifyApplication, FastifyAdapter } from '@nestjs/platform-fastify';
import { ConnectorGateway } from '../connector.gateway';
import { ConnectorInstance } from '../entities/connector-instance.entity';
import { Connector, WebSocketMessageTransport, SqlTemplateRegistry } from '@hdsp/connector';
import type { SyncedTemplateDefinition } from '@hdsp/connector';
import type { OracleClientLogger } from '@hdsp/oracle-client';

/**
 * D.3 sync-channel round trip (DYNAMIC_HIS_QUERY_ARCHITECTURE.md §13's own
 * "not yet covered by an automated test" flag, closed here): proves a
 * definition that was NEVER registered at Connector build time can still
 * be dispatched successfully, once pushed live via
 * `ConnectorGateway.pushTemplateSync()` and applied connector-side via
 * `SqlTemplateRegistry.registerOrReplace()` -- exactly the path
 * `HisQueryDefinitionPublisherService` drives in production, minus Bull
 * and the DB-persistence layer (same "durability/queueing is not this
 * test's concern" boundary `connector-websocket-e2e.spec.ts` already
 * established for Phase B).
 */
describe('Connector template sync -> live dispatch (e2e)', () => {
  let app: NestFastifyApplication;
  let gateway: ConnectorGateway;
  let baseUrl: string;

  const CONNECTOR_ID = 'connector-sync-e2e-1';
  const TENANT_ID = 'tenant-sync-e2e-1';
  const CONNECTOR_SECRET = 'sync-e2e-connector-secret-please-32-chars';

  const instance = {
    id: CONNECTOR_ID,
    tenantId: TENANT_ID,
    pairingId: 'pairing-sync-e2e-1',
    status: 'registered',
    version: null,
    hostname: 'sync-e2e-test-host',
    lastHeartbeatAt: null,
    createdAt: new Date(),
    revokedAt: null,
  };

  const instanceRepo = {
    findOne: jest.fn().mockResolvedValue(instance),
    save: jest.fn(async (x: any) => x),
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        JwtModule.register({}),
      ],
      providers: [
        ConnectorGateway,
        { provide: getRepositoryToken(ConnectorInstance), useValue: instanceRepo },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, def?: any) => (key === 'jwt.connectorSecret' ? CONNECTOR_SECRET : def),
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
  });

  afterAll(async () => {
    await app.close();
  });

  it('dispatches a queryId successfully only after it arrives via sync-templates push', async () => {
    const jwt = new JwtService();
    const accessToken = jwt.sign(
      { sub: CONNECTOR_ID, tenantId: TENANT_ID, type: 'connector_access', jti: 'jti-sync-e2e-1' },
      { secret: CONNECTOR_SECRET, expiresIn: '5m' },
    );

    // Deliberately EMPTY at construction -- no build-time conformance
    // templates registered, unlike index.ts's real main(). This is the
    // whole point: `patient.getByMrn` below must only become resolvable
    // once the sync push applies it.
    const templates = new SqlTemplateRegistry();

    const fakeOracleClient = {
      isAvailable: true,
      connect: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
      query: jest.fn().mockResolvedValue([{ mrn: 'MRN042' }]),
      execute: jest.fn(),
    };
    const quietLogger: OracleClientLogger = { log: () => {}, warn: () => {}, error: () => {} };

    const transport = new WebSocketMessageTransport({
      cloudUrl: baseUrl,
      getAccessToken: () => accessToken,
      logger: { log: () => {}, warn: () => {}, error: () => {} },
    });

    // Mirrors index.ts's buildWebSocketTransport() wiring: apply every
    // synced definition to the local registry via registerOrReplace().
    transport.onTemplateSync((definitions: SyncedTemplateDefinition[]) => {
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

    const connector = new Connector(fakeOracleClient as any, transport, templates, quietLogger);
    await connector.start();

    try {
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(gateway.isConnected(CONNECTOR_ID)).toBe(true);

      // Before the sync push: dispatching the not-yet-known queryId fails
      // with an UnknownSqlTemplateError-shaped response (Connector.handleRequest()
      // catches it and returns a structured, non-retryable error) --
      // confirms this test isn't accidentally passing for an unrelated reason.
      const beforeSync = await gateway.dispatchToConnector(CONNECTOR_ID, {
        correlationId: 'corr-before-sync',
        sqlTemplateId: 'patient.getByMrn',
        binds: { mrn: 'MRN042' },
      });
      expect(beforeSync.ok).toBe(false);

      // Push the definition live, exactly as HisQueryDefinitionPublisherService does.
      gateway.pushTemplateSync(CONNECTOR_ID, [{
        queryId: 'patient.getByMrn',
        sqlTemplateId: 'patient.getByMrn',
        kind: 'query',
        sql: 'SELECT mrn AS "mrn" FROM PAT_MASTER WHERE mrn = :mrn',
        expectedBinds: ['mrn'],
        checksum: 'abc123checksum01',
        definitionVersion: 1,
      }]);

      // Give the push a moment to arrive and be applied connector-side.
      await new Promise((resolve) => setTimeout(resolve, 50));

      const afterSync = await gateway.dispatchToConnector(CONNECTOR_ID, {
        correlationId: 'corr-after-sync',
        sqlTemplateId: 'patient.getByMrn',
        binds: { mrn: 'MRN042' },
      });

      expect(afterSync.ok).toBe(true);
      if (afterSync.ok) {
        expect(afterSync.rows).toEqual([{ mrn: 'MRN042' }]);
      }
      expect(fakeOracleClient.query).toHaveBeenCalledWith(
        'SELECT mrn AS "mrn" FROM PAT_MASTER WHERE mrn = :mrn',
        { mrn: 'MRN042' },
      );
    } finally {
      await connector.stop();
    }
  }, 15000);
});
