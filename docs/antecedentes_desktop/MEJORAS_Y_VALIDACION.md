> NOTA: Este documento proviene de la versión base. Para el estado de la versión RC1 y sus limitaciones, consulta `LEER_PRIMERO_VERSION_1_0_RC1.md`.

# Parking POS 1.0 — mejoras y validación

Entrega: 11 de octubre de 2026, hora de Tijuana. Evolución del ZIP ParkingPOS_COMPLETO_Boleto_ESC_POS_80mm: conserva la interfaz oscura, el esquema histórico y el generador original de boletos de 80 mm. No incluye datos reales de operación: el ZIP recibido no contenía `parking.db`.

## Diez puntos implementados

| Punto | Implementación | Validación ejecutada |
|---|---|---|
| 1. Cobros MXN/USD | Importes enteros en centavos, pagos suficientes, cambio siempre MXN, verificación del efectivo disponible, operaciones atómicas e identificador de reintento. | API con SQLite real; navegador con cobros MXN y USD. Cobros simultáneos con claves iguales y distintas. |
| 2. Tipo de cambio | Hasta 4 decimales, conversión con enteros y redondeo al centavo; cada pago conserva su tasa. Una tasa cambiada obliga a consultar nuevamente. | Casos de redondeo, actualización decimal, rechazo de tasa obsoleta y conservación de pagos anteriores. Formulario probado. |
| 3. Caja X/Z | Fondos en MXN/USD, ingresos y retiros en ambas monedas, devolución como movimiento negativo, esperado/contado/diferencias por moneda, X de consulta y Z de cierre. Impresión ESC/POS de cortes actuales y anteriores. | Conciliación API, bloqueo de retiros sin fondos, cierre repetido, protección frente a cambio de turno. Navegador y generación de impresión X/Z; envío físico pendiente. |
| 4. Tarifas | Hora/fracción, rangos, fracción adicional en minutos, gracia, máximo por 24 h y recargo nocturno. Instantánea tarifaria por boleto. Referencia Libra 3 seleccionable. | Límites 60/120/360/720/1440/2160 min y minuto posterior; máximos, monotonía, validación y carga de referencia en navegador. |
| 5. Clientes y pensiones | Registro y edición por placa, vigencia, pensión diurna/nocturna con horario configurable, tiempo descubierto, frecuentes y convenios con porcentaje, exentos. Cobro de renovación en caja. | Cálculo día/noche y cruce de medianoche, vencimiento, exención, convenio, identificación por placa, renovación idempotente. Alta y cobro de renovación en navegador. |
| 6. Boleto perdido | Marcado con motivo, inicialmente $200 MXN además de la estancia; importe configurable y congelado por boleto. No se aplica dos veces. | API y navegador, cobro incluido y rechazo posterior al pago. |
| 7. Tolerancia de salida | Pago y salida separados; el cajón sigue ocupado hasta confirmar salida. Al vencer la tolerancia se exige la diferencia de estancia que corresponda. Pagos adicionales sin sustituir el original. | Minuto exacto de tolerancia y vencimiento; bloqueo de salida con saldo, pago adicional, ocupación y confirmación real en navegador. |
| 8. Seguridad | Administrador inicial sin contraseña predeterminada, contraseñas scrypt, sesiones HttpOnly, roles, baja/cambio de usuarios, contraseña propia, permisos de API y bitácora. Cajero requiere credencial de supervisor para cancelar. | Login, permisos, rechazo de credenciales/contraseñas inválidas, invalidación de sesiones, cancelación y devolución con autorización. Creación de cajero e interfaz restringida. |
| 9. Conservación y respaldos | Migración transaccional respaldada, SQLite WAL, un solo turno abierto, bloqueo de segunda instancia, respaldos consistentes al iniciar/cada hora/manuales. Restauración validada al reiniciar; recuperación fuera de línea con archivo íntegro de originales. | Migración desde esquema anterior, conservación de filas/cambio histórico, reversión ante dos turnos abiertos, backup/integridad/restauración, rechazo de respaldo que perdería registros y recuperación de archivo dañado de prueba. |
| 10. Interfaz/API/SQLite | Botones conectados, validaciones compartidas, protección de doble clic/reintentos, errores de pago recuperables, formularios nuevos con el estilo original, reportes por fecha local, impresión de entrada conservada. | Sintaxis, suite automática, flujos completos en Chromium sin errores de JavaScript. |

