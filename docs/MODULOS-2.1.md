# AVILES POS 2.1 — Primera etapa de restaurante

Esta actualización continúa sobre 1.2. No constituye la totalidad de las quince fases solicitadas. Conserva productos, inventario, clientes, empleados, pagos manuales/combinados, recibos y caja. Las funciones nuevas se describen aquí; los módulos anteriores conservan su operación salvo los cambios expresos de acceso y apertura obligatoria.

## Antes de actualizar

Instala el APK con el mismo identificador y firma sobre la versión anterior, sin desinstalar ni borrar datos. La migración sube SQLite a esquema 4. El APK no incluye ni respalda las ventas del dispositivo. La copia Git creada antes de desarrollar es un respaldo de código; no es un respaldo de SQLite de la tableta.

**Si tienes varios empleados en 1.2, configura PIN exclusivos antes de actualizar, en especial el del administrador.** La versión anterior admitía repeticiones. La nueva puede reconocer un PIN antiguo exclusivo sin pedir usuario y sin guardar el PIN, pero no puede decidir qué persona es si varios empleados activos usan el mismo PIN. En ese caso bloquea ese acceso y otro administrador con PIN exclusivo debe restablecer los PIN repetidos. Si ningún administrador tiene un PIN exclusivo, no hay recuperación automática: resuelve esa condición desde 1.2 antes de instalar. No se inventa una identidad ni se concede acceso al rol más alto por compartir PIN. No se ha implementado recuperación externa.

## Acceso por PIN

El inicio normal muestra bienvenida, PIN protegido, teclado numérico táctil y botón Entrar. Admite teclado físico o del sistema. No solicita identificador. El primer arranque sin empleados pide nombre del propietario y PIN/confirmación; el identificador administrativo se genera internamente. Los identificadores existentes se conservan y siguen siendo editables en Empleados para administración, no para iniciar sesión.

Cada PIN nuevo o restablecido debe ser exclusivo entre empleados activos. Una persona inactiva no puede entrar. Reactivar exige confirmar un PIN que no esté usado por otro activo. Los cambios fallidos no reemplazan credenciales anteriores. El menú permite bloquear y cambiar empleado sin borrar cuentas.

Se conservan hashes PBKDF2-SHA256 con sal individual y 600000 iteraciones. Se añade un índice derivado con PBKDF2 y sal aleatoria de instalación para reconocer el PIN sin recorrer todos los empleados nuevos; nunca un PIN plano ni un SHA rápido sin sal. Los registros anteriores se verifican con su derivado original y reciben índice al entrar correctamente. Esa transición puede tardar más si hay muchos empleados antiguos.

Los intentos incorrectos, incluidos PIN desconocidos, alimentan un contador global persistente: cinco bloquean el acceso durante al menos 30 segundos, aumentando hasta cinco minutos al repetir fallos. El reinicio no elimina la espera. No se expone el índice de PIN en los datos públicos de empleados ni se escribe el PIN en auditoría. El acceso sigue siendo local, sin cifrar el archivo SQLite ni impedir su extracción por quien controle Android.

## Apertura obligatoria

Después del PIN se restaura la operación del empleado y se comprueba el turno. Si no hay abierto se muestra Apertura de caja antes de permitir acceder a las ventas. La pantalla muestra empleado, fecha/hora del dispositivo, fondo MXN, fondo USD y tipo de cambio capturado manualmente por el administrador. No consulta una tasa de Internet.

- MXN y USD se guardan en centavos independientes. No se suman ambas monedas como si fueran iguales.
- La tasa admite cuatro decimales de MXN por un USD y se guarda como entero con escala 10000. Es obligatoria para un fondo USD positivo. Puede permanecer sin configurar si se usa exclusivamente MXN.
- Solo un empleado con permiso de configuración cambia la tasa. Un cajero utiliza la tasa guardada; si falta y necesita USD, debe entrar un administrador.
- Solo un empleado autorizado abre el turno. Sin permiso se solicita cambiar empleado; no existe un acceso que omita la apertura.
- Tras abrir vuelve a su cuenta rápida, mapa o mesa guardada. Si ya había turno abierto, entra directamente a la operación restaurada.
- El servicio de cobro exige turno para **todos** los métodos, aunque una configuración antigua tuviera desactivado el control. No puede desactivarse desde Configuración.

Los tickets y mesas pendientes sobreviven al cierre. No se les inventa un pago ni se les asigna el turno anterior: el cobro se vincula al turno que esté abierto al confirmarlo.

## Caja y corte de consulta

Se conserva Caja y turnos. Sus movimientos ahora eligen MXN o USD; egresos y retiros se limitan al saldo esperado de esa moneda. El reporte separa fondo, entradas, salidas, contado y diferencia de cada moneda. Los pagos de ventas actuales siguen siendo exclusivamente MXN; los USD disponibles en esta etapa son fondos y movimientos físicos de caja, no cobros convertidos.

Al cerrar se captura el contado MXN y USD. Si hay saldo USD no se permite omitir el conteo correspondiente. Se conserva la tasa del turno aunque se cambie después la configuración. El cierre es inmutable ante solicitudes repetidas; no existe edición de un cierre ya guardado. Después aparece la pantalla para abrir otro turno, conservando cuentas.

**Corte de consulta** carga un reporte actualizado sin cerrar el turno. Requiere reportes. El cierre y el corte muestran métodos de pago, descuentos, movimientos y ventas con empleado. No se añaden cifras ficticias de devoluciones: ese módulo todavía no está implementado. Impresión del corte y desglose por denominaciones de billetes/monedas siguen pendientes.

