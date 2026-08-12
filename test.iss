[Setup]
AppName=Test
AppVersion=1.0
DefaultDirName={autopf}\Test
OutputDir=Output

[Code]
function InitializeUninstall(): Boolean;
var
  UninstallForm: TForm;
begin
  UninstallForm := TForm.Create(nil);
  Result := True;
end;
