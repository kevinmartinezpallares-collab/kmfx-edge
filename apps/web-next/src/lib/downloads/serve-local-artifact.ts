import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

import { NextResponse } from "next/server";

import type { DownloadArtifact } from "./artifacts";

const DOWNLOAD_ROOT = path.join(process.cwd(), "private-downloads");

function quotedFilename(filename: string) {
  return filename.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

export async function serveLocalDownloadArtifact(artifact: DownloadArtifact) {
  const artifactPath = path.join(DOWNLOAD_ROOT, artifact.path);
  const relativePath = path.relative(DOWNLOAD_ROOT, artifactPath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return new NextResponse(null, { status: 404 });
  }

  try {
    const file = await stat(artifactPath);
    const stream = Readable.toWeb(createReadStream(artifactPath));

    return new NextResponse(stream as ReadableStream<Uint8Array>, {
      status: 200,
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="${quotedFilename(artifact.filename)}"`,
        "Content-Length": String(file.size),
        "Content-Type": artifact.contentType,
        "X-KMFX-Artifact-SHA256": artifact.sha256,
      },
    });
  } catch {
    return NextResponse.json({ ok: false, error: "artifact_unavailable" }, { status: 503 });
  }
}
