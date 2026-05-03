-- Harden future function defaults for roles this migration role can administer.
-- RPC-style public functions must grant EXECUTE explicitly.

do $$
declare
  owner_role text;
  target_role text;
begin
  foreach owner_role in array array['postgres', 'supabase_admin']
  loop
    if not exists (select 1 from pg_roles where rolname = owner_role) then
      continue;
    end if;

    foreach target_role in array array['public', 'anon', 'authenticated', 'service_role']
    loop
      begin
        execute format(
          'alter default privileges for role %I in schema public revoke execute on functions from %I',
          owner_role,
          target_role
        );
      exception
        when undefined_object then
          null;
        when insufficient_privilege then
          raise warning 'could not alter default function privileges for owner role % and target role %',
            owner_role,
            target_role;
      end;
    end loop;
  end loop;
end;
$$;
