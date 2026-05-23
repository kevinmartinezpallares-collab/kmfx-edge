export const KMFX_DOWNLOAD_ARTIFACTS = Object.freeze({
  launcher: Object.freeze({
    version: "1.0.1",
    macos: Object.freeze({
      label: "macOS",
      file: "KMFX-Launcher-macOS.zip",
      sha256: "32f7a29bcbde1adc828a25e66d3e5254ac8bb1919b641b29350216686393f512",
    }),
    windows: Object.freeze({
      label: "Windows",
      file: "KMFX-Launcher-Windows.exe",
      sha256: "969562faf60e38271220142311b8d3a510e099926536534546f05af17d759183",
    }),
  }),
  connector: Object.freeze({
    version: "2.89",
    label: "EA",
    file: "KMFXConnector.ex5",
    sha256: "75a9af16721b90f04bc51f1443c0355a0e01dccc379a2f866b83a903ccc5c428",
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
