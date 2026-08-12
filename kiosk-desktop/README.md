# HDSP Kiosk Desktop

A dedicated Electron shell for the existing HDSP Token Kiosk web app, built to
replace `window.print()` (browser print-preview) with true one-touch, silent,
dialog-free printing on hospital reception/token kiosks.

This package is **completely independent** of the main HDSP installer
(`installer/HDSP.iss`). It is built, versioned, and shipped separately as its
own artifact (`HDSP_Kiosk_Setup.exe`) and installed later, only on the
machines that need it.

```
Electron (this package)
    |
    v
Existing Kiosk React/Next.js UI   (frontend/src/app/token/print-kiosk,
    |                              frontend/src/app/kiosk/[slug], etc. --
    v                              unmodified)
Existing Backend APIs             (backend/src/modules/token -- unmodified)
```

## Why this exists

Hospitals need one-touch, silent printing at reception kiosks. Browser
`window.print()` always shows a print-preview dialog -- unacceptable for a
till a patient or receptionist taps once. Electron's
`webContents.print({ silent: true })` prints immediately with no dialog, but
only a native shell (not a browser tab) can call it. This package is that
shell.

## What this package does NOT do

- It does not reimplement the kiosk UI. The exact same
  `frontend/src/app/token/print-kiosk` (and `/kiosk/[slug]`,
  `/token/kiosk/[code]`) pages are loaded, unmodified, from the hospital's
  existing HDSP frontend, over plain HTTP(S) -- exactly like a browser tab
  would.
- It does not touch existing backend behavior. It adds one new, additive
  backend module (`backend/src/modules/platform/kiosk-device/`) for device
  registration/heartbeat, and otherwise only calls the existing, already
  public `GET /token/print-config` to read the configured paper width.
- It does not add a second paper-size configuration. See "Paper size" below.
- It does not modify `installer/HDSP.iss`, `backend/`, `frontend/`,
  `vendor-portal/`, or any other existing package.

## Architecture

```
kiosk-desktop/
  src/
    main/            Electron main process
      index.ts             App entry point / lifecycle wiring
      window.ts             Kiosk BrowserWindow: fullscreen, locked down,
                             window.print() -> silent print shim injection
      print-service.ts      The ONE place that calls webContents.print()
      print-config-cache.ts Background-refreshed cache of /token/print-config
                             (PrintService reads this synchronously)
      printer-service.ts    Printer-target abstraction (OS default today;
                             the seam a future printer picker plugs into)
      kiosk-auth-client.ts   POST /kiosk/register + /kiosk/token/refresh;
                             enforces https:// for public server addresses
      heartbeat-service.ts   POST /kiosk/heartbeat every 30s; drives
                             online/offline/disabled/revoked transitions
      config-store.ts       Encrypted (Electron safeStorage) local
                             registration state -- ProgramData JSON file,
                             mirrors connector/src/config's pattern
      http-client.ts        Shared dependency-free JSON GET/POST/PATCH
      ipc-handlers.ts       Registers every ipcMain.handle() in one place
      menu.ts               Removes the default Electron app menu
      updater.ts            No-op today; the wiring point for a future
                             electron-updater integration
      logger.ts             File + console logger (ProgramData\HDSP\Kiosk\logs)
    preload/
      index.ts          contextBridge-only surface exposed to the page
    shared/
      ipc-channels.ts   IPC channel names + payload types (single source
                          of truth for main <-> preload contract)
  resources/
    offline.html          Shown when the HDSP server is unreachable
    disabled.html          Shown when this device is disabled/revoked
    setup.html             First-run / Ctrl+Alt+K activation screen
    setup-renderer.js
  build/                electron-builder resources (icon, etc.)
  installer/Output/     electron-builder's generated HDSP_Kiosk_Setup.exe
                          (git-ignored; produced by `npm run kiosk:build`)
```

No Electron code lives inside `frontend/` and no frontend code lives inside
this package, per the task's folder-structure requirement.

## Printing

`src/main/print-service.ts` is the single silent-print code path:

```ts
contents.print({
  silent: true,
  printBackground: true,
  margins: { marginType: 'none' },
  pageSize: { width: widthMicrons, height: heightMicrons },
});
```

### How the existing kiosk UI's `window.print()` becomes silent, unmodified

