[Setup]
AppName=ZoeConnect (Hospital Digital Services Platform, Powered by LifeHIS)
AppVersion=1.0.0
DefaultDirName={autopf}\ZoeConnect
DefaultGroupName=ZoeConnect
UninstallDisplayIcon={app}\ZoeConnect.exe
Compression=lzma2
SolidCompression=yes
OutputDir=Output
OutputBaseFilename=ZoeConnect_Setup
SetupLogging=yes
RestartIfNeededByRun=no
CloseApplications=yes
UsePreviousAppDir=no
DisableDirPage=no

[Dirs]
Name: "{app}\logs"
; Backup storage must be independent of the Program Files install directory
; (deleting/reinstalling the app must never touch backup archives), so the
; default local backup destination lives under {commonappdata} (C:\ProgramData)
; instead of {app}\backups. This mirrors backup.config.ts's OS-aware default
; (ZoeConnect\Backups under PROGRAMDATA) and the connector-installer's
; precedent of keeping durable state out of {app}. See also CurUninstallStepChanged
; below, which deliberately leaves this directory alone unless the admin
; explicitly opts in via the "Remove Database Backups" uninstall checkbox.
Name: "{commonappdata}\ZoeConnect\Backups"
Name: "{commonappdata}\HDSP\Installer"

[Files]
; NSSM for service installation
Source: "assets\nssm.exe"; DestDir: "{app}\bin"; Flags: ignoreversion

; Bundled PostgreSQL and Redis (Assuming they are downloaded as zips by build_installer.ps1)
; We extract them using a run command or if they are folders we bundle them.
; For this script, we assume the user has placed the extracted folders in assets\pgsql and assets\redis.
; Wait, we downloaded them as zips! We can use PowerShell to extract them during install.
Source: "assets\postgresql.zip"; DestDir: "{app}\temp"; Flags: ignoreversion
Source: "assets\redis.zip"; DestDir: "{app}\temp"; Flags: ignoreversion
Source: "assets\vc_redist.x64.exe"; DestDir: "{app}\temp"; Flags: ignoreversion

; Bundled Node.js 20.x Standalone Binary
Source: "assets\node.exe"; DestDir: "{app}\bin"; Flags: ignoreversion

