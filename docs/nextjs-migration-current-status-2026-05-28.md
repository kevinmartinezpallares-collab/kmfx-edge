# KMFX Edge Next.js Migration Status - 2026-05-29

Estado: checkpoint operativo tras publicar la plataforma beta separada y abrir gate especifico para beta de alumnos.

## Resumen

La V1 visual y funcional local queda cerrada para prueba read-only. La app Next ya esta versionada, tiene CI propio, build verde y gates de rutas V1. La siguiente etapa ya no debe tratarse como beta visual: para invitar alumnos hace falta validar usuario normal, billing, launcher y reconciliacion MT5 real.

## Beta Externa

Listo:

- `apps/web-next` versionada en Git sin caches ni builds.
- CI ejecuta `npm ci`, `npm run validate:cascade` y `npm run build`.
- Backend Render live responde en `177fb254662e2d34eb2c0890a4401fa92b59c4be`.
- Backend directo bloquea lectura legacy desde `kmfxedge.com`.
- Worker `kmfx-mt5-api-proxy` desplegado en Cloudflare: mantiene CORS valido para `/api/mt5/sync` y cierra rutas browser de cuentas con `404` sin CORS.
- V1 local pasa typecheck, lint, cascade, build, smoke routes y QA mobile dark/light.
- Proyecto Vercel beta separado creado: `kmfx-edge-next-beta`, enlazado desde `apps/web-next`, framework Next.js, build `npm run build`, install `npm ci`.
- Deploy beta corregido y generado correctamente en Vercel: `dpl_FS9GkMrAeYJE9mnZ4A7v18PMW6P8`.
- Alias tecnico `https://kmfx-edge-next-beta.vercel.app/dashboard` queda protegido por Basic Auth beta: sin credenciales responde `401`, con credenciales responde `200`.
- Variables live server-only activadas en Vercel beta: `KMFX_WAVE1_SOURCE=live`, API base, timeout y preview bearer/identidad.
- Deploy live protegido generado correctamente en Vercel: `dpl_6mRMHfPDaUCHMJ9DyWCq8BST86hN`.
- Con credenciales beta, el alias tecnico sirve `Lectura MT5` y deja de servir `Lectura preparada`.
- `python3 scripts/next_beta_preflight.py --scope platform` queda `ready`.
- `python3 scripts/next_beta_preflight.py --scope full` queda `ready` con bearer preview: 2 cuentas, 1 fresca y 1 stale.
- `qa:live:integrity` queda `ready` con ventana ampliada de 300 minutos; con ventana estricta de 60 minutos solo bloquea IC Markets por stale.
- `python3 scripts/next_beta_preflight.py --scope student` comprueba que snapshot, checkout, portal, link de cuenta y lectura de KMFXKey queden cerrados sin autenticacion. En la ultima pasada los contratos tecnicos estaban cerrados, pero el scope queda bloqueado hasta confirmar auth de usuario normal, rehearsal billing, launcher y reconciliacion MT5.

Pendiente antes de invitar usuarios:

- ejecutar auditoria como usuario normal con email no admin.
- confirmar compra/plan o rehearsal controlado de billing y Customer Portal.
- validar Launcher macOS/Windows desde descarga beta y cuenta nueva.
- reconciliar MT5 contra Next sin desviacion en numero de operaciones, balance/equity y PnL.
- confirmar WebRequest de todas las cuentas usadas en la prueba multi-cuenta.

## Roadmap Por Fase

- Fase 0, produccion/riesgo: cerrada para V1 read-only. Auth, billing, launcher y MT5 write-flows siguen congelados.
- Fase 1, estrategia: cerrada de facto; pendiente solo aprobacion formal del roadmap maestro.
- Fase 2, contratos/dominio: operativa para V1; pendiente aprobacion formal de diccionario, field map, fixture pack y redaction policy.
- Fase 3, entorno/scaffold: cerrada. `apps/web-next` existe, compila y ahora esta versionada.
- Fase 4, capas reutilizables: cerrada para V1; ampliar solo cuando se abran rutas avanzadas.
- Fase 5, shell maestro: cerrada para V1; mantener sin redisenos grandes salvo bug.
- Fase 6, Wave 1 core: cerrada para beta simple en `Panel`, `Cuentas`, `Portfolio`, `Insights`, `Trades`, `Calendario`, `Calculadora`, `Biblioteca`, `Ajustes` y `Suscripcion`.
- Fase 7, Wave 2 secundaria: implementada parcialmente, pero rutas avanzadas quedan como `Proximamente` en V1.
- Fase 8, superficies sensibles: pospuesta para chats dedicados; no abrir RiskGuard, Review, Playbooks, Prop Firms, Mercado ni Ejecucion hasta cerrar producto y seguridad por seccion.
- Fase 9, producto diferencial V2: contratos preparados; pendiente funding cockpit real, portfolio policy real, evaluation engine, persistencia/editor y export EA seguro.
- Fase 10, QA integral: local V1 verde y plataforma beta separada lista con live protegido; pendiente gate `student`, QA accesibilidad/performance y paridad contra cuentas reales.
- Fase 11, cutover: pendiente. Debe empezar con subdominio beta, no con `kmfxedge.com`.

## No Reabrir Ahora

- Billing real.
- Auth real/RLS final.
- Launcher real.
- MT5 write-flows.
- Enforcement RiskGuard.
- Export EA.
- Redisenos visuales grandes de V1.

## Proximo Paso Recomendado

1. Ejecutar `python3 scripts/next_beta_preflight.py --scope student` y mantenerlo como bloqueo de alumnos hasta cerrar las confirmaciones.
2. Hacer auditoria de usuario normal: login, plan, no-admin, alta de cuenta y descarga Launcher.
3. Reconciliar Darwinex, IC Markets y cualquier tercera cuenta contra MT5 con conteo exacto de operaciones.
4. Repetir QA beta final en `beta.kmfxedge.com`.
5. Invitar primer grupo beta solo cuando el scope `student` quede `ready`.
