import { afterEach, describe, expect, it, vi } from "vitest";

import {
  isBetaInviteHost,
  isBetaInviteRequiredForHost,
} from "@/lib/auth/beta-invite";

describe("beta invite host policy", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllEnvs();
  });

  it("keeps invitation gating on the production app domain", () => {
    expect(isBetaInviteHost("kmfxedge.com")).toBe(true);
    expect(isBetaInviteHost("www.kmfxedge.com")).toBe(true);
    expect(isBetaInviteRequiredForHost("kmfxedge.com")).toBe(true);
  });

  it("does not treat beta.kmfxedge.com as an app entrypoint", () => {
    expect(isBetaInviteHost("beta.kmfxedge.com")).toBe(false);
    expect(isBetaInviteRequiredForHost("beta.kmfxedge.com")).toBe(false);
  });

  it("allows an explicit env override for invite-only signup", () => {
    vi.stubEnv("KMFX_INVITE_ONLY_SIGNUP", "1");
    expect(isBetaInviteRequiredForHost("beta.kmfxedge.com")).toBe(true);
  });
});
