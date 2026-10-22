# Parking POS RC12 — Pensiones individuales semanales y adeudos acumulables

- Las **pensiones individuales NUEVAS o editadas** tienen **un precio semanal por cliente**, sin cobros por hora, excedentes ni uso del tabulador normal al salir.
- Cada semana iniciada genera un cargo de la cuota personalizada. Si no pagan, sigue acumulándose deuda sin suspensión automática.
- Puedes añadir **tantos adeudos manuales como necesites**, indicando fecha, importe y motivo (ejemplo: $300 + $250 + $150 = $700). Se guardan como líneas independientes, no reemplazan ni borran los anteriores.
- Los abonos parciales en MXN o USD descuentan del saldo según antigüedad del cargo, y se registran como venta solamente al recibir el pago.
- Los contratos históricos mensuales y los boletos emitidos antes de esta actualización conservan sus condiciones guardadas. Para pasar un pensionado anterior a tarifa individual SEMANAL, edita y guarda su cliente: empieza con el siguiente periodo no facturado. **No cambia cargos ni abonos pasados**.
- Los clientes de tarifa fija diaria ($100 u otro), los frecuentes, exentos y los clientes normales NO cambian.
- La migración de SQLite crea tablas separadas para nuevos adeudos, sin modificar las filas existentes. Como cambia el esquema a versión 9, no vuelvas a abrir una versión anterior contra esa misma base.
- Para instalar sobre la RC11 exacta: cierra Parking POS, respalda `%LOCALAPPDATA%\ParkingPOS` en una USB, extrae todo el ZIP y ejecuta `1_ACTUALIZAR_PC_CLIENTE.cmd`.
- Prueba antes de cobrar dinero real: crear una pensión semanal; cargar dos deudas de distinto importe; hacer un abono parcial; consultar saldo; verificar que la salida del pensionado es $0 y que el corte solo registra pagos efectivos.

**No probado físicamente en Windows con impresora/cajón.** Es una actualización candidata para pruebas.
