import type { TradingAccount } from "@/lib/contracts/account";
import type { WorkspaceState } from "@/lib/contracts/workspace-state";
import { wave1Workspace } from "@/lib/data/wave1-mock";

export type MockAccountsSource = {
  sourceMode: "mock";
  activeAccountId: string;
  accounts: TradingAccount[];
};

function cloneTradingAccount(account: TradingAccount): TradingAccount {
  return {
    ...account,
    funding: account.funding ? { ...account.funding } : undefined,
  };
}

export function readMockAccountsSource(
  workspace: Pick<WorkspaceState, "activeAccountId" | "accounts"> = wave1Workspace,
): MockAccountsSource {
  return {
    sourceMode: "mock",
    activeAccountId: workspace.activeAccountId,
    accounts: workspace.accounts.map(cloneTradingAccount),
  };
}

export function getMockAccountById(
  accountId: string,
  source: MockAccountsSource = readMockAccountsSource(),
): TradingAccount | null {
  return source.accounts.find((account) => account.id === accountId) ?? null;
}
