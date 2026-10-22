# Parking POS RC11 - Pensiones: 12/24 horas desde el boleto

- Cada cliente pensionado conserva su precio semanal o mensual, deuda anterior y tarifa personalizada de excedente.
- La cobertura de 12 o 24 horas **comienza desde la fecha y hora de entrada impresa en el boleto**, no desde un horario fijo ni desde la apertura de caja.
- Ejemplo: ticket emitido a las 14:35 de hoy con 12 h -> vence a las 02:35 de mañana, incluso después de cerrar Día y abrir Noche.
- En ambos boletos (original y copia interna) aparece el límite de cobertura en caso de pensión. La vista previa y pantalla de cobro también lo muestran.
- Si vence, el excedente se cobra únicamente según el precio personalizado por bloque de 12/24 h de ese cliente; **no se aplica el tabulador general**.
- Cambiar después el precio o periodo de un cliente no modifica la cobertura de boletos anteriores.
- No se modifican ni borran entradas, salidas, cobros, adeudos ni turnos existentes. No requiere una nueva migración de SQLite.

**Precisión:** el momento registrado es la hora en que el sistema emite y envía el ticket a la cola de impresión. El hardware no garantiza informar la hora física exacta en que termina de salir el papel.

## Actualización

Compatible solo con la versión RC10 exacta del actualizador anterior. Cierra Parking POS, respalda `%LOCALAPPDATA%\ParkingPOS` en otra unidad, extrae el ZIP completo y ejecuta `1_ACTUALIZAR_PC_CLIENTE.cmd`. Si el instalador no encuentra una RC10 compatible, detente: no reemplaces manualmente archivos. El parche reemplaza el programa, no los scripts de impresora ni la base de datos.

**Prueba recomendada:** registra un pensionado de 12 h a las 14:35 y comprueba que el ticket, la vista previa y el cobro indiquen las 02:35 del día siguiente. Después prueba exactamente 12 h y 12 h + 1 segundo, y un relevo Día/Noche. La impresión física requiere validación en tu impresora.
