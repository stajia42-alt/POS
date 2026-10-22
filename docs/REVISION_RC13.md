# Revisión y entrega RC13 — 1.0.11

Proyecto recibido: `ParkingPOS_RC12_COMPLETO_PARA_CHATGPT_WORK.zip`. Se trabajó sobre sus módulos existentes; se conservó la interfaz oscura y el formato SQLite versión 9. Los archivos anteriores se conservaron como antecedentes, sin mezclar un `app.asar` RC12 con esta entrega.

## Pendientes del cliente y correcciones

| Problema encontrado | Comportamiento de esta entrega |
| --- | --- |
| El cobro solo ofrecía un botón manual para imprimir | Después de guardar pago y salida, envía automáticamente el comprobante. Un error de impresión se informa como pago guardado y permite reintentar solo el papel. |
| Marcar boleto perdido agregaba cargo pero no imprimía | Imprime una constancia con folio y hora originales, cargo y estado pendiente. El pago posterior genera su propio comprobante. |
| La pantalla principal mostraba ventas del día calendario | Muestra ventas y operaciones del turno abierto. Cruzar medianoche no reinicia ni cierra caja; abrir otro turno comienza en cero. |
| Cerrar Noche exigía liquidar todas las entregas al Día, incluso con USD | La conciliación pendiente queda visible, sin bloquear el conteo y cierre real de cada moneda. Registrar una entrega física sigue siendo un retiro, sin duplicar venta. |
| Apertura simplificada sin captura de fondo USD o cambio inicial | Permite fondo MXN, fondo USD y tipo de cambio hasta cuatro decimales. Sugiere el tipo anterior sin arrastrar fondos. |
| Reimprimir entrada estaba disponible sin comprobar rol | Exige administrador o su autorización por operación, motivo y auditoría. Imprime una copia marcada, sin otra entrada ni venta; el cajero conserva su sesión. |
| Cajón enviaba 8 bytes válidos, pero PowerShell rechazaba menos de 10 | Ambos controladores aceptan el pulso ESC/POS válido. La apertura física requiere prueba en la PC e impresora del cliente. |
| Restauración buscaba pensiones por una clave inexistente y omitía entregas entre turnos | Consulta las claves reales de SQLite y verifica también `shift_settlements`; bloquea pérdida o alteración de esos registros. |
| Recuperación podía dejar sin base activa si fallaba el último cambio de archivo | Revierte el desplazamiento y conserva los originales. Se probó con un fallo de disco simulado. |
| Carreras al reiniciar/cerrar el proceso de impresión | Un proceso antiguo ya no termina trabajos del nuevo. El cierre respeta los trabajos en curso antes de cerrar SQLite. |
| Prueba de navegador e instrucciones describían botones X/Z y salida manual antiguos | El recorrido funcional usa la interfaz actual y la guía describe exclusivamente Día/Noche y salida al confirmar pago. |

Los importes y conversiones siguen guardándose en centavos y con el tipo de cambio del cobro. Se mantuvieron las tarifas congeladas al entrar, pensiones semanales personalizadas, abonos y adeudos anteriores. No se introdujeron contraseñas predeterminadas: se admiten PIN desde cuatro caracteres y siguen funcionando las claves existentes.

## Validación realizada

Se ejecutó la suite original antes de modificar: **99 pruebas aprobadas**. Se añadieron regresiones de caja, impresión, interfaz, actualización y conservación de datos. El recuento final y salida de la ejecución están en [resultados](RESULTADOS_PRUEBAS_RC13.txt) y `ESTADO_CONSTRUCCION.json`.

- SQLite real y bases temporales: cobros, reintentos, cancelaciones, divisas, cambio, movimientos, arqueo, cierres, herencia de vehículos, migraciones, pensiones, adeudos y respaldos/restauración.
- Chromium real: administrador con PIN, apertura Día, entrada sin placa, escaneo mediante teclado, cobros MXN/USD, boleto perdido, cruce de medianoche, corte con diferencia, apertura Noche sin ventas anteriores, cobro heredado, creación de cajero, respaldo, autorización de reimpresión, fallo de impresora y reintento sin recobro.
- Se generan los bytes reales ESC/POS en las pruebas; el spool de Windows y el cajón se sustituyen por adaptadores para contar envíos y simular fallos. Esto no demuestra impresión física ni lectura óptica del código de barras.
- PowerShell oficial con checksum verificado: el analizador aceptó el actualizador; su lector ASAR identificó el paquete RC12 y rechazó una aplicación distinta. No se ejecutó una sustitución de instalación Windows real.
- Reinstalación reproducible con `npm ci`, inicio del servidor y peticiones funcionales de salud, estado inicial y página principal.

El recorrido de navegador anterior no era ejecutable contra esta interfaz; se sustituyó por un recorrido que verifica el comportamiento actual y los saldos exactos esperados.

## Instalador y actualizador

**Este paquete contiene fuentes, no un `.exe` ya construido ni un nuevo `app.asar`.** Se intentó fabricar el instalador en Linux: falló por compilación cruzada de SQLite. También se comprobó la alternativa precompilada para Electron 44.7.0/ABI 149 y Windows x64; el artefacto oficial de better-sqlite3 12.11.1 respondió 404. Se conservaron las versiones fijadas y no se desactivaron verificaciones para forzar el resultado.

`CREAR_INSTALADOR_WINDOWS.cmd` reinstala desde el lockfile, ejecuta pruebas y construye la distribución completa en Windows. `scripts/build-update.js` genera el actualizador únicamente después de disponer de esa distribución, comprobando identidad, versión, inventario y binarios x64. Sustituir únicamente un ASAR sobre otro runtime puede mezclar versiones de SQLite/Electron; por eso el actualizador usa la distribución completa, respalda y dispone de reversión.

Consulta [instalación](INSTALACION.md) antes de llevarlo al cliente. La compilación, instalación/actualización en Windows 10/11 y la prueba física de impresora, escáner y cajón están pendientes.

## Límites de esta revisión

- No se recibió la base del cliente ni acceso a su PC. No se conciliaron diferencias históricas ni se modificaron sus cobros. La guía explica cómo cerrar con el conteo real y abrir el siguiente turno con el fondo correcto.
- Una entrega pendiente al Día puede conservarse al cerrar Noche. El botón de entrega solo actúa mientras está abierto el turno nocturno que cobró; una entrega posterior al cierre se concilia por separado con el responsable. No se añadió liquidación retrospectiva ni se alteran cortes cerrados.
- El restablecimiento de fábrica existente es destructivo y requiere confirmación expresa. No se utilizó ni es parte del procedimiento de actualización o cierre de caja. Las pruebas de esa función operan únicamente en bases temporales.
- No se ejecutaron todos los botones con periféricos físicos ni se certifica una instalación comercial. Se distinguen en los resultados los recorridos de navegador, pruebas de API/SQLite y simulaciones de hardware.

El procedimiento para el operador está en [Corte de caja y cierre por turno](CORTE_POR_TURNO.md).
