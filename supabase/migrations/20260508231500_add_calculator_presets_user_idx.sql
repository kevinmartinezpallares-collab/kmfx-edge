-- Cover calculator_presets ownership lookups and the latest-preset query used by the dashboard.
-- This migration is intentionally tolerant because older environments may have
-- created the settings tables manually before the schema was versioned.

do $$
begin
  if to_regclass('public.calculator_presets') is not null then
    create index if not exists calculator_presets_user_id_updated_at_idx
      on public.calculator_presets (user_id, updated_at desc);
  end if;
end $$;
