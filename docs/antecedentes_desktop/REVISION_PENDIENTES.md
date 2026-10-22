# Estado de liberación 1.0 RC1

**Desarrollo actualizado con correcciones de impresión, vista previa, clientes sin placa y arqueo.**

## Comprobado
- Corrección LF ESC/POS y captura del mismo folio CODE128-B.
- Suite autónoma de 20 tests: 20 aprobados.
- Migración de SQLite del esquema 2 al 3 probada con filas históricas de ejemplo, sin cambiarlas.
- Validación de sintaxis de JavaScript.

## Pendiente obligatorio antes de usar con clientes
- `npm ci` y `npm test` completos en Windows (dependencias no disponibles en este entorno).
- Prueba real con impresora ESC/POS de 80 mm (RAW, corte, logotipo y lectura por escáner USB).
- Ensayo de jornada completa con cortes X/Z, cambios, USD, tolerancia, reimpresiones, pago repetido y respaldo.
- Verificación del texto de políticas legales del estacionamiento.

Consulta **LEER_PRIMERO_VERSION_1_0_RC1.md** para detalle, instrucciones y alcances.
