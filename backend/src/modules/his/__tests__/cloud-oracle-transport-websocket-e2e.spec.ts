import { Test, TestingModule } from '@nestjs/testing';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NestFastifyApplication, FastifyAdapter } from '@nestjs/platform-fastify';
import { CloudOracleTransport, ConnectorNotRegisteredError } from '../cloud-oracle.transport';
import { ConnectorGateway } from '../../platform/connector/connector.gateway';
import { ConnectorDirectoryService } from '../../platform/connector/connector-directory.service';
import { ConnectorInstance } from '../../platform/connector/entities/connector-instance.entity';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';
import { Connector, WebSocketMessageTransport, SqlTemplateRegistry } from '@hdsp/connector';
import type { OracleClientLogger } from '@hdsp/oracle-client';

/**
 * Full Oracle execution path, Phase C (2026-07-21):
 *
 *   Business Service -> CloudOracleTransport -> [ConnectorJobDispatchService] ->
 *   ConnectorGateway -> WebSocket -> ZoeConnect Connector -> Oracle HIS -> Response
 *
 * This is the milestone target from ADR_CONNECTOR_PROTOCOL.md §4/§7: prove
 * `CloudOracleTransport.query()` -- the exact method every HIS business
 * service already calls through `IOracleTransport` -- reaches a live
 * Connector over the real WebSocket transport and gets a real response
 * back, for the `health-check-select-1` conformance query.
 *
 * `ConnectorJobDispatchService` itself is deliberately NOT constructed
 * here (it requires a live Bull queue, i.e. live Redis, unavailable in
 * this sandbox -- see connector-websocket-e2e.spec.ts's own doc comment
 * for why that's an acceptable boundary: the processor is a two-line
 * passthrough to `ConnectorGateway.dispatchToConnector()`, which IS
 * exercised here). In its place, a minimal stand-in satisfying the same
 * `dispatch(tenantId, connectorId, request, timeoutMs)` shape is injected
 * into `CloudOracleTransport`, calling `gateway.dispatchToConnector()`
 * directly -- i.e. exactly what the real service's Bull processor does,
 * minus the queue. This test's job is to prove `CloudOracleTransport`'s
 * OWN new logic (tenant resolution, connector lookup, dispatch-mode
 * branching, template resolution) end-to-end against a real gateway and a
 * real connector process; Bull's own delivery guarantees are not this
 * codebase's to re-test (see Phase B's ADR entry).
 */