The existing kiosk pages call plain `window.print()` (see
`frontend/src/app/token/print-kiosk/page.tsx`). We do not touch that file.
Instead:

1. `preload/index.ts` exposes `window.__hdspPrint()` into the page via
   `contextBridge.exposeInMainWorld`, which calls `ipcRenderer.invoke('kiosk:print')`.
2. `main/window.ts` injects a tiny shim into the page's own context on every
   navigation (`webContents.executeJavaScript` on `dom-ready`):
   ```js
   window.print = () => window.__hdspPrint();
   ```
3. `main/ipc-handlers.ts` receives `kiosk:print` and delegates to
   `PrintService.printSilently()`.

Net effect: the kiosk UI's existing `window.print()` calls silently print via
Electron, with zero changes to `frontend/`.

### Paper size (reused, not duplicated)

HDSP already has **Kiosk Configuration -> Print Config**
(`frontend/src/app/(platform)/token/print-config/page.tsx`), backed by
`GET/PUT /token/print-config` on the backend (`token.controller.ts` /
`token.service.ts`). That's a single CSS-width string, e.g. `"58mm"`,
`"80mm"`, `"3in"`.

`print-config-cache.ts` fetches that same public endpoint in the background
every 30s (and once immediately on startup/reactivation) and `PrintService`
reads the cached value synchronously, so a print never blocks on a network
round-trip. If the paper size is changed in that admin page, every kiosk
picks it up within 30 seconds automatically -- no separate kiosk paper-size
setting, no redeploy, and no per-print network dependency either.

Page *height* isn't part of that backend config (token/receipt slips are a
width-only setting there today). `PrintService` uses a generous default
(150mm), overridable per-machine via the `KIOSK_PRINT_HEIGHT_MM` environment
variable if a specific printer/driver needs tuning. This is a local
print-driver knob, not a second paper-size configuration -- the value that
actually matters (width) always comes from the backend.

### Printer selection

Printing goes to the OS default printer today via `printer-service.ts`'s
`PrinterService.resolvePrinterName()`, which always returns `undefined`
(Electron omits `deviceName`, so the OS default is used). `PrintService`
already calls through this one seam instead of hardcoding "no printer name"
itself, and `PrinterService.listPrinters()` already wraps
`webContents.getPrintersAsync()` -- adding a real per-till printer picker
later means filling in `resolvePrinterName()` and building a settings UI
that calls `listPrinters()`, with no change to the print path itself.

## Registration & activation

This app is a **registered device**, not just a browser pointed at a URL.
Hospital IT generates a one-time activation code from HDSP's admin
**Kiosk Configuration -> Kiosk Devices** page
(`frontend/src/app/(platform)/token/config/kiosk-devices/page.tsx`), which
also records which kiosk page (URL) this specific till should show.
`main/kiosk-auth-client.ts` exchanges that code for a device identity and an
access/refresh token pair via the backend's
`backend/src/modules/platform/kiosk-device/` module -- deliberately mirroring
the HDSP Connector's own activation-code + separate-JWT-secret pattern
(`backend/src/modules/platform/connector/`), rather than inventing a new
device-identity scheme.

- `POST /kiosk/register` (public, rate-limited): activation code -> device +
  tokens.
- `POST /kiosk/token/refresh`: rotates the short-lived (15m) access token
  using the long-lived (90d) refresh token, called automatically by
  `heartbeat-service.ts` on a 401.
- **HTTPS required for public addresses; plain HTTP allowed on the
  hospital's own network.** `assertSecureServerAddress()` in
  `kiosk-auth-client.ts` refuses to register (or store any token) against a
  plain `http://` *public* hostname/IP -- but allows plain `http://` for
  `localhost`, `.local` hostnames, and the three RFC 1918 private ranges
  (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`). This matters in
  practice because the Windows self-hosted installer
  (`installer/HDSP.iss`) runs HDSP as plain-HTTP Windows Services with no
  reverse proxy/TLS in front of it by default -- so e.g.
  `http://192.168.1.50:3000` (the frontend's port; it proxies `/api/*` to
  the backend itself, see `frontend/next.config.mjs`) is the address for a
  typical Windows install today. Point this at `https://hospital.domain.com`
  once nginx/TLS (see `infrastructure/nginx/hdsp.conf`) is in front of the
  install, or for any future internet-facing/cloud deployment -- a public
  address always still requires https://.

