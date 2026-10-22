# Instrucciones breves de operación y datos

## Instalación y primera prueba

1. Detener la versión anterior con Ctrl+C y cerrar sus ventanas. Copiar completa `%LOCALAPPDATA%\ParkingPOS` a un medio de respaldo, incluyendo archivos WAL/SHM si aparecen. Nunca copiar solo `parking.db` mientras está en uso.
2. Extraer el ZIP en una carpeta nueva. No sobrescribir ni mover la carpeta de datos del perfil de Windows. El servidor usa la misma ruta histórica.
3. Instalar Node.js 24 x64 y ejecutar `INICIAR_WINDOWS.cmd`. La primera vez se instalan las dependencias fijadas en `package-lock.json`; se requiere Internet en ese paso. Después funciona localmente sin Internet.
4. Entrar en `http://127.0.0.1:3785`, crear administrador y guardar su contraseña. No existe contraseña universal. La cuenta de Windows que ejecuta el servidor tiene acceso físico a SQLite y debe estar protegida.
5. Para probar con una copia aislada sin tocar datos reales, abrir CMD dentro del proyecto y ejecutar:

```bat
set "PARKING_DATA_DIR=C:\ParkingPOS_Pruebas"
node server.js
```

Con el servidor anterior detenido, copiar una base de respaldo consistente como `C:\ParkingPOS_Pruebas\parking.db` si se desea ensayar la migración. No usar esa variable para la operación diaria si se desea conservar la ruta original.

## Cobros y salidas

- Abrir caja con los fondos físicos reales de pesos y dólares. El tipo de cambio admite hasta cuatro decimales y es MXN por 1 USD.
- Registrar entrada con placa opcional. Usar placa para aplicar cliente registrado; el sistema impide dos entradas activas de la misma placa.
- Si falla la impresión, **no generar otra entrada**: localizar la ya registrada y reimprimirla.
- Consultar el folio, elegir moneda, introducir lo recibido y confirmar. El cambio se entrega únicamente en pesos; el servidor verifica que haya pesos suficientes.
- Si se corta la conexión, reintentar la misma operación desde la misma pestaña. Su identificador permite recuperar el resultado sin duplicarlo. Para un cobro ya confirmado, consultar nuevamente el folio.
- Pulsar **CONFIRMAR SALIDA** al retirar el vehículo. Si se deja pendiente, sigue ocupando cajón. Vencida la tolerancia, volver a consultar y cobrar el saldo adicional, si existe.
- Para boleto perdido, localizar el vehículo en Vehículos activos por folio/entrada, consultar y marcar **Boleto perdido** antes del primer cobro. No inventar una nueva hora de entrada.
- Para cancelar, consultar el boleto (también disponible desde Historial), capturar motivo y, si opera un cajero, credenciales de supervisor. Si existió pago, entregar exactamente la devolución MXN indicada.

## Tarifas y clientes

- Rangos: `minutos límite,precio MXN`, uno por línea. Son límites inclusivos y precios acumulados. No se permiten límites desordenados ni precios decrecientes.
- Duración adicional configurable: 60 equivale a hora/fracción; 720 a 12 horas/fracción.
- La referencia Libra 3 carga 60=$50, 120=$70, 360=$100, 720=$130, 1440=$200; después $200 por 720 minutos/fracción. Revisar los valores y guardar. Máximo y recargo nocturno son ajustes independientes.
- En configuración avanzada, guardar máximo diario, recargo y horario nocturno, tolerancia, zona horaria y boleto perdido. Este último comienza en $200, pero es configurable.
- Mantener reloj, fecha y zona de Windows correctos. La zona del negocio predeterminada es America/Tijuana; reportes y boletos la usan. Los formularios de vigencia se capturan en la hora de la PC.
- En Clientes y pensiones: nombre, placa, tipo, vigencia, horario y descuento. El horario puede cruzar medianoche. Los exentos tienen vigencia; los frecuentes/convenios usan el porcentaje configurado.
- Las modificaciones aplican a entradas nuevas. Para extensiones de pensión con cobro, usar **Cobrar / renovar** en una caja abierta.

