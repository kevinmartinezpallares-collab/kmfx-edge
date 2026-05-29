import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const configDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(configDir, "../..");

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/[artifact]": ["../../KMFXConnector.ex5"],
    "/downloads/[filename]": [
      "../../downloads/KMFX-Launcher-macOS.zip",
      "../../downloads/KMFX-Launcher-Windows.exe",
    ],
  },
  outputFileTracingRoot: repoRoot,
  turbopack: {
    root: repoRoot,
  },
};

export default nextConfig;
