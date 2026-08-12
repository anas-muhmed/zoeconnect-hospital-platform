import { Test, TestingModule } from '@nestjs/testing';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NestFastifyApplication, FastifyAdapter } from '@nestjs/platform-fastify';
import { ConnectorGateway } from '../connector.gateway';
import { ConnectorInstance } from '../entities/connector-instance.entity';
import { Connector, WebSocketMessageTransport, SqlTemplateRegistry } from '@hdsp/connector';
import type { OracleClientLogger } from '@hdsp/oracle-client';

/**
 * ConnectorGateway <-> WebSocketMessageTransport end-to-end round trip
 * (ZoeConnect Connector, Phase B, Task 60 — 2026-07-21).
 *
 * Proves the actual NEW mechanism this phase adds -- a real socket.io
 * connection, authenticated with a real connector-access JWT, carrying a
 * real `MessageTransportRequest`/`Response` round trip between a live
 * `ConnectorGateway` (server) and a live `WebSocketMessageTransport`
 * (client, via `socket.io-client`) -- without needing live Redis, Bull, or
 * Oracle:
 *
 *  - No Redis/Bull: this test calls `gateway.dispatchToConnector()`
 *    directly rather than going through `ConnectorJobDispatchService`'s
 *    queue. That's a deliberate scope boundary, not a shortcut around
 *    something untested -- `ConnectorJobDispatchProcessor` is a two-line
 *    passthrough to this exact method (see its own file), so once this
 *    round trip is proven, the only untested seam is "does Bull deliver a
 *    job to a processor," which is Bull's own well-tested job, not this
 *    codebase's.
 *  - No live Oracle: the `Connector` on the client side is constructed
 *    with a hand-rolled object shaped like `OracleClient` (only the
 *    methods `Connector` actually calls: `connect`/`close`/`query`/
 *    `isAvailable`), not a real `OracleClient` instance -- avoids pulling
 *    in native `oracledb` for what is fundamentally a transport test, not
 *    an Oracle test (that coverage belongs to `oracle-client`'s own
 *    package and `connector.spec.ts`, per this session's own NJS-046
 *    finding).
 */
describe('ConnectorGateway <-> WebSocketMessageTransport (e2e)', () => {
  let app: NestFastifyApplication;
  let gateway: ConnectorGateway;
  let baseUrl: string;

  const CONNECTOR_ID = 'connector-e2e-1';
  const TENANT_ID = 'tenant-e2e-1';
  const CONNECTOR_SECRET = 'e2e-connector-secret-please-32-chars-min';

  const instance = {
    id: CONNECTOR_ID,
    tenantId: TENANT_ID,
    pairingId: 'pairing-e2e-1',
    status: 'registered',
    version: null,
    hostname: 'e2e-test-host',
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

  it('routes a dispatchToConnector() request over WS to the connector and back', async () => {
    // Sign a real connector-access JWT the same shape ConnectorGateway
    // expects (see its ConnectorJwtPayload interface) -- this proves the
    // gateway's own verify() branch, not just a pre-authenticated socket.
    const jwt = new JwtService();
    const accessToken = jwt.sign(
      { sub: CONNECTOR_ID, tenantId: TENANT_ID, type: 'connector_access', jti: 'jti-e2e-1' },
      { secret: CONNECTOR_SECRET, expiresIn: '5m' },
    );

    const templates = new SqlTemplateRegistry();
    templates.register({
      id: 'health-check-select-1',
      kind: 'query',
      sql: 'SELECT 1 FROM dual',
      expectedBinds: [],
      description: 'Conformance query used by this e2e test.',
    });

    // Minimal OracleClient-shaped stub -- see this file's doc comment for
    // why a real OracleClient/native oracledb isn't used here.
    const fakeOracleClient = {
      isAvailable: true,
      connect: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
      query: jest.fn().mockResolvedValue([{ '1': 1 }]),
      execute: jest.fn(),
    };

    const quietLogger: OracleClientLogger = { log: () => {}, warn: () => {}, error: () => {} };

    const transport = new WebSocketMessageTransport({
      cloudUrl: baseUrl,
      getAccessToken: () => accessToken,
      logger: { log: () => {}, warn: () => {}, error: () => {} },
    });

    const connector = new Connector(fakeOracleClient as any, transport, templates, quietLogger);
    await connector.start();

    try {
      // Give the gateway's handleConnection() a moment to finish its own
      // await chain (JWT verify + repo lookup + room joins) before this
      // test asserts on isConnected() -- start() above only awaits the
      // CLIENT socket's 'connect' event, not the server's handler.
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(gateway.isConnected(CONNECTOR_ID)).toBe(true);

      const response = await gateway.dispatchToConnector(CONNECTOR_ID, {
        correlationId: 'corr-e2e-1',
        sqlTemplateId: 'health-check-select-1',
        binds: {},
      });

      expect(response.ok).toBe(true);
      expect(response.correlationId).toBe('corr-e2e-1');
      if (response.ok) {
        expect(response.rows).toEqual([{ '1': 1 }]);
      }
      expect(fakeOracleClient.query).toHaveBeenCalledWith('SELECT 1 FROM dual', {});
    } finally {
      await connector.stop();
    }
  }, 15000);

  it('rejects a connection carrying an invalid/unsigned token', async () => {
    // Fix (stale test-vs-implementation mismatch): ConnectorGateway does NOT
    // validate the JWT via a socket.io auth middleware (`server.use()`) --
    // it verifies inside the async handleConnection() handler, AFTER the
    // transport-level handshake already succeeded. So the client always
    // sees 'connect' fire first (start()'s Promise resolves), and only
    // afterward does the server call client.disconnect() once JWT
    // verification fails inside handleConnection() -- surfaced to the
    // client as a 'disconnect' event, never a 'connect_error'. This test
    // previously asserted `start()` itself rejects, which never happens
    // for an invalid token under the real (post-connect, reactive) auth
    // design -- only for a transport-level failure (e.g. unreachable host).
    const transport = new WebSocketMessageTransport({
      cloudUrl: baseUrl,
      getAccessToken: () => 'not-a-real-token',
      logger: { log: () => {}, warn: () => {}, error: () => {} },
    });

    // start() resolves -- the handshake itself succeeds regardless of token validity.
    await expect(transport.start()).resolves.toBeUndefined();
    expect((transport as any).socket?.connected).toBe(true);

    // The server-side rejection is reactive: give handleConnection()'s own
    // async verify+disconnect chain a moment to run, then confirm the raw
    // socket was in fact kicked off by the server (proves the security
    // check happened, just after 'connect' rather than blocking it).
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect((transport as any).socket?.connected).toBe(false);

    await transport.stop();
  }, 15000);
});
