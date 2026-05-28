import type { TradingAccount } from "@/lib/contracts/account";
import type { RiskSnapshot, RiskStatus } from "@/lib/contracts/risk";
import type { WorkspaceState } from "@/lib/contracts/workspace-state";

export type StatusTone = "ok" | "info" | "warn" | "error" | "neutral";

export type StatusMeta = {
  label: string;
  tone: StatusTone;
};

const connectionStateMeta: Record<TradingAccount["connectionState"], StatusMeta> = {
  connected: { label: "Conectada", tone: "ok" },
  syncing: { label: "Sincronizando", tone: "info" },
  stale: { label: "Desactualizada", tone: "warn" },
  pending: { label: "Pendiente", tone: "neutral" },
  plan_limited: { label: "Plan limitado", tone: "warn" },
  error: { label: "Error de conexión", tone: "error" },
};

const riskStatusMeta: Record<RiskStatus, StatusMeta> = {
  safe: { label: "Riesgo controlado", tone: "ok" },
  caution: { label: "Riesgo en vigilancia", tone: "warn" },
  blocked: { label: "Operativa bloqueada", tone: "error" },
};

export function getConnectionStatusMeta(
  account: Pick<TradingAccount, "connectionState"> | null | undefined,
): StatusMeta {
  if (!account) return { label: "Sin cuenta", tone: "neutral" };

  return connectionStateMeta[account.connectionState] ?? {
    label: "Estado pendiente",
    tone: "neutral",
  };
}

export function getRiskStatusMeta(
  risk: Pick<RiskSnapshot, "status" | "allowNewTrades" | "blockingRule"> | null | undefined,
): StatusMeta {
  if (!risk) return { label: "Sin lectura de riesgo", tone: "neutral" };
  if (!risk.allowNewTrades || risk.status === "blocked") {
    return { label: "Operativa bloqueada", tone: "error" };
  }

  return riskStatusMeta[risk.status] ?? { label: "Riesgo pendiente", tone: "neutral" };
}

export function getFundingStatusMeta(
  funding: TradingAccount["funding"] | null | undefined,
): StatusMeta {
  if (!funding) return { label: "Sin fondeo", tone: "neutral" };
  if (!funding.allowNewTrades || funding.status === "blocked") {
    return { label: "Fondeo bloqueado", tone: "error" };
  }
  if (funding.status === "caution") {
    return { label: "Fondeo en vigilancia", tone: "warn" };
  }

  return funding.accountMode === "funded"
    ? { label: "Cuenta fondeada", tone: "ok" }
    : { label: "Reto en regla", tone: "ok" };
}

export function getWorkspaceStatusMeta(
  meta: WorkspaceState["meta"] | null | undefined,
): StatusMeta {
  if (!meta) return { label: "Fuente pendiente", tone: "neutral" };
  if (meta.sourceMode === "live") return { label: "Lectura MT5", tone: "info" };
  if (meta.sourceMode === "fixture") return { label: "Lectura preparada", tone: "neutral" };

  return { label: "Lectura local", tone: "neutral" };
}
