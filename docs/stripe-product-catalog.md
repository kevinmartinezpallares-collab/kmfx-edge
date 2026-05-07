# Stripe Product Catalog

## Current decision

Use Stripe Billing with Checkout Sessions in `subscription` mode. Use Customer Portal for self-service plan changes, card updates, invoices, and cancellation.

The catalog below is price-final for MVP. Pricing was set after competitor research in `docs/pricing-competitor-research.md`.

## Product model

Recommended Stripe model:

- Product: `KMFX Edge`
- Prices:
  - `kmfx_basic_monthly`
  - `kmfx_basic_yearly`
  - `kmfx_pro_monthly`
  - `kmfx_pro_yearly`
  - `kmfx_unlimited_monthly`
  - `kmfx_unlimited_yearly`
- Desk: manual/custom quote only if a future enterprise workflow appears.
- Free/Demo: no Stripe Price.

## Product

| Field | Value |
| --- | --- |
| Name | `KMFX Edge` |
| Live Product ID | `prod_UT7nzmgj3Eg3Zv` |
| Description | `Risk, performance, and MT5 workflow layer for disciplined traders.` |
| Metadata | `app=kmfx_edge`, `billing_model=subscription` |

## Prices

| Lookup key | Live Price ID | Plan | Interval | Currency | Amount | Metadata |
| --- | --- | --- | --- | --- | --- | --- |
| `kmfx_basic_monthly` | `price_1TUBYUEoC6e7wNItXEGCdVZ4` | Edge Basic | monthly | EUR | 15.00 EUR | `plan_key=core`, `commercial_plan=basic`, `interval=month` |
| `kmfx_basic_yearly` | `price_1TUC1ZEoC6e7wNItpQF7UGPA` | Edge Basic | yearly | EUR | 150.00 EUR | `plan_key=core`, `commercial_plan=basic`, `interval=year` |
| `kmfx_pro_monthly` | `price_1TULXwEoC6e7wNItP3e4pCh4` | Edge Pro | monthly | EUR | 25.00 EUR | `plan_key=pro`, `commercial_plan=pro`, `interval=month` |
| `kmfx_pro_yearly` | `price_1TULY0EoC6e7wNItYVKQKHIi` | Edge Pro | yearly | EUR | 250.00 EUR | `plan_key=pro`, `commercial_plan=pro`, `interval=year` |
| `kmfx_unlimited_monthly` | `price_1TUC5uEoC6e7wNItcPyjGy5Z` | Edge Unlimited | monthly | EUR | 39.00 EUR | `plan_key=unlimited`, `commercial_plan=unlimited`, `interval=month` |
| `kmfx_unlimited_yearly` | `price_1TUC65EoC6e7wNItBfoMCblt` | Edge Unlimited | yearly | EUR | 390.00 EUR | `plan_key=unlimited`, `commercial_plan=unlimited`, `interval=year` |

Note: the Stripe connector created Prices without lookup keys or metadata. Until those fields are completed in Stripe Dashboard/API, configure the backend with the live Price IDs from `docs/billing-env-vars.md`.

## Commercial rules

- Trial: 7 days, no card required for MVP.
- `past_due` grace period: 7 days.
- Refunds: 14 days for the first purchase when there is no abuse, or when a product-blocking technical issue cannot be resolved.
- Cancellation: self-service in Customer Portal; access remains active until the paid period ends.
- Downgrade: keep data; over-limit accounts/features become read-only until the user archives/removes them or upgrades again.
- Desk: contact-only, no public Stripe Price.

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
| `plan_key` | `core`, `pro`, or `unlimited` |
| `price_lookup_key` | Selected price lookup key |
| `app` | `kmfx_edge` |

## Subscription metadata

When creating Checkout Sessions, set subscription metadata too:

| Metadata key | Source |
| --- | --- |
| `user_id` | Supabase auth user id |
| `plan_key` | `core`, `pro`, or `unlimited` |
| `app` | `kmfx_edge` |

## Customer Portal

Configure Customer Portal carefully because the same Stripe account receives non-KMFX payments. Do not change unrelated products or flows.

Allow:

- payment method updates
- invoice history
- cancellation
- switching between Edge Basic, Edge Pro, and Edge Unlimited
- monthly/yearly interval changes only if pricing is finalized

Keep Desk upgrades outside self-service until the sales/support process exists.

## Notes from current account scan

As of 2026-05-01, the connected Stripe account had no Products or Prices returned by the plugin. On 2026-05-06, the KMFX product and the initial Basic/39 EUR prices were created. On 2026-05-07, the 39 EUR tier was formalized as Edge Unlimited and new 25 EUR Edge Pro prices were added under the same KMFX product.

Do not modify any Stripe object outside the isolated `KMFX Edge` product unless the user explicitly asks for it.
