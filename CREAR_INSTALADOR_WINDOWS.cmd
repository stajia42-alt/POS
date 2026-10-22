@echo off
setlocal
cd /d "%~dp0"
title Construir instalador de Parking POS
where node >nul 2>nul
if errorlevel 1 (
 echo ERROR: Para FABRICAR el instalador hace falta Node.js 22 o 24 x64 en ESTA PC.
 echo Los clientes NO necesitan instalar Node.js.
 pause
 exit /b 1
)
where npm >nul 2>nul
if errorlevel 1 (
 echo ERROR: npm no esta disponible.
 pause
 exit /b 1
)
node -e "const v=+process.versions.node.split('.')[0];if(![22,24].includes(v)||process.arch!=='x64'){console.error('Se requiere Node.js 22 o 24 x64');process.exit(1)}"
if errorlevel 1 goto :fail
echo.
echo ==============================================
echo   PARKING POS - INSTALADOR USB PARA WINDOWS
echo ==============================================
echo.
echo Esta PC necesita Internet durante la PRIMERA compilacion.
echo El instalador resultante funciona SIN Internet.
echo.
echo Paso 1/3: preparar componentes para Windows x64...
call npm ci --include=dev --no-audit --no-fund
if errorlevel 1 goto :fail
echo.
echo Paso 2/3: ejecutar TODAS las pruebas del proyecto...
call npm test
if errorlevel 1 goto :fail
echo.
echo Paso 3/3: empaquetar Windows + SQLite + Electron...
call npm run dist:win
if errorlevel 1 goto :fail
node scripts\build-update.js
if errorlevel 1 goto :fail
echo.
echo INSTALADOR GENERADO: carpeta INSTALADOR_WINDOWS
explorer "%CD%\INSTALADOR_WINDOWS"
echo Copia el archivo ParkingPOS_Setup_*.exe a tu memoria USB.
echo Para actualizar con respaldo, copia TAMBIEN ACTUALIZADOR y win-unpacked completos.
pause
exit /b 0
:fail
echo.
echo ERROR: La compilacion no termino. NO hay instalador verificado.
echo Si falta compilador para better-sqlite3, instala Visual Studio Build Tools C++.
pause
exit /b 1
