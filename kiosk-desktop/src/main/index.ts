import { app, BrowserWindow, globalShortcut } from 'electron';
import { disableApplicationMenu } from './menu';
import { KioskConfigStore } from './config-store';
import { HeartbeatService } from './heartbeat-service';
import { printConfigCache } from './print-config-cache';
import { registerIpcHandlers } from './ipc-handlers';
import { checkForUpdates } from './updater';
import {
  createKioskWindow, isShowingLocalPage, loadKioskPage, loadOfflinePage, loadSetupPage, loadDisabledPage,
} from './window';
import { logger } from './logger';
import { KioskAuthState, KioskRuntimeStatus } from '../shared/ipc-channels';

/**
 * Entry point / app orchestration. Deliberately thin -- everything it does
 * is delegate to a single-purpose module (window, config, print, IPC,
 * heartbeat) so each concern stays independently testable and this file
 * reads as the wiring, not the logic.
 */

// Hospitals typically run one kiosk instance per till; this also protects
// against double-launch (e.g. a stuck previous process + Windows auto-start
// both firing) leaving two fullscreen windows fighting for focus.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

const configStore = new KioskConfigStore();
let mainWindow: BrowserWindow | null = null;
let lastStatus: KioskRuntimeStatus | null = null;

function currentKioskUrl(): string | null {
  return configStore.load()?.kioskUrl ?? null;
}

async function handleActivated(state: KioskAuthState): Promise<void> {
  if (!mainWindow) return;
  await loadKioskPage(mainWindow, state.kioskUrl);
  printConfigCache.start(state.kioskUrl);
  heartbeatService.start();
}

async function handleStatusChange(status: KioskRuntimeStatus): Promise<void> {
  if (!mainWindow) return;
  if (status === lastStatus) return; // avoid redundant page swaps on every 30s tick
  lastStatus = status;

  switch (status) {
    case 'unconfigured':
      if (!isShowingLocalPage(mainWindow, 'setup')) await loadSetupPage(mainWindow);
      break;
    case 'offline':
      if (!isShowingLocalPage(mainWindow, 'offline')) await loadOfflinePage(mainWindow);
      break;
    case 'disabled':
      if (!isShowingLocalPage(mainWindow, 'disabled')) await loadDisabledPage(mainWindow, 'disabled');
      break;
    case 'revoked':
      if (!isShowingLocalPage(mainWindow, 'disabled')) await loadDisabledPage(mainWindow, 'revoked');
      break;
    case 'online': {
      const showingLocalPage =
        isShowingLocalPage(mainWindow, 'offline')
        || isShowingLocalPage(mainWindow, 'disabled')
        || isShowingLocalPage(mainWindow, 'setup');
      const url = currentKioskUrl();
      if (showingLocalPage && url) await loadKioskPage(mainWindow, url);
      break;
    }
    default:
      break;
  }
}

const heartbeatService = new HeartbeatService(configStore, (status) => void handleStatusChange(status));

async function handleRetryConnection(): Promise<void> {
  await heartbeatService.beatOnce();
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(async () => {
  disableApplicationMenu();
  checkForUpdates();

  mainWindow = createKioskWindow();

  registerIpcHandlers({
    getWindow: () => mainWindow,
    configStore,
    onActivated: handleActivated,
    onRetryConnection: handleRetryConnection,
  });

  // Maintenance escape hatch: kiosk mode intentionally has no address bar,
  // menu, or devtools -- Ctrl+Alt+K is the one documented way (see
  // README.md / DEPLOYMENT_GUIDE.md) for hospital IT to get back to the
  // activation screen and re-register this station (new URL, new tenant,
  // recovering from a revoked device, etc).
  globalShortcut.register('Control+Alt+K', () => {
    lastStatus = null; // force the next heartbeat status to re-evaluate the page even if unchanged
    if (mainWindow) void loadSetupPage(mainWindow);
  });

  const state = configStore.load();
  if (state) {
    await loadKioskPage(mainWindow, state.kioskUrl);
    printConfigCache.start(state.kioskUrl);
  } else {
    await loadSetupPage(mainWindow);
  }
  heartbeatService.start();

  logger.info('HDSP Kiosk started', { version: app.getVersion() });
});

app.on('window-all-closed', () => {
  heartbeatService.stop();
  printConfigCache.stop();
  globalShortcut.unregisterAll();
  app.quit();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
