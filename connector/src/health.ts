import * as http from 'http';
import type { Connector } from './connector';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { version: CONNECTOR_VERSION } = require('../package.json');
// Phase 12 (Task 12.5): PROTOCOL_VERSION is the Message Transport request/
// response shape's own version (message-transport.interface.ts), not the
// npm package version -- the two can (and eventually will) change
// independently. Bump this only when that shape changes in a
// backward-incompatible way; see connector/COMPATIBILITY.json.
export const PROTOCOL_VERSION = '1';

/**
 * Connector health-check endpoint (Phase 6, Task 6.4).
 *
 * Extends the same pattern as the backend's existing
 * `common/health/oracle.health.ts` (TCP-reachability-based, non-throwing,
 * reports status rather than gating startup) but as a plain HTTP endpoint
 * rather than a `@nestjs/terminus` indicator, since the Connector is a
 * standalone process with no NestJS runtime. A future integration (Phase
 * 7) could have the backend's own health check poll this endpoint to
 * report Connector reachability alongside Oracle reachability.
 */
export function startHealthServer(connector: Connector, port: number): http.Server {
  const server = http.createServer((req, res) => {
    if (req.url !== '/health') {
      res.writeHead(404);
      res.end();
      return;
    }
    const status = connector.isHealthy();
    const allHealthy = status.oracle && status.connector;
    // Phase 12 (Task 12.5): version/protocolVersion added to the health
    // payload so a caller (a future backend-side compatibility check, or
    // the installer's check-compatibility.js) can read what it's actually
    // talking to, rather than assuming from a config file alone. Additive
    // -- existing consumers reading only `.oracle`/`.connector` are
    // unaffected.
    res.writeHead(allHealthy ? 200 : 503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ...status, connectorVersion: CONNECTOR_VERSION, protocolVersion: PROTOCOL_VERSION }));
  });
  server.listen(port);
  return server;
}
