/**
 * install-service.js (HDSP Connector 1.0 Deployment, Phase 1: Packaging,
 * 2026-07-22).
 *
 * Run ONCE by the Inno Setup installer's [Run] section, after
 * connector.exe/tray.exe/nssm.exe/manager-ui have already been copied
 * into the install directory (Inno Setup does the file copying itself --
 * this script only registers and starts the Windows Service, it never
 * touches files). Node.js is NOT assumed to be present on the hospital's
 * machine, so this script is itself `pkg`'d into `install-service.exe`
 * (see connector-installer/package.json's `package:scripts` script) --
 * `HDSP_Connector.iss` invokes that compiled exe directly, not
 * `node install-service.js`.
 *
 * See README.md's "Why NSSM, not node-windows" for the rationale.
 *
 * Usage: install-service.js <installDir> <programDataDir>
 */

const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const SERVICE_NAME = 'HDSPConnector';
const SERVICE_DISPLAY_NAME = 'HDSP Connector';
const SERVICE_DESCRIPTION =
  'HDSP Connector -- bridges a hospital\'s on-prem Oracle HIS to the HDSP cloud backend. ' +
  'Manage via the HDSP Connector Manager (Start Menu) or the system tray icon.';

function main() {
  const [, , installDirArg, programDataDirArg] = process.argv;
  const installDir = installDirArg || 'C:\\Program Files\\HDSP Connector';
  const programDataDir = programDataDirArg || path.join(process.env.ProgramData || 'C:\\ProgramData', 'HDSP', 'Connector');
  const logsDir = path.join(programDataDir, 'logs');

  const nssm = path.join(installDir, 'nssm.exe');
  const connectorExe = path.join(installDir, 'connector.exe');

  if (!fs.existsSync(nssm)) {
    console.error(`[install-service] nssm.exe not found at ${nssm} -- see connector-installer/README.md's "Why NSSM" section for how to obtain it.`);
    process.exit(1);
  }
  if (!fs.existsSync(connectorExe)) {
    console.error(`[install-service] connector.exe not found at ${connectorExe} -- packaging step (npm run package in connector/) did not run or its output wasn't copied.`);
    process.exit(1);
  }

  fs.mkdirSync(logsDir, { recursive: true });

  const run = (args) => execFileSync(nssm, args, { stdio: 'inherit' });

  // Idempotent: if a previous install left the service registered (e.g. a
  // failed uninstall, or a repair install), remove it first rather than
  // erroring on "service already exists."
  try {
    run(['stop', SERVICE_NAME]);
  } catch { /* not running or doesn't exist yet -- fine */ }
  try {
    run(['remove', SERVICE_NAME, 'confirm']);
  } catch { /* didn't exist -- fine */ }

  run(['install', SERVICE_NAME, connectorExe]);
  run(['set', SERVICE_NAME, 'DisplayName', SERVICE_DISPLAY_NAME]);
  run(['set', SERVICE_NAME, 'Description', SERVICE_DESCRIPTION]);
  run(['set', SERVICE_NAME, 'Start', 'SERVICE_AUTO_START']);
  run(['set', SERVICE_NAME, 'AppDirectory', installDir]);

  // NSSM's own stdout/stderr redirection -- this is where "logs\service.log"
  // in the installation-layout doc comes from; the app's own in-memory
  // LogBuffer (surfaced via the Manager UI's Logs page) is a SEPARATE,
  // richer, structured log with no equivalent file-based counterpart
  // today -- this file is the raw console stream, useful for a support
  // engineer who needs to see output from before the process was even
  // reachable over HTTP (e.g. a crash during boot).
  run(['set', SERVICE_NAME, 'AppStdout', path.join(logsDir, 'service.log')]);
  run(['set', SERVICE_NAME, 'AppStderr', path.join(logsDir, 'service.log')]);
  run(['set', SERVICE_NAME, 'AppRotateFiles', '1']);
  run(['set', SERVICE_NAME, 'AppRotateBytes', String(10 * 1024 * 1024)]); // 10MB rotation

  // CONNECTOR_CLOUD_URL is the one required env var the Service needs at
  // boot (see connector/src/runtime/connector-runtime.ts's constructor) --
  // baked in here as an NSSM-managed environment variable rather than
  // requiring the installer to write a .env file the Service then reads,
  // consistent with this whole task's "no .env editing" product goal.
  // The production HDSP cloud URL is the compiled-in default; overridable
  // for a staging/pilot build via the installer's own configuration
  // (Inno Setup's [Code] section, not shown here -- see HDSP_Connector.iss).
  // NSSM's documented syntax for a multi-value parameter is one
  // KEY=value per command-line argument, not a single delimited string --
  // passed here as separate array elements (execFileSync does not invoke
  // a shell, so no quoting/escaping concerns for the `=` or the values).
  const cloudUrl = process.env.HDSP_CONNECTOR_CLOUD_URL || 'https://cloud.hdsp.com';
  run(['set', SERVICE_NAME, 'AppEnvironmentExtra',
    `CONNECTOR_CLOUD_URL=${cloudUrl}`,
    `CONNECTOR_MANAGER_UI_DIR=${path.join(installDir, 'manager-ui')}`,
    `CONNECTOR_CONFIG_DIR=${programDataDir}`,
    `CONNECTOR_SERVICE_NAME=${SERVICE_NAME}`,
  ]);

  run(['start', SERVICE_NAME]);

  console.log(`[install-service] ${SERVICE_NAME} installed and started.`);
}

main();
