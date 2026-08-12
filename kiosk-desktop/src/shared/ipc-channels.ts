/**
 * IPC channel names and payload/result types shared between the main
 * process and the preload script. Kept in one place (instead of scattering
 * string literals) so main/ipc-handlers.ts and preload/index.ts can never
 * drift out of sync -- this is the "IPC abstraction" called out in the
 * task's code-quality requirements.
 *
 * Nothing in here is renderer-page-facing directly: the existing kiosk
 * React/Next.js app is loaded completely unmodified (see main/window.ts),
 * so these channels are only ever invoked by preload/index.ts on the
 * page's behalf (e.g. via its window.print() override), or by our own
 * local setup/disabled screens (resources/*.html).
 */

export const KioskChannel = {
  /** Renderer/preload -> main: print the current page silently. */
  PRINT: 'kiosk:print',
  /** Renderer/preload -> main: read the current activation/registration state. */
  GET_STATE: 'kiosk:get-state',
  /** Renderer/preload -> main: activate this till with a server address + activation code. */
  ACTIVATE: 'kiosk:activate',
  /** Renderer/preload -> main: ask main to retry loading the kiosk page now. */
  RETRY_CONNECTION: 'kiosk:retry-connection',
  /** Main -> renderer (setup/offline/disabled windows): connection/registration status changed. */
  STATE_CHANGED: 'kiosk:state-changed',
} as const;

/**
 * Persisted, per-till registration state -- the result of a successful
 * `POST /kiosk/register` (see backend/src/modules/platform/kiosk-device).
 * Replaces the earlier "just type in a kiosk URL" config: the URL, tenant,
 * and device identity are now all issued by the backend from a single
 * one-time activation code, the same shape as the HDSP Connector's own
 * activation flow. See kiosk-desktop/README.md's "Registration" section.
 */
export interface KioskAuthState {
  /** Origin the kiosk registered against, e.g. "https://hdsp-server.hospital.local". Used for all subsequent API calls (heartbeat, token refresh, print-config). */
  serverAddress: string;
  kioskDeviceId: string;
  tenantId: string;
  /** The page this till should display, as returned by the backend at registration time. */
  kioskUrl: string;
  label: string | null;
  accessToken: string;
  refreshToken: string;
}

export interface ActivateRequest {
  serverAddress: string;
  activationCode: string;
}

export interface ActivateResult {
  ok: boolean;
  error?: string;
}

export type KioskRuntimeStatus =
  | 'unconfigured'   // no saved activation yet -- show setup screen
  | 'connecting'
  | 'online'
  | 'offline'        // server unreachable
  | 'disabled'       // backend says this device is administratively disabled
  | 'revoked';       // backend says this device is revoked -- needs re-activation

export interface PrintResult {
  ok: boolean;
  error?: string;
}
