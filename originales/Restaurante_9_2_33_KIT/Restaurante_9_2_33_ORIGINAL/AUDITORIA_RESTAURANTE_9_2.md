# Restaurante 9.2 — auditoría y avance de integración

**Fecha:** 8 de octubre de 2026. **Estado:** avance de desarrollo; no es una versión comercial ni un instalador final.

Se auditó el código de `Restaurante9_2_Grupos_Automaticos_OCR(2).zip`. El archivo original permanece disponible y no se intervino la computadora ni la base de datos del negocio. Los cambios de esta etapa están en una copia de trabajo; no se deben sustituir las instalaciones de clientes con este avance.

## Entrega vigente RC3: categorías e importación conjunta (8 de octubre de 2026)

**Evidencia examinada:** ZIP RC2 enviado de vuelta (SHA-256 `cc6118b081f5f1260dadc46e275347a44ad91cdb12c93bc2c3c62497cf64abe4`), fotografía de la pantalla con siete propuestas y `Restaurante_Estructura_Menu (1).json`. El diagnóstico contiene 355 tablas, 5443 columnas y definiciones reales de disparadores; corresponde a SQL Server 12.0.4100.1 y base `softrestaurant11`. No contiene los registros del catálogo ni el texto de la fotografía del menú.

### Defectos confirmados y correcciones

- RC2 bloqueaba los disparadores activos y exigía una clave única inexistente en `productosdetalle`. También trataba como bloqueantes las relaciones habilitadas cuyo historial no estaba verificado. Esas condiciones impedían preparar una importación con la estructura enviada.
- Se revisaron las definiciones exactas de los disparadores de grupos, productos y precios. Se admiten por huella SHA-256; cualquier definición distinta sigue requiriendo revisión. No se cambia ni deshabilita un disparador, índice o restricción de la base.
- `TR_productosdetalle_insert` puede borrar precios anteriores de la misma clave. Por eso se comprueba la ausencia de precios en **todas las empresas** bajo bloqueo de tabla dentro de la transacción, se inserta cada clave nueva individualmente y se vuelve a comprobar el resultado. Un precio huérfano bloquea el lote; no se reemplaza. El bloqueo de catálogo puede demorar brevemente otras operaciones mientras se importa.
- Los grupos nuevos y sus productos se preparan y confirman en un mismo lote. Si falla cualquier inserción, se revierten también los grupos recién creados. Las claves vacías se proponen desde el servidor y se muestran antes de confirmar. No se crean grupos del proyecto que no estén usados en ese lote.
- Se toma empresa, unidad y configuración de un producto existente que el usuario elige. La revisión conjunta sustituye tener que marcar cada ficha como revisada. La confirmación de los datos sigue siendo explícita.
- Se admiten referencias exentas o con un único impuesto porcentual si sus datos reales concuerdan con el precio bruto y neto. La tasa se toma de la referencia; no se fija una tasa por defecto. Impuestos compuestos, recargos fijos, datos nulos o importes que no concuerden se rechazan. Los grupos nuevos toman la clasificación y ajustes del grupo de referencia; no se inventa una clasificación.
- La interfaz permite **quitar y renombrar categorías del proyecto** conservando productos y evidencia. No elimina grupos que ya existan en SQL.
- Un título sin productos, como YUAN antes de ENTRADAS, ya no se propone como categoría. Se mejoró la asociación cuando hay traducciones entre nombre y precio, cuando el precio acompaña una traducción y cuando un nombre en mayúsculas precede a su precio. Las ambigüedades conservan el texto y muestran una advertencia.
- El texto pendiente permite abrir una propuesta manual con su evidencia. El usuario confirma el precio; no se inventan los productos faltantes.

### Verificación y límites

94 pruebas Node aprobadas: incluyen regresiones del diagnóstico real anonimizado, categorías, traducciones, impuestos de referencia, importación conjunta, reversión y prevención de sobrescritura por el trigger. Los ensayos de transacción usan dobles explícitos: **no certifican la ejecución en SQL Server**.

