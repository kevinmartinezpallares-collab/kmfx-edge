# Billing Environment Variables

These variables are used by the current Python API billing endpoints and can be reused by the future Next.js + shadcn implementation. Keep server secrets out of browser-exposed variables.

## Server variables

```bash
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_API_VERSION=2026-02-25.clover
STRIPE_PRODUCT_ID=prod_UT7nzmgj3Eg3Zv
STRIPE_TRIAL_PERIOD_DAYS=7
STRIPE_TRIAL_REQUIRES_CARD=false
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...

NEXT_PUBLIC_SUPABASE_URL=https://uuhiqreifisppqkawzif.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

NEXT_PUBLIC_APP_URL=https://kmfxedge.com
BILLING_SUCCESS_PATH=/ajustes?tab=subscription&checkout=success&session_id={CHECKOUT_SESSION_ID}
BILLING_CANCEL_PATH=/ajustes?tab=subscription&checkout=cancelled
```

Current backend endpoints:

- `POST /api/billing/checkout`: creates a Stripe Checkout Session in subscription mode.
- `POST /api/billing/portal`: creates a Stripe Customer Portal Session.
- `POST /api/billing/webhook`: verifies Stripe signature, records `billing_events`, upserts customer/subscription rows and updates Supabase `app_metadata`.
- `GET /api/billing/status`: reads current plan/status from trusted `app_metadata`.

## Price configuration

Current production-safe contract. Use these live Price IDs until lookup keys are configured in Stripe:

```bash
STRIPE_PRICE_CORE_MONTHLY=price_1TUBYUEoC6e7wNItXEGCdVZ4
STRIPE_PRICE_CORE_YEARLY=price_1TUC1ZEoC6e7wNItpQF7UGPA
STRIPE_PRICE_PRO_MONTHLY=price_1TULXwEoC6e7wNItP3e4pCh4
STRIPE_PRICE_PRO_YEARLY=price_1TULY0EoC6e7wNItYVKQKHIi
STRIPE_PRICE_UNLIMITED_MONTHLY=price_1TUC5uEoC6e7wNItcPyjGy5Z
STRIPE_PRICE_UNLIMITED_YEARLY=price_1TUC65EoC6e7wNItBfoMCblt
```

Preferred future contract once lookup keys are configured in Stripe:

```bash
STRIPE_PRICE_CORE_MONTHLY=kmfx_basic_monthly
STRIPE_PRICE_CORE_YEARLY=kmfx_basic_yearly
STRIPE_PRICE_PRO_MONTHLY=kmfx_pro_monthly
STRIPE_PRICE_PRO_YEARLY=kmfx_pro_yearly
STRIPE_PRICE_UNLIMITED_MONTHLY=kmfx_unlimited_monthly
STRIPE_PRICE_UNLIMITED_YEARLY=kmfx_unlimited_yearly
```

Production checkpoint 2026-05-12: Render `kmfx-edge-api` has these six live Price IDs configured and matching the Stripe catalog. Stripe MCP still returns no lookup keys, so Price IDs are the active production contract until Stripe Dashboard/API metadata is completed.

Use either lookup keys or Price IDs, never client-provided prices.

## Security rules

- Never expose `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, or `SUPABASE_SERVICE_ROLE_KEY` to the browser.
- Only variables prefixed with `NEXT_PUBLIC_` are browser-readable.
- Webhook verification must use the raw request body.
- Do not authorize by Stripe metadata alone; map Stripe customer/subscription records back to Supabase `auth.users.id`.
- Use service role only inside trusted server routes or background jobs.
- Webhook events must be idempotent through `billing_events.stripe_event_id`.
- Checkout should use Price IDs or lookup keys from server env, never client-provided prices.

## Local development notes

- Use Stripe test mode first.
- Use Stripe CLI or Dashboard webhook forwarding during local development.
- Keep live and test Price IDs separate.
- Prefer lookup keys in app config so Stripe Price IDs can change without code changes.
