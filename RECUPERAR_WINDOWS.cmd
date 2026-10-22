@echo off
setlocal
cd /d "%~dp0"
echo Primero cierra la ventana del servidor Parking POS.
echo Conserva la carpeta completa de datos antes de continuar.
node -e "require('better-sqlite3')(':memory:').close()" >nul 2>nul
if errorlevel 1 (
 call npm ci --omit=dev --no-audit --no-fund
 if errorlevel 1 (pause & exit /b 1)
)
node scripts/recover.js
set "PARKING_RECOVERY_RESULT=%errorlevel%"
pause
exit /b %PARKING_RECOVERY_RESULT%
