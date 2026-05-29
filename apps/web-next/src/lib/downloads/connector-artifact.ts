import path from "node:path";

import type { DownloadArtifact } from "./artifacts";

const repoRoot = path.resolve(/* turbopackIgnore: true */ process.cwd(), "../..");
const connectorFilename = ["KMFX", "Connector.ex5"].join("");

export const connectorArtifact = {
  contentType: "application/octet-stream",
  filename: connectorFilename,
  path: path.join(/* turbopackIgnore: true */ repoRoot, connectorFilename),
  sha256: "1ea07f5a5ff94dbde8bcc0b3c49d620922d5103318842d7ae18ef7c010ea9ddb",
} satisfies DownloadArtifact;
