-- Advisor fixes for the billing foundation.
-- Keeps billing_events server-only, optimizes auth.uid() RLS evaluation,
-- and adds a covering index for the plan_key foreign key.

create index if not exists billing_subscriptions_plan_key_idx
  on public.billing_subscriptions (plan_key);

drop policy if exists billing_customers_select_own on public.billing_customers;
create policy billing_customers_select_own
on public.billing_customers
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists billing_subscriptions_select_own on public.billing_subscriptions;
create policy billing_subscriptions_select_own
on public.billing_subscriptions
for select
to authenticated
using ((select auth.uid()) = user_id);

revoke all on public.billing_events from anon, authenticated;

drop policy if exists billing_events_no_client_access on public.billing_events;
create policy billing_events_no_client_access
on public.billing_events
for all
to anon, authenticated
using (false)
with check (false);
