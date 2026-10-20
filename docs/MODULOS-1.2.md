# Inventario, caja y empleados en AVILES POS 1.2

## Activación y acceso

Al actualizar, la aplicación conserva la base anterior y solicita crear el acceso local del propietario. El nombre, identificador y PIN los elige la persona que posee el dispositivo. No existe PIN predeterminado. Al cerrar y abrir la aplicación se solicita acceso otra vez. El menú permite **Bloquear y cambiar empleado** sin borrar el ticket activo. Los tickets son compartidos en este dispositivo; se atribuye el cobro al empleado que lo confirma.

El administrador crea empleados desde **Empleados**, con nombre, identificador único, rol, PIN de 4 a 8 dígitos y estado. Cambiar el rol carga permisos sugeridos; pueden ajustarse antes de guardar. Desactivar impide nuevos accesos e invalida las operaciones siguientes de una sesión existente. Otro administrador puede restablecer el PIN; nunca se consulta el anterior. Debe permanecer un administrador activo con permisos de empleados y configuración. No hay recuperación externa si se pierde el único acceso administrativo.

Los PIN se derivan con PBKDF2-HMAC-SHA256, 600000 iteraciones y sal aleatoria individual. No se guardan en texto plano ni en auditoría. Cinco intentos fallidos bloquean temporalmente el empleado; los reintentos aumentan la espera hasta cinco minutos. Los contadores persisten en SQLite. La sesión se mantiene solo en memoria. Este acceso no cifra SQLite ni protege contra quien controle el sistema operativo y pueda extraer/modificar la base.

## Permisos efectivos

| Permiso             | Operación protegida                                                               |
| ------------------- | --------------------------------------------------------------------------------- |
| Vender              | Agregar/editar líneas, guardar/recuperar tickets, gestionar clientes y cobrar     |
| Descuentos          | Cambiar el porcentaje del ticket                                                  |
| Cancelar tickets    | Cancelar borradores o pendientes; no equivale a devolver una venta pagada         |
| Modificar precios   | Cambiar el precio de un producto existente, además de administrar productos       |
| Productos           | Crear/editar productos y categorías                                               |
| Inventario          | Entradas, salidas, ajustes, conteos y cambios de cantidades, umbral o seguimiento |
| Reportes            | Historial de ventas, recibos ajenos, consulta de inventario y reportes de turnos  |
| Abrir caja          | Abrir un turno y consultar su estado                                              |
| Cerrar caja         | Consultar efectivo esperado y registrar arqueo/cierre                             |
| Movimientos de caja | Consultar efectivo esperado y registrar ingresos/egresos/retiros                  |
| Configuración       | Cambiar datos comerciales, impuesto y control de caja                             |
| Empleados           | Administrar empleados/permisos y consultar actividad administrativa               |

La capa de negocio verifica el empleado activo y sus permisos vigentes en cada operación. Ocultar opciones del menú es una ayuda visual, no la protección principal. Un cajero sin reportes solo puede consultar el recibo de las ventas que cobró; no recibe el historial general ni reportes detallados de caja. Los permisos reservados `refunds` y `reprint` no habilitan funciones: sus operaciones y controles esperan a las fases de devoluciones e impresión.

## Inventario operativo

En **Productos**, activa **Controlar existencias**, captura cantidad inicial y umbral. Si editas una cantidad existente debes indicar motivo. Los cambios generan movimientos; no se sobrescribe silenciosamente la existencia. No se eliminan productos para ocultarlos: se conservan inactivos con su historia.

En **Inventario → Registrar movimiento**:

- **Entrada:** suma unidades. El costo unitario es opcional; si se indica actualiza el costo promedio ponderado de las unidades existentes y entrantes, redondeado al centavo. Sin costo, conserva el costo actual.
- **Salida:** resta unidades con motivo. Se rechaza si supera la existencia.
- **Ajuste:** cambio positivo o negativo, distinto de cero, con motivo obligatorio.
- **Conteo físico:** cantidad realmente contada, incluido cero. Guarda esperado, contado, diferencia y movimiento, incluso si coincide.

