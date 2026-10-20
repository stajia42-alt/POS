# AVILES POS — Progreso y continuación

Versión actual: **1.2.0**, Android `versionCode` **3**, SQLite esquema **3**. Base conservada: entregas 1.0 y 1.1, incluyendo pagos combinados.

Punto de restauración: etiqueta `aviles-pos-restauracion-1.1`, commit `42c28b8`. Rama de desarrollo: `desarrollo-aviles-pos-1-2`. Se conserva el mismo proyecto, identificador `mx.aviles.pos` y distribución de ventas; no se crea una aplicación sustituta.

## Implementado en esta etapa

- Acceso local del propietario y empleados: nombre, identificador único, PIN, rol y activo/inactivo. Roles administrador/supervisor/cajero con permisos individuales efectivos en la capa comercial. Cambio de empleado conserva el ticket compartido.
- PIN PBKDF2-SHA256 con sal individual y 600000 iteraciones; sin texto plano. Bloqueo temporal persistente tras intentos fallidos, restablecimiento por otro administrador, protección del último administrador recuperable.
- Inventario: entradas con costo promedio ponderado opcional, salidas, ajustes con motivo, correcciones desde catálogo, conteos físicos (incluido delta cero), umbrales/alertas, valoración a costo y movimientos paginados/filtrados.
- Cada movimiento nuevo registra fecha/hora, empleado y nombre, producto, cantidad, motivo, antes/después. El cobro descuenta stock controlado dentro de la misma transacción de pagos.
- Caja opcional: apertura/fondo, ingresos/egresos/retiros con motivo, arqueo, cierre y diferencias. Ventas con turno y empleado; efectivo aplicado separado del recibido/cambio; historial/reporte de cierres con filtros por fecha, ventas y pagos.
- Auditoría de accesos y acciones administrativas, consultable en Empleados (últimas 200 acciones). No incluye PIN ni presume autenticado a un acceso fallido.
- Manual de operación y permisos: `docs/MODULOS-1.2.md`. Cambios, arquitectura, pruebas y fuentes Android incluidos.

## Estado de las once fases solicitadas

| Fase                     | Implementado y alcance disponible                                                             | Pendiente para declarar la fase completa                                                                        |
| ------------------------ | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 1. Inventario            | Puntos 1–9, 11, 12 y 14: stock, costos, movimientos, alertas, conteos y descuento de venta    | Variantes (10), compuestos (13), reposición por devolución (15)                                                 |
| 2. Caja                  | Puntos 1–14: apertura, movimientos, arqueo, cierre, diferencias, historial, ventas y reportes | Reimpresión autorizada (15), dependiente de impresoras                                                          |
| 3. Empleados             | Accesos, roles, permisos por persona, activos/inactivos, no PIN plano                         | Operaciones de devolución/reimpresión y aplicación efectiva de sus permisos al existir esas funciones           |
| 4. Clientes/fidelización | Registro, búsqueda, teléfono/correo/notas, asignación e historial básico previo               | Puntos, canje, recompensas, historial/ajustes de puntos                                                         |
| 5. ESC/POS               | Sin integración implementada; no hay botones que simulen impresión                            | Bluetooth, USB, LAN, detección, configuración, cola, comprobación, anchos, logotipo y cajón                     |
| 6. Reportes              | Historial de ventas previo; valoración de inventario y reportes de turnos nuevos              | Módulo general por fechas/empleado/producto/categoría/hora, devoluciones, utilidad histórica, gráficas, CSV/PDF |
| 7. Restaurantes          | Tickets pendientes y notas de preparación previos                                             | Mesas, meseros, transferencias/unión/división, pagos parciales, modificadores, comandas, áreas/estados          |
| 8. Compras               | Entradas manuales de mercancía con costo                                                      | Proveedores, órdenes, recepción parcial, pendientes e informes de compras                                       |
| 9. Configuración         | Negocio, MXN, tasa añadida, datos/mensaje de recibo, unidades por producto y control de caja  | Logotipo, numeración configurable, impresión, catálogo configurable de pagos/descuentos, exportación/respaldos  |
| 10. Respaldo/seguridad   | Migraciones, transacciones, control de acceso y auditoría                                     | Respaldo completo exportable y restauración validada; no se sustituye por guardar el APK                        |
| 11. Android              | Proyecto y recursos offline, imágenes reducidas, orientación horizontal, compilación          | Ejecución/perfilado en Galaxy Tab A11, SQLite nativo y actualización física con datos, periféricos              |

