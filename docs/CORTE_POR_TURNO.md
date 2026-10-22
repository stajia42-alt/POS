# Procedimiento de caja — Parking POS RC13

La venta corresponde al **turno abierto**, Día o Noche. No se reinicia a medianoche y no se cierra a una hora programada. Solo **Cerrar corte** termina el turno. **Cambiar usuario**, cerrar la ventana o reiniciar la PC no equivale a hacer un corte.

## 1. Abrir el turno

1. Inicia sesión con tu usuario y PIN o contraseña. No hay una clave universal.
2. Selecciona **Día** o **Noche**.
3. Captura el **Fondo inicial (MXN)**: únicamente los pesos que recibe físicamente ese cajero como fondo. No escribas aquí las ventas del turno anterior.
4. Si también recibe dólares, abre **Fondo en dólares y tipo de cambio (opcional)** y captura el fondo USD real. Si no hay, deja `0.00`.
5. Revisa el tipo de cambio: pesos por un dólar, hasta cuatro decimales. El sistema puede sugerir el último utilizado, pero no arrastra el efectivo anterior.
6. Pulsa **ABRIR CAJA**. Las ventas nuevas comienzan en cero. Los vehículos que siguen dentro conservan su folio, hora y tarifa de entrada.

Si ya hay un turno abierto, consulta quién y cuándo lo abrió. No abras otro programa ni borres la base para comenzar de nuevo.

## 2. Cobrar correctamente

1. Escanea o escribe el folio y pulsa Enter / Buscar.
2. Confirma que corresponde al vehículo e importe de la pantalla.
3. Elige **Efectivo MXN** o **Dólares USD** y escribe lo que entrega el cliente en esa moneda.
4. Verifica el **cambio en pesos**. El sistema entrega cambio en MXN y comprueba que haya pesos suficientes.
5. Pulsa **CONFIRMAR COBRO** una vez. El pago y la salida se guardan juntos; se libera el lugar, se solicita abrir el cajón y se envía el comprobante a la impresora.

Si falla el papel, la impresora o el cajón, el pago guardado sigue siendo válido. **No vuelvas a cobrar ni generes otra entrada.** Consulta el mismo folio y usa **Reintentar impresión del pago**. Reimprimir un comprobante no vuelve a registrar venta ni abre de nuevo el cajón.

### Boleto perdido

Localiza el folio original en vehículos activos y verifica identidad y vehículo. Antes de cobrar, pulsa **Boleto perdido**, escribe el motivo y usa **Aplicar cargo e imprimir**. Se imprime una constancia de boleto perdido, que **todavía no acredita pago**. El total incluye estancia más el cargo del boleto, normalmente $200 MXN, conforme a la tarifa guardada al entrar. Confirma después el cobro normal; se imprime su comprobante de pago.

El cargo se aplica una sola vez. No inventes otra hora de entrada ni registres un vehículo nuevo para reemplazar el boleto.

## 3. Hacer el corte y cerrar

1. Termina los cobros en curso. Entra en **Corte de caja → Resumen y corte** y confirma el número y tipo del turno.
2. Revisa las ventas y el efectivo esperado. Si hubo ingresos extraordinarios o retiros físicos, el supervisor/administrador debe registrarlos en **Movimientos**, con moneda y motivo. No inventes movimientos para esconder una diferencia.
3. Cuenta físicamente **todos los pesos y todos los dólares de la caja, incluido el fondo inicial**. Mantén las monedas separadas. Haz este conteo antes de retirar el efectivo final.
4. Pulsa **Cerrar corte**. Escribe los pesos reales en **¿Cuántos pesos hay en caja?** y los dólares reales en **¿Cuántos dólares hay en caja?**. Escribe `0` USD si no hay dólares. No conviertas los dólares para sumarlos a los pesos.
5. El conteo por billetes/monedas es opcional: introduce cantidades, pulsa **Utilizar suma** y revisa los importes resultantes. También puedes escribir directamente ambos totales.
6. Revisa las diferencias. Si existe un faltante o sobrante, revisa primero cobros, cambios y movimientos. Si la diferencia es real, el sistema permite guardarla tras confirmación. **No exige escribir la cantidad esperada para permitir el cierre.**
7. Pulsa **CERRAR CORTE DE DÍA/NOCHE**. Guarda el comprobante; se intenta imprimir automáticamente. Si falla, usa **Imprimir corte** o búscalo en **Historial de cortes**. El cierre no se deshace por un fallo de impresión.
8. Entrega y documenta el dinero contado. Para el siguiente cajero, pulsa **Abrir nuevo turno** y declara únicamente el fondo que efectivamente recibe. Si queda parte del dinero anterior en la caja, esa parte sí debe incluirse como fondo nuevo.