Las 10 pruebas Python del adaptador siguen comprobando formatos, respuestas vacías y limpieza de temporales. No ejecutan PaddleOCR real.

La revisión de navegador usa el servidor Express y texto de prueba. Comprueba conservación de proyectos, edición de categorías, recuperación de evidencia, errores visibles y diseño adaptable. Un caso aislado intercepta la respuesta de compatibilidad y rechaza la vista previa para verificar exclusivamente el envío del formulario; no simula un guardado SQL y no se incluye una conexión falsa en la aplicación.

**Pendiente:** ejecutar la importación en una copia del negocio y revisar su aparición en Soft Restaurant; comprobar los diez productos de la foto original o del proyecto OCR exportado. La imagen recibida es una captura de resultados y no permite identificar los tres omitidos. Los modificadores siguen sin escritura habilitada: la estructura sola no comprueba cómo se configura un ejemplo real. Tampoco está certificado el instalador Windows ni el cifrado/ACL de credenciales.

Esta sección reemplaza el estado vigente de RC1/RC2; las secciones siguientes son el historial del trabajo.

## Corrección RC2: lectura vacía (8 de octubre de 2026)

Las capturas del negocio muestran 1 foto marcada como analizada, 0 propuestas y **0 líneas de evidencia**. Por tanto, no basta ajustar categorías: hay que revisar primero la entrega y respuesta del OCR.

Defecto comprobado en código: `ocr_local.py` creaba un archivo temporal `.img` incluso para una imagen JPEG. RC2 usa `.jpg`, `.png` o `.webp` según el formato comprobado con Pillow, sin alterar los bytes. La extensión incorrecta es una causa posible del resultado vacío en PaddleX; no se ha reproducido esa inferencia con el motor real del cliente.

Se rechazan respuestas OCR vacías en Python, en el protocolo Node y en la interfaz. No se marcan como éxito. Los proyectos antiguos con fotos analizadas sin texto se conservan y marcan para revisión. Los errores permanecen en la fotografía y permiten reintentar. La consulta de catálogo vacío advierte revisar la conexión; no se supone pérdida de datos ni se cambia de base.

Verificado en esta revisión: **84 pruebas Node y 10 pruebas Python aprobadas**. Las pruebas Python comprueban JPG/PNG/WebP, respuesta vacía, lectura diferida y limpieza de temporales con un doble explícito del motor; **no son una prueba de PaddleOCR real**. También se ejecutó la revisión de navegador del servidor real sin SQL/Paddle disponibles. Se mantiene pendiente probar la imagen original del usuario en Windows y revisar el JSON de diagnóstico SQL ya descargado.

## Estado de integración heredado de 9.2.1-rc.1

Esta sección describe la entrega vigente y sustituye los estados pendientes de las etapas históricas de abajo. **No es una versión comercial final**. El ZIP de la candidata contiene el proyecto completo y una guía de apertura con Node; no requiere SSMS ni compilación para abrir el código fuente.

| Área | Implementado en esta candidata | Comprobación pendiente |
|---|---|---|
| Grupos | Alta manual/masiva real mediante parámetros, revisión, confirmación y transacción; asignación posterior a los productos | Compatibilidad y resultado dentro de Soft Restaurant real |
| Estructura | Consulta integrada de siete conjuntos de metadatos; validación de permisos, longitudes, claves únicas, campos obligatorios, FK, checks y triggers; se repite antes de escribir | Ejecutar contra la base del negocio |
| Ajustes de grupos | Usa defaults comprobados; para ajustes obligatorios conocidos exige un grupo existente elegido explícitamente; otros campos bloquean | Revisar ajustes de un grupo de la instalación |
| Productos | Lotes de productos independientes exentos, empresa/unidad/configuración de referencia elegida, servicios explícitos, verificación de registros antes de COMMIT | Productos con impuestos y validación real en el POS |
| Modificadores | Editor e interpretación de Opción A; bloquea importación incompleta del padre | Contrato real de modificadores y escritura SQL **no implementados** |
| Recuperación | Registro local durable antes de INSERT, lectura del resultado, tokens de revisión ligados a sesión, idempotencia de confirmación, reversión de lote ante errores | Respaldo y restauración completos de SQL; prueba de fallas de red reales |
| Windows | Instalación local por usuario en carpeta nueva, acceso directo, configuración y versiones anteriores conservadas; identificación de versión diferente para no abrir la antigua | Ejecución Windows, instalador firmado y distribución con dependencias OCR fijadas |
| Credenciales | Se conservan permisos de dueño, acceso local y protección CSRF para administrar menú; registros sin credenciales | Cifrado y ACL Windows de la configuración SQL siguen pendientes |

