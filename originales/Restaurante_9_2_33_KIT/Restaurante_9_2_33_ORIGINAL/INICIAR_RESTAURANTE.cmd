@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Restaurante 9.2 - Inicio y diagnostico
where node >nul 2>&1
if errorlevel 1 (
  echo Falta Node.js. Instala Node.js 24 LTS para Windows de 64 bits y vuelve a abrir este archivo.
  pause
  exit /b 1
)
node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 24 ? 0 : 1)"
if errorlevel 1 (
  echo Necesitas actualizar Node.js a la version 24 LTS o posterior.
  pause
  exit /b 1
)
if not exist "node_modules\exceljs\package.json" (
  call npm ci --omit=dev --no-audit --no-fund
  if errorlevel 1 goto error
)
node --check app.js
if errorlevel 1 goto error
echo Abre http://127.0.0.1:3000 en el navegador.
echo Para SQL: http://127.0.0.1:3000/configuracion
echo No cierres esta ventana mientras uses la aplicacion.
node iniciar.js
if errorlevel 1 goto error
exit /b 0
:error
echo.
echo La aplicacion se ha detenido. Copia o toma foto del mensaje anterior.
pause
