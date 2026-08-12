import { contextBridge, ipcRenderer } from 'electron';
import type { KioskAuthState, ActivateRequest, ActivateResult, PrintResult } from '../shared/ipc-channels';

/**
 * The ONLY bridge between the sandboxed renderer (the existing, completely
 * unmodified kiosk React/Next.js pages) and the main process. Runs with
 * contextIsolation + sandbox enabled (see main/window.ts), so nothing here
 * gives the page access to Node or Electron internals -- only these
 * specific, narrow functions.
 *
 * IMPORTANT: channel names below are inlined as string literals rather
 * than imported as values from ../shared/ipc-channels's `KioskChannel`
 * const. Electron's sandboxed preload scripts (sandbox: true, set in
 * main/window.ts) run with a restricted `require()` that only allows a
 * small built-in allowlist (events/timers/url) -- requiring a local
 * project file like ../shared/ipc-channels throws and silently crashes
 * preload entirely (no contextBridge exposure happens, no error is
 * visible anywhere since devtools are off in production, and every
 * `window.hdspKioskAdmin.*` call in resources/*.html then throws
 * synchronously on `undefined`). Confirmed as the actual cause of a real
 * "Activating..." hang with zero related log output, 2026-07-25 -- see
 * git history/PR notes for the incident. `import type` for the payload
 * interfaces above is safe (type-only, erased at compile time, never
 * becomes a runtime require()) -- only VALUE imports like the old
 * `KioskChannel` were the problem.
 *
 * These MUST be kept in sync with KioskChannel in ../shared/ipc-channels.ts
 * by hand.
 */
const CHANNEL = {
  PRINT: 'kiosk:print',
  GET_STATE: 'kiosk:get-state',
  ACTIVATE: 'kiosk:activate',
  RETRY_CONNECTION: 'kiosk:retry-connection',
} as const;

/**
 * Note on `__hdspPrint`: we deliberately do NOT expose it under the name
 * "print" via contextBridge, because contextBridge.exposeInMainWorld
 * throws if the target property already exists on window (and
 * `window.print` already exists as the native browser API). Instead,
 * main/window.ts injects a tiny `window.print = () => window.__hdspPrint()`
 * shim into the page's own (main-world) context via
 * webContents.executeJavaScript once the page is ready. That is what lets
 * the existing kiosk code's unmodified `window.print()` calls
 * (frontend/src/app/token/print-kiosk/page.tsx and friends) transparently
 * become silent Electron prints -- zero changes to the kiosk UI itself.
 */
contextBridge.exposeInMainWorld('__hdspPrint', (): Promise<PrintResult> => {
  return ipcRenderer.invoke(CHANNEL.PRINT);
});

/**
 * Setup/disabled/offline screens (resources/*.html) are our own local
 * pages, not the kiosk app, so they're allowed a slightly wider,
 * explicitly-named API surface for registration/activation.
 */
contextBridge.exposeInMainWorld('hdspKioskAdmin', {
  getState: (): Promise<KioskAuthState | null> => ipcRenderer.invoke(CHANNEL.GET_STATE),
  activate: (req: ActivateRequest): Promise<ActivateResult> => ipcRenderer.invoke(CHANNEL.ACTIVATE, req),
  retryConnection: (): Promise<{ ok: boolean }> => ipcRenderer.invoke(CHANNEL.RETRY_CONNECTION),
});