La aplicación sólo genera INSERT tras comprobar el contrato del servidor. No ejecuta INSERT en el diagnóstico ni en la vista previa. Bloquea triggers activos, claves o relaciones no cubiertas y campos obligatorios desconocidos. Que la estructura sea compatible **no certifica la semántica del POS** ni relaciones no declaradas; se requiere aceptación con una copia real del negocio.

Los grupos se crean como grupos de venta; no se inventa una relación jerárquica SQL para los subencabezados OCR. Los subencabezados permanecen en el proyecto para revisión.

Los lotes de productos conservan las presentaciones en el nombre mostrado en la confirmación. Los ingredientes sólo se escriben si existe un campo de detalle compatible. El guardado antiguo de producto individual y su ensayo están retirados del flujo HTTP; sus rutas no permiten saltarse estas comprobaciones.

`menu_contrato.js` concentra las reglas; `menu_operaciones.js` usa el controlador mssql real, metadatos reales, transacción SERIALIZABLE, bloqueo coordinado, parámetros y relectura de filas. La aplicación no incluye una conexión simulada. Los dobles de las pruebas están exclusivamente en `tests/`.

La instalación local nueva no sustituye el túnel ni la configuración existentes. Los scripts heredados de cliente fijo permanecen para trazabilidad, pero no son la ruta recomendada de esta entrega. `INSTALAR_RESTAURANTE.cmd` es el instalador local candidato. La instalación OCR ya comprueba la existente antes de modificar paquetes; el conjunto exacto de dependencias/modelos sigue pendiente de fijar y validar.

## Evidencia de la auditoría

- ZIP: 206 750 bytes, 62 entradas, comprobación CRC sin errores.
- SHA-256 original: `51ba3d90bb6d7f6dd6ffe527c705a474bca768145c76c11d896ce98d63c21ba9`.
- Pruebas originales: **24 aprobadas y 1 fallida**. La prueba que copia el servidor sin la carpeta `public` omite los módulos nuevos y falla al cargar `diagnostico_menu`.
- Caso de dumplings transcrito del requerimiento: el analizador anterior devuelve **cero propuestas**.
- Prueba con 100 renglones válidos: el analizador anterior devuelve **80**, debido a un recorte explícito.
- No se incluyeron en el ZIP las siete fotografías originales, sus salidas OCR completas, una base SQL de pruebas ni un contrato documentado de grupos/modificadores.

## Arquitectura que existe realmente

| Componente | Archivos comprobados | Responsabilidad |
|---|---|---|
| Servidor y conexión | `app.js`, `iniciar.js` | Express, detección/configuración SQL, arranque y rutas |
| Consulta del negocio | `reportes.js`, `fuentes.js`, `mejoras.js` | Ventas, cortes, cuentas y reportes |
| Usuarios y ajustes | `gestion.js` | Sesiones, permisos, preferencias y arqueos locales |
| Interfaz principal | `public/`, `preparar_interfaz.js`, `interfaz.js` | Recursos web y copia incorporada al ejecutable |
| Catálogo y escritura | `menu_admin.js`, `menu_guardar.js`, `menu_ensayo.js`, `menu_preflight.js` | Consulta, inserción de un producto y ensayo con reversión |
| Fotografías y propuestas | `menu_ia.js`, `ocr_local.py`, `ocr_productos.js`, `grupos_ocr.js` | PaddleOCR, Ollama, reglas de nombres/precios y coincidencia de encabezados |
| Distribución | `COMPILAR_RESTAURANTE.cmd`, `INSTALAR_CLIENTE_FIJO.ps1`, `ACTUALIZAR.ps1` | EXE, dependencias externas, túnel y actualización |

