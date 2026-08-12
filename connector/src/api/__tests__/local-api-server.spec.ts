import request from 'supertest';
import { createLocalApiServer } from '../local-api-server';
import type { ConnectorRuntime } from '../../runtime/connector-runtime';

/**
 * Task #103 ("HDSP Connector Manager," 2026-07-22) -- contract tests for
 * the local REST API, against a fully mocked `ConnectorRuntime`. This is
 * the surface the Connector Manager UI (and, later, the tray) depends on
 * being stable (see local-api-server.ts's own "future compatibility" doc
 * comment) -- these tests exist to catch an accidental breaking change to
 * request/response shapes, not to re-test `ConnectorRuntime`'s own logic
 * (that belongs in a runtime-focused spec).
 */
describe('Connector Local REST API', () => {
  function makeRuntime(overrides: Partial<jest.Mocked<ConnectorRuntime>> = {}) {
    const runtime = {
      getStatus: jest.fn().mockReturnValue({
        activated: false,
        hospital: { tenantId: null, connectorId: null, hostname: 'TEST-HOST' },
        cloud: { connected: false, url: 'https://cloud.test' },
        oracle: { connected: false, target: null },
        definitions: { count: 0 },
        version: '1.0.0',
        lastSyncAt: null,
      }),
      reconnect: jest.fn(),
      restart: jest.fn().mockResolvedValue(undefined),
      activate: jest.fn(),
      getOracleConfig: jest.fn().mockReturnValue(null),
      saveOracleConfig: jest.fn(),
      testOracleConnection: jest.fn(),
      runDiagnostics: jest.fn().mockResolvedValue({ generatedAt: '2026-07-22T00:00:00Z', checks: [] }),
      getLogs: jest.fn().mockReturnValue([]),
      ...overrides,
    } as unknown as jest.Mocked<ConnectorRuntime>;
    return runtime;
  }

  const validOracleConfig = { host: 'db.hospital.local', port: 1521, serviceName: 'ORCL', username: 'hdsp', password: 'secret' };

  describe('GET /api/status', () => {
    it('returns the runtime status verbatim', async () => {
      const runtime = makeRuntime();
      const res = await request(createLocalApiServer(runtime)).get('/api/v1/status');
      expect(res.status).toBe(200);
      expect(res.body.activated).toBe(false);
      expect(res.body.hospital.hostname).toBe('TEST-HOST');
    });
  });

  describe('POST /api/activation', () => {
    it('400s when activationCode is missing', async () => {
      const runtime = makeRuntime();
      const res = await request(createLocalApiServer(runtime)).post('/api/v1/activation').send({});
      expect(res.status).toBe(400);
      expect(runtime.activate).not.toHaveBeenCalled();
    });

    it('activates and returns 201 on success', async () => {
      const runtime = makeRuntime({ activate: jest.fn().mockResolvedValue({ tenantId: 't1', connectorId: 'c1' }) } as any);
      const res = await request(createLocalApiServer(runtime)).post('/api/v1/activation').send({ activationCode: 'ABCD-EFGH-JKLM' });
      expect(res.status).toBe(201);
      expect(res.body).toEqual({ ok: true, tenantId: 't1', connectorId: 'c1' });
      expect(runtime.activate).toHaveBeenCalledWith('ABCD-EFGH-JKLM', undefined);
    });

    it('returns 409 when already activated', async () => {
      const runtime = makeRuntime({
        activate: jest.fn().mockRejectedValue(new Error('This Connector is already activated. Re-activation with a new Activation Code is not supported yet.')),
      } as any);
      const res = await request(createLocalApiServer(runtime)).post('/api/v1/activation').send({ activationCode: 'ABCD-EFGH-JKLM' });
      expect(res.status).toBe(409);
    });

    it('returns 400 for a rejected/invalid code', async () => {
      const runtime = makeRuntime({ activate: jest.fn().mockRejectedValue(new Error('Connector registration failed: Invalid tenant code or activation code')) } as any);
      const res = await request(createLocalApiServer(runtime)).post('/api/v1/activation').send({ activationCode: 'WRONG-CODE-000' });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/activation', () => {
    it('reflects status.activated / hospital fields', async () => {
      const runtime = makeRuntime({
        getStatus: jest.fn().mockReturnValue({
          activated: true,
          hospital: { tenantId: 't1', connectorId: 'c1', hostname: 'HOST' },
          cloud: { connected: true, url: 'https://cloud.test' },
          oracle: { connected: true, target: 'x' },
          definitions: { count: 5 },
          version: '1.0.0',
          lastSyncAt: null,
        }),
      } as any);
      const res = await request(createLocalApiServer(runtime)).get('/api/v1/activation');
      expect(res.body).toEqual({ activated: true, tenantId: 't1', connectorId: 'c1', hostname: 'HOST' });
    });
  });

  describe('Oracle config routes', () => {
    it('PUT /api/oracle/config 400s on an incomplete body', async () => {
      const runtime = makeRuntime();
      const res = await request(createLocalApiServer(runtime)).put('/api/v1/oracle/config').send({ host: 'x' });
      expect(res.status).toBe(400);
      expect(runtime.saveOracleConfig).not.toHaveBeenCalled();
    });

    it('PUT /api/oracle/config saves a valid config', async () => {
      const runtime = makeRuntime({ saveOracleConfig: jest.fn().mockResolvedValue({ ok: true, message: 'saved' }) } as any);
      const res = await request(createLocalApiServer(runtime)).put('/api/v1/oracle/config').send(validOracleConfig);
      expect(res.status).toBe(200);
      expect(runtime.saveOracleConfig).toHaveBeenCalledWith(validOracleConfig);
    });

    it('POST /api/oracle/test never persists, only reports ok/message', async () => {
      const runtime = makeRuntime({ testOracleConnection: jest.fn().mockResolvedValue({ ok: false, message: 'Connection failed: timeout' }) } as any);
      const res = await request(createLocalApiServer(runtime)).post('/api/v1/oracle/test').send(validOracleConfig);
      expect(res.status).toBe(400);
      expect(res.body.message).toContain('timeout');
      expect(runtime.saveOracleConfig).not.toHaveBeenCalled();
    });

    it('GET /api/oracle/config never echoes a password field', async () => {
      const runtime = makeRuntime({
        getOracleConfig: jest.fn().mockReturnValue({ host: 'x', port: 1521, serviceName: 'ORCL', username: 'hdsp', passwordSet: true }),
      } as any);
      const res = await request(createLocalApiServer(runtime)).get('/api/v1/oracle/config');
      expect(res.body.passwordSet).toBe(true);
      expect(res.body.password).toBeUndefined();
    });
  });

  describe('actions', () => {
    it('POST /api/reconnect calls runtime.reconnect()', async () => {
      const runtime = makeRuntime();
      const res = await request(createLocalApiServer(runtime)).post('/api/v1/reconnect');
      expect(res.status).toBe(200);
      expect(runtime.reconnect).toHaveBeenCalled();
    });

    it('POST /api/restart calls runtime.restart()', async () => {
      const runtime = makeRuntime();
      const res = await request(createLocalApiServer(runtime)).post('/api/v1/restart');
      expect(res.status).toBe(200);
      expect(runtime.restart).toHaveBeenCalled();
    });
  });

  describe('GET /api/diagnostics', () => {
    it('returns the diagnostics report', async () => {
      const runtime = makeRuntime();
      const res = await request(createLocalApiServer(runtime)).get('/api/v1/diagnostics');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('checks');
    });
  });

  describe('GET /api/diagnostics/export', () => {
    it('sets a Content-Disposition attachment header', async () => {
      const runtime = makeRuntime();
      const res = await request(createLocalApiServer(runtime)).get('/api/v1/diagnostics/export');
      expect(res.status).toBe(200);
      expect(res.headers['content-disposition']).toContain('attachment');
    });
  });

  describe('GET /api/logs', () => {
    it('passes level/limit query params through to the runtime', async () => {
      const runtime = makeRuntime();
      await request(createLocalApiServer(runtime)).get('/api/v1/logs?level=error&limit=10');
      expect(runtime.getLogs).toHaveBeenCalledWith({ level: 'error', limit: 10 });
    });
  });

  describe('GET /api/about', () => {
    it('reports version and an honest not-yet-managed windowsService state', async () => {
      const runtime = makeRuntime();
      const res = await request(createLocalApiServer(runtime)).get('/api/v1/about');
      expect(res.body.version).toBe('1.0.0');
      expect(res.body.apiVersion).toBe('v1');
      expect(res.body.windowsService.managed).toBe(false);
    });
  });

  describe('versioning (HDSP Connector 1.0 Deployment, 2026-07-22)', () => {
    it('does not respond to the old unversioned /api/status path', async () => {
      const runtime = makeRuntime();
      const res = await request(createLocalApiServer(runtime)).get('/api/status');
      expect(res.status).toBe(404);
    });

    it('/health remains unversioned (legacy, predates /api/v1)', async () => {
      const runtime = makeRuntime();
      const res = await request(createLocalApiServer(runtime)).get('/health');
      expect(res.status).toBe(503); // oracle.connected is false in the default mock
      expect(res.body.protocolVersion).toBeDefined();
    });
  });
});
