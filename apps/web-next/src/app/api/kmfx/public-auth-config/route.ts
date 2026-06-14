import { NextResponse } from "next/server";

import {
  resolveSupabasePublishableKey,
  resolveSupabaseUrl,
} from "@/lib/supabase/config";
import { isBetaInviteRequiredForHost } from "@/lib/auth/beta-invite";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const supabaseUrl = resolveSupabaseUrl();
  const supabasePublishableKey = resolveSupabasePublishableKey();
  const host = request.headers.get("host");

  return NextResponse.json(
    {
      betaInviteRequired: isBetaInviteRequiredForHost(host),
      ok: Boolean(supabaseUrl && supabasePublishableKey),
      supabasePublishableKey,
      supabaseUrl,
      turnstileSiteKey:
        process.env["NEXT_PUBLIC_TURNSTILE_SITE_KEY"]?.trim() ??
        process.env["TURNSTILE_SITE_KEY"]?.trim() ??
        "",
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}