describe('CloudOracleTransport (websocket dispatch mode) — full execution path e2e', () => {
  let app: NestFastifyApplication;
  let gateway: ConnectorGateway;
  let baseUrl: string;

  const CONNECTOR_ID = 'connector-phase-c-1';
  const TENANT_ID = 'tenant-phase-c-1';
  const CONNECTOR_SECRET = 'phase-c-connector-secret-please-32-chars-min';

  const instance = {
    id: CONNECTOR_ID,
    tenantId: TENANT_ID,
    pairingId: 'pairing-phase-c-1',
    status: 'registered',
    version: null,
    hostname: 'phase-c-test-host',
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
  });

  afterAll(async () => {
    await app.close();
  });

  // ConnectorDirectoryService constructed directly against its own mock
  // repo (separate from the gateway's) -- proves CloudOracleTransport's
  // lookup path independently of the gateway's own instance-repo access.
  const connectorDirectory = new ConnectorDirectoryService(directoryInstanceRepo as any);

  it('routes CloudOracleTransport.query() through the full WS path to a live Connector', async () => {
    const jwt = new JwtService();
    const accessToken = jwt.sign(
      { sub: CONNECTOR_ID, tenantId: TENANT_ID, type: 'connector_access', jti: 'jti-phase-c-1' },
      { secret: CONNECTOR_SECRET, expiresIn: '5m' },
    );

    // Fake dispatch-service stand-in -- see this file's doc comment for
    // why the real ConnectorJobDispatchService (needs live Redis/Bull)
    // isn't constructed here. Shape-compatible with the one method
    // CloudOracleTransport actually calls.
    const jobDispatch = { dispatch: (tenantId: string, connectorId: string, req: any, timeoutMs: number) =>
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

    // Connector-side: real Connector + real WebSocketMessageTransport,
    // mocked OracleClient (see connector-websocket-e2e.spec.ts's doc
    // comment for why a real oracledb isn't pulled into a transport test).
    const PATIENT_SEARCH_SQL =
      'SELECT patient_id AS "mrn", first_name AS "firstName", last_name AS "lastName" FROM patients WHERE UPPER(first_name) LIKE :nameMatch FETCH FIRST 20 ROWS ONLY';

    const templates = new SqlTemplateRegistry();
    templates.register({
      id: 'health-check-select-1',
      kind: 'query',
      sql: 'SELECT 1 FROM dual',
      expectedBinds: [],
      description: 'Conformance query used by this e2e test.',
    });
    // Second conformance query (Phase C, Task 66) -- see index.ts/
    // cloud-oracle.transport.ts's matching doc comments for why this is a
    // representative generic query, not the real per-tenant PatientService
    // SQL. Registered with the exact same id + SQL text CloudOracleTransport
    // itself registers in its knownTemplates map.
    templates.register({
      id: 'patient-search',
      kind: 'query',
      sql: PATIENT_SEARCH_SQL,
      expectedBinds: ['nameMatch'],
      description: 'Representative parameterized patient-search conformance query, used by this e2e test.',
    });
    const fakeOracleClient = {
      isAvailable: true,
      connect: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
      query: jest.fn((sql: string) =>
        // Oracle preserves case for double-quoted aliases (exactly what
        // both SQL strings above use), so the mock returns keys matching
        // the aliases verbatim -- same shape a real query against this
        // SQL would return.
        sql === PATIENT_SEARCH_SQL
          ? Promise.resolve([{ mrn: 'MRN001', firstName: 'JOHN', lastName: 'SMITH' }])
          : Promise.resolve([{ '1': 1 }]),
      ),
      execute: jest.fn(),
    };
    const quietLogger: OracleClientLogger = { log: () => {}, warn: () => {}, error: () => {} };
    const wsTransport = new WebSocketMessageTransport({
      cloudUrl: baseUrl,
      getAccessToken: () => accessToken,
      logger: { log: () => {}, warn: () => {}, error: () => {} },
    });
    const connectorProcess = new Connector(fakeOracleClient as any, wsTransport, templates, quietLogger);
    await connectorProcess.start();

    try {
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(gateway.isConnected(CONNECTOR_ID)).toBe(true);

      // This is the actual milestone assertion: a Business Service's call
      // shape (`IOracleTransport.query(sql, binds)`), through the real
      // CloudOracleTransport, resolving the ambient tenant, looking up
      // its Connector, dispatching over the real WS transport, executing
      // against a (mocked) Oracle, and returning rows back up the stack.
      const rows = await TenantContextStorage.run(TENANT_ID, () =>
        transport.query('SELECT 1 FROM dual'),
      );

      expect(rows).toEqual([{ '1': 1 }]);
      expect(fakeOracleClient.query).toHaveBeenCalledWith('SELECT 1 FROM dual', {});

      // Task 66: extend the same proven path to a second, parameterized,
      // row-returning query -- proves bind-parameter passthrough
      // (`nameMatch`) and real result rows travel the full WS round trip,
      // not just a static no-op query.
      const patientRows = await TenantContextStorage.run(TENANT_ID, () =>
        transport.query(PATIENT_SEARCH_SQL, { nameMatch: '%SMITH%' }),
      );

      expect(patientRows).toEqual([{ mrn: 'MRN001', firstName: 'JOHN', lastName: 'SMITH' }]);
      expect(fakeOracleClient.query).toHaveBeenCalledWith(PATIENT_SEARCH_SQL, { nameMatch: '%SMITH%' });
    } finally {
      await connectorProcess.stop();
    }
  }, 15000);

  it('throws ConnectorNotRegisteredError when the ambient tenant has no registered Connector', async () => {
    const emptyDirectory = new ConnectorDirectoryService({ findOne: jest.fn().mockResolvedValue(null) } as any);
    const jobDispatch = { dispatch: jest.fn() } as any;
    const config = {
      get: (key: string, def?: any) => (key === 'CLOUD_ORACLE_TRANSPORT_MODE' ? 'websocket' : def),
    } as unknown as ConfigService;

    const transport = new CloudOracleTransport(config, new TenantContextStorage(), jobDispatch, emptyDirectory);

    await expect(
      TenantContextStorage.run('tenant-with-no-connector', () => transport.query('SELECT 1 FROM dual')),
    ).rejects.toThrow(ConnectorNotRegisteredError);
    expect(jobDispatch.dispatch).not.toHaveBeenCalled();
  });

  it('falls back to redis dispatch mode (default) without needing any connector dependency', () => {
    // No jobDispatch/connectorDirectory/tenantContext injected at all --
    // proves the default mode remains fully constructible and doesn't
    // reach into the new Phase C dependencies unless explicitly enabled.
    expect(() => new CloudOracleTransport()).not.toThrow();
  });
});
