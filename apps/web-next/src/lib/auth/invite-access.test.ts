import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getInviteCodes,
  isInviteCodeAllowed,
  isInviteOnlySignupEnabled,
  parseInviteCodeList,
} from "@/lib/auth/invite-access";

describe("invite access guards", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllEnvs();
  });

  it("normalizes comma-separated invite codes", () => {
    expect(parseInviteCodeList(" Discord-Beta, VIP-7 ,, ")).toEqual([
      "discord-beta",
      "vip-7",
    ]);
  });

  it("enables invite-only signup when a code or flag is configured", () => {
    expect(isInviteOnlySignupEnabled()).toBe(false);

    vi.stubEnv("KMFX_INVITE_CODES", "discord-beta");
    expect(isInviteOnlySignupEnabled()).toBe(true);

    vi.stubEnv("KMFX_INVITE_CODES", "");
    vi.stubEnv("KMFX_INVITE_ONLY_SIGNUP", "1");
    expect(isInviteOnlySignupEnabled()).toBe(true);
  });

  it("allows only configured codes", () => {
    vi.stubEnv("KMFX_INVITE_CODE", "founders");
    vi.stubEnv("KMFX_INVITE_CODES", "discord-beta, vip");

    expect(getInviteCodes()).toEqual(["discord-beta", "vip", "founders"]);
    expect(isInviteCodeAllowed(" Discord-Beta ")).toBe(true);
    expect(isInviteCodeAllowed("unknown")).toBe(false);
    expect(isInviteCodeAllowed("")).toBe(false);
  });
});
