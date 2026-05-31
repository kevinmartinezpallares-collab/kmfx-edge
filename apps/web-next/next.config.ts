import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: import.meta.dirname,
  },
  outputFileTracingIncludes: {
    "/[artifact]": ["./private-downloads/KMFXConnector.ex5"],
    "/downloads/[filename]": ["./private-downloads/downloads/*"],
  },
};

export default nextConfig;