Ninguna fase con pendientes se declara completa. Esta versión es una entrega funcional de continuación, no el sistema comercial completo solicitado.

## Verificación

Se aprobaron **60 pruebas de lógica/SQLite** y **14 recorridos de navegador**. Compilación Android correcta; APK, firma anterior y recursos empaquetados verificados. Los resultados detallados se mantienen en `docs/PRUEBAS.md`. Las pruebas de navegador se ejecutan sobre SQLite WASM/IndexedDB reales, con datos aislados; no certifican el plugin SQLite nativo. La validación física de Android e impresoras sigue pendiente.

## Cambios de base

Migración 3 aditiva y transaccional sobre esquemas 1/2. Tablas nuevas: `employees`, `employee_permissions`, `administrative_actions`, `shifts`, `cash_movements`, `inventory_counts`. Añade umbral a productos, empleado/turno a ventas y trazabilidad a movimientos. Conserva pagos, fotos, clientes, pendientes, números e importes. La prueba de rollback conserva esquema 2 si falla el disco y permite reintentar.

Los usuarios, turnos y existencias anteriores desconocidos permanecen nulos o vacíos en registros antiguos. No se inventan datos históricos. Al actualizar se crea el acceso del propietario sin borrar negocio. El control de caja queda inicialmente desactivado; se activa expresamente en Configuración.

## Limitaciones y riesgos conocidos

- Sin tableta física ni emulador ejecutado en esta nube. Compilar y verificar la firma no prueba la actualización o ejecución en la Samsung.
- APK de depuración. No se ha preparado firma de producción comercial. Se debe instalar sobre el anterior con la misma firma, sin desinstalar ni borrar datos.
- Todavía no hay respaldo exportable/restauración ni recuperación externa del único PIN administrativo. El APK no contiene los datos de negocio.
- Acceso local por PIN, sin cifrado de SQLite. No protege de extracción o modificación por quien controle el sistema operativo.
- Cantidades enteras; no venta por peso fraccionario. Sin devolución de ventas pagadas. Tarjeta/transferencia se registran manualmente, sin integración bancaria.
- Un solo turno abierto y ticket activo compartido por dispositivo; sin sincronización entre dispositivos.
- Actividad administrativa muestra las últimas 200 acciones; inventario sí dispone de paginación de movimientos. Catálogos/fotos, historial de ventas y reportes de caja completos requieren perfilado para grandes volúmenes.
- No se ha medido rendimiento ni consumo en Galaxy Tab A11. No hay compatibilidad de impresoras certificada.

## Punto exacto para continuar

1. Retomar `desarrollo-aviles-pos-1-2`. No reiniciar la base. Ejecutar `npm ci`, `npm test`, `npm run build`, `npm run test:e2e`; para Android activar `scripts/cloud-env.sh` y ejecutar `npm run android:debug`.
2. Completar la fase 1 con una migración **4** nueva: modelo de variantes/atributos y componentes, formularios del catálogo y selección al vender, instantáneas de la variante vendida. La expansión de componentes y el descuento deben ejecutarse en la transacción de `Pos.checkoutPayments` usando el libro de inventario; conservar los productos anteriores como productos simples.
3. Implementar devoluciones vinculadas a líneas/pagos originales: impedir devolver más unidades de las vendidas, conservar importes originales, autorizar `refunds`, reponer stock correctamente y registrar salida de caja en el turno abierto que corresponda. Probar repeticiones, devolución parcial y rollback, sin cambiar el cierre histórico original.
4. Integrar reimpresión autorizada al desarrollar la fase 5: exigir `reprint`, transacciones de cola y transporte Android real; nunca declarar éxito sin la confirmación que permita el protocolo. Esto cierra los pendientes de fases 2 y 3.
5. Continuar fidelización, impresoras, reportes, restaurantes, compras, configuración y respaldo según la especificación. Capturar costo histórico por línea antes de afirmar utilidad bruta histórica. No confundir cobro combinado completo con anticipo/cobro parcial.
6. Antes de uso comercial, probar instalación/actualización con datos, migración, modo avión, cobros, cierre forzado y reinicio en la Galaxy Tab A11; probar cada impresora/transporte físico y medir rendimiento con catálogo grande. Conservar claves fuera del repositorio y diseñar el respaldo/restauración antes de depender comercialmente de los datos locales.
