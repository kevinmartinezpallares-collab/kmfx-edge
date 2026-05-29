"use client";

import { createBrowserClient } from "@supabase/ssr";

import {
  resolveSupabasePublishableKey,
  resolveSupabaseUrl,
} from "@/lib/supabase/config";

export function createBrowserSupabaseClient() {
  const url = resolveSupabaseUrl();
  const key = resolveSupabasePublishableKey();

  if (!url || !key) {
    throw new Error("Supabase public config is missing");
  }

  return createBrowserClient(url, key);
}
