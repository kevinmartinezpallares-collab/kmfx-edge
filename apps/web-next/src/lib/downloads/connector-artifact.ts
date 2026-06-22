import type { DownloadArtifact } from "./artifacts";

const artifactOrigin = "https://kmfxedge.com";
const connectorFilename = ["KMFX", "Connector.ex5"].join("");

export const connectorArtifact = {
  filename: connectorFilename,
  sha256: "0cf1f96a795f34d5d42344a325e9247320deedc522226ac54afbcf6b39d859ac",
  url: `${artifactOrigin}/${connectorFilename}`,
  path: connectorFilename,
  contentType: "application/octet-stream",
} satisfies DownloadArtifact;
