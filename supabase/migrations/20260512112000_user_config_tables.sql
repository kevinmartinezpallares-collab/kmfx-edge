-- Version the dashboard user configuration schema so production and future
-- environments do not depend on manually-created Supabase tables.

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

create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  email text,
  avatar_url text,
  avatar_initials text,
  discord text,
  default_account_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  theme text not null default 'dark',
  visual_density text not null default 'comfortable',
  default_landing_page text not null default 'dashboard',
  default_account_id text,
  base_currency text not null default 'USD',
  timezone text not null default 'Europe/Andorra',
  favorite_pairs jsonb not null default '[]'::jsonb,
  trading_style text,
  primary_session text,
  chart_preference text not null default 'balanced',
  show_advanced_metrics boolean not null default true,
  show_risk_alerts boolean not null default true,
  bridge_url text,
  refresh_interval integer not null default 5,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.trading_accounts (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  external_account_id text,
  broker_name text,
  platform_type text not null default 'mt5',
  source_type text not null default 'manual',
  account_name text not null default 'Cuenta MT5',
  account_type text not null default 'real',
  base_currency text not null default 'USD',
  is_default boolean not null default false,
  is_archived boolean not null default false,
  connection_status text not null default 'disconnected',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_synced_at timestamptz
);

create table if not exists public.calculator_presets (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  trading_account_id text references public.trading_accounts(id) on delete set null,
  preset_key text not null default 'standard',
  label text not null default 'Preset principal',
  risk_percent numeric,
  position_size_mode text,
  stop_loss_pips numeric,
  take_profit_pips numeric,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.risk_rules (
  user_id uuid primary key references auth.users(id) on delete cascade,
  trading_account_id text references public.trading_accounts(id) on delete set null,
  alert_drawdown boolean not null default true,
  alert_streaks boolean not null default true,
  alert_win_rate boolean not null default true,
  alert_overtrading boolean not null default true,
  risk_guidance_enabled boolean not null default true,
  auto_block_opt_in boolean not null default false,
  default_risk numeric,
  daily_drawdown_limit numeric,
  max_drawdown_limit numeric,
  max_trade_risk_percent numeric,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.dashboard_objectives (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  trading_account_id text references public.trading_accounts(id) on delete set null,
  metric_key text not null,
  label text not null,
  target_value numeric,
  comparison_mode text not null default 'gte',
  timeframe text not null default 'rolling',
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_profiles
  add column if not exists display_name text,
  add column if not exists email text,
  add column if not exists avatar_url text,
  add column if not exists avatar_initials text,
  add column if not exists discord text,
  add column if not exists default_account_id text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.user_preferences
  add column if not exists theme text not null default 'dark',
  add column if not exists visual_density text not null default 'comfortable',
  add column if not exists default_landing_page text not null default 'dashboard',
  add column if not exists default_account_id text,
  add column if not exists base_currency text not null default 'USD',
  add column if not exists timezone text not null default 'Europe/Andorra',
  add column if not exists favorite_pairs jsonb not null default '[]'::jsonb,
  add column if not exists trading_style text,
  add column if not exists primary_session text,
  add column if not exists chart_preference text not null default 'balanced',
  add column if not exists show_advanced_metrics boolean not null default true,
  add column if not exists show_risk_alerts boolean not null default true,
  add column if not exists bridge_url text,
  add column if not exists refresh_interval integer not null default 5,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.risk_rules
  add column if not exists trading_account_id text,
  add column if not exists alert_drawdown boolean not null default true,
  add column if not exists alert_streaks boolean not null default true,
  add column if not exists alert_win_rate boolean not null default true,
  add column if not exists alert_overtrading boolean not null default true,
  add column if not exists risk_guidance_enabled boolean not null default true,
  add column if not exists auto_block_opt_in boolean not null default false,
  add column if not exists default_risk numeric,
  add column if not exists daily_drawdown_limit numeric,
  add column if not exists max_drawdown_limit numeric,
  add column if not exists max_trade_risk_percent numeric,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists user_preferences_user_id_idx
  on public.user_preferences (user_id);

create index if not exists trading_accounts_user_id_idx
  on public.trading_accounts (user_id);

create index if not exists trading_accounts_user_external_account_idx
  on public.trading_accounts (user_id, external_account_id);

create index if not exists calculator_presets_user_id_updated_at_idx
  on public.calculator_presets (user_id, updated_at desc);

create index if not exists calculator_presets_user_account_idx
  on public.calculator_presets (user_id, trading_account_id);

create index if not exists risk_rules_trading_account_id_idx
  on public.risk_rules (trading_account_id);

create index if not exists dashboard_objectives_user_id_idx
  on public.dashboard_objectives (user_id);

create index if not exists dashboard_objectives_user_account_idx
  on public.dashboard_objectives (user_id, trading_account_id);

drop trigger if exists user_profiles_touch_updated_at on public.user_profiles;
create trigger user_profiles_touch_updated_at
before update on public.user_profiles
for each row execute function public.kmfx_touch_updated_at();

drop trigger if exists user_preferences_touch_updated_at on public.user_preferences;
create trigger user_preferences_touch_updated_at
before update on public.user_preferences
for each row execute function public.kmfx_touch_updated_at();

drop trigger if exists trading_accounts_touch_updated_at on public.trading_accounts;
create trigger trading_accounts_touch_updated_at
before update on public.trading_accounts
for each row execute function public.kmfx_touch_updated_at();

drop trigger if exists calculator_presets_touch_updated_at on public.calculator_presets;
create trigger calculator_presets_touch_updated_at
before update on public.calculator_presets
for each row execute function public.kmfx_touch_updated_at();

drop trigger if exists risk_rules_touch_updated_at on public.risk_rules;
create trigger risk_rules_touch_updated_at
before update on public.risk_rules
for each row execute function public.kmfx_touch_updated_at();

drop trigger if exists dashboard_objectives_touch_updated_at on public.dashboard_objectives;
create trigger dashboard_objectives_touch_updated_at
before update on public.dashboard_objectives
for each row execute function public.kmfx_touch_updated_at();

alter table public.user_profiles enable row level security;
alter table public.user_preferences enable row level security;
alter table public.trading_accounts enable row level security;
alter table public.calculator_presets enable row level security;
alter table public.risk_rules enable row level security;
alter table public.dashboard_objectives enable row level security;

drop policy if exists user_profiles_owner_all on public.user_profiles;
create policy user_profiles_owner_all
on public.user_profiles
for all
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

drop policy if exists user_preferences_owner_all on public.user_preferences;
create policy user_preferences_owner_all
on public.user_preferences
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists trading_accounts_owner_all on public.trading_accounts;
create policy trading_accounts_owner_all
on public.trading_accounts
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists calculator_presets_owner_all on public.calculator_presets;
create policy calculator_presets_owner_all
on public.calculator_presets
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists risk_rules_owner_all on public.risk_rules;
create policy risk_rules_owner_all
on public.risk_rules
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists dashboard_objectives_owner_all on public.dashboard_objectives;
create policy dashboard_objectives_owner_all
on public.dashboard_objectives
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.user_profiles to authenticated;
grant select, insert, update, delete on public.user_preferences to authenticated;
grant select, insert, update, delete on public.trading_accounts to authenticated;
grant select, insert, update, delete on public.calculator_presets to authenticated;
grant select, insert, update, delete on public.risk_rules to authenticated;
grant select, insert, update, delete on public.dashboard_objectives to authenticated;

revoke all on public.user_profiles from anon;
revoke all on public.user_preferences from anon;
revoke all on public.trading_accounts from anon;
revoke all on public.calculator_presets from anon;
revoke all on public.risk_rules from anon;
revoke all on public.dashboard_objectives from anon;
