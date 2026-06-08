"use client";

import { createBrowserClient } from "@supabase/ssr";

import {
  resolveSupabasePublishableKey,
  resolveSupabaseUrl,
} from "@/lib/supabase/config";

export type BrowserSupabasePublicConfig = {
  supabasePublishableKey: string;
  supabaseUrl: string;
};

export function createBrowserSupabaseClient(config?: BrowserSupabasePublicConfig) {
  const url = config?.supabaseUrl?.trim() || resolveSupabaseUrl();
  const key =
    config?.supabasePublishableKey?.trim() || resolveSupabasePublishableKey();

  if (!url || !key) {
    throw new Error("Supabase public config is missing");
  }

  return createBrowserClient(url, key);
}