La aplicación contiene funciones reales de conexión y escritura. No se sustituyeron por una conexión simulada. Que exista ese código no demuestra que cada operación sea compatible con una instalación particular.

## Hallazgos y tratamiento de la primera etapa

| Prioridad | Hallazgo comprobado en el código original | Tratamiento |
|---|---|---|
| P0 | No hay ruta ni sentencia para crear grupos. `grupos_ocr.js` sólo reconoce algunos encabezados y busca coincidencias existentes. | Se preparó la administración visual de grupos existentes y propuestos, asignación individual y masiva. La creación SQL espera metadatos reales. |
| P0 | El guardado fija la empresa `0000000001`, exige exención de impuestos y la captura OCR envía siempre la unidad `ACTIVIDAD`. | No generalizar estos valores a otros clientes. Validar empresa, unidad y tratamiento fiscal antes de habilitar importación. |
| P0 | Los productos con modificadores no tienen persistencia SQL implementada. Guardar sólo el principal a $0 perdería su precio efectivo. | Importación suspendida en esta copia de desarrollo hasta verificar las relaciones reales. |
| P0 | Las rutas nuevas de menú no exigen el rol dueño ni el nonce de edición. Estar en la computadora local no garantiza ese permiso. | Protección de dueño, sesión y origen incorporada y probada. |
| P0 | `Guardar todos` ejecuta solicitudes independientes; puede completar parte del lote. Los resultados no forman una bitácora durable de importación. | Pendiente: transacción del lote, identificador de operación, verificación posterior y recuperación ante respuesta perdida. |
| P1 | El puente Python entrega sólo texto y descarta resultados por confianza; se pierden las coordenadas. | Conserva bloques, cajas, puntuación y página. El texto de baja confianza queda visible para revisión. |
| P1 | Los límites de 80/40 propuestas y el recorte de nombres pueden ocultar información. | El nuevo motor conserva propuestas y nombres completos; avisa ante límites de entrada y nombres incompatibles con el guardado anterior. |
| P1 | La detección anterior asocia líneas próximas y pierde el contexto de dumplings, columnas de cantidades y variantes. | Motor contextual con evidencia, presentaciones, opción A y lista explícita de texto sin asignar. |
| P1 | La comparación exacta `Math.round(precio * 100) === precio * 100` puede rechazar importes decimales válidos. | Validación decimal en el nuevo análisis/editor; pendiente incorporarla al escritor definitivo después de validar su contrato. |
| P1 | Las claves propuestas se comparan con los primeros 500 productos, aunque se consultan todos los nombres en otra ruta. | La revisión usa el catálogo completo de claves y conserva las claves editadas al cambiar grupos. La confirmación final debe volver a verificarlas dentro de SQL. |
| P1 | El análisis limpia las propuestas anteriores antes de empezar; una falla puede dejar al usuario sin su revisión. | Proyecto recuperable, exportación JSON y conservación de resultados por fotografía. |
| P1 | El compilador no copia `ocr_local.py` y Python no puede ejecutar un archivo dentro del sistema virtual de `pkg`. | Ruta externa para el puente Python, copia de distribución y manifiesto de recursos corregidos. Ejecución Windows pendiente. |
| P1 | La contraseña SQL se guarda como texto en `conexion.json`; los permisos POSIX no sustituyen una ACL de Windows. | Pendiente: protección Windows, permisos del directorio y cuenta SQL con privilegios necesarios. No cambiar credenciales automáticamente. |
| P2 | Se inicia Python y se carga el modelo para cada fotografía. | Proceso OCR reutilizable con cola, tiempos máximos, límites de respuesta y reinicio tras error. Rendimiento real pendiente de medir. |
| P2 | `LEEME_IA.md` describe OpenAI, mientras el código utiliza Ollama local. | Documentación actualizada a la implementación comprobada. |

