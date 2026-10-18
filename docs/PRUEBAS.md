# Evidencia de validación

Entorno: Linux x64, Node.js 24.19.0, npm 11.9.0, Chromium 154.0.8037.57. Electron 44.9.0 incorpora Node.js 24.22.0. SQLite reporta versión 3.54.0 mediante sql.js 1.15.0.

| Verificación | Resultado |
| --- | --- |
| Instalación inicial y `npm ci` con lockfile | Correctas, sin cambiar dependencias de los originales |
| `npm run check` | Sintaxis JavaScript válida |
| `npm test` | 30 pruebas aprobadas; 0 fallidas, omitidas o deshabilitadas |
| `CHROMIUM_PATH=/usr/bin/chromium npm run test:ui` | 7 recorridos aprobados; 0 fallidos u omitidos |
| `npm run test:desktop` | Electron fuente: interfaz, administrador inicial, escritura SQLite, puente de impresoras, aislamiento y cancelación de salida con ticket pendiente verificados |
| `npm run build:win` | Instalador NSIS Windows x64 generado en Linux, sin Wine |
| Integridad del instalador con 7-Zip | Everything is Ok; contenedor NSIS Unicode, 79 archivos, runtime Windows x64 |
| `npm run verify:package` | Código de `src/` y `public/` coincide byte a byte con el app.asar; SQLite WASM incluido; originales y mssql ausentes del runtime |
| `npm run test:desktop -- --packaged` | app.asar de producción cargado por Electron Linux; interfaz, sesión, SQLite, IPC y cierre con carrito pendiente verificados |
| Servicio de desarrollo | API e interfaz iniciadas, detenidas y reiniciadas; base local conservada, sin crear usuarios ficticios |
| Preservación | SHA-256 de los 7 adjuntos y comparación de todos los archivos extraídos con el ZIP original |
| `npm audit --omit=dev` | 0 avisos en dependencias de producción al consultar el registro durante esta entrega |

Los comandos Electron de Linux usan `NODE_USE_ENV_PROXY=1`, `XDG_CACHE_HOME=/workspace/.cache` y `electron_config_cache=/workspace/.cache/electron` para descargas verificadas. La prueba headless de Electron usa `--no-sandbox` en Linux por las restricciones del runner; verifica el aislamiento de Node y las preferencias del renderer, no la protección del sandbox del sistema operativo. La aplicación distribuida no incorpora ese argumento de prueba.

## Cobertura del motor

Se probaron autenticación, hashes de contraseña, bloqueo tras cinco intentos, permisos en servidor, revocación de sesiones, CSRF, origen/Host y encabezados de proxy. También apertura/cierre de turnos, compras que reducen caja, ventas con tara y cambio, costo promedio, pagos USD/tarjeta/transferencia, gastos, entradas/retiros, ajustes y cancelaciones.

Las pruebas provocan errores reales: stock insuficiente acumulado entre renglones, fondos insuficientes, material inactivo, precio modificado por cajero, precisión decimal inválida, fechas inválidas, turno ajeno/cerrado, doble solicitud concurrente, respaldo corrupto y fallo de escritura de disco. Comprueban que no queden tickets o movimientos parciales.

Se verificó persistencia tras cerrar y abrir la base, bloqueo de un segundo escritor, restauración y reautenticación, respaldo automático, filtrado por fecha en la zona horaria del negocio, escape de fórmulas CSV, importación V15 y conservación del JSON original. El ajuste de tickets preserva palabras largas y los comandos ESC/POS evitan introducir controles desde los textos capturados.

## Cobertura de interfaz

1. Crear catálogo y caja; comprar con tara; vender; cancelar; registrar gasto; cerrar turno y descargar SQLite.
2. Rechazar venta sin stock y registrar venta en USD con cambio MXN.
3. Crear usuario de consulta, comprobar credenciales incorrectas, permisos visuales y cambio de contraseña.
4. Guardar datos del negocio, papel y zona horaria; directorio; mostrar HTML capturado como texto.
5. Analizar e importar V15, consultar kardex y descargar el original archivado.
6. Navegar en pantalla móvil sin desbordamiento horizontal.
7. Impedir que una respuesta lenta de reportes reemplace el módulo elegido después.

Las capturas `captura-resumen.png` y `captura-movil.png` proceden de datos temporales de pruebas. Esos datos no se entregan en la base de operación.

## Límites de lo comprobado

No se ejecutó el instalador ni el spooler de Windows: se necesita una PC Windows y una impresora física para las comprobaciones de `PRUEBAS_WINDOWS.md`. La impresión RAW se genera y valida como bytes; no se afirma que una impresora concreta acepte el corte o su configuración.

No se ejecutó el workflow de GitHub, no se publicó el repositorio y no se verificó la restauración del entorno en una tarea nueva. Se guardaron `install_script` y `start_skill` en el borrador de configuración del entorno para revisión y publicación del usuario; guardar esos campos no publica el entorno.
