import { NextResponse, type NextRequest } from "next/server";

import { isSupabaseAuthEnabled } from "@/lib/supabase/config";
import { updateSupabaseSession } from "@/lib/supabase/proxy";

function betaGateEnabled() {
  return Boolean(process.env.KMFX_BETA_GATE_PASSWORD?.trim());
}

function unauthorized() {
  return new NextResponse("Beta privada", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="KMFX Edge Beta", charset="UTF-8"',
      "Cache-Control": "no-store",
    },
  });
}

function hasBetaAccess(request: NextRequest) {
  const expectedPassword = process.env.KMFX_BETA_GATE_PASSWORD?.trim();
  if (!expectedPassword) return true;

  const expectedUsername = process.env.KMFX_BETA_GATE_USERNAME?.trim() || "kmfx";
  const header = request.headers.get("authorization") || "";
  const [scheme, encoded] = header.split(" ");
  if (scheme?.toLowerCase() !== "basic" || !encoded) return false;

  try {
    const decoded = atob(encoded);
    const separatorIndex = decoded.indexOf(":");
    if (separatorIndex < 0) return false;

    const username = decoded.slice(0, separatorIndex);
    const password = decoded.slice(separatorIndex + 1);
    return username === expectedUsername && password === expectedPassword;
  } catch {
    return false;
  }
}

function isAuthRoute(pathname: string) {
  return pathname === "/login" || pathname.startsWith("/auth/");
}

export async function proxy(request: NextRequest) {
  if (
    request.nextUrl.pathname.startsWith("/debug") &&
    process.env.KMFX_ENABLE_DEBUG_ROUTE !== "1"
  ) {
    return new NextResponse(null, { status: 404 });
  }

  if (betaGateEnabled() && !hasBetaAccess(request)) {
    return unauthorized();
  }

  if (!isSupabaseAuthEnabled()) {
    return NextResponse.next();
  }

  const session = await updateSupabaseSession(request);
  const pathname = request.nextUrl.pathname;

  if (!session.configured) {
    return session.response;
  }

  if (!session.authenticated && !isAuthRoute(pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }

  if (session.authenticated && pathname === "/login") {
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = "/dashboard";
    dashboardUrl.search = "";
    return NextResponse.redirect(dashboardUrl);
  }

  return session.response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|brand|manifest.webmanifest|robots.txt|sitemap.xml).*)",
  ],
};
