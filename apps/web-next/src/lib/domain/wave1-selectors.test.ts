import { describe, expect, it } from "vitest";

import { wave1Workspace } from "@/lib/data/wave1-mock";
import {
  getActiveAccount,
  getConnectionToneClasses,
  getRiskToneClasses,
} from "@/lib/domain/wave1-selectors";

describe("wave1 selectors", () => {
  it("resolves the active account with a safe first-account fallback", () => {
    expect(getActiveAccount(wave1Workspace)?.id).toBe("acct-alpha");
    expect(
      getActiveAccount({
        ...wave1Workspace,
        activeAccountId: "missing-account",
      })?.id,
    ).toBe("acct-alpha");
  });

  it("returns null instead of crashing when no accounts are available", () => {
    expect(
      getActiveAccount({
        ...wave1Workspace,
        activeAccountId: "missing-account",
        accounts: [],
      }),
    ).toBeNull();
  });

  it("keeps visual tone class mappings stable", () => {
    expect(getConnectionToneClasses("connected")).toContain("text-profit");
    expect(getConnectionToneClasses("warning")).toContain("text-risk");
    expect(getConnectionToneClasses("danger")).toContain("text-loss");
    expect(getRiskToneClasses("safe")).toContain("text-profit");
    expect(getRiskToneClasses("caution")).toContain("text-risk");
    expect(getRiskToneClasses("blocked")).toContain("text-loss");
  });
});