## Resultado reproducible

- **37 pruebas automatizadas aprobadas** mediante `npm test`. Incluyen las 14 pruebas originales de ESC/POS y 23 de dinero, tarifas, API, concurrencia, autenticación y conservación de SQLite.
- **10 flujos funcionales de navegador aprobados**, con administrador y cajero, sin errores `pageerror`; `npm run test:ui`.
- Evidencia de la ejecución: `docs/PRUEBAS_AUTOMATICAS.txt`, `docs/PRUEBAS_INTERFAZ.json` y `docs/ENTORNO_PRUEBAS.json`.
- API Express y SQLite nativo sí se ejecutaron. Las bases de pruebas son temporales; no se usó una base productiva del estacionamiento.
- Las pruebas controlan el reloj para reproducir tarifas y tolerancia sin esperar horas. La aplicación normal usa la hora real del servidor.
- En las pruebas de interfaz, la salida a la impresora se sustituyó por captura en memoria. El generador ESC/POS se prueba por separado. Esto **no equivale** a haber impreso físicamente.

## Validación física pendiente

1. **Windows:** iniciar y detener usando los `.cmd`, comprobar instalación de dependencias y permisos sobre `%LOCALAPPDATA%\ParkingPOS`. Se escribieron los scripts, pero aquí no se ejecutó Windows ni PowerShell.
2. **Impresora de 80 mm:** nombre exacto, cola RAW, acentos CP850, márgenes, logotipo, código CODE128, talón y cuchilla. Probar un boleto, una reimpresión, un pago y cortes X/Z. El boleto será una adaptación térmica de la referencia, no una copia fotográfica garantizada.
3. **Escáner:** leer el CODE128 impreso e identificar exactamente el mismo folio. Los folios anteriores de 18 caracteres siguen admitidos.
4. **Falla de impresora:** desconectar, registrar una entrada, confirmar que queda guardada y reimprimir al reconectar. La API simula y prueba este caso; falta el cable/dispositivo real.
5. **Caja física:** cobrar casos MXN/USD, contar pesos y dólares por separado, hacer retiro y cotejar corte Z contra el efectivo real.
6. **Datos del negocio:** iniciar primero sobre una copia de su base, revisar conteos y totales históricos, vigencias de pensiones y todas las tarifas elegidas. La migración fue probada con un esquema anterior construido en pruebas, no con una base real adjunta.

## Decisiones de operación que deben conocer

- **X consulta y Z cierra un turno**, como en el proyecto recibido. Un Z cerrado no se reabre ni se recalcula por cambios futuros de tipo de cambio.
- La tarifa aplicada a un boleto es la de su entrada. Lo mismo ocurre con beneficio de cliente, tolerancia y cargo por boleto perdido. Renovar una pensión no reescribe boletos anteriores.
- Al vencer la tolerancia, el saldo es `tarifa actual de la estancia − total ya pagado`. Si el saldo sigue en cero, se permite salir. No hay multa inventada por cada minuto de atraso.
- El máximo diario limita la estancia de cada bloque de 24 h. El recargo nocturno y el boleto perdido se agregan por separado. Los rangos son importes acumulados; el adicional comienza después del último rango.
- Una pensión cubre solo tiempo dentro de su vigencia y horario. El tiempo descubierto acumulado se cobra con la tarifa del boleto. Convenios/frecuentes aplican descuento si toda la estancia cae en la vigencia. La placa no se exige al público general.
- Un cliente puede registrarse con vigencia ya autorizada o pagada externamente. El botón **Cobrar / renovar** extiende la vigencia y registra un ingreso real. Registrar un cliente no genera un cobro ficticio.
- Cancelar conserva el boleto y los cobros originales. Si hubo pago, se registra una devolución en **MXN** en el turno actual, incluso cuando el cobro original fue en USD. Requiere fondo suficiente y autorización.
- La restauración normal bloquea copias que omitan o cambien históricos actuales. No fusiona bases divergentes. La recuperación de una base dañada archiva los archivos originales y recupera lo contenido en el respaldo; lo ocurrido después requiere conciliación/recuperación del original dañado.
- El servidor sigue limitado a `127.0.0.1`; no incluye acceso remoto, facturación fiscal ni integración de barreras automáticas.

Los diagnósticos anteriores se conservan en `docs/antecedentes/` únicamente como referencia de origen. Este documento describe la entrega actual.
