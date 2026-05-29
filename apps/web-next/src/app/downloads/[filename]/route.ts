import { NextResponse } from "next/server";

import { launcherArtifacts } from "@/lib/downloads/artifacts";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ filename: string }> },
) {
  const { filename } = await params;
  const artifact = launcherArtifacts[filename as keyof typeof launcherArtifacts];

  if (!artifact) {
    return new NextResponse(null, { status: 404 });
  }

  return NextResponse.redirect(artifact.url, 302);
}
