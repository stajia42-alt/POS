# Restaurante 9.2 — inicio compacto

Esta actualización conserva los colores, módulos y datos de la versión 9.1. Los cambios se concentran en la presentación.

## Qué cambia

- Encabezado y selector de período más compactos.
- Ventas por tipo de servicio y cuentas en vivo al principio. Se mantienen los nombres configurados, importes, número de cuentas y ticket promedio.
- Los botones de colores aparecen inmediatamente después. Se conserva el orden que cada usuario eligió en Ajustes.
- Venta total, artículos, cuentas pagadas, ticket promedio, comparación, gráficas, propinas, descuentos, cortesías y cancelaciones siguen en el inicio, debajo de los botones.
- En celular se aprovecha mejor el espacio y se evita partir los importes habituales de las tarjetas de servicio en dos líneas.
- La impresión/PDF de Cortes muestra un encabezado breve, el período consultado y los filtros seleccionados. Se retiraron las explicaciones técnicas y el nombre de negocio ilegible del encabezado. Conserva todas las columnas, registros y totales; las advertencias sobre datos incompletos siguen visibles cuando corresponden.

Las consultas SQL y los cálculos permanecen como en 9.1. No se modifica Soft Restaurant.

## Cómo abrir

1. Extrae todo el ZIP en una carpeta nueva.
2. Cierra únicamente la versión anterior de Restaurante.
3. Abre `ABRIR_RESTAURANTE.cmd` de la nueva carpeta. Con Node.js instalado, no necesitas compilar para usarla.

La conexión, usuarios, favoritos y ajustes locales se conservan en la carpeta de configuración existente. No borres esa carpeta.

Si usas una instalación con EXE, genera la versión nueva con `COMPILAR_RESTAURANTE.cmd`. Conserva la carpeta `dist` completa con su `runtime`; abre `dist/ABRIR_RESTAURANTE.cmd`. Un EXE anterior mantiene la interfaz anterior.

## Verificación

- 25 pruebas automatizadas existentes: aprobadas.
- Interfaz revisada con datos de prueba en escritorio y celular; navegación, filtros, servicios adicionales y actualización automática.
- Impresión de Cortes: encabezado limpio, columnas, registros y totales completos; períodos y filtros seleccionados conservados.
- Instalación limpia de dependencias y generación de ejecutable Windows de 64 bits completadas. Se conserva la corrección de `jsonwebtoken` de la versión 9.1.
- El ejecutable no se ejecutó en Windows y no se accedió a la base SQL del negocio. Estas pruebas validan el programa y su presentación con datos de prueba; no certifican los importes de una instalación real.

Los cambios de fuentes de datos de la versión anterior se explican en `CAMBIOS_V9_1.md`.
