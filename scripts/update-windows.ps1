# Parking POS: complete Windows distribution updater, never an app.asar-only patch.
[CmdletBinding()]
param(
 [string]$InstallDir,
 [string]$PayloadDir = (Join-Path $PSScriptRoot '..\win-unpacked'),
 [string]$ManifestPath = (Join-Path $PSScriptRoot 'manifest.json')
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
function Hash-File([string]$File) { (Get-FileHash -LiteralPath $File -Algorithm SHA256).Hash.ToLowerInvariant() }
function Read-Package([string]$Asar) {
 $stream=[IO.File]::OpenRead($Asar)
 try {
  $reader=New-Object IO.BinaryReader($stream)
  if($reader.ReadUInt32() -ne 4){throw 'ASAR no reconocido.'}
  $headerSize=$reader.ReadUInt32(); $null=$reader.ReadUInt32(); $jsonSize=$reader.ReadUInt32()
  if($headerSize -lt 8 -or $headerSize -gt 67108864 -or $jsonSize -gt ($headerSize-8)){throw 'Cabecera ASAR inválida.'}
  $bytes=$reader.ReadBytes($jsonSize)
  if($bytes.Length -ne $jsonSize){throw 'ASAR incompleto.'}
  $header=[Text.Encoding]::UTF8.GetString($bytes)|ConvertFrom-Json
  $item=$header.files.'package.json'
  if(!$item -or $item.unpacked -or $item.size -lt 1 -or $item.size -gt 1048576 -or [string]$item.offset -notmatch '^\d+$'){throw 'Identidad de aplicación ausente en ASAR.'}
  $stream.Position=8+[long]$headerSize+[long]$item.offset
  $bytes=$reader.ReadBytes([int]$item.size)
  if($bytes.Length -ne $item.size){throw 'package.json incompleto.'}
  return ([Text.Encoding]::UTF8.GetString($bytes)|ConvertFrom-Json)
 }finally{$stream.Dispose()}
}
function Assert-Identity($Package){
 if($Package.name -ne 'parking-pos-desktop' -or $Package.main -ne 'desktop/main.js' -or [string]$Package.version -notmatch '^\d+\.\d+\.\d+$'){
  throw 'La instalación no se identifica como Parking POS compatible. No se modificará.'
 }
}
function Relative-File([string]$Root,[string]$Relative){
 if(!$Relative -or $Relative -match '(^|[\\/])\.\.?([\\/]|$)|:|^[/\\]'){throw 'Ruta inválida en manifiesto.'}
 $base=[IO.Path]::GetFullPath($Root).TrimEnd('\')+'\'
 $target=[IO.Path]::GetFullPath((Join-Path $Root $Relative))
 if(!$target.StartsWith($base,[StringComparison]::OrdinalIgnoreCase)){throw 'Ruta fuera de la distribución.'}
 return $target
}
function Assert-NoLinks([string]$Root){
 if((Get-Item -LiteralPath $Root).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'La carpeta es un enlace. No se modifica.'}
 foreach($item in (Get-ChildItem -LiteralPath $Root -Force -Recurse)){
  if($item.Attributes -band [IO.FileAttributes]::ReparsePoint){throw ('No se permiten enlaces: '+$item.FullName)}
 }
}
function Assert-Manifest([string]$Root,$Manifest,[switch]$AllowExtra){
 Assert-NoLinks $Root
 $expectedFiles=@{}
 foreach($item in $Manifest.files){
  $file=Relative-File $Root $item.path
  $expectedFiles[$file]=$true
  if(!(Test-Path -LiteralPath $file -PathType Leaf) -or (Get-Item -LiteralPath $file).Length -ne $item.size -or (Hash-File $file) -ne $item.sha256){throw ('Archivo ausente o dañado: '+$item.path)}
 }
 if(!$AllowExtra){foreach($file in (Get-ChildItem -LiteralPath $Root -File -Recurse -Force)){if(!$expectedFiles.ContainsKey($file.FullName)){throw ('Archivo no declarado en la distribución: '+$file.FullName)}}}
}
function Assert-WindowsX64([string]$File){
 $stream=[IO.File]::OpenRead($File)
 try{
  $reader=New-Object IO.BinaryReader($stream)
  if($stream.Length -lt 70 -or $reader.ReadUInt16() -ne 0x5a4d){throw 'La distribución no contiene un binario Windows x64.'}
  $stream.Position=60;$offset=$reader.ReadUInt32()
  if($offset -lt 64 -or $offset -gt ($stream.Length-6)){throw 'Cabecera Windows inválida.'}
  $stream.Position=$offset
  if($reader.ReadUInt32() -ne 0x4550 -or $reader.ReadUInt16() -ne 0x8664){throw 'Se bloqueó un binario de otra arquitectura.'}
 }finally{$stream.Dispose()}
}
function Assert-Closed([string]$Program,[string]$Data){
 foreach($process in (Get-Process -ErrorAction Stop)){
  try{$p=$process.Path}catch{$p=$null}
  if($process.ProcessName -in @('Parking POS','parking-pos-desktop')){throw 'Parking POS está abierto. Ciérralo antes de actualizar.'}
  if($p -and $p.StartsWith($Program.TrimEnd('\')+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Parking POS está abierto. Ciérralo antes de actualizar.'}
 }
 $lock=Join-Path $Data 'server.lock'
 if(Test-Path -LiteralPath $lock){
  $processId=0
  if(![int]::TryParse(([IO.File]::ReadAllText($lock).Trim()),[ref]$processId)){throw 'No se pudo verificar el bloqueo de SQLite.'}
  if(Get-Process -Id $processId -ErrorAction SilentlyContinue){throw 'Un servidor de Parking POS sigue usando la base. Ciérralo antes de actualizar.'}
 }
}
function Copy-Verified([string]$Source,[string]$Destination){
 New-Item -ItemType Directory -Force -Path $Destination|Out-Null
 foreach($item in (Get-ChildItem -LiteralPath $Source -Force)){Copy-Item -LiteralPath $item.FullName -Destination $Destination -Recurse -Force}
 $base=$Source.TrimEnd('\')+'\'
 foreach($item in (Get-ChildItem -LiteralPath $Source -File -Recurse -Force)){
  $relative=$item.FullName.Substring($base.Length)
  if((Hash-File $item.FullName) -ne (Hash-File (Join-Path $Destination $relative))){throw ('Respaldo incompleto: '+$relative)}
 }
}
$stage=$null;$rollback=$null;$selected=$null;$swapped=$false;$lockStream=$null
try{
 if(!$env:LOCALAPPDATA){throw 'LOCALAPPDATA no está disponible.'}
 $PayloadDir=[IO.Path]::GetFullPath($PayloadDir)
 $manifest=Get-Content -LiteralPath $ManifestPath -Raw -Encoding UTF8|ConvertFrom-Json
 if($manifest.format -ne 1 -or $manifest.name -ne 'parking-pos-desktop' -or $manifest.platform -ne 'win32' -or $manifest.arch -ne 'x64' -or $manifest.executable -ne 'Parking POS.exe' -or !$manifest.files.Count){throw 'Manifiesto no compatible.'}
 $seen=@{}
 foreach($item in $manifest.files){
  if($seen.ContainsKey([string]$item.path) -or [string]$item.sha256 -notmatch '^[a-f0-9]{64}$' -or $item.size -lt 0 -or [string]$item.path -match '(^|[\\/])parking\.db(?:-wal|-shm)?$'){throw 'Manifiesto inválido o contiene datos operativos.'}
  $seen[[string]$item.path]=$true
 }
 Assert-Manifest $PayloadDir $manifest
 $newPackage=Read-Package (Join-Path $PayloadDir 'resources\app.asar');Assert-Identity $newPackage
 if($newPackage.version -ne $manifest.version){throw 'La versión del manifiesto no coincide con el programa.'}
 foreach($required in @('Parking POS.exe','resources/app.asar','resources/print-worker.ps1','resources/print-raw.ps1')){if(!$seen.ContainsKey($required)){throw ('Distribución incompleta: '+$required)}}
 if(!@($manifest.files|Where-Object{$_.path -match 'better_sqlite3\.node$'}).Count){throw 'La distribución no incluye SQLite nativo.'}
 Assert-WindowsX64 (Join-Path $PayloadDir 'Parking POS.exe')
 foreach($item in ($manifest.files|Where-Object{$_.path -match 'better_sqlite3\.node$'})){Assert-WindowsX64 (Relative-File $PayloadDir $item.path)}
 $data=Join-Path $env:LOCALAPPDATA 'ParkingPOS'
 if($InstallDir){$roots=@([IO.Path]::GetFullPath($InstallDir))}
 else{
  $roots=@((Join-Path $env:LOCALAPPDATA 'Programs\parking-pos-desktop'),(Join-Path $env:LOCALAPPDATA 'Programs\Parking POS'))
  foreach($parent in @((Join-Path $env:LOCALAPPDATA 'Programs'),$env:ProgramFiles,${env:ProgramFiles(x86)})){
   if($parent -and (Test-Path -LiteralPath $parent)){
    foreach($folder in (Get-ChildItem -LiteralPath $parent -Directory)){if($folder.Name -match 'parking'){$roots+=$folder.FullName}}
   }
  }
 }
 $installations=@()
 foreach($root in ($roots|Sort-Object -Unique)){
  $asar=Join-Path $root 'resources\app.asar'
  if(!(Test-Path -LiteralPath $asar -PathType Leaf)){continue}
  $oldPackage=Read-Package $asar;Assert-Identity $oldPackage
  if(!(Test-Path -LiteralPath (Join-Path $root 'Parking POS.exe') -PathType Leaf)){throw 'Instalación incompleta: falta el ejecutable.'}
  $installations+= [pscustomobject]@{Directory=$root;Package=$oldPackage}
 }
 if($installations.Count -ne 1){throw 'No hay una única instalación compatible. Indica -InstallDir con su ruta exacta.'}
 $selected=$installations[0].Directory;Assert-NoLinks $selected
 $oldPackage=$installations[0].Package
 $programBase=[IO.Path]::GetFullPath($selected).TrimEnd('\')
 $dataBase=[IO.Path]::GetFullPath($data).TrimEnd('\')
 if($programBase -eq $dataBase -or $dataBase.StartsWith($programBase+'\',[StringComparison]::OrdinalIgnoreCase) -or $programBase.StartsWith($dataBase+'\',[StringComparison]::OrdinalIgnoreCase)){
  throw 'Las carpetas de programa y datos se superponen. No se hará una copia recursiva ni se sustituirán datos; requiere revisar la instalación.'
 }
 if($PayloadDir.StartsWith($selected.TrimEnd('\')+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Extrae la actualización fuera de la carpeta instalada.'}
 if([version]$newPackage.version -le [version]$oldPackage.version){
  if($newPackage.version -eq $oldPackage.version -and (Hash-File (Join-Path $selected 'resources\app.asar')) -eq (Hash-File (Join-Path $PayloadDir 'resources\app.asar'))){Write-Host 'Esta versión ya está instalada.';exit 0}
  throw 'Se bloqueó una versión igual diferente o un retroceso. No sobrescribas una instalación más reciente.'
 }
 Assert-Closed $selected $data
 New-Item -ItemType Directory -Force -Path $data|Out-Null
 $lockStream=[IO.File]::Open((Join-Path $data 'update.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
 $backup=Join-Path $data ('Respaldos_Actualizaciones\'+$newPackage.version+'_'+(Get-Date -Format 'yyyyMMdd_HHmmss')+'_'+[guid]::NewGuid().ToString('N').Substring(0,8))
 $oldProgram=Join-Path $backup 'ProgramaAnterior'
 Copy-Verified $selected $oldProgram
 $databaseBackup=Join-Path $backup 'Datos';New-Item -ItemType Directory -Force -Path $databaseBackup|Out-Null
 foreach($name in @('parking.db','parking.db-wal','parking.db-shm','restore-pending.json')){
  $source=Join-Path $data $name
  if(Test-Path -LiteralPath $source -PathType Leaf){
   $destination=Join-Path $databaseBackup $name;Copy-Item -LiteralPath $source -Destination $destination
   if((Hash-File $source) -ne (Hash-File $destination)){throw ('El respaldo de '+$name+' no se pudo verificar.')}
  }
 }
 $parent=Split-Path -Parent $selected;$tag=[guid]::NewGuid().ToString('N')
 $stage=Join-Path $parent ('.update-stage-'+$tag);$rollback=Join-Path $parent ('.update-rollback-'+$tag)
 # Preserve uninstall metadata and any local files, then replace COMPLETE resources
 # and runtime trees. Never combine the old SQLite binary with a new Electron ABI.
 Copy-Verified $selected $stage
 foreach($item in (Get-ChildItem -LiteralPath $PayloadDir -Force)){
  $destination=Join-Path $stage $item.Name
  if(Test-Path -LiteralPath $destination){Remove-Item -LiteralPath $destination -Force -Recurse}
  Copy-Item -LiteralPath $item.FullName -Destination $stage -Recurse -Force
 }
 Assert-Manifest $stage $manifest -AllowExtra
 Assert-Closed $selected $data
 Move-Item -LiteralPath $selected -Destination $rollback
 try{Move-Item -LiteralPath $stage -Destination $selected;$stage=$null;$swapped=$true}
 catch{Move-Item -LiteralPath $rollback -Destination $selected;$rollback=$null;throw}
 try{Assert-Manifest $selected $manifest -AllowExtra}
 catch{
  $failed=Join-Path $parent ('.update-failed-'+$tag)
  Move-Item -LiteralPath $selected -Destination $failed
  Move-Item -LiteralPath $rollback -Destination $selected;$rollback=$null;$swapped=$false
  throw
 }
 Set-Content -LiteralPath (Join-Path $backup 'ACTUALIZACION.txt') -Encoding UTF8 -Value ('Anterior: '+$oldPackage.version+[Environment]::NewLine+'Nueva: '+$newPackage.version+[Environment]::NewLine+'Instalación: '+$selected+[Environment]::NewLine+'SQLite no se reemplazó. Las migraciones se aplican al iniciar.')
 Remove-Item -LiteralPath $rollback -Recurse -Force;$rollback=$null
 Write-Host ('Parking POS '+$newPackage.version+' actualizado. Respaldo verificado: '+$backup) -ForegroundColor Green
 Write-Host 'Abre Parking POS y prueba entrada, cobro, impresión y corte antes de operar con dinero real.'
 Write-Host 'No copies la base antigua sobre la actual ni vuelvas a una versión anterior después de migrar.'
}catch{
 Write-Host ('ERROR: '+$_.Exception.Message) -ForegroundColor Red
 if($swapped){Write-Host 'El nuevo programa ya se colocó; los respaldos se conservaron. Revisa el mensaje antes de continuar.'}
 if($rollback -and (Test-Path -LiteralPath $rollback)){Write-Host ('Programa anterior conservado en: '+$rollback)}
 Write-Host 'No desinstales Parking POS ni borres su base de datos.'
 exit 1
}finally{
 if($lockStream){$lockStream.Dispose()}
 if($stage -and (Test-Path -LiteralPath $stage)){Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue}
}
