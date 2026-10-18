@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Restaurante V9.2 - Compilador RC1

echo.
echo ===============================================
echo       RESTAURANTE V9.2 - COMPILACION RC1 - VALIDACION
echo ===============================================
echo.

node preparar_interfaz.js
if errorlevel 1 goto error

echo [1/4] Instalando compilador...
call npm ci
if errorlevel 1 goto error

if not exist "node_modules\.bin\pkg.cmd" (
  echo ERROR: No se encontro pkg.
  goto error
)

if exist dist (
  echo Ya existe dist. Renombra esa carpeta para conservar la compilacion anterior.
  goto error
)
mkdir dist
mkdir dist\runtime

echo [2/4] Preparando dependencias externas...
copy /Y package.json "dist\runtime\package.json" >nul
copy /Y package-lock.json "dist\runtime\package-lock.json" >nul
call npm ci --omit=dev --prefix "dist\runtime"
if errorlevel 1 goto error

> "dist\runtime\loader.js" echo // Restaurante runtime loader

echo [3/4] Creando Restaurante.exe...
call "node_modules\.bin\pkg.cmd" app.js --config package.json --targets node24-win-x64 --output "dist\Restaurante.exe"
if errorlevel 1 goto error

if not exist "dist\Restaurante.exe" goto error
if not exist "dist\runtime\node_modules\mssql\package.json" goto error
if not exist "dist\runtime\node_modules\express\package.json" goto error
if not exist "dist\runtime\node_modules\exceljs\package.json" goto error
copy /Y ABRIR_COMPILADA.cmd "dist\ABRIR_RESTAURANTE.cmd" >nul
copy /Y ocr_local.py "dist\ocr_local.py" >nul
copy /Y menu_colores_detector.py "dist\menu_colores_detector.py" >nul
if errorlevel 1 goto error
copy /Y INSTALAR_OCR_GRATIS.cmd "dist\INSTALAR_OCR_GRATIS.cmd" >nul
copy /Y DIAGNOSTICO_MENU_SOLO_LECTURA.sql "dist\DIAGNOSTICO_MENU_SOLO_LECTURA.sql" >nul
if not exist "dist\runtime\node_modules\@typespec\ts-http-runtime\dist\commonjs\logger\internal.js" (
  echo ADVERTENCIA: No aparece internal.js de TypeSpec. Revisando paquete completo...
  if not exist "dist\runtime\node_modules\@typespec\ts-http-runtime" goto error
)

echo [4/4] Verificacion terminada.
echo.
echo ===============================================
echo       LISTO: dist\Restaurante.exe
echo ===============================================
echo.
echo IMPORTANTE: NO muevas solo el EXE.
echo La carpeta dist completa es la aplicacion: Restaurante.exe + runtime.
echo.
echo Abre dist\ABRIR_RESTAURANTE.cmd y visita http://127.0.0.1:3000
echo Si el acceso remoto ya funciona, no necesitas reinstalarlo.
echo.
pause
exit /b 0

:error
echo.
echo ===============================================
echo        ERROR: NO SE PUDO COMPILAR
 echo ===============================================
echo No ejecutes el instalador de cliente.
echo.
pause
exit /b 1
