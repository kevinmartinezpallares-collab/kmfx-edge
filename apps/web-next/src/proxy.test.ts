import { describe, expect, it } from "vitest";

import { shouldRedirectToCanonicalProductionHost } from "@/proxy";

describe("proxy canonical host redirect", () => {
  it("redirects legacy production hosts to the canonical production host", () => {
    expect(shouldRedirectToCanonicalProductionHost("beta.kmfxedge.com")).toBe(true);
    expect(shouldRedirectToCanonicalProductionHost("dashboard.kmfxedge.com")).toBe(true);
    expect(shouldRedirectToCanonicalProductionHost("www.kmfxedge.com")).toBe(true);
    expect(shouldRedirectToCanonicalProductionHost("dashboard.kmfxedge.com:443")).toBe(true);
  });

  it("keeps the canonical and unknown hosts unchanged", () => {
    expect(shouldRedirectToCanonicalProductionHost("kmfxedge.com")).toBe(false);
    expect(shouldRedirectToCanonicalProductionHost(null)).toBe(false);
  });
});
