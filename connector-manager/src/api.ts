/**
 * Thin client for the Connector's local REST API (Task #103, 2026-07-22).
 *
 * Every call is a relative URL (`/api/...`) -- this app is ALWAYS served
 * by the same process/port it talks to (see `local-api-server.ts`'s
 * static-file serving), so there is no base URL to configure and no CORS
 * to reason about. This is deliberate and load-bearing: the Manager UI
 * must never be pointed at anything other than the Connector Service
 * running on this same machine (per the task's explicit "UI never talks
 * directly to Oracle... only communicates with the Connector Service over
 * localhost" requirement) -- there is intentionally no way to configure a
 * different target.
 */

export interface ConnectorStatus {
  activated: boolean;
  hospital: { tenantId: string | null; connectorId: string | null; hostname: string | null };
  cloud: { connected: boolean; url: string | null };
  oracle: { connected: boolean; target: string | null };
  definitions: { count: number };
  version: string;
  lastSyncAt: string | null;
}

export interface ActivationState {
  activated: boolean;
  tenantId: string | null;
  connectorId: string | null;
  hostname: string | null;
}

export interface OracleConfig {
  host: string;
  port: number;
  serviceName: string;
  username: string;
  mode?: 'thick' | 'thin';
  passwordSet: true;
}

export interface OracleConfigInput {
  host: string;
  port: number;
  serviceName: string;
  username: string;
  password: string;
  mode?: 'thick' | 'thin';
}

export type DiagnosticStatus = 'ok' | 'fail' | 'warn';
export interface DiagnosticCheck { id: string; label: string; status: DiagnosticStatus; message: string }
export interface DiagnosticsReport { generatedAt: string; checks: DiagnosticCheck[] }

export type LogLevel = 'info' | 'warn' | 'error';
export interface LogEntry { timestamp: string; level: LogLevel; message: string }

export interface AboutInfo {
  version: string;
  protocolVersion: string;
  apiVersion: string;
  updateChannel: string;
  windowsService: { name: string | null; managed: boolean };
}

class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function handle<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(body.message ?? `HTTP ${res.status}`, res.status);
  }
  return body as T;
}

export const api = {
  getStatus: () => fetch('/api/v1/status').then((r) => handle<ConnectorStatus>(r)),
  getActivation: () => fetch('/api/v1/activation').then((r) => handle<ActivationState>(r)),
  activate: (activationCode: string, hostname?: string) =>
    fetch('/api/v1/activation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activationCode, hostname }),
    }).then((r) => handle<{ ok: true; tenantId: string; connectorId: string }>(r)),
  reconnect: () => fetch('/api/v1/reconnect', { method: 'POST' }).then((r) => handle(r)),
  restart: () => fetch('/api/v1/restart', { method: 'POST' }).then((r) => handle(r)),
  getOracleConfig: () => fetch('/api/v1/oracle/config').then((r) => handle<OracleConfig | null>(r)),
  saveOracleConfig: (config: OracleConfigInput) =>
    fetch('/api/v1/oracle/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    }).then((r) => handle<{ ok: boolean; message: string }>(r)),
  testOracleConnection: (config: OracleConfigInput) =>
    fetch('/api/v1/oracle/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    }).then((r) => handle<{ ok: boolean; message: string }>(r)),
  getDiagnostics: () => fetch('/api/v1/diagnostics').then((r) => handle<DiagnosticsReport>(r)),
  getLogs: (opts: { level?: LogLevel; limit?: number } = {}) => {
    const params = new URLSearchParams();
    if (opts.level) params.set('level', opts.level);
    if (opts.limit) params.set('limit', String(opts.limit));
    const qs = params.toString();
    return fetch(`/api/v1/logs${qs ? `?${qs}` : ''}`).then((r) => handle<LogEntry[]>(r));
  },
  getAbout: () => fetch('/api/v1/about').then((r) => handle<AboutInfo>(r)),
};

export { ApiError };
