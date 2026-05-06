-- Durable MT5 account/key registry for Render production.
-- The backend stores connection keys as hashes only; raw keys are returned once
-- to the authenticated creator and then kept locally by the launcher/EA.

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

create table if not exists public.mt5_account_registry (
  account_id text primary key,
  user_id text not null,
  status text not null default 'pending_link',
  connection_key_hash text,
  connection_key_preview text,
  record jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mt5_account_registry_user_id_idx
  on public.mt5_account_registry (user_id);

create index if not exists mt5_account_registry_connection_key_hash_idx
  on public.mt5_account_registry (connection_key_hash)
  where connection_key_hash is not null and connection_key_hash <> '';

drop trigger if exists mt5_account_registry_touch_updated_at on public.mt5_account_registry;
create trigger mt5_account_registry_touch_updated_at
before update on public.mt5_account_registry
for each row
execute function public.kmfx_touch_updated_at();

alter table public.mt5_account_registry enable row level security;

revoke all on public.mt5_account_registry from anon, authenticated;
grant all on public.mt5_account_registry to service_role;

drop policy if exists mt5_account_registry_no_client_access on public.mt5_account_registry;
create policy mt5_account_registry_no_client_access
on public.mt5_account_registry
for all
to anon, authenticated
using (false)
with check (false);
