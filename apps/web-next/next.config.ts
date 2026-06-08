import type { NextConfig } from "next";

function readBuildEnv(...keys: string[]) {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }

  return "";
}

function assertProductionAuthEnv() {
  const isVercelProduction =
    process.env.VERCEL === "1" && process.env.VERCEL_ENV === "production";
  const authMode = readBuildEnv("KMFX_NEXT_AUTH_MODE").toLowerCase();

  if (!isVercelProduction || authMode !== "supabase") {
    return;
  }

  const missing = [
    readBuildEnv("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL")
      ? null
      : "NEXT_PUBLIC_SUPABASE_URL",
    readBuildEnv(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "SUPABASE_PUBLISHABLE_KEY",
      "SUPABASE_ANON_KEY",
    )
      ? null
      : "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new Error(
      `[kmfx] Production Supabase auth env is incomplete: ${missing.join(", ")}`,
    );
  }
}

assertProductionAuthEnv();

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
