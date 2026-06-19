import { afterEach, describe, expect, it } from "vitest";

import { resolveDeploymentId } from "@/app/api/kmfx/version/route";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("kmfx version route", () => {
  it("prefers the dedicated Vercel deployment id when available", () => {
    process.env.VERCEL_DEPLOYMENT_ID = "dpl_123";
    process.env.VERCEL_URL = "beta-kmfxedge.vercel.app";

    expect(resolveDeploymentId()).toBe("dpl_123");
  });

  it("falls back to other Vercel deployment identifiers when needed", () => {
    delete process.env.VERCEL_DEPLOYMENT_ID;
    process.env.VERCEL_URL = "beta-kmfxedge.vercel.app";

    expect(resolveDeploymentId()).toBe("beta-kmfxedge.vercel.app");

    delete process.env.VERCEL_URL;
    process.env.VERCEL_BRANCH_URL = "beta-branch.kmfxedge.com";

    expect(resolveDeploymentId()).toBe("beta-branch.kmfxedge.com");
  });
});
