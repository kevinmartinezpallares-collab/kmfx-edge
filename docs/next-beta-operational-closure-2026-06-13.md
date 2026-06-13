# Next Beta Operational Closure - 2026-06-13

Estado: beta operativa controlada antes de abrir RiskGuard.

Este cierre separa lo que ya esta listo para usuarios beta de lo que queda como
vigilancia operativa o fase futura. No sustituye los runbooks existentes; deja
la foto actual para evitar reabrir frentes ya cerrados.

## Alcance Cerrado Para Beta

- Login real y rutas privadas protegidas.
- Billing real con Stripe Checkout y Customer Portal.
- Planes Basic, Pro y Unlimited gobernando entitlements.
- Descargas Launcher macOS, Launcher Windows y EA protegidas por sesion.
- Creacion, recuperacion y copia de KMFX Key por cuenta MT5.
- Sync MT5 read-only contra `https://mt5-api.kmfxedge.com`.
- Dashboard con datos por usuario y por cuenta activa.
- Multi-cuenta visible en Panel, Cuentas, Portfolio, Insights, Trades y
  Calendario.
- Marketing demo para owner con fixtures realistas usando `?demo=marketing`.
- Monitor beta y smoke de plataforma disponibles.

## Fuera De Alcance Hasta Fase Dedicada

No abrir ni mezclar en este cierre:

- RiskGuard.
- Strategy Lab.
- `kmfx_genetic/`.
- `marketing/`.
- Enforcement real de EA.
- MT5 write-flows.
- Cambios sensibles de billing/auth que no sean fixes de beta.

## Resultado De Validacion

Ejecutado el 2026-06-13:

```bash
cd apps/web-next
npm run monitor:beta
```

Resultado: `ok=true`.

Checks destacados:

- `beta_public_auth_config`: OK.
- `beta_route_*_requires_login`: OK.
- `beta_download_*_requires_login`: OK.
- `backend_health`: OK.
- `mt5_api_health`: OK.
- `snapshot_public_requires_auth`: OK.
- `snapshot_bandwidth_usage_below_threshold`: OK, uso `0.000229` frente a
  limite `0.05`.
- `mt5_api_cors_allows_expected_origin`: OK.
- `mt5_api_cors_blocks_unexpected_origin`: OK.
- Render: 1 servicio (`kmfx-edge-api`), 2 deploys API en el mes, 5.09 minutos
  de build reportados.

```bash
KMFX_STUDENT_BETA_AUTH_READY=true \
KMFX_STUDENT_BETA_BILLING_VERIFIED=true \
KMFX_STUDENT_BETA_LAUNCHER_VERIFIED=true \
KMFX_STUDENT_BETA_RECONCILIATION_VERIFIED=true \
npm run preflight:beta
```

Resultado: `Estado: ready`.

Notas:

- Las cuatro variables anteriores son confirmaciones manuales. El script no las
  puede deducir desde una llamada publica porque validan recorrido real de
  alumno: auth, billing, launcher y reconciliacion MT5.
- Sigue apareciendo `preview_bearer_missing` como aviso no bloqueante para
  beta con auth real.
- Sigue apareciendo `dirty_worktree_entries` si hay trabajo local de RiskGuard
  u otros frentes sin mezclar.

```bash
python3 scripts/production_smoke.py \
  --profile next-beta \
  --frontend-url https://beta.kmfxedge.com \
  --backend-url https://kmfx-edge-api.onrender.com \
  --mt5-api-url https://mt5-api.kmfxedge.com \
  --downloads-mode auth
```

Resultado: `ok=true`.

Validacion local Next:

```bash
cd apps/web-next
npm run lint
npm run typecheck
npm run test -- navigation accounts-selectors workspace-source-contract live-snapshot-adapter action-safety
```

Resultado: OK.

`npm run validate:cascade` queda bloqueado en esta pasada por un cambio local
existente dentro de `apps/web-next/src/components/trading/risk/reference-section.tsx`
(`visible-copy` detecta `·`). No se corrige aqui porque RiskGuard esta fuera de
alcance hasta fase dedicada.

## Vigilancia Al Entrar Usuarios

Antes y despues de invitar cada tanda pequena:

1. Ejecutar `npm run monitor:beta`.
2. Revisar que no aparezcan `warnings`.
3. Revisar Render logs buscando:

```text
[KMFX][ALERT]
event=mt5_sync_rejected_abnormal
event=billing_webhook_failed
event=api_5xx_response
backend_proxy_failed
```

4. Si entra un alumno con MT5, comprobar en Cuentas:
   - broker correcto;
   - servidor correcto;
   - login MT5 correcto;
   - ultima sincronizacion reciente;
   - numero de operaciones reconciliado con MT5.
5. Vigilar consumo Render/Supabase despues del primer sync completo.

## Criterios De Stop

Parar invitaciones si ocurre cualquiera de estos puntos:

- `npm run monitor:beta` devuelve `ok=false`.
- Login muestra "No se pudo cargar el acceso seguro".
- Checkout o portal abre sin sesion.
- Descargas se pueden bajar sin sesion.
- Worker MT5 acepta CORS de un origen no esperado.
- MT5 sync rechaza keys validas de forma repetida.
- Un usuario ve cuentas, snapshots o metricas de otro usuario.
- Cualquier fix exige tocar RiskGuard o write-flows MT5.

## Pendiente No Bloqueante

- Confirmar manualmente backups Supabase si se quiere cerrar el riesgo de
  restauracion completa.
- Confirmar desde paneles externos los guardrails de coste que no se pueden
  deducir por codigo local.
- Revisar historicos de logs antiguos y rotar keys expuestas si procede.
- Mantener `docs/observability-alerts-runbook.md` como fuente para incidencias.

## Siguiente Fase Recomendada

Abrir RiskGuard solo cuando se trate como seccion propia, con EA y kill switch
fisico revisados de forma separada. Hasta entonces la beta publica debe
centrarse en:

- estabilidad del dashboard;
- sync MT5 read-only;
- billing/planes;
- rendimiento entre secciones;
- reconciliacion de metricas reales.
