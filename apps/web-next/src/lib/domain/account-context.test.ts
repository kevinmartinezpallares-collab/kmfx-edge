import { describe, expect, it } from "vitest";

import { wave1Workspace } from "@/lib/data/wave1-mock";
import { getAccountContextOverview } from "@/lib/domain/account-context";

describe("account context overview", () => {
  it("builds active account context and switcher options", () => {
    const overview = getAccountContextOverview(wave1Workspace);

    expect(overview.activeAccountId).toBe("acct-alpha");
    expect(overview.activeLabel).toBe("KMFX Alpha");
    expect(overview.activeSubtitle).toContain("IC Markets");
    expect(overview.activeInitials).toBe("IM");
    expect(overview.canSwitchAccounts).toBe(true);
    expect(overview.options).toHaveLength(wave1Workspace.accounts.length);
    expect(overview.options[0]).toMatchObject({
      id: "acct-alpha",
      isActive: true,
      status: { label: "Conectada", tone: "ok" },
    });
  });

  it("falls back safely when the active account id is missing", () => {
    const overview = getAccountContextOverview({
      ...wave1Workspace,
      activeAccountId: "missing",
    });

    expect(overview.activeAccountId).toBe("acct-alpha");
    expect(overview.fallbackApplied).toBe(true);
    expect(overview.options.filter((option) => option.isActive)).toHaveLength(1);
  });

  it("degrades without accounts", () => {
    const overview = getAccountContextOverview({
      activeAccountId: "missing",
      accounts: [],
    });

    expect(overview.activeAccount).toBeNull();
    expect(overview.activeLabel).toBe("Sin cuenta conectada");
    expect(overview.activeInitials).toBe("KM");
    expect(overview.canSwitchAccounts).toBe(false);
  });
});
