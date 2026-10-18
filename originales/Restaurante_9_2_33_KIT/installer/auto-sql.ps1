#requires -Version 5.1
# Restaurante 9.2.33 - SQL auto-configurado. No necesita entrada del operador.
param([Parameter(Mandatory=$true)][string]$AppDir)
$ErrorActionPreference='Stop'
$Data=Join-Path $env:ProgramData 'AvilesRestaurante933'
$Target=Join-Path $Data 'conexion.json'
$Probe=Join-Path $AppDir 'installer\sql-probe.js'
$Node=Join-Path $AppDir 'node.exe'
$LogFolder=Join-Path $Data 'logs'
$DbName='softrestaurant11'
$User='sa'
# Credencial fija autorizada para este instalador. Se valida contra SQL antes de guardar.
$Password='National09'
try {
  New-Item -Path $LogFolder -ItemType Directory -Force | Out-Null
  $Log=Join-Path $LogFolder 'sql-automatico.log'
  function Registrar([string]$Texto) {
    Write-Host $Texto
    try {('['+(Get-Date -Format s)+'] '+$Texto) | Add-Content -LiteralPath $Log -Encoding UTF8} catch {}
  }
  if(!(Test-Path $Node -PathType Leaf) -or !(Test-Path $Probe -PathType Leaf)) {throw 'Falta el validador de conexion SQL.'}
  Registrar 'Buscando servicios SQL Server locales y el puerto TCP de cada instancia...'
  $Services=@(Get-CimInstance Win32_Service -ErrorAction Stop | Where-Object {
      $_.Name -match '^MSSQL(\$|SERVER$)' -and $_.State -eq 'Running' -and $_.ProcessId -gt 0
    } | Sort-Object @{Expression={if($_.Name -eq 'MSSQL$NATIONALSOFT'){0}else{1}}}, Name)
  if($Services.Count -eq 0) {Registrar 'No hay SQL Server activo en este equipo. No se cambio conexion.json.';exit 0}
  $Listening=@(Get-NetTCPConnection -State Listen -ErrorAction Stop)
  $Candidates=New-Object 'System.Collections.Generic.List[int]'
  foreach($Svc in $Services){
    foreach($Port in @($Listening | Where-Object {
        $_.OwningProcess -eq $Svc.ProcessId -and $_.LocalAddress -in @('0.0.0.0','127.0.0.1','::','::1')
      } | Select-Object -ExpandProperty LocalPort -Unique)){
      $Number=[int]$Port
      if($Number -ge 1 -and $Number -le 65535 -and !$Candidates.Contains($Number)){$Candidates.Add($Number)}
    }
  }
  if($Candidates.Count -eq 0){Registrar 'Se encontro SQL Server pero no su puerto TCP. Revisa que el protocolo TCP/IP este habilitado.';exit 0}
  Registrar ('Puertos detectados: '+($Candidates -join ', '))
  $OutputEncoding=New-Object System.Text.UTF8Encoding($false)
  foreach($Port in $Candidates){
    $Config=[ordered]@{server='127.0.0.1';port=$Port;database=$DbName;user=$User;password=$Password}
    $Json=ConvertTo-Json -InputObject $Config -Compress
    try {
      $Result=$Json | & $Node $Probe 2>$null
      if($LASTEXITCODE -ne 0 -or (@($Result) -notcontains 'OK')) {continue}
      # Solo se guarda cuando el login y las tablas esperadas fueron comprobados.
      $DestinationText=ConvertTo-Json -InputObject $Config -Depth 3
      $Backup=$null
      if(Test-Path -LiteralPath $Target -PathType Leaf){
        $Backup=Join-Path $Data ('conexion.respaldo-'+(Get-Date -Format 'yyyyMMdd-HHmmss')+'.json')
        Copy-Item -LiteralPath $Target -Destination $Backup -ErrorAction Stop
      }
      $Temp=Join-Path $Data ('conexion-'+[Guid]::NewGuid().ToString('N')+'.tmp')
      try {
        [IO.File]::WriteAllText($Temp,$DestinationText,(New-Object System.Text.UTF8Encoding($false)))
        & icacls.exe $Temp '/grant:r' '*S-1-5-18:F' '*S-1-5-32-544:F' | Out-Null
        if($LASTEXITCODE -ne 0){throw 'No se pudieron asignar permisos a la configuracion SQL.'}
        & icacls.exe $Temp '/inheritance:r' | Out-Null
        if($LASTEXITCODE -ne 0){throw 'No se pudieron restringir permisos a la configuracion SQL.'}
        Move-Item -LiteralPath $Temp -Destination $Target -Force -ErrorAction Stop
      } finally {if(Test-Path -LiteralPath $Temp){Remove-Item -LiteralPath $Temp -Force -ErrorAction SilentlyContinue}}
      Registrar ('SQL VALIDADO: '+$Config.server+':'+$Port+' | BD: '+$DbName+' | Usuario: '+$User)
      $Task='Aviles Restaurante 9.2.33'
      if(Get-ScheduledTask -TaskName $Task -ErrorAction SilentlyContinue){
        Stop-ScheduledTask -TaskName $Task -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
        Start-ScheduledTask -TaskName $Task -ErrorAction SilentlyContinue
      }
      exit 0
    } catch {Registrar ('Error al probar el puerto '+$Port+': '+$_.Exception.Message)}
  }
  Registrar 'La instancia SQL no acepto las credenciales incluidas en este instalador. No se reemplazo ninguna configuracion existente.'
  exit 0
} catch {
  try {Registrar ('ERROR SQL: '+$_.Exception.Message)}catch {Write-Host ('ERROR SQL: '+$_.Exception.Message)}
  exit 1
}
