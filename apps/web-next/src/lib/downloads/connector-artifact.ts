import type { DownloadArtifact } from "./artifacts";

const artifactOrigin = "https://kmfxedge.com";
const connectorFilename = ["KMFX", "Connector.ex5"].join("");

export const connectorArtifact = {
  filename: connectorFilename,
  sha256: "0e69a257e07aff98230f21564e098de4bd344137fbb9fcc29e2d093d43f285a8",
  url: `${artifactOrigin}/${connectorFilename}`,
  path: connectorFilename,
  contentType: "application/octet-stream",
} satisfies DownloadArtifact;