Los archivos de diagnóstico anteriores están ligados a productos de prueba específicos y no constituyen una validación general. `tests/schema_fixture.json` no documenta nulabilidad, valores por defecto, restricciones y relaciones suficientes para autorizar nuevos escritores.

## Qué quedó implementado y probado en esta etapa

El nuevo `menu_contexto.js` es independiente de SQL. Recibe líneas o bloques OCR y produce propuestas, categorías, opciones, evidencia e incidencias. Conserva los renglones sin asignación y los duplicados para que el usuario decida.

En el ejemplo de dumplings genera los cuatro nombres completos, precio base $0 y cantidades de selección única obligatoria. Los importes 128/198 y 148/218 se conservan. Hervidos y fritos en sartén se reconocen cuando aparecen en el texto; su costo y obligatoriedad quedan por confirmar. No se presume que sean gratuitos.

El arroz frito conserva el nombre de la familia junto a cada proteína. Ramen/udon ambiguo pide revisión de fideo, proteína y caldo, sin inventar opciones. La clasificación independiente/variante/con opciones es editable. La detección de subcategorías es conservadora y necesita validación con más menús; todavía no comprende cualquier distribución arbitraria.

Se reemplazó la pantalla de captura por un estudio de menú con tres secciones: fotografías, revisión y grupos. Incluye estados por foto, progreso por fotografías completadas, tarjetas por categoría, selección masiva, editor de opciones, evidencia, búsqueda, resumen previo y recuperación del proyecto. No informa un porcentaje ficticio del trabajo interno de PaddleOCR.

Los botones de grupos **preparan propuestas locales**. No afirman haber creado registros SQL. El proyecto descargado contiene texto y datos revisados; las fotografías originales se conservan en los archivos del usuario y no se incrustan en el JSON.

La coincidencia de grupos comparte las mismas equivalencias entre análisis y pantalla, por ejemplo Bebidas/Drinks. Una coincidencia múltiple queda pendiente de elección. Las asignaciones manuales a grupos preparados se conservan al actualizar el catálogo; las claves repetidas dentro del proyecto y las ocupadas en el catálogo consultado se señalan por separado.

`menu_seguridad.js` bloquea guardado, ensayo de inserción y creación SQL en esta copia de auditoría. Se conserva el código escritor anterior para revisarlo. Esto es una restricción explícita del avance, no una actualización para instalar encima de la versión funcional. El programa original del negocio no fue modificado.

El modo habitual utiliza PaddleOCR local. La ayuda de Ollama se aplica sólo a texto pendiente y se presenta como sugerencia sin reemplazar automáticamente nombres o precios. La transcripción visual sigue disponible como alternativa marcada para revisión.

## Validación y límites

| Verificación | Resultado |
|---|---|
| Instalación de dependencias Node con `npm ci --ignore-scripts` | Completada: 393 paquetes, sin error de versión inexistente |
| Pruebas Node | 55 aprobadas: regresiones de reportes y usuarios, parser, proyectos recuperados, permisos, bloqueo de escrituras y protocolo OCR |
| Adaptador Python | 7 aprobadas: salidas 2.x/3.x, coordenadas, baja confianza, formatos inválidos y errores que antes se descartaban |
| Navegador real y servidor Express real | Captura de texto, edición de presentaciones y opciones, grupos preparados, claves repetidas, descarga/restauración, búsqueda, selección y bloqueo SQL comprobados |
| Tamaños de pantalla | 1366, 1024, 768, 390 y 320 píxeles; sin desbordamiento horizontal en las comprobaciones |
| Errores de JavaScript durante esas pruebas | Ninguno |
| SQL Server 2014 / Soft Restaurant real | No disponible aquí; no se ejecutaron consultas ni escrituras en el negocio |
| PaddleOCR real sobre las siete fotografías | Pendiente; las pruebas del adaptador no son una prueba de reconocimiento |
| Rendimiento y compatibilidad Windows | Pendientes; no se ejecutó un EXE o instalador en Windows |

