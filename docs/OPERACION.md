# Operación diaria

1. Instala y abre **METales-GV Pro**. En el primer inicio, captura el negocio, tu usuario y una contraseña de al menos diez caracteres. No hay usuario predeterminado.
2. En **Mi negocio**, revisa dirección, RFC, mensaje y zona horaria. Selecciona la impresora instalada, papel y modo; guarda antes de imprimir una prueba.
3. En **Materiales**, crea el catálogo con precios de compra/venta por kg y mínimos. La existencia inicial solo se usa al comenzar. Si migrarás desde V15, realiza la importación antes de crear materiales.
4. En **Caja y turnos**, captura fondo contado en MXN/USD y tipo de cambio manual. Un solo turno puede permanecer abierto. El cajero opera su turno; un administrador puede intervenir.
5. En **Compras**, selecciona material, peso bruto y tara. Enter agrega el renglón. Agrega más materiales, identifica proveedor si lo deseas, selecciona efectivo o transferencia y revisa antes de registrar. El pago en efectivo requiere fondos disponibles.
6. En **Ventas**, sigue el mismo pesaje, selecciona pago y captura efectivo recibido si aplica. El sistema muestra el cambio en pesos. No puedes vender más del inventario disponible.
7. La operación confirmada muestra su ticket. Si falla la impresión, la operación sigue registrada: vuelve a **Tickets**, comprueba el folio y reimprime sin registrar otra venta. Si una solicitud queda sin respuesta, el mismo carrito conserva su identificador para reintentar; consulta primero el historial.
8. Registra **Gastos**, entradas o retiros con motivo. Para corregir una operación, el administrador puede cancelarla durante el turno abierto. No se elimina el registro original.
9. Revisa el kardex y los mínimos en **Inventario**. Los ajustes requieren permiso administrativo y motivo; no admiten saldos negativos.
10. Para cerrar, cuenta físicamente MXN y USD, captura ambos y revisa las diferencias. El corte queda guardado y se genera una copia SQLite automática. Puedes imprimirlo desde el historial de cortes.
11. Descarga un respaldo completo desde **Respaldos** y guárdalo fuera del equipo. Para restaurar, primero cierra la caja, selecciona un archivo de esta aplicación y escribe RESTAURAR. Se conserva una copia previa y se exige iniciar sesión con los usuarios del respaldo.

Atajos: **F2** compras, **F3** ventas, **F4** caja, **Enter** agregar peso, **Escape** cerrar un diálogo. Al cerrar una ventana con un carrito pendiente, se advierte que aún no está registrado.

Los datos de pruebas automáticas se crean en directorios temporales y se eliminan. La entrega inicial no contiene operaciones ficticias ni credenciales de demostración.
