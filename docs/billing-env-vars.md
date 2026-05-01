# Billing Environment Variables

These variables are for the future Next.js + shadcn implementation. Keep server secrets out of browser-exposed variables.

## Next.js server variables

```bash
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_API_VERSION=2026-02-25.clover
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...

NEXT_PUBLIC_SUPABASE_URL=https://uuhiqreifisppqkawzif.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

NEXT_PUBLIC_APP_URL=http://localhost:3000
BILLING_SUCCESS_PATH=/settings/billing?checkout=success
BILLING_CANCEL_PATH=/settings/billing?checkout=cancelled
```

## Price lookup keys

```bash
STRIPE_PRICE_CORE_MONTHLY=kmfx_core_monthly
STRIPE_PRICE_CORE_YEARLY=kmfx_core_yearly
STRIPE_PRICE_PRO_MONTHLY=kmfx_pro_monthly
STRIPE_PRICE_PRO_YEARLY=kmfx_pro_yearly
```

## Security rules

- Never expose `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, or `SUPABASE_SERVICE_ROLE_KEY` to the browser.
- Only variables prefixed with `NEXT_PUBLIC_` are browser-readable.
- Webhook verification must use the raw request body.
- Do not authorize by Stripe metadata alone; map Stripe customer/subscription records back to Supabase `auth.users.id`.
- Use service role only inside trusted server routes or background jobs.

## Local development notes

- Use Stripe test mode first.
- Use Stripe CLI or Dashboard webhook forwarding during local development.
- Keep live and test Price IDs separate.
- Prefer lookup keys in app config so Stripe Price IDs can change without code changes.
