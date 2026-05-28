# KMFX Edge Next.js Migration Status - 2026-05-28

Estado: checkpoint operativo tras publicar la plataforma beta separada.

## Resumen

La V1 visual y funcional local queda cerrada para prueba read-only. La app Next ya esta versionada, tiene CI propio, build verde y gates de rutas V1. WebRequest de IC Markets no debe bloquear el resto del roadmap: solo afecta a la confirmacion multi-cuenta/frescura live.

## Beta Externa

Listo:

- `apps/web-next` versionada en Git sin caches ni builds.
- CI ejecuta `npm ci`, `npm run validate:cascade` y `npm run build`.
- Backend Render live responde en `c944159`.
- Backend directo bloquea lectura legacy desde `kmfxedge.com`.
- Worker `kmfx-mt5-api-proxy` desplegado en Cloudflare: mantiene CORS valido para `/api/mt5/sync` y cierra rutas browser de cuentas con `404` sin CORS.
- V1 local pasa typecheck, lint, cascade, build, smoke routes y QA mobile dark/light.
- Proyecto Vercel beta separado creado: `kmfx-edge-next-beta`, enlazado desde `apps/web-next`, framework Next.js, build `npm run build`, install `npm ci`.
- Deploy beta corregido y generado correctamente en Vercel: `dpl_FS9GkMrAeYJE9mnZ4A7v18PMW6P8`.
- Alias tecnico `https://kmfx-edge-next-beta.vercel.app/dashboard` responde `200` con la app Next y smoke remoto OK.
- `python3 scripts/next_beta_preflight.py --scope platform` queda `ready`.

Pendiente antes de invitar usuarios:

- configurar DNS de `beta.kmfxedge.com` en Cloudflare con `A beta 76.76.21.21`;
- decidir gate de acceso beta antes de exponer datos live: Vercel SSO, password/gate, auth real o beta fixture sin datos live;
- configurar variables server-only live solo cuando haya gate decidido (`KMFX_WAVE1_SOURCE`, preview bearer/identidad y permiso full si aplica);
- ejecutar `python3 scripts/next_beta_preflight.py --scope full` con bearer preview y al menos una cuenta fresca;
- confirmar WebRequest de IC Markets si se quiere validar multi-cuenta antes de beta.

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
- Fase 10, QA integral: local V1 verde y plataforma beta separada lista; pendiente DNS, gate externo, QA accesibilidad/performance y paridad contra cuentas reales.
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

1. Configurar DNS de `beta.kmfxedge.com`.
2. Definir gate beta antes de activar datos live en Vercel.
3. Confirmar WebRequest IC Markets y/o usar Darwinex como cuenta unica fresca.
4. Configurar variables server-only live en el proyecto beta.
5. Ejecutar preflight `--scope full`.
6. Invitar primer grupo beta read-only.
