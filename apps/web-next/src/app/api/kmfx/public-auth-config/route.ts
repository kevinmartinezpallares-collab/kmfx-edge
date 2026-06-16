import { NextResponse } from "next/server";

import { isInviteOnlySignupEnabled } from "@/lib/auth/invite-access";
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
      inviteOnlySignup: isInviteOnlySignupEnabled(),
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
