# KMFX Edge Domain and OAuth Launch Checklist

Objetivo: mover la experiencia principal a `https://kmfxedge.com` sin romper la app actual en `dashboard.kmfxedge.com`.

## Estado actual

- `dashboard.kmfxedge.com` funciona en Vercel.
- `kmfxedge.com`, `www.kmfxedge.com` y `api.kmfxedge.com` no resolvían por DNS durante esta revisión.
- El código web ya no hardcodea el redirect OAuth a `dashboard.kmfxedge.com`; usa el origen actual.
- El launcher permite configurar la recovery URL con `KMFX_DASHBOARD_RECOVERY_URL`.

## Vercel y DNS

- [ ] Añadir `kmfxedge.com` al proyecto Vercel `kmfx-edge`.
- [ ] Apuntar DNS apex siguiendo los valores que indique Vercel.
- [ ] Añadir `www.kmfxedge.com`.
- [ ] Redirigir `www.kmfxedge.com` a `kmfxedge.com`.
- [ ] Mantener `dashboard.kmfxedge.com` como alias temporal hasta verificar el dominio raíz.
- [ ] Activar redirect de `dashboard.kmfxedge.com` a `kmfxedge.com` solo cuando `kmfxedge.com` responda 200.
- [ ] Revisar que `/kmfx-edge.html` redirige a `/` en Vercel.

## Supabase Auth

- [ ] Configurar Site URL como `https://kmfxedge.com`.
- [ ] Añadir Redirect URLs:
  - `https://kmfxedge.com`
  - `https://kmfxedge.com/*`
  - `https://dashboard.kmfxedge.com`
  - `https://dashboard.kmfxedge.com/*`, solo durante transición
  - URLs locales de desarrollo
- [ ] Probar magic links, recovery y OAuth Google.
- [ ] Evaluar dominio personalizado de Auth para reducir exposición de `supabase.co`.

## Google OAuth

- [ ] Configurar OAuth consent screen con nombre `KMFX Edge`.
- [ ] Añadir dominio autorizado `kmfxedge.com`.
- [ ] Revisar logo, email de soporte, Privacy Policy y Terms.
- [ ] Revisar redirect URIs requeridas por Supabase.
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

