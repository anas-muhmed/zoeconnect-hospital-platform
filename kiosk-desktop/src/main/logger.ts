import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

/**
 * Minimal file + console logger. Deliberately dependency-free (no winston/
 * pino) to keep this package's footprint small, mirroring the connector
 * package's own "no unnecessary deps" style. Writes to
 * %ProgramData%\HDSP\Kiosk\logs\kiosk.log on Windows so hospital IT can
 * pull logs without needing dev tools access (which is disabled in kiosk
 * mode, see main/window.ts).
 */

const LOG_DIR = process.env.KIOSK_LOG_DIR
  || (process.platform === 'win32'
    ? path.join(process.env.ProgramData || 'C:\\ProgramData', 'HDSP', 'Kiosk', 'logs')
    : path.join(app.getPath('userData'), 'logs'));

const LOG_FILE = path.join(LOG_DIR, 'kiosk.log');
const MAX_LOG_BYTES = 5 * 1024 * 1024; // 5MB, then rotate once to .log.1

function ensureLogDir(): void {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  } catch {
    // Best-effort: if we can't create the log dir, fall back to console-only.
  }
}

function rotateIfNeeded(): void {
  try {
    const stat = fs.statSync(LOG_FILE);
    if (stat.size > MAX_LOG_BYTES) {
      fs.renameSync(LOG_FILE, `${LOG_FILE}.1`);
    }
  } catch {
    // File doesn't exist yet -- nothing to rotate.
  }
}

function write(level: string, message: string, meta?: unknown): void {
  const line = `[${new Date().toISOString()}] [${level}] ${message}${
    meta !== undefined ? ' ' + safeStringify(meta) : ''
  }`;

  // eslint-disable-next-line no-console
  (level === 'ERROR' ? console.error : console.log)(line);

  try {
    ensureLogDir();
    rotateIfNeeded();
    fs.appendFileSync(LOG_FILE, line + '\n');
  } catch {
    // Logging must never crash the kiosk.
  }
}

function safeStringify(meta: unknown): string {
  try {
    return typeof meta === 'string' ? meta : JSON.stringify(meta);
  } catch {
    return String(meta);
  }
}

export const logger = {
  info: (message: string, meta?: unknown) => write('INFO', message, meta),
  warn: (message: string, meta?: unknown) => write('WARN', message, meta),
  error: (message: string, meta?: unknown) => write('ERROR', message, meta),
  logFilePath: LOG_FILE,
};
