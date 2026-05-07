update public.plan_entitlements
set
  entitlements = jsonb_set(entitlements, '{liveMt5Accounts}', '2'::jsonb),
  updated_at = now()
where plan_key = 'core';

update public.plan_entitlements
set
  stripe_monthly_lookup_key = 'kmfx_pro_monthly',
  stripe_yearly_lookup_key = 'kmfx_pro_yearly',
  entitlements = jsonb_set(entitlements, '{liveMt5Accounts}', '5'::jsonb),
  updated_at = now()
where plan_key = 'pro';

insert into public.plan_entitlements (
  plan_key,
  display_name,
  stripe_monthly_lookup_key,
  stripe_yearly_lookup_key,
  is_public,
  entitlements
) values (
  'unlimited',
  'Edge Unlimited',
  'kmfx_unlimited_monthly',
  'kmfx_unlimited_yearly',
  true,
  '{
    "demoData": true,
    "liveMt5Accounts": "custom",
    "launcherConnection": true,
    "dashboardCore": true,
    "riskCore": true,
    "riskPolicyEditor": true,
    "localAutoBlock": true,
    "tradesHistory": true,
    "calendar": true,
    "advancedAnalytics": true,
    "journal": true,
    "strategies": true,
    "fundedChallenges": true,
    "portfolio": true,
    "talentProfile": true,
    "rawBridgeDebug": false,
    "exports": true,
    "teamWorkspace": false,
    "prioritySupport": true
  }'::jsonb
) on conflict (plan_key) do update set
  display_name = excluded.display_name,
  stripe_monthly_lookup_key = excluded.stripe_monthly_lookup_key,
  stripe_yearly_lookup_key = excluded.stripe_yearly_lookup_key,
  is_public = excluded.is_public,
  entitlements = excluded.entitlements,
  updated_at = now();
