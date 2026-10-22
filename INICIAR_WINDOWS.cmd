@echo off
setlocal
cd /d "%~dp0"
title Parking POS - Servidor local
where node >nul 2>nul
if errorlevel 1 (
 echo Instala Node.js 24 x64 y vuelve a iniciar.
 pause
 exit /b 1
)
node -e "const v=+process.versions.node.split('.')[0];if(v!==22&&v!==24){console.error('Se requiere Node.js 22 o 24 x64');process.exit(1)}if(process.arch!=='x64'){console.error('Usa Node.js x64');process.exit(1)}"
if errorlevel 1 (
 pause
 exit /b 1
)
node -e "const p=require('./package.json');for(const n of ['express','better-sqlite3'])if(require(n+'/package.json').version!==p.dependencies[n])process.exit(1);require('better-sqlite3')(':memory:').close()" >nul 2>nul
if errorlevel 1 (
 echo Instalando dependencias. Se necesita Internet solo para esta instalacion.
 call npm ci --omit=dev --no-audit --no-fund
 if errorlevel 1 (
  echo No se pudo instalar. No se modificaron datos del estacionamiento.
  pause
  exit /b 1
 )
)
echo Datos: %%LOCALAPPDATA%%\ParkingPOS. Cierra con Ctrl+C antes de apagar.
echo Abre http://127.0.0.1:3785 cuando aparezca Parking POS.
start "" powershell.exe -NoProfile -WindowStyle Hidden -Command "for($i=0;$i -lt 60;$i++){try{$r=Invoke-RestMethod -Uri 'http://127.0.0.1:3785/api/health' -TimeoutSec 1;if($r.ok){Start-Process 'http://127.0.0.1:3785';break}}catch{};Start-Sleep -Seconds 1}"
node server.js
if errorlevel 1 echo El servidor no pudo iniciar. Revisa el mensaje anterior.
pause
