# Estudio de menú — avance de auditoría

El método principal es PaddleOCR local con Python 3.11. Ollama local es opcional; no se necesita una clave de OpenAI y esta integración no envía las fotografías a OpenAI.

La pantalla `/menu-ia` permite capturar, interpretar, revisar y guardar un proyecto JSON. `/menu-admin` dirige a la misma pantalla.

En este avance, las propuestas de grupos y modificadores se conservan en el proyecto. La escritura SQL está bloqueada hasta validar la estructura real de la instalación; no instalar este avance encima de la aplicación funcional de un cliente.

Consulta `AUDITORIA_RESTAURANTE_9_2.md` para resultados de pruebas, restricciones y siguientes pasos. `DIAGNOSTICO_MENU_SOLO_LECTURA.sql` permite obtener los metadatos pendientes sin escribir en la base.

Las fotografías originales no se incluyen en el proyecto JSON: consérvalas junto al proyecto para volver a revisar o procesar sus imágenes.
