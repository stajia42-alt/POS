# Parking POS Desktop 1.0.1 RC2 — Cortes y revisión de interfaz

## Cambios

- Corte de caja en cuatro pestañas: **Resumen y corte**, **Movimientos**, **Reportes**, **Cortes anteriores**. Solo la pestaña elegida ocupa espacio.
- Resumen de turno compacto, cambio de USD en una fila y botones de corte X y Z a la vista.
- Corte Z en una ventana breve; captura de MXN y USD, teclado táctil opcional y arqueo por denominaciones oculto hasta que se necesita. Confirma el cierre y conserva el comprobante.
- **Cambiar usuario** deja claro cuándo el turno continúa abierto y permite ir al corte Z. Salir del usuario NUNCA cierra la caja automáticamente.
- Tarifas avanzadas plegadas en su propia pantalla, impresión de 80 mm en dos columnas y opciones largas plegadas.
- Ocultación de Reportes avanzados a cajeros sin permiso; movimientos inhabilitados para cajeros, en lugar de botones que aparentemente no responden.
- Corrección de scripts de pruebas antiguos que buscaban botones renombrados. Se eliminó package-lock.json porque estaba desactualizado: faltaban Electron y electron-builder; `npm install` genera un lock coherente en la computadora compiladora.

## IMPORTANTE ANTES DE ACTUALIZAR

1. Cierra la versión anterior y realiza un corte si el turno requiere cierre.
2. Copia la carpeta `%LOCALAPPDATA%\ParkingPOS` completa a una USB u otra unidad (incluidos `parking.db` y respaldos), **antes** de instalar o sustituir cualquier versión. No cambies la ubicación de los datos.
3. Descomprime en `C:\ParkingPOS` (ruta sin espacios). En el equipo constructor ejecuta `CREAR_INSTALADOR_WINDOWS.cmd` para generar `INSTALADOR_WINDOWS\ParkingPOS_Setup_1.0.1_x64.exe`.
4. Instala el `.exe` resultante sobre la aplicación anterior con la aplicación cerrada. No borres los datos locales de SQLite ni copies `parking.db` entre clientes.
5. Comprueba la entrada y el boleto de 80 mm, lectura CODE128, cobro, cambio, corte X, corte Z, impresión y cambio de usuario en un turno de **prueba**, antes de operar con dinero real.

## Qué se probó aquí

- Sintaxis JavaScript de los archivos HTML y JS; comprobaciones unitarias que no necesitan `better-sqlite3`.
- Pruebas de clics en Chromium con respuestas **simuladas** para las cuatro pestañas, corte X, corte Z, cierre efectivo con diferencias, login y cambio de usuario.
- Navegación por todos los módulos y detección de excepciones JS en el flujo simulado.

## Qué sigue pendiente de verificar en Windows

- `npm test` completo con SQLite nativo y `npm run test:ui` con el servidor real. El proyecto incluye los scripts de prueba.
- Compilación Electron/NSIS de esta versión y ejecución del `.exe` en una PC limpia.
- Impresión ESC/POS de 80 mm, corte físico y lectura de un código impreso por el escáner.
- Verificación con un turno físico de caja y montos controlados. No se garantiza cero errores hasta pasar esas pruebas.

**La lógica de precios, cobros, impresión y las migraciones SQLite no fue modificada en RC2.**
