# Análisis de proyectos y decisiones

## Originales conservados

Los siete archivos adjuntos están en `originales/` con sus nombres y bytes originales. `originales/SHA256.json` contiene nombre, tamaño y SHA-256. También se extrajo el ZIP de Restaurante para inspección, sin ejecutar sus instaladores, scripts SQL, PowerShell o conexiones remotas.

El repositorio anterior solo contenía `README.md`; la aplicación nueva está en `metales-gv-pro/`. Los documentos adjuntos se analizaron como material del proyecto. Las exclusiones e integración se determinaron por la solicitud del usuario.

## Qué se reutilizó

| Origen | Componentes aprovechados | Implementación nueva |
| --- | --- | --- |
| Restaurante `app.js` | Arquitectura Express, separación de módulos, manejo de errores y protección por origen | `src/server.js`, servicio local independiente |
| Restaurante `gestion.js` | Patrón de contraseñas scrypt con sal, sesiones HttpOnly, nonce CSRF y roles verificados en servidor | Usuarios y auditoría en SQLite; privilegios del dominio de reciclaje |
| Restaurante `public/index.html` y `style.css` | Estructura sidebar/workspace/topbar, tarjetas de indicadores, tablas, filtros y diálogo | `public/index.html`, reglas reutilizadas en `foundation.css`, nuevo tema visual en `style.css` |
| METales-GV V15 HTML | Compra con carrito, venta por kg, catálogo común, iconos, peso por Enter, atajos F2/F3/F4 y datos del negocio | Interfaz modular y carrito de compras/ventas de varios materiales |
| METales-GV V15 funciones de tickets | `normalizeTicketText`, `padTicket`, disposición 32/48 columnas y ESC/POS | `src/tickets.js`, ajuste correcto de palabras largas, snapshots históricos y tickets por transacción |
| METales-GV `main.js` / `preload.js` | Lista de impresoras, spooler RAW de Windows y separación Electron/renderer | Puente IPC acotado, sandbox, validación de impresora, timeout, impresión de texto escapado y verificación de bytes escritos |

V14.1 y V15 se contrastaron para reconocer la continuidad de la estructura de datos. El `package.json` recibido declara versión 15.4.0 mientras el HTML V15 aún muestra identificadores V14.1. La nueva aplicación usa una versión independiente y coherente: **1.0.0**.

No se copiaron el servidor SQL, `mssql`, la autodetección de Soft Restaurant, tablas de cheques/comandas, mesas, meseros, propinas, recetas, menús, OCR de menús, Gemini ni túneles Cloudflare al runtime nuevo. Los archivos originales siguen conservados como referencia fuera de la aplicación.

## Problemas corregidos

1. `cashExpected()` de V15 omitía restar las compras en efectivo. El nuevo mayor de caja registra todos los movimientos y la reversa de cancelaciones.
2. `quickSetup()` de V15 permitía entrar como el primer usuario sin validar PIN. Se eliminó ese acceso; el primer administrador se crea una sola vez y todas las rutas de datos exigen sesión.
3. V15 guardaba el PIN en claro, con `1234` predeterminado, y todos los datos en `localStorage`. Se sustituyó por scrypt con sal aleatoria, SQLite y permisos del servidor.
4. Los totales originales usaban números decimales en punto flotante. La nueva aplicación usa gramos, centavos y redondeo por renglón con aritmética entera.
5. Los carritos originales podían depender del precio actual al confirmar. Los tickets nuevos conservan nombre, precio, peso, costo y usuario de cada operación; cambiar el catálogo no cambia la historia.
6. No había una transacción única para ticket, inventario y caja. Ahora se confirman o revierten juntos; se comprueba inventario agregado incluso cuando el mismo material aparece dos veces.
7. Se agregaron identificadores de solicitud para no duplicar el cobro al reintentar el mismo carrito.
8. La función de ajuste de texto V15 comparaba incorrectamente una concatenación con el ancho y truncaba palabras largas. Las pruebas verifican conservación del contenido en 32/48 columnas.
9. La ruta RAW original no verificaba `dwWritten`. La adaptación detecta escritura incompleta y siempre libera memoria y recursos de spooler.
10. Se retiraron conexiones, credenciales, módulos y herramientas que no pertenecen al negocio de reciclaje.

## Reglas del dominio

El precio de compra y venta se expresa en MXN/kg. Un kilogramo admite tres decimales. Neto = bruto − tara, siempre positivo. Un importe por renglón se redondea a centavos, mitad hacia arriba. El total suma los importes redondeados de los renglones. Los cajeros usan los precios del catálogo; el administrador puede modificarlos durante una operación.

Inventario: compras agregan kg y valor; ventas retiran kg y costo promedio; los ajustes dejan motivo y kardex. Una cancelación de compra se bloquea si no quedan suficientes existencias o valor para revertirla. Las cancelaciones solo afectan operaciones del turno abierto y no borran tickets. No se reabren cortes cerrados.

Caja MXN = fondo + ventas en efectivo − compras en efectivo − gastos en efectivo + entradas − retiros − cambio MXN de ventas en USD, más reversas. Caja USD = fondo USD + dólares recibidos, más reversas. Transferencias y tarjetas no alteran el efectivo. El tipo de cambio manual queda fijo por turno. No hay pagos a crédito, cuentas por cobrar/pagar ni pagos divididos en esta versión.

## Importación V15

Se valida el respaldo completo y se calcula por material: inicial + compras − ventas + ajustes. Se conservan los mínimos `minStock`. No se acepta inventario negativo, materiales duplicados o referencias inexistentes. Debe cerrarse el turno original antes de importar. La importación exige una instalación sin materiales/operaciones y caja cerrada; se hace una sola vez.

El catálogo y saldos se convierten en aperturas del nuevo sistema. Su valoración es estimada al precio de compra vigente en el respaldo, porque el historial original no permite reconstruir un costo promedio contable confiable. El JSON se archiva íntegro para descarga administrativa. Los tickets y cortes históricos permanecen en ese archivo; no se presentan como operaciones nuevas ni se incorporan a los reportes nuevos. Los usuarios/PIN antiguos no se activan.
