import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

import {
  hasSupabasePublicConfig,
  resolveSupabasePublishableKey,
  resolveSupabaseUrl,
} from "@/lib/supabase/config";

type SupabaseSessionResult = {
  authenticated: boolean;
  configured: boolean;
  response: NextResponse;
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

  return {
    authenticated: Boolean(data?.claims && !error),
    configured: true,
    response,
  };
}
