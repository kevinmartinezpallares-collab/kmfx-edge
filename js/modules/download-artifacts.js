export const KMFX_DOWNLOAD_ARTIFACTS = Object.freeze({
  launcher: Object.freeze({
    version: "1.0.0",
    macos: Object.freeze({
      label: "macOS",
      file: "KMFX-Launcher-macOS.zip",
      sha256: "a28b4c8e90935a66ff9107d7f945c2c1dd9093aeaa169de4f8f48044daae6ed7",
    }),
    windows: Object.freeze({
      label: "Windows",
      file: "KMFX-Launcher-Windows.exe",
      sha256: "afd43ec54158e8dc41e0fd315a0a1c9e2a4aca3f1aed58c6c058c0d5ad4139b0",
    }),
  }),
  connector: Object.freeze({
    version: "2.89",
    label: "EA",
    file: "KMFXConnector.ex5",
    sha256: "ebe356001888111bf45404fa3fefa44df6d8960a6c7d42725eac31b177ae754b",
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
