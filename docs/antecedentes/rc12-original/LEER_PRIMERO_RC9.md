# Parking POS RC9 — Clientes con tarifa personalizada y adeudo previo

- En **Clientes y pensiones > Nuevo cliente**, elige Pensión diurna/nocturna, luego Semana o Mes y escribe su propio precio.
- Puedes indicar **adeudo anterior** cuando creas la pensión. También puedes agregarlo posteriormente una sola vez desde **Cargar adeudo anterior**.
- Los adeudos históricos se muestran aparte de semanas/meses generados. No se contabilizan como venta de caja hasta que se reciben y aplican pagos.
- Nuevo tipo **Tarifa de día completo**, por defecto **$100 MXN por cada 24 h o fracción**; puedes ajustar su precio por cliente. Se aplica al elegir cliente en la entrada. Una estancia que sobrepase la vigencia del convenio usa el tabulador general, no un precio especial inventado.
- Se conservan los tickets y pagos existentes, turnos Día/Noche y la impresión. Un ticket emitido sigue usando su copia de tarifa anterior.
- **La base se migra a versión 7.** Haz una copia externa de `%LOCALAPPDATA%\ParkingPOS` antes de actualizar. No arranques una versión RC8 o anterior sobre la base ya migrada.
- No se ha probado físicamente en Windows con la impresora y la base productiva; usa datos de prueba y verifica una entrada normal y una de tarifa diaria antes de operar.
