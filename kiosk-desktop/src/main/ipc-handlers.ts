import { BrowserWindow, ipcMain } from 'electron';
import { KioskChannel, KioskAuthState, ActivateRequest, PrintResult } from '../shared/ipc-channels';
import { KioskConfigStore } from './config-store';
import { printService } from './print-service';
import { registerKiosk, InsecureServerAddressError, HttpError } from './kiosk-auth-client';
import { logger } from './logger';

export interface IpcDeps {
  getWindow: () => BrowserWindow | null;
  configStore: KioskConfigStore;
  onActivated: (state: KioskAuthState) => void | Promise<void>;
  onRetryConnection: () => void | Promise<void>;
}

/**
 * Registers every IPC handler this app exposes, in one place, so the
 * channel <-> handler mapping (and its contract, from shared/ipc-channels)
 * is easy to audit. Only the preload script can reach these -- the kiosk
 * page itself never talks to ipcMain directly (contextIsolation is on and
 * nodeIntegration is off, see main/window.ts).
 */
export function registerIpcHandlers(deps: IpcDeps): void {
  ipcMain.handle(KioskChannel.PRINT, async (): Promise<PrintResult> => {
    const win = deps.getWindow();
    if (!win) return { ok: false, error: 'No kiosk window available' };
    try {
      return await printService.printSilently(win.webContents);
    } catch (err) {
      logger.error('Print IPC handler failed', { error: String(err) });
      return { ok: false, error: String(err) };
    }
  });

  ipcMain.handle(KioskChannel.GET_STATE, (): KioskAuthState | null => {
    return deps.configStore.load();
  });

  ipcMain.handle(KioskChannel.ACTIVATE, async (_event, req: ActivateRequest) => {
    if (!req?.serverAddress || !req?.activationCode) {
      return { ok: false, error: 'Server address and activation code are required.' };
    }
    try {
      const state = await registerKiosk(req.serverAddress, req.activationCode);
      deps.configStore.save(state);
      await deps.onActivated(state);
      return { ok: true };
    } catch (err) {
      if (err instanceof InsecureServerAddressError) {
        logger.warn('Kiosk activation rejected (insecure server address)', { serverAddress: req.serverAddress });
        return { ok: false, error: err.message };
      }
      if (err instanceof HttpError) {
        logger.warn('Kiosk activation rejected by server', { status: err.status, message: err.message });
        return { ok: false, error: err.message };
      }
      logger.error('Kiosk activation failed', { error: String(err), serverAddress: req.serverAddress });
      return { ok: false, error: 'Could not reach that server. Check the address and try again.' };
    }
  });

  ipcMain.handle(KioskChannel.RETRY_CONNECTION, async () => {
    await deps.onRetryConnection();
    return { ok: true };
  });
}
