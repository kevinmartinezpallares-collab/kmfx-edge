-- Trigger helper functions do not need direct browser-facing EXECUTE grants.

do $$
declare
  target_role text;
begin
  if to_regprocedure('public.kmfx_touch_updated_at()') is null then
    return;
  end if;

  execute format(
    'alter function %s set search_path = %L',
    'public.kmfx_touch_updated_at()',
    ''
  );

  execute 'revoke all on function public.kmfx_touch_updated_at() from public';

  foreach target_role in array array['anon', 'authenticated', 'service_role']
  loop
    if exists (select 1 from pg_roles where rolname = target_role) then
      execute format(
        'revoke all on function public.kmfx_touch_updated_at() from %I',
        target_role
      );
    end if;
  end loop;
end;
$$;
