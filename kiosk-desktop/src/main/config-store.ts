import * as fs from 'fs';
import * as path from 'path';
import { safeStorage } from 'electron';
import { KioskAuthState } from '../shared/ipc-channels';
import { logger } from './logger';

/**
 * Persists this till's registration state (server address, device
 * identity, access/refresh tokens) -- the output of a successful
 * `POST /kiosk/register`. Location mirrors connector/src/config's
 * "%ProgramData%\HDSP\<App>\<file>.json" convention (see
 * OracleConfigStore), but unlike that file, this one DOES hold a bearer
 * credential (the refresh token, 90-day-lived), so it's encrypted at rest
 * using Electron's built-in `safeStorage` (backed by Windows DPAPI on
 * Windows, Keychain on macOS) -- the same category of protection
 * connector's SecureJsonStore gives Oracle credentials, without
 * reimplementing DPAPI bindings ourselves.
 *
 * Falls back to plaintext (with a loud log warning) only if
 * `safeStorage.isEncryptionAvailable()` is false, which practically only
 * happens on a Linux box with no keyring configured -- kiosks ship on
 * Windows, so this fallback is a safety net, not the expected path.
 */

const CONFIG_DIR = process.env.KIOSK_CONFIG_DIR
  || (process.platform === 'win32'
    ? path.join(process.env.ProgramData || 'C:\\ProgramData', 'HDSP', 'Kiosk')
    : '/etc/hdsp-kiosk');

const CONFIG_FILE = path.join(CONFIG_DIR, 'kiosk-auth.enc.json');

export class KioskConfigStore {
  private readonly file: string;

  constructor(file: string = CONFIG_FILE) {
    this.file = file;
  }

  load(): KioskAuthState | null {
    // Dev/CI convenience only (mirrors the old KIOSK_URL override) -- lets
    // `npm run dev` point at a manually-registered device's tokens without
    // going through the setup screen every time. Never the production path.
    if (process.env.KIOSK_DEV_STATE_JSON) {
      try {
        return JSON.parse(process.env.KIOSK_DEV_STATE_JSON) as KioskAuthState;
      } catch {
        logger.warn('KIOSK_DEV_STATE_JSON set but not valid JSON -- ignoring');
      }
    }

    try {
      const raw = fs.readFileSync(this.file);
      const json = this.isEncryptedAvailable() ? safeStorage.decryptString(raw) : raw.toString('utf-8');
      const parsed = JSON.parse(json) as KioskAuthState;
      if (!parsed.kioskUrl || !parsed.accessToken) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  save(state: KioskAuthState): void {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const json = JSON.stringify(state);
      const out = this.isEncryptedAvailable() ? safeStorage.encryptString(json) : Buffer.from(json, 'utf-8');
      if (!this.isEncryptedAvailable()) {
        logger.warn('OS-level secure storage unavailable -- kiosk credentials are being saved UNENCRYPTED', { file: this.file });
      }
      fs.writeFileSync(this.file, out);
      logger.info('Kiosk registration saved', { file: this.file, kioskUrl: state.kioskUrl, deviceId: state.kioskDeviceId });
    } catch (err) {
      logger.error('Failed to save kiosk registration', { error: String(err) });
      throw err;
    }
  }

  update(patch: Partial<KioskAuthState>): KioskAuthState | null {
    const current = this.load();
    if (!current) return null;
    const next = { ...current, ...patch };
    this.save(next);
    return next;
  }

  clear(): void {
    try {
      fs.rmSync(this.file, { force: true });
    } catch {
      // best-effort
    }
  }

  isConfigured(): boolean {
    return this.load() !== null;
  }

  private isEncryptedAvailable(): boolean {
    try {
      return safeStorage.isEncryptionAvailable();
    } catch {
      return false;
    }
  }
}
