# METales-GV Pro 1.0.0

POS local para compra y venta de materiales por kilogramo. Interfaz en español, precios y contabilidad en MXN, cobro de ventas en USD con tipo de cambio manual y cambio en MXN.

## Funciones implementadas

- Compras y ventas de varios renglones: peso bruto, tara, neto a tres decimales y precio por kg.
- Inventario sin saldos negativos, kardex, mínimos, ajustes con motivo y costo promedio ponderado.
- Un turno de caja activo, fondo inicial, entradas, retiros, gastos y arqueo separado MXN/USD.
- Efectivo, transferencia y, en ventas, tarjeta y USD. Las compras en efectivo disminuyen caja.
- Tickets de compras y ventas, reimpresión, descarga TXT y cortes. Papel de 58/80 mm; driver o ESC/POS RAW en Windows.
- Cancelaciones administrativas dentro del turno abierto, con reversa de inventario y efectivo e historial conservado.
- Usuarios con contraseña scrypt y roles administrador, cajero y consulta. Sesiones locales de ocho horas y control de permisos en servidor.
- Reportes por fechas y material: compras, ventas, costo, margen bruto, gastos y resultado; exportación CSV de operaciones.
- Directorio de clientes/proveedores, configuración del negocio, zona horaria y preferencias de impresión.
- Respaldo SQLite completo, copia automática al cerrar turno y restauración con copia previa.
- Importación revisable del catálogo y saldo inicial de un respaldo JSON V14/V15. Historial original archivado para descarga; usuarios/PIN no importados.

## Desarrollo

Requiere Node.js 22.12 o posterior (validado con Node 24.19), npm y una máquina con interfaz gráfica si se usa Electron. Dependencias fijadas en `package-lock.json`.

```bash
npm ci
npm start             # Servicio local y aplicación en navegador, puerto 3180
npm run desktop       # Aplicación Electron
npm run check         # Validación de sintaxis
npm test              # 30 pruebas del motor, persistencia y API
npm run test:ui       # 7 recorridos de interfaz con Playwright
npm run test:desktop  # Smoke de escritorio Electron; cerrar primero la aplicación
npm run build:win     # Instalador autónomo NSIS para Windows x64
npm run verify:package # Integridad y correspondencia del código empaquetado
npm run test:desktop -- --packaged # Smoke del app.asar compilado
```

Electron descarga su runtime verificado al primer uso si no está en caché. El empaquetador descarga el runtime Windows correspondiente. No se requiere compilar módulos nativos de SQLite.

Para las pruebas de interfaz, instala Chromium de Playwright con `npx playwright install chromium`. Si ya existe un Chromium compatible, puedes usar `CHROMIUM_PATH=/ruta/a/chromium npm run test:ui` (en este entorno: `/usr/bin/chromium`). Las pruebas usan bases temporales y no modifican tus datos.

En entornos con directorio personal de solo lectura, configura las cachés dentro del workspace:

```bash
export npm_config_cache=/workspace/.npm-cache
export XDG_CACHE_HOME=/workspace/.cache
export electron_config_cache=/workspace/.cache/electron
export ELECTRON_BUILDER_CACHE=/workspace/.cache/electron-builder
```

`PORT` cambia el puerto del modo navegador. `METALES_DATA_DIR` cambia la carpeta de datos en ambos modos; usa rutas diferentes para pruebas y operación. No se necesitan claves API ni servicios externos.

## Datos y SQLite

En escritorio Windows: `%APPDATA%\METales-GV Pro\data\metales-gv.sqlite`. En desarrollo con `npm start`: `data/metales-gv.sqlite` dentro de este proyecto. La carpeta `backups` conserva las copias automáticas. La desinstalación conserva los datos de AppData.

Se usa SQLite real mediante `sql.js` (SQLite compilado a WebAssembly). El motor mantiene la base en memoria y, al confirmar una transacción, exporta una imagen SQLite mediante archivo temporal, `fsync` y renombrado atómico. Un bloqueo por PID impide dos procesos escritores. Si falla la escritura, se restaura también la imagen anterior en memoria. Los respaldos son archivos SQLite estándar.

Esta implementación está diseñada para una estación local y carga de un negocio pequeño. Cada escritura exporta la base completa; bases grandes requieren mediciones de rendimiento y posiblemente migración a un adaptador SQLite nativo. No existe servidor multicaija, sincronización remota ni lectura automática de báscula. No coloques la base activa en una carpeta compartida o sincronizada; copia los respaldos cerrados.

La aplicación bloquea accesos externos y encabezados de proxy; enlaza solo con loopback. El renderer no tiene Node.js, usa aislamiento de contexto y sandbox. Se aplican CSP, cookies HttpOnly y nonce CSRF. La base no está cifrada: protege el usuario de Windows y los respaldos, que incluyen hashes de contraseñas y datos comerciales.

## Instalador

El instalador NSIS es por usuario, con selección de carpeta, accesos directos y desinstalador. Requiere Windows 10/11 x64. No incluye el código ni funciones de Restaurante o las aplicaciones originales. Puede compilarse en Linux sin Wine gracias al script `installer/installer.nsi`. Los originales y la documentación se entregan en el ZIP del proyecto completo.

El instalador y el ejecutable no tienen firma Authenticode. La compilación produce un artefacto instalable; la ejecución, actualización, desinstalación y las impresoras deben validarse en un equipo Windows según `../docs/PRUEBAS_WINDOWS.md`. El flujo `.github/workflows/windows.yml` reproduce pruebas y compilación en Windows cuando se ejecuta en GitHub; no se ha ejecutado como parte de esta entrega local.

Los tickets son comprobantes internos. No se implementó facturación CFDI, timbrado ni contabilidad fiscal.
