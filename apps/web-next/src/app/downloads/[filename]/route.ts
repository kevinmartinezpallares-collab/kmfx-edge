import { NextResponse, type NextRequest } from "next/server";

import { requestConnectionAccess } from "@/lib/api/connection-access";
import { launcherArtifacts } from "@/lib/downloads/artifacts";

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
  { params }: { params: Promise<{ filename: string }> },
) {
  const { filename } = await params;
  const artifact = launcherArtifacts[filename as keyof typeof launcherArtifacts];

  if (!artifact) {
    return new NextResponse(null, { status: 404 });
  }

  const access = await requestConnectionAccess();
  if (!access.allowed) {
    return redirectForAccess(request, access.reason);
  }

  return NextResponse.redirect(artifact.url, 302);
}
