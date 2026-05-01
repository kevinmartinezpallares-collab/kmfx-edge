# Billing Implementation Checklist

## Phase 0 - Decisions

- [ ] Confirm currency: USD, EUR, or both.
- [ ] Confirm monthly Core price.
- [ ] Confirm yearly Core price or annual discount.
- [ ] Confirm monthly Pro price.
- [ ] Confirm yearly Pro price or annual discount.
- [ ] Decide whether trial exists.
- [ ] Decide whether trial requires card.
- [ ] Decide grace period for `past_due`.
- [ ] Decide if Desk is public, private, or contact-only.
- [ ] Decide retention behavior when a user downgrades.

## Phase 1 - Supabase

- [x] Prepare billing migration SQL.
- [x] Apply migration to Supabase project `KMFX` (`uuhiqreifisppqkawzif`).
- [x] Verify RLS policies.
- [x] Run Supabase security advisor.
- [x] Run Supabase performance advisor.
- [x] Confirm seeded `plan_entitlements`.
- [x] Apply billing-specific advisor fixes.

Residual advisor notes after billing setup:

- Existing `public.handle_new_user()` security-definer execute warning, unrelated to billing.
- Existing `calculator_presets.user_id` missing-index info, unrelated to billing.
- New billing indexes show as unused because no billing traffic exists yet.

## Phase 2 - Stripe test mode

- [ ] Confirm final pricing before creating Stripe objects.
- [ ] Create `KMFX Edge` Product.
- [ ] Create Core monthly/yearly Prices.
- [ ] Create Pro monthly/yearly Prices.
- [ ] Add lookup keys and metadata.
- [ ] Configure Customer Portal.
- [ ] Configure webhook endpoint.
- [ ] Send test events.

## Phase 3 - Next.js implementation

- [ ] Add Stripe SDK server-only.
- [ ] Add Supabase SSR/server client.
- [ ] Implement `/api/billing/checkout`.
- [ ] Implement `/api/billing/portal`.
- [ ] Implement `/api/billing/webhook`.
- [ ] Implement `/api/billing/status`.
- [ ] Add entitlement helper.
- [ ] Add UI guards by entitlement, not by plan name.

## Phase 4 - KMFX product guards

- [ ] Enforce `launcherConnection` before issuing connection keys.
- [ ] Enforce `liveMt5Accounts` before adding MT5 accounts.
- [ ] Gate Risk editor with `riskPolicyEditor`.
- [ ] Gate local auto-block with `localAutoBlock`.
- [ ] Gate raw bridge debug with `rawBridgeDebug`.
- [ ] Gate exports with `exports`.

## Phase 5 - Go live

- [ ] Replace test keys with live keys.
- [ ] Confirm webhook signing secret in production.
- [ ] Confirm tax/invoice settings.
- [ ] Confirm refunds/cancellation copy.
- [ ] Confirm terms/privacy mention subscriptions and data retention.
- [ ] Run a real $0/test-mode equivalent rehearsal before live launch.
