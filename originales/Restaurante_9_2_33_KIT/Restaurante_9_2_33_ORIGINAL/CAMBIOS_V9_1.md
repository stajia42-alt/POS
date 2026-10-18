# Restaurante 9.1 — revisión de datos y actualización en vivo

Se conserva la distribución, colores y módulos de la versión 9.0.

## Correcciones

- Se corrigió el archivo de dependencias de compilación: `jsonwebtoken` vuelve a solicitar la rama existente 9.0.x. La versión de la aplicación permanece en 9.1.0. Se comprobó `npm ci` desde cero y la creación de un ejecutable PE de Windows de 64 bits.
- Ventas, resumen, gráficas, meseros, productos, catálogos, servicios, pagos, descuentos y propinas incluyen ahora las cuentas cobradas de `tempcheques` y el histórico `cheques`. Ya no dependen únicamente de que se cierre el turno.
- Productos y pagos se enlazan por folio **y origen**. Un folio temporal puede ser igual a uno histórico sin ser la misma cuenta.
- Los temporales ya trasladados se excluyen mediante `cheques.foliotempcheques`, empresa y fecha de apertura. Esto evita duplicarlos mientras coexisten ambas copias. Requiere comprobar esa relación con la instalación real.
- El detalle abre la fuente correcta. Si una cuenta temporal ya fue trasladada, busca su enlace histórico; si encuentra varias candidatas, avisa en lugar de mezclarlas.
- Todos los módulos visibles se actualizan cada 15 segundos, sin reutilizar la antigua caché de resultados. Se pausa al ocultar la pestaña o abrir un diálogo. El botón Actualizar consulta nuevamente los datos.
- Los períodos rápidos avanzan cuando cambia el día/jornada; los períodos personalizados y favoritos se conservan.
- Por defecto se utiliza el cobro/cierre de la cuenta, con apertura como alternativa si aún no tiene cierre. La apertura sigue disponible en los filtros. Las cuentas abiertas se muestran separadas de la venta cobrada.
- Los códigos 1, 2 y 3 tienen como nombres de respaldo Comedor, A domicilio y Rápido. El catálogo existente tiene prioridad, y la asignación puede corregirse en Ajustes. **Esta numeración inicial debe contrastarse con una cuenta conocida de cada servicio en tu instalación.** No se cambia el catálogo de Soft Restaurant.
- Los turnos se seleccionan por identificador interno, no se eliminan del selector cuando comparten número visible. Las tarjetas y el detalle usan la misma vinculación de cuentas.
- El modo automático de vinculación comprueba tanto número visible como identificador interno y empresa. Solo asigna una cuenta cuando hay una coincidencia única. Si hay ambigüedad, conserva la venta general y muestra un aviso en Cortes; no reparte importes arbitrariamente. Ajustes permite elegir referencia interna o número visible después de verificar el diagnóstico.
- Las fechas de Cortes respetan la hora de inicio de jornada. El corte seleccionado se consulta completo.
- Formas de pago del detalle de turno ya no se limita a la primera página; las sugerencias del arqueo usan el listado completo dentro del límite de exportación.
- Cancelaciones por producto conserva eventos sin cuenta asociada. Los filtros de cuenta solo se aplican a enlaces únicos por folio y rango de apertura/cierre; se evita enlazar por casualidad un folio de otra fuente.
- Se aclara que Alertas usa período y empresa; no se presenta como un reporte detallado filtrado por mesero/producto/turno.
- La exportación comparativa ya no imprime sumas antiguas que no incluyen sus columnas de comparación.

## Verificación realizada

1. **25 pruebas automatizadas Node:** autenticación, permisos, persistencia, arqueos, rutas, arranque, Excel, filtros, claves de origen, configuración de servicios y actualización sin caché.
2. **19 consultas generadas ejecutadas con datos de prueba**, traducidas de T-SQL a DuckDB: cuentas, productos, meseros, catálogos, servicios, pagos, cancelaciones, descuentos, abiertas, cortes, propinas y diario, más resumen y variantes de turno/fecha.
3. Pruebas de valores antes/durante/después del traslado al histórico; folios y foliodet iguales en fuentes distintas; cuenta sin pagar, cuenta cancelada, propinas y descuentos temporales, cancelación sin cuenta, turno ambiguo, cobro después de medianoche y jornada desde las 04:00.
4. Navegador: recorrido por todos los módulos, nombres editables, turnos con números repetidos, detalle temporal, actualización automática, favoritos, arqueos, Excel/impresión, usuarios y vista móvil.
5. ZIP comprobado mediante CRC y extracción completa, y comprobación del archivo final después de guardarlo.

**Límite importante:** DuckDB sirve para comprobar resultados con datos controlados; no sustituye ejecutar las consultas en SQL Server 2014. No se ha accedido a tu SQL ni se ha ejecutado el EXE en tu Windows. No se certifica que los importes reales coincidan hasta comparar al menos una cuenta de cada servicio y un corte conocido. El actualizador PowerShell tampoco se ha ejecutado aquí.

## Comprobación en el negocio

1. Cierra únicamente la aplicación de consulta anterior. No cierres SQL Server ni Soft Restaurant.
2. Extrae esta versión en otra carpeta. Abre `ABRIR_RESTAURANTE.cmd` desde la carpeta principal; usa Node ya instalado y evita compilar de nuevo para la primera prueba.
3. Comprueba una cuenta cobrada del turno abierto, una cuenta pendiente y un corte cerrado conocido. Al registrar un nuevo cobro, el reporte debe actualizarse en la siguiente consulta automática.
4. En Ajustes puedes revisar los nombres de servicio y descargar **Diagnóstico de datos**. Si un corte no coincide, comparte ese JSON junto con el número de corte y el importe esperado. Contiene conteos e importes agregados, sin credenciales ni nombres de clientes.
5. Si prefieres EXE, compila esta versión; no reutilices el EXE 9.0. Conserva la carpeta `dist` completa.

No se escriben ventas ni cierres en la base de Soft Restaurant.
