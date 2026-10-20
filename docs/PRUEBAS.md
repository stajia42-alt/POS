# Registro de verificación: AVILES POS 1.2

Fecha: 20 de octubre de 2026. Linux x86_64, Node 24.19.0, Chromium, JDK 21, Android SDK 36, Build Tools 36.0.0 y Gradle 8.14.3. La aplicación Android no se ejecutó en dispositivo ni emulador.

## Resultados ejecutados

| Comprobación                               | Resultado observado                                                                                   |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `npm test`                                 | 60 pruebas aprobadas en 4 archivos, sin fallidas ni omitidas                                          |
| `npm run build`                            | TypeScript y bundle de producción correctos                                                           |
| `npm run test:e2e`                         | 14 flujos aprobados en Chromium (aprox. 1 minuto), sin fallidos ni omitidos                           |
| `npm run android:debug`                    | BUILD SUCCESSFUL en 12 s; 126 tareas, 33 ejecutadas y 93 actualizadas                                 |
| `apksigner verify --verbose --print-certs` | APK válido; certificado SHA256 igual a APK 1.0 y 1.1                                                  |
| Manifiesto empaquetado                     | `mx.aviles.pos`, versionCode 3, versionName 1.2.0                                                     |
| Integridad del APK                         | ZIP íntegro, SQLite ARM64 incluido, los 12 archivos de dist coinciden byte por byte con assets/public |
| Inspección visual Chromium                 | Acceso, inventario y formulario de empleados revisados a 1280 × 800; interfaz de ventas conservada    |

Las 39 pruebas y los 11 flujos anteriores siguen pasando. Sus resultados históricos se conservan en [PRUEBAS-1.1.md](PRUEBAS-1.1.md) y [PRUEBAS-1.0.md](PRUEBAS-1.0.md). No se usa su resultado anterior como sustituto de la regresión actual.

## 21 pruebas nuevas de lógica y SQLite

En `tests/operations.test.ts`:

- Acceso requerido antes de consultar/modificar, bloqueo de sesión y posterior acceso correcto.
- PIN derivado con sal distinta entre empleados que usan el mismo PIN; DTO y auditoría sin credenciales.
- Permisos comprobados llamando directamente a los servicios: cajero sin acceso a empleados, inventario, descuentos, cancelaciones o recibos ajenos; venta y recibo propio atribuidos correctamente.
- Revocación de permisos e inactivación aplicada a otra sesión ya abierta.
- Protección del último administrador y restablecimiento del PIN sin revelar el anterior.
- Intentos fallidos/bloqueo temporal conservados tras reabrir SQLite.
- Un bloqueo explícito cancela un login todavía en curso.
- Entradas con costo promedio, salidas y ajustes con actor, motivo y antes/después.
- Conteos coincidentes y discrepantes, incluido cero; alerta y persistencia al reabrir.
- Rechazo de stock insuficiente, fracciones, motivo vacío y producto sin seguimiento.
- Corrección desde el formulario de producto con motivo obligatorio y movimiento conservado.
- Paginación de 52 movimientos sin duplicar/omitir, filtros y rechazo de rango invertido.
- Fallo de persistencia revierte conteo, cantidad, costo y auditoría.
- Sin caja activa se mantiene el cobro previo; al activar exige turno y no permite dos abiertos ni desactivar con turno abierto.
- Caja con pago combinado, diferencia entre aplicado y recibido, ingreso, egreso, retiro y arqueo; cierre persistente e inmutable al repetir.
- Rechazo de cobro/movimiento sobre turno cerrado sin pagos ni stock parciales; nuevo turno independiente.
- Retiros limitados al esperado, permisos de cierre/movimientos y protección de consultas detalladas.
- Límite de efectivo validado tanto en cobros como movimientos.
- Fallo al cobrar revierte venta, stock, caja y auditoría; reintentos concurrentes no duplican.
- Fallo al cerrar conserva turno abierto sin arqueo parcial.
- Migración esquema 2→3 conserva producto/foto/costo/stock/movimientos antiguos sin inventar actor o antes/después; fallo de disco revierte el esquema y permite reintentar.

Los tests existentes de actualización desde esquema 1 ahora migran hasta 3 y siguen comprobando pagos originales, fotos, pendientes, clientes, líneas e integridad. Se utiliza SQLite real de sql.js; la persistencia web tiene pruebas con IndexedDB. La inyección de fallo de disco valida rollback; no equivale a simular un apagado físico del dispositivo.

## Tres flujos nuevos de navegador

En `e2e/operations.spec.ts`, sobre la producción web:

1. Crear producto controlado; entrada con costo; conteo con diferencia; alerta; reinicio sin conexión con acceso por PIN; historial atribuido al usuario; ancho 390 sin desbordamiento de página.
2. Crear cajero; entrar con su PIN; comprobar ausencia de módulos restringidos; cambiar PIN y permiso individual como administrador; entrar con el nuevo PIN y acceder al historial; desactivar empleado.
3. Activar caja; intentar cobrar redirige a apertura; registrar fondo; vender con recibido mayor y cambio; retirar efectivo; arqueo con faltante; cerrar; recargar sin conexión y consultar reporte persistente; abrir nuevo turno.

Los 11 flujos anteriores cubren ventas, fotos, categorías, notas, clientes, descuentos/impuestos, lector por teclado, cancelaciones, cobros simples/combinados y manuales offline, migración de archivo antiguo en IndexedDB, adaptación de tamaños y bloqueo de segunda pestaña. Se adaptó su inicio/reapertura al acceso local real; no se añadió un bypass de autenticación.

Durante desarrollo se corrigieron etiquetas accesibles con texto de ayuda y selectores de los nuevos recorridos. La ejecución completa final pasó; no se cuentan intentos fallidos anteriores como aprobados.

## APK generado

- `AVILES-POS-1.2.apk`: 13447613 bytes.
- SHA256: `e1c0339b295054aa16c59ee177f1a2ca0763e6e3a9c4a07791c28b3854092590`.
- APK de depuración, misma firma de desarrollo anterior y versionCode incrementado. Sin claves en las fuentes ni archivos de entrega.
- El ZIP de fuentes contiene el proyecto Android, migraciones, pruebas y documentación. El ZIP completo añade el instalador y una guía de uso, sin datos comerciales.

## Pendiente en dispositivo físico

- Actualización de 1.0/1.1 a 1.2 sobre una instalación con datos, sin desinstalar.
- Apertura de SQLite nativo, migración, persistencia tras cierre forzado/reinicio y cobros/turnos en modo avión.
- Rendimiento de PBKDF2 y del catálogo en Galaxy Tab A11; tiempos, consumo y memoria no se han medido en esa tableta.
- Teclado táctil, selección nativa de foto, orientación/insets y lectores físicos.
- Impresoras y conexiones reales: siguen sin implementación en esta entrega.

No se declara uso comercial certificado, rendimiento medido en Android ni validación física de hardware. Los métodos bancarios siguen siendo registros manuales; no se ha procesado una operación real de banco mediante esta aplicación.
