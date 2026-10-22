@echo off
setlocal
cd /d "%~dp0"
echo Instala las dependencias de pruebas y Chromium. Requiere Internet.
call npm ci --include=dev --no-audit --no-fund
if errorlevel 1 (pause & exit /b 1)
call npx playwright install chromium
if errorlevel 1 (pause & exit /b 1)
call npm run test:ui
set "PARKING_TEST_RESULT=%errorlevel%"
pause
exit /b %PARKING_TEST_RESULT%
