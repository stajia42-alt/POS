# Entrega: AVILES POS 1.2

## Implementado

Se conserva la base de la primera entrega de la sección 22 y se amplían los cobros en el mismo proyecto:

- React y TypeScript, CSS propio, Capacitor 8 y proyecto Android Gradle con identificador `mx.aviles.pos`.
- SQLite nativo en Android y migraciones versionadas 1, 2 y 3; SQLite WASM persistido en IndexedDB para desarrollo web.
- Pantalla de ventas basada en las referencias: barra verde, catálogo, categorías inferiores y ticket lateral; vista adaptable a teléfono.
- Cuadrícula/lista con preferencia persistente, búsqueda por nombre/códigos y favoritos.
- Categorías creadas y editadas desde la aplicación; fotografías cargadas por el usuario, reducidas y almacenadas offline.
- Productos editables con precio, costo, descripción, códigos únicos, unidad, estado, favorito y control opcional de existencias. Los productos sin fotografía tienen una representación propia con iniciales.
- Carrito persistente, cantidades, eliminación de líneas y observaciones; descuento porcentual del ticket e impuesto añadido configurable.
- Importes MXN en centavos y límites de validación.
- Cobro en efectivo, importe exacto/recibido y cambio; registros manuales de tarjeta, transferencia y otros.
- Pagos divididos o combinados, hasta 10 partes, con referencias opcionales, importes precisos y confirmación transaccional del conjunto. El total distribuido debe coincidir exactamente con el ticket.
- Recibos e historial muestran los métodos realmente registrados, sus importes, referencias y cambio en efectivo. Se conservan los recibos de 1.0.
- Protección frente a confirmaciones repetidas: una venta completada devuelve los mismos pagos y movimientos, sin duplicarlos.
- Guardado, recuperación, modificación, cobro y cancelación de tickets pendientes. Recuperar conserva la venta anterior cuando corresponde.
- Historial persistente de ventas y detalles de pagos, con instantáneas de precios y datos comerciales.
- Configuración del negocio: nombre, dirección, teléfono, tasa y mensaje del recibo.
- Clientes locales, asignación al ticket y consulta de su historial.
- Inventario: entradas con costo promedio, salidas, ajustes con motivo, conteos físicos, umbrales, alertas, valoración a costo e historial paginado con filtros, actor y antes/después. Descuento de stock atómico al cobrar.
- Empleados locales, PIN derivado con sal, roles y permisos individuales comprobados en operaciones; bloqueo temporal persistente de accesos y protección del último administrador.
- Caja opcional: apertura/fondo, ingresos/egresos/retiros, cobros por turno, arqueo, diferencias, cierre e historial con reporte; vinculación de ventas al empleado y turno.
- Auditoría administrativa con consulta de las últimas 200 acciones.
- Lectores USB/Bluetooth que introduzcan el código como teclado: formulario de búsqueda exacta. No hay integración con cámara ni protocolo propio del lector.
- Shell web de producción para recarga offline. Android incluye todos los recursos en el APK y no depende de este service worker.

No hay datos de demostración en el catálogo inicial. Las capturas de pruebas usan artículos creados por Playwright y dibujos de prueba originales, en almacenamiento aislado que se elimina con el contexto de prueba.

## Pendiente

La ampliación solicitada abarca 11 fases. Esta entrega proporciona módulos operativos; no declara terminadas las fases con elementos pendientes:

- Variantes, grupos de modificadores, selección obligatoria/opcional y sus precios.
- Devoluciones, anulaciones de ventas completadas y movimientos inversos de inventario.
- Inventario con variantes, composiciones y devoluciones; exportación del historial.
- Impresoras ESC/POS Bluetooth, USB y LAN, reimpresión y cajón. No se muestra un botón de impresión sin implementación.
- Reportes por periodo, empleado/categoría/producto, utilidad y exportaciones.
- Respaldos exportables, restauración e importación de catálogos. No se ha implementado una restauración que sobrescriba datos.
- Anticipos o cobros parciales confirmados que mantengan una venta abierta; integración bancaria. Los pagos de 1.1 se preparan y registran juntos al completar la venta.
- Programas de fidelización, cámara y lectores que no emulen teclado.

El manual de operación y permisos está en [MODULOS-1.2.md](MODULOS-1.2.md); el estado de cada fase y el punto exacto de continuación, en [AVILES_POS_PROGRESO.md](../AVILES_POS_PROGRESO.md).

## Compatibilidad y actualización

La migración 2 transforma la tabla de pagos conservando cada fila original en una transacción. Si no puede copiarla o guardar el archivo, se revierte toda la migración. Se mantiene el nombre de la base `aviles_pos` y el almacenamiento IndexedDB `aviles-pos-v1`; este último nombre identifica el contenedor, no la versión de esquema. No se borra información para actualizar.

La migración 3 añade tablas/columnas de empleados, auditoría, stock y caja sin borrar tablas originales. Los campos históricos desconocidos permanecen vacíos o nulos. El control de caja inicia desactivado; al activarlo exige apertura antes de cobrar.

El diálogo puede distribuir el total entre varios métodos, incluidos pagos separados del mismo método. No equivale a confirmar un anticipo: ninguna parte se marca pagada hasta confirmar el conjunto. Si se cierra el diálogo, se conserva el ticket y se descarta el reparto preparado.

## Android y distribución

Se genera un APK **de depuración**, para instalación y pruebas, con orientación horizontal declarada, icono e identidad propios. No equivale a una versión de producción firmada para distribución comercial. Para actualizar conservando datos deben usarse la misma firma, el mismo identificador y un `versionCode` mayor. La clave debug está fuera del código y no se incluye en la entrega de fuentes.

La compilación nativa no sustituye pruebas de ejecución: faltan instalación y recorrido en la Samsung Galaxy Tab A11, persistencia SQLite nativa tras cierre forzado y reinicio de Android, teclado táctil, fotografía desde el selector Android, interacción real con los insets del sistema y prueba offline física. No se afirma compatibilidad con periféricos no probados.

El registro detallado de comandos y resultados está en [PRUEBAS.md](PRUEBAS.md). El procedimiento de compilación e instalación está en [README.md](../README.md).
