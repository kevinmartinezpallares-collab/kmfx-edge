import { NextResponse } from "next/server";

import { connectorArtifact } from "@/lib/downloads/connector-artifact";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ artifact: string }> },
) {
  const { artifact } = await params;

  if (artifact !== connectorArtifact.filename) {
    return new NextResponse(null, { status: 404 });
  }

  return NextResponse.redirect(connectorArtifact.url, 302);
}
