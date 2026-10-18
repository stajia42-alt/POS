@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Aviles Tecnologias - Crear instalador de Restaurante 9.2.33
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0installer\build.ps1"
set "RESULTADO=%ERRORLEVEL%"
echo.
if not "%RESULTADO%"=="0" (
  echo NO SE GENERO EL INSTALADOR. Consulta REGISTRO_COMPILACION.txt.
) else (
  echo INSTALADOR CREADO: output\Setup_Restaurante_9.2.33.exe
)
pause
exit /b %RESULTADO%
