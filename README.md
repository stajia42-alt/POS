# AVILES POS 2.1 — Primera etapa

Punto de venta local para tabletas Android, desarrollado con React, TypeScript, Capacitor 8 y SQLite. Después del acceso local con PIN se abre la venta: productos a la izquierda, ticket a la derecha y categorías dinámicas abajo. Código e identidad propios; las referencias visuales del usuario no se distribuyen como recursos de la aplicación.

Esta actualización añade acceso solo por PIN, apertura obligatoria de caja, fondos MXN/USD separados y modo restaurante con mesas persistentes. Conserva catálogo, inventario, clientes, empleados, cobros manuales/combinados y la pantalla de venta rápida. Las fases pendientes se detallan en [AVILES_POS_PROGRESO.md](AVILES_POS_PROGRESO.md). No es la ampliación comercial completa ni está certificado para uso comercial.

## Descargas directas

- [Instalador Android AVILES POS 2.1](https://raw.githubusercontent.com/stajia42-alt/POS/instalador-aviles-pos-2-1/AVILES-POS-2.1.apk).
- [TODO en un ZIP: APK, fuentes, Android y documentación](https://raw.githubusercontent.com/stajia42-alt/POS/instalador-aviles-pos-2-1/AVILES-POS-2.1-COMPLETO.zip).
- [Solo fuentes en ZIP](https://raw.githubusercontent.com/stajia42-alt/POS/descargas-aviles-pos-2-1/descargas/AVILES-POS-2.1-fuentes.zip).

El instalador de depuración se distribuye en una rama separada. No se incluyen claves ni datos comerciales en ninguna descarga. El ZIP de fuentes contiene el proyecto y su documentación; el ZIP completo añade el APK. Las entregas anteriores siguen en sus ramas originales.

## Actualizar sin borrar información

Instala el APK sobre el anterior con el mismo identificador y firma. Esta entrega usa `mx.aviles.pos`, versión 2.1.0 y versionCode 4. SQLite migra a esquema 4 sin reiniciar datos. No desinstales ni borres almacenamiento. No se puede volver a una versión anterior sobre una base migrada.

**Antes de actualizar desde 1.2, asigna PIN exclusivos a los empleados activos, especialmente al administrador.** Un PIN antiguo exclusivo se reconoce sin usuario. Un PIN compartido por varias personas no identifica a una persona de forma segura y se bloquea: otro administrador con PIN exclusivo debe restablecerlos. Si todos los administradores comparten PIN, resuélvelo en 1.2 antes de instalar; no hay recuperación automática o externa. No se guardan PIN en texto plano.

## Empezar

1. Si es la primera instalación, crea al propietario con nombre y PIN propio. Si actualizas una base con empleados, introduce solamente tu PIN. No hay PIN predeterminado.
2. Sin turno abierto aparece Apertura de caja: captura fondos MXN/USD. La tasa manual de cambio es necesaria para un fondo USD positivo y solo un administrador con permiso puede configurarla. ABRIR TURNO restaura tu cuenta o mesa pendiente.
3. Crea categorías y productos desde el menú. El catálogo y el mapa iniciales no incluyen datos ficticios.
4. En Configuración elige Venta rápida, Restaurante o Ambos. Ambos muestra Venta rápida | Mesas en la barra principal.
5. En Mesas, el administrador crea áreas y activa Editar plano para crear, mover y configurar mesas. Tocar una mesa abre o recupera su cuenta. Volver al mapa guarda la cuenta automáticamente.
6. Gestionar mesa permite transferir, unir cuentas completas, cambiar mesero, marcar cobro y liberar según permisos. Cobrar completa el ticket y libera la mesa en la misma transacción de pagos e inventario.
7. Caja y turnos permite movimientos por moneda, arqueo, cierre e historial. Corte de consulta revisa sin cerrar. Al cerrar vuelve la apertura; las cuentas pendientes permanecen.

**Los cobros de ventas siguen siendo MXN.** Fondos y movimientos USD de caja no equivalen a cobros USD ni conversión del recibido/cambio. Tarjeta, transferencia y otros siguen siendo registros manuales; comprueba el pago externamente antes de confirmar. Los pagos combinados se confirman juntos; no son anticipos ni pagos parciales.

Guía detallada: [MODULOS-2.1.md](docs/MODULOS-2.1.md). Impresoras, comandas, división, pagos USD, autorizaciones delegadas, respaldos/restauración y los demás pendientes constan en el documento de progreso. La identidad y recursos son propios; las referencias visuales del usuario no se distribuyen como recursos.

La aplicación opera con SQLite y recursos incluidos en el APK, sin servidor, computadora o Internet para vender. Node se usa solo para desarrollar y compilar. La versión web guarda SQLite WASM en IndexedDB y sus datos son independientes de Android.

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

Una actualización debe mantener **el mismo identificador y la misma clave de firma** para conservar los datos. No desinstales para resolver un conflicto de firma. No borres el almacenamiento de la aplicación: no hay restauración ni respaldos exportables en 2.1.

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
