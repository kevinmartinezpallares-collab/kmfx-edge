import { describe, expect, it } from "vitest";

import { wave1Workspace } from "@/lib/data/wave1-mock";
import {
  getMockAccountById,
  readMockAccountsSource,
} from "@/lib/data/mock-accounts-source";

describe("mock accounts source", () => {
  it("returns typed mock accounts without exposing mutable fixture references", () => {
    const source = readMockAccountsSource();

    expect(source.sourceMode).toBe("mock");
    expect(source.activeAccountId).toBe(wave1Workspace.activeAccountId);
    expect(source.accounts).toHaveLength(wave1Workspace.accounts.length);
    expect(source.accounts[0]).not.toBe(wave1Workspace.accounts[0]);
    expect(source.accounts[0]?.funding).not.toBe(wave1Workspace.accounts[0]?.funding);
  });

  it("looks up a mock account by id and degrades to null", () => {
    const source = readMockAccountsSource();

    expect(getMockAccountById("acct-alpha", source)?.label).toBe("KMFX Alpha");
    expect(getMockAccountById("missing", source)).toBeNull();
  });
});
