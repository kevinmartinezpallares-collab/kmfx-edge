# Billing Implementation Checklist

## Phase 0 - Decisions

- [x] Confirm currency: EUR.
- [x] Confirm monthly Basic/Core price: 15 EUR/month.
- [x] Confirm yearly Basic/Core price: 150 EUR/year.
- [x] Confirm monthly Pro price: 25 EUR/month.
- [x] Confirm yearly Pro price: 250 EUR/year.
- [x] Confirm Unlimited price: 39 EUR/month or 390 EUR/year.
- [x] Decide whether trial exists: 7-day trial.
- [x] Decide whether trial requires card: no card for MVP trial.
- [x] Decide grace period for `past_due`: 7 days.
- [x] Decide if Desk is public, private, or contact-only: private/contact-only.
- [x] Decide retention behavior when a user downgrades: keep data, make over-limit resources read-only until the user archives/removes them or upgrades again.

Pricing source: `docs/pricing-competitor-research.md`.

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

- [x] Confirm final pricing before creating Stripe objects.
- [x] Create `KMFX Edge` Product in live mode: `prod_UT7nzmgj3Eg3Zv`.
- [x] Create Basic/Core monthly/yearly Prices in live mode.
- [x] Create Pro monthly/yearly Prices in live mode.
- [ ] Add lookup keys and metadata in Stripe Dashboard/API.
- [ ] Configure Customer Portal.
- [ ] Configure webhook endpoint.
- [ ] Send test events.

Safety note: the same Stripe account receives non-KMFX payments. Only touch objects under Product `prod_UT7nzmgj3Eg3Zv` and see `docs/stripe-live-safety-note.md`.

## Phase 3 - Next.js implementation

- [x] Add server-only Stripe API integration.
- [x] Add server-only Supabase service-role billing writes.
- [x] Implement `/api/billing/checkout`.
- [x] Implement `/api/billing/portal`.
- [x] Implement `/api/billing/webhook`.
- [x] Implement `/api/billing/status` initial contract.
- [x] Add entitlement helper for the backend status contract.
- [x] Add initial UI status read by entitlement in Cuentas.
- [x] Add hard UI guards by entitlement, not by plan name.

## Phase 4 - KMFX product guards

- [x] Enforce `launcherConnection` before issuing connection keys.
- [x] Enforce `liveMt5Accounts` before adding MT5 accounts.
- [x] Gate Risk editor with `riskPolicyEditor`.
- [x] Gate local auto-block with `localAutoBlock`.
- [x] Gate raw bridge debug with `rawBridgeDebug`.
- [x] Gate exports with `exports`.

## Phase 5 - Go live

- [ ] Replace test keys with live keys.
- [ ] Confirm webhook signing secret in production.
- [ ] Confirm tax/invoice settings.
- [ ] Confirm refunds/cancellation copy.
- [ ] Confirm terms/privacy mention subscriptions and data retention.
- [ ] Run a real $0/test-mode equivalent rehearsal before live launch.
