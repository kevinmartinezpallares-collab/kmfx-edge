import { NextResponse, type NextRequest } from "next/server";

import { buildKmfxApiUrl } from "@/lib/api/kmfx-api-config";
import {
  isAdminEmailAllowed,
  isGeneticLabEnabled,
  isGeneticLabPath,
} from "@/lib/auth/admin-access";
import {
  isMarketingPreviewDemoValue,
  isMarketingPreviewEmail,
} from "@/lib/auth/marketing-preview-access";
import {
  resolveConnectionAccess,
  type ConnectionAccess,
} from "@/lib/billing/connection-access";
import { isSupabaseAuthEnabled } from "@/lib/supabase/config";
import { updateSupabaseSession } from "@/lib/supabase/proxy";

const BILLING_GUARDED_PREFIXES = [
  "/accounts",
  "/ajustes",
  "/analisis",
  "/analytics",
  "/calendar",
  "/calendario",
  "/capital",
  "/cuentas",
  "/dashboard",
  "/debug",
  "/ejecucion",
  "/execution",
  "/estudio",
  "/estrategias",
  "/funding",
  "/herramientas",
  "/insights",
  "/market",
  "/operaciones",
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

function logProxyEvent(
  level: "info" | "warn",
  event: string,
  request: NextRequest,
  fields: Record<string, unknown> = {},
) {
  const payload = JSON.stringify({
    event,
    level,
    path: request.nextUrl.pathname,
    requestId: request.headers.get("x-vercel-id") || undefined,
    service: "kmfx-next",
    ...fields,
  });

  if (level === "warn") {
    console.warn(payload);
  } else {
    console.log(payload);
  }
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

function isPublicKmfxRoute(pathname: string) {
  return (
    pathname === "/api/kmfx/beta-invite" ||
    pathname === "/api/kmfx/public-auth-config" ||
    pathname === "/api/kmfx/version"
  );
}

function isBillingGuardedWorkspaceRoute(pathname: string) {
  if (pathname === "/subscription" || pathname === "/settings/subscription") {
    return false;
  }

  return BILLING_GUARDED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function subscriptionAccessReasonSearchValue(access: ConnectionAccess) {
  if (access.reason === "billing_past_due") return "billing-attention";
  if (access.reason === "billing_required") return "trial-expired";
  if (access.reason === "entitlement_required") return "plan-required";
  if (access.reason === "plan_limit_reached") return "plan-limit";

  return "plan-required";
}

function hasExplicitDemoMode(request: NextRequest) {
  return Boolean(request.nextUrl.searchParams.get("demo"));
}

async function resolveBlockedBillingAccess(accessToken: string | undefined) {
  if (!accessToken) return null;

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

    const blocked =
      !access.allowed &&
      access.reason !== "auth_required" &&
      access.reason !== "billing_status_unavailable";

    return blocked ? access : null;
  } catch (error) {
    console.warn(
      JSON.stringify({
        event: "billing_guard_status_failed",
        level: "warn",
        reason: error instanceof Error ? error.message : "billing_status_failed",
        service: "kmfx-next",
      }),
    );
    return null;
  }
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (isPublicKmfxRoute(pathname)) {
    return NextResponse.next();
  }

  if (
    pathname.startsWith("/debug") &&
    process.env.KMFX_ENABLE_DEBUG_ROUTE !== "1"
  ) {
    logProxyEvent("warn", "debug_route_blocked", request);
    return new NextResponse(null, { status: 404 });
  }

  if (isGeneticLabPath(pathname) && !isGeneticLabEnabled()) {
    logProxyEvent("warn", "internal_route_disabled", request);
    return new NextResponse(null, { status: 404 });
  }

  if (betaGateEnabled() && !hasBetaAccess(request)) {
    logProxyEvent("warn", "beta_gate_blocked", request);
    return unauthorized();
  }

  if (!isSupabaseAuthEnabled()) {
    if (isGeneticLabPath(pathname)) {
      logProxyEvent("warn", "internal_route_auth_unconfigured", request);
      return new NextResponse(null, { status: 404 });
    }

    return NextResponse.next();
  }

  const session = await updateSupabaseSession(request);

  if (isGeneticLabPath(pathname)) {
    if (
      !session.configured ||
      !session.authenticated ||
      !isAdminEmailAllowed(session.userEmail)
    ) {
      logProxyEvent("warn", "internal_route_admin_blocked", request, {
        authenticated: session.authenticated,
        configured: session.configured,
      });
      return new NextResponse(null, { status: 404 });
    }
  }

  if (!session.configured) {
    return session.response;
  }

  if (!session.authenticated && !isAuthRoute(pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    logProxyEvent("info", "auth_redirect_login", request);
    return NextResponse.redirect(loginUrl);
  }

  if (session.authenticated && pathname === "/login") {
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = "/dashboard";
    dashboardUrl.search = "";
    logProxyEvent("info", "auth_redirect_dashboard", request);
    return NextResponse.redirect(dashboardUrl);
  }

  if (
    session.authenticated &&
    isMarketingPreviewEmail(session.userEmail) &&
    isBillingGuardedWorkspaceRoute(pathname) &&
    !hasExplicitDemoMode(request)
  ) {
    const marketingUrl = request.nextUrl.clone();
    marketingUrl.searchParams.set("demo", "marketing");
    logProxyEvent("info", "marketing_preview_redirect", request);
    return NextResponse.redirect(marketingUrl);
  }

  const blockedBillingAccess =
    session.authenticated &&
    request.nextUrl.searchParams.get("demo") !== "1" &&
    !isMarketingPreviewDemoValue(request.nextUrl.searchParams.get("demo")) &&
    !isMarketingPreviewEmail(session.userEmail) &&
    isBillingGuardedWorkspaceRoute(pathname)
      ? await resolveBlockedBillingAccess(session.accessToken)
      : null;

  if (blockedBillingAccess) {
    const subscriptionUrl = request.nextUrl.clone();
    subscriptionUrl.pathname = "/subscription";
    subscriptionUrl.search = "";
    subscriptionUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    subscriptionUrl.searchParams.set("welcome", "1");
    subscriptionUrl.searchParams.set(
      "access",
      subscriptionAccessReasonSearchValue(blockedBillingAccess),
    );
    logProxyEvent("warn", "billing_guard_redirect", request, {
      reason: blockedBillingAccess.reason,
      status: blockedBillingAccess.status,
    });
    return NextResponse.redirect(subscriptionUrl);
  }

  return session.response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|brand|manifest.webmanifest|robots.txt|sitemap.xml).*)",
  ],
};
