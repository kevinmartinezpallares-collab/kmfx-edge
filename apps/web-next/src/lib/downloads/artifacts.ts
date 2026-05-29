import path from "node:path";

export type DownloadArtifact = {
  contentType: string;
  filename: string;
  path: string;
  sha256: string;
};

const repoRoot = path.resolve(/* turbopackIgnore: true */ process.cwd(), "../..");

export const launcherArtifacts = {
  "KMFX-Launcher-macOS.zip": {
    contentType: "application/zip",
    filename: "KMFX-Launcher-macOS.zip",
    path: path.join(repoRoot, "downloads/KMFX-Launcher-macOS.zip"),
    sha256: "32f7a29bcbde1adc828a25e66d3e5254ac8bb1919b641b29350216686393f512",
  },
  "KMFX-Launcher-Windows.exe": {
    contentType: "application/vnd.microsoft.portable-executable",
    filename: "KMFX-Launcher-Windows.exe",
    path: path.join(repoRoot, "downloads/KMFX-Launcher-Windows.exe"),
    sha256: "969562faf60e38271220142311b8d3a510e099926536534546f05af17d759183",
  },
} satisfies Record<string, DownloadArtifact>;

export function downloadHeaders(artifact: DownloadArtifact) {
  return {
    "Cache-Control": "private, max-age=3600",
    "Content-Disposition": `attachment; filename="${artifact.filename}"`,
    "Content-Type": artifact.contentType,
    "X-Content-Type-Options": "nosniff",
    "X-KMFX-Artifact-SHA256": artifact.sha256,
  };
}
