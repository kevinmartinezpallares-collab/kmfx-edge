import { describe, expect, it } from "vitest";

import { resolveConnectionAccess } from "@/lib/billing/connection-access";

describe("resolveConnectionAccess", () => {
  it("blocks anonymous users", () => {
    expect(resolveConnectionAccess({ auth_required: true })).toMatchObject({
      allowed: false,
      reason: "auth_required",
      status: 401,
    });
  });

  it("blocks users without launcher entitlement", () => {
    expect(
      resolveConnectionAccess({
        ok: true,
        billing: { access: "free" },
        entitlements: { launcherConnection: false },
        limits: { liveMt5Accounts: 0 },
      }),
    ).toMatchObject({
      allowed: false,
      reason: "entitlement_required",
      status: 403,
    });
  });

  it("blocks plans without live account capacity", () => {
    expect(
      resolveConnectionAccess({
        ok: true,
        billing: { access: "active" },
        entitlements: { launcherConnection: true },
        limits: { connectionKeyLimit: 0 },
      }),
    ).toMatchObject({
      allowed: false,
      reason: "plan_limit_reached",
      status: 403,
    });
  });

  it("allows active users with launcher entitlement and account capacity", () => {
    expect(
      resolveConnectionAccess({
        ok: true,
        billing: { access: "active" },
        entitlements: { launcherConnection: true },
        limits: { connectionKeyLimit: 2 },
      }),
    ).toMatchObject({
      allowed: true,
      reason: "allowed",
      status: 200,
    });
  });
});
