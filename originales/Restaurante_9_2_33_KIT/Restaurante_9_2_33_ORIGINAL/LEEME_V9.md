# Actualización 9.2

Lee `CAMBIOS_V9_2.md` para la nueva distribución del inicio y la impresión simplificada de Cortes.

Lee primero `CAMBIOS_V9_1.md`: reemplaza las descripciones de fuentes, turnos y nombres de servicio de la versión inicial que aparecen abajo.

# Restaurante 9.0 — mejoras pendientes

## Funciones implementadas

| Mejora | Dónde se utiliza | Alcance |
|---|---|---|
| 1. Conciliación de cortes | Cortes → Ver corte → Conciliar efectivo contado | Fondo + cobros + propinas + entradas − retiros − gastos − propinas entregadas; diferencia contra efectivo contado. Registros separados e históricos con usuario y observación. |
| 2. Atún Urbano | Botón Atún Urbano | Meseros, productos, descuentos de cuentas coincidentes y participación frente a catálogos. Selección manual del catálogo si su nombre es distinto. |
| 3. Alertas | Botón Alertas | Cuentas y turnos antiguos abiertos, descuentos elevados y cancelaciones frecuentes. Umbrales en Ajustes; detalle de cuentas cuando existe enlace. |
| 4. Favoritos | Favoritos en la barra superior | Guarda nombre, apartado y filtros. Se conservan por usuario y pueden eliminarse o abrirse después. |
| 5. Comparación por servicio | Tipos de servicio | Total, porcentaje del total, ticket promedio y cambio contra período anterior. Incluye servicios con venta anterior y sin venta actual. |
| 6. Usuarios y permisos | Ajustes → Usuarios | Dueño, gerente y consulta; permisos por apartado verificados en el servidor, contraseñas derivadas con sal y sesiones revocables. |
| 7. Inicio personalizable | Ajustes → Mi pantalla | Elegir, ocultar y ordenar botones; tablas compactas. El menú conserva todos los apartados autorizados. |
| 8. Resumen del día | Botón Resumen del día | Venta, propinas, descuentos, cortesías, cancelaciones de cuentas, servicios, pagos y cuentas abiertas; Excel de varias hojas e impresión/PDF. No cierra el turno. |
| 9. Cancelaciones por producto | Productos cancelados | Eventos de cancela con producto/clave, cantidad, precio, motivo, usuario, fecha y turno de cierre. |
| 10. Buscador de cuentas | Cuentas → Filtrar | Número o mesa, período e importe exacto; detalle de productos, pagos y responsable. |
| 11. Día de operación | Ajustes → Día de operación | Hora configurable; ejemplo 04:00: la jornada del 7 abarca desde el 7 a las 04:00 hasta antes del 8 a las 04:00. También permite día calendario. |
| 12. Propinas por mesero | Botón Propinas | Propina de cuentas, desglose por formas de pago clasificadas y estados entregada/pendiente/sin estado según propinapagada. |
| 13. Comparación de catálogos | Catálogos | Ventas, unidades, participación, diferencia entre períodos, horarios de mayor importe y productos vendidos. |
| 14. Actualización con respaldo | ACTUALIZAR_INSTALACION.cmd | Prepara la nueva carpeta, conserva la anterior y permite restaurar mediante VOLVER_VERSION_ANTERIOR.cmd. Preserva datos y conexión. |

## Interpretación de datos

La venta de cuentas usa cuentas pagadas no canceladas. Los reportes por producto y mesero calculan cantidad por precio de detalle; no reparten cargos, descuentos generales o propinas. El listado de descuentos de Atún Urbano conserva los descuentos de las cuentas completas que contienen ese catálogo, y no los atribuye exclusivamente a sus productos.

Las propinas entregadas/pendientes se basan en la marca de la cuenta en Soft Restaurant. Esa marca no constituye una comprobación física ni identifica entregas parciales. Las propinas de pagos y de cabecera pueden diferir. Los métodos sin clasificar permanecen en Otros/sin clasificar. No se convierten monedas.

