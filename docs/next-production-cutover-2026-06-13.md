# Next Production Cutover - 2026-06-13

Registro operativo del corte de dominio principal a la app Next.js.

## Resultado

- `https://kmfxedge.com` apunta al despliegue Next validado.
- Desde el ajuste del 2026-06-15, `https://kmfxedge.com` es la unica entrada
  canonica.
- `https://www.kmfxedge.com`, `https://dashboard.kmfxedge.com` y
  `https://beta.kmfxedge.com` deben redirigir con `308` a `https://kmfxedge.com`
  conservando ruta y query.
- El login vuelve a entrada normal: registro con email/proveedores y prueba de
  7 dias gratis, sin codigo privado de invitacion.

Despliegue activo:

- Proyecto Vercel: `kmfx-edge-next-beta`.
- Deployment: `kmfx-edge-next-beta-eab7h0z67.vercel.app`.
- Deployment id: `dpl_41RUaygGYuYgLbMPMjyYmukkMPRw`.
- Estado Vercel: `Ready`.

## Validación Ejecutada

```bash
npx --yes vercel@latest alias set kmfx-edge-next-beta-eab7h0z67.vercel.app kmfxedge.com
npx --yes vercel@latest alias set kmfx-edge-next-beta-eab7h0z67.vercel.app www.kmfxedge.com
npx --yes vercel@latest alias set kmfx-edge-next-beta-eab7h0z67.vercel.app dashboard.kmfxedge.com
```

```bash
python3 scripts/production_smoke.py --profile production --frontend-url https://kmfxedge.com --backend-url https://kmfx-edge-api.onrender.com --mt5-api-url https://mt5-api.kmfxedge.com --downloads-mode auth --cors-origin https://kmfxedge.com
```

Resultado del smoke: `ok: true`.

Cobertura del smoke:

- Dominio principal carga y rutas privadas redirigen a login.
- Rutas SPA principales responden.
- Descargas quedan protegidas por sesión.
- Billing checkout/portal exige sesión.
- Webhook de billing exige firma.
- Backend Render responde con `SupabaseAccountStore`.
- Proxy MT5 responde.
- CORS MT5 permite `https://kmfxedge.com`.
- CORS MT5 bloquea origen desconocido.
- Sync MT5 rechaza escritura sin KMFX Key.

## Notas

- No se movieron variables de entorno durante el corte.
- Las rutas de billing del frontend delegan en el backend autenticado y no tienen
  URLs no canonicas hardcodeadas.
- No usar el proyecto Vercel legacy `kmfx-edge` para publicar la app Next.
