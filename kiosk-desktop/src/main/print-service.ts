import { WebContents } from 'electron';
import { PrintResult } from '../shared/ipc-channels';
import { printConfigCache } from './print-config-cache';
import { printerService } from './printer-service';
import { logger } from './logger';

/**
 * Silent, dialog-free printing for the kiosk.
 *
 * Highest-priority requirement from the task: replace the kiosk's
 * `window.print()` (which opens the browser print-preview dialog) with
 * Electron's `webContents.print({ silent: true })`. This service is the
 * ONLY place that calls webContents.print in this app -- ipc-handlers.ts
 * just delegates to it, so there is exactly one silent-print code path to
 * reason about/maintain.
 *
 * Paper size: HDSP already has a Kiosk Configuration -> Print Config page
 * (frontend/src/app/(platform)/token/print-config/page.tsx) backed by
 * `GET/PUT /token/print-config` (public GET, used by the kiosk itself --
 * see backend/src/modules/token/token.controller.ts). That endpoint
 * returns `paperSize` as a CSS width string (e.g. "58mm", "80mm", "3in").
 * We read that SAME endpoint here (via print-config-cache.ts, refreshed in
 * the background every 30s rather than fetched fresh on every print -- see
 * that file's doc comment) and convert it to the microns width Electron's
 * custom pageSize expects, instead of introducing a second paper-size
 * configuration screen/store.
 *
 * Printer target: delegated to printer-service.ts's PrinterService, which
 * today always resolves to "OS default printer" (undefined `deviceName`)
 * but is the single seam a future per-till printer picker would change.
 */

export interface ResolvedPaperSize {
  widthMicrons: number;
  heightMicrons: number;
  raw: string;
}

// Receipt/token slips are typically much longer than they are wide once
// printed; the backend doesn't (yet) configure a height, so this is a
// generous default that comfortably fits the existing print-kiosk layout.
// Deployers can override per-machine via KIOSK_PRINT_HEIGHT_MM without
// touching the shared backend config (this is a printer/driver tuning
// knob, not a second source of truth for paper WIDTH, which always comes
// from the backend).
const DEFAULT_HEIGHT_MM = Number(process.env.KIOSK_PRINT_HEIGHT_MM) || 150;
const MICRONS_PER_MM = 1000;
const MICRONS_PER_INCH = 25400;

function parseLengthToMicrons(value: string, fallbackMm: number): number {
  const match = /^\s*([\d.]+)\s*(mm|cm|in)?\s*$/i.exec(value);
  if (!match) return fallbackMm * MICRONS_PER_MM;

  const num = parseFloat(match[1]);
  const unit = (match[2] || 'mm').toLowerCase();
  if (Number.isNaN(num) || num <= 0) return fallbackMm * MICRONS_PER_MM;

  switch (unit) {
    case 'in':
      return Math.round(num * MICRONS_PER_INCH);
    case 'cm':
      return Math.round(num * 10 * MICRONS_PER_MM);
    default:
      return Math.round(num * MICRONS_PER_MM);
  }
}

export function resolvePaperSize(paperSize: string): ResolvedPaperSize {
  return {
    widthMicrons: parseLengthToMicrons(paperSize, 80),
    heightMicrons: DEFAULT_HEIGHT_MM * MICRONS_PER_MM,
    raw: paperSize,
  };
}

export class PrintService {
  /**
   * Prints the given WebContents with no dialog and no print preview.
   * Paper width comes from the in-memory print-config cache (no network
   * call on the print path itself); printer target comes from
   * PrinterService (OS default today).
   */
  async printSilently(contents: WebContents): Promise<PrintResult> {
    const pageUrl = contents.getURL();

    if (!pageUrl || pageUrl.startsWith('file://')) {
      // Nothing meaningful loaded yet (e.g. still on the offline page).
      return { ok: false, error: 'No kiosk page is currently loaded to print.' };
    }

    const { widthMicrons, heightMicrons, raw } = resolvePaperSize(printConfigCache.getPaperSize());
    const printerName = await printerService.resolvePrinterName(contents);

    return new Promise((resolve) => {
      contents.print(
        {
          silent: true,
          printBackground: true,
          margins: { marginType: 'none' },
          pageSize: { width: widthMicrons, height: heightMicrons },
          ...(printerName ? { deviceName: printerName } : {}),
        },
        (success, failureReason) => {
          if (success) {
            logger.info('Silent print succeeded', { paperSize: raw });
            resolve({ ok: true });
          } else {
            logger.error('Silent print failed', { failureReason, paperSize: raw });
            resolve({ ok: false, error: failureReason });
          }
        },
      );
    });
  }
}

export const printService = new PrintService();
