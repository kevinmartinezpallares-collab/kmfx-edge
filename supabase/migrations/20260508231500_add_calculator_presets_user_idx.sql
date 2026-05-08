-- Cover calculator_presets ownership lookups and the latest-preset query used by the dashboard.

create index if not exists calculator_presets_user_id_updated_at_idx
  on public.calculator_presets (user_id, updated_at desc);
