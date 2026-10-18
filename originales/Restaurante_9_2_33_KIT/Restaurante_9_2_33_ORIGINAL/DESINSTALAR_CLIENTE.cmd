@echo off
setlocal
net session >nul 2>&1
if errorlevel 1 (
 powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
 exit /b
)
set "DEST=%ProgramData%\Restaurante"
set "STARTUP=%ProgramData%\Microsoft\Windows\Start Menu\Programs\StartUp"
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Process Restaurante -ErrorAction SilentlyContinue | Stop-Process -Force"
del /Q "%STARTUP%\Restaurante.vbs" >nul 2>&1
echo.
echo Restaurante fue retirado del inicio automatico. Cloudflare se conserva.
echo La carpeta %DEST% se conserva para diagnostico y puede borrarse manualmente.
pause
