import type { DownloadArtifact } from "./artifacts";

const artifactOrigin = "https://kmfxedge.com";
const connectorFilename = ["KMFX", "Connector.ex5"].join("");
const riskGuardFilename = ["KMFX", "RiskGuard.ex5"].join("");

export const connectorArtifact = {
  filename: connectorFilename,
  sha256: "0cf1f96a795f34d5d42344a325e9247320deedc522226ac54afbcf6b39d859ac",
  url: `${artifactOrigin}/${connectorFilename}`,
  path: connectorFilename,
  contentType: "application/octet-stream",
} satisfies DownloadArtifact;

export const riskGuardArtifact = {
  filename: riskGuardFilename,
  sha256: "51c81a9596f9cd7dca6eb11a5d836e011006951919a3592e8cd83f29a888b1d6",
  url: `${artifactOrigin}/${riskGuardFilename}`,
  path: riskGuardFilename,
  contentType: "application/octet-stream",
} satisfies DownloadArtifact;

export const eaArtifacts = [connectorArtifact, riskGuardArtifact] as const;
