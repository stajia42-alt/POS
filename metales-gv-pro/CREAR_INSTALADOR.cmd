@echo off
cd /d "%~dp0"
call npm ci
if errorlevel 1 exit /b %errorlevel%
call npm run check
if errorlevel 1 exit /b %errorlevel%
call npm test
if errorlevel 1 exit /b %errorlevel%
call npm run build:win
if errorlevel 1 exit /b %errorlevel%
echo Instalador disponible en dist.
pause