## Caja, impresora y usuarios

- X es una consulta sin cierre. Z registra contado MXN/USD, esperado y diferencias; cierra el turno.
- No sumar dólares convertidos al conteo de pesos. Cada moneda tiene su efectivo esperado.
- Registrar ingresos y retiros con moneda y motivo; requieren supervisor o administrador. No retirar más efectivo del disponible.
- Imprimir X/Z desde el resumen o desde el botón de cada corte anterior. Las reimpresiones no vuelven a cobrar.
- Configurar impresora en Windows por su nombre exacto. El módulo usa RAW ESC/POS de 80 mm, CP850, CODE128 y raster para logotipo. Ver también `PROBAR_BOLETO_80MM.md`.
- Roles: cajero (entradas/cobros/salidas/cortes), supervisor (además tarifas/clientes/movimientos/autorizaciones) y administrador (además usuarios/respaldos/restauración).
- Las sesiones duran 12 horas. Cambiar una contraseña o desactivar un usuario invalida sus sesiones. Un administrador no puede quitarse a sí mismo el acceso administrador.

## Respaldos y restauración

- `backups` está dentro de la carpeta de datos, junto a SQLite. Se crea copia consistente al arrancar y cada hora mientras el servidor esté abierto.
- Se conservan los 48 respaldos automáticos más recientes; los manuales, previos a migración y previos a restauración no se purgan automáticamente. Copiar respaldos verificados a otro disco protege también contra falla del disco local.
- Restauración normal: cerrar caja, Administración > seleccionar respaldo > Restaurar > contraseña y palabra RESTAURAR. La aplicación bloquea operaciones y pide reiniciar el servidor.
- Al reiniciar, vuelve a validar integridad y conservación de históricos, respalda la base actual y cambia los archivos conservando la base desplazada. Se exige volver a iniciar sesión.
- Si el respaldo perdería registros de tickets, pagos, caja, usuarios, clientes, auditoría o reintentos, se rechaza. Es intencional: no se retrocede una base sana eliminando operaciones.
- Recuperación por daño: detener el servidor, ejecutar `RECUPERAR_WINDOWS.cmd`, indicar ruta del respaldo `.db` y escribir RECUPERAR. Verifica que sea una base Parking POS íntegra y que no haya otra instancia. Preserva `parking.db`, WAL, SHM y solicitud pendiente en `recovery-archive` antes de sustituirlos.
- Si la base anterior está sana, también se aplica la protección contra pérdida de históricos. Si está dañada, la nueva base contiene lo existente al momento del respaldo; conservar el archivo dañado para recuperar/conciliar operaciones posteriores. El proceso no promete reconstruir datos que no estén en el respaldo.
- Si hay varios turnos abiertos en una base antigua, la migración se detiene y deja respaldo; requiere conciliación técnica sin borrar turnos. No se elige uno silenciosamente.

## Pruebas incluidas

- `PROBAR_WINDOWS.cmd` o `npm test`: suite de API/SQLite/cálculos/migraciones/ESC-POS en bases temporales.
- `PROBAR_INTERFAZ_WINDOWS.cmd`: instala las dependencias de prueba y Chromium, y ejecuta el recorrido funcional. Requiere Internet para instalar el navegador; no imprime ni usa la caja real.
- Alternativa: `npm ci --include=dev`, `npx playwright install chromium`, `npm run test:ui`.
- `PARKING_CHROMIUM` permite indicar un ejecutable Chromium local compatible. No es necesario para el uso normal del POS.

Los resultados adjuntos corresponden a Linux, Node.js 24.19.0, SQLite real y Chromium. Deben repetirse las comprobaciones de Windows y hardware indicadas en `MEJORAS_Y_VALIDACION.md`.
