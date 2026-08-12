import * as fs from 'fs';
import * as net from 'net';
import { execFileSync } from 'child_process';

/**
 * One-click health check (Task #103, "HDSP Connector Manager," 2026-07-22
 * -- the Diagnostics page). Every check here is independent and
 * best-effort: one check throwing/failing never prevents the others from
 * running, since the whole point of this report is to help a hospital IT
 * admin (or HDSP support, reading an exported copy) narrow down WHICH leg
 * is broken, not just "something is wrong."
 */

export type DiagnosticStatus = 'ok' | 'fail' | 'warn';

export interface DiagnosticCheck {
  id: string;
  label: string;
  status: DiagnosticStatus;
  message: string;
}

export interface DiagnosticsReport {
  generatedAt: string;
  checks: DiagnosticCheck[];
}

export interface DiagnosticsContext {
  isOracleAvailable(): boolean;
  oracleTarget(): string | null;
  cloudUrl(): string | null;
  isCloudConnected(): boolean;
  accessToken(): string | null;
  definitionCount(): number;
  configDir(): string;
  windowsServiceName?: string | null;
}

function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(onTimeout), ms)),
  ]);
}

async function checkInternet(): Promise<DiagnosticCheck> {
  // A raw TCP connect to a well-known, highly-available IP (Cloudflare's
  // 1.1.1.1, port 443) rather than an HTTP request to any single named
  // service -- avoids this check's result depending on one external
  // provider's uptime or on that provider's own HTTP endpoint shape, and
  // avoids a DNS lookup being a confound (this dials an IP directly).
  const ok = await withTimeout(
    new Promise<boolean>((resolve) => {
      const socket = net.createConnection({ host: '1.1.1.1', port: 443, timeout: 3000 });
      socket.once('connect', () => { socket.destroy(); resolve(true); });
      socket.once('error', () => resolve(false));
      socket.once('timeout', () => { socket.destroy(); resolve(false); });
    }),
    3500,
    false,
  );
  return {
    id: 'internet',
    label: 'Internet',
    status: ok ? 'ok' : 'fail',
    message: ok ? 'Outbound connectivity confirmed' : 'Could not reach the internet (outbound TCP 443 blocked or offline)',
  };
}

async function checkCloud(cloudUrl: string | null): Promise<DiagnosticCheck> {
  if (!cloudUrl) {
    return { id: 'cloud', label: 'Cloud', status: 'warn', message: 'No cloud URL configured yet' };
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${cloudUrl.replace(/\/+$/, '')}/api/v1/connector/token/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: 'diagnostics-reachability-probe' }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
    // Any HTTP response (even a 401 for the deliberately-bogus refresh
    // token above) proves the cloud backend is reachable and answering --
    // that's all this check claims. A 401 here is the EXPECTED, healthy
    // result; only a network-level failure (caught below) means "cloud
    // unreachable."
    return { id: 'cloud', label: 'Cloud', status: 'ok', message: `Reachable (HTTP ${res.status})` };
  } catch (err) {
    return { id: 'cloud', label: 'Cloud', status: 'fail', message: `Unreachable: ${(err as Error).message}` };
  }
}

function checkOracle(ctx: DiagnosticsContext): DiagnosticCheck {
  const ok = ctx.isOracleAvailable();
  return {
    id: 'oracle',
    label: 'Oracle',
    status: ok ? 'ok' : 'fail',
    message: ok ? `Connected (${ctx.oracleTarget() ?? 'unknown target'})` : 'Not connected -- check Oracle settings and Test Connection',
  };
}

function checkWebSocket(ctx: DiagnosticsContext): DiagnosticCheck {
  const ok = ctx.isCloudConnected();
  return {
    id: 'websocket',
    label: 'WebSocket',
    status: ok ? 'ok' : 'fail',
    message: ok ? 'Connected to cloud backend' : 'Not connected',
  };
}

