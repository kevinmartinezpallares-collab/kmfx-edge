# Checklist de gobernanza para producción

Este checklist documenta los controles que deben quedar activos alrededor del
repositorio y de las plataformas de hosting antes de operar KMFX en producción.
No contiene secretos.

## Ajustes del repositorio en GitHub

- Activar secret scanning.
- Activar push protection.
- Activar Dependabot alerts.
- Activar Dependabot security updates.
- Exigir doble factor de autenticación a colaboradores con permisos de escritura.
- Revisar deploy keys, webhooks, GitHub Apps y secrets del repositorio después de
  cada pasada importante de seguridad.

## Protección de la rama main

Proteger `main` con estas reglas:

- Exigir pull request antes de fusionar cambios.
- Exigir aprobaciones antes del merge.
- Exigir revisión de Code Owners.
- Invalidar aprobaciones antiguas cuando se suban commits nuevos.
- Exigir que los status checks pasen antes de fusionar.
- Exigir que la rama esté actualizada antes de fusionar.
- Exigir commits firmados cuando sea viable.
- Exigir historial lineal.
- Bloquear force push.
- Bloquear borrado de rama.
- Incluir administradores cuando el flujo de lanzamiento esté estable.

Status checks obligatorios:

- `Backend and connector tests`
- `Static app checks`
- `Build Windows launcher`

## Ajustes de despliegue en Vercel

- La rama de producción debe ser `main`.
- Los preview deployments pueden seguir activos, pero los previews sensibles
  deben usar deployment protection.
- Los dominios de producción deben apuntar solo a `kmfxedge.com` y alias
  aprobados.
- Mantener secrets exclusivos del backend fuera de las variables de Vercel.
- Ejecutar el workflow `Production Smoke` después de cada cambio en cabeceras de
  seguridad.

## Ajustes de Cloudflare

- Mantener `mt5-api.kmfxedge.com/*` apuntando al Worker `kmfx-mt5-api-proxy`.
- Mantener `mt5-api.kmfxedge.com` proxied en Cloudflare.
- No permitir `Access-Control-Allow-Origin: *` en respuestas públicas de API.
- Revisar los despliegues del Worker después de editar
  `cloudflare/mt5-api-proxy.js`.

## Ajustes de Supabase

- Guardar decisiones de autorización en `app_metadata`, nunca en `user_metadata`.
- Mantener las RPC públicas explícitas: evitar grants `EXECUTE` accidentales.
- Revisar proveedores de Auth y redirect URLs después de cambios de dominio u
  OAuth.
