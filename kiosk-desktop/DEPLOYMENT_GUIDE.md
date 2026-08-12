# HDSP Kiosk Desktop -- Deployment Guide

## Prerequisites

- The hospital's HDSP server is already installed and running (via the main
  `HDSP_Setup.exe` installer) and reachable from the kiosk machine's
  network. If it's served over HTTPS (e.g. `https://hdsp-server.hospital.local`
  or `https://apollo.zoeconnect.in`), use that. If it's a typical Windows
  install with no reverse proxy in front of it -- the default for
  `installer/HDSP.iss`, which runs HDSP as plain-HTTP Windows Services --
  plain `http://` is fine as long as it's an address on the hospital's own
  network: `http://<server-ip>:3000` (the frontend's port; **not** :3001 or
  :4000, see the note below), `http://localhost:3000` if the kiosk and
  server are the same machine, or a `.local` hostname. This app only
  refuses plain `http://` for a public hostname/IP.

  > **Which port?** A default Windows install runs three separate
  > services: **HDSP Frontend** (port 3000 -- this is the one; it proxies
  > `/api/*` through to the backend itself), **HDSP Backend** (port 3001 --
  > don't point the kiosk at this directly), and **HDSP Vendor Backend**
  > (port 4000 -- a completely separate app, not the kiosk's target at
  > all). Always use the **frontend's** port.
- The backend migration that ships with this feature has been run once:
  `npm run migrate` at the repo root
  (`backend/src/database/migrations/1786300000000-CreateKioskDevices.ts`).
- A Windows PC (kiosk till) with a receipt/thermal printer installed and set
  as the **default printer** in Windows (Settings -> Printers & scanners).

## 1. Generate an activation code (HDSP admin, in a browser)

1. Sign in to the HDSP admin frontend and open **Token Queue -> Kiosk
   Devices** (`/token/config/kiosk-devices`).
2. Click **New Activation Code**.
3. Enter the **Kiosk URL** this specific till should show. Prefer a
   **relative path** -- e.g. `/token/print-kiosk?branchId=<id>` (a
   token-issuing kiosk) or `/kiosk/<slug>` (a queue-display board) -- so it
   automatically resolves against whatever server address the till
   actually activates with, whether that's `http://192.168.1.50:3000` or
   a future `https://...`. An absolute URL works too, but only if its
   protocol/port matches what you'll actually enter on the till. Optionally
   give it a **Label** (e.g. "Reception-1").
4. Click **Generate Code**. Copy the `XXXX-XXXX-XXXX` code shown -- it's
   only displayed once and expires in 72 hours if unused.

## 2. Build the installer (once, by the build/release machine)

```bash
cd kiosk-desktop
npm install
npm run kiosk:build
```

This produces `kiosk-desktop/installer/Output/HDSP_Kiosk_Setup.exe`. This
step does not touch, rebuild, or depend on the main HDSP installer in any
way -- it can be built before, after, or completely independently of an
`HDSP_Setup.exe` release, and the same installer build can activate any
number of tills against any number of hospitals/tenants (the activation
code, not the installer, is what's hospital/till-specific).

## 3. Copy the installer to the kiosk machine

```
Hospital Server
    |
    v
HDSP already installed (main installer, unchanged)
    |
    v  (later, whenever a kiosk till is being set up)
Copy HDSP_Kiosk_Setup.exe to a USB drive / network share
    |
    v
Run it on the reception/token kiosk PC
    |
    v
Done -- one-touch, dialog-free printing
```

No rebuild of the HDSP installer, and no changes on the HDSP server, are
required to add, replace, or reinstall a kiosk till.

## 4. Install and activate on the kiosk machine

1. Run `HDSP_Kiosk_Setup.exe` (per-machine install; an admin prompt is
   expected).
2. Launch **HDSP Kiosk** from the Start Menu / desktop shortcut it creates.
3. On first launch you'll see the **HDSP Kiosk Activation** screen. Enter:
   - **HDSP Server Address**: `https://hdsp-server.hospital.local`
   - **Activation Code**: the `XXXX-XXXX-XXXX` code from Step 1
4. Press **Activate Kiosk**. The app registers this specific machine as a
   device, switches to fullscreen kiosk mode, and loads the kiosk URL you
   configured for that activation code. Printing now goes straight to the
   default printer with no dialog.
5. Back in HDSP admin's **Kiosk Devices** page, this till now appears with
   a live online/offline status and last-seen time (updated automatically
   about every 30 seconds).

## 5. Configure the till printer's paper size

Paper width is **not** configured in this app. It's configured where it
already is: HDSP's admin **Kiosk Configuration -> Print Config** page
(`/token/print-config` in the main HDSP frontend), the same place that
already drives the browser-based kiosk. Set it to the physical roll width
(e.g. `58mm` or `80mm`) once, from any admin browser session -- every kiosk
till (this Electron app or a browser tab) picks it up within about 30
seconds automatically.

## 6. Reconfiguring, disabling, or retiring a station

- **Point a till at a different page**: press **Ctrl+Alt+K** on that till's
  keyboard to reopen the activation screen, enter a fresh activation code
  (generate one for the new URL/label in Kiosk Devices first), and
  re-activate. No reinstall needed.
- **Temporarily take a till offline** (e.g. for maintenance) without
  touching the machine: in Kiosk Devices, click **Disable** on that device.
  The till automatically shows a "this kiosk has been disabled" screen
  within 30 seconds and resumes automatically the moment you click
  **Enable** again -- no physical access needed either way.
- **Permanently retire a till**: click the trash icon (**Revoke**) in Kiosk
  Devices. The till shows a "revoked" screen and will need a brand new
  activation code (Ctrl+Alt+K) to ever come back online.

## 7. Recommended: lock the machine down at the OS level too

This app already disables its own menu, address bar, devtools, and
right-click/window-open escape routes, and blocks common browser keyboard
shortcuts. It cannot, however, intercept OS-level shortcuts like Alt+Tab or
Windows key combinations -- that's outside what any Chromium-based app can
do. For a till that must never be left, pair this install with:

- **Windows Assigned Access / Kiosk mode** (Settings -> Accounts -> Other
  users -> Set up a kiosk), pointed at the HDSP Kiosk shortcut, so Explorer
  and the taskbar aren't available at all.
- Auto-login a dedicated low-privilege local kiosk account, with HDSP Kiosk
  set to run at startup (the installer creates a Start Menu shortcut you can
  add to that account's Startup folder).
- Disabling Task Manager / Ctrl+Alt+Del options via local Group Policy on
  that account, if your hospital's IT security policy calls for it.

## Troubleshooting

| Symptom | Where to look |
| --- | --- |
| Activation screen says the server address must be https:// | This app deliberately refuses plain `http://` (except `http://localhost` in dev builds). Use the hospital's real HTTPS address, or ask IT to put one in front of HDSP if it's still on plain HTTP internally. |
| Activation fails with "Invalid or expired activation code" | Codes are single-use and expire after 72 hours -- generate a fresh one in Kiosk Devices. |
| Kiosk stuck on "Reconnecting to HDSP..." | Confirm the kiosk PC can reach the HDSP server URL (open it in a normal browser on the same PC). Check `%ProgramData%\HDSP\Kiosk\logs\kiosk.log`. |
| Kiosk shows "this kiosk has been disabled" | Check its status in Kiosk Devices -- someone (or a policy) disabled it; click Enable there, no action needed on the till. |
| Kiosk shows "this kiosk has been revoked" | Permanent -- press Ctrl+Alt+K and activate with a brand new code. |
| Prints on the wrong paper size | Check **Kiosk Configuration -> Print Config** on the HDSP admin site, not on the kiosk PC -- paper size is server-side config, shared by all kiosks, refreshed on the till every ~30s. |
| Nothing prints at all | Confirm a printer is set as the **Windows default printer** on that PC; the app does not (yet) let you pick a non-default printer. |
| Till doesn't show up in Kiosk Devices / status looks stale | Heartbeats are sent every 30s; give it up to ~90s before treating it as actually offline. Check the till's own logs if it's still stale after that. |
| Need logs for support | `%ProgramData%\HDSP\Kiosk\logs\kiosk.log` (auto-rotates at 5MB). |
