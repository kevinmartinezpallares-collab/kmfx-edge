import { NextResponse, type NextRequest } from "next/server";

import { buildKmfxApiUrl } from "@/lib/api/kmfx-api-config";
import { resolveConnectionAccess } from "@/lib/billing/connection-access";
import { isSupabaseAuthEnabled } from "@/lib/supabase/config";
import { updateSupabaseSession } from "@/lib/supabase/proxy";

const BILLING_GUARDED_PREFIXES = [
  "/accounts",
  "/analytics",
  "/calendar",
  "/capital",
  "/dashboard",
  "/debug",
  "/execution",
  "/funding",
  "/journal",
  "/market",
  "/risk",
  "/settings",
  "/strategies",
  "/study",
  "/tools",
  "/trades",
] as const;

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

function isBillingGuardedWorkspaceRoute(pathname: string) {
  if (pathname === "/subscription" || pathname === "/settings/subscription") {
    return false;
  }

  return BILLING_GUARDED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

async function hasBlockedBillingAccess(accessToken: string | undefined) {
  if (!accessToken) return false;

  try {
    const response = await fetch(buildKmfxApiUrl("/api/billing/status"), {
      cache: "no-store",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    });
    const payload = await response.json().catch(() => ({}));
    const access = resolveConnectionAccess(response.ok ? payload : { ok: false });

    return (
      !access.allowed &&
      access.reason !== "auth_required" &&
      access.reason !== "billing_status_unavailable"
    );
  } catch {
    return false;
  }
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

  if (
    session.authenticated &&
    request.nextUrl.searchParams.get("demo") !== "1" &&
    isBillingGuardedWorkspaceRoute(pathname) &&
    await hasBlockedBillingAccess(session.accessToken)
  ) {
    const subscriptionUrl = request.nextUrl.clone();
    subscriptionUrl.pathname = "/subscription";
    subscriptionUrl.search = "";
    subscriptionUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    subscriptionUrl.searchParams.set("welcome", "1");
    return NextResponse.redirect(subscriptionUrl);
  }

  return session.response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|brand|manifest.webmanifest|robots.txt|sitemap.xml).*)",
  ],
};
