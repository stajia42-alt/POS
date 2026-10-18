# METales-GV Pro

Aplicación independiente para metaleras y recicladoras, construida a partir de los proyectos proporcionados: Restaurante 9.2.33 y METales-GV PC V15. No contiene módulos de restaurantes ni conexiones con Soft Restaurant en la aplicación nueva.

- [Aplicación y comandos de desarrollo](metales-gv-pro/README.md)
- [Análisis de los originales y cambios](docs/ANALISIS_Y_CAMBIOS.md)
- [Guía de operación](docs/OPERACION.md)
- [Pruebas ejecutadas](docs/PRUEBAS.md)
- [Validación pendiente en Windows](docs/PRUEBAS_WINDOWS.md)

## Organización

```text
metales-gv-pro/   Aplicación nueva: Electron, API local, SQLite, interfaz y pruebas
originales/      Los siete archivos recibidos, sus SHA-256 y el ZIP extraído intacto
docs/            Análisis, operación y evidencia de pruebas
.github/         Flujo de validación y compilación en Windows
entrega/         Instalador y ZIP del proyecto (artefactos generados, ignorados por Git)
```

La aplicación de escritorio utiliza una base propia. No lee ni escribe los datos de los programas originales. La importación desde V15 es explícita y conserva una copia íntegra del JSON importado.

Para comenzar a desarrollar:

```bash
cd metales-gv-pro
npm ci
npm start
```

El servicio escucha únicamente en el equipo local, puerto 3180 de forma predeterminada. En Windows, `INICIAR.cmd` abre la aplicación de escritorio; `CREAR_INSTALADOR.cmd` verifica y compila el instalador. El instalador contiene el runtime y no requiere Node.js en el equipo del usuario.
