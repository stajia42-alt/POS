# Parking POS RC8 — Pensiones semanales y mensuales personalizadas

## Qué cambia

- Cada cliente pensionado puede tener su propio precio semanal o mensual en pesos mexicanos.
- La fecha/hora de inicio del contrato determina el inicio de los periodos. Mensual significa **mes calendario** (por ejemplo: 31 de enero a 28 de febrero y luego al 31 de marzo), no 30 días fijos.
- Cada periodo genera un cargo al comenzar. Cuando no se paga, el saldo se acumula; no se generan ingresos de caja hasta registrar un pago.
- En Clientes y pensiones se ve el saldo de cada cliente, los periodos vencidos y un botón **Ver deuda / Abonar**.
- Se admiten abonos parciales en MXN o dólares al tipo de cambio del turno. Se aplican del cargo más antiguo al más reciente.
- Modificar la tarifa o cambiar de semana a mes aplica **en el siguiente periodo por facturar**. No recalcula períodos anteriores.
- La mora no suspende automáticamente la cobertura ni cambia las tarifas de entradas ya registradas; únicamente al desactivar manualmente el cliente se detienen cargos futuros.
- Los clientes antiguos NO se convierten automáticamente: un supervisor debe editar cada uno y elegir plan, precio e inicio. Se sugiere comenzar al final de la vigencia previamente pagada.
- No modifica el flujo de entrada, las dos copias de ticket, la impresora, los folios, ni los turnos Día/Noche.

## Instalación en la computadora del cliente

1. Cierra completamente Parking POS.
2. Respalda la carpeta `%LOCALAPPDATA%\ParkingPOS` a USB, especialmente `parking.db`.
3. Extrae el ZIP de actualización y ejecuta `1_ACTUALIZAR_PC_CLIENTE.cmd`.
4. Abre Parking POS. Al iniciar, la aplicación hará respaldo de la base antes de la migración a la versión de datos 6 (si ya había datos).
5. Entra a **Clientes y pensiones**, edita un cliente o crea uno nuevo. Elige **Cada semana** o **Cada mes calendario**, precio personalizado y fecha de inicio.
6. En **Ver deuda / Abonar**, consulta cada periodo y registra el pago en el turno que físicamente recibe el dinero.

**Advertencia de migración:** después de comenzar a usar la versión de datos 6, no vuelvas a ejecutar un programa antiguo (RC6 o RC7) sobre esa base, porque dichos programas rechazarán una versión de datos posterior. El actualizador guarda la versión anterior del código por seguridad, pero regresar a ella también requeriría restaurar una copia de datos anterior, perdiendo las operaciones hechas después. No se debe hacer sin conciliación.

## Reglas contables

- Un adeudo de pensión NO cuenta como efectivo recibido ni como venta cobrada. Solo el pago confirmado se refleja en el corte del turno.
- No se aplican intereses, recargos ni multas por impago: el nuevo saldo corresponde únicamente a los periodos semanales o mensuales adicionales.
- Puede registrarse el pago parcial de una deuda sin reescribir facturas antiguas ni cobrar dos veces la misma cuota.
- Si el cliente deja de pagar, los cargos siguen acumulándose mientras su contrato permanezca activo.

## Validaciones realizadas

Se ejecutaron pruebas automatizadas del motor semanal/mensual, fin de mes, cambio de horario de Tijuana, pagos parciales, protección ante solicitudes duplicadas, cambios de tarifas, suspensiones y migración no destructiva en SQLite de prueba. No se ha probado aún la actualización instalada en Windows con la impresora real, ni la compilación del instalador ejecutable.
