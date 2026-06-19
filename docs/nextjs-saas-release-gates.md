# Next.js SaaS Release Gates

Estado operativo que debe cumplirse para mantener KMFX Edge abierto como SaaS
real en `kmfxedge.com`.

## Comandos

Desde `apps/web-next`:

```bash
npm run preflight:platform
npm run preflight:production
npm run validate:cascade
```

Estado operativo actual:

- Corte Next en dominio principal 2026-06-13:
  `docs/next-production-cutover-2026-06-13.md`.
- `npm run monitor:production`: verde contra `https://kmfxedge.com`.
- `npm run preflight:production`: verde para plataforma.
- `scripts/production_smoke.py --profile production --downloads-mode auth`:
  verde el 2026-06-13 contra `https://kmfxedge.com`.

Desde la raíz, si se quiere validar producción completa:

```bash
python3 scripts/production_smoke.py --profile production --frontend-url https://kmfxedge.com --backend-url https://kmfx-edge-api.onrender.com --mt5-api-url https://mt5-api.kmfxedge.com --downloads-mode auth --cors-origin https://kmfxedge.com
```

Para validar dominios legacy como redirecciones/control operativo:

```bash
python3 scripts/production_smoke.py --profile production --frontend-url https://beta.kmfxedge.com --backend-url https://kmfx-edge-api.onrender.com --mt5-api-url https://mt5-api.kmfxedge.com --downloads-mode auth --cors-origin https://kmfxedge.com
```

## Gates Bloqueantes

- `https://kmfxedge.com/login` y `/dashboard` no pueden devolver 5xx.
- El gate Basic Auth legacy debe estar quitado.
- `/api/kmfx/public-auth-config` debe devolver configuración Supabase real.
- Las rutas de billing, descarga, link de cuenta y KMFX Key deben exigir sesión.
- `https://mt5-api.kmfxedge.com/api/mt5/sync` debe aceptar WebRequest solo con los headers esperados.
- La ruta legacy de cuentas del dashboard antiguo debe seguir bloqueada.
- El proyecto Vercel correcto para Next es `apps/web-next`.
- `kmfxedge.com`, `www.kmfxedge.com`, `dashboard.kmfxedge.com` y
  `beta.kmfxedge.com` deben apuntar al despliegue validado o redirigir al
  dominio canónico.

## Confirmaciones Manuales

Estas confirmaciones no se deducen de una llamada pública y deben marcarse solo tras prueba real:

```bash
export KMFX_STUDENT_AUTH_READY=true
export KMFX_STUDENT_BILLING_VERIFIED=true
export KMFX_STUDENT_LAUNCHER_VERIFIED=true
export KMFX_STUDENT_RECONCILIATION_VERIFIED=true
```

Después:

```bash
cd apps/web-next
npm run preflight:student
```

## No Mezclar

No usar el proyecto Vercel raíz `kmfx-edge` para cortar tráfico Next. Esa superficie
queda como legacy. Next vive en `apps/web-next` y el proyecto Vercel operativo es
el que sirve `kmfxedge.com`.
