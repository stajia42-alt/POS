$ErrorActionPreference = 'Stop'
$Base = Split-Path -Parent $MyInvocation.MyCommand.Path
$DistOrigen = Join-Path $Base 'dist'
$ExeOrigen = Join-Path $DistOrigen 'Restaurante.exe'
$RuntimeOrigen = Join-Path $DistOrigen 'runtime'
$Dest = Join-Path $env:ProgramData 'Restaurante'
$Startup = Join-Path $env:ProgramData 'Microsoft\Windows\Start Menu\Programs\StartUp'
$Exe = Join-Path $Dest 'Restaurante.exe'
$Cf = Join-Path $Dest 'cloudflared.exe'
$Info = Join-Path $Dest 'cliente.txt'

Clear-Host
Write-Host '=================================================='
Write-Host '       RESTAURANTE - INSTALACION DE CLIENTE'
Write-Host '          TUNEL PERMANENTE DATARESTAPP'
Write-Host '=================================================='
Write-Host ''
if (!(Test-Path $ExeOrigen) -or !(Test-Path (Join-Path $RuntimeOrigen 'node_modules\mssql\package.json'))) {
  Write-Host 'ERROR: La carpeta dist no esta completa (Restaurante.exe + runtime).' -ForegroundColor Red
  Write-Host 'Ejecuta primero COMPILAR_RESTAURANTE.cmd.'
  exit 1
}

if (Get-Service cloudflared -ErrorAction SilentlyContinue) { throw 'Ya existe un servicio cloudflared. No se reemplazo. Usa INICIAR_RESTAURANTE.cmd para probar localmente y conserva tu tunel actual.' }
$Negocio = Read-Host 'Nombre del negocio (ej. Lletotaqueria)'
do { $Sub = (Read-Host 'Subdominio (solo la parte antes de .datarestapp.com)').Trim().ToLower() } while ($Sub -notmatch '^[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$' -and $Sub -notmatch '^[a-z0-9]$')
$Url = "https://$Sub.datarestapp.com"
Write-Host ''
Write-Host "Direccion fija: $Url" -ForegroundColor Cyan
Write-Host 'Copia desde Cloudflare el comando COMPLETO de Windows 64-bit y pegalo aqui.'
Write-Host 'Tambien puedes pegar solamente el token.' -ForegroundColor Cyan
$Entrada = Read-Host 'Comando completo o token de Cloudflare'
if ([string]::IsNullOrWhiteSpace($Entrada)) { throw 'No se recibio ningun comando o token.' }

# Acepta el comando completo que entrega Cloudflare o el token por si solo.
# No intenta decodificar el token: cloudflared hace la validacion real al instalarlo.
$Entrada = $Entrada.Trim()
$Token = $null

# Primero busca lo que venga despues de "service install" (con o sin comillas/ruta al EXE).
$m = [regex]::Match($Entrada, '(?i)service\s+install\s+["'']?([^"''\s;&|]+)')
if ($m.Success) {
  $Token = $m.Groups[1].Value.Trim()
} else {
  # Si se pego solo el token, quita comillas y espacios exteriores.
  $Token = $Entrada.Trim('"', "'", ' ')
}
$Entrada = $null

# Validacion minima para evitar borrar el servicio por una entrada obviamente incorrecta.
# Los tokens actuales de Tunnel son cadenas largas sin espacios. La validacion definitiva
# la realiza cloudflared al ejecutar "service install".
if ([string]::IsNullOrWhiteSpace($Token) -or $Token.Length -lt 40 -or $Token -match '\s') {
  $Token = $null
  throw 'El comando/token no parece completo. Copia TODO el comando de Windows 64-bit que muestra Cloudflare (cloudflared.exe service install ...) y vuelve a ejecutar. No se modifico el servicio cloudflared existente.'
}
Write-Host 'Comando/token recibido. Se validara con cloudflared durante la instalacion.' -ForegroundColor Green

Write-Host ''
Write-Host 'Instalando Restaurante...'
New-Item -ItemType Directory -Force -Path $Dest | Out-Null
Get-Process Restaurante -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1
Copy-Item $ExeOrigen $Exe -Force
$RuntimeDest = Join-Path $Dest 'runtime'
if (Test-Path $RuntimeDest) { Remove-Item $RuntimeDest -Recurse -Force }
Copy-Item $RuntimeOrigen $RuntimeDest -Recurse -Force
foreach ($Archivo in @('ocr_local.py','INSTALAR_OCR_GRATIS.cmd','DIAGNOSTICO_MENU_SOLO_LECTURA.sql')) {
  if (!(Test-Path (Join-Path $DistOrigen $Archivo))) { throw ('La distribucion esta incompleta: '+$Archivo) }
  Copy-Item (Join-Path $DistOrigen $Archivo) (Join-Path $Dest $Archivo) -Force
}

