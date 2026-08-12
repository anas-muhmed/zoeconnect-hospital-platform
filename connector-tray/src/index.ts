import open from 'open';
import { connectorApi, managerUrl } from './api-client';

/**
 * ZoeConnect Connector Manager -- system tray launcher (Task #103, 2026-07-22).
 *
 * See README.md's "Why a separate process" for why this is its own tiny
 * executable rather than code inside the Connector Windows Service
 * (Session 0 isolation). This process holds no state of its own -- every
 * menu action either opens the browser to the Service's Manager UI, or
 * makes one HTTP call to the Service's local REST API and shows a brief
 * OS notification-equivalent (a menu-title flash, since a full toast
 * notification system is out of this task's scope) with the result.
 *
 * `systray2` is used because there is no pure-JS way to render a native OS
 * tray icon -- every option in this space (this package, Electron,
 * `menubar`, etc.) ultimately wraps a small platform-specific
 * native/prebuilt-binary helper. `systray2` was chosen over Electron
 * specifically because it has none of Electron's ~100MB+ Chromium
 * runtime footprint -- appropriate for a component whose only job is
 * "show one icon and a menu."
 *
 * NAME CORRECTION (2026-07-22, caught during a real Windows build): this
 * package was originally specified and coded against as
 * `node-systray-v2`, which does NOT exist on the npm registry (`npm
 * install` 404s on it -- confirmed directly, not assumed). The actual
 * published, maintained package with the same precompiled-binary
 * approach and a compatible API (`new SysTray({menu: {...}})`,
 * `.onClick()`, `.sendAction()`, `.kill()`) is `systray2`
 * (github.com/felixhao28/node-systray). Every usage below was verified
 * against `systray2`'s real published source (index.d.ts/index.js) before
 * this fix, not carried over unchecked from the old package name.
 *
 * NOT VERIFIED ON REAL WINDOWS END-TO-END (see README) -- this sandbox
 * has no Windows environment to exercise the prebuilt tray helper binary
 * against, only to check its published source against this file's usage.
 * Every failure path below is deliberately defensive (try/catch,
 * log-and-continue) so a tray-library problem never becomes a crash loop
 * for what is meant to be a lightweight, optional-to-the-core-product
 * convenience process.
 *
 * `open` is pinned to `^6.4.0` in package.json, NOT the latest major --
 * caught during a real Windows build (2026-07-22): `open` v7+ is
 * ESM-only (`sindresorhus/open` dropped CommonJS support), and this
 * package compiles to CommonJS (`tsconfig.json`'s `"module": "CommonJS"`)
 * for `pkg` packaging. v6.4.0 is the last CommonJS-compatible release,
 * so `import open from 'open'` below resolves correctly under
 * `esModuleInterop`. Do not bump this dependency past v6 without also
 * switching this whole package to ESM output (which `pkg` does not
 * reliably support today) or moving to a dynamic `import()`.
 */

// A minimal 16x16 solid-color PNG, base64-encoded -- a placeholder icon
// only. Task #96 (Connector Installer) is the natural place to ship real
// branded tray artwork (.ico for Windows) alongside the installer itself;
// tracked there, not fabricated here.
const PLACEHOLDER_ICON_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAJUlEQVR42mNk' +
  'YPhfz0AEYBxVSFQhE1WU/z/A6P+P0X8mQu0EAG4qDANpNW+xAAAAAElFTkSuQmCC';

interface TraySysTray {
  onClick(cb: (action: { seq_id: number; item: { title: string } }) => void): void;
  sendAction(action: Record<string, unknown>): void;
  kill(exitTray?: boolean): void;
}

async function withAction(label: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
    console.log(`[TRAY] ${label} succeeded`);
  } catch (err) {
    console.error(`[TRAY] ${label} failed: ${(err as Error).message}`);
  }
}

async function main(): Promise<void> {
  const menuItems = [
    { title: 'Open Connector Manager', tooltip: '', checked: false, enabled: true },
    { title: 'Reconnect', tooltip: '', checked: false, enabled: true },
    { title: 'Run Diagnostics', tooltip: '', checked: false, enabled: true },
    { title: 'View Logs', tooltip: '', checked: false, enabled: true },
    { title: 'Check for Updates', tooltip: '', checked: false, enabled: true },
    { title: 'Restart Connector', tooltip: '', checked: false, enabled: true },
    { title: 'Exit Manager', tooltip: 'Closes only this tray icon -- the Connector service keeps running', checked: false, enabled: true },
  ] as const;

  let systray: TraySysTray;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const SysTray = require('systray2').default ?? require('systray2');
    systray = new SysTray({
      menu: {
        icon: PLACEHOLDER_ICON_BASE64,
        title: 'ZoeConnect Connector',
        tooltip: 'ZoeConnect Connector Manager',
        items: menuItems,
      },
      debug: false,
      copyDir: true,
    });
  } catch (err) {
    console.error(
      `[TRAY] Could not initialize the system tray icon (${(err as Error).message}). ` +
      'This is expected in a headless/non-Windows environment. The Connector Windows ' +
      'Service is unaffected -- this process only provides the tray shortcut.',
    );
    return;
  }

  systray.onClick((action) => {
    const title = action.item.title;
    switch (title) {
      case 'Open Connector Manager':
        void open(managerUrl());
        break;
      case 'Reconnect':
        void withAction('Reconnect', connectorApi.reconnect);
        break;
      case 'Run Diagnostics':
        void withAction('Run Diagnostics', connectorApi.runDiagnostics);
        break;
      case 'View Logs':
        void open(`${managerUrl()}/#/logs`);
        break;
      case 'Check for Updates':
        void withAction('Check for Updates', connectorApi.checkForUpdates);
        break;
      case 'Restart Connector':
        void withAction('Restart Connector', connectorApi.restart);
        break;
      case 'Exit Manager':
        // Per the task's explicit requirement: kill ONLY this tray
        // process. Nothing here touches the Windows Service.
        systray.kill(true);
        break;
      default:
        break;
    }
  });

  console.log('[TRAY] ZoeConnect Connector Manager tray icon started');
}

if (require.main === module) {
  void main();
}

export { main };
