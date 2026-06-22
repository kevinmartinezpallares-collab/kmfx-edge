import type { TradingAccount } from "@/lib/contracts/account";
import type { WorkspaceState } from "@/lib/contracts/workspace-state";

export type AccountRow = TradingAccount & {
  sharePct: number;
  needsAttention: boolean;
  accountKindLabel: "Fondeo" | "Reto prop" | "Cuenta propia";
};

export type AccountsOverview = {
  status: "ready" | "partial" | "stale" | "empty";
  activeAccount: TradingAccount | null;
  rows: AccountRow[];
  totalCount: number;
  fundedCount: number;
  limitedCount: number;
  staleCount: number;
  attentionCount: number;
  totalEquity: number;
};

export function getAccountRows(workspace: WorkspaceState): AccountRow[] {
  const totalEquity = workspace.accounts.reduce(
    (sum, account) => sum + account.equity,
    0,
  );

  return workspace.accounts.map((account) => {
    const isFunding = Boolean(account.funding);
    const isChallenge = account.funding?.accountMode === "challenge";

    return {
      ...account,
      sharePct: totalEquity > 0 ? (account.equity / totalEquity) * 100 : 0,
      needsAttention:
        account.planAccess === "limited" ||
        account.connectionTone === "stale" ||
        account.connectionTone === "warning" ||
        account.connectionTone === "danger" ||
        Boolean(account.connectorUpdateRequired),
      accountKindLabel: isFunding
        ? isChallenge
          ? "Reto prop"
          : "Fondeo"
        : "Cuenta propia",
    };
  });
}

export function getAccountsOverview(workspace: WorkspaceState): AccountsOverview {
  const rows = getAccountRows(workspace);
  const activeAccount =
    rows.find((account) => account.id === workspace.activeAccountId) ?? rows[0] ?? null;
  const staleCount = rows.filter(
    (account) => account.connectionTone === "stale" || account.connectionTone === "warning",
  ).length;
  const limitedCount = rows.filter((account) => account.planAccess === "limited").length;
  const errorCount = rows.filter((account) => account.connectionState === "error").length;
  const totalCount = rows.length;
  const status =
    totalCount === 0
      ? "empty"
      : errorCount > 0 || limitedCount > 0
        ? "partial"
        : staleCount > 0
          ? "stale"
          : "ready";

  return {
    status,
    activeAccount,
    rows,
    totalCount,
    fundedCount: rows.filter((account) => account.isFunded).length,
    limitedCount,
    staleCount,
    attentionCount: rows.filter((account) => account.needsAttention).length,
    totalEquity: rows.reduce((sum, account) => sum + account.equity, 0),
  };
}
