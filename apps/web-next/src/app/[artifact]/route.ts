import { NextResponse, type NextRequest } from "next/server";

import { requestConnectionAccess } from "@/lib/api/connection-access";
import { connectorArtifact } from "@/lib/downloads/connector-artifact";
import { serveLocalDownloadArtifact } from "@/lib/downloads/serve-local-artifact";

export const runtime = "nodejs";

function redirectForAccess(request: NextRequest, reason: string) {
  const target =
    reason === "auth_required"
      ? new URL("/login", request.url)
      : new URL("/subscription", request.url);

  if (reason === "auth_required") {
    target.searchParams.set("next", request.nextUrl.pathname);
  } else {
    target.searchParams.set("reason", reason);
  }

  return NextResponse.redirect(target, 302);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ artifact: string }> },
) {
  const { artifact } = await params;

  if (artifact !== connectorArtifact.filename) {
    return new NextResponse(null, { status: 404 });
  }

  const access = await requestConnectionAccess();
  if (!access.allowed) {
    return redirectForAccess(request, access.reason);
  }

  return serveLocalDownloadArtifact(connectorArtifact);
}
