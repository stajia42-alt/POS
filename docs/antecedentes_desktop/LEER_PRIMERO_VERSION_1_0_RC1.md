# Parking POS 1.0 RC1 — Candidato a liberación (80 mm)

**Esta es una versión candidata para pruebas en Windows. No se declara apta para operación comercial hasta completar las verificaciones físicas y las pruebas integrales.**

## Qué se corrigió o agregó

1. **Entrada e impresión automática**: mantiene el registro atómico de un folio único y su hora; si `Imprimir automáticamente` está activado y la impresora está configurada, envía ESC/POS RAW sin diálogo. El resultado del intento (enviado/fallo) se guarda para auditoría. Si la impresora falla, **no genera un nuevo folio**: muestra advertencia y permite reimprimir el mismo.
2. **Ticket térmico de 80 mm**: corregidos los saltos de línea, folio en grande, logo opcional, fecha/hora de Tijuana, CODE128-B escaneable, políticas y sección desprendible. La cuchilla se usa solo si el equipo la admite.
3. **Vista previa sin impresora**: en **Impresora → Vista previa de 80 mm**. También disponible al registrar una entrada. La vista previa genera un código CODE128 real y utiliza el mismo folio que se escaneará; es orientativa respecto a proporciones, logos y tipografías físicas.
4. **Salida**: al escanear el código de barras (escáner USB tipo teclado, generalmente con sufijo Enter), busca el mismo folio, calcula el importe en MXN, admite recibir MXN o USD con cambio en pesos y **no confunde “pagado” con “salida confirmada”**. Se respeta la tolerancia configurada.
5. **Clientes y convenios**: permite elegir un convenio al registrar entrada o introducir un código de cliente. **La placa no es obligatoria**. Los convenios y tarifas quedan copiados al ticket en el momento de la entrada. Los vehículos exentos requieren usuario supervisor/administrador para selección manual.
6. **Arqueo opcional por denominaciones**: en Corte Z, pueden capturarse billetes/monedas MXN y USD; los totales se vuelcan al cierre y el desglose se conserva. Sigue permitiéndose la captura manual tradicional.
7. **Migración no destructiva de SQLite**: migración 003 agrega códigos de cliente, copia de configuración de impresión por ticket, intentos de impresión y desglose de arqueo; no reemplaza cobros, tickets, turnos ni tarifas históricas.

## Configuración e instalación

- Usa **Windows 10/11 x64** y **Node.js 22 o 24 x64**. Descomprime el ZIP completo en una carpeta nueva. Ejecuta `INICIAR_WINDOWS.cmd`.
- Al abrir por primera vez, crea el administrador y abre la caja. Para probar con datos reales de Libra 3, configura los rangos: `60,50; 120,70; 360,100; 720,130; 1440,200`, adicionales cada 720 min de $200, boleto perdido $200; verifica manualmente antes de guardar.
- En **Impresora**, elige el nombre EXACTO de la cola Windows para tu impresora térmica ESC/POS 80 mm; activa impresión automática y prueba. Si el nombre de la impresora no existe o no se selecciona, el ticket se registra y muestra alerta de no impresión.
- El **logotipo es configurable**: carga el PNG/JPG del estacionamiento desde la sección Impresora. El ZIP incluye una fotografía de referencia del logo, pero no modifica automáticamente la configuración de un cliente.
- Las **políticas del ticket son editables** y deben revisarse antes de imprimir, especialmente las cláusulas de responsabilidad y retención. No se imponen textos legales universalmente.
- Al cobrar: coloca el cursor en **Cobrar salida**, escanea el código impreso; el lector debe actuar como teclado, preferentemente agregando Enter. El folio se busca; en la ventana se calcula importe, recibido y cambio. Confirmar salida es una acción distinta.
- Las bases de datos se almacenan, de forma predeterminada, en `%LOCALAPPDATA%\ParkingPOS\parking.db` y backups en la subcarpeta `backups`. **No copies ni sobrescribas esa carpeta entre versiones sin un respaldo.** Las versiones anteriores no deben abrir una base migrada a esquema 3.

## Pruebas locales realizadas en este entorno

- `node --check`: servidor, módulos y scripts UI sin errores sintácticos.
- `node --test test/ticket-escpos.test.js test/release-unit.test.js`: 20 pruebas superadas, incluyendo código de barras, límites de Libra 3, saltos de línea, verificación de HTML/JS y migración 003 en SQLite integrado.
- Se generó `docs/Vista_ticket_80mm_RC1.png` como representación del comando ESC/POS con datos de ejemplo; la fecha, folio, logo y políticas ilustrados no son los ajustes reales guardados de un cliente.

## Limitaciones y pruebas obligatorias en Windows

- **No fue posible instalar todas las dependencias de Node.js desde este entorno**, así que no se pudo ejecutar la suite completa `test/operations.test.js` ni las pruebas de navegador integradas; tampoco se probó el hardware. `npm ci` en Windows con acceso a Internet instala las dependencias fijadas en `package-lock.json`.
- El envío correcto al spooler de Windows **no confirma que la impresora haya expulsado físicamente el papel**. Validar ancho real, calidad de logotipo, CODE128 con el lector, corte de papel, recuperación de desconexión y funcionamiento tras reinicio.
- El escáner debe coincidir con la interpretación de teclado del PC. Verificar que un solo escaneo abra el folio correcto y que no se duplique un cobro.
- Probar un turno simulado completo MXN/USD con retiros, devoluciones, boleto perdido, descuentos y arqueo; ejecutar `PROBAR_WINDOWS.cmd` en una copia del proyecto. No operar dinero real antes de estas pruebas.

## Seguridad de datos

El sistema continúa local, enlazado a `127.0.0.1` por defecto. Usa usuarios y sesiones. Los cobros tienen protecciones contra duplicación. Los registros anteriores se conservan en las migraciones, pero haz copia de tu carpeta de datos antes de instalar. No usar el ZIP como sustituto de una licencia fiscal o cumplimiento legal.
