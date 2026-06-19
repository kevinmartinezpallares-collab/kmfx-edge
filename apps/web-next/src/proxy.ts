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
  "/analytics",
  "/calendar",
  "/capital",
  "/dashboard",
  "/debug",
  "/execution",
  "/funding",
  "/market",
  "/risk",
  "/settings",
  "/strategies",
  "/study",
  "/tools",
  "/trades",
] as const;

const CANONICAL_PRODUCTION_HOST = "kmfxedge.com";
const LEGACY_PRODUCTION_HOSTS = new Set([
  "beta.kmfxedge.com",
  "dashboard.kmfxedge.com",
  "www.kmfxedge.com",
]);
const BILLING_GUARD_TIMEOUT_MS = 1200;

export function shouldRedirectToCanonicalProductionHost(host: string | null | undefined) {
  const normalizedHost = host?.split(":")[0]?.toLowerCase();
  return Boolean(normalizedHost && LEGACY_PRODUCTION_HOSTS.has(normalizedHost));
}

export function resolveCanonicalHostRedirect(request: NextRequest) {
  const host = request.headers.get("host")?.split(":")[0]?.toLowerCase();
  if (!shouldRedirectToCanonicalProductionHost(host)) return null;

  const url = request.nextUrl.clone();
  url.hostname = CANONICAL_PRODUCTION_HOST;
  url.port = "";
  url.protocol = "https:";
  return NextResponse.redirect(url, 308);
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

function isAuthRoute(pathname: string) {
  return pathname === "/login" || pathname.startsWith("/auth/");
}

function isPublicKmfxRoute(pathname: string) {
  return (
    pathname === "/api/mt5/riskguard/ack" ||
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

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), BILLING_GUARD_TIMEOUT_MS);

  try {
    const response = await fetch(buildKmfxApiUrl("/api/billing/status"), {
      cache: "no-store",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      signal: controller.signal,
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
  } finally {
    clearTimeout(timeout);
  }
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const canonicalRedirect = resolveCanonicalHostRedirect(request);
  if (canonicalRedirect) {
    logProxyEvent("info", "canonical_host_redirect", request, {
      targetHost: CANONICAL_PRODUCTION_HOST,
    });
    return canonicalRedirect;
  }

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

  if (isAuthRoute(pathname)) {
    return NextResponse.next();
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
    "/((?!_next/static|_next/image|_vercel|favicon.ico|brand|manifest.webmanifest|robots.txt|sitemap.xml).*)",
  ],
};
