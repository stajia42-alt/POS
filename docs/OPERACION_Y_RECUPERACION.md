# Operación y recuperación — RC13

Para la operación diaria y el corte, usa [CORTE_POR_TURNO.md](CORTE_POR_TURNO.md). Para instalar y actualizar, usa [INSTALACION.md](INSTALACION.md). Las instrucciones de versiones anteriores se conservan dentro de `antecedentes`; no se usan para esta entrega.

## Respaldos

La aplicación instalada usa `%LOCALAPPDATA%\ParkingPOS`. Se crea un respaldo consistente al iniciar y cada hora, dentro de `backups`. Se conservan los 48 automáticos más recientes; los manuales y previos a migración no se purgan automáticamente. Copia respaldos verificados a otro disco.

Desde Administración, el administrador puede crear un respaldo manual. Para copiar toda la carpeta de datos o actualizar, detén la aplicación primero; no copies solo `parking.db` en caliente ignorando sus archivos WAL/SHM.

## Restauración normal

Cierra el turno, entra en Administración, selecciona el respaldo y confirma la restauración con tu PIN/contraseña y la palabra `RESTAURAR`. La aplicación bloquea operaciones y solicita reinicio. Se valida integridad y conservación del historial antes de sustituir archivos; se conserva la base desplazada. Vuelve a iniciar sesión después.

Un respaldo anterior que perdería o cambiaría registros de una base sana se rechaza, incluidas pensiones y entregas entre turnos. No se restaura una base vieja para esconder diferencias de efectivo.

## Si la base está dañada

Con la aplicación detenida, ejecuta `RECUPERAR_WINDOWS.cmd`, indica el respaldo y confirma `RECUPERAR`. La herramienta valida el respaldo y archiva los archivos actuales en `recovery-archive`. Si falla colocar el archivo recuperado, intenta recuperar los archivos que había desplazado. Conserva el mensaje de error y todos los archivos originales si se necesita ayuda.

Si la base original está sana, no permite perder históricos. Si está dañada, puede ser necesario conciliar los movimientos posteriores al respaldo: la herramienta no promete reconstruir operaciones que no estén en él.

El **restablecimiento de fábrica elimina datos**; no se usa para recuperar información, actualizar el programa, cerrar un turno ni corregir un faltante.

## Desarrollo y pruebas

Ejecuta las pruebas con `npm ci` y `npm test`. `npm run test:ui` usa un navegador instalado; en Linux detecta `/usr/bin/chromium`, o puedes indicar `PARKING_CHROMIUM`. Los fixtures crean sus propias bases temporales.

`npm run desktop` prepara el módulo SQLite para Electron antes de abrir la ventana. Después de usar Electron en el mismo árbol, ejecuta de nuevo `npm ci` para volver a las dependencias nativas de Node antes de probar el servidor por separado. El cliente con el instalador no necesita estos pasos.
