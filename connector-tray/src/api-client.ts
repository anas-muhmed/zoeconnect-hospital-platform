/**
 * Thin client for the Connector Service's local REST API, used by the
 * tray process for every menu action (Task #103, 2026-07-22). Deliberately
 * duplicated from (not shared with) `connector-manager/src/api.ts` --
 * these are two separate npm packages with two separate build pipelines
 * (a Vite SPA vs. a plain `tsc`-compiled Node CLI), and the surface this
 * file actually needs is a small fraction of the full contract (no Oracle
 * config forms, no activation form -- those stay in the browser UI). A
 * shared `@hdsp/connector-api-client` package would be the right move if
 * a THIRD consumer of this contract shows up; not worth the extra
 * workspace-package machinery for two.
 */

const PORT = process.env.CONNECTOR_MANAGER_PORT ? parseInt(process.env.CONNECTOR_MANAGER_PORT, 10) : 4200;
const BASE_URL = `http://127.0.0.1:${PORT}`;

export function managerUrl(): string {
  return BASE_URL;
}

async function call(path: string, method: 'GET' | 'POST' = 'GET'): Promise<any> {
  const res = await fetch(`${BASE_URL}${path}`, { method });
  if (!res.ok) {
    throw new Error(`${method} ${path} failed: HTTP ${res.status}`);
  }
  return res.json();
}

export const connectorApi = {
  getStatus: () => call('/api/v1/status'),
  reconnect: () => call('/api/v1/reconnect', 'POST'),
  restart: () => call('/api/v1/restart', 'POST'),
  runDiagnostics: () => call('/api/v1/diagnostics'),
  checkForUpdates: () => call('/api/v1/update/check'),
};
