# KMFX Edge closed beta to production flow

## Objetivo

Mantener `beta.kmfxedge.com` como acceso cerrado por invitacion y preparar una salida limpia hacia `kmfxedge.com` sin migrar usuarios manualmente.

## Dominios

- `beta.kmfxedge.com`: beta cerrada. La creacion de cuenta requiere codigo privado.
- `kmfxedge.com`: dominio final del producto cuando salgamos de beta. No debe depender del codigo de beta.

Durante la beta, si el dominio de produccion apunta accidentalmente al proyecto Next.js, el proxy redirige a `beta.kmfxedge.com`. Para abrir produccion hay que activar `KMFX_PRODUCTION_APP_ENABLED=1`.

## Flujo recomendado

1. El usuario entra en `beta.kmfxedge.com/login`.
2. Si no tiene cuenta, crea acceso con email, password y codigo privado.
3. La cuenta vive en el mismo Supabase que usara produccion.
4. El plan beta se gestiona como entitlement temporal en billing.
5. Un dia antes de vencer la beta, el dashboard muestra CTA hacia Stripe para contratar `Edge Unlimited` anual con descuento del 50%.
6. Al acabar la beta, el usuario conserva su cuenta y datos. Solo cambia el dominio recomendado: `kmfxedge.com`.
7. Para salir de beta, se apunta `kmfxedge.com` al deployment Next.js y se activa `KMFX_PRODUCTION_APP_ENABLED=1`.

## Stripe

- El codigo de descuento no se muestra dentro del dashboard.
- El descuento se aplica en Stripe Checkout o Billing Portal.
- El codigo puede distribuirse manualmente a miembros VIP o beta testers.

## Seguridad

La validacion de invitacion en Next.js protege el flujo normal de la app. Antes de abrir mas volumen, el cierre fuerte debe vivir tambien en Supabase:

- opcion preferida: Auth Hook `before user created` que valide invitaciones;
- alternativa: desactivar signups publicos y crear usuarios desde una ruta server-side con Service Role.

Mientras no se active esa capa, no publicar el codigo de invitacion fuera de la comunidad cerrada.
