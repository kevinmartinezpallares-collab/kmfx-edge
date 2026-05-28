-- Normalized MT5 sync data.
-- Keep mt5_account_registry.record as a compact operational snapshot; store
-- trades, open positions and equity points in bounded queryable tables.

create table if not exists public.mt5_account_positions (
  account_id text not null references public.mt5_account_registry(account_id) on delete cascade,
  user_id text not null,
  position_key text not null,
  ticket text,
  symbol text not null default '',
  side text not null default '',
  volume numeric,
  price_open numeric,
  price_current numeric,
  stop_loss numeric,
  take_profit numeric,
  profit numeric,
  swap numeric,
  floating_pnl numeric,
  risk_amount numeric,
  risk_pct numeric,
  risk_state text,
  risk_calculable boolean not null default true,
  opened_at timestamptz,
  time_unix bigint,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (account_id, position_key)
);

create index if not exists mt5_account_positions_user_account_idx
  on public.mt5_account_positions (user_id, account_id);

create index if not exists mt5_account_positions_symbol_idx
  on public.mt5_account_positions (account_id, symbol);

drop trigger if exists mt5_account_positions_touch_updated_at on public.mt5_account_positions;
create trigger mt5_account_positions_touch_updated_at
before update on public.mt5_account_positions
for each row
execute function public.kmfx_touch_updated_at();

alter table public.mt5_account_positions enable row level security;
revoke all on public.mt5_account_positions from public;
revoke all on public.mt5_account_positions from anon, authenticated;
grant all on public.mt5_account_positions to service_role;

drop policy if exists mt5_account_positions_no_client_access on public.mt5_account_positions;
create policy mt5_account_positions_no_client_access
on public.mt5_account_positions
for all
to anon, authenticated
using (false)
with check (false);

create table if not exists public.mt5_account_trades (
  account_id text not null references public.mt5_account_registry(account_id) on delete cascade,
  user_id text not null,
  trade_key text not null,
  ticket text,
  deal_id text,
  order_id text,
  position_id text,
  symbol text not null default '',
  side text not null default '',
  volume numeric,
  price numeric,
  open_price numeric,
  open_time timestamptz,
  close_time timestamptz,
  open_time_unix bigint,
  close_time_unix bigint,
  stop_loss numeric,
  take_profit numeric,
  profit numeric,
  commission numeric,
  swap numeric,
  net numeric,
  strategy_tag text,
  comment text,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (account_id, trade_key)
);

create index if not exists mt5_account_trades_user_account_time_idx
  on public.mt5_account_trades (user_id, account_id, close_time desc);

create index if not exists mt5_account_trades_symbol_idx
  on public.mt5_account_trades (account_id, symbol);

drop trigger if exists mt5_account_trades_touch_updated_at on public.mt5_account_trades;
create trigger mt5_account_trades_touch_updated_at
before update on public.mt5_account_trades
for each row
execute function public.kmfx_touch_updated_at();

alter table public.mt5_account_trades enable row level security;
revoke all on public.mt5_account_trades from public;
revoke all on public.mt5_account_trades from anon, authenticated;
grant all on public.mt5_account_trades to service_role;

drop policy if exists mt5_account_trades_no_client_access on public.mt5_account_trades;
create policy mt5_account_trades_no_client_access
on public.mt5_account_trades
for all
to anon, authenticated
using (false)
with check (false);

create table if not exists public.mt5_equity_points (
  account_id text not null references public.mt5_account_registry(account_id) on delete cascade,
  user_id text not null,
  point_time timestamptz not null,
  value numeric not null,
  source text not null default 'mt5_sync',
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (account_id, point_time)
);

create index if not exists mt5_equity_points_user_account_time_idx
  on public.mt5_equity_points (user_id, account_id, point_time desc);

drop trigger if exists mt5_equity_points_touch_updated_at on public.mt5_equity_points;
create trigger mt5_equity_points_touch_updated_at
before update on public.mt5_equity_points
for each row
execute function public.kmfx_touch_updated_at();

alter table public.mt5_equity_points enable row level security;
revoke all on public.mt5_equity_points from public;
revoke all on public.mt5_equity_points from anon, authenticated;
grant all on public.mt5_equity_points to service_role;

drop policy if exists mt5_equity_points_no_client_access on public.mt5_equity_points;
create policy mt5_equity_points_no_client_access
on public.mt5_equity_points
for all
to anon, authenticated
using (false)
with check (false);
