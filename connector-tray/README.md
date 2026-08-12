# @hdsp/connector-tray

The system tray icon described in Task #103 ("HDSP Connector Manager," 2026-07-22).

## Why a separate process

The task's architecture diagram draws the tray icon as its own box, separate from both
the Windows Service and the Manager UI. That's not just a diagramming choice -- it's a
real Windows platform constraint:

**A Windows Service runs in Session 0, which has no desktop.** Since Windows Vista,
services have been isolated from interactive user sessions specifically so a service
process *cannot* show UI (message boxes, tray icons, windows) in a logged-in user's
session. This is enforced by the OS, not a library limitation -- no tray-icon npm
package, however capable, can make a Session-0 process show an icon in Session 1+.

That means the tray icon **cannot live inside the Connector Windows Service process**
(`connector/`, Task #95/#96). It has to be a separate, small process that:

- runs *in the user's interactive session* (started via a Start Menu shortcut and/or a
  per-user autostart entry -- the Connector Installer, Task #96, is responsible for
  wiring that up; not yet built),
- shows the tray icon and menu,
- and for every action (Reconnect, Run Diagnostics, View Logs, Check for Updates,
  Restart Connector), makes an HTTP call to the Windows Service's local REST API on
  `127.0.0.1:4200` -- **exactly the same API the Manager UI itself uses**
  (`connector/src/api/local-api-server.ts`). This process never touches Oracle, the
  cloud, or stored credentials directly; it is a thin remote control for the Service.

"Open Connector Manager" opens the default browser to `http://127.0.0.1:<port>/`,
which is served by the Service itself (see `local-api-server.ts`'s static-file
serving) -- the tray process does not serve any UI of its own.

## "Exit Manager" vs. the Windows Service

Per the task's explicit requirement: **Exit Manager closes only this tray process.**
The Windows Service (`connector/`) is unaffected and keeps running, keeps its
WebSocket connection open, and keeps serving the local REST API and Manager UI --
only the tray icon disappears. A user who wants the Connector itself stopped needs to
do that at the Windows Services control panel (or, once Task #95 ships proper service
management, an explicit "Stop Connector" action distinct from this menu).

## Status in this codebase (2026-07-22)

Implemented and code-complete against the local API contract, but **not verified on a
real Windows machine end-to-end** -- this sandbox has no Windows environment, and
`systray2` ships a platform-specific prebuilt tray helper binary that cannot be
exercised here. Treat this package as reviewed-but-unverified until it's actually run
on Windows.

**Dependency correction (2026-07-22):** this package was originally specified as
`node-systray-v2`, which turned out not to exist on the npm registry at all -- a real
`npm install` on Windows 404'd on it during Phase 2 validation. The dependency has been
corrected to `systray2` (github.com/felixhao28/node-systray), the actual maintained
package with the same precompiled-binary approach and a compatible API. If you pulled
this repo before that fix and still have a `node_modules/` with the old (never
successfully installed) dependency, delete `node_modules/` and `package-lock.json`
here and re-run `npm install`.

**Expected, harmless `npm run package` warning:** `pkg` prints two "Cannot include
file ... node_modules\open\xdg-open" warnings on every Windows build. `xdg-open` is a
Linux-only shell script bundled inside the `open` package (used to shell out to
`xdg-open` on Linux desktops); `pkg` can't embed a shell script into a Windows `.exe`,
and since this package always targets `node18-win-x64`, `open` never calls `xdg-open`
at runtime anyway -- Windows opens URLs via `start` internally instead. This is not a
build failure; `tray.exe` is still produced. Confirmed on the first real Windows build
of this package, 2026-07-22.
