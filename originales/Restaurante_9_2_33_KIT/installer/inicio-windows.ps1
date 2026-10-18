#requires -Version 5.1
# Configura solamente el inicio visible del navegador; el servidor inicia con Windows.
$ErrorActionPreference='Stop'
try {
  $Shortcut=Join-Path ([Environment]::GetFolderPath('CommonStartup')) 'Abrir Restaurante 9.2.33.lnk'
  Write-Host 'El servidor Restaurante arranca automaticamente al encender Windows.' -ForegroundColor Cyan
  Write-Host ('Apertura del navegador: '+$(if(Test-Path -LiteralPath $Shortcut){'Activada'}else{'Desactivada'}))
  $Answer=Read-Host 'Quieres abrir la interfaz al iniciar sesion? (S/N)'
  if($Answer -match '^[sS]$'){
    $Shell=New-Object -ComObject WScript.Shell
    $Link=$Shell.CreateShortcut($Shortcut)
    $Link.TargetPath=Join-Path $env:WINDIR 'System32\wscript.exe'
    $Link.Arguments='"'+(Join-Path $PSScriptRoot 'open.vbs')+'"'
    $Link.Save()
    Write-Host 'Apertura al iniciar sesion activada.' -ForegroundColor Green
  } elseif($Answer -match '^[nN]$'){
    if(Test-Path -LiteralPath $Shortcut){Remove-Item -LiteralPath $Shortcut -Force}
    Write-Host 'Apertura visible desactivada. El servidor permanece automatico.' -ForegroundColor Green
  }
} catch {Write-Host ('ERROR: '+$_.Exception.Message) -ForegroundColor Red}
Read-Host 'Enter para cerrar' | Out-Null
