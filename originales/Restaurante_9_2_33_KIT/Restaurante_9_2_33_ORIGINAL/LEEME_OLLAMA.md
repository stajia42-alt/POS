# IA local con Ollama

1. Instala Ollama en Windows y ejecuta `ollama pull qwen2.5vl:3b`.
2. Mantén Ollama ejecutándose en la misma PC que Restaurante 9.2.
3. Abre `INICIAR_RESTAURANTE.cmd` y visita http://127.0.0.1:3000/menu-ia.
4. El estado debe indicar Ollama conectado. Sube fotos y revisa los resultados antes de guardar.

La conexión es exclusivamente a http://127.0.0.1:11434. No necesita OPENAI_API_KEY.
El análisis se ejecuta foto por foto; puede tardar minutos en CPU.
No se modificaron las rutas de guardado SQL.
