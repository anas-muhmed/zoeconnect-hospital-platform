# HDSP Connector v1.0.0 -- Release Readiness Checklist

This is the final gate before tagging **HDSP Connector v1.0.0**. Per the
project's current stage (Architecture: complete, Implementation:
complete, Packaging: complete in code, Validation: remaining, Release:
pending), nothing below is a design or coding task -- every unchecked
item is either a build/execution step or a validation run against real
infrastructure, using the checklist embedded in
`connector-installer/VALIDATION_RUNBOOKS.md`. No new features are in
scope; if validation exposes a genuine defect, fix only that defect,
re-check only the affected rows, and record it in the Notes column below.

Do not tag the release until every box is checked.

| Area | Status | Notes |
|---|---|---|
| Backend build | ☐ | Main HDSP backend builds clean (`npm run build` / typecheck) with all Task #101/#102 changes included. |
| Vendor Portal build | ☐ | `vendor-portal/backend` and `vendor-portal/frontend` build clean, including the Connector Management page and proxy endpoints (Task #102/#106-109). |
| Connector build | ☐ | `connector/`, `connector-manager/`, `connector-tray/` all build clean (`npm run build`), each with a real `npm ci`/`npm install` completed on a machine that isn't this sandbox. |
| Installer builds successfully | ☐ | `iscc HDSP_Connector.iss` compiles without error and produces `HDSP_Connector_1.0.0_x64.exe`; requires `nssm.exe` downloaded into `connector-installer/build/` first. |
| Windows Service installation | ☐ | Service registers as "HDSP Connector", starts automatically, survives a reboot (VALIDATION_RUNBOOKS.md Phase 2, steps 2 & 12). |
| Activation flow | ☐ | Activation Code generated from Vendor Portal, entered in Connector Manager, activation succeeds and shows correct tenant/hospital (Phase 2 step 7). |
| Oracle connectivity | ☐ | Real Oracle host/port/service/credentials entered, Test Connection succeeds, Save persists and Dashboard shows Oracle healthy (Phase 2 steps 8-9). |
| WebSocket connectivity | ☐ | Connector registers with HDSP Cloud and maintains a live WebSocket connection; Vendor Portal shows the Connector Online with a recent "Last seen" timestamp. |
| Query definition sync | ☐ | Initial query definition sync completes on first connect; Diagnostics' "Query Definitions" check passes (Phase 2 step 11). |
| D.6 operational actions | ☐ | Republish Query Definitions and Force Connector Resync (Vendor Portal, Task #102) both verified against a live, activated Connector. |
| Clean install | ☐ | Full install on a VM with no prior HDSP Connector install, no pre-existing Node.js/VC++ redistributables (Phase 2 steps 1-11). |
| Upgrade install | ☐ | Re-running the installer over an existing install preserves activation state and Oracle config without re-activation (Phase 2 step 16). |
| Uninstall | ☐ | Uninstall removes the Windows Service and Program Files directory; ProgramData retention/removal matches the user's prompt choice (Phase 2 step 15). |
| Reboot recovery | ☐ | After a Windows reboot, the service auto-starts, the tray icon reappears without manual relaunch (release-blocker fix, `{commonstartup}` shortcut), and the Dashboard shows Connected without any manual intervention (Phase 2 steps 12 & 12a). |
| TokenStore DPAPI migration | ☐ | Activation on a real Windows VM confirms `credentials.enc.json` is written via the DPAPI backend (`SecureJsonStore`), matching Oracle config's protection -- release-blocker fix, code-reviewed and unit-tested but not yet observed against real DPAPI. |
| Time synchronization | ☐ | VALIDATION_RUNBOOKS.md Phase 2 steps 17-21: clock skewed ahead/behind, JWT auth/refresh and activation-code expiry all behave correctly. |
| UAT hospital validation | ☐ | Phase 3 pilot completed end-to-end against real Oracle, real HDSP Cloud, real Vendor Portal, one real tenant, including at least one real HIS operation (e.g. patient lookup by MRN) and a 48-72 hour soak period. |
| Documentation updated | ☐ | `HDSP_CLOUD_CONNECTOR_ARCHITECTURE.md` §17-18, `connector-installer/README.md`, `VALIDATION_RUNBOOKS.md`, and `HDSP_CONNECTOR_OPERATIONAL_WORKFLOW_REVIEW.md` (including its new §11a Compatibility Policy) reflect the as-built and as-validated state (including any fixes made during Phase 2/3). |

## Defect log (fill in as validation proceeds)

Every issue found during Phase 2 or Phase 3 is a release blocker until
resolved. Record it here rather than only in a chat thread, so the
checklist row it blocks stays visibly unchecked until closed.

| # | Found in (Phase/step) | Description | Fix applied | Re-verified? |
|---|---|---|---|---|
| | | | | |

## Sign-off

Once every row above is checked and the defect log has no open items,
this file itself is the record that gates tagging **v1.0.0**. Update the
version references in `HDSP_CLOUD_CONNECTOR_ARCHITECTURE.md` §18.1 if any
of the four version numbers (product, installer filename, protocol,
local API) changed as a result of validation fixes.
