export type DownloadArtifact = {
  filename: string;
  sha256: string;
  url: string;
  path: string;
  contentType: string;
};

const artifactOrigin = "https://kmfxedge.com";

export const launcherArtifacts = {
  "KMFX-Launcher-macOS.zip": {
    filename: "KMFX-Launcher-macOS.zip",
    sha256: "e04b9cded8b16a089adbb6d9801db8c2e194baf4bc116810b8b912f497661573",
    url: `${artifactOrigin}/downloads/KMFX-Launcher-macOS.zip`,
    path: "downloads/KMFX-Launcher-macOS.zip",
    contentType: "application/zip",
  },
  "KMFX-Launcher-Windows.exe": {
    filename: "KMFX-Launcher-Windows.exe",
    sha256: "2ed54f02251e55d5dd91c57852414c545148016353fc9fcfbbab6cc79761c01a",
    url: `${artifactOrigin}/downloads/KMFX-Launcher-Windows.exe`,
    path: "downloads/KMFX-Launcher-Windows.exe",
    contentType: "application/vnd.microsoft.portable-executable",
  },
} satisfies Record<string, DownloadArtifact>;
