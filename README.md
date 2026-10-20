# AVILES POS 2.1 — Primera etapa

[Descargar APK](https://raw.githubusercontent.com/stajia42-alt/POS/instalador-aviles-pos-2-1/AVILES-POS-2.1.apk)

[Descargar ZIP completo](https://raw.githubusercontent.com/stajia42-alt/POS/instalador-aviles-pos-2-1/AVILES-POS-2.1-COMPLETO.zip)

Fuentes: commit `cb84fb46d76c13bca7aa4090ad2db3ee037d1f20`.

```text
AVILES POS 2.1 — PRIMERA ETAPA

INSTALACIÓN ANDROID
1. Antes de actualizar desde 1.2, asigna PIN exclusivos a los empleados activos,
   especialmente al administrador. Un PIN compartido se rechaza al identificar.
   Sin un administrador con PIN exclusivo no hay recuperación automática.
2. Extrae este ZIP y abre AVILES-POS-2.1.apk en la tableta Android.
3. Autoriza la instalación desde esa fuente cuando Android lo solicite.
4. Actualiza sobre la versión anterior: NO desinstales ni borres almacenamiento.
   Se conserva paquete mx.aviles.pos y la firma de desarrollo de 1.0/1.1/1.2.
   Este APK es de depuración. No permite volver al esquema antiguo tras migrar.
5. Primera instalación: crea propietario con nombre y PIN. No hay PIN por defecto.
   Actualización: entra solo con tu PIN y abre el turno con fondos MXN/USD.
6. Configuración permite Venta rápida, Restaurante o Ambos. En Mesas, un usuario
   autorizado crea áreas/mesas y edita el plano. Las cuentas se guardan al operar.

ALCANCE
PIN, apertura obligatoria, fondos/movimientos/cierre por moneda, modos de venta,
mapa editable, transferencia/unión de cuentas completas y recuperación por empleado.
Las ventas siguen cobrando MXN. Fondo USD no significa pago USD.
Pendientes: impresoras ESC/POS, comandas, cobros USD, división/pagos parciales,
autorizaciones puntuales por PIN de supervisor y los pendientes anteriores.
Los métodos bancarios son registros manuales; no procesan pagos bancarios.

VERIFICACIÓN
85 pruebas de lógica/SQLite y 18 recorridos de navegador aprobados.
APK compilado y firma verificada; no ejecutado en Android físico ni emulador.
No hay impresoras físicas probadas. No se afirma rendimiento medido en tableta.

CONTENIDO
AVILES-POS-2.1.apk: instalador Android.
AVILES-POS/: fuentes completas, proyecto Android, pruebas y documentación.
VERIFICACION.json: versión, SHA256, firma compatible y commit de fuentes.
Lee AVILES-POS/AVILES_POS_PROGRESO.md y AVILES-POS/docs/MODULOS-2.1.md.
Este ZIP no contiene datos comerciales, claves de firma ni copia de SQLite.
No existe todavía respaldo/restauración exportable de la base de la tableta.

```
