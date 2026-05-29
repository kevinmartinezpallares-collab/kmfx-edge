import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";

import { downloadHeaders, launcherArtifacts } from "@/lib/downloads/artifacts";

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

  const file = await readFile(artifact.path);

  return new NextResponse(new Uint8Array(file), {
    headers: downloadHeaders(artifact),
  });
}
