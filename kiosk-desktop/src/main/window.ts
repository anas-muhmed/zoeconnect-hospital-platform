import * as path from 'path';
import { BrowserWindow, shell } from 'electron';
import { logger } from './logger';

const isDev = process.env.KIOSK_DEV === '1';

const OFFLINE_PAGE = path.join(__dirname, '..', '..', 'resources', 'offline.html');
const SETUP_PAGE = path.join(__dirname, '..', '..', 'resources', 'setup.html');
const DISABLED_PAGE = path.join(__dirname, '..', '..', 'resources', 'disabled.html');

/**
 * Creates the single, locked-down kiosk window. Requirements from the
 * task ("Kiosk Mode" section): fullscreen, borderless, no menu, no
 * address bar, no devtools, auto focus, disable browser shortcuts where
 * practical.
 *
 * Security requirements are enforced here too: contextIsolation, sandbox,
 * no nodeIntegration, preload-only bridge -- see src/preload/index.ts.
 */
export function createKioskWindow(): BrowserWindow {
  const win = new BrowserWindow({
    fullscreen: !isDev,
    kiosk: !isDev,
    frame: isDev,
    autoHideMenuBar: true,
    backgroundColor: '#0f172a',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webviewTag: false,
      devTools: isDev,
    },
  });

  win.once('ready-to-show', () => {
    win.show();
    win.focus();
  });

  // Kiosks must never spawn extra windows/tabs (e.g. a target="_blank"
  // link inside the kiosk UI). Deny all of them.
  win.webContents.setWindowOpenHandler(({ url }) => {
    logger.warn('Blocked window.open from kiosk page', { url });
    return { action: 'deny' };
  });

  // Prevent the loaded page from navigating this window to an arbitrary
  // external origin (e.g. a stray absolute link). Same-origin navigation
  // within the configured kiosk site, and local file:// pages (our own
  // offline/setup screens), are allowed; everything else is opened in the
  // system browser instead of hijacking the kiosk, purely as a safety net
  // -- staff should never need this in normal operation.
  win.webContents.on('will-navigate', (event, url) => {
    const currentUrl = win.webContents.getURL();
    if (isSameOriginOrLocal(currentUrl, url)) return;
    event.preventDefault();
    logger.warn('Blocked cross-origin navigation from kiosk page', { url });
    void shell.openExternal(url).catch(() => undefined);
  });

  // Best-effort keyboard lockdown at the Electron level. Note this cannot
  // intercept OS-level combinations like Alt+Tab or Ctrl+Alt+Del -- for a
  // fully locked-down till, pair this with Windows Assigned Access /
  // a kiosk-mode OS policy on the machine (see DEPLOYMENT_GUIDE.md).
  win.webContents.on('before-input-event', (event, input) => {
    const key = input.key.toLowerCase();
    const blockDevTools =
      key === 'f12' ||
      (input.control && input.shift && (key === 'i' || key === 'j' || key === 'c'));
    const blockReload = (input.control || input.meta) && key === 'r';
    const blockFind = (input.control || input.meta) && key === 'f';

    if (!isDev && (blockDevTools || blockReload || blockFind)) {
      event.preventDefault();
    }
  });

  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    logger.warn('Page failed to load', { errorCode, errorDescription, validatedURL });
  });

  // Reuse the existing kiosk UI's own window.print() calls unmodified: the
  // preload script exposes __hdspPrint via contextBridge (isolated world),
  // and this injects a tiny shim into the PAGE's own main-world context so
  // window.print() there transparently calls it. executeJavaScript always
  // runs in the main world regardless of preload's contextIsolation, which
  // is exactly what makes this work without touching frontend/ at all.
  // Re-applied on every navigation (dom-ready fires each time) since a
  // fresh page load gets a fresh, unmodified window.print.
  win.webContents.on('dom-ready', () => {
    win.webContents
      .executeJavaScript(
        `(function(){
          if (typeof window.__hdspPrint === 'function') {
            window.print = function() {
              return window.__hdspPrint().catch(function(err) {
                console.error('[HDSP Kiosk] silent print failed', err);
              });
            };
          }
        })();`,
      )
      .catch((err) => logger.warn('Failed to inject print shim', { error: String(err) }));
  });

  return win;
}

function isSameOriginOrLocal(currentUrl: string, targetUrl: string): boolean {
  if (targetUrl.startsWith('file://')) return true;
  try {
    return new URL(currentUrl).origin === new URL(targetUrl).origin;
  } catch {
    return false;
  }
}

export async function loadKioskPage(win: BrowserWindow, url: string): Promise<void> {
  logger.info('Loading kiosk page', { url });
  await win.loadURL(url);
}

export async function loadOfflinePage(win: BrowserWindow): Promise<void> {
  logger.info('Showing offline page');
  await win.loadFile(OFFLINE_PAGE);
}

export async function loadSetupPage(win: BrowserWindow): Promise<void> {
  logger.info('Showing setup page');
  await win.loadFile(SETUP_PAGE);
}

export async function loadDisabledPage(win: BrowserWindow, reason: 'disabled' | 'revoked'): Promise<void> {
  logger.info('Showing disabled page', { reason });
  await win.loadFile(DISABLED_PAGE);
  const title = reason === 'revoked' ? 'This kiosk has been revoked' : 'This kiosk has been disabled';
  const message = reason === 'revoked'
    ? 'Your HDSP administrator has permanently revoked this till. Press Ctrl+Alt+K to activate it again with a new activation code.'
    : 'Your HDSP administrator has disabled this till. It will resume automatically once re-enabled -- no action needed here.';
  await win.webContents
    .executeJavaScript(
      `(function(){
        var t=document.getElementById('title'); if(t) t.textContent=${JSON.stringify(title)};
        var m=document.getElementById('message'); if(m) m.textContent=${JSON.stringify(message)};
      })();`,
    )
    .catch(() => undefined);
}

const LOCAL_PAGES = { offline: OFFLINE_PAGE, setup: SETUP_PAGE, disabled: DISABLED_PAGE } as const;

export function isShowingLocalPage(win: BrowserWindow, page: keyof typeof LOCAL_PAGES): boolean {
  const url = win.webContents.getURL();
  return url.startsWith('file://') && url.includes(path.basename(LOCAL_PAGES[page]));
}
