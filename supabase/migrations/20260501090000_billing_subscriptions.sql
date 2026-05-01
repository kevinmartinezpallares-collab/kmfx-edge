-- KMFX Edge billing foundation.
-- Safe to run before the Next.js migration: it only adds billing tables,
-- read policies, and seed entitlements.

create or replace function public.kmfx_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.plan_entitlements (
  plan_key text primary key,
  display_name text not null,
  stripe_monthly_lookup_key text,
  stripe_yearly_lookup_key text,
  is_public boolean not null default true,
  entitlements jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.billing_customers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text not null unique,
  email text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.billing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  stripe_subscription_id text,
  stripe_customer_id text not null,
  stripe_product_id text,
  stripe_price_id text,
  plan_key text not null default 'free' references public.plan_entitlements(plan_key),
  status text not null default 'free' check (
    status in (
      'anonymous',
      'free',
      'trialing',
      'active',
      'past_due',
      'unpaid',
      'paused',
      'canceled',
      'incomplete',
      'incomplete_expired'
    )
  ),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  trial_end timestamptz,
  grace_period_ends_at timestamptz,
  is_current boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.billing_events (
  stripe_event_id text primary key,
  event_type text not null,
  livemode boolean not null default false,
  status text not null default 'processed' check (status in ('processed', 'ignored', 'failed')),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error text,
  payload jsonb not null default '{}'::jsonb
);

create unique index if not exists billing_subscriptions_stripe_subscription_id_key
  on public.billing_subscriptions (stripe_subscription_id)
  where stripe_subscription_id is not null;

create unique index if not exists billing_subscriptions_one_current_per_user
  on public.billing_subscriptions (user_id)
  where is_current;

create index if not exists billing_subscriptions_user_id_idx
  on public.billing_subscriptions (user_id);

create index if not exists billing_subscriptions_status_idx
  on public.billing_subscriptions (status);

create index if not exists billing_events_event_type_idx
  on public.billing_events (event_type);

drop trigger if exists plan_entitlements_touch_updated_at on public.plan_entitlements;
create trigger plan_entitlements_touch_updated_at
before update on public.plan_entitlements
for each row execute function public.kmfx_touch_updated_at();

drop trigger if exists billing_customers_touch_updated_at on public.billing_customers;
create trigger billing_customers_touch_updated_at
before update on public.billing_customers
for each row execute function public.kmfx_touch_updated_at();

drop trigger if exists billing_subscriptions_touch_updated_at on public.billing_subscriptions;
create trigger billing_subscriptions_touch_updated_at
before update on public.billing_subscriptions
for each row execute function public.kmfx_touch_updated_at();

alter table public.plan_entitlements enable row level security;
alter table public.billing_customers enable row level security;
alter table public.billing_subscriptions enable row level security;
alter table public.billing_events enable row level security;

drop policy if exists plan_entitlements_read_all on public.plan_entitlements;
create policy plan_entitlements_read_all
on public.plan_entitlements
for select
to anon, authenticated
using (true);

drop policy if exists billing_customers_select_own on public.billing_customers;
create policy billing_customers_select_own
on public.billing_customers
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists billing_subscriptions_select_own on public.billing_subscriptions;
create policy billing_subscriptions_select_own
on public.billing_subscriptions
for select
to authenticated
using (auth.uid() = user_id);

grant select on public.plan_entitlements to anon, authenticated;
grant select on public.billing_customers to authenticated;
grant select on public.billing_subscriptions to authenticated;

insert into public.plan_entitlements (
  plan_key,
  display_name,
  stripe_monthly_lookup_key,
  stripe_yearly_lookup_key,
  is_public,
  entitlements
) values
  (
    'free',
    'Free / Demo',
    null,
    null,
    true,
    '{
      "demoData": true,
      "liveMt5Accounts": 0,
      "launcherConnection": false,
      "dashboardCore": true,
      "riskCore": "partial",
      "riskPolicyEditor": false,
      "localAutoBlock": false,
      "tradesHistory": "limited",
      "calendar": "limited",
      "advancedAnalytics": false,
      "journal": "limited",
      "strategies": false,
      "fundedChallenges": false,
      "portfolio": false,
      "talentProfile": false,
      "rawBridgeDebug": false,
      "exports": false,
      "teamWorkspace": false,
      "prioritySupport": false
    }'::jsonb
  ),
  (
    'core',
    'Edge Core',
    'kmfx_core_monthly',
    'kmfx_core_yearly',
    true,
    '{
      "demoData": true,
      "liveMt5Accounts": 1,
      "launcherConnection": true,
      "dashboardCore": true,
      "riskCore": true,
      "riskPolicyEditor": "limited",
      "localAutoBlock": false,
      "tradesHistory": true,
      "calendar": true,
      "advancedAnalytics": "limited",
      "journal": "limited",
      "strategies": "limited",
      "fundedChallenges": "limited",
      "portfolio": "limited",
      "talentProfile": "limited",
      "rawBridgeDebug": false,
      "exports": false,
      "teamWorkspace": false,
      "prioritySupport": false
    }'::jsonb
  ),
  (
    'pro',
    'Edge Pro',
    'kmfx_pro_monthly',
    'kmfx_pro_yearly',
    true,
    '{
      "demoData": true,
      "liveMt5Accounts": 3,
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
      "rawBridgeDebug": true,
      "exports": true,
      "teamWorkspace": false,
      "prioritySupport": false
    }'::jsonb
  ),
  (
    'desk',
    'Edge Desk',
    null,
    null,
    false,
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
      "rawBridgeDebug": true,
      "exports": true,
      "teamWorkspace": true,
      "prioritySupport": true
    }'::jsonb
  )
on conflict (plan_key) do update set
  display_name = excluded.display_name,
  stripe_monthly_lookup_key = excluded.stripe_monthly_lookup_key,
  stripe_yearly_lookup_key = excluded.stripe_yearly_lookup_key,
  is_public = excluded.is_public,
  entitlements = excluded.entitlements;
