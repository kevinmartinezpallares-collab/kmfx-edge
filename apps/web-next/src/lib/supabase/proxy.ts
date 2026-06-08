import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

import {
  hasSupabasePublicConfig,
  resolveSupabasePublishableKey,
  resolveSupabaseUrl,
} from "@/lib/supabase/config";

type SupabaseSessionResult = {
  accessToken?: string;
  authenticated: boolean;
  configured: boolean;
  response: NextResponse;
  userEmail?: string;
};

export async function updateSupabaseSession(
  request: NextRequest,
): Promise<SupabaseSessionResult> {
  let response = NextResponse.next({ request });

  if (!hasSupabasePublicConfig()) {
    return { authenticated: false, configured: false, response };
  }

  const supabase = createServerClient(
    resolveSupabaseUrl(),
    resolveSupabasePublishableKey(),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const { data, error } = await supabase.auth.getClaims();
  const authenticated = Boolean(data?.claims && !error);
  const session = authenticated ? await supabase.auth.getSession() : null;
  const claims = data?.claims as { email?: unknown } | undefined;
  const claimsEmail = typeof claims?.email === "string" ? claims.email : undefined;

  return {
    accessToken: session?.data.session?.access_token,
    authenticated,
    configured: true,
    response,
    userEmail: claimsEmail || session?.data.session?.user.email || undefined,
  };
}
