function readEnv(...keys: string[]) {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }

  return "";
}

export function isSupabaseAuthEnabled() {
  return readEnv("KMFX_NEXT_AUTH_MODE")
    .trim()
    .toLowerCase() === "supabase";
}

export function resolveSupabaseUrl() {
  return readEnv("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL");
}

export function resolveSupabasePublishableKey() {
  return readEnv(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_ANON_KEY",
  );
}

export function hasSupabasePublicConfig() {
  return Boolean(resolveSupabaseUrl() && resolveSupabasePublishableKey());
}