Las pruebas de reportes que ya venían en el proyecto usan datos de prueba. No certifican el contenido de la base real. La prueba nueva de navegador utiliza el servidor real sin conexión SQL y texto introducido desde la interfaz; muestra expresamente que el catálogo no está verificado.

`npm audit --omit=dev` reporta cinco rutas de dependencias con severidad moderada, correspondientes a avisos de `sprintf-js` y `uuid`; no reporta altas ni críticas en esa ejecución. La corrección automática propuesta implica retroceder versiones principales de `mssql` y `exceljs`. No se aplicó ese retroceso. Se necesita analizar la exposición efectiva y actualizar con pruebas, antes de comercializar.

## Diagnóstico integrado, sin SSMS

No se requiere que el usuario descargue SSMS ni un diagnóstico separado. En Organizar grupos, la aplicación consulta directamente la conexión ya configurada y presenta Compatibilidad de tu instalación. Cada vista previa y cada confirmación repiten la validación en el servidor. Existe una descarga de metadatos opcional para soporte, pero no es necesaria para comprobar compatibilidad.

## Prioridades registradas en la primera etapa (ver estado actual arriba)

1. **Contrato de grupos:** comprobar tipo y longitud de clave, campos obligatorios, valores por defecto, unicidad, restricciones, disparadores y relaciones. Implementar alta manual/masiva y asignación con confirmación y transacción. Probar en una copia restaurada del negocio.
2. **Contrato de productos y modificadores:** determinar cómo se representan grupos de opciones, límites de elección, precios completos, empresa, unidad e impuestos. No completar columnas por conjetura.
3. **Importación confiable:** revisión congelada del lote, comprobación de duplicados dentro de la transacción, cancelación total ante error, confirmación por producto, bitácora persistente y reconocimiento de operaciones ya completadas después de una interrupción. Nunca reintentar a ciegas un COMMIT incierto.
4. **Respaldo y recuperación:** acordar con el administrador un respaldo SQL restaurable antes de importar; ensayar restauración en otra base. El respaldo del proyecto JSON no reemplaza un respaldo SQL.
5. **OCR y calidad:** probar las siete fotografías, conservar ejemplos corregidos y medir tiempo, precisión de precios, cobertura de productos y casos pendientes. Fijar las versiones exactas de Python, PaddlePaddle, PaddleOCR y modelos verificadas en Windows. El instalador OCR original usa versiones abiertas y aún necesita esa corrección reproducible.
6. **Distribución Windows:** evaluar Inno Setup como contenedor de instalación, con identidad de aplicación estable, binarios separados de configuración, entorno OCR aislado, accesos directos, diagnóstico y actualización con reversión. El acceso remoto debe ser opcional; el instalador actual mezcla instalación local con túnel Cloudflare y no debe imponerse a todos los clientes.
7. **Aceptación comercial:** instalación limpia, actualización desde la versión usada, preservación de ajustes, arranque con puerto ocupado, OCR real, importación en copia SQL y uso de los modificadores desde Soft Restaurant. Sólo después generar el ZIP y el instalador finales.

## Referencias técnicas consultadas

