# AVILES POS — Progreso 2.1

Versión: **2.1.0, primera etapa**. Fecha: **20 de octubre de 2026**. Android `versionCode` **4**, paquete `mx.aviles.pos`, SQLite esquema **4**.

Continúa sobre **1.2.0**, commit `f8fd1c7f47166e49ba7a8aed5577f89dd97a60cc`, conservando los módulos anteriores. Rama: `desarrollo-aviles-pos-2-1`. Punto de restauración: etiqueta `aviles-pos-restauracion-1.2`; respaldo de código Git bundle verificado antes de editar. Ese respaldo de código no contiene los datos comerciales de la tableta.

Solicitud actual completa: `docs/ESPECIFICACION-2.1.txt`. El alcance anterior y sus pendientes no desaparecen; se conserva en `docs/PROGRESO-1.2.md`.

## Funciones nuevas

- Acceso normal solo con PIN, identificación automática, teclado numérico táctil y cambio de empleado. Sin usuario solicitado al acceder. Hashes con sal, índice PBKDF2 y bloqueo global persistente de intentos, incluso con PIN desconocidos. Prohíbe duplicados entre empleados activos; reactivar exige PIN exclusivo.
- Apertura obligatoria tras acceso si no existe turno. Fondo MXN, fondo USD, tasa manual de cuatro decimales, empleado, fecha/hora y regreso a la operación guardada. No se registran pagos de ningún método sin turno abierto. No puede desactivarse la caja.
- Fondos, movimientos y cierre separados por moneda. Efectivo esperado/contado/diferencia MXN y USD. Tasa de apertura histórica. Corte de consulta sin cerrar turno.
- Configuración Venta rápida / Restaurante / Ambos. Control visible en barra principal y último modo por empleado. Conserva la distribución de venta rápida, inventario y métodos existentes.
- Áreas y mapa persistente: crear/editar/retirar áreas y mesas, formas, capacidad, dimensiones, posición por arrastre/teclado/formulario, límites del plano. Estados disponible/ocupada/pendiente de cobro/seleccionada con texto y color, tiempo y total.
- Cuentas de mesa: creación/recuperación sin duplicados, autosave de productos/cantidades/notas, regreso al mapa, transferencia de mesa, unión de cuentas completas, cambio de mesero, liberación vacía o administrativa con motivo/permisos. Una mesa pendiente no puede eliminarse del plano.
- Recuperación de cuenta rápida o mesa por empleado al volver a acceder, incluso con cambio de turno. Cobra, descuenta stock y libera solo la cuenta liquidada en una transacción. Uniones conservan referencias y detalle original en auditoría.
- Variables visuales compartidas, controles reutilizables, estados semánticos y ajustes para tableta horizontal. Se corrigió el bloqueo de la primera pulsación después de un arrastre y el recorte de datos en tarjetas pequeñas durante pruebas.

## Estado del orden de implementación 2.1

| Fase                 | Estado de esta entrega                                                                   | Pendiente                                                                                          |
| -------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 1. Analizar          | Realizada sobre repositorio limpio 1.2                                                   | —                                                                                                  |
| 2. Respaldar/rama    | Rama, etiqueta y bundle Git verificado                                                   | Respaldo exportable de datos de Android continúa pendiente                                         |
| 3. PIN               | Implementado y probado en SQLite/UI                                                      | Recuperación externa; resolver PIN heredados ambiguos requiere administrador con PIN exclusivo     |
| 4. Apertura          | Implementada: obligatoria, fondos MXN/USD y tasa manual                                  | Validación física de Android                                                                       |
| 5. Dos modos         | Implementados y persistentes, mismo catálogo/caja                                        | —                                                                                                  |
| 6. Mapa              | Editor y cuentas operativos, transferencia, unión y mesero                               | Productos específicos, división y asociación de varias mesas a una cuenta                          |
| 7. Guardado          | Productos/cantidades/notas, mesas, posiciones confirmadas, modo y operación por empleado | Prueba de cierre forzado/reinicio Android físico; modificadores aún no existen                     |
| 8. Impresoras/áreas  | No implementada en esta etapa                                                            | Transportes ESC/POS reales Bluetooth/USB/LAN, configuración y áreas de preparación                 |
| 9. Comandas          | No implementada                                                                          | Separación por áreas, deltas, estados, cola, confirmación/reintento sin duplicados                 |
| 10. Cobros USD       | **No implementados**; fondos USD de caja no equivalen a cobros                           | Conversión de ventas, recibido/cambio por moneda, tasa histórica por pago y pago combinado MXN/USD |
| 11. División         | No implementada                                                                          | Productos/importes/personas, pagos parciales y saldo, trazabilidad y liberación tras liquidar      |
| 12. Autorización PIN | Permisos directos conservados y ampliados                                                | Solicitante/autorizador, motivo y autorización por operación mediante PIN ajeno                    |
| 13. Diseño           | Sistema visual y adaptación de nuevas pantallas implementados                            | Medición/ajuste físico en Galaxy Tab A11; personalización/impresión de tickets                     |
| 14. Regresión        | Resultados ejecutados en `docs/PRUEBAS.md`                                               | No se declaran probadas funciones aún no implementadas                                             |
| 15. Android          | Proyecto conservado; resultado de compilación/firma en `docs/PRUEBAS.md`                 | Instalación, migración y ejecución físicas                                                         |

