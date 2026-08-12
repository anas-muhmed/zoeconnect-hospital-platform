# HDSP Connector 1.0 -- Validation Runbooks (Phase 2 & 3)

These are execution checklists for the two validation phases that follow
Phase 1 packaging (see `README.md` and `HDSP_CLOUD_CONNECTOR_ARCHITECTURE.md`
§18). Neither phase can be run in this sandbox -- no Windows machine, no
real Oracle instance, no real HDSP Cloud tenant -- so they're written for
a human (or QA) to execute on real infrastructure. Per the "HDSP Connector
1.0 Deployment" plan: "No new features. Use a clean Windows VM. If
something breaks, fix only that." These runbooks exist to hold that line.

## Phase 2 -- Real Windows Validation

**Goal:** prove the installer and the full activation-to-connected flow
work on a real, clean Windows machine. Not a feature test -- a shipping
test.

**Environment:** a clean Windows 10/11 or Windows Server VM with no prior
HDSP Connector install, no Node.js, no Visual C++ redistributables
pre-installed (the point is to catch anything the installer assumes but
doesn't provide).

**Prerequisites (build machine, not the test VM):**
1. `cd connector && npm ci && npm run build && npm run package`
2. `cd connector-manager && npm ci && npm run build`
3. `cd connector-tray && npm ci && npm run build && npm run package`
4. `cd connector-installer && npm ci && npm run package:scripts`
5. Download `nssm.exe` from <https://nssm.cc/download> to
   `connector-installer/build/nssm.exe`
6. `iscc HDSP_Connector.iss` -> produces
   `connector-installer/Output/HDSP_Connector_1.0.0_x64.exe`
7. Copy that installer to the clean test VM.

**Steps and pass/fail criteria:**

| # | Step | Pass criteria |
|---|------|----------------|
| 1 | Run `HDSP_Connector_1.0.0_x64.exe` on the clean VM | Installer completes without error; no missing-DLL or missing-runtime prompts |
| 2 | Check Windows Services (`services.msc`) | "HDSP Connector" service exists, status Running, startup type Automatic |
| 3 | Check `C:\Program Files\HDSP Connector\` | Contains `connector.exe`, `tray.exe`, `nssm.exe`, `manager-ui\`, `uninstall.exe` |
| 4 | Check `C:\ProgramData\HDSP\Connector\` | Directory exists; `logs\service.log` exists and has content |
| 5 | Confirm tray icon launched (installer's final step) | HDSP Connector icon visible in system tray; right-click shows all 7 menu items (Open Connector Manager, Reconnect, Run Diagnostics, View Logs, Check for Updates, Restart Connector, Exit Manager) |
| 6 | Click "Open Connector Manager" | Default browser opens to the Manager UI (served from `connector.exe`'s local API, `http://127.0.0.1:4200` by default -- overridable via `CONNECTOR_MANAGER_PORT`) |
| 7 | Go to Activation page, enter a real Activation Code (generated from the Vendor Portal against a real or staging tenant) | Activation succeeds; page becomes read-only, shows hospital/tenant name and status |
| 8 | Go to Oracle page, enter real Oracle connection details, click Test Connection | Test Connection reports success against a real Oracle instance |
| 9 | Click Save | Save succeeds; Dashboard shows Oracle as healthy |
| 10 | Check Dashboard overall status | Shows "Connected" -- Oracle, WebSocket, and cloud registration all green |
| 11 | Run Diagnostics from the tray menu | All 8 checks (Oracle, Internet, Cloud, WebSocket, JWT, Query Definitions, Disk, Windows Service) report pass |
| 12 | Reboot the VM | Service auto-starts (Automatic startup type); Dashboard shows Connected again without re-activation or re-entering Oracle credentials |
| 12a | After the same reboot, log in and check the system tray (no manual launch) | HDSP Connector tray icon is present without running anything manually -- confirms the `{commonstartup}` shortcut added as a release-blocker fix actually fires on this VM, not just in the `.iss` source |
| 13 | Right-click tray -> Exit Manager | Tray icon disappears; `services.msc` still shows the Windows Service Running (this is the explicit "Exit Manager closes only the UI" requirement) |
| 14 | Re-open Connector Manager via Start Menu shortcut | Opens fine even with the tray previously exited, since `connector.exe` (the Service) is what actually serves the UI |
| 15 | Uninstall via Control Panel / Apps & Features | Prompted whether to remove ProgramData; choosing "No" leaves `C:\ProgramData\HDSP\Connector\` intact; Windows Service is removed; Program Files directory is removed |
| 16 | Re-run the installer (simulating an upgrade) | Re-activation is NOT required if ProgramData was kept in step 15 -- Dashboard should show Connected again using the previously saved Oracle config and activation state |
| 17 | **Time-synchronization test.** Stop the Windows Time service (or otherwise disable auto-sync), manually set the VM's clock 10-15 minutes *ahead*, then exercise activation (if not already activated) or a Reconnect from the Dashboard | Activation still succeeds if the Activation Code is not yet expired by the shifted clock; the WebSocket connection authenticates normally -- a modest clock skew should not by itself break JWT verification |
| 18 | With the clock still shifted ahead, wait past (or force) an access-token expiry and confirm a reconnect/refresh cycle happens | `TokenStore.refreshAndPersist()` succeeds and the Dashboard stays Connected -- confirms refresh-token handling tolerates the skew, not just the initial handshake |
| 19 | Reset the clock, then set it 10-15 minutes *behind* real time, and repeat steps 17-18 | Same expectations as ahead-skew: activation/reconnect and refresh both still succeed under a plausible behind-skew |
| 20 | While clocked behind, attempt to redeem an Activation Code that is genuinely expired (per real wall-clock time, generated more than 72 hours before this step) | Registration is correctly rejected as expired -- confirms expiry is evaluated against a timestamp that isn't trivially foolable by *this machine's* clock alone (the check is server-side, against the server's own clock, so this should hold regardless of the Connector VM's skew -- this step is verifying that assumption in practice, not just in code) |
| 21 | Restore the VM's clock to normal (NTP sync back on) | Clock is accurate again before continuing to any later use of this VM |

**Why this matters:** clock drift is common in hospital environments,
especially on isolated or air-gapped network segments without reliable
NTP access, and JWT-based auth (§3/§5/§11 of
`HDSP_CONNECTOR_OPERATIONAL_WORKFLOW_REVIEW.md`) is inherently
clock-sensitive (`exp` claims, token issuance/verification timing). This
is cheap to check once before release and expensive to discover for the
first time during a real hospital pilot.

**If something breaks:** fix only that specific failure, re-run only the
steps affected, and do not use this phase to add capability. This mirrors
the user's explicit instruction for Phase 2.

## Phase 3 -- Hospital Pilot

**Goal:** validate the full product against real infrastructure end to
end: real Oracle HIS database, real HDSP Cloud backend, real Vendor
Portal, one real (pilot) hospital tenant.

**Prerequisites:**
- Phase 2 fully passed on a VM that resembles the pilot hospital's actual
  Windows environment (version, domain-joined or not, antivirus policy,
  outbound firewall rules).
- A real tenant provisioned in HDSP Cloud via the Vendor Portal (Task #102
  flow: Vendor Portal creates the tenant, generates an Activation Code).
- Read access to the pilot hospital's actual Oracle HIS schema
  (coordinate connection details, VPN/firewall allowances for outbound
  WebSocket to HDSP Cloud, and Oracle Instant Client requirements ahead of
  the pilot date).

**Steps:**

1. Vendor Portal: confirm the pilot tenant exists, generate its Activation
   Code (Vendor Portal Connector Management page, Task #102).
2. Install the Connector on the hospital's designated machine using the
   same installer validated in Phase 2.
3. Activate using the real Activation Code.
4. Configure the real Oracle connection; Test Connection against the
   hospital's actual HIS database.
5. Save, confirm Dashboard shows Connected.
6. From the Vendor Portal, confirm the Connector shows Online, with a
   recent "Last seen" timestamp and correct Tenant/Hospital association.
7. Exercise at least one real query end-to-end (e.g. patient lookup by
   MRN) through the full path: HDSP Cloud -> WebSocket -> Connector ->
   Oracle -> back. Confirm correct data and reasonable latency.
8. Run Diagnostics and confirm all 8 checks pass against the real
   environment.
9. Leave the Connector running for an extended soak period (recommend at
   least 48-72 hours) to observe reconnect behavior across any network
   blips, Windows Update reboots, or Oracle restarts -- this is what
   Task #93 (connector hardening: heartbeat + health) and the pending
   platform-validation tasks (#83/#84) are meant to give confidence in,
   but a real pilot is the only way to see it under real conditions.
10. Collect and review `service.log` and the Manager UI's Logs page for
    anything unexpected (warnings, reconnect cycles, errors) even if the
    Dashboard shows healthy throughout.

**Explicitly out of scope for the pilot** (per the user's stated
priorities): auto-update and fleet management (multi-connector visibility
across many hospitals) are both flagged as future enhancements, not
required for this pilot to be considered successful. A successful pilot
is: one hospital, one Connector, real data, stable for the soak period,
with no manual terminal/`.env`/Postman intervention required at any point
-- consistent with Task #103's original acceptance criteria.
