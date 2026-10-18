#requires -Version 5.1
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$Root=Split-Path -Parent $PSScriptRoot
Set-Location $Root
$Log=Join-Path $Root 'REGISTRO_COMPILACION.txt'
try { Start-Transcript -Path $Log -Force | Out-Null } catch {}
try {
 Write-Host '==================================================' -ForegroundColor Cyan
 Write-Host '       RESTAURANTE 9.2.33 - INSTALADOR REAL'
 Write-Host '       Interfaz 9.2.33 conservada; sin Atun Urbano'
 Write-Host '==================================================' -ForegroundColor Cyan
 if(-not [Environment]::Is64BitOperatingSystem -or -not [Environment]::Is64BitProcess){throw 'Abre CREAR_INSTALADOR.cmd en Windows 64 bits.'}
 $Source=Join-Path $Root 'Restaurante_9_2_33_ORIGINAL'
 $Manifest=Get-Content -LiteralPath (Join-Path $Root 'INTEGRIDAD_ORIGINAL.json') -Raw | ConvertFrom-Json
 $Count=0
 foreach($Item in $Manifest){
  $f=Join-Path $Source ([string]$Item.path)
  if(!(Test-Path -LiteralPath $f -PathType Leaf)){throw ('Archivo original no encontrado: '+$Item.path)}
  if((Get-FileHash -LiteralPath $f -Algorithm SHA256).Hash -ne $Item.sha256){throw ('El proyecto original fue modificado: '+$Item.path)}
  $Count++
 }
 Write-Host ('[1/6] Archivos originales comprobados: '+$Count) -ForegroundColor Green
 $NodeCmd=Get-Command node.exe -ErrorAction Stop
 $NpmCmd=Get-Command npm.cmd -ErrorAction Stop
 $Node=$NodeCmd.Source
 $NodeVersion=(& $Node -p 'process.version').Trim()
 $Major=[int]($NodeVersion.TrimStart('v').Split('.')[0])
 $Arch=(& $Node -p 'process.arch').Trim()
 if($Major -ne 24 -or $Arch -ne 'x64'){throw ('Necesitas Node.js 24 de 64 bits para compilar. Detectado: '+$NodeVersion+' '+$Arch)}
 Write-Host ('[2/6] Node.js '+$NodeVersion+' x64 disponible.')
 # Buscar ISCC.exe no solo por rutas: tambien por registro y ubicacion por usuario.
 # Se permite fijar la ruta manualmente con ISCC_PATH sin tocar la aplicacion.
 function Buscar-Inno {
   $Posibles = New-Object 'System.Collections.Generic.List[string]'
   if($env:ISCC_PATH){$Posibles.Add($env:ISCC_PATH)}
   $Cmd=Get-Command 'ISCC.exe' -CommandType Application -ErrorAction SilentlyContinue
   if($Cmd){$Posibles.Add($Cmd.Source)}
   foreach($Base in @($env:ProgramFiles,${env:ProgramFiles(x86)},$env:LOCALAPPDATA,(Join-Path $env:LOCALAPPDATA 'Programs'))) {
     if([string]::IsNullOrWhiteSpace($Base)){continue}
     foreach($Nombre in @('Inno Setup 6','Inno Setup 7','Inno Setup')){
       $Posibles.Add((Join-Path (Join-Path $Base $Nombre) 'ISCC.exe'))
     }
   }
   $AppPathKeys=@(
     'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\ISCC.exe',
     'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\ISCC.exe'
   )
   foreach($Key in $AppPathKeys){
     if(Test-Path $Key){
       $Reg=Get-Item -LiteralPath $Key -ErrorAction SilentlyContinue
       if($Reg){$Default=$Reg.GetValue('');if($Default){$Posibles.Add([string]$Default)}}
     }
   }
   $UninstallKeys=@(
     'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*',
     'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*',
     'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*',
     'HKCU:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*'
   )
   foreach($Key in $UninstallKeys){
     $Entries=Get-ItemProperty -Path $Key -ErrorAction SilentlyContinue
     foreach($Entry in @($Entries)){
       if(!$Entry){continue}
       $NameProp=$Entry.PSObject.Properties['DisplayName']
       if(!$NameProp -or [string]$NameProp.Value -notmatch '^Inno Setup(?:\s+[67])?(?:\s|$)'){continue}
       foreach($PropName in @('InstallLocation','Inno Setup: App Path','DisplayIcon','UninstallString')){
         $Property=$Entry.PSObject.Properties[$PropName]
         if(!$Property -or !$Property.Value){continue}
         $Location=([string]$Property.Value).Trim().Trim('"')
         if($PropName -in @('DisplayIcon','UninstallString')){
           # El valor puede ser '"C:\...\unins000.exe" /SILENT' o '"C:\...\ISCC.exe",0'.
           if($Location -match '^(.+?\.exe)(?:[",].*)?$'){$Location=$Matches[1].Trim('"')}
           $Location=Split-Path -Path $Location -Parent
         }
         if($Location){$Posibles.Add((Join-Path $Location 'ISCC.exe'))}
       }
     }
   }
   foreach($Candidate in $Posibles){
     if(!$Candidate){continue}
     $PathCandidate=([string]$Candidate).Trim().Trim('"')
     if(Test-Path -LiteralPath $PathCandidate -PathType Container){$PathCandidate=Join-Path $PathCandidate 'ISCC.exe'}
     if((Test-Path -LiteralPath $PathCandidate -PathType Leaf) -and
        [string]::Equals([IO.Path]::GetFileName($PathCandidate),'ISCC.exe',[StringComparison]::OrdinalIgnoreCase)){
       return (Get-Item -LiteralPath $PathCandidate).FullName
     }
   }
   return $null
 }
 $Compiler=Buscar-Inno
 if(!$Compiler){
   Write-Host 'Inno Setup no se detecto en las ubicaciones y registro de Windows.' -ForegroundColor Yellow
   Write-Host 'Si solo descargaste su instalador, ejecuta primero ese archivo y termina la instalacion.' -ForegroundColor Yellow
   Write-Host 'Si ya esta instalado, abre su carpeta y busca ISCC.exe (compilador de Inno Setup).' -ForegroundColor Cyan
   $RutaManual=Read-Host 'Pega la ruta completa a ISCC.exe (o su carpeta). Enter para intentar winget'
   if($RutaManual){
     $env:ISCC_PATH=$RutaManual.Trim().Trim('"')
     $Compiler=Buscar-Inno
     if(!$Compiler){throw ('No se encontro ISCC.exe en la ruta indicada: '+$env:ISCC_PATH)}
   }
 }
 if(!$Compiler){
   $Winget=Get-Command winget.exe -CommandType Application -ErrorAction SilentlyContinue
   if($Winget){
     Write-Host 'Intentando instalar Inno Setup mediante winget...' -ForegroundColor Yellow
     & $Winget.Source install --id JRSoftware.InnoSetup --exact --source winget --accept-package-agreements --accept-source-agreements --disable-interactivity
     $Compiler=Buscar-Inno
   }
 }
 if(!$Compiler){throw 'No se encontro ISCC.exe. Abre Inno Setup en Inicio > Inno Setup Compiler, o busca ISCC.exe y proporciona su ruta cuando el creador la solicite.'}
 Write-Host ('Compilador encontrado: '+$Compiler) -ForegroundColor Green
 Write-Host ('[3/6] Inno Setup: '+$Compiler)
 $Stage=Join-Path $Root 'build\payload'
 if(Test-Path $Stage){Remove-Item $Stage -Recurse -Force}
 New-Item -Path $Stage -ItemType Directory -Force | Out-Null
 # Copiar la aplicacion 9.2.33 aprobada; solo se removio el modulo especial de prueba.
 Get-ChildItem -LiteralPath $Source -File | Where-Object {$_.Extension -in @('.js','.py','.html','.sql','.json')} | ForEach-Object {
   if($_.Name -notin @('MANIFIESTO_APLICACION.json','package.json','package-lock.json')){
    Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $Stage $_.Name)
   }
 }
 Copy-Item -LiteralPath (Join-Path $Source 'public') -Destination (Join-Path $Stage 'public') -Recurse
 foreach($F in @('app.js','interfaz.js','version.js','menu_compuestos.js')){
  if((Get-FileHash (Join-Path $Stage $F) -Algorithm SHA256).Hash -ne (Get-FileHash (Join-Path $Source $F) -Algorithm SHA256).Hash){throw ('No se conservo intacto el archivo '+$F)}
 }
 foreach($F in @('index.html','style.css','app.js','menu.html','menu.css','menu.js')){
  if((Get-FileHash (Join-Path $Stage ('public\'+$F)) -Algorithm SHA256).Hash -ne (Get-FileHash (Join-Path $Source ('public\'+$F)) -Algorithm SHA256).Hash){throw ('Interfaz diferente: public\'+$F)}
 }
 $JSFiles=Get-ChildItem -LiteralPath $Stage -File -Filter '*.js' -Recurse
 foreach($File in $JSFiles){& $Node --check $File.FullName | Out-Null;if($LASTEXITCODE -ne 0){throw ('Error de sintaxis en '+$File.FullName)}}
 Write-Host ('[4/6] Interfaz intacta, sintaxis JavaScript comprobada: '+@($JSFiles).Count+' archivos.') -ForegroundColor Green
 $Runtime=Join-Path $Stage 'runtime'
 New-Item -Path $Runtime -ItemType Directory -Force | Out-Null
 foreach($F in @('package.json','package-lock.json')){Copy-Item (Join-Path $Source $F) (Join-Path $Runtime $F)}
 '// Runtime module resolution for Restaurante.' | Set-Content -LiteralPath (Join-Path $Runtime 'loader.js') -Encoding ASCII
 Write-Host '[5/6] Descargando dependencias oficiales npm para el equipo del cliente...' -ForegroundColor Cyan
 Push-Location $Runtime
 try {& $NpmCmd ci --omit=dev --no-audit --no-fund;if($LASTEXITCODE -ne 0){throw 'npm ci fallo. Verifica Internet en el equipo compilador y vuelve a intentar.'}}
 finally{Pop-Location}
 foreach($Package in @('express','mssql','exceljs')){if(!(Test-Path (Join-Path $Runtime ('node_modules\'+$Package+'\package.json')))){throw ('Dependencia faltante: '+$Package)}}
 Copy-Item -LiteralPath $Node -Destination (Join-Path $Stage 'node.exe')
 $NodeLicense=Join-Path (Split-Path $Node -Parent) 'LICENSE'
 if(!(Test-Path $NodeLicense)){$NodeLicense=Join-Path $PSScriptRoot 'NODE_LICENSE.txt'}
 if(!(Test-Path $NodeLicense)){
  Write-Host 'Licencia Node.js no encontrada junto al ejecutable. Descargando el texto oficial...' -ForegroundColor Yellow
  $NodeLicense=Join-Path $Stage 'NODE_LICENSE.txt'
  $Uri='https://raw.githubusercontent.com/nodejs/node/'+$NodeVersion+'/LICENSE'
  Invoke-WebRequest -UseBasicParsing -Uri $Uri -TimeoutSec 30 -OutFile $NodeLicense
 }
 if((Get-Item $NodeLicense).Length -lt 5000){throw 'Licencia Node.js incompleta. Coloca el archivo LICENSE oficial como installer\NODE_LICENSE.txt y vuelve a ejecutar.'}
 if($NodeLicense -ne (Join-Path $Stage 'NODE_LICENSE.txt')){Copy-Item -LiteralPath $NodeLicense -Destination (Join-Path $Stage 'NODE_LICENSE.txt')}
 # Verificacion de carga de modulos con el node.exe que recibira el cliente.
 Push-Location $Stage
 try {
  & (Join-Path $Stage 'node.exe') -e "const {createRequire}=require('module');const path=require('path');const r=createRequire(path.resolve('runtime/loader.js'));for(const x of ['express','mssql','exceljs'])r(x);console.log('OK dependencias')" 2>&1 | Out-Host
  if($LASTEXITCODE -ne 0){throw 'Fallo la validacion final de dependencias.'}
 } finally { Pop-Location }
 Write-Host '[6/6] Compilando EXE de Inno Setup...' -ForegroundColor Cyan
 & $Compiler (Join-Path $PSScriptRoot 'Restaurante933.iss')
 if($LASTEXITCODE -ne 0){
   # Windows puede negar rutas muy largas de @azure/msal-browser durante la compresion.
   # Si falla la primera compilacion, reintentamos con una letra de unidad temporal corta.
   Write-Host 'Reintentando compilacion mediante ruta temporal corta...' -ForegroundColor Yellow
   $ShortDrive=$null
   foreach($Letter in @('R','Q','Y','Z')){
     if(!(Test-Path ($Letter+':\'))){$ShortDrive=$Letter;break}
   }
   if(!$ShortDrive){throw ('Inno Setup no pudo compilar y no hay una letra libre para reducir la ruta. Codigo: '+$LASTEXITCODE)}
   try {
     & cmd.exe /c ('subst '+$ShortDrive+': "'+$Root+'"') | Out-Null
     if($LASTEXITCODE -ne 0){throw 'No se pudo crear la unidad temporal de compilacion.'}
     $IssShort=$ShortDrive+':\installer\Restaurante933.iss'
     & $Compiler $IssShort
     if($LASTEXITCODE -ne 0){throw ('Inno Setup no pudo compilar el EXE. Codigo: '+$LASTEXITCODE)}
   } finally {
     & cmd.exe /c ('subst '+$ShortDrive+': /D') | Out-Null
   }
 }
 $Output=Join-Path $Root 'output\Setup_Restaurante_9.2.33.exe'
 if(!(Test-Path $Output)){throw 'No aparecio el archivo de salida del instalador.'}
 Write-Host ('LISTO: '+$Output) -ForegroundColor Green
 Write-Host ('SHA256: '+(Get-FileHash $Output -Algorithm SHA256).Hash)
 Write-Host 'IMPORTANTE: Primero probar en Windows sin alterar el sistema real del cliente.' -ForegroundColor Yellow
 exit 0
} catch {
 Write-Host ('ERROR: '+$_.Exception.Message) -ForegroundColor Red
 exit 1
} finally {
 try {Stop-Transcript | Out-Null}catch{}
}
