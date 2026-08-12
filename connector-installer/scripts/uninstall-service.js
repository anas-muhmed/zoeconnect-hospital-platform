/**
 * uninstall-service.js (HDSP Connector 1.0 Deployment, Phase 1: Packaging,
 * 2026-07-22).
 *
 * Run by Inno Setup's [UninstallRun] section, BEFORE the uninstaller
 * deletes files from Program Files (nssm.exe must still exist on disk to
 * remove the service it registered). Stops and removes the Windows
 * Service only -- it deliberately does NOT delete
 * `%ProgramData%\HDSP\Connector` (activation credentials, Oracle config,
 * logs). Per standard Windows uninstall convention, `HDSP_Connector.iss`
 * asks the user during uninstall whether to also remove that mutable
 * ProgramData directory (a hospital reinstalling/upgrading almost always
 * wants to KEEP it -- re-activating and re-entering Oracle credentials
 * on every upgrade would be a regression from this whole product's
 * "installer quality" goal, not an improvement).
 *
 * Usage: uninstall-service.js <installDir>
 */

const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const SERVICE_NAME = 'HDSPConnector';

function main() {
  const [, , installDirArg] = process.argv;
  const installDir = installDirArg || 'C:\\Program Files\\HDSP Connector';
  const nssm = path.join(installDir, 'nssm.exe');

  if (!fs.existsSync(nssm)) {
    console.warn(`[uninstall-service] nssm.exe not found at ${nssm} -- service may already have been removed, or this install predates NSSM-based packaging. Continuing without error.`);
    return;
  }

  const run = (args) => execFileSync(nssm, args, { stdio: 'inherit' });

  try {
    run(['stop', SERVICE_NAME]);
  } catch (err) {
    console.warn(`[uninstall-service] Could not stop ${SERVICE_NAME} (may not be running): ${err.message}`);
  }

  try {
    run(['remove', SERVICE_NAME, 'confirm']);
    console.log(`[uninstall-service] ${SERVICE_NAME} removed.`);
  } catch (err) {
    console.error(`[uninstall-service] Could not remove ${SERVICE_NAME}: ${err.message}`);
    process.exitCode = 1;
  }
}

main();
