# Stripe Product Catalog

## Current decision

Use Stripe Billing with Checkout Sessions in `subscription` mode. Use Customer Portal for self-service plan changes, card updates, invoices, and cancellation.

The catalog below is intentionally price-ready but not price-final. Do not create final Stripe Prices until the amounts, currency, trial rules, and annual discount are confirmed.

## Product model

Recommended Stripe model:

- Product: `KMFX Edge`
- Prices:
  - `kmfx_core_monthly`
  - `kmfx_core_yearly`
  - `kmfx_pro_monthly`
  - `kmfx_pro_yearly`
- Desk: manual/custom quote for now, no public Price required.
- Free/Demo: no Stripe Price.

## Product

| Field | Value |
| --- | --- |
| Name | `KMFX Edge` |
| Description | `Risk, performance, and MT5 workflow layer for disciplined traders.` |
| Metadata | `app=kmfx_edge`, `billing_model=subscription` |

## Prices to create after final pricing

| Lookup key | Plan | Interval | Currency | Amount | Metadata |
| --- | --- | --- | --- | --- | --- |
| `kmfx_core_monthly` | Edge Core | monthly | TBD | TBD | `plan_key=core`, `interval=month` |
| `kmfx_core_yearly` | Edge Core | yearly | TBD | TBD | `plan_key=core`, `interval=year` |
| `kmfx_pro_monthly` | Edge Pro | monthly | TBD | TBD | `plan_key=pro`, `interval=month` |
| `kmfx_pro_yearly` | Edge Pro | yearly | TBD | TBD | `plan_key=pro`, `interval=year` |

## Required webhook events

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`

## Optional webhook events

- `customer.subscription.trial_will_end`
- `invoice.payment_action_required`
- `customer.updated`
- `price.updated`
- `product.updated`

## Checkout Session metadata

Every Checkout Session should include:

| Metadata key | Source |
| --- | --- |
| `user_id` | Supabase auth user id |
| `plan_key` | `core` or `pro` |
| `price_lookup_key` | Selected price lookup key |
| `app` | `kmfx_edge` |

## Subscription metadata

When creating Checkout Sessions, set subscription metadata too:

| Metadata key | Source |
| --- | --- |
| `user_id` | Supabase auth user id |
| `plan_key` | `core` or `pro` |
| `app` | `kmfx_edge` |

## Customer Portal

Configure Customer Portal to allow:

- payment method updates
- invoice history
- cancellation
- switching between Core and Pro
- monthly/yearly interval changes only if pricing is finalized

Keep Desk upgrades outside self-service until the sales/support process exists.

## Notes from current account scan

As of 2026-05-01, the connected Stripe account had no Products or Prices returned by the plugin. That means creating the KMFX catalog later should not collide with existing Stripe resources.

No Stripe Products or Prices were created during this setup pass because final amounts, currency, trial rules, and annual discounts are not confirmed yet. This avoids creating live billing objects that might need cleanup later.
