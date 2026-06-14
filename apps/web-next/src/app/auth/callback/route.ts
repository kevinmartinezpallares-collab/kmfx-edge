import { NextResponse, type NextRequest } from "next/server";

import { isAdminEmailAllowed } from "@/lib/auth/admin-access";
import { isBetaInviteRequiredForHost } from "@/lib/auth/beta-invite";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function hasBetaInviteMetadata(userMetadata: Record<string, unknown> | null) {
  return userMetadata?.["kmfx_beta_invited"] === true;
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next") || "/dashboard";

  if (code) {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (
        isBetaInviteRequiredForHost(request.headers.get("host")) &&
        !isAdminEmailAllowed(user?.email || "") &&
        !hasBetaInviteMetadata(user?.user_metadata || null)
      ) {
        await supabase.auth.signOut();
        const loginUrl = new URL("/login", requestUrl.origin);
        loginUrl.searchParams.set("error", "beta_invite_required");
        return NextResponse.redirect(loginUrl);
      }

      return NextResponse.redirect(new URL(next, requestUrl.origin));
    }
  }

  const loginUrl = new URL("/login", requestUrl.origin);
  loginUrl.searchParams.set("error", "auth_callback_failed");
  return NextResponse.redirect(loginUrl);
}
