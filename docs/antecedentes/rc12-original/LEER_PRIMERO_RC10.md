# Parking POS RC10 — PENSIONES UNIFICADAS PERSONALIZADAS

## Cambios

- Un solo tipo **Pensión personalizada** para clientes nuevos, sin elegir Diurna/Nocturna.
- Cada cliente configura **12 h o 24 h de cobertura por entrada**.
- Cada cliente define **cobro SEMANAL o MENSUAL**, con precio propio en MXN.
- Permite **adeudo anterior**, abonos y acumulación de semanas/meses vencidos.
- Los carros de pensión **NO usan el tabulador general**. Dentro de la cobertura: salida por $0.00 (sin abrir cajón). Fuera de ella: se cobra **el precio por bloque adicional** configurado para ese cliente. Si ese precio es $0.00, no cobra excedentes.
- Todo se determina al crear la entrada: cambiar después el plan no modifica el boleto existente.
- Se conservan los clientes de pensión antiguos como estaban, con su comportamiento anterior; si deseas el nuevo esquema, entra en editar cliente, elige Pensión personalizada y configura la cuota, cobertura y excedente. No se modifica retroactivamente su historial.
- Los clientes con tarifa especial de día completo ($100 u otra), frecuentes, convenios y exentos siguen disponibles como categorías diferentes de la pensión.
- Turnos Día/Noche, doble ticket, folios, cajón e impresión se conservan sin modificaciones.

## EJEMPLOS (solo ilustrativos)

Pensión Ana: semanal $650, cobertura 12 h por entrada, cada bloque adicional de 12 h $50.
Pensión Pedro: mensual $2,500, cobertura 24 h por entrada, excedente $0.
Estos precios NO se cargan automáticamente a ningún cliente.

## ACTUALIZACIÓN DIRECTA (solo RC9)

1. Respalda la carpeta `%LOCALAPPDATA%\ParkingPOS` en una USB.
2. Cierra completamente Parking POS, incluso en segundo plano.
3. Extrae el ZIP COMPLETO y ejecuta `1_ACTUALIZAR_PC_CLIENTE.cmd`.
4. No elimina la base ni los tickets. Instala el código nuevo y al arrancar añade dos columnas, sin cambiar los contratos anteriores. Se crea un respaldo en `Respaldos_Actualizaciones`.
5. Ingresa como supervisor/administrador > Clientes y pensiones > Nuevo cliente > Pensión personalizada.
6. Verifica con datos ficticios una salida normal y una salida de pensión de 12/24h, además del cobro semanal/mensual.

Si indica que no existe RC9 compatible, no fuerces el instalador ni copies el archivo ASAR a ciegas. Comparte el mensaje para adaptar la actualización a la instalación exacta.

La base pasa a migración 8. No abras RC9 u otra versión anterior con la base ya migrada. Las pruebas disponibles se ejecutaron en Node.js y SQLite simulado; falta comprobar la actualización en Windows y el hardware real.
