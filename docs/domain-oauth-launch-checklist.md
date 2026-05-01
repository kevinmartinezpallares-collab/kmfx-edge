# KMFX Edge Domain and OAuth Launch Checklist

Objetivo: mover la experiencia principal a `https://kmfxedge.com` sin romper la app actual en `dashboard.kmfxedge.com`.

## Estado actual

- `dashboard.kmfxedge.com` funciona en Vercel.
- `kmfxedge.com` y `www.kmfxedge.com` funcionan en Vercel con SSL.
- `api.kmfxedge.com` queda pendiente para el backend.
- El código web ya no hardcodea el redirect OAuth a `dashboard.kmfxedge.com`; usa el origen actual.
- El launcher usa `https://kmfxedge.com?auth=recovery` por defecto y permite sobrescribirlo con `KMFX_DASHBOARD_RECOVERY_URL`.
- Supabase Auth ya acepta `https://kmfxedge.com` como redirect y devuelve el flujo OAuth hacia Google.
- Google OAuth tiene configurada la informacion de marca, dominios autorizados y callback de Supabase.
- El dominio personalizado de Supabase Auth queda aplazado por coste mensual.

## Vercel y DNS

- [x] Añadir `kmfxedge.com` al proyecto Vercel `kmfx-edge`.
- [x] Apuntar DNS apex a Vercel.
- [x] Añadir `www.kmfxedge.com`.
- [ ] Redirigir `www.kmfxedge.com` a `kmfxedge.com`.
- [ ] Mantener `dashboard.kmfxedge.com` como alias temporal hasta verificar el dominio raíz.
- [ ] Activar redirect de `dashboard.kmfxedge.com` a `kmfxedge.com` solo cuando `kmfxedge.com` responda 200.
- [x] Revisar que `/kmfx-edge.html` redirige a `/` en Vercel.

## Supabase Auth

- [x] Configurar Site URL como `https://kmfxedge.com`.
- [x] Añadir Redirect URLs:
  - `https://kmfxedge.com`
  - `https://kmfxedge.com/*`
  - `https://www.kmfxedge.com`
  - `https://www.kmfxedge.com/*`
  - `https://dashboard.kmfxedge.com`
  - `https://dashboard.kmfxedge.com/*`, solo durante transición
  - URLs locales de desarrollo
- [ ] Mantener `https://dashboard.kmfxedge.com` solo mientras exista como alias temporal.
- [ ] Probar magic links, recovery y OAuth Google.
- [x] Evaluar dominio personalizado de Auth para reducir exposición de `supabase.co`.
- [ ] Reconsiderar `auth.kmfxedge.com` cuando el coste mensual encaje.

## Google OAuth

- [x] Configurar OAuth consent screen con nombre `KMFX Edge`.
- [x] Añadir dominio autorizado `kmfxedge.com`.
- [x] Revisar logo, email de soporte, Privacy Policy y Terms.
- [x] Revisar redirect URIs requeridas por Supabase.
- [ ] Verificar que el usuario vuelve a `https://kmfxedge.com` tras login.

## Backend/API

- [ ] Crear `api.kmfxedge.com` apuntando al backend Render.
- [ ] Cambiar `js/modules/api-config.js`, `launcher/config.py` y `launcher_config.example.json` a `https://api.kmfxedge.com` cuando el DNS responda.
- [ ] Restringir CORS a `https://kmfxedge.com` y aliases temporales.
- [ ] Ejecutar smoke test:
  - `https://kmfxedge.com`
  - `https://api.kmfxedge.com/health`
  - login Google
  - password recovery
  - account snapshot autenticado
