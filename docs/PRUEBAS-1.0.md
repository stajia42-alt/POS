# Registro de verificación

Fecha: 20 de octubre de 2026. Plataforma de ejecución: Linux x86_64 en el entorno de nube del proyecto. No se conectó una tableta Android ni un periférico.

## Resultados finales

| Comando / comprobación                                                                 | Resultado observado                                                                                                      |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `bash scripts/setup-cloud.sh`                                                          | Correcto: reutilización del SDK/JDK, `npm ci`, build web, sincronización Capacitor, 24 pruebas y comprobación Java/Javac |
| `npm run build`                                                                        | TypeScript y Vite: correctos                                                                                             |
| `npm test`                                                                             | 24 pruebas ejecutadas y aprobadas, 2 archivos; sin omitidas ni fallidas                                                  |
| `npm run test:e2e`                                                                     | 5 flujos ejecutados y aprobados en Chromium; sin omitidos ni fallidos                                                    |
| Inicio Vite con puerto 5173                                                            | Se abrió la aplicación, se creó un producto, se agregó al ticket y se conservó al recargar en un contexto temporal       |
| Insets del sistema simulados en CSS                                                    | Con insets superior/inferior de 24 px y laterales de 20 px, COBRAR permanece dentro del área disponible a 1024 × 600     |
| `android/gradlew -p android --no-daemon --max-workers=2 --console=plain assembleDebug` | `BUILD SUCCESSFUL`; compilación final con JDK 21 y Android SDK 36                                                        |
| `apksigner verify --verbose`                                                           | Firma APK válida, esquema v2, un firmante debug                                                                          |
| Integridad ZIP y recursos APK                                                          | Correcta; se compararon todos los archivos empaquetados en `assets/public` con el build web verificado                   |
| Plugin SQLite en el APK                                                                | Registrado en `capacitor.plugins.json`; incluye `libsqlcipher.so` para ARM64, ARMv7, x86 y x86_64                        |
| Manifiesto compilado                                                                   | `mx.aviles.pos`, versión 1.0, mínimo API 24, objetivo API 36, `sensorLandscape` declarado                                |

Las compilaciones emitieron advertencias informativas de Gradle sobre `flatDir` del proyecto generado y uso de APIs no comprobadas en el plugin SQLite. No impidieron generar ni verificar el APK. No se modificaron las dependencias para ocultarlas.

## Lógica y SQLite: 24 pruebas

Se ejecutan contra el motor SQLite real de `sql.js`, no contra un repositorio comercial simulado. Incluyen:

- Conversión decimal a centavos, coma decimal, formato MXN y límites; rechazo de importes negativos, exponenciales, no numéricos o con exceso de decimales.
- Redondeo de impuestos/descuentos y rechazo de cantidades fraccionarias o totales fuera de rango.
- Migración repetida sin perder datos, `foreign_key_check`, `integrity_check` y rechazo de esquemas futuros.
- Categorías, fotografía persistente, unicidad de códigos y claves foráneas.
- Agrupación de líneas iguales, separación por notas, edición y eliminación.
- Recuperación del carrito, vista y configuración después de reabrir el archivo SQLite.
- Guardado/recuperación de pendientes sin mover stock y preservación del ticket anterior al recuperar otro.
- Cobro insuficiente y rollback; descuento de stock únicamente al completar.
- Tres cobros concurrentes del mismo ticket y repetición tras reabrir: un pago, una venta y un solo movimiento de existencias.
- Agregación de stock para un producto con líneas y notas diferentes.
- Captura histórica de precio, cliente, negocio, descuento e impuesto.
- Cancelación de pendientes sin borrar datos comerciales ni afectar existencias.
- Fallo inyectado de escritura: no confirma la venta, revierte la memoria y permite reintentar al restablecer el almacenamiento.
- Guardado y reapertura del archivo SQLite desde IndexedDB mediante `fake-indexeddb`; su contraparte real del navegador también se ejercita en E2E.

## Navegador: 5 flujos

1. **Venta completa**: categoría, fotografía original de prueba, producto, impuesto 16%, cantidades, notas, descuento 10%, lista, recarga, guardado, recuperación tras recarga, efectivo insuficiente/exacto con cambio y recibo histórico. Caso: $80.00 − $8.00 + $11.52 = $83.52 MXN; efectivo $100.00 y cambio $16.48.
2. **Offline**: se desconecta la red mediante Playwright, se añade por código de barras, se recarga sin red, se recupera el ticket, se cobra y se cancela otra operación sin alterar el historial pagado.
3. **Tamaños y teclado**: 1340 × 800, 1024 × 600, 800 × 600 y 390 × 844; sin desbordamiento horizontal, botones de cobro dentro del viewport, navegación móvil al ticket, foco del diálogo, Escape y eliminación.
4. **Dos pestañas**: la segunda queda bloqueada antes de abrir otro escritor SQLite.
5. **Catálogo y clientes**: 12 productos con entradas fotográficas originales de prueba, 3 categorías, varias filas y scroll, búsqueda, filtro dinámico, asignación de cliente, cobro e historial de compras. Capturas de la distribución de tableta.

Los contextos son temporales e independientes. El APK y el perfil de usuario no contienen esos productos de prueba. Las imágenes canvas de las capturas demuestran el flujo de carga/persistencia y no sustituyen fotografías aportadas por el negocio.

## Archivo Android

APK final: `artifacts/AVILES-POS-1.0-debug.apk`.

- Tamaño: **14,025,552 bytes**.
- SHA256: `fc78470b9c87347df9167aa2b7cc84f10c9ad2baaa462d1f4f3b8f8c7fdc77f5`.
- `artifacts/SHA256SUMS.txt` contiene también el checksum del archivo de fuentes de la entrega.
- Firma de desarrollo, no de producción. El APK no se instaló ni ejecutó en Android durante estas comprobaciones.

## Validación física pendiente

| Prueba                                                                                       | Estado                                                                         |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Instalar y abrir el APK en la Samsung Galaxy Tab A11                                         | Pendiente, requiere dispositivo                                                |
| Migración y cobro usando el plugin SQLite nativo en Android                                  | Pendiente en dispositivo; el servicio compartido sí se probó sobre SQLite WASM |
| Cerrar forzosamente, reiniciar Android y recuperar catálogo, carrito, pendientes e historial | Pendiente, requiere dispositivo                                                |
| Venta en modo avión tras reinicio del sistema                                                | Pendiente en Android; el flujo offline web pasó                                |
| Orientación horizontal física y rotación del equipo                                          | Declarada en el manifiesto; ejecución pendiente                                |
| Selector de fotografías, teclado Android y barras del sistema                                | Pendiente; se verificó interfaz Chromium y se simularon insets CSS             |
| Interrupción eléctrica o de proceso en mitad de un commit nativo                             | Pendiente; rollback y fallos de persistencia WASM sí se ejercitaron            |
| Actualización firmada sobre una instalación con datos                                        | Pendiente; no desinstalar para actualizar                                      |
| Lector físico de códigos que emule teclado                                                   | Pendiente; el formulario de entrada se probó con teclado automatizado          |
| Impresoras, cajón, pagos combinados, roles y respaldos                                       | No implementados en 1.0; no se reportan como pruebas aprobadas                 |

## Configuración del entorno

Se guardaron `install_script` y `start_skill` en el borrador de configuración. No se añadieron secretos, variables obligatorias ni dominios externos a los presets existentes. Las instrucciones no publican el entorno ni inician procesos por sí mismas. La publicación y la restauración en una tarea nueva aún no se verificaron; requieren revisar/guardar los ajustes y publicar desde la interfaz del entorno.
