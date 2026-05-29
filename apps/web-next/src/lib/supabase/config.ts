export function isSupabaseAuthEnabled() {
  return String(process.env.KMFX_NEXT_AUTH_MODE || "")
    .trim()
    .toLowerCase() === "supabase";
}

export function resolveSupabaseUrl() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
}

export function resolveSupabasePublishableKey() {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    ""
  );
}

export function hasSupabasePublicConfig() {
  return Boolean(resolveSupabaseUrl() && resolveSupabasePublishableKey());
}
