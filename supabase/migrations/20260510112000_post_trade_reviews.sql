create table if not exists public.post_trade_reviews (
  user_id text not null,
  account_id text not null,
  trade_id text not null,
  record jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, account_id, trade_id)
);

create index if not exists post_trade_reviews_user_account_idx
  on public.post_trade_reviews (user_id, account_id);

drop trigger if exists post_trade_reviews_touch_updated_at on public.post_trade_reviews;
create trigger post_trade_reviews_touch_updated_at
  before update on public.post_trade_reviews
  for each row
  execute function public.kmfx_touch_updated_at();

alter table public.post_trade_reviews enable row level security;

revoke all on table public.post_trade_reviews from anon, authenticated;
grant all on table public.post_trade_reviews to service_role;

drop policy if exists post_trade_reviews_no_client_access on public.post_trade_reviews;
create policy post_trade_reviews_no_client_access
  on public.post_trade_reviews
  for all
  to anon, authenticated
  using (false)
  with check (false);
