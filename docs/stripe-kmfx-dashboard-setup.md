# Stripe KMFX Dashboard Setup

Fecha: 2026-05-06

Este checklist completa lo que el conector de Stripe no permite configurar con seguridad desde Codex. La cuenta Stripe tambien recibe pagos externos, asi que todos los pasos deben limitarse a `KMFX Edge`.

## Auditoria automatizable

Antes de cobrar, ejecutar con una key secreta de Stripe del entorno correcto:

```bash
STRIPE_SECRET_KEY=sk_live_... python3 scripts/stripe_kmfx_setup_audit.py
```

Para completar lookup keys y metadata de los seis Prices KMFX por API, usar solo si el audit confirma que el producto es `prod_UT7nzmgj3Eg3Zv`:

```bash
STRIPE_SECRET_KEY=sk_live_... python3 scripts/stripe_kmfx_setup_audit.py --apply-price-metadata
```

La herramienta solo toca los seis Price IDs documentados aqui cuando se usa `--apply-price-metadata`. Producto, Customer Portal y webhook se auditan en modo lectura; si faltan, deben corregirse en Stripe Dashboard o API antes de cobrar.

## Catalogo live creado

- Product: `prod_UT7nzmgj3Eg3Zv` (`KMFX Edge`)
- Edge Basic monthly: `price_1TUBYUEoC6e7wNItXEGCdVZ4`
- Edge Basic yearly: `price_1TUC1ZEoC6e7wNItpQF7UGPA`
- Edge Pro monthly: `price_1TULXwEoC6e7wNItP3e4pCh4`
- Edge Pro yearly: `price_1TULY0EoC6e7wNItYVKQKHIi`
- Edge Unlimited monthly: `price_1TUC5uEoC6e7wNItcPyjGy5Z`
- Edge Unlimited yearly: `price_1TUC65EoC6e7wNItBfoMCblt`

## Completar metadata y lookup keys

En Stripe Dashboard o API, completar solo estos objetos:

| Price ID | Lookup key | Metadata |
| --- | --- | --- |
| `price_1TUBYUEoC6e7wNItXEGCdVZ4` | `kmfx_basic_monthly` | `app=kmfx_edge`, `plan_key=core`, `commercial_plan=basic`, `interval=month` |
| `price_1TUC1ZEoC6e7wNItpQF7UGPA` | `kmfx_basic_yearly` | `app=kmfx_edge`, `plan_key=core`, `commercial_plan=basic`, `interval=year` |
| `price_1TULXwEoC6e7wNItP3e4pCh4` | `kmfx_pro_monthly` | `app=kmfx_edge`, `plan_key=pro`, `commercial_plan=pro`, `interval=month` |
| `price_1TULY0EoC6e7wNItYVKQKHIi` | `kmfx_pro_yearly` | `app=kmfx_edge`, `plan_key=pro`, `commercial_plan=pro`, `interval=year` |
| `price_1TUC5uEoC6e7wNItcPyjGy5Z` | `kmfx_unlimited_monthly` | `app=kmfx_edge`, `plan_key=unlimited`, `commercial_plan=unlimited`, `interval=month` |
| `price_1TUC65EoC6e7wNItBfoMCblt` | `kmfx_unlimited_yearly` | `app=kmfx_edge`, `plan_key=unlimited`, `commercial_plan=unlimited`, `interval=year` |

Product metadata:

- `app=kmfx_edge`
- `billing_model=subscription`

## Customer Portal

Configurar portal sin afectar productos externos:

- permitir actualizar metodo de pago;
- permitir ver facturas;
- permitir cancelar suscripcion;
- permitir cambiar solo entre los seis Prices de KMFX;
- no incluir productos/precios externos;
- mostrar cancelacion al final del periodo pagado.

El audit marca fallo si el portal no tiene `invoice_history`, `payment_method_update`, `subscription_cancel` y `subscription_update` activos, o si `subscription_update` incluye productos externos o no incluye los seis Prices de KMFX.

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
- `invoice.payment_action_required`

Copiar el signing secret `whsec_...` a Render como `STRIPE_WEBHOOK_SECRET`.

## Render env live

Configurar en Render backend:

```bash
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_API_VERSION=2026-02-25.clover
STRIPE_PRODUCT_ID=prod_UT7nzmgj3Eg3Zv
STRIPE_TRIAL_PERIOD_DAYS=7
STRIPE_TRIAL_REQUIRES_CARD=false
STRIPE_PRICE_CORE_MONTHLY=price_1TUBYUEoC6e7wNItXEGCdVZ4
STRIPE_PRICE_CORE_YEARLY=price_1TUC1ZEoC6e7wNItpQF7UGPA
STRIPE_PRICE_PRO_MONTHLY=price_1TULXwEoC6e7wNItP3e4pCh4
STRIPE_PRICE_PRO_YEARLY=price_1TULY0EoC6e7wNItYVKQKHIi
STRIPE_PRICE_UNLIMITED_MONTHLY=price_1TUC5uEoC6e7wNItcPyjGy5Z
STRIPE_PRICE_UNLIMITED_YEARLY=price_1TUC65EoC6e7wNItBfoMCblt
SUPABASE_SERVICE_ROLE_KEY=...
NEXT_PUBLIC_APP_URL=https://kmfxedge.com
BILLING_SUCCESS_PATH=/ajustes?tab=subscription&checkout=success&session_id={CHECKOUT_SESSION_ID}
BILLING_CANCEL_PATH=/ajustes?tab=subscription&checkout=cancelled
```

## No tocar

- No crear Payment Links globales.
- No cambiar portal para productos externos.
- No editar webhooks externos.
- No tocar customers/subscriptions/invoices/refunds que no pertenezcan a KMFX.
