@echo off
setlocal
set "DEST=%ProgramData%\Restaurante"
echo ===============================================
echo       RESTAURANTE - ESTADO DEL CLIENTE
echo ===============================================
echo.
if exist "%DEST%\cliente.txt" type "%DEST%\cliente.txt"
echo.
powershell -NoProfile -Command "$ok=$false; try{$r=Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:3000' -TimeoutSec 2; if($r.StatusCode -ge 200){$ok=$true}}catch{}; if($ok){'Restaurante local: OK'}else{'Restaurante local: NO RESPONDE'}; $s=Get-Service cloudflared -ErrorAction SilentlyContinue; if($s){'Cloudflare servicio: '+$s.Status}else{'Cloudflare servicio: NO ENCONTRADO'}"
echo.
pause
