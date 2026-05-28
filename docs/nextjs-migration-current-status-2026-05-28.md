# KMFX Edge Next.js Migration Status - 2026-05-28

Estado: checkpoint operativo tras versionar `apps/web-next`.

## Resumen

La V1 visual y funcional local queda cerrada para prueba read-only. La app Next ya esta versionada, tiene CI propio, build verde y gates de rutas V1. WebRequest de IC Markets no debe bloquear el resto del roadmap: solo afecta a la confirmacion multi-cuenta/frescura live.

## Beta Externa

Listo:

- `apps/web-next` versionada en Git sin caches ni builds.
- CI ejecuta `npm ci`, `npm run validate:cascade` y `npm run build`.
- Backend Render live responde en `c944159`.
- Backend directo bloquea lectura legacy desde `kmfxedge.com`.
- Worker mantiene CORS valido para `/api/mt5/sync`.
- V1 local pasa typecheck, lint, cascade, build, smoke routes y QA mobile dark/light.

Pendiente antes de invitar usuarios:

- desplegar `cloudflare/mt5-api-proxy.js` actualizado para que rutas no MT5 devuelvan `404` sin CORS browser;
- crear proyecto Vercel beta separado con root `apps/web-next` y dominio `beta.kmfxedge.com`;
- configurar variables server-only de beta (`KMFX_WAVE1_SOURCE`, `KMFX_API_BASE_URL`, timeout y preview bearer/identidad);
- ejecutar `python3 scripts/next_beta_preflight.py --scope platform`;
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
- Fase 10, QA integral: local V1 verde; pendiente beta externa, QA accesibilidad/performance y paridad contra cuentas reales.
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

1. Desplegar Worker Cloudflare actualizado.
2. Crear proyecto Vercel beta separado.
3. Ejecutar preflight `--scope platform`.
4. Confirmar WebRequest IC Markets y/o usar Darwinex como cuenta unica fresca.
5. Ejecutar preflight `--scope full`.
6. Invitar primer grupo beta read-only.
