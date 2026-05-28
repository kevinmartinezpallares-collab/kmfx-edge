import type { TradingAccount } from "@/lib/contracts/account";
import type { WorkspaceState } from "@/lib/contracts/workspace-state";

export function getActiveAccount(workspace: WorkspaceState): TradingAccount | null {
  return (
    workspace.accounts.find(
      (account) => account.id === workspace.activeAccountId,
    ) ?? workspace.accounts[0] ?? null
  );
}

export function getConnectionToneClasses(
  tone: TradingAccount["connectionTone"],
) {
  switch (tone) {
    case "connected":
      return "border-profit/20 bg-profit/10 text-profit";
    case "syncing":
      return "border-info/20 bg-info text-info";
    case "stale":
    case "warning":
      return "border-risk/20 bg-risk text-risk";
    case "danger":
      return "border-loss/20 bg-loss/10 text-loss";
    default:
      return "border-border bg-muted text-muted-foreground";
  }
}

export function getRiskToneClasses(status: "safe" | "caution" | "blocked") {
  switch (status) {
    case "safe":
      return "border-profit/20 bg-profit/10 text-profit";
    case "caution":
      return "border-risk/20 bg-risk text-risk";
    case "blocked":
      return "border-loss/20 bg-loss/10 text-loss";
    default:
      return "border-border bg-muted text-muted-foreground";
  }
}
