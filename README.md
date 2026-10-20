# AVILES POS 1.1

Punto de venta local para tabletas Android, desarrollado con React, TypeScript, Capacitor 8 y SQLite. La primera pantalla es directamente la venta: productos a la izquierda, ticket a la derecha y categorías dinámicas abajo. Código e identidad propios; las referencias visuales del usuario no se distribuyen como recursos de la aplicación.

Esta versión conserva la primera entrega y añade pagos manuales y combinados al alcance descrito en la sección 22 de [la especificación](docs/ESPECIFICACION.txt). Los módulos posteriores y la validación física pendiente se detallan en [ENTREGA.md](docs/ENTREGA.md). No está certificado para uso comercial.

## Descargar las fuentes

[Descargar AVILES POS 1.1 en ZIP](https://raw.githubusercontent.com/stajia42-alt/POS/descargas-aviles-pos-1-1/descargas/AVILES-POS-1.1-fuentes.zip).

Incluye el proyecto completo React/TypeScript, Android, SQLite, pruebas y documentación. El APK y las claves de firma no se publican en el repositorio; el procedimiento para compilar está más abajo. Los cambios de la versión están en [CAMBIOS.md](docs/CAMBIOS.md).

## Empezar

El catálogo inicial está vacío. No se incluyen productos, categorías ni ventas ficticias.

1. Abre el menú lateral y entra en **Categorías** para registrar tus categorías.
2. En **Productos**, crea artículos con nombre, precio en MXN, categoría y fotografía opcional. Puedes incluir código de barras, favoritos y existencias.
3. En **Configuración**, indica el negocio y el impuesto **añadido**. Deja 0 si los precios ya incluyen impuestos.
4. Vuelve a **Punto de venta**. Toca productos para agregarlos. Usa los controles de cantidad o toca una línea para editar cantidad y observaciones.
5. **GUARDAR** conserva el ticket pendiente; **COBRAR** permite registrar efectivo, tarjeta, transferencia u otro método. Solo el efectivo genera cambio. **Dividir pago** permite distribuir el total entre varias formas de pago; el historial conserva sus importes y referencias. Tarjeta y transferencia son registros manuales: verifica el pago en tu terminal o banco antes de confirmar.

La cuadrícula/lista, el carrito activo, las fotografías, los pendientes y las ventas persisten en SQLite. Android opera con los recursos incluidos en el APK; no requiere un servidor Node, cuenta externa ni Internet para vender. Node se usa únicamente para desarrollar y compilar.

## Actualizar desde 1.0

La migración de SQLite 1 a 2 conserva productos, fotos, clientes, tickets e importes de ventas anteriores. Los pagos en efectivo originales conservan su identificador, fecha, importe, recibido y cambio; se les asigna posición 0 y referencia vacía. No se reinicia ni se elimina la base completa. El APK 1.1 usa `versionCode` 2 y el mismo identificador. Conserva la firma para actualizar sin desinstalar.

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

Una actualización debe mantener **el mismo identificador y la misma clave de firma** para conservar los datos. No desinstales para resolver un conflicto de firma. No borres el almacenamiento de la aplicación: no hay restauración ni respaldos exportables en 1.1.

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
