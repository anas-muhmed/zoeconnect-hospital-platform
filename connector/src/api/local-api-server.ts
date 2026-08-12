import * as fs from 'fs';
import * as path from 'path';
import express, { Express, Request, Response, NextFunction, Router } from 'express';
import type { ConnectorRuntime } from '../runtime/connector-runtime';
import { PROTOCOL_VERSION } from '../health';

/**
 * Connector Local REST API (Task #103, "HDSP Connector Manager,"
 * 2026-07-22; versioned under Task "HDSP Connector 1.0 Deployment,"
 * 2026-07-22).
 *
 * Binds to `127.0.0.1` ONLY -- never `0.0.0.0` -- per the task's explicit
 * security requirement: "the UI never talks directly to Oracle... it only
 * communicates with the Connector Service over localhost," and by
 * extension this API itself must never be reachable from outside the
 * machine it runs on. There is no authentication on these routes because
 * there is no legitimate remote caller to authenticate -- the trust
 * boundary is "can this process bind a listener and connect to
 * 127.0.0.1," which is already "this machine, this user session or an
 * administrator," matching the same trust model every other localhost-
 * only admin UI (Docker Desktop, most local dev servers) uses.
 *
 * Also serves the built Connector Manager UI as static files from the
 * SAME port (`STATIC_DIR`) -- see this task's architecture diagram: the
 * UI is drawn as a separate box from the Service only to show it's a
 * distinct piece of code (a Vite/React SPA), not because it needs a
 * separate process or port. Serving it from the Service's own HTTP server
 * avoids CORS entirely and means there is exactly one thing to point a
 * browser (or the tray icon) at.
 *
 * VERSIONED under `/api/v1/*` (added for the 1.0 Deployment pass, per the
 * explicit recommendation to do this "from day one" before packaging
 * ships anything): nothing has been packaged/distributed yet, so there
 * was no live `/api/*` (unversioned) consumer to preserve -- this is a
 * clean rename, not a migration with a deprecation window. Going forward,
 * a breaking change to this contract gets a new `/api/v2` mounted
 * alongside `/api/v1` (both routers can coexist on the same Express app,
 * see `createLocalApiServer()` below), rather than mutating v1's shapes
 * out from under an older, already-installed Connector Manager build --
 * that's the whole point of versioning this now, before Phase 1
 * packaging produces the first real installed copies.
 */

// `connector/dist/api/local-api-server.js` (compiled output) -> up to
// `connector/` -> sibling `connector-manager/dist` (that package's own
// Vite build output). Overridable via CONNECTOR_MANAGER_UI_DIR for
// packaging (see connector-installer/ -- the packaged layout lays the
// built UI out under the same Program Files directory as connector.exe,
// not as a sibling source checkout).
const STATIC_DIR = process.env.CONNECTOR_MANAGER_UI_DIR
  ?? path.join(__dirname, '..', '..', '..', 'connector-manager', 'dist');

