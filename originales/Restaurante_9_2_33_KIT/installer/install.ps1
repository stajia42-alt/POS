#requires -Version 5.1
param([Parameter(Mandatory=$true)][string]$AppDir)
$ErrorActionPreference='Stop'
$Task='Aviles Restaurante 9.2.33'
$Data=Join-Path $env:ProgramData 'AvilesRestaurante933'
$Logs=Join-Path $Data 'logs'
$Fresh=!(Test-Path $Data)
try {
  New-Item -Path $Data -ItemType Directory -Force | Out-Null
  if($Fresh){
    # IMPORTANTE: conceder accesos explicitos ANTES de quitar la herencia.
    # Quitarlos primero puede bloquear incluso al instalador, como en 7.11.0.
    & icacls.exe $Data '/grant:r' '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' | Out-Null
    if($LASTEXITCODE -ne 0){throw 'No se pudieron asignar permisos a SYSTEM y Administradores.'}
    & icacls.exe $Data '/inheritance:r' | Out-Null
    if($LASTEXITCODE -ne 0){throw 'No se pudo desactivar la herencia de permisos en los datos.'}
  }
  New-Item -Path $Logs -ItemType Directory -Force | Out-Null
  $Log=Join-Path $Logs 'instalacion.log'
  ('--- Instalacion o actualizacion '+(Get-Date -Format o)+' ---') | Add-Content -Path $Log -Encoding UTF8
  function Registrar([string]$Message){('['+(Get-Date -Format s)+'] '+$Message) | Add-Content -Path $Log -Encoding UTF8}
  if(!(Test-Path (Join-Path $AppDir 'node.exe')) -or !(Test-Path (Join-Path $AppDir 'app.js')) -or !(Test-Path (Join-Path $AppDir 'runtime\node_modules\mssql\package.json'))) {
    throw 'Paquete incompleto: faltan Node.js, app.js o dependencias SQL.'
  }
  $Node=Join-Path $AppDir 'node.exe'
  $App=Join-Path $AppDir 'app.js'
  & $Node --check $App | Out-Null
  if($LASTEXITCODE -ne 0){throw 'No paso la comprobacion de sintaxis de app.js.'}
  $Action=New-ScheduledTaskAction -Execute (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe') -Argument ('-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "'+(Join-Path $AppDir 'installer\run-server.ps1')+'"') -WorkingDirectory $AppDir
  $Trigger=New-ScheduledTaskTrigger -AtStartup
  $Settings=New-ScheduledTaskSettingsSet -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
  $Principal=New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
  Register-ScheduledTask -TaskName $Task -Action $Action -Trigger $Trigger -Settings $Settings -Principal $Principal -Force | Out-Null
  Start-ScheduledTask -TaskName $Task
  $Healthy=$false
  for($i=0;$i -lt 60;$i++) {
    Start-Sleep -Seconds 1
    try {
      $Response=Invoke-RestMethod -Uri 'http://127.0.0.1:3000/api/estado' -TimeoutSec 2 -ErrorAction Stop
      $Listening=@(Get-NetTCPConnection -State Listen -LocalPort 3000 -ErrorAction SilentlyContinue | Where-Object {$_.LocalAddress -eq '127.0.0.1' -or $_.LocalAddress -eq '0.0.0.0'})
      $Own=$false
      foreach($L in $Listening){
        $P=Get-CimInstance Win32_Process -Filter "ProcessId = $($L.OwningProcess)" -ErrorAction SilentlyContinue
        if($P -and [string]::Equals($P.ExecutablePath,$Node,[StringComparison]::OrdinalIgnoreCase) -and $P.CommandLine -like ('*'+$App+'*')){$Own=$true;break}
      }
      $Page=Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:3000/' -TimeoutSec 2 -ErrorAction Stop
      if($Response.correcto -eq $true -and $Own -and $Page.StatusCode -eq 200 -and $Page.Content -match 'Mi negocio'){$Healthy=$true;break}
    }catch {}
  }
  if(!$Healthy){
    Registrar 'ERROR: servicio no responde con el proceso local esperado. Revisar ocupacion del puerto y tarea programada.'
    throw 'El servidor no supero su comprobacion de arranque despues de 60 segundos.'
  }
  Registrar 'Correcto: instalacion local 9.2.33 verificada; datos del cliente preservados; Cloudflare no fue modificado.'
  exit 0
} catch {
  $Info=$_.Exception.Message
  try {('ERROR: '+$Info) | Add-Content -Path (Join-Path $Logs 'instalacion.log') -Encoding UTF8}catch{}
  Write-Error $Info
  exit 1
}