No se declaran completas las fases que conservan pendientes. El objetivo comercial completo sigue en desarrollo.

## Cambios de SQLite

Migración **4**, aditiva y transaccional. Conserva migraciones 1–3, archivo nativo `aviles_pos`, IndexedDB `aviles-pos-v1`, fotos, clientes, pagos e importes anteriores.

- `employees.pin_lookup` e índice único parcial de PIN derivado para activos. Los hashes/sales originales permanecen; no se puede derivar el PIN original desde ellos ni inventar el índice de una credencial antigua sin conocer el PIN.
- Configuración de sal de instalación y contador global de acceso. Ningún PIN plano.
- Campos USD/tasa/contado/diferencia en `shifts`; moneda por movimiento de caja. Los registros anteriores siguen siendo MXN con fondo USD cero.
- `dining_areas`, `dining_tables`, `table_sessions` y unicidad de sesión abierta por mesa.
- `sales.table_name`, `waiter_id`, `waiter_name`, `merged_into`, preservando los campos comerciales originales.
- `employee_workspace` con modo, vista, cuenta activa y cuenta rápida por empleado. No duplica líneas ni pagos para recuperar una operación.
- Permisos nuevos para mapas, atención, transferencia y liberación. Los antiguos se conservan.

Se verifican rollback de migración y conservación de datos; no se reinicia ni reconstruye destructivamente la base. Una versión anterior rechazará el esquema 4; no se debe instalar una versión antigua sobre esta base.

## Verificación y límites

El registro de comandos, pruebas ejecutadas, APK y hashes se mantiene en `docs/PRUEBAS.md`. La guía operativa está en `docs/MODULOS-2.1.md`. Navegador usa SQLite WASM/IndexedDB reales en contextos de prueba aislados. Compilar Android no certifica SQLite nativo, táctil físico ni rendimiento en Galaxy Tab A11.

- APK de depuración; firma de desarrollo conservada para actualizar. Sin dispositivo/emulador ejecutado ni impresora física probada.
- PIN repetidos heredados: un PIN ambiguo no inicia sesión. Configurar PIN exclusivos en 1.2 antes de actualizar, especialmente del administrador. Si ya se migró, otro administrador con PIN exclusivo debe restablecerlos. Sin ninguno no hay recuperación automática; no se proporciona un acceso que omita la seguridad.
- Acceso local sin cifrado de SQLite, sin respaldo/restauración de datos ni recuperación externa del único PIN administrativo.
- Un dispositivo, una caja abierta, sin sincronización entre tabletas. Las operaciones de cada empleado se recuerdan, pero mesas y pendientes siguen compartidos y sujetos a permisos.
- Solo unidades enteras, pagos de venta en MXN y cierre completo del ticket. No cobrar USD ni anticipos hasta implementar las fases correspondientes.
- No hay devoluciones, puntos, variantes/compuestos, compras/proveedores, exportaciones generales ni respaldos; esos pendientes anteriores siguen vigentes.
- Mapas densos/superpuestos, catálogos grandes y tiempos de migración de muchos PIN antiguos requieren perfilado. Posiciones se guardan al finalizar el gesto; no se afirma conservar un arrastre interrumpido antes de soltar.
- El estado Pendiente de cobro no representa un pago. Unir cuentas completas no equivale a división o cobro parcial. Un mesero asignado no sustituye al empleado que ejecutó el cobro.

## Punto exacto para continuar

1. Retomar `desarrollo-aviles-pos-2-1`, leer esta guía y `docs/MODULOS-2.1.md`. Ejecutar `npm ci`, `npm test`, `npm run build`, `npm run test:e2e`; Android con `source scripts/cloud-env.sh` y `npm run android:debug`. No empezar otro proyecto ni modificar migraciones 1–4.
2. Continuar **fase 8** con migración 5: impresoras y áreas de preparación, producto/área, configuración de funciones y transportes nativos Android para Bluetooth, USB OTG y TCP LAN. Conservar parámetros y errores en SQLite. Probar protocolos y permisos reales; no declarar impresión exitosa por aceptar bytes en una cola.
3. Fase 9: comandas numeradas, instantáneas/deltas por línea/área, cola e idempotencia. Distinguir pendiente, enviado y resultado incierto; una impresión incierta requiere resolución para evitar doble preparación. Añadir pruebas sin afirmar validación física sin hardware.
4. Fase 10: ampliar pagos con moneda/recibido/conversión/tasa/cambio, reglas precisas de redondeo y neto físico por moneda. Conservar los pagos MXN anteriores y el cálculo de stock; no reutilizar `opening_usd` como un pago. Las tasas de turno ya son históricas, pero cada pago USD necesitará su propia instantánea.
5. Fase 11: modelo de saldo/abonos y divisiones con referencia a línea original, sin reutilizar el cobro completo como si fuera un anticipo. Transferencia de productos y asociación de mesas deben conservar impuestos/descuentos/redondeos y no liberar mesas con saldo.
6. Fase 12: autorizaciones puntuales con PIN del autorizador, permisos vigentes, motivo, vínculo a operación exacta y registro de solicitante/ejecutor; no cambiar la sesión global como sustituto de una autorización.
7. Completar personalización/impresión de tickets y los pendientes de 1.2. Antes de uso comercial, implementar respaldo/restauración y probar actualización con datos, cierre forzado, modo avión, táctil, memoria/rendimiento e impresoras en la Galaxy Tab A11 real.
