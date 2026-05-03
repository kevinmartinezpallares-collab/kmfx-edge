-- Harden the auth profile bootstrap trigger function without changing trigger behavior.
-- The auth.users trigger invokes this function by OID; browser-facing RPC roles do
-- not need direct EXECUTE permission on a SECURITY DEFINER trigger function.

do $$
declare
  target_role text;
begin
  if to_regprocedure('public.handle_new_user()') is null then
    return;
  end if;

  execute format(
    'alter function %s set search_path = %L',
    'public.handle_new_user()',
    ''
  );

  execute 'revoke all on function public.handle_new_user() from public';

  foreach target_role in array array['anon', 'authenticated', 'service_role']
  loop
    if exists (select 1 from pg_roles where rolname = target_role) then
      execute format(
        'revoke all on function public.handle_new_user() from %I',
        target_role
      );
    end if;
  end loop;
end;
$$;

-- Prevent future functions created by this migration role in public from being
-- executable through PostgREST by default. Public RPC functions should grant
-- EXECUTE explicitly as part of their own migration.
alter default privileges in schema public
  revoke execute on functions from public;

alter default privileges in schema public
  revoke execute on functions from anon;

alter default privileges in schema public
  revoke execute on functions from authenticated;
