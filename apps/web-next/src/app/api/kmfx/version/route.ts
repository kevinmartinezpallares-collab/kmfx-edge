import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function env(name: string) {
  return process.env[name]?.trim() ?? "";
}

export function GET() {
  return NextResponse.json(
    {
      ok: true,
      app: "kmfx-edge-next",
      environment: env("VERCEL_ENV") || env("NODE_ENV"),
      commit: env("VERCEL_GIT_COMMIT_SHA"),
      branch: env("VERCEL_GIT_COMMIT_REF"),
      deploymentId: env("VERCEL_DEPLOYMENT_ID"),
      region: env("VERCEL_REGION"),
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}
