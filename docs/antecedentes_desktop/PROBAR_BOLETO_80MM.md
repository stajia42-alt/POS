# PARKING POS — Instalar y probar el boleto de 80 mm

1. **Conserva un respaldo de tus archivos actuales**. El archivo histórico `parking.db` se mantiene fuera del proyecto, en `%LOCALAPPDATA%\ParkingPOS\parking.db`; el ZIP no lo incluye ni lo borra.
2. Extrae **todo el ZIP** en una carpeta nueva. No copies archivos uno por uno. En Windows con Node.js instalado, abre `INICIAR_WINDOWS.cmd` (usa `npm ci --omit=dev` si faltan dependencias).
3. Entra a `http://127.0.0.1:3785`, inicia sesión como administrador o supervisor y abre **Impresora**. Escribe el nombre exacto de la impresora ESC/POS de 80 mm instalada en Windows.
4. Configura nombre en el boleto, dirección y políticas. Carga el logotipo PNG/JPG preferentemente original; opcionalmente prueba `assets/LIBRA3_logo_referencia_foto.png` (recuperado de la foto y de calidad limitada). Ajusta **corte automático** según el equipo.
5. Pulsa **Guardar impresión** y **Imprimir boleto de prueba**. No se crea entrada ni cobro: debe decir *PRUEBA SIN VALOR*. Escanea las barras y comprueba que el folio coincida con el impreso.
6. Finalmente, con una caja de prueba abierta, emite **una entrada de prueba** y verifica fecha/hora, logo, dirección, políticas, doble folio y corte. Comprueba también **Reimprimir ticket**.

La tabla de Libra 3 está disponible como referencia opcional en Tarifas. No se activa automáticamente.

7. Cobra un boleto de prueba y usa **Imprimir comprobante**. En Corte de caja, imprime X y Z; verifica separación de pesos/dólares, esperado, contado y diferencias.
8. Confirma físicamente la salida para liberar el cajón. Este paso es independiente de cobrar.

La prueba física de Windows, impresora, corte y lectura de barras debe hacerse en el estacionamiento; no se ejecutó en el entorno de desarrollo Linux.
