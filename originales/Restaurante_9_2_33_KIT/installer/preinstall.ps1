#requires -Version 5.1
param([Parameter(Mandatory=$true)][string]$AppDir)
$ErrorActionPreference='Stop'
try {
  $Task='Aviles Restaurante 9.2.33'
  $OldTask=Get-ScheduledTask -TaskName $Task -ErrorAction SilentlyContinue
  if($OldTask) {
    Stop-ScheduledTask -TaskName $Task -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
  }
  # Cerrar SOLO procesos de nuestra propia instalación para permitir actualizar.
  $MyNode=Join-Path $AppDir 'node.exe'
  $MyApp=Join-Path $AppDir 'app.js'
  $Processes=Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue
  foreach($Proc in @($Processes)) {
    if($Proc.ExecutablePath -and [string]::Equals($Proc.ExecutablePath,$MyNode,[StringComparison]::OrdinalIgnoreCase) -and $Proc.CommandLine -like ('*'+$MyApp+'*')) {
      Stop-Process -Id $Proc.ProcessId -Force -ErrorAction Stop
    }
  }
  Start-Sleep -Seconds 1
  $listeners=@(Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue)
  if($listeners.Count -gt 0){
    $Owners=@($listeners | Select-Object -ExpandProperty OwningProcess -Unique)
    throw ('El puerto 3000 ya esta ocupado. PID(s): '+($Owners -join ', ')+'. Cierra primero la version anterior (por ejemplo, 7.11.0). No se detuvo ninguna aplicacion ajena.')
  }
  exit 0
} catch {
  $Path=Join-Path $env:TEMP 'DIAGNOSTICO_INSTALACION_RESTAURANTE_933.txt'
  $_.Exception.Message | Out-File -FilePath $Path -Encoding UTF8
  Write-Error $_.Exception.Message
  exit 1
}
