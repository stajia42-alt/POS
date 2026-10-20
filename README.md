# AVILES POS 1.2

Punto de venta local para tabletas Android, desarrollado con React, TypeScript, Capacitor 8 y SQLite. Después del acceso local con PIN se abre la venta: productos a la izquierda, ticket a la derecha y categorías dinámicas abajo. Código e identidad propios; las referencias visuales del usuario no se distribuyen como recursos de la aplicación.

Esta versión conserva ventas y pagos combinados, y añade inventario operativo, turnos de caja y empleados con PIN/permisos. El alcance completo solicitado continúa en desarrollo: variantes, devoluciones, impresoras y otros módulos siguen pendientes, detallados en [AVILES_POS_PROGRESO.md](AVILES_POS_PROGRESO.md). No está certificado para uso comercial.

## Descargas directas

- [Instalador Android AVILES POS 1.2](https://raw.githubusercontent.com/stajia42-alt/POS/instalador-aviles-pos-1-2/AVILES-POS-1.2.apk).
- [Todo en un ZIP: APK, fuentes y documentación](https://raw.githubusercontent.com/stajia42-alt/POS/instalador-aviles-pos-1-2/AVILES-POS-1.2-COMPLETO.zip).
- [Código fuente completo en ZIP](https://raw.githubusercontent.com/stajia42-alt/POS/descargas-aviles-pos-1-2/descargas/AVILES-POS-1.2-fuentes.zip).

El APK de depuración se distribuye en una rama separada de instaladores. El ZIP incluye React/TypeScript, proyecto Android, migraciones, pruebas y documentación; no incluye APK, claves, dependencias instaladas ni datos de negocio. Conserva la misma firma de desarrollo anterior. Consulta [CAMBIOS.md](docs/CAMBIOS.md).

## Empezar

El catálogo inicial está vacío. No se incluyen productos, categorías ni ventas ficticias.

1. En el primer inicio crea el acceso del propietario con nombre, identificador y PIN propio. No hay credenciales predeterminadas. Después abre el menú lateral y entra en **Categorías** para registrar tus categorías.
2. En **Productos**, crea artículos con nombre, precio en MXN, categoría y fotografía opcional. Puedes incluir código de barras, favoritos y existencias.
3. En **Configuración**, indica el negocio y el impuesto **añadido**. Deja 0 si los precios ya incluyen impuestos.
4. Vuelve a **Punto de venta**. Toca productos para agregarlos. Usa los controles de cantidad o toca una línea para editar cantidad y observaciones.
5. **GUARDAR** conserva el ticket pendiente; **COBRAR** permite registrar efectivo, tarjeta, transferencia u otro método. Solo el efectivo genera cambio. **Dividir pago** permite distribuir el total entre varias formas de pago; el historial conserva sus importes y referencias. Tarjeta y transferencia son registros manuales: verifica el pago en tu terminal o banco antes de confirmar.

Desde **Inventario** registra entradas, salidas, ajustes y conteos. En **Empleados** configura personas y permisos. Para usar caja, activa **Control de caja por turnos** en Configuración y abre un turno desde **Caja y turnos**. El [manual de los módulos 1.2](docs/MODULOS-1.2.md) explica sus operaciones y límites.

La cuadrícula/lista, el carrito activo, las fotografías, los pendientes y las ventas persisten en SQLite. Android opera con los recursos incluidos en el APK; no requiere un servidor Node, cuenta externa ni Internet para vender. Node se usa únicamente para desarrollar y compilar.

## Actualizar desde 1.0 o 1.1

SQLite migra a esquema 3 de forma transaccional, sin reiniciar el catálogo. Conserva fotos, clientes, pagos y tickets originales. Añade empleados, permisos, caja, auditoría y trazabilidad de inventario. Los registros anteriores no reciben nombres de empleados ni turnos inventados. El primer acceso pide crear al propietario local; los datos previos permanecen.

El APK 1.2 usa el mismo identificador `mx.aviles.pos` y `versionCode` 3. Instálalo encima del anterior manteniendo su firma; no desinstales ni borres almacenamiento. No se puede volver a una versión antigua sobre una base ya migrada: el programa anterior rechazará el esquema nuevo para conservarlo.

Los pagos preparados en el diálogo todavía no están registrados: se confirman juntos y de manera transaccional al completar la venta. Cerrar el diálogo descarta esa distribución preparada, conservando el ticket. No se aceptan pagos incompletos ni se registran anticipos en esta etapa.

## Desarrollo

Requisitos: Node 22.12 o posterior (verificado con **24.19.0**), npm y un navegador Chromium actualizado. Para Android: **JDK 21**, Android SDK **36**, Build Tools **36.0.0**. Gradle **8.14.3** se descarga con el wrapper y verifica su SHA256.

```bash
npm ci
npm run dev
```

La variante web de desarrollo usa SQLite WebAssembly guardado en IndexedDB. No sustituye al plugin SQLite nativo en Android. Usa una sola pestaña por origen; se bloquea una segunda pestaña para impedir escrituras incompatibles. Mantén el mismo origen y puerto para reutilizar sus datos. El catálogo del navegador es independiente del de Android.

En este entorno de nube:

```bash
cd /workspace/POS
bash scripts/setup-cloud.sh
source scripts/cloud-env.sh
npm run dev
```

El instalador utiliza directorios escribibles bajo `/workspace`, reutiliza el proxy existente, comprueba la firma del índice de Microsoft, verifica los checksums del JDK y de Android Tools y ejecuta `npm ci`, compilación web, sincronización Android y pruebas. No guarda credenciales. Las licencias del SDK necesarias para compilar se aceptan durante la instalación. No crea worktrees ni modifica datos comerciales.

## Compilar el APK

```bash
# Con JDK 21 y Android SDK configurados:
npm ci
npm run android:debug
```

Resultado: `android/app/build/outputs/apk/debug/app-debug.apk`. Es un APK de depuración firmado con la clave de desarrollo de esa máquina. El paquete es `mx.aviles.pos`; Android mínimo API 24 y objetivo API 36. La actividad declara orientación `sensorLandscape`.

En la nube, ejecuta primero `source scripts/cloud-env.sh`. Fuera de ella, define `JAVA_HOME` hacia el JDK y `ANDROID_HOME` hacia el SDK, o configura el SDK en Android Studio. Si Gradle no es ejecutable después de extraer el ZIP, usa `chmod +x android/gradlew`. En Windows, después de `npm run android:sync`, ejecuta `android\gradlew.bat -p android assembleDebug`.

Para Android Studio:

1. Ejecuta `npm run android:sync` para copiar los recursos web y registrar el plugin SQLite.
2. Abre la carpeta **android** como proyecto y sincroniza Gradle.
3. Selecciona JDK 21 e instala la plataforma 36 y Build Tools 36.0.0.
4. Conecta la tableta o selecciona un emulador. Usa **Run** o **Build APK(s)**.
5. Para distribuir una versión de producción, usa **Generate Signed Bundle / APK**, conserva tu keystore fuera del repositorio y aumenta `versionCode` para las actualizaciones.

## Instalar en una tableta

Copia el APK a la tableta, permite la instalación desde esa fuente cuando Android lo solicite y abre el archivo. Alternativamente, con depuración USB autorizada:

```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

Una actualización debe mantener **el mismo identificador y la misma clave de firma** para conservar los datos. No desinstales para resolver un conflicto de firma. No borres el almacenamiento de la aplicación: no hay restauración ni respaldos exportables en 1.2.

## Verificación

```bash
npm test                 # Lógica comercial, migración y persistencia SQLite
npm run build            # TypeScript y bundle de producción
npm run test:e2e          # Chromium: ventas, pendientes, offline, navegación y tamaños
npm run android:debug    # Compilación de recursos web y APK
npm run format:check
```

Las pruebas E2E usan por defecto `/usr/bin/chromium`. Define `CHROMIUM_PATH` con la ruta de Chrome/Chromium en tu equipo. El servidor de pruebas usa el puerto 4173 y se detiene al terminar. Las pruebas crean datos exclusivamente en contextos de navegador aislados; nunca precargan el catálogo real. Para repetir la prueba offline manualmente, usa `npm run build && npm run preview`, espera la instalación del service worker y desconecta la red. La recarga offline se verifica en producción web, no en el servidor Vite de desarrollo.

Consulta [el registro de pruebas](docs/PRUEBAS.md), [la arquitectura](docs/ARQUITECTURA.md) y [las funciones entregadas y pendientes](docs/ENTREGA.md).

## Estructura

```text
src/
  db/           Adaptadores nativo/WASM, IndexedDB, cola transaccional y migración
  domain/       Reglas de ventas, tipos e importes en centavos
  ui/           Pantalla de ventas, módulos, formularios y diálogos
  styles.css    Distribución táctil y adaptación a tamaños e insets Android
android/        Proyecto Gradle completo; Activity, manifiesto e identidad propios
tests/          Pruebas de lógica y persistencia
e2e/            Flujos funcionales en Chromium
scripts/        Instalación y activación de herramientas de nube
docs/           Especificación, arquitectura, alcance y registro de verificación
```
