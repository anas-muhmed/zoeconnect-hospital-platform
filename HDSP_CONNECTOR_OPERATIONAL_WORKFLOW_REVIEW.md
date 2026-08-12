# HDSP Connector -- End-to-End Operational Workflow Review

Solutions-architect walkthrough of the HDSP Connector's complete production
workflow, written for a new implementation engineer. No code was written or
changed to produce this document -- every claim below is grounded in the
actual source (file paths cited throughout) rather than the design intent
documents, so a few places where the code has honestly not caught up with
the architecture docs are called out explicitly rather than smoothed over.

Scope check against the codebase's own numbering: architecture (Tasks
#1-#78) and core implementation (Tasks #101-#117) are complete; packaging
(Tasks #118-#123) is complete in code, not yet run on real Windows;
validation (Tasks #79, #81-#85, #93-#94, #97-#98) is the remaining work.
This review is about whether the *workflow* -- not any one component -- is
complete.

---

## 1. Vendor Portal Workflow

**How a hospital is created.** A hospital becomes a cloud tenant through
`TenantProvisioningService.provision()` (`backend/src/modules/platform/
tenant-provisioning/tenant-provisioning.service.ts`), which runs as an
ordered, resumable list of steps (tenant row creation, storage namespace,
initial trial license, and -- step 7 -- Connector pairing). This is
triggered from the Vendor Portal's unified Customers screen (built in
Tasks #41-42), not a separate "create hospital" form elsewhere.

**How a Connector is associated with that hospital.** There is no separate
"assign a Connector to this hospital" step. Association is implicit and
happens twice, at two different times:
- At provisioning time, step 7 (`stepGenerateConnectorPairingKey()`)
  generates a `TenantConnectorPairing` row stamped with the new tenant's
  `tenantId` -- this is what ties a *future* Connector to *this* hospital,
  before any physical machine or install exists yet.
- At registration time, when a Connector redeems that pairing
  (`ConnectorRegistrationService.register()`), a `ConnectorInstance` row is
  created with that same `tenantId`. From that moment on, every JWT issued
  to that specific installed Connector process carries `tenantId` in its
  payload -- that's the actual, durable association a hospital's Connector
  process holds.

**When the Activation Code is generated.** Automatically, as part of
provisioning (step 7), for every cloud-mode tenant -- not a manual "click
Generate" action for a brand-new customer. Self-hosted tenants skip this
step entirely (`mode === 'self_hosted'` short-circuits it) since a
self-hosted Connector runs embedded with no cross-tenant ambiguity to
authenticate against. The Vendor Portal's "Generate Activation Code" /
"Regenerate Activation Code" buttons are for the cases that come *after*
initial provisioning: the original code expired unused, was lost before
the hospital could use it, or a second/replacement Connector instance
needs pairing.

**One-time, reusable, or regeneratable.** One-time. A `TenantConnectorPairing`
row starts `status: 'pending'`; the instant a Connector successfully
redeems it, the row flips to `status: 'active'` and can never match again
(`register()` only scans rows where `status === 'pending'`). It is also
time-boxed: `ACTIVATION_CODE_TTL_MS` = 72 hours
(`tenant-provisioning.service.ts`), after which an unredeemed code is
rejected even though the row technically still says `pending`. It **is**
regeneratable: `regenerateConnectorActivationCode()` revokes every
currently-pending code for that tenant first, then issues a fresh one --
so an old, possibly-leaked code stops working the instant a new one is
requested. Regeneration never touches an already-`active` pairing or its
resulting `ConnectorInstance` -- an installed, activated Connector is
unaffected by regenerating a code for that same tenant.

**What information is stored after generation.** Only a bcrypt hash of the
normalized code (`pairingKeyHash`), the owning `tenantId`, `status`, and
`expiresAt`. The raw code is never persisted anywhere -- it is returned to
the caller exactly once, in the API response, matching the codebase's
existing convention for every other bootstrap secret (instance tokens,
vendor registration keys). If a support engineer loses the code after
generating it, the only recovery path is regenerating a new one.

**How Connector status is tracked.** `ConnectorInstance.status` moves
`registered` -> `online` -> `offline` as a Connector's WebSocket handshake
succeeds or its socket disconnects (`ConnectorGateway.handleConnection()` /
`handleDisconnect()`). The Vendor Portal's status read
(`GET tenants/:tenantId/connector`) additionally cross-checks
`ConnectorGateway.isConnected()` (an in-memory live-socket check) rather
than trusting the DB row alone, and separately reports a query-definitions
sync summary. Two fields are honestly incomplete today, and this matters
enough to flag now rather than silently: `ConnectorInstance.version` is
`null` forever in the current build (nothing populates it -- there is no
periodic heartbeat message that would carry a version string), and
`lastSeenAt`/`lastHeartbeatAt` is only ever updated at connect time, not
on any cadence -- so a Connector that's actually wedged but still
socket-connected will show a stale-but-plausible "last seen" and never
surface as unhealthy from the Vendor Portal alone (Diagnostics on the
Connector Manager side would still catch it locally). This is exactly
what the already-tracked, not-yet-started "Connector hardening: heartbeat
+ health" work item is for.

### Sequence diagram -- Vendor Portal provisioning + activation code issuance

```
Vendor Portal Admin        Vendor Portal Backend        HDSP Backend                Database
        |                          |                          |                        |
        |--Create hospital-------->|                          |                        |
        |                          |--POST /tenants/provision->|                        |
        |                          |                          |--Step 1: create Tenant->|
        |                          |                          |--Step 7: generate------>|
        |                          |                          |   TenantConnectorPairing|
        |                          |                          |   (status=pending,      |
        |                          |                          |    hash only, TTL 72h)  |
        |                          |<--{activationCode, ...}--|                        |
        |<--activationCode (shown once)                       |                        |
        |                          |                          |                        |
        |  [give code to hospital IT out of band]              |                        |
        |                          |                          |                        |
        | -- later, if lost/expired --                        |                        |
        |--Regenerate------------->|--POST .../regenerate----->|--revoke old pending---->|
        |                          |                          |--create new pending---->|
        |<--new activationCode-----|<--new activationCode------|                        |
```

---

## 2. Installer Workflow

Running `HDSP_Connector_1.0.0_x64.exe`
(`connector-installer/HDSP_Connector.iss`) does the following, in order:

1. **Files copied** into `{app}` = `C:\Program Files\HDSP Connector\`:
   `connector.exe`, `tray.exe`, `nssm.exe`, the Connector Manager's built
   static assets under `manager-ui\`, and `install-service.exe` /
   `uninstall-service.exe`.
2. **Windows Service installed**: `install-service.exe` (a `pkg`'d wrapper
   around `install-service.js`) shells out to `nssm.exe` to register
   `HDSPConnector`, wrapping `connector.exe` directly (not a raw Node
   script -- see §18.3 of the architecture doc for why NSSM was chosen
   over `node-windows`), sets `Start=SERVICE_AUTO_START`, redirects
   stdout/stderr to `%ProgramData%\HDSP\Connector\logs\service.log`
   (10MB rotation), and sets four environment variables NSSM injects into
   the service process: `CONNECTOR_CLOUD_URL`, `CONNECTOR_MANAGER_UI_DIR`,
   `CONNECTOR_CONFIG_DIR`, `CONNECTOR_SERVICE_NAME`.
3. **Connector Manager**: not a separate installed application -- it's
   static files (`manager-ui\`) served by `connector.exe` itself over its
   own local HTTP server (`connector/src/api/local-api-server.ts`'s
   `express.static(STATIC_DIR)`). "Installing the UI" in practice just
   means these files exist on disk where `CONNECTOR_MANAGER_UI_DIR` points.
4. **Tray process**: installed as a genuinely separate executable
   (`tray.exe`), by design -- a Windows Service runs in Session 0 with no
   desktop, so it cannot show a tray icon itself (see
   `connector-tray/README.md`). The tray talks to the Service only over
   `127.0.0.1`, never touching Oracle or the cloud directly.
5. **Start Menu / desktop shortcuts**: point at `tray.exe`, not
   `connector.exe` -- launching the shortcut opens the tray icon, which is
   how a user actually gets to the Manager UI (the Service itself has no
   user-facing entry point).
6. **Service started**: `install-service.exe`'s own final step starts it;
   the `.iss` script's `[Run]` section also calls `nssm start` again as a
   harmless idempotent safety net.
7. **Connector Manager launched**: the installer's final `[Run]` entry
   launches `tray.exe` with `postinstall`/`skipifsilent` flags, which in
   turn opens the user's default browser to the Manager UI.

**Program Files layout** (static, replaced wholesale on upgrade):
`connector.exe`, `tray.exe`, `nssm.exe`, `manager-ui\`,
`install-service.exe`, `uninstall-service.exe`, `uninstall.exe`.

**ProgramData layout** (`C:\ProgramData\HDSP\Connector\`, mutable, never
touched by install/upgrade): `credentials.enc.json` + `store.key`
(TokenStore), `oracle-config.enc.json` (OracleConfigStore),
`logs\service.log`.

**Startup behavior**: `Start=SERVICE_AUTO_START` means the service starts
on every subsequent Windows boot without any user action, independent of
whether the tray/UI is open. The tray is not registered for autostart by
this installer today (see §8 -- the "Update Workflow" and §12 findings
below flag this explicitly).

### Installation workflow diagram

```
Run HDSP_Connector_1.0.0_x64.exe
        |
        v
 [Files] copy connector.exe, tray.exe, nssm.exe,
         manager-ui\, install/uninstall-service.exe
        |
        v
 [Run] install-service.exe "{app}" "{ProgramData}\HDSP\Connector"
        |         (nssm install HDSPConnector connector.exe;
        |          set AUTO_START, AppDirectory, AppStdout/Stderr,
        |          AppEnvironmentExtra CONNECTOR_*; nssm start)
        v
 [Icons] Start Menu + optional Desktop shortcut -> tray.exe
        |
        v
 [Run] nssm start HDSPConnector   (idempotent safety net)
        |
        v
 [Run, postinstall] tray.exe launches
        |                 |
        |                 +--> opens default browser to
        |                      http://127.0.0.1:4200 (Manager UI,
        |                      served by connector.exe itself)
        v
 Installer completes -- Dashboard shows "not activated yet"
```

---

## 3. First-Time Activation Workflow

Starting state: Connector Manager open in the browser, Dashboard shows
"not activated," Oracle not yet configured, Windows Service already
running (per §2).

1. Admin clicks **Activation** in the sidebar. The UI calls
   `GET /api/v1/activation` -- returns `{activated: false, tenantId: null,
   connectorId: null, hostname: <machine hostname>}`.
2. Admin types the Activation Code, clicks Activate. The UI calls
   `POST /api/v1/activation` with `{activationCode, hostname?}`
   (`connector/src/api/local-api-server.ts`).
3. `ConnectorRuntime.activate()` is invoked. It guards against
   double-activation (throws if `this.activation` is already set -- see
   the honest limitation on re-activation in §9 below) then calls
   `registerConnector()` (`connector/src/auth/registration.ts`), which
   issues **`POST {CONNECTOR_CLOUD_URL}/api/v1/connector/register`** with
   `{tenantCode: undefined, activationCode, hostname}` -- `tenantCode` is
   optional per the D.6 onboarding redesign, so the hospital never needs
   to know or type it.
4. On the backend, `ConnectorRegistrationService.register()`
   (`backend/.../connector-registration.service.ts`) normalizes the code,
   scans every currently-`pending`, non-expired `TenantConnectorPairing`
   row (globally, since no `tenantCode` was given) and `bcrypt.compare`s
   each candidate until one matches. On match: flips that pairing row to
   `active`, creates a new `ConnectorInstance` row (`status: registered`),
   and issues a JWT pair via `issueTokens()` -- a 15-minute access token
   and a 30-day refresh token, both signed with a connector-only secret
   (`jwt.connectorSecret` / `jwt.connectorRefreshSecret`, distinct from
   the user-auth secrets) and carrying `{sub: connectorId, tenantId, type:
   'connector_access'|'connector_refresh', jti}`.
5. The response `{connectorId, tenantId, accessToken, refreshToken}` comes
   back to the Connector. `ConnectorRuntime.activate()` immediately calls
   `TokenStore.save()` -- AES-256-GCM encrypted at rest, key in a separate
   `store.key` file, both under `%ProgramData%\HDSP\Connector\` with
   `0o600`/`0o700` permissions (`connector/src/auth/token-store.ts`).
   *(See §11's security review -- this is a point worth flagging: it does
   NOT go through the DPAPI-backed `SecureJsonStore` that Oracle
   credentials use; more below.)*
6. `activate()` then calls the private `startPipeline()`, which opens the
   persistent WebSocket connection (`WebSocketMessageTransport` ->
   `ConnectorGateway.handleConnection()` on the backend), authenticating
   with the just-issued access token in the socket handshake. On success,
   the backend flips `ConnectorInstance.status` to `online`, joins the
   socket to `connector:{id}` and `tenant:{id}` rooms, and emits a
   `'connected'` event that `HisQueryDefinitionPublisherService` listens
   for -- triggering an immediate full query-definition sync push down to
   the Connector (no separate manual step needed).
7. Local API responds `201 {ok: true, tenantId, connectorId}`. The
   Activation page re-renders read-only: hospital/tenant identity,
   status. Dashboard shows Connected once the WebSocket handshake and
   first definition sync both land.

**Failure scenarios, as actually coded:**
- Wrong/expired/already-redeemed code -> backend returns 401
  (`UnauthorizedException`, message deliberately identical for "no such
  tenant code" and "code doesn't match," to avoid an oracle for
  enumeration) -> `registerConnector()` throws -> local API responds
  `400 {ok:false, message}` -> UI shows the message directly.
- Calling Activate twice on an already-activated Connector -> `activate()`
  throws "already activated" -> local API responds `409`, distinctly from
  the `400` given to every other failure, so the UI can special-case it.
- `CONNECTOR_CLOUD_URL` not configured on the machine at all -> `activate()`
  throws before even attempting the HTTP call -> `400`.
- Network failure reaching the cloud (DNS, firewall, cloud down) ->
  `fetch()` itself throws inside `registerConnector()`, surfaces as a
  generic `400` with the underlying error text -- there is no retry loop
  inside this call path (retry policy is deliberately left to the human
  clicking Activate again, per that function's own doc comment).

### Sequence diagram -- first-time activation

```
Hospital IT       Connector Manager UI      Connector Service        HDSP Backend
     |                    |                        |                       |
     |--Enter code------->|                        |                       |
     |                    |--POST /api/v1/activation-->                    |
     |                    |                        |--POST /connector/register-->
     |                    |                        |                       |--find pending pairing
     |                    |                        |                       |--bcrypt.compare
     |                    |                        |                       |--flip pairing active
     |                    |                        |                       |--create ConnectorInstance
     |                    |                        |                       |--issue JWT (access+refresh)
     |                    |                        |<--{connectorId, tenantId, tokens}--|
     |                    |                        |--TokenStore.save() (AES-256-GCM)   |
     |                    |                        |--open WebSocket, auth w/ access token->
     |                    |                        |                       |--handleConnection()
     |                    |                        |                       |--status: online
     |                    |                        |                       |--emit 'connected'
     |                    |                        |<--push query definitions (WS)-------|
     |                    |<--201 {ok, tenantId, connectorId}-|            |
     |<--Activation page shows tenant, read-only----|                     |
```

---

## 4. Oracle Configuration Workflow

**Where entered:** the Connector Manager's Oracle page, which calls
`PUT /api/v1/oracle/config` (save) and `POST /api/v1/oracle/test` (test
only, no persistence) -- both validated server-side by
`isValidOracleConfig()` (host/port/serviceName/username/password all
required; there is no partial-update support, so every save requires the
full credential set re-entered).

**Where stored:** `OracleConfigStore`
(`connector/src/config/oracle-config-store.ts`), writing
`oracle-config.enc.json` under `%ProgramData%\HDSP\Connector\`.

**How encrypted:** via `SecureJsonStore`, which picks Windows DPAPI
(`connector/src/security/dpapi.ts`, `CurrentUser` scope, invoked through a
`powershell.exe` child process) when `process.platform === 'win32'`, or
falls back to local AES-256-GCM (same shape as `TokenStore`, but a
separate implementation) on any other platform. `GET /api/v1/oracle/config`
never echoes the real password back -- `redactOracleConfig()` strips it
and returns `passwordSet: true` instead.

**What "Test Connection" does internally:** `ConnectorRuntime.
testOracleConnection()` calls `oracleClient.reconfigure(creds, testOnly=
true)` -- opens a real, throwaway Oracle connection pool with the
submitted credentials, attempts to connect, and closes it without ever
touching the live pool or persisting anything. This is why Test Connection
can be clicked repeatedly with different values before Save, with no
side effects either way.

**If Oracle is unavailable:** `reconfigure()` returns `{ok: false,
message}`, surfaced directly to the UI (400 response) -- no exception
propagates, no crash, the admin just sees why it failed and can retry.

**Does activation depend on Oracle:** No, by design, in both directions.
`ConnectorRuntime.boot()` always attempts to connect Oracle (using
whatever's already stored, or an empty client if nothing is stored yet)
completely independent of whether the Connector is activated. Conversely,
`activate()` never checks or requires Oracle connectivity at all -- a
hospital can activate first and configure Oracle later, or configure and
test Oracle before ever activating, matching the acceptance workflow's
"Configure Oracle -> Test Connection -> Save" as a parallel track, not a
dependency of the activation flow.

---

## 5. Connector Startup Workflow (Windows Reboot)

1. Windows boots -> Service Control Manager starts `HDSPConnector`
   (`Start=SERVICE_AUTO_START`, set by `install-service.js`) -> runs
   `connector.exe`.
2. `ConnectorRuntime.boot()` runs (`connector/src/runtime/
   connector-runtime.ts`): loads Oracle config from `OracleConfigStore`
   (falling back to `ORACLE_*` env vars only for local/CI convenience, not
   in a packaged install), constructs an `OracleClient` and calls
   `connect()` -- best-effort, non-fatal if it fails.
3. `TokenStore.load()` is attempted. If stored credentials decrypt
   successfully, `this.activation` is set from them immediately (no
   network call needed to know "am I activated") and `startPipeline()`
   runs right away.
4. `startPipeline()` opens the WebSocket transport, authenticating with
   the stored access token (refreshing via `refreshAndPersist()` first if
   the in-memory token is stale/near-expiry -- the `getAccessToken`
   closure passed to `WebSocketMessageTransport` handles this
   transparently on every (re)connect attempt).
5. On successful WebSocket auth, the backend's `'connected'` event fires
   again, triggering a fresh full query-definition sync -- so a reboot
   always re-synchronizes definitions from the cloud rather than trusting
   whatever was last cached locally.
6. The local REST API and Manager UI start serving immediately, in
   parallel with all of the above (they're not gated on Oracle or cloud
   connectivity succeeding) -- Diagnostics can always be opened even if
   everything else is currently broken.
7. The tray process **is** restarted automatically on every reboot -- a
   per-user Startup-folder shortcut for `tray.exe` was added to the
   installer as a release-blocker fix (see §8), so the tray reappears
   without any manual relaunch.

**If Oracle is offline at boot:** `boot()` logs and continues; Dashboard
shows Oracle unhealthy, Diagnostics' `oracle` check fails with "check
Oracle settings and Test Connection," everything else (activation,
WebSocket, UI) proceeds normally and independently.

**If internet is unavailable:** the WebSocket connection simply never
succeeds (retries per `WebSocketMessageTransport`'s own reconnect logic);
Diagnostics' `internet` check (a raw TCP dial to `1.1.1.1:443`) and
`cloud` check both fail; Oracle and the local UI are unaffected.

**If JWT expired:** the *access* token expiring is a non-event -- the
`getAccessToken` closure calls `refreshAndPersist()` automatically using
the still-valid *refresh* token (30-day life) on the next connection
attempt. If the *refresh* token itself has also expired or was
server-side revoked (blacklisted-on-rotate), `refreshAndPersist()` throws;
`startPipeline()`'s WebSocket auth then fails and Dashboard shows
disconnected with no automatic self-heal -- this is a genuine dead end
today (see §9's finding: nothing currently distinguishes "expired
credentials, needs re-activation" from any other WebSocket failure in the
UI).

**If activation is missing entirely** (fresh install, service running,
never activated): `boot()`'s `else` branch logs "waiting for an Activation
Code" and stops there -- no error, no crash. The local API and Manager UI
are fully available; Dashboard honestly reports `activated: false`.

---

## 6. Normal Runtime Workflow -- Patient Lookup

```
Cloud Frontend       HDSP Backend (PatientService)   ConnectorJobDispatchService   ConnectorGateway   Connector Process    Oracle
      |                        |                              |                        |                   |               |
      |--getByMrn(mrn)-------->|                              |                        |                   |               |
      |                        |--dispatch(queryId, binds)--->|                        |                   |               |
      |                        |                              |--dispatchToConnector-->|                   |               |
      |                        |                              |                        |--emit 'connector:request'-------->|
      |                        |                              |                        |   {correlationId, queryId, binds} |
      |                        |                              |                        |                   |--compile SQL   |
      |                        |                              |                        |                   |  from local    |
      |                        |                              |                        |                   |  SqlTemplateRegistry
      |                        |                              |                        |                   |--execute w/ binds->
      |                        |                              |                        |                   |<--rows------------|
      |                        |                              |                        |<--'connector:response' {result}---|
      |                        |                              |<--resolve promise------|                   |               |
      |                        |<--result---------------------|                        |                   |               |
      |<--patient data---------|                              |                        |                   |               |
```

**Authorization**: the whole path is gated on the Connector's WebSocket
socket already being authenticated (§3/§5) -- `ConnectorGateway` only
dispatches into `connector:{connectorId}`'s room, which only the correctly
JWT-authenticated socket for that specific tenant ever joined. A request
for tenant A's data can only physically reach tenant A's Connector,
because the dispatch call is always scoped by `connectorId`/`tenantId`
resolved server-side, never supplied by the frontend caller directly.

**QueryId / SQL template / binds**: HIS services (e.g.
`PatientService.getByMrn()`) call `IOracleTransport` with an explicit
`queryId` (D.4/D.5 work), which the backend's `HisQueryTemplateCompiler`
resolves to a specific, versioned, tenant-scoped SQL template
(`HisQueryDefinitionPublisherService` is what pushed the compiled template
down to this specific Connector over the `'connector:sync-templates'`
event during activation/reconnect, per §3/§5). The Connector's own
`SqlTemplateRegistry` looks up that `queryId`'s locally-cached template
(`sql`, `expectedBinds`) and executes it against Oracle with the supplied
bind values -- the raw SQL text itself never travels in the per-request
message, only `queryId` + binds, matching the whole point of the D.3-D.6
work: SQL logic lives in versioned, auditable definitions on the backend,
not hardcoded on either end of the wire per request.

**Result**: rows come back from Oracle, are wrapped in a
`MessageTransportResponse` keyed by the original `correlationId`, and
`ConnectorGateway.handleResponse()` resolves the specific pending promise
`ConnectorJobDispatchService` (BullMQ-backed, so a dispatch that fails
because the Connector was briefly offline is retried by Bull's own
retry/backoff, not by hand-rolled logic in the gateway) is awaiting.

---

## 7. Operational Workflow -- Vendor Portal Support Usage

All of the following are Vendor Portal Connector page actions, proxying
to the same `tenant-provisioning.controller.ts` endpoints used in §1,
with every mutating action audit-logged (`AuditService.log()`) under a
dedicated action name and `source: 'vendor-portal-connector-page'`:

- **View Connector Status** -- `GET tenants/:tenantId/connector`: status,
  hostname, (currently-null) version, last-seen, live-connected flag,
  registered-at, and a query-definitions sync summary. Read-only, no
  audit entry (nothing changed).
- **Generate / Regenerate Activation Code** -- as covered in §1; both
  logged (`CONNECTOR_ACTIVATION_CODE_REGENERATED` for regenerate).
- **Republish Query Definitions** -- `POST .../connector/republish`,
  delegates to `HisQueryDefinitionPublisherService.publishFull(tenantId)`
  -- the exact same underlying logic the internal admin route already
  used, just reachable without an internal HDSP JWT. Logged as
  `HIS_QUERY_DEFINITIONS_REPUBLISHED`.
- **Force Connector Resync** -- `POST .../connector/resync`, looks up the
  tenant's registered `connectorId` itself (caller only needs `tenantId`)
  and calls the same `publishFull(tenantId, connectorId)`. Fails with a
  clean 404 if the tenant has no registered Connector instance at all.
  Logged as `CONNECTOR_RESYNC_TRIGGERED`.
- **View Logs** -- this one is *not* Vendor-Portal-visible today. The
  Connector's `LogBuffer` (in-memory ring buffer, 500 entries) is only
  exposed via the *local* REST API (`GET /api/v1/logs`) and the Connector
  Manager's own Logs page, running on the hospital's machine. There is no
  path for HDSP support, sitting in the Vendor Portal, to pull a remote
  Connector's logs -- see §12's findings; this is a real, present-day gap
  for remote troubleshooting, distinct from the recent-activity/audit
  view described above (which is HDSP-side event history, not the
  Connector's own runtime log).
- **Connector Health** -- the Vendor Portal's "health summary" is the
  status/definitions read above; it is not the same as the local
  Diagnostics engine's 8-check report (§5), which never leaves the
  hospital's machine either.

---

## 8. Update Workflow (Connector v1.1.0)

Nothing in this codebase implements auto-update (Task #97, explicitly
deferred, `GET /api/v1/update/check` is a stub that always returns
`{updateAvailable: false, message: 'not implemented yet'}`). An upgrade
today means: HDSP publishes a new `HDSP_Connector_1.1.0_x64.exe`, and a
hospital IT admin manually downloads and runs it on the target machine --
there is no in-product notification, download, or self-update mechanism.

**How hospitals upgrade:** run the new installer over the existing
install. Inno Setup's default behavior (and this installer's
`UsePreviousAppDir=no`... actually re-checked: this script does not set
`AppMutex`/version-detection logic explicitly, so re-running it behaves
as a fresh install into the same `{app}` directory, overwriting the
Program Files contents) -- `install-service.js` is explicitly idempotent
(stops+removes any pre-existing `HDSPConnector` registration before
re-installing it), so re-running the installer safely re-registers the
service rather than erroring on "already exists."

**Is activation preserved?** Yes -- `TokenStore` lives in
`%ProgramData%\HDSP\Connector\`, untouched by the installer's `[Files]`
section (which only ever writes into Program Files). `boot()` picks the
existing credentials up exactly as before.

**Does Oracle configuration survive?** Yes, same reasoning --
`oracle-config.enc.json` is in ProgramData, never touched.

**Does the JWT survive?** Yes, as the same file as activation above; if
its 30-day refresh-token life happens to have lapsed since the last boot,
normal refresh-failure behavior applies (§5), unrelated to the upgrade
itself.

**Are query definitions re-synchronized?** Yes, automatically -- any
fresh WebSocket connect/reconnect (which restarting the service via the
upgrade naturally causes) fires the backend's `'connected'` event, which
`HisQueryDefinitionPublisherService` always answers with a full resync,
regardless of whether anything actually changed. There is no
version-skip or partial-sync logic to worry about.

**RESOLVED (2026-07-22, reclassified as a release blocker per review
feedback and fixed before v1.0.0):** the tray process (`tray.exe`)
previously had no registered Windows autostart entry anywhere in this
installer -- only the Windows Service was set to auto-start. After an
upgrade or any reboot, the Service and the Manager UI it serves came back
automatically, but the *tray icon* did not reappear until a human
manually re-launched it. This document's first draft called this
cosmetic; the reviewer correctly pushed back with the realistic scenario
that matters here: overnight reboot, no tray icon the next morning, IT
staff reasonably but wrongly concludes the Connector failed, and calls
support for a connector that was actually running the whole time -- a
real, avoidable support-load and trust cost, not a cosmetic one.
`connector-installer/HDSP_Connector.iss`'s `[Icons]` section now includes
a `{commonstartup}` shortcut for `tray.exe`, so the tray reliably
reappears at logon for any user on the machine, with zero manual action,
exactly matching the "everything just works after a reboot" bar the
Windows Service already met. Inno Setup removes this shortcut
automatically on uninstall, same as every other `[Icons]` entry.

---

## 9. Disaster Recovery Workflow

**Windows machine failure / server replacement:** the failure mode here is
total -- everything durable lives on that one machine's local disk
(`%ProgramData%\HDSP\Connector\`). There is no backup, export, or cloud
mirror of `credentials.enc.json`, `store.key`, or `oracle-config.enc.json`
anywhere in this codebase. Losing the machine means losing all of it.

**Reinstalling the Connector on new hardware:** run the same installer on
the replacement machine -- Program Files content is recreated from
scratch, but ProgramData starts empty (nothing to restore from, since
nothing was ever backed up off that specific machine).

**Restoring configuration:** not possible in the "restore a backup" sense
-- Oracle configuration must be re-entered by hand through the Manager
UI's Oracle page, exactly as on first install.

**Re-activation:** required, and this surfaces the one real functional
gap in the activation design worth calling out plainly: `ConnectorRuntime.
activate()` throws if `this.activation` is already set, and there is no
"deactivate"/"replace credentials" API at all. On a fresh machine this is
a non-issue (no prior activation exists), so the hospital simply
regenerates an Activation Code from the Vendor Portal (§1/§7) and
activates the new install normally. The only place this bites is if a
support engineer ever needs to *re-activate the same still-running
process* (e.g. after a credential-store corruption without a full
reinstall) -- today that requires reinstalling the Connector (which gives
a fresh, un-activated `ConnectorRuntime` instance) rather than any
in-place reset.

**Connector identity:** a replacement machine is, cryptographically, a
*brand-new* `ConnectorInstance` row -- the old one (from the failed
machine) is simply orphaned, forever `status: offline` (or whatever it
last was) with no automatic cleanup. `ConnectorInstance`'s own doc comment
acknowledges this directly: "one tenant can in principle register more
than one ConnectorInstance... this entity does not enforce one-per-tenant"
and fleet cleanup of stale rows is explicitly out of scope for the phase
that built this entity.

**Vendor Portal behavior:** after re-activation on replacement hardware,
`GET tenants/:tenantId/connector` will report whichever `ConnectorInstance`
`ConnectorDirectoryService.findInstanceForTenant()` resolves to for that
tenant -- if that resolution logic returns "most recent" or similar, the
new instance naturally takes over the Vendor Portal's displayed status;
if it doesn't already do that correctly, a hospital with an orphaned old
row and a new active one could show ambiguous or stale status. (Not
independently re-verified in this pass -- flagged as worth a direct check
during Phase 2/3 validation, not asserted as broken.)

---

## 10. Multi-Tenant Workflow

**1 hospital, 10, 100, 1000 -- does the installer change?** No. The
installer artifact is identical for every hospital
(`HDSP_Connector_1.0.0_x64.exe`) -- it contains no tenant-specific
configuration baked in at build time. **One installer supports every
hospital.** Tenancy is established entirely at activation time, by which
Activation Code is redeemed, not by which installer binary was run.

**How Connector instances are isolated:** every `ConnectorInstance` row
carries its own `tenantId`, and every JWT issued to that instance embeds
that same `tenantId` in its payload -- `ConnectorGateway` reads `tenantId`
straight from the verified JWT (never from anything the client claims
outside the token) and joins the socket to a `tenant:{tenantId}` room.
Dispatch (§6) is always scoped by a server-resolved `connectorId`, so one
hospital's Connector physically cannot receive another hospital's query
requests -- there is no shared queue or topic a misconfigured or
compromised Connector could accidentally (or deliberately) read across.

**How the backend knows which tenant owns each Connector:** the
`ConnectorInstance.tenantId` column, set once at registration from the
`TenantConnectorPairing` row the Activation Code redeemed, and never
mutated afterward.

**How the Activation Code determines tenancy:** the code itself is not
tenant-scoped by its *format* (it's just `XXXX-XXXX-XXXX` from a
36-symbol safe alphabet) -- tenancy is determined by *which*
`TenantConnectorPairing` row's bcrypt hash the submitted code happens to
match, out of every currently-pending row across every tenant (when
`tenantCode` isn't supplied, which is the default onboarding path now).
This is a genuine, deliberate design tradeoff worth stating plainly: at
1,000 hospitals, a registration attempt does a linear bcrypt-compare scan
across every tenant's pending codes rather than an indexed lookup, because
only the hash is stored and bcrypt is one-way by construction. The
codebase's own doc comment argues this is "safe" given a 36-symbol,
12-character code's entropy and the 72-hour expiry window bounding how
many pending rows can realistically accumulate -- but it is a scan whose
cost grows with the number of *simultaneously pending* (not total)
codes, which is a fair scaling assumption at current hospital counts and
one worth re-measuring, not re-designing, if pending-code volume ever
grows unexpectedly (e.g. a bulk-onboarding campaign generating hundreds of
codes at once before any are redeemed).

---

## 11. Security Review

**Activation Code security:** 12 characters from a 32-symbol
ambiguity-free alphabet (no `0/O/1/I/L`), bcrypt-hashed at rest (never
stored or logged in plaintext, ever), single-use, 72-hour expiry,
regenerate-revokes-prior-pending. Rate-limiting on the registration
endpoint is mentioned in the registration service's own doc comment
(`@Throttle()` guard on the controller) as the defense against brute-force
retry -- not independently re-verified in this pass, worth confirming
during validation.

**JWT lifecycle:** connector access tokens are short-lived (15 minutes),
refresh tokens longer-lived (30 days) with blacklist-on-rotate (the old
refresh token's `jti` is blacklisted in Redis the instant it's used,
closing the reuse window a stolen-but-already-used refresh token would
otherwise have). Connector tokens are signed with dedicated secrets
(`jwt.connectorSecret` / `jwt.connectorRefreshSecret`) entirely separate
from user-auth JWT secrets, and carry a `type` discriminator
(`connector_access`/`connector_refresh`) that both the gateway and the
refresh endpoint check explicitly -- a user JWT cannot masquerade as a
connector token and vice versa, by construction, not just by convention.

**Oracle credential security:** DPAPI-encrypted at rest on Windows
(`CurrentUser` scope, so only the OS user account the Service runs as can
decrypt it), AES-256-GCM fallback elsewhere. Never round-tripped back to
the UI in plaintext (`redactOracleConfig()`).

**RESOLVED (2026-07-22, reclassified as a release blocker per review
feedback and fixed before v1.0.0, not deferred to a 1.0.x patch):**
`TokenStore` previously did NOT use the same DPAPI-backed
`SecureJsonStore` that `OracleConfigStore` uses -- it had its own,
separate, hand-rolled AES-256-GCM implementation, with the encryption key
sitting in a plaintext file (`store.key`) in the *same* directory as the
ciphertext it protects. On Windows, this meant Oracle credentials got
real OS-user-scoped DPAPI protection, while the connector's own cloud
identity (arguably higher-value to an attacker, since it grants live
query access to the hospital's data through the Connector) got only
file-permission protection (`0o600`/`0o700`). This document's first draft
called this "not a release blocker"; the reviewer disagreed, correctly --
the fact that a fix is small and low-risk is precisely the argument
*for* fixing it before the tag, not after. `connector/src/auth/
token-store.ts` has been rewritten as a thin wrapper around
`SecureJsonStore<ConnectorCredentials>` (same class `OracleConfigStore`
already uses), with new tests
(`connector/src/auth/__tests__/token-store.spec.ts`) confirming it
round-trips credentials and writes through the DPAPI/AES-GCM-fallback
backend rather than the old hand-rolled shape. There is no migration path
for a credentials file written by the old format -- consistent with the
same "nothing has shipped to a real hospital yet" reasoning already
applied to the local API's v1 versioning and the 1.0.0 version bump, a
Connector activated against a pre-fix dev/test build simply re-activates
once after upgrading past this change.

**Local API exposure:** binds `127.0.0.1` only, confirmed directly in
`local-api-server.ts` (`app.listen(port, '127.0.0.1')`). No auth on these
routes, which the code's own doc comment defends explicitly: the trust
boundary is "can this process reach 127.0.0.1 on this machine," the same
model Docker Desktop and most local dev tools use. Reasonable for a
single-admin-workstation tool; would need revisiting only if this were
ever exposed on a shared/multi-user terminal server, which is out of
scope for this product's stated deployment model.

**WebSocket authentication:** every connection is authenticated at
handshake time via the connector access JWT in `handshake.auth.token`;
unauthenticated or wrong-type sockets are rejected and disconnected
immediately, before joining any room.

**Replay protection:** JWT `jti` + short access-token TTL + blacklist-on-
refresh-rotate together bound how long a captured token remains useful;
there's no separate nonce/replay-window mechanism for individual
WebSocket messages themselves (each `connector:request`/`connector:response`
pair is correlated by `correlationId` for matching, not for replay
prevention) -- acceptable given the transport itself is a single
authenticated, long-lived socket rather than discrete signed requests.

**Connector impersonation prevention:** a socket cannot claim a
`connectorId`/`tenantId` -- both are derived server-side from the verified
JWT payload, never read from anything the client sends alongside it. Room
membership (`connector:{id}`, `tenant:{id}`) is likewise server-assigned
at `handleConnection()` time, not requested by the client.

**Remaining risks worth naming, none of which is new architecture --
just things worth deliberately accepting or scheduling:**
- `TokenStore` DPAPI gap -- **fixed**, see above.
- No remote log access from the Vendor Portal (§7) -- support cannot
  diagnose a hospital's Connector without the hospital's IT admin
  screen-sharing or exporting Diagnostics/Logs locally.
- No heartbeat -- `lastSeenAt`/`version` staleness (§1) means the Vendor
  Portal's own "is this Connector healthy" signal is weaker than it looks.
- Orphaned `ConnectorInstance` rows after a hardware-replacement DR event
  (§9) have no automated cleanup or Vendor Portal surfacing today.

---

## 11a. Connector Compatibility Policy

Added per review feedback: this review spent a lot of time on
installation and upgrade *mechanics* (§2, §8) without ever stating the
compatibility *policy* those mechanics need to satisfy. That policy
doesn't exist as a formal, versioned contract anywhere in this codebase
today -- it's implied by the version numbers already established in
`HDSP_CLOUD_CONNECTOR_ARCHITECTURE.md` §18.1, but never written down as
rules. This section is that policy, not a design change.

**Connector 1.0.x is compatible with:**

| Component | Version |
|---|---|
| HDSP Backend | 1.0.x |
| Vendor Portal | 1.0.x |
| Connector Protocol | v1 |
| Connector Local API | v1 |

**Rules:**

1. **Protocol version gates wire compatibility, not product version
   numbers.** A Connector and the backend it talks to are compatible if
   and only if they agree on Connector Protocol version -- today, always
   `v1` (`PROTOCOL_VERSION` in `connector/src/health.ts`). Product version
   numbers (Connector 1.0.0, 1.0.1, ...) can advance independently of the
   protocol as long as neither side's protocol version changes.
2. **A protocol version bump requires a coordinated upgrade.** If a future
   change to the `connector:request`/`connector:response`/
   `connector:sync-templates` message shapes is breaking, it ships as
   Connector Protocol v2, and the backend must support both v1 and v2
   simultaneously for as long as any v1 Connector remains installed
   anywhere in the fleet -- exactly the same "old version keeps working"
   posture already adopted for the local REST API (`/api/v1` alongside a
   future `/api/v2`, per §18.1 of the architecture doc), applied to the
   cloud-facing protocol instead of the local one.
3. **The local API's versioning is independent of the protocol's.** A
   Connector Manager UI build talks to whatever Connector Service version
   is installed on that same machine over `/api/v1/*` -- this is a
   same-machine, same-install contract (both come from the same
   installer run), not a fleet-wide compatibility surface the way the
   cloud protocol is. It only matters if the Manager UI and Service are
   ever decoupled and shipped/updated independently, which they are not
   today (§2).
4. **Backend/Vendor Portal version bumps that don't touch the protocol
   are transparent to already-installed Connectors.** Example (the shape
   of rule this table is meant to make ordinary going forward): "Backend
   1.0.2 supports Connector 1.0.0" and "Backend 1.0.3 supports Connector
   1.0.1" both hold simultaneously -- a backend upgrade never requires
   every hospital's Connector to also upgrade in lockstep, as long as
   Protocol v1 is unchanged.
5. **This table needs to be updated every time any of these four numbers
   changes**, the same discipline §18.1 already asks for -- a version
   bump without a corresponding update here is exactly the kind of drift
   that becomes expensive to reconstruct later once there are dozens or
   hundreds of hospitals on a mix of versions (§10).

---

## 12. Deployment Review

**1. Can a hospital IT administrator install and configure the Connector
without developer assistance?** Yes, based on direct code inspection of
every step in the workflow: the installer requires no command-line
interaction, activation is a single field in a web UI, Oracle
configuration is form fields plus a Test Connection button, and
diagnostics are one click. This has not yet been *observed* end-to-end on
a real machine (that's exactly what the Phase 2 runbook in
`connector-installer/VALIDATION_RUNBOOKS.md` exists to confirm) -- the
honest answer is "the code is written so that this should be true,"
not "this has been watched happening."

**2. Is there any point where a terminal, Swagger, Postman, `.env`
editing, or manual database changes are still required?** Not in the
happy path traced above. Two edge cases worth naming: (a) if a hospital's
outbound firewall blocks the Connector's WebSocket destination, resolving
that is a network/firewall conversation, not a terminal-in-the-product
requirement -- outside this product's control either way; (b) NSSM itself
must be manually downloaded to `connector-installer/build/nssm.exe`
*before the installer is compiled* -- that's a build-time step for HDSP's
release engineer, never something a hospital IT admin touches or sees.

**3. Are there any operational gaps remaining before this can be
considered a production-ready deployment?** Two items originally flagged
as deferrable were reclassified as release blockers on review and have
been fixed (not merely scheduled):
- **`TokenStore` not on DPAPI, unlike `OracleConfigStore` (§11) -- FIXED.**
  `token-store.ts` now wraps `SecureJsonStore`, same as Oracle config,
  with tests confirming the round-trip and the backend discriminator.
- **Tray had no autostart registration (§5, §8) -- FIXED.**
  `HDSP_Connector.iss` now installs a `{commonstartup}` shortcut for
  `tray.exe`, so it reappears automatically at logon after every reboot.

What remains, still genuinely deferrable:
- No connector heartbeat -> stale version/last-seen data in the Vendor
  Portal (§1, §11). The product functions correctly without it; it
  degrades observability, not correctness. Already tracked (Task #93).
- No remote log/diagnostics access from the Vendor Portal (§7, §11). Fine
  for a single-pilot-hospital deployment where a screen-share is a
  workable substitute; becomes more pressing at fleet scale (§10) and is
  exactly what the already-deferred "Fleet management" work item
  (Task #94) would need to address.
- No re-activation / credential-reset API short of a full reinstall (§9).
  Reinstalling is a fully functional workaround today.
- Orphaned `ConnectorInstance` rows after DR events, with no automated
  cleanup or Vendor Portal flagging (§9). Manual-cleanup annoyance at
  current hospital counts, not a blocker.
- No auto-update (§8) -- explicitly out of scope for v1.0.0 by the
  project's own stated priorities (Task #97), not a newly-discovered gap.

None of the above requires new architecture, and none of the two fixes
made this pass required any either -- both were small, scoped changes
using patterns (`SecureJsonStore`, Inno Setup `[Icons]`) that already
existed elsewhere in this codebase.

**4. What would you improve before releasing HDSP Connector v1.0.0?**
The two items that mattered most have already been fixed rather than
just recommended: `TokenStore` now matches `OracleConfigStore`'s DPAPI
posture, and the tray now survives a reboot without manual relaunch.
Beyond that, in priority order: (a) do not let this ship as "1.0.0 =
feature-complete forever" -- Phase 2 validation (`VALIDATION_RUNBOOKS.md`,
now including a time-synchronization check, see below) is where the
"Connector identity after hardware replacement" question (§9) and the
pending-code-scan scaling assumption (§10) should get their first
real-world data points, since both are reasoned-through-but-unverified
claims in this review, not independently load-tested facts; (b) treat
heartbeat/version reporting (Task #93) as the very next post-1.0.0
priority, since it's the gap most likely to make an actual production
incident harder to diagnose from the Vendor Portal alone; (c) keep §11a's
Connector Compatibility table updated every time any of its four version
numbers changes, starting now, before it has a chance to drift.

Nothing in this review suggests the architecture needs to change. The
workflow, end to end, is complete and internally consistent; what
remained after the two fixes above is exactly what the project's own
status table already says: validation, not development.
