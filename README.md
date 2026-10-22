# Parking POS — RC13 · 1.0.11

Punto de venta de estacionamiento con SQLite local, escritorio Electron y boletos térmicos ESC/POS de 80 mm. Conserva el proyecto RC12 y sus datos; no requiere conexión a Internet para operar una vez instalado.

## Empezar

- Operación del cliente: [Corte de caja y cierre por turno](docs/CORTE_POR_TURNO.md).
- Instalación y actualización Windows: [Instrucciones](docs/INSTALACION.md).
- Cambios y validación: [Informe RC13](docs/REVISION_RC13.md).
- Los documentos dentro de `docs/antecedentes` son referencias históricas; para esta entrega usa los documentos anteriores.

## Desarrollo

Node.js 22 o 24, con npm. Desde esta carpeta:

```sh
npm ci
npm test
npm start
```

El servidor escucha únicamente en la interfaz local. `PARKING_DATA_DIR` permite seleccionar una carpeta de pruebas separada; no la apuntes a datos de clientes para ejecutar pruebas. Las pruebas automáticas crean bases temporales y no usan la caja real.

```sh
# Prueba funcional del navegador; instala Chromium solo si no existe uno local.
npx playwright install chromium
npm run test:ui

# Chromium local alternativo en Linux:
PARKING_CHROMIUM=/usr/bin/chromium npm run test:ui

# Ventana de escritorio en una máquina con entorno gráfico:
npm run desktop
```

En Windows, `CREAR_INSTALADOR_WINDOWS.cmd` construye la distribución x64 y el instalador. El ejecutable instalado conserva `%LOCALAPPDATA%\ParkingPOS`. La confirmación del spool de Windows indica que recibió el trabajo; papel y apertura física del cajón requieren prueba con el hardware del cliente.
