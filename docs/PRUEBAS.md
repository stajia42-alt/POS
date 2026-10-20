# Registro de verificación: AVILES POS 2.1, primera etapa

Fecha: 20 de octubre de 2026. Linux x86_64, Node 24.19.0, Chromium, JDK 21, Android SDK 36, Build Tools 36.0.0 y Gradle 8.14.3. La aplicación Android no se ejecutó en dispositivo ni emulador.

## Resultados ejecutados

| Comprobación                               | Resultado observado                                                                                   |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `npm test`                                 | 85 pruebas aprobadas en 5 archivos, sin fallidas ni omitidas; 12,76 s                                 |
| `npm run build`                            | TypeScript y bundle de producción correctos                                                           |
| `npm run test:e2e`                         | 18 recorridos aprobados en Chromium, sin fallidos ni omitidos; 1,5 min                                |
| `npm run android:debug`                    | BUILD SUCCESSFUL en 12 s; 126 tareas, 33 ejecutadas y 93 actualizadas                                 |
| `apksigner verify --verbose --print-certs` | APK válido; mismo certificado que los APK 1.0, 1.1 y 1.2                                              |
| Manifiesto empaquetado                     | `mx.aviles.pos`, versionCode 4, versionName 2.1.0                                                     |
| Integridad del APK                         | ZIP íntegro, SQLite ARM64 incluido, los 12 archivos de dist coinciden byte por byte con assets/public |
| `zipalign -c -P 16 4`                      | Alineación del paquete verificada; no certifica ejecución física con páginas de 16 KB                 |
| Inspección visual Chromium                 | PIN, apertura y mapa revisados a 1024 × 600; venta rápida conservada                                  |

Las 60 pruebas y los 14 recorridos anteriores se ejecutaron otra vez y siguen pasando. Se adaptaron al acceso por PIN y apertura obligatoria reales, sin añadir un acceso de prueba que omita la seguridad. Los registros históricos permanecen en `PRUEBAS-1.2.md`, `PRUEBAS-1.1.md` y `PRUEBAS-1.0.md`.

## 25 pruebas nuevas de lógica y SQLite

En `tests/restaurant.test.ts`:

- Identificación solo por PIN, exclusividad entre empleados activos, credenciales antiguas con sales diferentes, bloqueo global persistente y rechazo de PIN ambiguos heredados.
- Inactivación, reactivación con PIN exclusivo, restablecimiento administrativo, competencia entre altas y rollback al fallar la persistencia. No se exponen PIN ni índices derivados en DTO o auditoría.
- Apertura obligatoria para todos los métodos de pago, sin permitir desactivar el requisito desde configuración.
- Fondos y movimientos MXN/USD separados, tasa manual histórica, límites de saldo por moneda, conteo y diferencia al cerrar; cierre repetido inmutable y rollback.
- Migración 3→4 sobre turno y pago de efectivo antiguos conservando importes, pagos y estado. Rollback de toda la migración si falla la persistencia; integridad y claves foráneas.
- Áreas y mesas persistentes, límites del plano, apertura sin duplicados incluso al reintentar, cuenta vacía conservada, recuperación por empleado y aislamiento de cuentas rápidas.
- Transferencia de mesa, cambio de mesero, unión de cuentas completas, rechazo de unión incompatible, reintento y rollback sin duplicar líneas.
- Pago de mesa que libera solo su sesión dentro de la transacción de cobro e inventario; permisos y motivos de liberación/cancelación.
- Configuración de modos que conserva cuentas y evita desactivar mesas con cuentas abiertas.

Se utiliza SQLite real de sql.js; la persistencia web tiene pruebas con IndexedDB. La inyección de fallo de disco comprueba rollback, pero no equivale a un apagado físico de Android. Las migraciones anteriores y sus comprobaciones de fotos, clientes, pendientes y pagos permanecen.

## Cuatro recorridos nuevos de navegador

En `e2e/restaurant.spec.ts`, sobre el bundle de producción:

1. Acceso solo por PIN con teclado numérico, apertura obligatoria con fondos MXN/USD y tasa, consulta del corte sin cerrar y recuperación sin conexión.
2. Crear área y mesas desde formularios, editar posición por arrastre, abrir cuenta, guardar productos/cantidades/notas, conservar una cuenta rápida independiente y recuperar tras recarga sin conexión.
3. Transferir una cuenta, unir cuentas completas y cobrar; comprobar liberación y ausencia de recibos duplicados.
4. Configurar modo restaurante, cerrar y reabrir turno conservando la cuenta; acceso como cajero al mapa sin edición del plano.

Los recorridos anteriores cubren ventas, inventario, fotos, categorías, empleados/permisos, notas, clientes, descuentos/impuestos, lector por teclado, cancelaciones, cobros simples/combinados manuales, persistencia offline, migración de archivo antiguo, adaptación de tamaños y bloqueo de segunda pestaña.

Durante desarrollo se corrigieron el formato monetario USD, la primera pulsación después de arrastrar una mesa, dimensiones de formas y selectores de prueba. La ejecución completa final pasó; no se cuentan intentos fallidos anteriores como aprobados. Los datos y capturas de prueba pertenecen a contextos aislados y no se precargan en la aplicación entregada.

## APK generado

- `AVILES-POS-2.1.apk`: 13463277 bytes.
- SHA256: `82e5fb7068c6398eacca6e173b3ca3b3febbaa153dfd6b8d4f0b1db0ffe208d4`.
- APK de depuración, misma firma de desarrollo de las entregas anteriores y versionCode incrementado. No se incluyen claves de firma ni datos comerciales.
- El ZIP de fuentes contiene el proyecto Android, migraciones, pruebas y documentación. El ZIP completo añade este mismo APK, una guía y metadatos de verificación.

## Pendiente y límites

- Instalación/actualización sobre datos reales de 1.0/1.1/1.2, SQLite nativo, cierre forzado/reinicio, modo avión y recuperación en una tableta física.
- Rendimiento de PBKDF2, migración de numerosos PIN antiguos, mapas densos y catálogo en Galaxy Tab A11. No se han medido tiempos, memoria o consumo en ese equipo.
- Teclado táctil físico, orientación/insets, fotos nativas y lectores físicos.
- Impresoras ESC/POS, comandas, cobros de ventas USD, división/pagos parciales y autorización puntual por PIN de supervisor todavía no están implementados y no se declaran probados. Los USD verificados corresponden a fondos y movimientos de caja.
- Antes de actualizar desde 1.2, asignar PIN exclusivos a los empleados activos, especialmente a los administradores. Un PIN compartido no identifica al empleado; se rechaza. Si ya se migró, otro administrador con PIN exclusivo debe restablecerlo. Sin un administrador identificable no existe recuperación automática ni un acceso alternativo que omita la seguridad.
- No hay respaldo/restauración exportable de la base comercial. El bundle Git respalda código, no SQLite de la tableta.

El alcance de esta primera etapa y el punto exacto para continuar se encuentran en `AVILES_POS_PROGRESO.md` y `MODULOS-2.1.md`. Los métodos bancarios siguen siendo registros manuales; no se ha procesado una operación bancaria real mediante esta aplicación.
