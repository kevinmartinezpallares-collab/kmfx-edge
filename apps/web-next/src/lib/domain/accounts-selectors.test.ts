import { describe, expect, it } from "vitest";

import { wave1Workspace } from "@/lib/data/wave1-mock";
import { getAccountsOverview } from "@/lib/domain/accounts-selectors";

describe("getAccountsOverview", () => {
  it("summarises account health and active account context", () => {
    const overview = getAccountsOverview(wave1Workspace);

    expect(overview.status).toBe("partial");
    expect(overview.activeAccount?.id).toBe("acct-alpha");
    expect(overview.totalCount).toBe(3);
    expect(overview.fundedCount).toBe(2);
    expect(overview.limitedCount).toBe(1);
    expect(overview.staleCount).toBe(2);
    expect(overview.attentionCount).toBe(2);
    expect(overview.totalEquity).toBe(139766);
  });

  it("labels account kind without turning portfolio into the accounts page", () => {
    const overview = getAccountsOverview(wave1Workspace);

    expect(overview.rows.map((account) => account.accountKindLabel)).toEqual([
      "Reto prop",
      "Cuenta propia",
      "Fondeo",
    ]);
  });

  it("keeps an empty accounts payload render-safe", () => {
    const overview = getAccountsOverview({
      ...wave1Workspace,
      activeAccountId: "missing",
      accounts: [],
    });

    expect(overview.status).toBe("empty");
    expect(overview.activeAccount).toBeNull();
    expect(overview.totalCount).toBe(0);
    expect(overview.totalEquity).toBe(0);
  });

  it("distinguishes stale sync from partial access problems", () => {
    const staleWorkspace = {
      ...wave1Workspace,
      accounts: wave1Workspace.accounts.map((account) => ({
        ...account,
        planAccess: "active" as const,
        connectionState: "stale" as const,
        connectionTone: "stale" as const,
      })),
    };

    expect(getAccountsOverview(staleWorkspace).status).toBe("stale");
  });
});
