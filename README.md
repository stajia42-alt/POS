# AVILES POS 2.2.2 — Tickets y comandas por IP

- [Descargar APK 2.2.2 con impresoras](AVILES-POS-2.2.2-IMPRESORAS-PRUEBAS.apk)
- [Guía para configurar tu impresora](CONFIGURAR-IMPRESORA-2.2.2.md)
- [Proyecto completo, fuentes, APK y pruebas](AVILES-POS-2.2.2-ENTREGA.zip)
- [Solo fuentes y proyecto Android](AVILES-POS-2.2.2-FUENTES.zip)
- [Verificación](VERIFICACION-2.2.2.json)
- [Pantalla de impresoras](CAPTURA-2.2.2-IMPRESORAS.png) · [Comanda](CAPTURA-2.2.2-COMANDA.png)

En la app: Menú → Impresoras → Agregar impresora. Usa la misma IP que en Loyverse, puerto 9100 salvo que tu configuración use otro, y papel de 80 mm. Marca tickets, comandas o ambos y pulsa Imprimir prueba.

Tickets al cobrar y comandas por cambios al guardar/cobrar/enviar. Incluye notas, cancelaciones, rutas por categorías y registro persistente; los envíos inciertos requieren revisar papel antes de repetir. Las copias requieren permiso y están identificadas. Enviado significa escritura TCP completada, sin confirmación física.

Preparado para actualizar AVILES POS PRUEBAS conservando su base. La instalación original 2.1 mantiene datos separados. No se requiere desinstalar ni limpiar almacenamiento.

158 pruebas de la suite completa, 25 flujos de interfaz y 8 pruebas Java/TCP aprobadas; además pasó la nueva regresión de migración desde esquema 5 en el archivo de 8 pruebas de upgrade. Compilación Android, certificado y recursos verificados. **La impresora física del usuario y la instalación de este APK en su dispositivo siguen pendientes de prueba.** Las capturas usan datos aislados.

---

# AVILES POS 2.2.1 — Corrección de pruebas

- [Descargar APK 2.2.1](AVILES-POS-2.2.1-CORRECCION-PRUEBAS.apk)
- [Fuentes, proyecto Android, documentación, capturas y resultados](AVILES-POS-2.2.1-FUENTES.zip)
- [Entrega completa](AVILES-POS-2.2.1-ENTREGA.zip)
- [Verificación](VERIFICACION-2.2.1.json)
- [Vista de venta](CAPTURA-2.2.1-VENTA.png) · [Inventario directo](CAPTURA-2.2.1-INVENTARIO.png)

Recupera la distribución de venta de 2.1. Inventario abre en existencias y movimientos; recetas, ingredientes y compras quedan en Más opciones. Repara bloqueos de edición/reposición de stock negativo y permite volver de receta a producto con conteo físico. Conserva las funciones avanzadas.

Preparado para actualizar **AVILES POS 2.2 PRUEBAS**, la edición que el usuario confirmó que pudo instalar. Tiene el mismo identificador y certificado, con código de versión superior. No requiere desinstalar ni limpiar datos. La comprobación de esta corrección en el BlueStacks del usuario sigue pendiente. La app original 2.1 mantiene datos separados y no se actualiza con esta variante.

127 pruebas y 24 flujos web aprobados; 2 flujos visuales finales, build y compilación Android verificados. Estas pruebas no certifican periféricos ni SQLite nativo. Las capturas usan datos aislados de prueba.

**Impresoras pendientes:** el módulo no está en el APK 2.1 recibido ni en las ramas AVILES inspeccionadas. No se implementó un reemplazo ni se declara que imprima. El APK de referencia Loyverse no se pudo abrir por superar el límite de transferencia de 32 MiB del entorno.

---

# Instalación de prueba en BlueStacks con una versión anterior instalada

- [Descargar APK para instalar junto a la versión anterior](AVILES-POS-2.2-BLUESTACKS-PRUEBAS.apk)
- [Fuentes y proyecto Android con variante de prueba](AVILES-POS-2.2-BLUESTACKS-FUENTES.zip)
- [Verificación de esta variante](VERIFICACION-BLUESTACKS.json)

Se identifica como **AVILES POS 2.2 PRUEBAS** y usa `mx.aviles.pos.pruebas`. Es el mismo código 2.2 en una instalación separada. No reemplaza ni importa los datos de la versión anterior; al iniciar crea su propio propietario/PIN. La compilación, firma, arquitecturas y aislamiento de identificador están verificados; la instalación en el BlueStacks del usuario queda pendiente de su prueba.

**No desinstales ni borres datos de la versión anterior.** Una actualización real de esa instalación sigue necesitando su clave de firma original.

---

# AVILES POS 2.2 — Descargas de prueba

- [Entrega completa: APK, fuentes, Android, documentación y capturas](AVILES-POS-2.2-ENTREGA.zip)
- [APK de pruebas](AVILES-POS-2.2-PRUEBAS.apk)
- [Solo fuentes y proyecto Android](AVILES-POS-2.2-FUENTES.zip)
- [Verificación del artefacto](VERIFICACION-2.2.json)
- [SHA256](SHA256SUMS.txt)

121 pruebas y 23 flujos de navegador aprobados; compilación Android verificada.

**El APK de pruebas tiene una firma distinta a los APK 1.1/1.2/2.1 aportados.** No actualiza una instalación existente con la firma anterior. Para actualizar conservando los datos se necesita la clave de firma original. No desinstales ni borres almacenamiento para resolver un conflicto de firma.

Instalación, SQLite/SQLCipher, selector de documentos Android y Samsung física pendientes de prueba. Impresoras/comandas: NO DISPONIBLE en las fuentes inspeccionadas; no se duplicó su desarrollo.

Estos archivos no contienen keystores, contraseñas ni datos comerciales. Las capturas usan contextos y datos aislados de prueba.
