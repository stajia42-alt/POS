# Registro de verificación: AVILES POS 1.1

Fecha: 20 de octubre de 2026. Entorno Linux x86_64, Node 24.19.0, JDK 21, Android SDK 36, Build Tools 36.0.0 y Gradle 8.14.3. La aplicación Android no se ejecutó en un dispositivo ni emulador.

## Resultados finales

| Comando o comprobación                    | Resultado observado                                                                              |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `npm test`                                | 39 pruebas aprobadas en 3 archivos; sin fallidas ni omitidas                                     |
| `npm run build`                           | TypeScript y bundle Vite correctos; también ejecutado por android:debug                          |
| `npm run test:e2e`                        | 11 flujos aprobados en Chromium, sobre producción web; sin fallidos ni omitidos                  |
| `npm run android:debug`                   | BUILD SUCCESSFUL; recursos web sincronizados, 126 tareas, compilación incremental de 11 s        |
| `apksigner verify --verbose`              | APK válido, firmado con esquema v2                                                               |
| Comparación de certificados APK 1.0 / 1.1 | Mismo SHA256 del certificado de desarrollo                                                       |
| Manifiesto del APK                        | Identificador mx.aviles.pos, versionCode 2, versionName 1.1.0                                    |
| Integridad del APK                        | ZIP íntegro; cada recurso web empaquetado coincide byte por byte con dist; SQLite ARM64 incluido |

## Pruebas de lógica y persistencia

Las 24 pruebas originales se conservaron. Siguen cubriendo dinero en centavos, formato MXN, límites, migración repetida, integridad y claves foráneas, catálogos, notas, cantidades, persistencia, pendientes, precio histórico, cancelaciones, inventario, efectivo, cobros concurrentes y fallo de escritura. Se mantienen las pruebas del archivo SQLite en IndexedDB.

Se añadieron 15 casos para los pagos ampliados:

- Registro simple de efectivo, tarjeta, transferencia y otro método.
- Distribución en centavos, diferencia entre aplicado y recibido y cambio exclusivamente en efectivo.
- Rechazo de importes menores/mayores al total, cantidades inválidas, método desconocido, referencia excesiva y más de 10 partes.
- Ticket gratuito y varias partes del mismo método.
- Migración de una base esquema 1 con una venta pagada, su pago en efectivo, producto, foto, cliente, línea con nota y ticket pendiente. Se verifica la reapertura, la integridad y la conservación de los datos anteriores.
- Fallo de persistencia durante migración: se conserva esquema 1 y se puede reintentar a esquema 2.
- Venta con los cuatro métodos: se conservan orden, referencias, aplicado, recibido y cambio al reabrir la base.
- Importe incompleto o excesivo: no quedan pagos ni movimientos parciales y el ticket permanece abierto.
- Solicitudes repetidas y concurrentes del mismo cobro combinado, incluso con otros métodos en el reintento: devuelven los pagos originales sin duplicar ventas ni inventario.
- Fallo al confirmar un reparto: todos los pagos y el stock se revierten y el reintento funciona al recuperar la persistencia.

El motor es SQLite real de sql.js. El fallo de persistencia se inyecta expresamente para comprobar rollback. Esto no equivale a una prueba del plugin nativo en Android.

## Navegador: 11 flujos

Se conservan los cinco flujos de 1.0: venta con foto, descuento e impuesto; operación y recarga offline; tamaños tableta/teléfono y teclado; bloqueo de una segunda pestaña; catálogo de varias filas, categorías, búsqueda y clientes. Se añadieron:

1. **Combinado:** total $101.01; tarjeta $40.01, efectivo aplicado $31.00 con recibido $50.00 y cambio $19.00, transferencia $30.00. Un centavo faltante o sobrante bloquea el cobro. Dos pulsaciones de confirmación producen una sola venta. Referencias, métodos y cambio persisten en el historial tras recargar.
2. **Tarjeta manual offline:** guarda referencia y muestra el método real, sin campo de efectivo ni cambio.
3. **Transferencia manual offline:** conserva referencia al recargar sin conexión y consultar el recibo.
4. **Otro método offline:** registro manual e historial con referencia persistente.
5. **Editar reparto en teléfono:** eliminar una parte recupera el cobro simple; el importe exacto y los controles funcionan sin desbordamiento a 390 × 844.
6. **Actualizar una base 1.0 desde IndexedDB real:** se coloca un archivo SQLite de esquema 1 antes de iniciar la aplicación. La 1.1 abre el recibo original con su cambio y después permite registrar una nueva venta con tarjeta.

Todos los datos se crean en contextos de prueba aislados. No se precargan productos, pagos ni fotografías de demostración en el perfil real. Las capturas generadas por pruebas documentan la interfaz, no la ejecución Android física.

## APK generado para validación local

- Archivo: `artifacts/AVILES-POS-1.1-debug.apk`.
- Tamaño: **13,431,973 bytes**.
- SHA256: `3b0aff11778d1f525bba4339bb96f4a5c8372f1f5f63761ed5a042d168822e0d`.
- Misma firma debug que la versión 1.0 y versionCode incrementado a 2.
- El ZIP público de fuentes no incluye el APK ni claves de firma; incluye el proyecto Android y el procedimiento de compilación.

## Pendiente de validar físicamente

- Instalación en la Samsung Galaxy Tab A11, orientación horizontal real, fotografía con selector nativo, teclado y barras del sistema.
- SQLite nativo y migración 1 a 2 sobre una instalación real con datos.
- Cobro combinado en modo avión, cierre forzado, reinicio de Android y recuperación de tickets/historial.
- Actualización de APK 1.0 a 1.1 sin desinstalar ni borrar información. Se verificaron certificado y versionCode, pero no se instaló la actualización.
- Lectores de códigos físicos. Impresoras, roles, caja, devoluciones y respaldos siguen fuera del alcance implementado.

Tarjeta y transferencia se registran manualmente. No existe integración bancaria, por lo que no se afirma haber procesado una operación real en una terminal o banco. El registro histórico de la primera entrega se conserva en [PRUEBAS-1.0.md](PRUEBAS-1.0.md).

## Entorno reutilizable

El instalador existente y las dependencias no cambian. Se guardó una actualización de start_skill con los 11 flujos y la migración de pagos. La actualización del borrador no publica ni modifica por sí sola el entorno activo; para conservar esos nuevos ajustes en una versión publicada, se deben revisar/guardar en configuración y publicar. La descarga de fuentes por GitHub es independiente de esa publicación.
