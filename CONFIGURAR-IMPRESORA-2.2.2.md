# Tickets y comandas por IP — AVILES POS 2.2.2

Esta versión añade conexión directa ESC/POS por TCP/IP para la impresora de 80 mm que el usuario ya utiliza por IP desde Loyverse. No usa el controlador Xprinter de Windows para enviar desde Android. La compatibilidad con el modelo físico y su salida de papel quedan pendientes de la prueba del usuario.

## Conectar

1. Instala el APK de pruebas sobre AVILES POS PRUEBAS. Conserva su PIN y datos. La instalación original 2.1 tiene datos separados y no se sustituye con esta variante.
2. Abre **Menú → Impresoras → Agregar impresora**.
3. Escribe un nombre y la **misma dirección IP** que utilizas en Loyverse. Puerto **9100**, salvo que tu configuración use otro. Selecciona **80 mm**.
4. Marca **Imprimir tickets al cobrar** para la impresora de caja. Marca **Imprimir comandas** si también recibe pedidos. Una misma impresora puede hacer ambas funciones.
5. Guarda y pulsa **Imprimir prueba**. La hoja debe mostrar nombre, ancho y caracteres españoles. La tableta y la impresora deben poder comunicarse en la misma red.

Para cocina y bar con impresoras distintas, agrega cada IP y selecciona sus categorías de productos. **Todos los productos** envía la comanda completa a esa impresora. Si desmarcas esa opción debes elegir categorías. Las áreas del salón y las mesas siguen independientes de este reparto.

## Operación

- Al **cobrar**, se guardan la venta y su ticket para impresión; también se ponen en cola los cambios de cocina todavía pendientes. La conexión se realiza después del commit, fuera del cobro.
- Al **guardar** una cuenta, se ponen en cola sus cambios de cocina.
- **Enviar comanda** permite enviar antes de guardar o cobrar. Volver a tocarlo sin cambiar la cuenta no genera otra comanda.
- Agregar cantidad envía solo la diferencia. Reducir o retirar artículos genera **CANCELAR**. Cambiar las notas de un artículo cancela su versión anterior y agrega la nueva.
- El cambio de mesa, mesero o nota general se avisa en el siguiente envío/guardado/cobro como actualización sin repetir preparación. Al unir cuentas se conservan los identificadores de líneas y su historial de envío.
- El recibo muestra **Imprimir ticket**, **Reimprimir ticket** o **Revisar impresión** según su estado. Las copias requieren permiso para reimprimir y se identifican como **COPIA**.

## Estados y problemas de conexión

**En cola**: guardado en SQLite. **Enviando**: conexión activa. **Enviado**: todos los bytes se entregaron a la conexión, sin confirmar físicamente papel o preparación. **Sin conexión**: falló antes de intentar escribir. **Revisar papel**: se interrumpió el envío o la app se cerró durante él.

Un fallo bloquea los documentos posteriores de esa impresora para conservar el orden. Las otras impresoras pueden continuar. El registro mantiene visibles los fallos antiguos aunque haya más de cien documentos recientes.

- Si no llegó a enviarse, revisa IP, puerto, encendido y red; entra en **Revisar envío → Reintentar envío**.
- Si no se sabe si salió, revisa primero el papel. Confirma que ya salió o solicita una copia. Una copia de un envío incierto ocupa su lugar en la cola para no dejar una cancelación por delante de su pedido.
- No hay reintento automático de fallos ni envíos inciertos. El flujo evita repeticiones automáticas; una conexión ESC/POS sin respuesta de aplicación no permite garantizar físicamente una sola hoja.
- Comprueba que otra app no mantenga ocupada la conexión si la impresora solo admite un cliente.
- Si no corta el papel, desactiva **Cortar papel al terminar**. Si los caracteres españoles no salen bien, conserva la hoja de prueba para comprobar el perfil ESC/POS/codepage del modelo; esta entrega usa PC850 (`ESC t 2`).

Cambiar una IP o desactivar una impresora afecta nuevas impresiones. Los documentos ya guardados conservan su destino y contenido para no redirigir accidentalmente pedidos a otra cocina. Verifica los pendientes antes de cambiar de equipo.

## Conservación y alcance

Esquema SQLite 6, añadido mediante migración desde el 5 sin reiniciar datos. Configuración, rutas, documentos, estados e historial de cocina forman parte del respaldo completo. Restaurar un respaldo conserva los envíos pendientes para revisión, sin volver a imprimirlos automáticamente. La restauración se bloquea mientras existe un envío en tránsito.

Formato 48 columnas en papel de 80 mm y 32 en 58 mm; texto CP850, alimentación y corte parcial opcional. Incluye notas, mesa, mesero, pagos MXN/USD y cambio real. No añade logotipos, apertura de cajón, Bluetooth ni USB. La versión web permite verificar los documentos y la cola, pero el envío TCP funciona en la app Android.

Las pruebas de TCP local comprueban bytes, desconexiones y plazos; no sustituyen una impresión en la impresora del usuario. Las capturas y datos de prueba no se precargan en el negocio.
