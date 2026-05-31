export type DownloadArtifact = {
  filename: string;
  sha256: string;
  url: string;
};

const artifactOrigin = "https://kmfxedge.com";

export const launcherArtifacts = {
  "KMFX-Launcher-macOS.zip": {
    filename: "KMFX-Launcher-macOS.zip",
    sha256: "35b3bd87ee73aea4f70ec26842c192f2eeb359c6f34f0fb2966187d52c27acee",
    url: `${artifactOrigin}/downloads/KMFX-Launcher-macOS.zip`,
  },
  "KMFX-Launcher-Windows.exe": {
    filename: "KMFX-Launcher-Windows.exe",
    sha256: "27f6e33f988c25f4d96d8707de54bfe5521e10bdd2ab7639714f03cbe1b28dff",
    url: `${artifactOrigin}/downloads/KMFX-Launcher-Windows.exe`,
  },
} satisfies Record<string, DownloadArtifact>;