Registration state (server address, device id, tokens) is stored encrypted
via Electron's built-in `safeStorage` (Windows DPAPI) at
`%ProgramData%\HDSP\Kiosk\kiosk-auth.enc.json` -- mirrors
`connector/src/config/oracle-config-store.ts`'s `%ProgramData%\HDSP\<App>\...`
convention, encrypted because (unlike the old plain-URL config) this now
holds a bearer credential.

- First run (or after a revoke) shows the activation screen
  (`resources/setup.html`).
- **Ctrl+Alt+K** reopens it at any time, to re-activate a station -- kiosk
  mode intentionally has no address bar or menu.
- `KIOSK_DEV_STATE_JSON` environment variable overrides the saved state, for
  local dev (`npm run dev`).

## Heartbeat & online status

`main/heartbeat-service.ts` sends `POST /kiosk/heartbeat` every 30 seconds
with this device's access token. The backend updates `lastHeartbeatAt` and
status, so **Kiosk Devices** in HDSP admin shows every till's live
online/offline state and last-seen time -- no separate monitoring
infrastructure needed, the till pushes its own status.

This same loop drives the kiosk's own on-screen state:

| Heartbeat result | On-screen |
| --- | --- |
| 200 OK | Real kiosk page |
| Network error / timeout | `resources/offline.html`, auto-retries |
| 401 (expired token) | Silently refreshes and retries once |
| 403 (device disabled) | `resources/disabled.html` ("disabled") -- resumes automatically once re-enabled in HDSP admin |
| Refresh also fails (device revoked) | `resources/disabled.html` ("revoked") -- needs Ctrl+Alt+K + a new activation code |

## Security

- `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false` on the
  kiosk `BrowserWindow` (see `main/window.ts`).
- The only renderer-facing surface is `preload/index.ts`'s
  `contextBridge.exposeInMainWorld` calls -- no other IPC is reachable from
  the page.
- DevTools are disabled outside of `KIOSK_DEV=1` dev mode; F12 /
  Ctrl+Shift+I/J/C and Ctrl+R are intercepted and suppressed in the loaded
  page.
- Cross-origin navigation and `window.open()` from inside the kiosk page are
  blocked (`will-navigate` / `setWindowOpenHandler`).

## Kiosk mode

Fullscreen, frameless, no menu bar, no address bar, no devtools, auto-focus
on show, single-instance-locked. Note Electron-level keyboard blocking
cannot intercept OS-level shortcuts (Alt+Tab, Ctrl+Alt+Del) -- for a fully
locked-down till, pair this with an OS-level kiosk policy (Windows Assigned
Access) on the machine. See `DEPLOYMENT_GUIDE.md`.

## Auto-update

Not implemented in this release, by design (per the task's scope). See
`main/updater.ts` for the wiring point future auto-update work would fill in.

## Build

From the repo root (recommended -- npm workspace):

```bash
npm install                 # once, at repo root; kiosk-desktop is an npm workspace
npm run build:kiosk         # tsc -> kiosk-desktop/dist
npm run kiosk:build         # electron-builder -> kiosk-desktop/installer/Output/HDSP_Kiosk_Setup.exe
```

Or from within this folder:

```bash
cd kiosk-desktop
npm install
npm run build
npm run kiosk:build
```

`npm run dev` (or `npm run dev:kiosk` from the root) runs the app windowed,
with DevTools enabled, against `KIOSK_DEV_STATE_JSON` if set.

A new backend migration ships with this feature
(`backend/src/database/migrations/1786300000000-CreateKioskDevices.ts`) --
run the backend's normal migration step (`npm run migrate` at the repo
root) once before activating any kiosk.

Or, on Windows, the one-command equivalent of the above (mirrors the main
installer's `installer\build_installer.ps1` convention):

```powershell
cd kiosk-desktop
.\installer\build_installer.ps1
```

This build pipeline is entirely separate from `installer/build_installer.ps1`
/ `installer/HDSP.iss` and from `connector-installer/`. Building the kiosk
never rebuilds, and is never rebuilt by, the main HDSP installer.

## Deployment

See `DEPLOYMENT_GUIDE.md`.
