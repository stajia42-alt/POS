@echo off
setlocal
cd /d "%~dp0"
title Prueba de Parking POS Desktop
where node >nul 2>nul
if errorlevel 1 (
 echo Necesitas Node.js 24 x64 en esta PC de DESARROLLO.
 pause
 exit /b 1
)
call npm ci --include=dev --no-audit --no-fund
if errorlevel 1 goto :fail
echo Preparando SQLite para la version exacta de Electron...
call npm run desktop
if errorlevel 1 goto :fail
exit /b 0
:fail
echo No se pudo arrancar la aplicacion de pruebas.
pause
exit /b 1
