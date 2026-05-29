import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";

import { downloadHeaders } from "@/lib/downloads/artifacts";
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

  const file = await readFile(connectorArtifact.path);

  return new NextResponse(new Uint8Array(file), {
    headers: downloadHeaders(connectorArtifact),
  });
}