# Inicio oculto de Restaurante. Cloudflared NO se inicia aqui: queda como servicio de Windows.
$Vbs = Join-Path $Dest 'IniciarRestaurante.vbs'
@"
Set sh = CreateObject("WScript.Shell")
sh.Run Chr(34) & "$Exe" & Chr(34), 0, False
"@ | Set-Content -Path $Vbs -Encoding ASCII
Copy-Item $Vbs (Join-Path $Startup 'Restaurante.vbs') -Force

Write-Host 'Preparando cloudflared...'
# Si ya existe el servicio, primero se detiene para liberar cloudflared.exe.
# Asi una reinstalacion/actualizacion no falla porque Windows tenga el archivo en uso.
$Svc = Get-Service cloudflared -ErrorAction SilentlyContinue
if ($Svc) {
  Write-Host 'Deteniendo servicio cloudflared anterior para actualizarlo...' -ForegroundColor Yellow
  Stop-Service cloudflared -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 2
}

$Encontrado = Get-Command cloudflared.exe -ErrorAction SilentlyContinue
if ($Encontrado -and $Encontrado.Source -ne $Cf) {
  Copy-Item $Encontrado.Source $Cf -Force
} elseif (!(Test-Path $Cf)) {
  $Download = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe'
  Write-Host 'Descargando cloudflared oficial de Cloudflare...'
  Invoke-WebRequest -UseBasicParsing -Uri $Download -OutFile $Cf
}

# Solo despues de validar el nuevo token se reemplaza un servicio cloudflared anterior.
$Svc = Get-Service cloudflared -ErrorAction SilentlyContinue
if ($Svc) {
  Write-Host 'Reemplazando servicio cloudflared por el tunel de este cliente...' -ForegroundColor Yellow
  & $Cf service uninstall | Out-Host
  Start-Sleep -Seconds 2
}

Write-Host 'Instalando tunel permanente como servicio de Windows...'
$P = Start-Process -FilePath $Cf -ArgumentList @('service','install',$Token) -Wait -PassThru -NoNewWindow
$Token = $null
if ($P.ExitCode -ne 0) { throw "cloudflared no pudo instalar el servicio. Codigo: $($P.ExitCode)" }

# Guardar solo datos NO secretos.
@(
  "Negocio=$Negocio",
  "Subdominio=$Sub",
  "URL=$Url",
  "Instalado=$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
) | Set-Content -Path $Info -Encoding UTF8

Write-Host 'Iniciando Restaurante...'
Start-Process -FilePath 'wscript.exe' -ArgumentList ('"' + $Vbs + '"') -WindowStyle Hidden
$Ready = $false
for ($i=0; $i -lt 60 -and !$Ready; $i++) {
  try {
    $r = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:3000' -TimeoutSec 2
    if ($r.StatusCode -ge 200) { $Ready = $true }
  } catch {}
  if (!$Ready) { Start-Sleep -Seconds 1 }
}

$Svc2 = Get-Service cloudflared -ErrorAction SilentlyContinue
Write-Host ''
Write-Host '=================================================='
if ($Ready -and $Svc2 -and $Svc2.Status -eq 'Running') {
  Write-Host '       INSTALACION COMPLETADA CORRECTAMENTE' -ForegroundColor Green
} else {
  Write-Host '       INSTALACION TERMINADA - REVISAR ESTADO' -ForegroundColor Yellow
}
Write-Host '=================================================='
Write-Host "Negocio: $Negocio"
Write-Host 'Local:   http://127.0.0.1:3000'
Write-Host "Remoto:  $Url"
Write-Host "Restaurante local: $(if($Ready){'OK'}else{'NO RESPONDE'})"
Write-Host "Cloudflare servicio: $(if($Svc2){$Svc2.Status}else{'NO ENCONTRADO'})"
Write-Host ''
Write-Host 'IMPORTANTE: El hostname debe estar publicado en Cloudflare y apuntar a http://127.0.0.1:3000.'
Write-Host 'El token NO se guardo en cliente.txt.'
