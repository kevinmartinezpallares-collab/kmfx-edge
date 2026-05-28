import type { TradingAccount } from "@/lib/contracts/account";
import type { WorkspaceState } from "@/lib/contracts/workspace-state";
import { getConnectionStatusMeta, type StatusMeta } from "@/lib/domain/status-meta";

export type AccountSwitcherOption = {
  id: string;
  label: string;
  broker: string;
  server: string;
  login: string;
  isActive: boolean;
  isConnected: boolean;
  status: StatusMeta;
};

export type AccountContextOverview = {
  activeAccount: TradingAccount | null;
  activeAccountId: string | null;
  activeLabel: string;
  activeSubtitle: string;
  activeInitials: string;
  fallbackApplied: boolean;
  options: AccountSwitcherOption[];
  canSwitchAccounts: boolean;
  connectedCount: number;
  staleCount: number;
  planLimitedCount: number;
};

function getAccountInitials(account: TradingAccount | null) {
  if (!account) return "KM";

  const source = account.broker || account.label || "KMFX";
  return source
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "KM";
}

function buildAccountOption(
  account: TradingAccount,
  activeAccountId: string | null,
): AccountSwitcherOption {
  return {
    id: account.id,
    label: account.label,
    broker: account.broker,
    server: account.server,
    login: account.login,
    isActive: account.id === activeAccountId,
    isConnected: account.connectionState === "connected",
    status: getConnectionStatusMeta(account),
  };
}

export function getAccountContextOverview(
  workspace: Pick<WorkspaceState, "activeAccountId" | "accounts">,
): AccountContextOverview {
  const activeAccount =
    workspace.accounts.find((account) => account.id === workspace.activeAccountId) ??
    workspace.accounts[0] ??
    null;
  const activeAccountId = activeAccount?.id ?? null;
  const options = workspace.accounts.map((account) =>
    buildAccountOption(account, activeAccountId),
  );

  return {
    activeAccount,
    activeAccountId,
    activeLabel: activeAccount?.label ?? "Sin cuenta conectada",
    activeSubtitle: activeAccount
      ? `${activeAccount.broker} / ${activeAccount.server}`
      : "Conecta una cuenta para operar",
    activeInitials: getAccountInitials(activeAccount),
    fallbackApplied: Boolean(
      workspace.activeAccountId &&
        activeAccount &&
        activeAccount.id !== workspace.activeAccountId,
    ),
    options,
    canSwitchAccounts: options.length > 1,
    connectedCount: workspace.accounts.filter(
      (account) => account.connectionState === "connected",
    ).length,
    staleCount: workspace.accounts.filter((account) => account.connectionState === "stale")
      .length,
    planLimitedCount: workspace.accounts.filter(
      (account) => account.connectionState === "plan_limited",
    ).length,
  };
}
