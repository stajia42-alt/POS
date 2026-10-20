# Cambios de AVILES POS

## 2.1.0 — 20 de octubre de 2026 — Primera etapa

- Continúa desde 1.2 en una rama nueva y con punto de restauración verificado.
- PIN sin usuario, identificación automática, exclusividad en activos y limitación de intentos desconocidos. Conserva derivados anteriores; bloquea PIN ambiguos heredados.
- Hace obligatoria la apertura de turno. Añade fondos/movimientos/arqueo USD independientes de MXN y tasa manual histórica. Corte de consulta sin cerrar.
- Añade modos de operación y mapa SQLite de áreas/mesas, edición táctil, estados, cuentas persistentes, transferencia, unión y mesero.
- Recupera cuenta rápida o mesa por empleado; conserva pendientes al cerrar caja. Pago e inventario liberan mesa atómicamente.
- Migra aditivamente a esquema 4. Android versionCode 4, mismo paquete y firma de desarrollo. Sin nuevas dependencias ni ventas dependientes de Internet.
- Ajusta estados y controles visuales manteniendo la distribución de venta rápida. Corrige primer toque posterior a un arrastre.
- Alcance parcial: continúan pendientes impresoras/comandas, cobros USD, división/abonos y autorizaciones delegadas, además de pendientes anteriores. Consultar el progreso.

## 1.2.0 — 20 de octubre de 2026

- Conserva la aplicación existente y su pantalla de ventas. Añade acceso local sin cuentas externas.
- Empleados con PIN PBKDF2/sal, roles, permisos individuales, estados, restablecimiento y bloqueo temporal de intentos.
- Inventario operativo con entradas/costo promedio, salidas, ajustes, conteos físicos, umbrales/alertas y libro filtrado/paginado.
- Caja configurable con turnos, fondos, movimientos, arqueo, diferencias e historial; ventas atribuidas a empleado y turno.
- Auditoría administrativa. Migración aditiva a esquema 3 sin inventar trazabilidad histórica.
- Android versionCode 3, versión 1.2.0, mismo identificador. No añade dependencias de Internet.
- No completa las once fases: ver alcance, límites y continuación en `AVILES_POS_PROGRESO.md` y manual en `docs/MODULOS-1.2.md`.

## 1.1.0 — 20 de octubre de 2026

- Añade registros manuales de tarjeta, transferencia y otros pagos.
- Permite dividir un total exacto entre hasta diez partes, incluyendo varias del mismo método.
- Registra referencias por pago y cambio exclusivo de efectivo. El recibo y el historial muestran los métodos reales.
- Mantiene la idempotencia del cierre completo, la atomicidad del inventario y el cobro simple en efectivo.
- Migra de esquema SQLite 1 a 2 conservando las ventas y pagos existentes. No reinicia catálogos ni tickets.
- Mantiene la distribución principal acordada; amplía únicamente el diálogo de cobro y los detalles del recibo/historial.
- Incrementa versionCode Android a 2 y conserva la firma de desarrollo anterior.
- Validación: 39 pruebas de lógica/SQLite y 11 flujos de navegador aprobados; compilación Android y firma verificadas. Validación física pendiente.

La distribución del diálogo es una preparación. El conjunto se registra al confirmar; no se implementan anticipos confirmados con saldo pendiente. Las integraciones de impresoras, los roles, los respaldos y el módulo de caja siguen pendientes.

## 1.0.0 — 20 de octubre de 2026

Primera base funcional: proyecto React/TypeScript y Android, catálogo, SQLite, cuadrícula/lista, carrito, cobro en efectivo, clientes, pendientes, historial y configuración. Validada con 24 pruebas de lógica/SQLite, 5 flujos de navegador y compilación Android. El enlace público original de fuentes se mantiene para conservar la entrega anterior.
