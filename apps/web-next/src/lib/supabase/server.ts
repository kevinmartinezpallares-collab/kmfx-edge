import "server-only";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import {
  resolveSupabasePublishableKey,
  resolveSupabaseUrl,
} from "@/lib/supabase/config";

export async function createServerSupabaseClient() {
  const cookieStore = await cookies();
  const url = resolveSupabaseUrl();
  const key = resolveSupabasePublishableKey();

  if (!url || !key) {
    throw new Error("Supabase public config is missing");
  }

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot write cookies; route handlers and proxy can.
        }
      },
    },
  });
}
