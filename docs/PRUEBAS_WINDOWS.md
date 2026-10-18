# Validación en Windows pendiente

El desarrollo inicial se realizó en Linux y GitHub Actions ejecutó las 37 pruebas, Electron fuente/empaquetado y la compilación en Windows. Esas pruebas automatizadas no verifican la instalación ni una impresora física. Ejecuta esta lista en una PC de pruebas con Windows 10/11 x64 antes de usarlo en caja real.

| Comprobación | Resultado a verificar |
| --- | --- |
| Instalación limpia | Instalador por usuario, interfaz en español, carpeta exclusiva, accesos directos e inicio sin Node.js instalado |
| Cuenta inicial | Crear administrador sin credenciales predeterminadas; salir y entrar nuevamente |
| Persistencia | Cerrar y abrir el programa; conservar negocio, usuarios, inventario, movimientos y turno |
| Ticket pendiente | Intentar cerrar con un carrito sin registrar: seguir trabajando o confirmar descarte, sin cerrar el servicio al continuar |
| Operación | Fondo $1,000; compra 10 kg a $5 => caja $950 y stock 10 kg; venta 2 kg a $10 => caja $970 y stock 8 kg |
| Pesaje | Bruto 10.125 menos tara 0.125 => 10.000 kg; Enter y atajos F2/F3/F4 |
| USD | Venta $20 MXN, TC 20, recibe USD 2 => cambio $20 MXN; cajas MXN/USD conciliadas separadamente |
| Seguridad de caja | Rechazar venta sin stock, compra sin efectivo y turno de otro cajero |
| Cancelaciones | Revertir inventario y efectivo con motivo; impedir cancelar una compra ya consumida y operaciones de turnos cerrados |
| Cierre | Capturar contado MXN/USD, conservar diferencia y descargar/imprimir corte; comprobar copia automática |
| Impresoras | Detectar impresoras Windows con nombres y acentos reales; seleccionar 58/80 mm y guardar |
| Driver | Imprimir ticket corto/largo, compra/venta y corte; revisar ancho, saltos, caracteres y legibilidad |
| RAW ESC/POS | Probar con térmica compatible, papel 58/80 mm y corte físico; validar permisos de PowerShell/Add-Type/spooler del equipo |
| Fallo de impresión | Impresora desconectada o cola detenida: mostrar fallo/timeout y conservar la operación sin duplicarla; revisar cola antes de reimprimir |
| Respaldos | Descargar SQLite, restaurar con caja cerrada, conservar copia previa y entrar con credenciales del respaldo |
| Migración | Probar copia de JSON V15 real; verificar material por material y consultar el original archivado |
| Actualización | Cerrar el programa, instalar nuevamente en la misma carpeta y conservar AppData |
| Desinstalación | Retirar aplicación y accesos directos; conservar `%APPDATA%\METales-GV Pro\data` |
| Pantalla | Resolución, escala 125/150%, teclado y ventanas con nombres/rutas de usuario con espacios o acentos |

El artefacto no tiene firma Authenticode. Windows puede indicar que el editor no está verificado. La firma de distribución requiere un certificado propio y no se ha configurado. La aceptación del trabajo por el spooler no demuestra que el papel se haya impreso: comprueba el resultado físico.

No se ha implementado lectura automática de báscula serial/USB, CFDI, sincronización entre sucursales, multicaja en red, pagos divididos o crédito. Los pesos son manuales y los tickets son comprobantes internos.
