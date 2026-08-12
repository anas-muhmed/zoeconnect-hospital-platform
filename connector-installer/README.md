# HDSP Connector 1.0 Deployment -- Packaging

This folder is the packaging/installer project for the Connector product
(`connector/` + `connector-manager/` + `connector-tray/`), built per the
"HDSP Connector 1.0 Deployment" plan (2026-07-22, Phase 1: Packaging).

It is **not** the same as the top-level `installer/` folder, which
packages the whole HDSP platform (backend + vendor-portal + frontend +
Postgres + Redis) for a self-hosted deployment. This folder produces one
artifact: `HDSP_Connector_1.0.0_x64.exe`, the Connector-only installer a
hospital IT admin runs on a single machine.

## Status: scaffolded, not verified

Everything in this folder is code-complete and reviewed, but **nothing
here has been run** -- this sandbox has no Windows environment to build
or execute an Inno Setup installer, a `pkg`-produced `.exe`, or NSSM
service registration against. Treat every script and the `.iss` file as a
first draft that needs a real Windows build machine to compile and a real
Windows VM (Phase 2 of the deployment plan) to validate, exactly the same
posture already documented for `connector-tray/`'s DPAPI and tray-icon
code.

## Pipeline

```
connector/            npm run package         -->  connector-installer/build/connector.exe
connector-manager/     npm run build           -->  connector-manager/dist/ (static UI assets)
connector-tray/        npm run package         -->  connector-installer/build/tray.exe
connector-installer/   npm run package:scripts -->  connector-installer/build/{install,uninstall}-service.exe
                                             |
                                             v
                          connector-installer/HDSP_Connector.iss (Inno Setup)
                                             |
                                             v
                       HDSP_Connector_1.0.0_x64.exe  (single installer artifact)
```

`install-service.js`/`uninstall-service.js` are themselves `pkg`'d into
one-shot helper executables (rather than requiring Node.js to be present
on the hospital's machine just to run two install-time scripts) --
Inno Setup's `[Run]`/`[UninstallRun]` sections invoke
`install-service.exe`/`uninstall-service.exe` directly, passing the
install directory as an argument.

`connector.exe` and `tray.exe` are produced by `pkg` (bundles a Node 18
runtime + the compiled JS into one executable -- no separate Node.js
install required on the hospital's machine). `connector-manager`'s Vite
build output is copied in as static files, served by `connector.exe`
itself (see `connector/src/api/local-api-server.ts`'s static-file
serving) -- it does not need its own executable or process.

## Why NSSM, not `node-windows`

`HDSP_CLOUD_CONNECTOR_ARCHITECTURE.md` §15 originally listed `node-windows`
as the likely Windows Service wrapper, for a plain `node dist/index.js`
invocation. That calculus changes now that `connector.exe` is a
`pkg`-produced standalone binary, not a Node script: NSSM (Non-Sucking
Service Manager) wraps *any* executable as a Windows Service with a
single `nssm install` call, is a small, widely-used, freely redistributable
public-domain/zlib-licensed tool with no dependency on a Node process
managing another Node process, and is the more natural fit for a
packaged binary. `node-windows` remains a reasonable choice if this
product ever moves back to shipping a bare Node script; it is not used
here.

**NSSM's binary itself is not vendored in this repo** -- download it from
<https://nssm.cc/download> and place `nssm.exe` at
`connector-installer/build/nssm.exe` before running the Inno Setup
compile (`HDSP_Connector.iss` expects it there). This is the one
third-party binary this packaging pipeline depends on that isn't produced
by `npm run package`.

## Installation layout (target machine)

```
C:\Program Files\HDSP Connector\        <- static, versioned, replaced wholesale on upgrade
    connector.exe
    tray.exe
    nssm.exe
    manager-ui\                         <- connector-manager's built static assets
    uninstall.exe                       <- Inno Setup's generated uninstaller

C:\ProgramData\HDSP\Connector\          <- mutable, survives upgrades, NOT touched by a reinstall
    credentials.enc.json                <- TokenStore (activation JWTs)
    store.key                           <- TokenStore's local encryption key (non-Windows fallback only)
    oracle-config.enc.json              <- OracleConfigStore (DPAPI-encrypted on Windows)
    logs\
        service.log                     <- NSSM's redirected stdout/stderr (see install-service.js)
```

This split (binaries in Program Files, mutable state in ProgramData) is
the standard Windows convention and is what makes upgrades and uninstalls
safe: `connector/src/config/oracle-config-store.ts` and
`connector/src/auth/token-store.ts` already default to `%ProgramData%\HDSP\Connector`
(unchanged by this packaging work -- they were built with this split in
mind from Task #103), so an upgrade that replaces everything under
Program Files never touches a hospital's activation state or Oracle
credentials.

## Build steps (to run on a real Windows machine)

```
cd connector && npm ci && npm run package
cd ../connector-manager && npm ci && npm run build
cd ../connector-tray && npm ci && npm run package
cd ../connector-installer && npm ci && npm run package:scripts
# download nssm.exe to connector-installer/build/nssm.exe
iscc HDSP_Connector.iss
# -> produces HDSP_Connector_1.0.0_x64.exe in connector-installer/Output/
```
