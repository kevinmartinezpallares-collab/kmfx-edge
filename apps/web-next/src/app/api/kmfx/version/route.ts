import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function env(name: string) {
  return process.env[name]?.trim() ?? "";
}

export function resolveDeploymentId() {
  return (
    env("VERCEL_DEPLOYMENT_ID") ||
    env("VERCEL_URL") ||
    env("VERCEL_BRANCH_URL") ||
    env("VERCEL_PROJECT_PRODUCTION_URL")
  );
}

export function GET() {
  return NextResponse.json(
    {
      ok: true,
      app: "kmfx-edge-next",
      environment: env("VERCEL_ENV") || env("NODE_ENV"),
      commit: env("VERCEL_GIT_COMMIT_SHA"),
      branch: env("VERCEL_GIT_COMMIT_REF"),
      deploymentId: resolveDeploymentId(),
      region: env("VERCEL_REGION"),
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}
