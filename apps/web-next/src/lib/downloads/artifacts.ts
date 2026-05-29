export type DownloadArtifact = {
  filename: string;
  sha256: string;
  url: string;
};

const artifactOrigin = "https://kmfxedge.com";

export const launcherArtifacts = {
  "KMFX-Launcher-macOS.zip": {
    filename: "KMFX-Launcher-macOS.zip",
    sha256: "32f7a29bcbde1adc828a25e66d3e5254ac8bb1919b641b29350216686393f512",
    url: `${artifactOrigin}/downloads/KMFX-Launcher-macOS.zip`,
  },
  "KMFX-Launcher-Windows.exe": {
    filename: "KMFX-Launcher-Windows.exe",
    sha256: "969562faf60e38271220142311b8d3a510e099926536534546f05af17d759183",
    url: `${artifactOrigin}/downloads/KMFX-Launcher-Windows.exe`,
  },
} satisfies Record<string, DownloadArtifact>;