## Modos de operación

Configuración ofrece Venta rápida, Restaurante o Ambos. La elección se guarda en SQLite. Ambos muestra el control Venta rápida | Mesas en la barra principal. Venta rápida conserva catálogo, categorías inferiores y ticket lateral. Restaurante abre el plano; no crea otra aplicación ni otro catálogo.

Cambiar de modo no paga ni borra cuentas. Se guarda el último modo por empleado y se conserva su cuenta rápida separada de la cuenta de mesa que esté atendiendo. Cada empleado recupera su operación al volver a entrar. Las mesas y los tickets pendientes siguen siendo compartidos en el dispositivo y pueden recuperarse según permisos.

No se puede pasar a solo Venta rápida con mesas abiertas. La recuperación de tickets antiguos desde Pendientes se conserva, incluidos tickets rápidos anteriores a activar Restaurante; no se descartan por cambiar la configuración.

## Áreas y plano de mesas

No se precargan mesas o áreas de demostración. El administrador crea sus áreas, por ejemplo Salón o Terraza, y activa Editar plano. Puede agregar mesas con nombre, forma redonda/cuadrada/rectangular, capacidad y dimensiones; arrastrarlas, moverlas con flechas del teclado o capturar posición. Guarda las dimensiones y límites dentro de un plano de 1000 × 600 unidades. Las posiciones se guardan al soltar el arrastre; el movimiento transitorio del dedo no se escribe como cientos de movimientos.

Cada área tiene su plano. Se puede mover una mesa a otra área editándola. Las eliminaciones retiran el elemento del plano sin borrar referencias históricas. Una mesa con cuenta abierta no puede eliminarse; un área con mesas activas tampoco. El tamaño de una mesa es visual: no es una medida física en centímetros.

Estados con color y texto:

- Verde: disponible.
- Rojo: ocupada.
- Naranja: pendiente de cobro.
- Azul: mesa seleccionada; el texto conserva su estado de atención.

Las cuentas muestran nombre, estado, tiempo desde apertura, total y empleado asignado. El tiempo usa el reloj del dispositivo y nunca modifica el importe. El plano está diseñado para tableta horizontal; puede desplazarse cuando el espacio sea menor. Los botones tienen área táctil mínima. Las mesas pequeñas o superpuestas pueden reducir legibilidad; el editor permite ampliar/reubicar según el negocio.

## Atención de cuentas

Tocar una mesa disponible crea una cuenta. Tocar una ocupada recupera la misma, incluso si aún no tiene productos. Las llamadas repetidas no crean dos sesiones abiertas para esa mesa. Agregar/quitar productos, cambiar cantidades y notas usa las operaciones SQLite existentes con guardado inmediato. Volver al mapa conserva la cuenta sin obligar a GUARDAR.

El menú de cuenta de mesa permite:

- **Marcar pendiente de cobro** o continuar atendiendo. No registra pagos ni descuenta stock. Agregar/modificar líneas devuelve la cuenta a atención normal.
- **Transferir mesa:** cambia la cuenta a una mesa disponible, con productos, total, mesero y hora original conservados. Registra origen/destino.
- **Unir cuentas:** todos los productos pasan a una mesa con cuenta abierta y la de origen se libera. Conserva una referencia `merged_into` y un registro con las líneas originales. Se exige igual cliente, impuesto y descuento; el total se recalcula por cuenta con redondeo al centavo. No es un pago parcial ni una división por personas. No se fusionan cuentas cobradas.
- **Cambiar mesero:** selecciona un empleado activo con permiso para mesas. El mesero asignado se distingue del empleado que finalmente registra el cobro.
- **Liberar mesa vacía:** cierra su sesión sin cobrar.
- **Liberar y cancelar cuenta:** requiere permisos administrativos y motivo; conserva el registro y no inventa pagos ni descuenta inventario.

Cobrar liquida el ticket completo con los pagos manuales/combinados existentes. El mismo commit guarda pagos, stock, turno, empleado y cierre de la sesión de mesa. Un fallo no libera la mesa ni deja cobros parciales. Un reintento del ticket pagado devuelve el recibo original sin repetir stock. Tras el recibo vuelve al mapa si estaba operando en mesas.

La transferencia de productos específicos, división por importes/personas, cobros parciales, vínculo de varias mesas a una sola cuenta y autorizaciones delegadas mediante PIN esperan las fases posteriores. No hay botones que simulen esas operaciones.

## Permisos y seguridad operativa

- Atender mesas: consultar mapa y recuperar cuentas; además se necesita Vender para modificarlas/cobrarlas.
- Editar áreas y mapa: configuración visual; se concede inicialmente al administrador.
- Transferir cuentas y cambiar mesero: transferencia, unión y reasignación; inicialmente administrador/supervisor.
- Liberar mesas con cuenta pendiente: junto con Cancelar tickets permite la liberación excepcional con motivo; inicialmente administrador.

La migración añade permiso de atención a los empleados que ya vendían, edición/liberación al administrador y transferencias a administrador/supervisor. Conserva los permisos anteriores. El administrador puede cambiarlos individualmente. Cada operación vuelve a comprobar permisos y estado activo dentro de la capa de negocio.

Las autorizaciones mediante el PIN de otra persona todavía no se implementan. Para una operación que el cajero no pueda realizar se cambia a un empleado autorizado; la auditoría identifica al ejecutor real y el motivo cuando corresponde, sin fingir una autorización de supervisor.
