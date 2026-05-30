import { NextResponse, type NextRequest } from "next/server";

import { createServerSupabaseClient } from "@/lib/supabase/server";

function expireAuthCookies(response: NextResponse, request: NextRequest) {
  request.cookies.getAll().forEach((cookie) => {
    if (!cookie.name.startsWith("sb-")) {
      return;
    }

    response.cookies.set(cookie.name, "", {
      maxAge: 0,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
  });
}

export async function POST(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/login", request.url), 303);
  response.headers.set("Cache-Control", "no-store");
  expireAuthCookies(response, request);

  try {
    const supabase = await createServerSupabaseClient();
    await supabase.auth.signOut();
  } catch (error) {
    console.warn("[KMFX][AUTH] signout_failed_redirecting", {
      message: error instanceof Error ? error.message : "unknown_error",
    });
  }

  return response;
}
