@echo off
setlocal
cd /d "%~dp0"
echo Pruebas con bases TEMPORALES. No usan la caja real.
node -e "require('express');require('better-sqlite3')(':memory:').close()" >nul 2>nul
if errorlevel 1 (
 call npm ci --omit=dev --no-audit --no-fund
 if errorlevel 1 (pause & exit /b 1)
)
call npm test
set "PARKING_TEST_RESULT=%errorlevel%"
pause
exit /b %PARKING_TEST_RESULT%