- [PaddleOCR: salida con rec_texts, rec_scores y rec_polys; predict](https://www.paddleocr.ai/v3.0.1/en/version3.x/pipeline_usage/OCR.html).
- [Microsoft: sys.columns](https://learn.microsoft.com/en-us/sql/relational-databases/system-catalog-views/sys-columns-transact-sql).
- [Microsoft: sys.foreign_key_columns y visibilidad de metadatos](https://learn.microsoft.com/en-us/sql/relational-databases/system-catalog-views/sys-foreign-key-columns-transact-sql).
- [Inno Setup: AppId](https://jrsoftware.org/ishelp/topic_setup_appid.htm) y [UsePreviousAppDir](https://jrsoftware.org/ishelp/topic_setup_usepreviousappdir.htm).

Estas referencias explican las herramientas; no demuestran el esquema ni las reglas particulares de Soft Restaurant en el negocio.

## Segunda etapa: correcciones sin requerir otra descarga

Se reprodujeron y corrigieron estos problemas adicionales en la copia de desarrollo:

- Los importes como `$1,280.50` y `$2,000` ya se reconocen; se conserva también la coma decimal de `$28,50`.
- Un platillo con preparaciones, aunque no tenga varias cantidades, se clasifica como producto con opciones. No se asigna un precio inventado a las preparaciones.
- El adaptador de PaddleOCR rechaza filas con estructura inesperada y textos inválidos; antes algunas devolvían una lectura vacía sin informar del error.
- Los proyectos se validan antes de sustituir el trabajo activo: categorías, precios, opciones, identificadores y referencias a fotografías/evidencia. Se rechazan propiedades peligrosas.
- Una revisión incompleta importada vuelve a pendiente. Una lectura interrumpida no aparece como si continuara ejecutándose después de reiniciar.
- Un borrador dañado no se sustituye automáticamente por uno vacío. Antes de conservar trabajo nuevo se guarda una copia del anterior bajo una clave de recuperación del navegador; si no hay espacio, se muestra el fallo de guardado y se conserva el borrador anterior.
- Cancelar un producto manual nuevo ya no agrega una ficha vacía.
- Cambiar datos en el editor exige marcar de nuevo la revisión. La cancelación conserva los datos anteriores.
- El editor conserva un identificador de grupo ya asignado aunque el catálogo SQL no esté disponible.

Este avance no incluye una prueba de escritura en Soft Restaurant ni un instalador Windows verificado. La versión comercial continúa pendiente.

## Conservación del avance

`Restaurante9_2_Avance_Auditoria.patch` conserva los cambios de esta etapa sobre el ZIP identificado arriba, incluidos código, interfaz, documentación y pruebas. Es un parche de desarrollo, no una aplicación instalable. No contiene `node_modules`, contraseñas, fotografías de clientes ni una base SQL. Se comprobó que aplicarlo a una extracción limpia del ZIP original reproduce exactamente los archivos de trabajo. El original se conserva para no sustituir la versión funcional por una etapa con escrituras deshabilitadas.

## Tercera etapa: validación de grupos e importación

- `npm test`: 83 pruebas aprobadas, incluidas las regresiones originales, el contrato y las pruebas unitarias de fallo/reversión/idempotencia.
- Adaptador OCR: 7 pruebas Python aprobadas. No se ejecutó PaddleOCR real.
- Navegador Chromium con Express real: 19 escenarios de captura, edición, recuperación, compatibilidad y fallo sin SQL; sin errores de JavaScript; cinco anchos de 320 a 1366 px.
- Las pruebas nuevas incluyen: grupo duplicado/ambiguo, nombres no latinos distintos, longitudes, permisos incompletos, trigger activo, FK desconocida, campo requerido desconocido, modelo obligatorio, precios decimales, lotes de productos, precio verificado incorrecto, fallo de la segunda inserción, pérdida de confirmación, cambio de conexión/catálogo y registro no disponible.
- Las pruebas de transacción utilizan un doble unitario claramente identificado. No validan el dialecto T-SQL contra SQL Server, las reglas lógicas de Soft Restaurant ni los dispositivos de clientes.
- El ZIP candidato se valida por CRC, extracción limpia y manifiesto SHA-256. No incluye node_modules, credenciales, imágenes de clientes, Python ni modelos OCR.
- Esta RC no se presenta como terminada: modificadores SQL, productos con impuestos, protección Windows de credenciales, OCR real y aceptación Windows/SQL siguen pendientes.

La referencia de transacciones se contrastó con la documentación primaria de Microsoft: https://learn.microsoft.com/en-us/sql/relational-databases/system-stored-procedures/sp-getapplock-transact-sql y https://learn.microsoft.com/en-us/sql/t-sql/language-elements/begin-transaction-transact-sql . El diseño de instalación OCR conserva el método de paquetes recomendado por el proyecto: https://www.paddleocr.ai/main/en/version3.x/installation.html . Las dependencias no se certifican por consultar la documentación; deben probarse en Windows.
