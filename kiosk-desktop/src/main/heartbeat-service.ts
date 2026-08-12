import * as os from 'os';
import { app } from 'electron';
import { postJson, HttpError } from './http-client';
import { refreshKioskTokens } from './kiosk-auth-client';
import { KioskConfigStore } from './config-store';
import { KioskRuntimeStatus } from '../shared/ipc-channels';
import { logger } from './logger';

/**
 * Liveness check-in (task feedback item #5): every 30s, POSTs to
 * `POST /kiosk/heartbeat` (backend/.../kiosk-registration.controller.ts)
 * so Vendor Portal / HDSP admin can show this till as online, with a
 * last-seen timestamp, without any per-hospital polling infrastructure --
 * the till pushes its own status.
 *
 * Also doubles as this app's OWN liveness signal for itself: a failed
 * heartbeat updates local runtime status (offline/disabled/revoked) the
 * same way main/connection-monitor.ts's reachability poll used to, so
 * that mechanism has been folded into this one loop rather than running
 * two separate 30s timers against the same server.
 */

const HEARTBEAT_INTERVAL_MS = 30_000;
const API_PREFIX = '/api/v1';

export class HeartbeatService {
  private timer: NodeJS.Timeout | null = null;
  private inFlight = false;

  constructor(
    private readonly configStore: KioskConfigStore,
    private readonly onStatusChange: (status: KioskRuntimeStatus) => void,
  ) {}

  start(): void {
    this.stop();
    this.timer = setInterval(() => void this.beatOnce(), HEARTBEAT_INTERVAL_MS);
    void this.beatOnce();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async beatOnce(): Promise<void> {
    if (this.inFlight) return; // don't pile up if a previous call is still hanging
    this.inFlight = true;
    try {
      let state = this.configStore.load();
      if (!state) {
        this.onStatusChange('unconfigured');
        return;
      }

      try {
        await this.sendHeartbeat(state.serverAddress, state.accessToken);
        this.onStatusChange('online');
        return;
      } catch (err) {
        if (err instanceof HttpError && err.status === 401) {
          // Access token expired -- refresh and retry once.
          try {
            state = await refreshKioskTokens(state);
            this.configStore.save(state);
            await this.sendHeartbeat(state.serverAddress, state.accessToken);
            this.onStatusChange('online');
            return;
          } catch (refreshErr) {
            logger.warn('Kiosk token refresh failed during heartbeat', { error: String(refreshErr) });
            this.onStatusChange('revoked');
            return;
          }
        }
        if (err instanceof HttpError && err.status === 403) {
          this.onStatusChange('disabled');
          return;
        }
        // Network-level failure (server unreachable) -- not a device-status
        // problem, just connectivity.
        logger.warn('Heartbeat failed (server unreachable)', { error: String(err) });
        this.onStatusChange('offline');
      }
    } finally {
      this.inFlight = false;
    }
  }

  private async sendHeartbeat(serverAddress: string, accessToken: string): Promise<void> {
    await postJson(
      `${serverAddress}${API_PREFIX}/kiosk/heartbeat`,
      { hostname: os.hostname(), appVersion: app.getVersion() },
      { Authorization: `Bearer ${accessToken}` },
    );
  }
}
