#requires -Version 5.1
$ErrorActionPreference='Stop'
$Root=Split-Path -Parent $PSScriptRoot
$env:RESTAURANTE_CONFIG_DIR=Join-Path $env:ProgramData 'AvilesRestaurante933'
$env:PORT='3000'
Set-Location $Root
$Node=Join-Path $Root 'node.exe'
$App=Join-Path $Root 'app.js'
if(!(Test-Path $Node) -or !(Test-Path $App)){exit 2}
$LogFolder=Join-Path $env:RESTAURANTE_CONFIG_DIR 'logs'
New-Item -Path $LogFolder -ItemType Directory -Force | Out-Null
$LogFile=Join-Path $LogFolder 'servidor.log'
if((Test-Path $LogFile) -and (Get-Item $LogFile).Length -gt 10485760){
 try {Move-Item $LogFile ($LogFile+'.anterior') -Force -ErrorAction Stop}catch{}
}
('Iniciando servidor: '+(Get-Date -Format o)) | Add-Content -Path $LogFile
$ErrorActionPreference='Continue'
& $Node $App 2>&1 | Out-File -FilePath $LogFile -Append -Encoding UTF8
exit $LASTEXITCODE