Cada nuevo movimiento guarda producto, fecha/hora, empleado y nombre capturado, cantidad, motivo y antes/después. Las ventas descuentan automáticamente los productos controlados dentro de la misma transacción del cobro. Pendientes y cancelaciones de tickets no mueven stock. Los productos sin seguimiento no generan movimientos por venderse.

La pantalla muestra stock, mínimo, costo, valor a costo y alertas de productos activos con existencia menor o igual al umbral. La valoración total considera productos activos con seguimiento; las filas también permiten consultar inactivos. El historial tiene filtros por producto y fechas locales, con páginas de 50 movimientos. Los datos antiguos sin antes/después ni empleado aparecen como **Sin registro**, sin reconstrucciones ficticias.

Todavía no se implementan variantes, composiciones, cantidades fraccionarias ni devoluciones con reposición. El valor actual a costo no equivale a utilidad histórica de ventas.

## Caja y turnos

Activa **Configuración → Control de caja por turnos** y guarda. Se mantiene desactivado al migrar para conservar el flujo de cobro anterior. Con la función activa, cobrar exige un turno abierto, incluso si todo el pago es tarjeta. Hay un solo turno abierto por dispositivo, compartido entre los empleados autorizados.

1. **Caja y turnos → Abrir turno:** registra el fondo inicial y empleado.
2. **Movimiento de caja:** ingreso, egreso o retiro, con importe positivo y motivo obligatorio. Egresos/retiros no pueden superar el efectivo esperado.
3. Las ventas guardan turno y empleado que cobró. El efectivo se suma por el importe aplicado, descontando implícitamente el cambio; nunca por todo lo recibido. Tarjeta/transferencia/otros se agrupan por separado.
4. **Cerrar turno:** muestra esperado y pide contado. Presenta faltante, sobrante o coincidencia antes de confirmar. Guarda contado, esperado, diferencia, fecha y empleado.
5. **Historial de cierres:** un usuario con reportes filtra fechas y consulta fondo, cobros por método, movimientos y ventas con empleado. El cierre original no se sobrescribe si se repite la solicitud.

Cálculo: fondo inicial + ventas aplicadas en efectivo + ingresos − egresos − retiros. No se permiten importes negativos ni desbordar $999999.99 MXN de efectivo esperado. No puede desactivarse el control con un turno abierto. Cerrar no cancela ni elimina los tickets pendientes; se cobran en el turno que esté abierto al completarlos. Las ventas anteriores a activar caja no se adjudican a turnos nuevos.

La consulta y el arqueo funcionan localmente. Impresión/reimpresión del cierre, exportaciones y devoluciones de efectivo están pendientes. No hay un botón de impresión que simule éxito.

## Auditoría y persistencia

**Empleados → Actividad administrativa** muestra las últimas 200 acciones: acceso, cambios de empleados/permisos, catálogo/configuración, inventario, cobros, opciones/cancelación de tickets y caja. Conserva el nombre del actor en el momento de la acción. Los accesos fallidos se registran sin atribuir una identidad autenticada. No es un registro inalterable ante acceso directo al archivo SQLite.

Esquema 3: nuevas tablas `employees`, `employee_permissions`, `administrative_actions`, `shifts`, `cash_movements`, `inventory_counts`; nuevas columnas en productos, ventas y movimientos. Migración aditiva, transaccional y repetible. Conserva las migraciones 1 y 2, el archivo `aviles_pos`, los identificadores e IndexedDB `aviles-pos-v1`. Las filas históricas no reciben empleados o turnos inventados. Un fallo revierte esquema y datos y permite reintentar.

El control de acceso no es un respaldo. Todavía no hay exportación/restauración. Para actualizar conserva el identificador y firma del APK, instala encima y no borres los datos ni desinstales la aplicación.