function buildV1Router(runtime: ConnectorRuntime): Router {
  const v1 = Router();

  // ── Dashboard ────────────────────────────────────────────────────────
  v1.get('/status', (_req, res) => {
    res.json(runtime.getStatus());
  });

  v1.post('/reconnect', (_req, res) => {
    runtime.reconnect();
    res.json({ ok: true });
  });

  v1.post('/restart', async (_req, res) => {
    try {
      await runtime.restart();
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ ok: false, message: (err as Error).message });
    }
  });

  // ── Activation ───────────────────────────────────────────────────────
  v1.get('/activation', (_req, res) => {
    const status = runtime.getStatus();
    res.json({
      activated: status.activated,
      tenantId: status.hospital.tenantId,
      connectorId: status.hospital.connectorId,
      hostname: status.hospital.hostname,
    });
  });

  v1.post('/activation', async (req: Request, res: Response) => {
    const { activationCode, hostname } = req.body as { activationCode?: string; hostname?: string };
    if (!activationCode || typeof activationCode !== 'string') {
      res.status(400).json({ ok: false, message: 'activationCode is required' });
      return;
    }
    try {
      const result = await runtime.activate(activationCode, hostname);
      res.status(201).json({ ok: true, ...result });
    } catch (err) {
      const message = (err as Error).message;
      // "Already activated" is a client-error (409), everything else
      // (bad code, network failure reaching the cloud) is a 400 -- the UI
      // shows `message` directly either way (see registration.ts's
      // parseErrorMessage(), which already produces a human-readable
      // string from the backend's validation errors).
      const status = message.includes('already activated') ? 409 : 400;
      res.status(status).json({ ok: false, message });
    }
  });

  // ── Oracle ───────────────────────────────────────────────────────────
  v1.get('/oracle/config', (_req, res) => {
    res.json(runtime.getOracleConfig());
  });

  v1.put('/oracle/config', async (req: Request, res: Response) => {
    const config = req.body;
    if (!isValidOracleConfig(config)) {
      res.status(400).json({ ok: false, message: 'host, port, serviceName, username, and password are all required' });
      return;
    }
    const result = await runtime.saveOracleConfig(config);
    res.status(result.ok ? 200 : 400).json(result);
  });

  v1.post('/oracle/test', async (req: Request, res: Response) => {
    const config = req.body;
    if (!isValidOracleConfig(config)) {
      res.status(400).json({ ok: false, message: 'host, port, serviceName, username, and password are all required' });
      return;
    }
    const result = await runtime.testOracleConnection(config);
    res.status(result.ok ? 200 : 400).json(result);
  });

  // ── Diagnostics ──────────────────────────────────────────────────────
  v1.get('/diagnostics', async (_req, res) => {
    res.json(await runtime.runDiagnostics());
  });

  v1.get('/diagnostics/export', async (_req, res) => {
    const report = await runtime.runDiagnostics();
    res.setHeader('Content-Disposition', `attachment; filename="hdsp-connector-diagnostics-${Date.now()}.json"`);
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify(report, null, 2));
  });

  // ── Logs ─────────────────────────────────────────────────────────────
  v1.get('/logs', (req: Request, res: Response) => {
    const level = req.query.level as 'info' | 'warn' | 'error' | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
    res.json(runtime.getLogs({ level, limit }));
  });

  // ── About ────────────────────────────────────────────────────────────
  v1.get('/about', (_req, res) => {
    const status = runtime.getStatus();
    res.json({
      version: status.version,
      protocolVersion: PROTOCOL_VERSION,
      apiVersion: 'v1',
      // Auto-update (Task #97) isn't built yet -- 'stable' is reported as
      // the only channel that currently exists (not a real selectable
      // setting today), rather than fabricating a channel picker with
      // nothing behind it.
      updateChannel: 'stable',
      windowsService: {
        // Same honest-until-packaging-is-real posture as diagnostics.ts's
        // windows_service check.
        name: process.env.CONNECTOR_SERVICE_NAME ?? null,
        managed: Boolean(process.env.CONNECTOR_SERVICE_NAME),
      },
    });
  });

  // ── Update check (stub -- Task #97, Connector auto-update, not built) ──
  v1.get('/update/check', (_req, res) => {
    res.json({ updateAvailable: false, currentVersion: runtime.getStatus().version, message: 'Auto-update is not implemented yet (Task #97).' });
  });

  return v1;
}

export function createLocalApiServer(runtime: ConnectorRuntime): Express {
  const app = express();
  app.use(express.json());

  // ── Legacy health check (Phase 6, Task 6.4) -- kept byte-compatible for
  // any existing external poller (none found in this codebase, but this is
  // a cheap, zero-risk thing to preserve rather than break silently), and
  // deliberately left OUTSIDE the /api/v1 versioning scheme -- it predates
  // this API entirely and has its own long-standing shape
  // (`{oracle, connector, connectorVersion, protocolVersion}`) that has
  // nothing to do with this task's versioning decision. New consumers
  // should prefer `GET /api/v1/status`, a strict superset.
  app.get('/health', (_req, res) => {
    const status = runtime.getStatus();
    const allHealthy = status.oracle.connected; // connector process reachability is implied by this response existing at all
    res.status(allHealthy ? 200 : 503).json({
      oracle: status.oracle.connected,
      connector: true,
      connectorVersion: status.version,
      protocolVersion: PROTOCOL_VERSION,
    });
  });

  app.use('/api/v1', buildV1Router(runtime));

  // ── Static Manager UI ────────────────────────────────────────────────
  if (fs.existsSync(STATIC_DIR)) {
    app.use(express.static(STATIC_DIR));
    // SPA fallback: any non-API, non-file route serves index.html so
    // client-side routing (Dashboard/Activation/Oracle/Diagnostics/Logs/
    // About as distinct URLs, not just UI state) works on a hard refresh
    // or a deep link from the tray menu.
    app.get('*', (req: Request, res: Response, next: NextFunction) => {
      if (req.path.startsWith('/api/') || req.path === '/health') { next(); return; }
      res.sendFile(path.join(STATIC_DIR, 'index.html'));
    });
  } else {
    app.get('/', (_req, res) => {
      res.status(200).send(
        'HDSP Connector Manager UI is not built yet. Run `npm run build` in connector-manager/, ' +
        'or use the REST API directly under /api/v1/* (see local-api-server.ts for the route contract).',
      );
    });
  }

  return app;
}

function isValidOracleConfig(config: unknown): config is { host: string; port: number; serviceName: string; username: string; password: string } {
  if (!config || typeof config !== 'object') return false;
  const c = config as Record<string, unknown>;
  return typeof c.host === 'string' && c.host.length > 0
    && typeof c.port === 'number'
    && typeof c.serviceName === 'string' && c.serviceName.length > 0
    && typeof c.username === 'string' && c.username.length > 0
    && typeof c.password === 'string' && c.password.length > 0;
}

export function startLocalApiServer(runtime: ConnectorRuntime, port: number): ReturnType<Express['listen']> {
  const app = createLocalApiServer(runtime);
  return app.listen(port, '127.0.0.1');
}