El arqueo requiere revisar los cobros sugeridos y capturar el efectivo contado y los movimientos. No se deduce el signo de movimientos SQL desconocidos. Una diferencia solo describe los valores capturados; no prueba por sí sola una pérdida o responsabilidad. Los registros se agregan, no se sobrescribe el conteo previo.

Cancelaciones por producto usa la fecha del evento y la clave original. Los filtros de cuenta/servicio/empresa/mesero requieren una cuenta histórica enlazada; sin esos filtros se conservan los eventos sin cuenta enlazada. Mesero en esa consulta significa responsable de la cuenta, mientras usuario es quien figura en el evento.

Las cuentas abiertas son una consulta en vivo de cualquier fecha. No heredan filtros históricos; la antigüedad se mide contra el inicio del período/jornada. Los turnos concretos se consultan completos, por lo que no se comparan contra un período anterior de fechas.

Los nombres de servicio provienen del catálogo real. Si faltan, se muestra su código sin adivinar el tipo. Los enlaces de producto ambiguos continúan excluyéndose con aviso.

## Seguridad y datos locales

Antes de activar usuarios, solo el equipo local tiene acceso de configuración inicial. Al crear el dueño, todos deben identificarse. Los usuarios Consulta no pueden registrar arqueos; Gerente sí, si tiene permiso de Cortes. Solo Dueño administra usuarios, conexión y ajustes generales. Cada persona puede guardar favoritos, personalizar su pantalla y cambiar su contraseña.

El acceso remoto conserva además la clave de acceso Basic de la versión anterior; no se modifica Cloudflare. Las contraseñas de usuarios no se almacenan en texto plano. Usuarios, ajustes, favoritos, auditoría y arqueos se guardan en `gestion-v9.json` dentro de la carpeta de configuración. Se conserva `.bak` al guardar. Esto no es un respaldo de SQL Server.

La aplicación no escribe ventas, inventario, pagos ni cierres en Soft Restaurant. Los nuevos registros son locales a esta aplicación. La actualización y el regreso de versión conservan esos archivos; una versión anterior puede no mostrar las nuevas funciones, aunque sus datos permanezcan guardados.

## Verificación realizada

- 21 pruebas locales automatizadas: rutas de interfaz incorporada, regresiones de cuentas/cortes/filtros, Excel, límites de exportación, fechas, parámetros de jornada e importe, clasificación de propinas, conciliación en centavos, inicio, autenticación, permisos, protección de escrituras, persistencia y comparación de servicios.
- Prueba de navegador con datos ficticios: nuevos apartados, favoritos, ajustes, captura de arqueo, descarga Excel real, impresión, creación del dueño, salir/entrar, usuario restringido y vista móvil.
- Revisión visual de inicio y conciliación; revisión de sintaxis JavaScript. Contraste de nombres de columnas con el diagnóstico proporcionado.

**Pendiente de validación en tu equipo:** ejecutar/compilar en Windows, probar la actualización/restauración y comparar las consultas e importes contra tu SQL real. No hay acceso a ese servidor desde este entorno. Las pruebas locales usan SQL simulado y no certifican los resultados contables de la instalación.

El actualizador es código para Windows PowerShell y está preparado, pero no se ejecutó aquí. Rechaza una carpeta ajena a Restaurante, exige cerrar la aplicación antes del cambio, conserva un respaldo y no reinstala el túnel. Para una instalación EXE exige compilar la nueva versión primero. Las carpetas nueva y anterior deben ser distintas.

## Límites

Períodos de hasta 366 días y exportaciones de hasta 20,000 filas por sección; si se supera se solicita reducir filtros. Alertas y combinaciones catálogo/hora muestran hasta 200 resultados por sección. La auditoría conserva los últimos 5,000 eventos; los arqueos se conservan completos y se muestran hasta los últimos 200 coincidentes en pantalla. Las sugerencias y estados de SQL requieren verificación inicial con un turno conocido.
