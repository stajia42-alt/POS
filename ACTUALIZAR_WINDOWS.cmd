@echo off
setlocal
cd /d "%~dp0"
title Actualizar Parking POS conservando datos
if exist "%~dp0update-windows.ps1" (
 powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0update-windows.ps1" %*
) else (
 powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\update-windows.ps1" -ManifestPath "%~dp0INSTALADOR_WINDOWS\ACTUALIZADOR\manifest.json" -PayloadDir "%~dp0INSTALADOR_WINDOWS\win-unpacked" %*
)
set "RESULT=%ERRORLEVEL%"
echo.
if not "%RESULT%"=="0" echo No desinstales Parking POS ni borres su base de datos.
pause
exit /b %RESULT%
