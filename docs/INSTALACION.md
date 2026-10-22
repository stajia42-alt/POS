# Instalación y actualización RC13

La carpeta de trabajo conserva el sistema RC12 y sus módulos. Esta entrega requiere construir el instalador antes de instalarlo en el estacionamiento. El código fuente no es un instalador. Windows 10/11 x64 e impresora/cajón reales necesitan una comprobación local.

## Fabricar en una PC Windows x64

1. Instala Node.js 22 o 24 x64 y, si la compilación nativa lo solicita, Visual Studio Build Tools con C++.
2. Ejecuta `CREAR_INSTALADOR_WINDOWS.cmd`. La primera construcción necesita Internet; usa las versiones exactas de `package-lock.json`, ejecuta las pruebas y construye Electron + SQLite nativo.
3. Si termina sin errores, `INSTALADOR_WINDOWS` contendrá `ParkingPOS_Setup_1.0.11_x64.exe`, `win-unpacked` y `ACTUALIZADOR`. El manifiesto del actualizador se genera únicamente después de construir la distribución completa. No se incluye ningún `app.asar` antiguo como si fuera RC13.
4. Para una instalación nueva, copia el `.exe` a USB y ejecútalo. El cliente no necesita instalar Node.js y la aplicación trabaja sin Internet.

## Actualizar el cliente conservando sus datos

1. Finaliza las operaciones en curso y cierra Parking POS, incluido cualquier servidor de desarrollo. **No desinstales ni borres la carpeta de datos.**
2. Copia a USB las carpetas `ACTUALIZADOR` y `win-unpacked`, juntas, con su contenido completo. No basta con copiar `app.asar`.
3. Ejecuta `ACTUALIZADOR\ACTUALIZAR_WINDOWS.cmd`. Detecta una única instalación compatible por su identidad interna; no depende de una lista de hashes antiguos. Bloquea retrocesos, archivos dañados, enlaces y aplicaciones distintas.
4. Antes de sustituir el programa, verifica un respaldo de la instalación anterior y de `parking.db`, `parking.db-wal`, `parking.db-shm` cuando existan. Los conserva en `%LOCALAPPDATA%\ParkingPOS\Respaldos_Actualizaciones`. No copia una base de datos del paquete sobre los datos del cliente.
5. Se sustituyen juntos Electron, SQLite nativo, código y controladores de impresión; conserva los archivos de desinstalación. Si falla colocar el nuevo programa, intenta restaurar automáticamente el programa anterior y muestra cualquier ubicación que necesite recuperación manual.
6. Abre Parking POS. Las migraciones guardan un respaldo previo cuando hay cambios de esquema. Comprueba usuario, tarifas, impresora, entradas pendientes y saldo del turno. Prueba una entrada, cobro e impresión controlados antes de usar dinero real.

Si hay varias instalaciones o una ruta personalizada, usa PowerShell:

```powershell
.\ACTUALIZADOR\update-windows.ps1 -InstallDir 'C:\ruta\Parking POS'
```

El actualizador no eleva permisos automáticamente. Si Windows rechaza acceso a una instalación de `Program Files`, pide al administrador de esa PC que lo ejecute con los permisos adecuados. No desactives verificaciones ni reemplaces archivos manualmente para saltar el error.

Los hashes comprueban la integridad del paquete, no una firma editorial. Usa únicamente el paquete construido y entregado por el responsable del sistema.

## Datos y recuperación

Los datos instalados siguen en `%LOCALAPPDATA%\ParkingPOS`. Actualizar no crea otra base vacía ni cambia los históricos. Los respaldos automáticos están en `backups`.

No vuelvas a ejecutar una versión anterior contra una base ya migrada. Ante un error, conserva **toda** la carpeta de datos y el respaldo anterior; no copies un SQLite viejo sobre uno actual sin conciliación. La herramienta `RECUPERAR_WINDOWS.cmd` exige cerrar la aplicación, conserva originales en `recovery-archive` y bloquea restaurar un respaldo que quite históricos de una base sana. Si falla colocar el archivo recuperado, restaura los originales que ya había desplazado.

Una base dañada puede necesitar conciliación manual de movimientos posteriores al respaldo. El restablecimiento de fábrica es una eliminación deliberada; no se usa para actualizar, reparar diferencias de caja ni cambiar de turno.

## Alcance de comprobación

Las pruebas automatizadas comprueban identificación ASAR, versión, inventario, exclusión de bases de cliente y recuperación ante un fallo simulado de disco. Ejecutar el actualizador PowerShell, instalar/desinstalar y confirmar impresión física/cajón requieren Windows y hardware reales. Haber generado un manifiesto o pasar pruebas de JavaScript no demuestra esos resultados físicos.