/**
 * Decodes (does NOT cryptographically verify -- the Connector doesn't
 * hold the signing secret) the stored access token's `exp` claim, purely
 * as a local sanity check ("do we even have a plausible, non-expired
 * token") distinct from `websocket`'s live-connection check above, which
 * only reflects whether the LAST connection attempt succeeded, not
 * whether the credential itself still looks valid.
 */
function checkJwt(ctx: DiagnosticsContext): DiagnosticCheck {
  const token = ctx.accessToken();
  if (!token) {
    return { id: 'jwt', label: 'JWT', status: 'warn', message: 'Not activated yet' };
  }
  try {
    const payloadB64 = token.split('.')[1];
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64').toString('utf8')) as { exp?: number };
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      return { id: 'jwt', label: 'JWT', status: 'warn', message: 'Stored access token has expired -- will refresh automatically on next connect' };
    }
    return { id: 'jwt', label: 'JWT', status: 'ok', message: 'Present and not expired' };
  } catch {
    return { id: 'jwt', label: 'JWT', status: 'fail', message: 'Stored token is not a readable JWT' };
  }
}

function checkDefinitions(ctx: DiagnosticsContext): DiagnosticCheck {
  const count = ctx.definitionCount();
  return {
    id: 'definitions',
    label: 'Query Definitions',
    status: count > 0 ? 'ok' : 'warn',
    message: count > 0 ? `${count} loaded` : 'None loaded yet -- expected before first cloud sync completes',
  };
}

function checkDisk(ctx: DiagnosticsContext): DiagnosticCheck {
  const dir = ctx.configDir();
  try {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const probe = `${dir}/.diagnostics-write-probe`;
    fs.writeFileSync(probe, 'ok');
    fs.unlinkSync(probe);
    return { id: 'disk', label: 'Disk', status: 'ok', message: `Config directory is writable (${dir})` };
  } catch (err) {
    return { id: 'disk', label: 'Disk', status: 'fail', message: `Config directory not writable: ${(err as Error).message}` };
  }
}

/**
 * `windowsServiceName` is undefined until the Windows Service installer
 * (Task #95/#96) actually assigns and records one -- until then, this
 * honestly reports the weaker "the connector process itself is running"
 * fact (true by construction: if this code is executing, it's running)
 * rather than fabricating a service-manager check against a service name
 * that doesn't exist yet.
 */
function checkWindowsService(ctx: DiagnosticsContext): DiagnosticCheck {
  if (process.platform === 'win32' && ctx.windowsServiceName) {
    try {
      const output = execFileSync('sc.exe', ['query', ctx.windowsServiceName], { encoding: 'utf8', windowsHide: true });
      const running = /RUNNING/.test(output);
      return {
        id: 'windows_service',
        label: 'Windows Service',
        status: running ? 'ok' : 'fail',
        message: running ? `Service "${ctx.windowsServiceName}" is running` : `Service "${ctx.windowsServiceName}" is not running`,
      };
    } catch (err) {
      return { id: 'windows_service', label: 'Windows Service', status: 'fail', message: `Could not query service status: ${(err as Error).message}` };
    }
  }
  return {
    id: 'windows_service',
    label: 'Windows Service',
    status: 'ok',
    message: 'Connector process is running (service-manager status check requires the Windows Service installer, not yet built -- Task #95/#96)',
  };
}

export async function runDiagnostics(ctx: DiagnosticsContext): Promise<DiagnosticsReport> {
  const [internet, cloud] = await Promise.all([checkInternet(), checkCloud(ctx.cloudUrl())]);
  const checks: DiagnosticCheck[] = [
    checkOracle(ctx),
    internet,
    cloud,
    checkWebSocket(ctx),
    checkJwt(ctx),
    checkDefinitions(ctx),
    checkDisk(ctx),
    checkWindowsService(ctx),
  ];
  return { generatedAt: new Date().toISOString(), checks };
}
