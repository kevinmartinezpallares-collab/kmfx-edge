import { describe, expect, it } from "vitest";

import { config, shouldRedirectToCanonicalProductionHost } from "@/proxy";

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

describe("proxy matcher", () => {
  it("leaves Vercel analytics assets outside auth redirects", () => {
    const matcher = new RegExp(`^${config.matcher[0]}$`);

    expect(matcher.test("/_vercel/insights/script.js")).toBe(false);
    expect(matcher.test("/dashboard")).toBe(true);
  });
});
