import { NextResponse } from "next/server";

import {
  resolveSupabasePublishableKey,
  resolveSupabaseUrl,
} from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

export function GET() {
  const supabaseUrl = resolveSupabaseUrl();
  const supabasePublishableKey = resolveSupabasePublishableKey();

  return NextResponse.json(
    {
      ok: Boolean(supabaseUrl && supabasePublishableKey),
      supabasePublishableKey,
      supabaseUrl,
      turnstileSiteKey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() ?? "",
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}