Los vehículos pendientes no necesitan pagarse para cerrar el turno. Pasan al siguiente con sus datos originales. Las ventas del turno cerrado siguen consultables en el historial; no se suman a las ventas del nuevo.

### Por qué ventas y efectivo no siempre son iguales

Las ventas son el importe cobrado por servicios. El efectivo incluye fondos, cambios y movimientos:

**Pesos esperados = fondo MXN + pesos recibidos − cambio/devoluciones en MXN + ingresos MXN − retiros MXN.**

**Dólares esperados = fondo USD + dólares recibidos + ingresos USD − retiros USD.**

Ejemplo: fondo de $1,000 MXN, un servicio de $225 MXN pagado con US$20 a $18.50. El cambio es $145 MXN. Sin otros movimientos, la venta es $225 MXN, pero el cajón contiene **$855 MXN y US$20**. Esas son las cantidades para declarar; no escribas $1,225 MXN ni conviertas nuevamente los dólares. Cada cobro conserva el tipo de cambio que tenía al pagarse.

## 4. Vehículos del Día cobrados durante Noche

El dinero entra una sola vez, en el turno que cobra. La conciliación muestra qué folios eran del Día, cuáles se pagaron y cuáles siguen dentro. La atribución al Día es informativa y no crea una segunda venta.

Si el administrador entrega físicamente pesos al turno de Día, usa **Entregar pesos al Día**; se registra como retiro de la caja nocturna y reduce su efectivo esperado. No uses ese botón si el dinero permanece en caja. Si recibiste dólares, no registres pesos que no existen: una conversión física real requiere registrar los movimientos de ambas monedas.

**Una entrega pendiente no impide cerrar Noche.** Permanece en la conciliación para resolverla con el responsable. El corte siempre refleja el efectivo que realmente se contó.

El botón de entrega funciona durante el turno de Noche que recibió ese cobro. Después de cerrarlo, cualquier entrega pendiente debe conciliarse por separado con el responsable y conservar su comprobante: esta versión no tiene una acción para liquidar entregas de un turno ya cerrado. No registres un retiro ficticio en una caja nueva para cambiar un corte anterior.

## 5. Reimprimir la última entrada con autorización

En **Caja principal**, usa **Reimprimir última entrada**. Se muestra el folio original; confirma que corresponde al vehículo y escribe un motivo.

- El administrador puede autorizar desde su propia sesión.
- Si opera un cajero o supervisor, el dueño introduce su usuario de administrador y su PIN o contraseña en ese momento. La autorización vale para esa operación; la sesión continúa a nombre del cajero.
- Se imprime una sola copia marcada **REIMPRESIÓN**, con el mismo folio, código y hora. Quedan registrados motivo, operador y administrador autorizante.

El PIN puede ser sencillo, desde cuatro caracteres; las contraseñas existentes siguen funcionando. El dueño debe conservar su PIN y escribirlo personalmente cuando autorice.

## 6. Si vienes de una caja que ya estaba descuadrada

Esta actualización no reescribe ventas ni cobros anteriores. Antes de instalar, conserva un respaldo completo de `%LOCALAPPDATA%\ParkingPOS` con la aplicación cerrada. Después, revisa el turno que ya estaba abierto, cuenta el dinero real, concilia los movimientos y registra cualquier diferencia real al cerrarlo. Abre el siguiente con el fondo que de verdad queda. **No uses restablecimiento de fábrica ni restauración de una base antigua para corregir un corte.**

No se adjuntó la base del cliente; por eso no se atribuye su diferencia histórica a una causa específica ni se afirma haberla conciliado.

## Prueba breve en la PC del cliente

Con datos de prueba y sin afectar la operación, confirma: dos boletos al entrar; mismo CODE128 y folio; un comprobante al cobrar; constancia al marcar perdido; cajón abre al pagar; reimpresión exige autorización al cajero; corte conserva MXN/USD y el siguiente turno muestra cero ventas. Comprueba también papel, corte físico, lectura del escáner y el conector del cajón.
