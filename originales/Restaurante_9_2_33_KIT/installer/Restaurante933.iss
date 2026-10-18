#define MyAppVersion "9.2.33"
#define MyTask "Aviles Restaurante 9.2.33"
[Setup]
AppId={{92A3300C-7583-431F-A36A-2AF3D192A933}
AppName=Restaurante 9.2.33
AppVersion={#MyAppVersion}
AppPublisher=Aviles Tecnologias
DefaultDirName={autopf}\Aviles Restaurante 9.2.33
DefaultGroupName=Aviles Restaurante 9.2.33
UninstallDisplayName=Restaurante 9.2.33
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
OutputDir=..\output
OutputBaseFilename=Setup_Restaurante_9.2.33
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
Password=unoDOStres21@
Encryption=yes
CloseApplications=no
RestartApplications=no
DisableDirPage=yes
[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"
[Tasks]
Name: "abrirwindows"; Description: "Abrir Restaurante al iniciar sesion en Windows"; GroupDescription: "Inicio con Windows:"; Flags: checkedonce
[Files]
Source: "..\build\payload\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "preinstall.ps1"; Flags: dontcopy
Source: "auto-sql.ps1"; DestDir: "{app}\installer"; Flags: ignoreversion
Source: "sql-probe.js"; DestDir: "{app}\installer"; Flags: ignoreversion
Source: "inicio-windows.ps1"; DestDir: "{app}\installer"; Flags: ignoreversion
Source: "install.ps1"; DestDir: "{app}\installer"; Flags: ignoreversion
Source: "run-server.ps1"; DestDir: "{app}\installer"; Flags: ignoreversion
Source: "open.vbs"; DestDir: "{app}\installer"; Flags: ignoreversion
Source: "uninstall.ps1"; DestDir: "{app}\installer"; Flags: ignoreversion
Source: "cloudflare.ps1"; DestDir: "{app}\installer"; Flags: ignoreversion
Source: "status.ps1"; DestDir: "{app}\installer"; Flags: ignoreversion
[Icons]
Name: "{group}\Restaurante 9.2.33"; Filename: "{sys}\wscript.exe"; Parameters: """{app}\installer\open.vbs"""
Name: "{commondesktop}\Restaurante 9.2.33"; Filename: "{sys}\wscript.exe"; Parameters: """{app}\installer\open.vbs"""
Name: "{commonstartup}\Abrir Restaurante 9.2.33"; Tasks: abrirwindows; Filename: "{sys}\wscript.exe"; Parameters: """{app}\installer\open.vbs"""
Name: "{group}\Detectar SQL y guardar conexion"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\installer\auto-sql.ps1"" -AppDir ""{app}"""; WorkingDir: "{app}"
Name: "{group}\Configurar inicio con Windows"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\installer\inicio-windows.ps1"""; WorkingDir: "{app}"
Name: "{group}\Ver estado de Restaurante"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\installer\status.ps1"""; WorkingDir: "{app}"
Name: "{group}\Configurar Cloudflare"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\installer\cloudflare.ps1"""; WorkingDir: "{app}"
[Run]
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\installer\auto-sql.ps1"" -AppDir ""{app}"""; Description: "Buscar puerto y configurar SQL automaticamente"; Flags: postinstall skipifsilent waituntilterminated
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\installer\cloudflare.ps1"""; Description: "Configurar acceso remoto con Cloudflare y subdominio"; Flags: postinstall unchecked skipifsilent waituntilterminated
Filename: "{sys}\wscript.exe"; Parameters: """{app}\installer\open.vbs"""; Description: "Abrir Restaurante en el navegador"; Flags: nowait postinstall skipifsilent
[UninstallRun]
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File ""{app}\installer\uninstall.ps1"""; Flags: runhidden waituntilterminated; RunOnceId: "Restaurante933RemoveTask"
[Code]
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ExitCode: Integer;
begin
  Result := '';
  ExtractTemporaryFile('preinstall.ps1');
  if not Exec(ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'),
              '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' +
              ExpandConstant('{tmp}\preinstall.ps1') + '" -AppDir "' + ExpandConstant('{app}') + '"',
              '', SW_HIDE, ewWaitUntilTerminated, ExitCode) then
    Result := 'No se pudo revisar el puerto 3000 antes de instalar.'
  else if ExitCode <> 0 then
    Result := 'No se puede instalar: el puerto 3000 esta ocupado por otra aplicacion o no se pudo detener una version propia. Consulta %TEMP%\DIAGNOSTICO_INSTALACION_RESTAURANTE_933.txt y cierra la aplicacion anterior.';
end;
procedure CurStepChanged(CurStep: TSetupStep);
var
  ExitCode: Integer;
begin
  if CurStep = ssPostInstall then begin
    if not Exec(ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'),
                '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' +
                ExpandConstant('{app}\installer\install.ps1') + '" -AppDir "' + ExpandConstant('{app}') + '"',
                '', SW_HIDE, ewWaitUntilTerminated, ExitCode) then
      RaiseException('No se pudo registrar el arranque automatico de Restaurante.')
    else if ExitCode <> 0 then
      RaiseException('La verificacion local de Restaurante 9.2.33 fallo. Verifica C:\ProgramData\AvilesRestaurante933\logs\instalacion.log. Cloudflare no es requisito para iniciar localmente.');
  end;
end;
