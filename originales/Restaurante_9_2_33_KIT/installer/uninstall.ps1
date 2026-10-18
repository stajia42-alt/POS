#requires -Version 5.1
$Task='Aviles Restaurante 9.2.33'
$Root=Split-Path -Parent $PSScriptRoot
$Node=Join-Path $Root 'node.exe'
$App=Join-Path $Root 'app.js'
$Exists=Get-ScheduledTask -TaskName $Task -ErrorAction SilentlyContinue
if($Exists){
 Stop-ScheduledTask -TaskName $Task -ErrorAction SilentlyContinue
 Unregister-ScheduledTask -TaskName $Task -Confirm:$false -ErrorAction SilentlyContinue
}
# Detener UNICAMENTE la instancia instalada en esta misma carpeta.
$Processes=Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue
foreach($P in @($Processes)){
 if($P.ExecutablePath -and [string]::Equals($P.ExecutablePath,$Node,[StringComparison]::OrdinalIgnoreCase) -and $P.CommandLine -like ('*'+$App+'*')){
  Stop-Process -Id $P.ProcessId -Force -ErrorAction SilentlyContinue
 }
}
# No borrar ProgramData, bases de datos, configuraciones ni cloudflared.
