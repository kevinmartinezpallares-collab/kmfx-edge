const SUPABASE_STUB = `
export function createClient() {
  if (globalThis.__kmfxSupabaseClient) {
    return globalThis.__kmfxSupabaseClient;
  }
  return {
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signInWithOAuth: async () => ({ data: {}, error: null }),
      signOut: async () => ({ error: null })
    }
  };
}
`;

export async function resolve(specifier, context, defaultResolve) {
  if (specifier.startsWith("https://esm.sh/@supabase/supabase-js")) {
    return {
      url: `data:text/javascript,${encodeURIComponent(SUPABASE_STUB)}`,
      shortCircuit: true,
    };
  }

  return defaultResolve(specifier, context, defaultResolve);
}
