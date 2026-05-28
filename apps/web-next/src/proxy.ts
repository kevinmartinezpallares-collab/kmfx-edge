import { NextResponse, type NextRequest } from "next/server";

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

export function proxy(request: NextRequest) {
  if (
    request.nextUrl.pathname.startsWith("/debug") &&
    process.env.KMFX_ENABLE_DEBUG_ROUTE !== "1"
  ) {
    return new NextResponse(null, { status: 404 });
  }

  if (betaGateEnabled() && !hasBetaAccess(request)) {
    return unauthorized();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|brand|manifest.webmanifest|robots.txt|sitemap.xml).*)",
  ],
};
