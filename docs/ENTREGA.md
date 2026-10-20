# Entrega AVILES POS 2.1 — Primera etapa

Se amplía la misma aplicación 1.2, sin reemplazar el proyecto ni descartar sus módulos. Versión Android 2.1.0, versionCode 4, esquema SQLite 4. El objetivo completo y el orden de fases se conservan en `ESPECIFICACION-2.1.txt`.

## Funciones entregadas

- Acceso solo por PIN, teclado táctil, PIN exclusivo para activos, bloqueo persistente y transición de credenciales anteriores con sal propia.
- Apertura obligatoria de caja y recuperación de cuenta por empleado. Ningún pago nuevo sin turno, para todos los métodos.
- Fondos/movimientos/contado/diferencias MXN y USD separados; tasa manual histórica del turno. Corte de consulta sin cierre.
- Modos Venta rápida/Restaurante/Ambos con preferencias persistentes, mismo catálogo y caja. Conserva la estructura de ventas acordada.
- Editor de áreas y mesas: formas, capacidades, dimensiones, posición por arrastre/teclado/formulario, archivo lógico sin destruir referencias históricas.
- Mesas disponibles, ocupadas, pendientes y seleccionadas, con estado textual, tiempo y total.
- Abrir/recuperar cuentas, autosave, volver al mapa, transferir mesa, unir cuentas completas, cambiar mesero, liberar vacías o cancelar administrativamente con motivo.
- Cobro/stock/turno/empleado/liberación de mesa transaccionales. Recibo e historial identifican la mesa y el empleado que cobró.
- Conserva inventario, fotos, clientes, pendientes, pagos e historial anteriores, y amplía permisos/auditoría.

## Pendiente y alcance limitado

Esta entrega no implementa transportes de impresoras, áreas de preparación, comandas, cobros USD, cambio en otra moneda, división por productos/importes/personas, abonos confirmados, vínculo de varias mesas a una cuenta, ni autorizaciones puntuales mediante PIN de supervisor. No se presentan como funciones terminadas. Los fondos USD de caja no constituyen pagos USD.

Siguen pendientes los módulos anteriores de variantes/compuestos, devoluciones, fidelización, compras/proveedores, reportes/exportaciones generales y respaldos/restauración. El editor no obliga a posiciones sin superposición; el administrador puede reubicar o ampliar mesas. No hay perfilado en catálogo grande ni mediciones en la tableta física.

## Migración y compatibilidad

Migración 4 aditiva y transaccional sobre 1–3, conservando archivo e importes anteriores. Los pagos anteriores siguen siendo MXN. No se inventan tasas históricas, usuarios, mesas o PIN originales. Los PIN heredados ambiguos no conceden acceso: asigna códigos exclusivos antes de actualizar o restablécelos con otro administrador exclusivo. Sin acceso administrativo exclusivo no existe recuperación automática. No borrar datos para resolverlo.

Se conserva el identificador y se verifica la misma firma debug que las entregas anteriores. Es APK de depuración; no firma comercial de producción. No desinstalar para actualizar. La copia de restauración Git es del código y no respalda ventas de Android.

La compilación y validación del archivo no prueban la ejecución o migración nativa. Faltan instalación/actualización con datos, SQLite nativo tras cierre forzado/reinicio, selector de fotos, teclado/táctil e insets, rendimiento y consumo en Galaxy Tab A11 y hardware de impresoras.

Guía: [MODULOS-2.1.md](MODULOS-2.1.md). Estado por fase y continuación: [AVILES_POS_PROGRESO.md](../AVILES_POS_PROGRESO.md). Resultados ejecutados: [PRUEBAS.md](PRUEBAS.md).
