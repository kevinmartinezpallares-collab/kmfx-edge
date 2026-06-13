# Next.js SaaS Release Gates

Estado operativo que debe cumplirse antes de pasar de beta controlada a SaaS abierto.

## Comandos

Desde `apps/web-next`:

```bash
npm run preflight:platform
npm run preflight:beta
npm run validate:cascade
```

Estado operativo actual:

- Cierre beta 2026-06-13: `docs/next-beta-operational-closure-2026-06-13.md`.
- `npm run monitor:beta`: verde el 2026-06-13.
- `npm run preflight:beta`: verde el 2026-06-13 cuando se exportan las cuatro
  confirmaciones manuales de alumno real.
- `scripts/production_smoke.py --profile next-beta --downloads-mode auth`:
  verde el 2026-06-13.

Desde la raíz, si se quiere validar producción completa:

```bash
python3 scripts/production_smoke.py --profile next-beta --frontend-url https://beta.kmfxedge.com --backend-url https://kmfx-edge-api.onrender.com --mt5-api-url https://mt5-api.kmfxedge.com --downloads-mode auth
```

## Gates Bloqueantes

- `https://beta.kmfxedge.com/login` y `/dashboard` no pueden devolver 5xx.
- El gate Basic Auth debe estar quitado en beta pública.
- `/api/kmfx/public-auth-config` debe devolver configuración Supabase real.
- Las rutas de billing, descarga, link de cuenta y KMFX Key deben exigir sesión.
- `https://mt5-api.kmfxedge.com/api/mt5/sync` debe aceptar WebRequest solo con los headers esperados.
- La ruta legacy de cuentas del dashboard antiguo debe seguir bloqueada.
- El proyecto Vercel correcto para Next es `apps/web-next` -> `kmfx-edge-next-beta`.

## Confirmaciones Manuales

Estas confirmaciones no se deducen de una llamada pública y deben marcarse solo tras prueba real:

```bash
export KMFX_STUDENT_BETA_AUTH_READY=true
export KMFX_STUDENT_BETA_BILLING_VERIFIED=true
export KMFX_STUDENT_BETA_LAUNCHER_VERIFIED=true
export KMFX_STUDENT_BETA_RECONCILIATION_VERIFIED=true
```

Después:

```bash
cd apps/web-next
npm run preflight:beta
```

## No Mezclar

No usar el proyecto Vercel raíz para cortar tráfico Next. El root pertenece a la superficie legacy. Next vive en `apps/web-next`.
