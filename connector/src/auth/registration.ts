/**
 * Connector registration/auth client (HDSP Connector, Phase A — 2026-07-21).
 *
 * Talks to the two backend endpoints built alongside this file
 * (`ConnectorRegistrationController`, `backend/src/modules/platform/connector/`):
 * `POST /api/v1/connector/register` (one-time pairing key exchange) and
 * `POST /api/v1/connector/token/refresh` (rotate an access+refresh pair).
 *
 * Deliberately uses Node's built-in `fetch` (stable since Node 18, this
 * package's minimum supported runtime per its `tsconfig.json` target) --
 * no new HTTP client dependency added to a package whose entire
 * dependency list today is `@hdsp/oracle-client` + `ioredis`.
 *
 * This module does NOT open the persistent WSS connection (that's Phase
 * B, not built yet) -- it only performs the one-shot HTTP calls that
 * establish/refresh a connector's identity. `index.ts`'s startup sequence
 * (not yet wired to this file -- see this phase's own scope note) will
 * call `registerConnector()` once on first boot (when no stored
 * credentials exist) and `refreshConnectorToken()` on subsequent boots
 * or when the stored access token is close to expiry.
 */

export interface ConnectorCredentials {
  connectorId: string;
  tenantId: string;
  accessToken: string;
  refreshToken: string;
}

/**
 * Onboarding UX redirect (2026-07-22, see HDSP_CLOUD_CONNECTOR_ARCHITECTURE.md
 * §16): `tenantCode` is now optional and the credential field is
 * `activationCode`, not `pairingKey` -- matching
 * `RegisterConnectorDto`/`ConnectorRegistrationService.register()` on the
 * backend (Task #101). This struct previously required `tenantCode` and
 * used the old field name; a caller built against the old shape would 400
 * against today's backend, since `pairingKey` is no longer a field the DTO
 * recognizes at all.
 */
export interface RegisterConnectorParams {
  cloudUrl: string;
  tenantCode?: string;
  activationCode: string;
  hostname?: string;
}

function apiUrl(cloudUrl: string, path: string): string {
  return `${cloudUrl.replace(/\/+$/, '')}/api/v1${path}`;
}

async function parseErrorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string | string[] };
    if (Array.isArray(body.message)) return body.message.join(', ');
    return body.message ?? `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

/**
 * Redeems a one-time Activation Code. Throws on any non-2xx response --
 * callers should treat this as fatal for the current attempt (retry with
 * backoff at the caller, not inside this function -- a wrong code retried
 * in a tight loop would just get rate-limited by the backend's
 * `@Throttle()` guard, see the controller).
 */
export async function registerConnector(params: RegisterConnectorParams): Promise<ConnectorCredentials> {
  const res = await fetch(apiUrl(params.cloudUrl, '/connector/register'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tenantCode: params.tenantCode,
      activationCode: params.activationCode,
      hostname: params.hostname,
    }),
  });

  if (!res.ok) {
    throw new Error(`Connector registration failed: ${await parseErrorMessage(res)}`);
  }

  return (await res.json()) as ConnectorCredentials;
}

/**
 * Exchanges a still-valid (or recently-expired-but-within-blacklist-grace)
 * refresh token for a fresh access+refresh pair. The OLD refresh token is
 * invalidated server-side the moment this succeeds (see
 * `ConnectorRegistrationService.refresh()`'s blacklist-on-rotate) -- the
 * caller must persist the NEW pair before this promise resolves is relied
 * upon anywhere else, or a crash between rotation and persistence would
 * strand the connector with a dead refresh token. `token-store.ts`'s
 * `refreshAndPersist()` wraps this together with the store write for
 * exactly that reason.
 */
export async function refreshConnectorToken(cloudUrl: string, refreshToken: string): Promise<ConnectorCredentials> {
  const res = await fetch(apiUrl(cloudUrl, '/connector/token/refresh'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });

  if (!res.ok) {
    throw new Error(`Connector token refresh failed: ${await parseErrorMessage(res)}`);
  }

  return (await res.json()) as ConnectorCredentials;
}
