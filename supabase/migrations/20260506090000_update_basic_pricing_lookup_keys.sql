update public.plan_entitlements
set
  display_name = 'Edge Basic',
  stripe_monthly_lookup_key = 'kmfx_basic_monthly',
  stripe_yearly_lookup_key = 'kmfx_basic_yearly',
  updated_at = now()
where plan_key = 'core';
