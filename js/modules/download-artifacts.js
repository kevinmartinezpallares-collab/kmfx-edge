export const KMFX_DOWNLOAD_ARTIFACTS = Object.freeze({
  launcher: Object.freeze({
    version: "1.0.0",
    macos: Object.freeze({
      label: "macOS",
      file: "KMFX-Launcher-macOS.zip",
      sha256: "4067f62c5638410bb6abc5410dcfaed4346f079885dfa5f633bcd4f7b1bb8810",
    }),
    windows: Object.freeze({
      label: "Windows",
      file: "KMFX-Launcher-Windows.exe",
      sha256: "0ab7cbc7e2262dda5787937b1165ded0d1237c1abbbd992e0acd46817015be74",
    }),
  }),
  connector: Object.freeze({
    version: "2.84",
    label: "EA",
    file: "KMFXConnector.ex5",
    sha256: "cabc679109c674044f592035152c5cf40ea0749b366f31b213a72cf200ee741b",
  }),
});

export function checksumShort(value = "") {
  const normalized = String(value || "").trim();
  if (!normalized) return "sin checksum";
  return `${normalized.slice(0, 10)}...${normalized.slice(-6)}`;
}

export function downloadArtifactSummary() {
  const { launcher, connector } = KMFX_DOWNLOAD_ARTIFACTS;
  return [
    `Launcher v${launcher.version}`,
    `macOS SHA-256 ${checksumShort(launcher.macos.sha256)}`,
    `Windows SHA-256 ${checksumShort(launcher.windows.sha256)}`,
    `EA v${connector.version} SHA-256 ${checksumShort(connector.sha256)}`,
  ];
}

export function downloadChecksumText() {
  const { launcher, connector } = KMFX_DOWNLOAD_ARTIFACTS;
  return [
    `KMFX Launcher v${launcher.version}`,
    `${launcher.macos.file}: ${launcher.macos.sha256}`,
    `${launcher.windows.file}: ${launcher.windows.sha256}`,
    `KMFX Connector v${connector.version}`,
    `${connector.file}: ${connector.sha256}`,
  ].join("\n");
}
