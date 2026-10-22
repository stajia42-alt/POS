# Parking POS Desktop 1.0.3 - RC5 (Día/Noche y doble boleto)

Código fuente completo para crear un nuevo instalador Windows x64.

- `CREAR_INSTALADOR_WINDOWS.cmd` requiere Node.js 22/24, herramientas C++ e Internet para dependencias iniciales.
- Si ya existe Parking POS RC4 en la computadora del cliente, usa **ParkingPOS_RC5_Actualizacion_Directa.zip** en vez de recompilar.
- Respalda `%LOCALAPPDATA%\ParkingPOS` antes de actualizar. La migración 004 no borra tickets ni pagos.
- Imprime dos copias consecutivas desde un solo envío ESC/POS; el botón de entrada no debe pulsarse dos veces.
- Reporte de cierre Día/Noche con conciliación por moneda y folios heredados.
- No está certificado para uso comercial: faltan pruebas Windows reales (Electron, driver ESC/POS, escáner, impresión física, cierre y contabilidad).

Pruebas ejecutadas aquí: archivos `test/*.test.js` independientes de Express; la suite de integración del servidor `test/operations.test.js` requiere `npm install` para poderse ejecutar.
