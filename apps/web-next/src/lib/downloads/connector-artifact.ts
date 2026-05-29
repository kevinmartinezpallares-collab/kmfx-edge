import type { DownloadArtifact } from "./artifacts";

const artifactOrigin = "https://kmfxedge.com";
const connectorFilename = ["KMFX", "Connector.ex5"].join("");

export const connectorArtifact = {
  filename: connectorFilename,
  sha256: "1ea07f5a5ff94dbde8bcc0b3c49d620922d5103318842d7ae18ef7c010ea9ddb",
  url: `${artifactOrigin}/${connectorFilename}`,
} satisfies DownloadArtifact;
