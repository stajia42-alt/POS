# Parking POS RC6 - Seguimiento, copia breve y cajon automatico

PARKING POS Desktop 1.0.4 RC6 - ACTUALIZACION PARA PC DEL CLIENTE

1. Cierra Parking POS por completo (no solo minimices).
2. Respalda %LOCALAPPDATA%\ParkingPOS en USB u otra unidad.
3. Extrae este ZIP y ejecuta 1_ACTUALIZAR_PC_CLIENTE.cmd.
4. Abre Parking POS como normalmente.
5. Ve a Impresora: verifica seleccionada POS-80 y la casilla
   'Abrir cajon automaticamente cuando se confirme un pago'.
6. Prueba un cobro ficticio y comprueba el cajon conectado RJ11/RJ12 a la impresora.

CAMBIOS
- En Dia puedes revisar el resumen y los folios que entregarás a Noche.
- Al cerrar Dia se guarda una lista inmutable de esos folios.
- Durante Noche cambia su estado a PAGADO NOCHE o SIGUE DENTRO.
- Al volver a abrir Dia ves folio por folio como quedó el turno anterior.
- El reporte de corte de 80 mm muestra los folios heredados y su situación.
- Imprime ORIGINAL PARA EL CLIENTE + COPIA DEL ESTACIONAMIENTO corta,
  ambos con folio, hora y mismo codigo CODE128.
- Si hay impresora configurada, el cajon se abre al confirmar pago real.
- No se abre en una consulta, escaneo, pago duplicado ni reintento repetido.
- Si falla el cajon, el cobro se conserva y la pantalla avisa.
- En ajustes de impresión puedes activar/desactivar el pulso y elegir pin.

RECOMENDACIONES Y LIMITACIONES
- Este ZIP NO es un nuevo instalador .EXE; actualiza una instalacion previa compatible.
- No elimina tickets ni pagos. Primera apertura migra SQLite a version 5.
- La actualizacion crea respaldo del CODIGO y archivos de DB antes de migrar.
- Para deshacer también la migración tendrás que restaurar la BD anterior
  tras guardar las operaciones nuevas por separado; no pierdas movimientos.
- El cajon debe estar conectado a la IMPRESORA, no al puerto telefonico de la PC.
- Abrir el cajon se envia como ESC p por la cola RAW; depende del modelo ESC/POS.
- Las confirmaciones de cola no prueban salida en papel ni apertura fisica.
- Requiere probar en Windows del cliente con impresora/cajon/escáner reales.
- No se incluye SQLite, usuarios, ni datos del estacionamiento en el ZIP.