; Backend (Explicit inclusion to avoid breaking node_modules)
; Excludes: "*.map" -- backend/tsconfig.json has sourceMap: true (useful for
; local dev debugging), which means `nest build`'s dist/ output includes
; .js.map files that map straight back to fully readable original
; TypeScript source (variable names, comments, everything). Without this
; exclusion, shipping dist/* verbatim would defeat the entire point of
; distributing compiled-only output -- caught and fixed 2026-07-22 when
; explicitly asked how to deploy self-hosted without exposing source.
Source: "..\backend\dist\*"; DestDir: "{app}\backend\dist"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: "*.map"
Source: "..\backend\node_modules\*"; DestDir: "{app}\backend\node_modules"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\backend\package.json"; DestDir: "{app}\backend"; Flags: ignoreversion
; License public key (backend/keys/license-public.pem) -- the ONE-TIME
; generated (scripts/generate-license.ts keygen), permanent, product-wide
; public half of the Vendor Portal's signing key. Placed here (not
; backend/src, which this installer never packages) so it ships
; automatically with every self-hosted build from now on, no per-install
; manual copy step. skipifsourcedoesntexist: don't fail the WHOLE installer
; build if a dev machine hasn't staged this file yet -- but a self-hosted
; install with it missing will fail license verification, so this should
; only ever be missing during early dev, never for a real release build.
Source: "..\backend\keys\license-public.pem"; DestDir: "{app}\backend\keys"; Flags: ignoreversion skipifsourcedoesntexist

; Vendor Backend (Explicit inclusion) -- same *.map exclusion rationale as above.
Source: "..\vendor-portal\backend\dist\*"; DestDir: "{app}\vendor-portal\backend\dist"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: "*.map"
Source: "..\vendor-portal\backend\node_modules\*"; DestDir: "{app}\vendor-portal\backend\node_modules"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\vendor-portal\backend\package.json"; DestDir: "{app}\vendor-portal\backend"; Flags: ignoreversion

; Next.js Standalone outputs (Eliminates ~110,000 files from node_modules!)
; Excludes: "*.map" -- defense-in-depth: next.config.mjs doesn't set
; productionBrowserSourceMaps, so this shouldn't produce any, but excluding
; explicitly here means a future config change can't silently start
; shipping source maps to a client install without this file also changing.
Source: "..\frontend\.next\standalone\*"; DestDir: "{app}\frontend"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: "*.map"
Source: "..\frontend\.next\static\*"; DestDir: "{app}\frontend\.next\static"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: "*.map"
Source: "..\frontend\public\*"; DestDir: "{app}\frontend\public"; Flags: ignoreversion recursesubdirs createallsubdirs skipifsourcedoesntexist
Source: "..\vendor-portal\frontend\.next\standalone\*"; DestDir: "{app}\vendor-portal\frontend"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: "*.map"
Source: "..\vendor-portal\frontend\.next\static\*"; DestDir: "{app}\vendor-portal\frontend\.next\static"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: "*.map"
Source: "..\vendor-portal\frontend\public\*"; DestDir: "{app}\vendor-portal\frontend\public"; Flags: ignoreversion recursesubdirs createallsubdirs skipifsourcedoesntexist

; Scripts
Source: "scripts\*.js"; DestDir: "{app}\scripts"; Flags: ignoreversion

[Run]
; 1. Install prerequisites and extract bundled DBs
Filename: "{app}\temp\vc_redist.x64.exe"; Parameters: "/install /quiet /norestart"; StatusMsg: "Installing Visual C++ Redistributable (Required for PostgreSQL)..."
Filename: "powershell.exe"; Parameters: "-Command Expand-Archive -Path '{app}\temp\postgresql.zip' -DestinationPath '{app}\pgsql' -Force"; StatusMsg: "Installing bundled PostgreSQL..."
Filename: "{app}\pgsql\pgsql\bin\initdb.exe"; Parameters: "-D ""{app}\pgsql\data"" -U postgres -A trust -E UTF8"; StatusMsg: "Initializing Database Cluster..."; Flags: runhidden
Filename: "powershell.exe"; Parameters: "-Command Expand-Archive -Path '{app}\temp\redis.zip' -DestinationPath '{app}\redis' -Force"; StatusMsg: "Installing bundled Redis..."

; 2. Start PostgreSQL and Redis as Windows Services via NSSM
Filename: "{app}\bin\nssm.exe"; Parameters: "install ""HDSP Embedded PostgreSQL"" ""{app}\pgsql\pgsql\bin\postgres.exe"" ""-D {app}\pgsql\data"""; Flags: runhidden
Filename: "{app}\bin\nssm.exe"; Parameters: "set ""HDSP Embedded PostgreSQL"" AppDirectory ""{app}\pgsql\pgsql\bin"""; Flags: runhidden
Filename: "{app}\bin\nssm.exe"; Parameters: "set ""HDSP Embedded PostgreSQL"" ObjectName ""NT AUTHORITY\NetworkService"" """""; Flags: runhidden
Filename: "cmd.exe"; Parameters: "/c icacls ""{app}\pgsql\data"" /grant ""NetworkService:(OI)(CI)F"" /T"; StatusMsg: "Granting permissions for Database..."; Flags: runhidden
Filename: "{app}\bin\nssm.exe"; Parameters: "start ""HDSP Embedded PostgreSQL"""; Flags: runhidden

Filename: "{app}\bin\nssm.exe"; Parameters: "install ""HDSP Embedded Redis"" ""{app}\redis\redis-server.exe"""; Flags: runhidden
Filename: "{app}\bin\nssm.exe"; Parameters: "set ""HDSP Embedded Redis"" AppDirectory ""{app}\redis"""; Flags: runhidden
Filename: "{app}\bin\nssm.exe"; Parameters: "start ""HDSP Embedded Redis"""; Flags: runhidden

; 3. Generate Configs
Filename: "{app}\bin\node.exe"; Parameters: """{app}\scripts\config-generator.js"" --install-dir=""{app}"" --db-host=""localhost"" --db-port=""5432"" --db-name=""hdsp_db"" --vendor-db-name=""hdsp_vendor_db"" --db-user=""postgres"" --db-password=""postgres"" --hospital-name=""{code:GetHospitalName}"" --oracle-service=""{code:GetOracleService}"""; StatusMsg: "Generating Configurations..."; Flags: runhidden

; 4. Setup Database
Filename: "{app}\bin\node.exe"; Parameters: """{app}\scripts\db-setup.js"" --install-dir=""{app}"" --db-host=""localhost"" --db-port=""5432"" --db-name=""hdsp_db"" --vendor-db-name=""hdsp_vendor_db"" --db-user=""postgres"" --db-password=""postgres"" --is-upgrade=""false"""; StatusMsg: "Running Database Setup & Migrations..."; Flags: runhidden

; 5. Install Application Services
; Backend
Filename: "{app}\bin\nssm.exe"; Parameters: "install ""HDSP Backend"" ""{app}\bin\node.exe"" ""dist/main.js"""; Flags: runhidden
Filename: "{app}\bin\nssm.exe"; Parameters: "set ""HDSP Backend"" AppDirectory ""{app}\backend"""; Flags: runhidden
Filename: "{app}\bin\nssm.exe"; Parameters: "set ""HDSP Backend"" AppStdout ""{app}\logs\backend.log"""; Flags: runhidden
Filename: "{app}\bin\nssm.exe"; Parameters: "set ""HDSP Backend"" AppStderr ""{app}\logs\backend.log"""; Flags: runhidden
Filename: "{app}\bin\nssm.exe"; Parameters: "set ""HDSP Backend"" Start SERVICE_AUTO_START"; Flags: runhidden
Filename: "{app}\bin\nssm.exe"; Parameters: "start ""HDSP Backend"""; Flags: runhidden

; Frontend (Standalone)
Filename: "{app}\bin\nssm.exe"; Parameters: "install ""HDSP Frontend"" ""{app}\bin\node.exe"" ""server.js"""; Flags: runhidden
Filename: "{app}\bin\nssm.exe"; Parameters: "set ""HDSP Frontend"" AppDirectory ""{app}\frontend"""; Flags: runhidden
Filename: "{app}\bin\nssm.exe"; Parameters: "set ""HDSP Frontend"" AppEnvironmentExtra ""PORT=3000"""; Flags: runhidden
Filename: "{app}\bin\nssm.exe"; Parameters: "set ""HDSP Frontend"" AppStdout ""{app}\logs\frontend.log"""; Flags: runhidden
Filename: "{app}\bin\nssm.exe"; Parameters: "set ""HDSP Frontend"" AppStderr ""{app}\logs\frontend.log"""; Flags: runhidden
Filename: "{app}\bin\nssm.exe"; Parameters: "set ""HDSP Frontend"" Start SERVICE_AUTO_START"; Flags: runhidden
Filename: "{app}\bin\nssm.exe"; Parameters: "start ""HDSP Frontend"""; Flags: runhidden

; Vendor Backend
Filename: "{app}\bin\nssm.exe"; Parameters: "install ""HDSP Vendor Backend"" ""{app}\bin\node.exe"" ""dist/main.js"""; Flags: runhidden
Filename: "{app}\bin\nssm.exe"; Parameters: "set ""HDSP Vendor Backend"" AppDirectory ""{app}\vendor-portal\backend"""; Flags: runhidden
Filename: "{app}\bin\nssm.exe"; Parameters: "set ""HDSP Vendor Backend"" AppStdout ""{app}\logs\vendor-backend.log"""; Flags: runhidden
Filename: "{app}\bin\nssm.exe"; Parameters: "set ""HDSP Vendor Backend"" AppStderr ""{app}\logs\vendor-backend.log"""; Flags: runhidden
Filename: "{app}\bin\nssm.exe"; Parameters: "set ""HDSP Vendor Backend"" Start SERVICE_AUTO_START"; Flags: runhidden
Filename: "{app}\bin\nssm.exe"; Parameters: "start ""HDSP Vendor Backend"""; Flags: runhidden

; Vendor Frontend (Standalone)
Filename: "{app}\bin\nssm.exe"; Parameters: "install ""HDSP Vendor Frontend"" ""{app}\bin\node.exe"" ""server.js"""; Flags: runhidden
Filename: "{app}\bin\nssm.exe"; Parameters: "set ""HDSP Vendor Frontend"" AppDirectory ""{app}\vendor-portal\frontend"""; Flags: runhidden
Filename: "{app}\bin\nssm.exe"; Parameters: "set ""HDSP Vendor Frontend"" AppEnvironmentExtra ""PORT=4001"""; Flags: runhidden
Filename: "{app}\bin\nssm.exe"; Parameters: "set ""HDSP Vendor Frontend"" AppStdout ""{app}\logs\vendor-frontend.log"""; Flags: runhidden
Filename: "{app}\bin\nssm.exe"; Parameters: "set ""HDSP Vendor Frontend"" AppStderr ""{app}\logs\vendor-frontend.log"""; Flags: runhidden
Filename: "{app}\bin\nssm.exe"; Parameters: "set ""HDSP Vendor Frontend"" Start SERVICE_AUTO_START"; Flags: runhidden
Filename: "{app}\bin\nssm.exe"; Parameters: "start ""HDSP Vendor Frontend"""; Flags: runhidden

; 6. Health Check and PDF
Filename: "{app}\bin\node.exe"; Parameters: """{app}\scripts\health-check.js"" --db-host=""localhost"""; StatusMsg: "Verifying Services..."; Flags: runhidden
Filename: "{app}\bin\node.exe"; Parameters: """{app}\scripts\pdf-generator.js"" --install-dir=""{app}"" --hospital-name=""{code:GetHospitalName}"" --oracle-service=""{code:GetOracleService}"""; StatusMsg: "Generating Report..."; Flags: runhidden
[UninstallRun]
; Force cleanup of ALL HDSP services (old and new) just in case NSSM fails
Filename: "powershell.exe"; Parameters: "-Command ""Stop-Service -Name '*HDSP*' -Force -ErrorAction SilentlyContinue; $services = @('HDSP Backend', 'HDSP Frontend', 'HDSP Vendor Backend', 'HDSP Vendor Frontend', 'HDSP Embedded PostgreSQL', 'HDSP Embedded Redis', 'HDSP PostgreSQL', 'HDSP Redis'); foreach ($svc in $services) {{ sc.exe delete $svc }"""; Flags: runhidden; RunOnceId: "ForceCleanupServices"

Filename: "{app}\bin\nssm.exe"; Parameters: "stop ""HDSP Embedded Redis"""; Flags: runhidden; RunOnceId: "StopRedis"; Check: ShouldRemoveRedis
Filename: "{app}\bin\nssm.exe"; Parameters: "remove ""HDSP Embedded Redis"" confirm"; Flags: runhidden; RunOnceId: "RemoveRedis"; Check: ShouldRemoveRedis
Filename: "{app}\bin\nssm.exe"; Parameters: "stop ""HDSP Embedded PostgreSQL"""; Flags: runhidden; RunOnceId: "StopPostgreSQL"; Check: ShouldRemovePgProg
Filename: "{app}\bin\nssm.exe"; Parameters: "remove ""HDSP Embedded PostgreSQL"" confirm"; Flags: runhidden; RunOnceId: "RemovePostgreSQL"; Check: ShouldRemovePgProg
Filename: "{app}\bin\nssm.exe"; Parameters: "stop ""HDSP Backend"""; Flags: runhidden; RunOnceId: "StopBackend"; Check: ShouldRemoveServices
Filename: "{app}\bin\nssm.exe"; Parameters: "remove ""HDSP Backend"" confirm"; Flags: runhidden; RunOnceId: "RemoveBackend"; Check: ShouldRemoveServices
Filename: "{app}\bin\nssm.exe"; Parameters: "stop ""HDSP Frontend"""; Flags: runhidden; RunOnceId: "StopFrontend"; Check: ShouldRemoveServices
Filename: "{app}\bin\nssm.exe"; Parameters: "remove ""HDSP Frontend"" confirm"; Flags: runhidden; RunOnceId: "RemoveFrontend"; Check: ShouldRemoveServices
Filename: "{app}\bin\nssm.exe"; Parameters: "stop ""HDSP Vendor Backend"""; Flags: runhidden; RunOnceId: "StopVendorBackend"; Check: ShouldRemoveServices
Filename: "{app}\bin\nssm.exe"; Parameters: "remove ""HDSP Vendor Backend"" confirm"; Flags: runhidden; RunOnceId: "RemoveVendorBackend"; Check: ShouldRemoveServices
Filename: "{app}\bin\nssm.exe"; Parameters: "stop ""HDSP Vendor Frontend"""; Flags: runhidden; RunOnceId: "StopVendorFrontend"; Check: ShouldRemoveServices
Filename: "{app}\bin\nssm.exe"; Parameters: "remove ""HDSP Vendor Frontend"" confirm"; Flags: runhidden; RunOnceId: "RemoveVendorFrontend"; Check: ShouldRemoveServices

[UninstallDelete]
Type: files; Name: "{app}\backend\.env"
Type: files; Name: "{app}\frontend\.env.local"
Type: files; Name: "{app}\vendor-portal\backend\.env"
Type: files; Name: "{app}\vendor-portal\frontend\.env.local"

[Code]
var
  HospitalPage: TInputQueryWizardPage;
  OraclePage: TInputQueryWizardPage;
  OptRemoveApp, OptRemoveServices, OptRemoveRedis, OptRemovePgDb, OptRemovePgProg, OptRemoveLogs, OptRemoveBackups, OptRemoveUploads: Boolean;

function ShouldRemoveServices(): Boolean; begin Result := OptRemoveServices; end;
function ShouldRemoveRedis(): Boolean; begin Result := OptRemoveRedis; end;
function ShouldRemovePgProg(): Boolean; begin Result := OptRemovePgProg; end;

procedure InitializeWizard;
begin
  HospitalPage := CreateInputQueryPage(wpSelectDir,
    'Application Configuration', 'Hospital Details',
    'Please specify the Hospital Name for this HDSP installation.');
  HospitalPage.Add('Hospital Name:', False);
  HospitalPage.Values[0] := 'Memorial Hospital';

  OraclePage := CreateInputQueryPage(HospitalPage.ID,
    'Oracle HIS Configuration', 'Oracle Connection Details',
    'Enter the Oracle HIS details. Leave blank if not required.');
  OraclePage.Add('Host:', False);
  OraclePage.Add('Port:', False);
  OraclePage.Add('Service Name:', False);
  OraclePage.Add('Username:', False);
  OraclePage.Add('Password:', False);
  OraclePage.Values[1] := '1521';
end;

function GetHospitalName(Param: String): String;
begin
  Result := HospitalPage.Values[0];
end;

function GetOracleService(Param: String): String;
begin
  Result := OraclePage.Values[2];
end;

function InitializeUninstall(): Boolean;
var
  UninstallForm: TSetupForm;
  Lbl: TNewStaticText;
  ChkApp, ChkServices, ChkRedis, ChkPgDb, ChkPgProg, ChkLogs, ChkBackups, ChkUploads: TNewCheckBox;
  BtnOk, BtnCancel: TNewButton;
begin
  UninstallForm := CreateCustomForm(ScaleX(400), ScaleY(340), False, False);
  UninstallForm.Caption := 'HDSP Uninstall Options';
  UninstallForm.Position := poScreenCenter;

  Lbl := TNewStaticText.Create(UninstallForm);
  Lbl.Parent := UninstallForm;
  Lbl.Left := 16;
  Lbl.Top := 16;
  Lbl.Caption := 'Select the components you want to remove:';

  ChkApp := TNewCheckBox.Create(UninstallForm);
  ChkApp.Parent := UninstallForm;
  ChkApp.Left := 16; ChkApp.Top := Lbl.Top + 24; ChkApp.Width := 350;
  ChkApp.Caption := 'Remove HDSP Application (Default Uninstall)';
  ChkApp.Checked := True;
  ChkApp.Enabled := False; // Handled by InnoSetup

  ChkServices := TNewCheckBox.Create(UninstallForm);
  ChkServices.Parent := UninstallForm;
  ChkServices.Left := 16; ChkServices.Top := ChkApp.Top + 24; ChkServices.Width := 350;
  ChkServices.Caption := 'Remove Windows Services (Backend, Frontend, etc.)';
  ChkServices.Checked := True;

  ChkRedis := TNewCheckBox.Create(UninstallForm);
  ChkRedis.Parent := UninstallForm;
  ChkRedis.Left := 16; ChkRedis.Top := ChkServices.Top + 24; ChkRedis.Width := 350;
  ChkRedis.Caption := 'Remove HDSP Embedded Redis';
  ChkRedis.Checked := True;

  ChkPgDb := TNewCheckBox.Create(UninstallForm);
  ChkPgDb.Parent := UninstallForm;
  ChkPgDb.Left := 16; ChkPgDb.Top := ChkRedis.Top + 24; ChkPgDb.Width := 350;
  ChkPgDb.Caption := 'Remove PostgreSQL Database (WARNING: DATA LOSS)';
  ChkPgDb.Checked := False;

  ChkPgProg := TNewCheckBox.Create(UninstallForm);
  ChkPgProg.Parent := UninstallForm;
  ChkPgProg.Left := 16; ChkPgProg.Top := ChkPgDb.Top + 24; ChkPgProg.Width := 350;
  ChkPgProg.Caption := 'Remove PostgreSQL Program Files';
  ChkPgProg.Checked := False;

  ChkLogs := TNewCheckBox.Create(UninstallForm);
  ChkLogs.Parent := UninstallForm;
  ChkLogs.Left := 16; ChkLogs.Top := ChkPgProg.Top + 24; ChkLogs.Width := 350;
  ChkLogs.Caption := 'Remove Application Logs';
  ChkLogs.Checked := False;

  ChkBackups := TNewCheckBox.Create(UninstallForm);
  ChkBackups.Parent := UninstallForm;
  ChkBackups.Left := 16; ChkBackups.Top := ChkLogs.Top + 24; ChkBackups.Width := 350;
  ChkBackups.Caption := 'Remove Database Backups';
  // Default is unchecked ("keep backups") deliberately: backups must survive
  // an uninstall unless the admin explicitly opts in to deleting them,
  // mirroring the connector installer's default-No ShouldRemoveProgramData
  // prompt in HDSP_Connector.iss. Do not flip this default.
  ChkBackups.Checked := False;

  ChkUploads := TNewCheckBox.Create(UninstallForm);
  ChkUploads.Parent := UninstallForm;
  ChkUploads.Left := 16; ChkUploads.Top := ChkBackups.Top + 24; ChkUploads.Width := 350;
  ChkUploads.Caption := 'Remove Uploaded Files';
  ChkUploads.Checked := False;

  BtnOk := TNewButton.Create(UninstallForm);
  BtnOk.Parent := UninstallForm;
  BtnOk.Left := UninstallForm.ClientWidth - 170;
  BtnOk.Top := UninstallForm.ClientHeight - 40;
  BtnOk.Width := 75;
  BtnOk.Caption := 'Uninstall';
  BtnOk.ModalResult := mrOk;

  BtnCancel := TNewButton.Create(UninstallForm);
  BtnCancel.Parent := UninstallForm;
  BtnCancel.Left := UninstallForm.ClientWidth - 85;
  BtnCancel.Top := UninstallForm.ClientHeight - 40;
  BtnCancel.Width := 75;
  BtnCancel.Caption := 'Cancel';
  BtnCancel.ModalResult := mrCancel;

  if UninstallForm.ShowModal = mrOk then
  begin
    OptRemoveApp := True;
    OptRemoveServices := ChkServices.Checked;
    OptRemoveRedis := ChkRedis.Checked;
    OptRemovePgDb := ChkPgDb.Checked;
    OptRemovePgProg := ChkPgProg.Checked;
    OptRemoveLogs := ChkLogs.Checked;
    OptRemoveBackups := ChkBackups.Checked;
    OptRemoveUploads := ChkUploads.Checked;
    Result := True;
  end
  else
    Result := False;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep = usPostUninstall then
  begin
    if OptRemoveRedis then DelTree(ExpandConstant('{app}\redis'), True, True, True);
    if OptRemoveLogs then DelTree(ExpandConstant('{app}\logs'), True, True, True);
    // Backups now live under {commonappdata}\ZoeConnect\Backups (see [Dirs]
    // above), not {app}\backups -- point the opt-in removal at the same path.
    if OptRemoveBackups then DelTree(ExpandConstant('{commonappdata}\ZoeConnect\Backups'), True, True, True);
    if OptRemoveUploads then DelTree(ExpandConstant('{app}\backend\uploads'), True, True, True);
    
    if OptRemovePgDb then 
      DelTree(ExpandConstant('{app}\pgsql\data'), True, True, True);
      
    if OptRemovePgProg then 
    begin
      if OptRemovePgDb then
        DelTree(ExpandConstant('{app}\pgsql'), True, True, True)
      else
        DelTree(ExpandConstant('{app}\pgsql\pgsql'), True, True, True);
    end;
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  ResultCode: Integer;
begin
  if CurStep = ssInstall then
  begin
    // Forcefully stop any running services from a previous or failed installation 
    // BEFORE Inno Setup attempts to overwrite their files, to prevent "File in Use" errors.
    Exec('net.exe', 'stop "HDSP Backend"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    Exec('net.exe', 'stop "HDSP Frontend"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    Exec('net.exe', 'stop "HDSP Vendor Backend"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    Exec('net.exe', 'stop "HDSP Vendor Frontend"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    Exec('net.exe', 'stop "HDSP Embedded PostgreSQL"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    Exec('net.exe', 'stop "HDSP Embedded Redis"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  end;
end;
