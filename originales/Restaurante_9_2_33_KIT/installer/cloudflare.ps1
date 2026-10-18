#requires -Version 5.1
# Cloudflare Tunnel: asistente para token de servicio y hostname del cliente.
$ErrorActionPreference='Stop'
try {
  $Principal=New-Object Security.Principal.WindowsPrincipal ([Security.Principal.WindowsIdentity]::GetCurrent())
  if(-not $Principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){
    Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList ('-NoProfile -ExecutionPolicy Bypass -File "'+$PSCommandPath+'"')
    exit 0
  }
  Write-Host '===================================================' -ForegroundColor Cyan
  Write-Host ' RESTAURANTE 9.2.33 - ACCESO REMOTO CLOUDFLARE'
  Write-Host '===================================================' -ForegroundColor Cyan
  $Sub=Read-Host 'Subdominio completo del cliente (ej. cliente.tudominio.com)'
  $Sub=$Sub.Trim().ToLowerInvariant()
  if($Sub.Length -gt 253 -or $Sub -notmatch '^(?=.{4,253}$)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$') {throw 'Introduce un subdominio completo valido, por ejemplo: cliente.tudominio.com'}
  $Data=Join-Path $env:ProgramData 'AvilesRestaurante933'
  New-Item -Path $Data -ItemType Directory -Force | Out-Null
  [IO.File]::WriteAllText((Join-Path $Data 'subdominio-cloudflare.txt'),$Sub,[Text.Encoding]::UTF8)
  Write-Host ('Hostname del cliente: https://'+$Sub) -ForegroundColor Green
  Write-Host 'Origen local para el hostname: HTTP -> http://127.0.0.1:3000' -ForegroundColor Cyan
  Write-Host 'En Cloudflare Zero Trust: Networks > Tunnels > tu tunel > Public Hostnames,'
  Write-Host ('crea o verifica '+$Sub+' -> http://127.0.0.1:3000.')
  Write-Host 'El token de servicio del tunel NO crea por si solo la ruta DNS ni el hostname.' -ForegroundColor Yellow
  if(Get-Service -Name 'cloudflared' -ErrorAction SilentlyContinue){
    Write-Host 'El servicio Cloudflare ya existe. No se reemplazara su tunel.' -ForegroundColor Yellow
    Write-Host 'Solo se guardo el hostname para este equipo; vincula el hostname al tunel desde Cloudflare.'
  } else {
    $Secure=Read-Host 'Pega el token del tunel de Cloudflare' -AsSecureString
    $Ptr=[IntPtr]::Zero
    try {
      $Ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)
      $Token=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($Ptr).Trim()
    } finally {if($Ptr -ne [IntPtr]::Zero){[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($Ptr)}}
    if([string]::IsNullOrWhiteSpace($Token) -or $Token.Length -lt 40 -or $Token -match '\s'){throw 'El token no es valido o esta incompleto.'}
    $ExeFolder=Join-Path $env:ProgramFiles 'Aviles Restaurante 9.2.33\cloudflare'
    New-Item -Path $ExeFolder -ItemType Directory -Force | Out-Null
    $Exe=Join-Path $ExeFolder 'cloudflared.exe'
    if(!(Test-Path -LiteralPath $Exe)){
      Write-Host 'Descargando cloudflared oficial...' -ForegroundColor Cyan
      [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
      Invoke-WebRequest -UseBasicParsing -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile $Exe -TimeoutSec 120
    }
    if((Get-Item -LiteralPath $Exe).Length -lt 1000000){throw 'cloudflared.exe esta incompleto.'}
    Write-Host 'Registrando servicio Cloudflare para arrancar con Windows...' -ForegroundColor Yellow
    & $Exe service install $Token
    $Token=$null
    if($LASTEXITCODE -ne 0){throw 'No se pudo instalar el servicio Cloudflare.'}
    $Cloud=Get-Service -Name cloudflared -ErrorAction Stop
    Set-Service -Name cloudflared -StartupType Automatic
    if($Cloud.Status -ne 'Running'){Start-Service -Name cloudflared -ErrorAction Stop}
    Write-Host 'Servicio Cloudflare instalado e iniciado.' -ForegroundColor Green
  }
  Write-Host ('Subdominio registrado en este equipo: '+$Sub) -ForegroundColor Green
  Write-Host 'Completa el Public Hostname del tunel en tu panel Cloudflare para que la URL funcione.'
} catch {Write-Host ('ERROR: '+$_.Exception.Message) -ForegroundColor Red}
Read-Host 'Presiona Enter para cerrar' | Out-Null
