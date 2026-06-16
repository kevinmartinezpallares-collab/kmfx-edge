# Closed Beta Invite Runbook

## Objetivo

Abrir KMFX Edge como beta cerrada sin cobrar por adelantado y sin mezclar la prueba con suscripciones reales de Stripe.

El flujo recomendado es:

1. El usuario recibe un código privado por Discord o mensaje directo.
2. Crea cuenta con email y código de invitación.
3. La app concede 7 días de beta con capacidad de Edge Unlimited.
4. Durante la beta puede conectar MT5, descargar launcher/EA y probar el dashboard.
5. Al terminar la beta, el acceso operativo queda pausado y la app lo envía a Suscripción para comprar o reactivar en Stripe.

## Decisión De Producto

No se crea una suscripción Unlimited falsa en Stripe.

La beta se trata como un entitlement interno temporal:

- `billing.status`: `trialing`
- `billing.plan`: `unlimited`
- `billing.effectivePlan`: `unlimited`
- `billing.access`: `active`
- `source`: `beta_invite`

Cuando expira:

- `billing.status`: `paused`
- `billing.plan`: `unlimited`
- `billing.effectivePlan`: `free`
- `billing.access`: `restricted`
- `source`: `beta_invite_expired`

Así el usuario ve qué plan probó, pero no mantiene permisos operativos sin comprar.

## Variables De Entorno

Configurar en Vercel para `apps/web-next`:

```text
KMFX_INVITE_ONLY_SIGNUP=1
KMFX_INVITE_CODES=<codigo-privado>
```

Configurar en Render/API:

```text
KMFX_INVITE_ONLY_SIGNUP=1
KMFX_INVITE_CODES=<codigo-privado>
KMFX_INVITE_TRIAL_DAYS=7
KMFX_INVITE_TRIAL_PLAN=unlimited
```

Si hay varios códigos:

```text
KMFX_INVITE_CODES=discord-junio,alumnos-vip,founders-2026
```

El mismo código debe existir en frontend y backend:

- Frontend valida el signup antes de crear cuenta.
- Backend concede o no concede el acceso beta.

## Operativa Para Discord

Para una beta de unas 60 personas, un código compartido es suficiente si se publica solo en un canal privado o mensaje de comunidad cerrada.

Texto sugerido:

```text
Beta cerrada KMFX Edge

1. Entra en https://kmfxedge.com/login
2. Pulsa Crear cuenta
3. Usa tu email y el código privado de beta
4. Tendrás 7 días de prueba con capacidad completa para conectar MT5

No compartas el código fuera de la comunidad.
```

No mostrar el código dentro del dashboard ni en la página de suscripción.

## Si El Código Se Filtra

1. Cambiar `KMFX_INVITE_CODES` en Vercel y Render.
2. Redeploy de Next y restart/redeploy del API.
3. Publicar nuevo código solo al grupo válido.

Si quieres que los usuarios ya creados mantengan su ventana de beta, deja el código anterior activo junto al nuevo hasta que pasen esos 7 días. Si el código se ha filtrado de verdad, retíralo: esos usuarios perderán el entitlement beta salvo que ya tengan una suscripción real de Stripe.

## Limitación Conocida

Este modelo usa un código compartido para una beta rápida. Si más adelante hace falta control por usuario, máximo de usos, caducidad por invitación o revocación individual, el siguiente paso correcto es una tabla de invitaciones en Supabase con:

- código hasheado,
- email opcional,
- límite de usos,
- fecha de expiración,
- estado usado/revocado,
- auditoría de quién lo canjeó.

Para la beta cerrada actual, el código compartido privado es suficiente y evita abrir una migración sensible antes de tiempo.
