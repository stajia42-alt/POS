# Restaurante 8.1 — revisión de los errores reportados

## Correcciones

- **Detalle de cuenta:** se eliminó el conflicto entre la CTE `M` y el alias `m` del mesero. SQL Server los trata como el mismo nombre en instalaciones sin distinción de mayúsculas. Se usa `EnlaceCuenta ec` para el enlace.
- **Cortes anteriores:** el apartado abre todos los turnos de `turnos`, paginados del más reciente al más antiguo. Las fechas se aplican solo al elegir un período. Cada tarjeta añade la suma de venta pagada y el número de cuentas del turno; no confunde un importe de cabecera sin registrar con cero.
- **Detalle de corte:** consulta el turno completo, independientemente del calendario o de los filtros heredados. Los desgloses de cuentas, servicios y pagos usan ese mismo turno.
- **Ventas en vivo:** el indicador y el apartado Cuentas abiertas no heredan fechas, turno, catálogo ni servicio del historial. Se conserva únicamente la empresa. La fecha permite identificar antigüedad, sin ocultar cuentas.
- **Filtros antiguos:** ya no se restauran automáticamente filtros invisibles guardados por la versión anterior. Los cambios de apartado limpian filtros avanzados, excepto al abrir un desglose explícito. Elegir un turno consulta todo ese turno.
- **Historial de ventas:** cuando no hay ventas en una selección, un botón permite consultar la última fecha con cuentas pagadas de la base conectada. Cambia el período visible; no mezcla esa venta con la de hoy.
- **Servicios:** se normalizan espacios, ceros iniciales y códigos numéricos antes de buscar el nombre. Si el catálogo no tiene descripción, se conserva el código; no se adivina comedor/domicilio/rápido.
- **Arranque:** se conserva la interfaz incorporada de 8.0.1. `ABRIR_RESTAURANTE.cmd` abre la página al iniciar; si ya funciona la misma versión, abre su navegador. Si hay otra instancia, avisa sin terminar procesos.

## Interfaz simplificada

Botones grandes con los colores del inicio; cabeceras del color de cada módulo; menú lateral oculto hasta solicitarlo. Solo los períodos rápidos están visibles al entrar. Los calendarios y filtros avanzados se despliegan cuando hacen falta. Los cortes se presentan como tarjetas. Las explicaciones de cálculo y las opciones de descarga quedan plegadas, sin quitar información de los detalles o exportaciones.

## Verificación y límites

Se ejecutaron 15 pruebas locales: arranque sin carpeta de interfaz externa, exportación Excel, filtros y paginación, servicios, enlace de productos y regresiones de los errores de las fotos. Las pruebas de rutas usan SQL simulado; no se ejecutaron contra tu servidor.

Se probó en navegador la navegación simplificada, descarte de filtros guardados, cortes completos y por fecha, desglose de servicios, independencia entre módulos, cuentas abiertas, Atún Urbano, impresión, recuperación de errores y móvil. Los datos de esa prueba son ficticios.

**Falta comprobar en tu Windows y SQL real** el arranque y los importes de un corte conocido. Esta revisión corrige los errores encontrados en el código y la selección de datos; no confirma por sí sola que todas las cifras coincidan con Soft Restaurant.

La venta de cuentas es el total registrado de cuentas pagadas no canceladas. Los reportes por producto/mesero calculan cantidad por precio del detalle; no distribuyen descuentos generales, cargos ni propinas. Los pagos conservan su base de registro y no se convierten monedas. Pagos menos venta no es un arqueo de efectivo. No se cierran turnos ni se modifican operaciones en SQL.

Límites: períodos por fecha de hasta 366 días (un turno completo no se recorta por ese período), exportación hasta 20,000 filas. Cancelaciones muestra cuentas canceladas. Las referencias de productos ambiguas se excluyen con aviso para evitar atribuirlas a otra cuenta. Las nuevas mejoras propuestas, como captura de arqueo, permisos y cancelaciones por producto, no forman parte de esta corrección.
