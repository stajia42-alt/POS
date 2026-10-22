# PARKING POS v0.8 — REVISION_PENDIENTES

**Alcance:** revisión estática del ZIP suministrado y pruebas del nuevo generador térmico. No hubo acceso a la impresora ESC/POS de Windows ni a una instancia operativa de SQLite con `express` y `better-sqlite3`. **No se han probado cobros reales**. Por ello no se marca «FUNCIONAL» ningún módulo cuya operación completa no se ejecutó.

| N.º | Aspecto | Estado | Evidencia y pendiente |
|---|---|---|---|
| 1 | Cobros y cambio MXN/USD | **INCOMPLETO** | Existen `/api/ticket/:code/pay`, cálculo con tasa del turno, cambio expresado en MXN y transacción `better-sqlite3`. Falta simular cobros completos, cambio, insuficiencia y reintentos contra una base de pruebas. |
| 2 | Actualización decimal del tipo de cambio | **INCOMPLETO** | Existe `PUT /api/shift/usd-rate`, guarda tasa y registro de cambios. La interfaz admite valores decimales; falta verificar en entorno real la precisión/visualización de redondeos y caja USD. |
| 3 | Cortes X/Z, retiros, ingresos y diferencias | **INCOMPLETO** | Se identificaron endpoints para turno, corte X, corte Z y movimientos. Los cortes se muestran en navegador; la impresión térmica de cortes no está implementada. Faltan pruebas de conciliación por tipo de pago y de cierre. |
| 4 | Tarifas por rangos y fracciones adicionales | **INCOMPLETO** | `price()` soporta rangos en minutos y horas adicionales. Las reglas fotografiadas de Libra 3 (p. ej., franjas de 12 horas extra) no están precargadas ni equivalen necesariamente a la lógica adicional por hora; no se tocaron tarifas. Verificar todos los límites y fracciones antes de operar. |
| 5 | Pensiones de día/noche, clientes frecuentes, exentos | **INCOMPLETO** | Existe un recargo nocturno configurable, **no** un módulo completo de pensiones, convenios de cliente frecuente o exenciones identificado en el ZIP. |
| 6 | Boleto perdido: $200 + estancia | **INCOMPLETO** | El costo adicional de $200 está fotografiado, pero no se observó flujo ni cargo especial implementado. No se agregó para evitar alterar el motor de tarifas. |
| 7 | Tolerancia de salida después del pago | **CON ERROR** | La configuración `exitToleranceMinutes` existe pero el pago fija `exit_at` al cobrar y no hay validación real de salida ni aplicación de dicha tolerancia. El ajuste da una expectativa que el servidor no cumple. |
| 8 | Usuarios, permisos y cancelaciones | **INCOMPLETO** | No se encontraron mecanismos de autenticación, roles o autorización de cancelaciones en las rutas actuales. Antes de un despliegue compartido son prioritarios. |
| 9 | Respaldos y cobros históricos | **INCOMPLETO** | Los cobros permanecen en el archivo local `ParkingPOS/parking.db`; existe un respaldo manual con `db.backup()`, pero faltan restauración verificada, respaldo automático, retención y prueba sobre una copia. No se borraron registros ni se alteró el esquema de pagos. |
| 10 | Botones, JavaScript y SQLite | **INCOMPLETO** | JavaScript del servidor y de la interfaz pasó comprobación sintáctica; el generador ESC/POS pasó pruebas automatizadas. No se pudieron ejecutar servidor, botones en navegador ni consultas SQLite reales por ausencia de dependencias en este entorno. |

## Impresión de boletos: modificaciones implementadas

- ESC/POS **80 mm**, texto en columnas adaptado a fuente A y conversión de acentos a CP850.
- Folio de 14 caracteres hexadecimales para nuevos boletos, a fin de facilitar el ancho de barras; folios anteriores de 18 caracteres siguen aceptados en reimpresión.
- Código de barras **CODE128 (subconjunto B)** con dato exactamente igual al folio almacenado.
- Nombre para impresión, dirección, políticas y logotipo (PNG/JPG/WebP, convertido a raster monocromático) configurables en **Impresora**.
- Fecha y hora de entrada con segundos, mostrada en hora local de **Tijuana**, a partir de la hora ISO conservada en SQLite.
- Talón desprendible con folio repetido, línea de corte, botón de prueba sin alta ni cobro y comando de corte opcional.
- Impresión **RAW** enviada a la cola de Windows por `winspool.drv` mediante PowerShell, sin diálogo de impresión. El ingreso se conserva si la impresión falla.
- Los datos del boleto se guardan en la clave `ticket_print` de la tabla `config`. No se modificaron pagos, tarifas, cortes o registros históricos.

## Límites de la validación

- 14 pruebas del módulo ESC/POS y validaciones estáticas: **aprobadas**.
- Prueba con impresora térmica física **NO EJECUTADA**. Verificar ancho 80 mm, compatibilidad `GS v 0`, `GS k CODE128`, corte físico y lectura del escáner. Algunos modelos requieren un ajuste específico de comandos o controladores.
- Servidor Express/SQLite y pruebas de navegador **NO EJECUTADAS** aquí porque las dependencias no están instaladas en este entorno. El `.cmd` existente usa `npm install` en Windows si hacen falta.
- La imagen opcional `assets/LIBRA3_logo_referencia_foto.png` se recuperó aproximadamente de las fotografías: su calidad es limitada. Para un logotipo nítido, cargar el archivo original desde la pantalla **Impresora**.
- Las políticas de un estacionamiento deben introducirse y verificarse por su operador. No se añadieron cláusulas legales ni tarifas por cuenta propia.

**Prioridad sugerida para una versión posterior:** validar límites tarifarios y boleto perdido; después control de salida, roles y cancelaciones, respaldo/restauración y conciliación de X/Z.
