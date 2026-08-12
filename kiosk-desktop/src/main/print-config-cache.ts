import { getJson } from './http-client';
import { logger } from './logger';

/**
 * Caches the backend's `/token/print-config` response (task feedback item
 * #3: "cache it... otherwise every print waits for a network request").
 * Refreshed on startup and every REFRESH_INTERVAL_MS in the background;
 * `PrintService` (print-service.ts) reads the cache synchronously via
 * `getPaperSize()` so a print never blocks on a network round-trip. If the
 * very first fetch hasn't completed yet (e.g. printing seconds after
 * launch), `getPaperSize()` falls back to the same 80mm default the
 * backend itself defaults to (see token.service.ts getPrintConfig) --
 * `start()` also kicks off an immediate refresh so this window is normally
 * well under a second.
 */

interface PrintConfigResponse {
  paperSize?: string;
  [key: string]: unknown;
}

const REFRESH_INTERVAL_MS = 30_000;
const DEFAULT_PAPER_SIZE = '80mm';

export class PrintConfigCache {
  private cached: PrintConfigResponse | null = null;
  private timer: NodeJS.Timeout | null = null;
  private currentKioskUrl: string | null = null;

  start(kioskUrl: string): void {
    if (kioskUrl !== this.currentKioskUrl) this.cached = null; // e.g. re-activated against a different tenant
    this.currentKioskUrl = kioskUrl;
    this.stop();
    this.timer = setInterval(() => void this.refresh(), REFRESH_INTERVAL_MS);
    void this.refresh();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async refresh(): Promise<void> {
    if (!this.currentKioskUrl) return;
    try {
      const origin = new URL(this.currentKioskUrl).origin;
      this.cached = await getJson<PrintConfigResponse>(`${origin}/api/v1/token/print-config`);
    } catch (err) {
      logger.warn('Could not refresh /token/print-config cache', { error: String(err) });
      // Keep serving the last-known-good value; only fall back to the
      // hardcoded default if we've never successfully fetched at all.
    }
  }

  /** Synchronous read for PrintService -- never blocks a print on the network. */
  getPaperSize(): string {
    const cached = this.cached?.paperSize;
    return typeof cached === 'string' ? cached : DEFAULT_PAPER_SIZE;
  }
}

export const printConfigCache = new PrintConfigCache();
