import * as os from 'os';
import { app } from 'electron';
import { postJson, HttpError } from './http-client';
import { KioskAuthState } from '../shared/ipc-channels';
import { logger } from './logger';

/**
 * Talks to the backend's device-facing endpoints
 * (backend/src/modules/platform/kiosk-device/kiosk-registration.controller.ts):
 * `POST /kiosk/register` and `POST /kiosk/token/refresh`. This is the ONE
 * place those two calls are made from -- config-store.ts only persists the
 * result, it never calls the network itself.
 */

const API_PREFIX = '/api/v1';

export class InsecureServerAddressError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InsecureServerAddressError';
  }
}

/**
 * Enforces "no plain HTTP internally" (task feedback item #1) for anything
 * that isn't the hospital's own private network. `https://` is always
 * required for a public hostname/IP (so this app is ready for a real
 * internet-facing multi-tenant deployment like apollo.zoeconnect.in with
 * zero code changes). Plain `http://` is allowed ONLY when the host
 * resolves to the hospital's own LAN or a `.local` hostname/`localhost` --
 * see `isPrivateNetworkHost()`.
 *
 * Rationale for the LAN exception (2026-07-25, in response to real-world
 * deployment feedback): the Windows self-hosted installer
 * (installer/HDSP.iss) runs HDSP as plain-HTTP Windows Services (frontend
 * on :3000, backend on :3001, proxied through the frontend's own /api/*
 * rewrite -- see frontend/next.config.mjs) with no reverse proxy or TLS
 * termination in front of it by default; `infrastructure/nginx/hdsp.conf`
 * is an HTTPS template that exists in the repo but is NOT wired into that
 * installer path. A kiosk till only ever talks to the on-prem HDSP server
 * over the hospital's internal network (never the public internet), so
 * plaintext HTTP there is the same trust boundary as, say, an internal
 * printer or a barcode scanner talking to a till over the LAN -- not the
 * "someone in a coffee shop can sniff this" scenario the original
 * https-only requirement was written to prevent. A hospital that DOES put
 * nginx/TLS in front of its install (or a future cloud/multi-tenant
 * deployment) still gets the full https:// enforcement automatically,
 * since this only relaxes the private-network case.
 *
 * This intentionally throws BEFORE any network call is made, so a
 * mistyped public hostname over http:// can never accidentally register
 * (and thereafter store an access/refresh token) against a plaintext
 * public endpoint.
 */
export function assertSecureServerAddress(serverAddress: string): URL {
  let url: URL;
  try {
    url = new URL(serverAddress);
  } catch {
    throw new InsecureServerAddressError('Enter a valid server address, e.g. https://hdsp-server.hospital.local or http://192.168.1.50:3000');
  }

  if (url.protocol !== 'https:' && !isPrivateNetworkHost(url.hostname)) {
    throw new InsecureServerAddressError(
      'HDSP Kiosk requires https:// for a public server address. Plain http:// is only allowed for a server on the hospital\'s own network (e.g. 192.168.x.x, 10.x.x.x, localhost, or a .local hostname).',
    );
  }

  return url;
}

/**
 * True for hostnames/addresses that can only ever mean "somewhere on this
 * network," never a public internet endpoint: localhost/loopback, the
 * three RFC 1918 private IPv4 ranges, and `.local` mDNS-style hostnames
 * (the `hdsp.hospital.local` naming already used throughout this repo's
 * own docs/nginx templates). A real public hostname or IP always still
 * requires https:// -- this is deliberately narrow, not "anything that
 * isn't obviously public."
 */
function isPrivateNetworkHost(hostname: string): boolean {
  if (hostname === 'localhost' || hostname.endsWith('.local')) return true;

  const ipv4 = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4) return false;
  const [a, b] = [parseInt(ipv4[1], 10), parseInt(ipv4[2], 10)];

  if (a === 127) return true; // loopback
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  return false;
}

function resolveKioskUrl(serverOrigin: string, kioskUrl: string): string {
  // Backend may return an absolute URL or a path like "/token/print-kiosk?branchId=...";
  // resolve the latter against the registered server's own origin so admins
  // can generate activation codes without knowing the till's exact origin string.
  try {
    return new URL(kioskUrl, serverOrigin).toString();
  } catch {
    return kioskUrl;
  }
}

interface RegisterResponse {
  kioskDeviceId: string;
  tenantId: string;
  kioskUrl: string;
  label: string | null;
  accessToken: string;
  refreshToken: string;
}

export async function registerKiosk(serverAddress: string, activationCode: string): Promise<KioskAuthState> {
  const url = assertSecureServerAddress(serverAddress);
  const origin = url.origin;

  const response = await postJson<RegisterResponse>(`${origin}${API_PREFIX}/kiosk/register`, {
    activationCode,
    hostname: os.hostname(),
    appVersion: app.getVersion(),
  });

  logger.info('Kiosk activated', { deviceId: response.kioskDeviceId, serverAddress: origin });

  return {
    serverAddress: origin,
    kioskDeviceId: response.kioskDeviceId,
    tenantId: response.tenantId,
    kioskUrl: resolveKioskUrl(origin, response.kioskUrl),
    label: response.label,
    accessToken: response.accessToken,
    refreshToken: response.refreshToken,
  };
}

interface RefreshResponse {
  kioskDeviceId: string;
  tenantId: string;
  kioskUrl: string;
  accessToken: string;
  refreshToken: string;
}

export async function refreshKioskTokens(state: KioskAuthState): Promise<KioskAuthState> {
  const response = await postJson<RefreshResponse>(
    `${state.serverAddress}${API_PREFIX}/kiosk/token/refresh`,
    { refreshToken: state.refreshToken },
  );

  return {
    ...state,
    kioskUrl: resolveKioskUrl(state.serverAddress, response.kioskUrl),
    accessToken: response.accessToken,
    refreshToken: response.refreshToken,
  };
}

export { HttpError };
