; HDSP_Connector.iss -- Inno Setup script for the Connector-only installer
; (HDSP Connector 1.0 Deployment, Phase 1: Packaging, 2026-07-22).
;
; Produces HDSP_Connector_1.0.0_x64.exe. Installs the Connector Windows
; Service, the Connector Manager UI (static assets served by the Service's
; own local API -- see connector/src/api/local-api-server.ts), the system
; tray application, Start Menu shortcuts, and an uninstaller. Mirrors the
; section conventions of the existing whole-platform installer/HDSP.iss
; (same [Setup]/[Dirs]/[Files]/[Run]/[UninstallRun] structure, NSSM for
; service management) but is scoped to only this product -- see
; connector-installer/README.md for why this is a separate installer.
;
; STATUS: scaffolded, not verified. This has not been compiled with iscc
; or run on a real Windows machine in this sandbox. Treat as a first draft
; per connector-installer/README.md's "Status" section.
;
; Expects, before compiling (see README.md's "Build steps"):
;   connector-installer/build/connector.exe
;   connector-installer/build/tray.exe
;   connector-installer/build/nssm.exe            (downloaded, not vendored)
;   connector-installer/build/install-service.exe
;   connector-installer/build/uninstall-service.exe
;   connector-manager/dist/*                      (built Vite UI assets)

#define MyAppName "HDSP Connector"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "LifeHIS"
#define MyServiceName "HDSPConnector"

[Setup]
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\HDSP Connector
DefaultGroupName=HDSP Connector
UninstallDisplayIcon={app}\connector.exe
Compression=lzma2
SolidCompression=yes
OutputDir=Output
OutputBaseFilename=HDSP_Connector_{#MyAppVersion}_x64
SetupLogging=yes
RestartIfNeededByRun=no
CloseApplications=yes
UsePreviousAppDir=no
DisableDirPage=no
ArchitecturesAllowed=x64
ArchitecturesInstallIn64BitMode=x64
PrivilegesRequired=admin

[Dirs]
Name: "{app}\manager-ui"
Name: "{commonappdata}\HDSP\Connector"
Name: "{commonappdata}\HDSP\Connector\logs"

[Files]
; Packaged Node runtimes (pkg output) -- see connector/package.json's
; "package" script and connector-tray/package.json's "package" script.
Source: "build\connector.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "build\tray.exe"; DestDir: "{app}"; Flags: ignoreversion

; NSSM -- not vendored in this repo; must be downloaded to build\nssm.exe
; before running iscc. See README.md's "Why NSSM, not node-windows" section.
Source: "build\nssm.exe"; DestDir: "{app}"; Flags: ignoreversion

; Install/uninstall helper executables (pkg'd from scripts/*.js so no
; separate Node.js runtime is required on the hospital's machine).
Source: "build\install-service.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "build\uninstall-service.exe"; DestDir: "{app}"; Flags: ignoreversion

; Connector Manager UI static assets, served locally by connector.exe --
; not a separate process. See connector-manager's "build" script.
Source: "..\connector-manager\dist\*"; DestDir: "{app}\manager-ui"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\HDSP Connector Manager"; Filename: "{app}\tray.exe"; Comment: "Open the HDSP Connector Manager"
Name: "{group}\Uninstall HDSP Connector"; Filename: "{uninstallexe}"
Name: "{commondesktop}\HDSP Connector Manager"; Filename: "{app}\tray.exe"; Tasks: desktopicon

; Release-blocker fix (2026-07-22, see HDSP_CONNECTOR_OPERATIONAL_WORKFLOW_REVIEW.md
; §5/§8/§12): without this, the Windows Service auto-starts on every
; reboot but the tray icon does not -- a hospital IT admin sees no tray
; icon after an overnight reboot and reasonably (but wrongly) concludes
; the Connector isn't running, generating an avoidable support call. This
; places a shortcut in the "Startup" folder for ALL users (not just
; whoever ran the installer), matching the fact that the Windows Service
; itself also runs independent of which user is logged in -- any IT
; admin who logs into this machine should see the tray, not only the one
; who happened to install it. Inno Setup automatically removes this
; shortcut on uninstall, same as every other [Icons] entry.
Name: "{commonstartup}\HDSP Connector Manager"; Filename: "{app}\tray.exe"; Comment: "Automatically reopen the HDSP Connector Manager tray icon at logon"

[Tasks]
Name: "desktopicon"; Description: "Create a &desktop icon for the Connector Manager"; GroupDescription: "Additional icons:"

[Run]
; 1 & 2: Install the Windows Service, configured for automatic start.
; (install-service.exe registers "{#MyServiceName}" via NSSM, wraps
; connector.exe, sets Start=SERVICE_AUTO_START, points
; CONNECTOR_MANAGER_UI_DIR/CONNECTOR_CONFIG_DIR env vars -- see
; connector-installer/scripts/install-service.js.)
Filename: "{app}\install-service.exe"; Parameters: """{app}"" ""{commonappdata}\HDSP\Connector"""; StatusMsg: "Installing HDSP Connector service..."; Flags: runhidden waituntilterminated

; 3: The UI (manager-ui static assets) was already copied by [Files] above.

; 4 & 5: The tray application and Start Menu/desktop shortcuts were
; installed by [Files]/[Icons] above; nothing further to run here.

; 6: Service is already started by install-service.exe as its final step,
; but nssm start is idempotent, so this is a harmless explicit safety net
; in case a future revision of install-service.exe stops doing so itself.
Filename: "{app}\nssm.exe"; Parameters: "start ""{#MyServiceName}"""; StatusMsg: "Starting HDSP Connector service..."; Flags: runhidden waituntilterminated skipifdoesntexist

; 7: Launch the Connector Manager (tray app opens the Manager UI in the
; user's default browser once the tray icon is up -- see
; connector-tray/src/index.ts). Runs as the logged-in user, not as admin,
; per the "postinstall" flag's normal Inno Setup behavior.
Filename: "{app}\tray.exe"; Description: "Launch HDSP Connector Manager"; Flags: postinstall nowait skipifsilent

[UninstallRun]
; Must run BEFORE Inno Setup deletes files from {app}, since
; uninstall-service.exe needs nssm.exe still present on disk to remove
; the service registration. See scripts/uninstall-service.js -- this
; deliberately does NOT remove %ProgramData%\HDSP\Connector (activation
; credentials, Oracle config, logs); see the [Code] section below for the
; prompt asking the user whether to also delete that directory.
Filename: "{app}\uninstall-service.exe"; Parameters: """{app}"""; StatusMsg: "Removing HDSP Connector service..."; Flags: runhidden waituntilterminated

[UninstallDelete]
; Only remove the ProgramData directory if the user opted in via the
; [Code] section's confirmation prompt (see ShouldRemoveProgramData below).
Type: filesandordirs; Name: "{commonappdata}\HDSP\Connector"; Check: ShouldRemoveProgramData

[Code]
var
  RemoveProgramDataConfirmed: Boolean;

function ShouldRemoveProgramData(): Boolean;
begin
  Result := RemoveProgramDataConfirmed;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  // Ask once, right before files are removed, whether to also delete the
  // mutable ProgramData directory (activation state + Oracle credentials).
  // Default answer is "No" -- per uninstall-service.js's doc comment, a
  // hospital reinstalling/upgrading almost always wants to KEEP this data;
  // re-activating and re-entering Oracle credentials on every upgrade
  // would regress this product's "installer quality" goal.
  if CurUninstallStep = usUninstall then
  begin
    RemoveProgramDataConfirmed :=
      (MsgBox('Do you also want to remove the HDSP Connector configuration ' +
              '(activation, Oracle connection settings, and logs) stored in ' +
              '%ProgramData%\HDSP\Connector?' + #13#10 + #13#10 +
              'Choose "No" if you plan to reinstall or upgrade later -- this ' +
              'keeps the Connector activated and configured.',
              mbConfirmation, MB_YESNO) = IDYES);
  end;
end;
