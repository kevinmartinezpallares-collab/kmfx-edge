# Stripe KMFX Dashboard Setup

Fecha: 2026-05-06

Este checklist completa lo que el conector de Stripe no permite configurar con seguridad desde Codex. La cuenta Stripe tambien recibe pagos externos, asi que todos los pasos deben limitarse a `KMFX Edge`.

## Catalogo live creado

- Product: `prod_UT7nzmgj3Eg3Zv` (`KMFX Edge`)
- Edge Basic monthly: `price_1TUBYUEoC6e7wNItXEGCdVZ4`
- Edge Basic yearly: `price_1TUC1ZEoC6e7wNItpQF7UGPA`
- Edge Pro monthly: `price_1TUC5uEoC6e7wNItcPyjGy5Z`
- Edge Pro yearly: `price_1TUC65EoC6e7wNItBfoMCblt`

## Completar metadata y lookup keys

En Stripe Dashboard o API, completar solo estos objetos:

| Price ID | Lookup key | Metadata |
| --- | --- | --- |
| `price_1TUBYUEoC6e7wNItXEGCdVZ4` | `kmfx_basic_monthly` | `app=kmfx_edge`, `plan_key=core`, `commercial_plan=basic`, `interval=month` |
| `price_1TUC1ZEoC6e7wNItpQF7UGPA` | `kmfx_basic_yearly` | `app=kmfx_edge`, `plan_key=core`, `commercial_plan=basic`, `interval=year` |
| `price_1TUC5uEoC6e7wNItcPyjGy5Z` | `kmfx_pro_monthly` | `app=kmfx_edge`, `plan_key=pro`, `commercial_plan=pro`, `interval=month` |
| `price_1TUC65EoC6e7wNItBfoMCblt` | `kmfx_pro_yearly` | `app=kmfx_edge`, `plan_key=pro`, `commercial_plan=pro`, `interval=year` |

Product metadata:

- `app=kmfx_edge`
- `billing_model=subscription`

## Customer Portal

Configurar portal sin afectar productos externos:

- permitir actualizar metodo de pago;
- permitir ver facturas;
- permitir cancelar suscripcion;
- permitir cambiar solo entre los cuatro Prices de KMFX;
- no incluir productos/precios externos;
- mostrar cancelacion al final del periodo pagado.

## Webhook KMFX exclusivo

Crear un endpoint exclusivo para KMFX:

- URL production: `https://kmfx-edge-api.onrender.com/api/billing/webhook`
- futuro dominio preferido: `https://api.kmfxedge.com/api/billing/webhook`

Eventos minimos:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`

Copiar el signing secret `whsec_...` a Render como `STRIPE_WEBHOOK_SECRET`.

## Render env live

Configurar en Render backend:

```bash
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_API_VERSION=2026-02-25.clover
STRIPE_PRODUCT_ID=prod_UT7nzmgj3Eg3Zv
STRIPE_PRICE_CORE_MONTHLY=price_1TUBYUEoC6e7wNItXEGCdVZ4
STRIPE_PRICE_CORE_YEARLY=price_1TUC1ZEoC6e7wNItpQF7UGPA
STRIPE_PRICE_PRO_MONTHLY=price_1TUC5uEoC6e7wNItcPyjGy5Z
STRIPE_PRICE_PRO_YEARLY=price_1TUC65EoC6e7wNItBfoMCblt
SUPABASE_SERVICE_ROLE_KEY=...
NEXT_PUBLIC_APP_URL=https://kmfxedge.com
BILLING_SUCCESS_PATH=/settings/billing?checkout=success
BILLING_CANCEL_PATH=/settings/billing?checkout=cancelled
```

## No tocar

- No crear Payment Links globales.
- No cambiar portal para productos externos.
- No editar webhooks externos.
- No tocar customers/subscriptions/invoices/refunds que no pertenezcan a KMFX.
