import { WebContents } from 'electron';
import { logger } from './logger';

/**
 * Printer-target abstraction (task feedback item #4: "abstract
 * PrinterService -> Default Printer... later becomes PrinterService ->
 * Configured Printer without changing callers"). Today `resolvePrinterName()`
 * always returns undefined (Electron's `webContents.print()` uses the OS
 * default printer when `deviceName` is omitted); PrintService
 * (print-service.ts) already calls through this abstraction rather than
 * hardcoding that behavior itself, so wiring in a real per-queue/per-kiosk
 * printer picker later is a one-method change here, not a change to every
 * print call site.
 */
export class PrinterService {
  /**
   * Placeholder for a future configured printer name (e.g. read from a
   * local kiosk setting once a printer-picker UI exists). Returns
   * undefined today, which PrintService interprets as "use the OS default
   * printer" -- exactly today's behavior, just routed through one seam.
   */
  async resolvePrinterName(_contents: WebContents): Promise<string | undefined> {
    return undefined;
  }

  /** Lists printers visible to this WebContents -- the building block a future picker UI would call. */
  async listPrinters(contents: WebContents): Promise<Electron.PrinterInfo[]> {
    try {
      return await contents.getPrintersAsync();
    } catch (err) {
      logger.warn('Could not enumerate printers', { error: String(err) });
      return [];
    }
  }
}

export const printerService = new PrinterService();
