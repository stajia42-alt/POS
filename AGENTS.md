# AVILES POS

Aplicación offline para Android, React/TypeScript y Capacitor. Lee README.md y docs/ARQUITECTURA.md antes de cambiar persistencia o cobros.

- Usa el checkout existente. Cada tarea de nube ya está aislada; no crees worktrees sin petición explícita.
- Conserva la pantalla de ventas, barra verde, cuadrícula/lista, categorías abajo y ticket lateral. No rediseñes la interfaz acordada sin autorización del usuario.
- Mantén lógica comercial en `src/domain`, almacenamiento en `src/db` e interfaz en `src/ui`.
- Nunca uses localStorage como base de datos ni datos de muestra como sustituto de operaciones persistentes.
- Calcula dinero en centavos enteros. Cobro, pagos y movimientos de inventario deben compartir una transacción idempotente.
- Añade migraciones versionadas; nunca borres, reconstruyas o reinicies una base existente para actualizarla.
- No agregues controles que aparenten funciones inexistentes. Documenta el alcance en docs/ENTREGA.md.
- Para herramientas cloud: `source scripts/cloud-env.sh`. Instalación: `bash scripts/setup-cloud.sh`.
- Valida cambios comerciales con `npm test`; interfaz con `npm run build && npm run test:e2e`. `npm run android:debug` comprueba Android con JDK 21 y SDK 36.
- Las pruebas de navegador no certifican SQLite nativo, periféricos ni comportamiento en una tableta física. Informa esa diferencia.
- No subas claves de firma, datos comerciales, APK ni node_modules al repositorio.
