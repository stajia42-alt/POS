@echo off
setlocal
cd /d "%~dp0"
title Restaurante - Instalacion Cliente Fijo
net session >nul 2>&1
if errorlevel 1 (
  echo Solicitando permisos de administrador...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0INSTALAR_CLIENTE_FIJO.ps1"
echo.
pause
