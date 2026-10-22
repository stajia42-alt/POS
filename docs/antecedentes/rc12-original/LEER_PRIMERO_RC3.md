# PARKING POS DESKTOP 1.0.2 RC3 — Caja sencilla y salida automática

## Cambios importantes

- **Apertura de caja:** solo se captura el fondo inicial en pesos mexicanos. El tipo de cambio se configura después, en **Corte de caja** por un supervisor o administrador. Los turnos anteriores mantienen sus datos.
- **Corte X:** muestra ventas y efectivo esperado, **sin cerrar**.
- **Corte Z:** ventana compacta: pesos esperados, dólares esperados y efectivo contado. Se puede abrir el teclado táctil y el arqueo por billetes solo cuando se necesiten. Si hay diferencias se solicita confirmación explícita; la información se registra, no se corrige ni oculta automáticamente.
- **Cobro = salida:** el pago y la fecha de salida se guardan juntos dentro de una transacción SQLite; al pagar se libera el lugar. **Ya no existe un segundo botón de salida en el flujo normal.** El código de barras del ticket de entrada se sigue escaneando para recuperar tiempo e importe.
- **Impresión más ágil:** una cola RAW persistente prepara PowerShell una sola vez al iniciar la aplicación y envía directamente los bytes ESC/POS; se mantiene un mecanismo alternativo si esa cola no llega a iniciar. **No se reintenta automáticamente una impresión ambigua**: el cajero debe revisar y reimprimir voluntariamente con el mismo folio. Windows puede aceptar la orden aunque la impresora física esté sin papel.
- **Históricos:** no se borran ni alteran tickets existentes. Los boletos antiguos pagados pero sin salida continuarán con ese estado hasta que un supervisor los regularice desde la consulta de folio.

## Compilar el nuevo instalador en Windows (para memoria USB)

1. Cierra Parking POS e identifica su base en `%LOCALAPPDATA%\ParkingPOS`. Copia esa carpeta de datos a otra unidad antes de instalar.
2. Extrae este ZIP en una carpeta **nueva**, por ejemplo `C:\ParkingPOS_RC3`. No copies esta actualización encima del código RC2.
3. Desde la carpeta que contiene `package.json`, ejecuta `CREAR_INSTALADOR_WINDOWS.cmd` en tu Windows 10/11 de 64 bits (requiere Node.js, Internet inicial y Build Tools C++ en la **PC de compilación**).
4. Solo si **npm test** y **electron-builder** terminan correctamente, encuentra `ParkingPOS_Setup_1.0.2_x64.exe` en `INSTALADOR_WINDOWS`. Si el script falla, no uses ningún EXE parcial.
5. Instala ese ejecutable; no necesita SQL Server ni Node.js en la computadora final. Windows debe reconocer el controlador de la impresora térmica.
6. En la aplicación abre **Impresora** y verifica el nombre exacto, impresión automática y el ticket de prueba en papel 80 mm.

**El ZIP descargado contiene código fuente y constructor; NO contiene un ejecutable compilado.**

## Prueba operativa recomendada antes de utilizar dinero real

1. Abrir turno con $500 MXN. Confirmar que NO pregunta dólar.
2. Configurar impresora y realizar ticket de prueba. Registrar entrada y comprobar que el ticket se envía automáticamente. La vista previa no certifica el escaneo físico.
3. Escanear el folio CODE128, comprobar importe y cobrar con $100; verificar el cambio y que el vehículo desaparece de los activos inmediatamente.
4. Probar un segundo escaneo del folio pagado. **No debe cobrar otra vez.**
5. Registrar un cobro USD después de configurar un tipo de cambio durante el turno y verificar monedas por separado.
6. Consultar corte X sin cerrar. Hacer un retiro, volver a consultar corte X.
7. Hacer corte Z contando efectivo; si hay diferencia, verificar su registro. Imprimir el reporte de cierre.
8. Reiniciar, iniciar sesión y abrir el siguiente turno sin perder histórico.
9. Probar sin papel y reimpresión manual del **mismo** ticket, sin generar otra entrada.

## Validación y limitaciones

- Se realizaron **39 pruebas offline** (código ESC/POS, cálculos del tabulador, persistencia con SQLite integrado de Node, pago+salida transaccional, turnos, controles de colas RAW, rutas de UI y seguridad básica). Todas pasaron.
- Pruebas de interacción de la nueva pantalla en Chromium con APIs simuladas: apertura, cierre Z, visualización de diferencias, cobro y ausencia del segundo botón de salida. Sin excepciones JavaScript observadas.
- No fue posible probar aquí el **servidor completo Express + better-sqlite3**, compilar NSIS en Windows ni imprimir o escanear con hardware real. La prueba final debe ejecutarse en la computadora de destino.
- Las mejoras de rapidez evitan iniciar PowerShell en cada impresión; la velocidad de la impresora, su controlador, USB y spooler dependen del equipo. No hay garantía de milisegundos ni de que la impresora haya impreso físicamente cuando Windows acepta la tarea.
