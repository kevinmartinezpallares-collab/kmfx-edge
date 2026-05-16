export const KMFX_DOWNLOAD_ARTIFACTS = Object.freeze({
  launcher: Object.freeze({
    version: "1.0.0",
    macos: Object.freeze({
      label: "macOS",
      file: "KMFX-Launcher-macOS.zip",
      sha256: "ab7775e435023473c022e508220bde8fef16139384e827973aea0bfed6a6ad19",
    }),
    windows: Object.freeze({
      label: "Windows",
      file: "KMFX-Launcher-Windows.exe",
      sha256: "39e3e4ecc1616a8567ec78d843ee599084ebd18d01f0d7254be9ddedcab7215c",
    }),
  }),
  connector: Object.freeze({
    version: "2.87",
    label: "EA",
    file: "KMFXConnector.ex5",
    sha256: "31882b1a961245e8c4573c409627afb40137296b15d027e0de88a99ff2b53ebb",
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
