import type { RiskSnapshot, RiskStatus } from "@/lib/contracts/risk";
import type { WorkspaceState } from "@/lib/contracts/workspace-state";

export type RiskAccountPosture = {
  accountId: string;
  accountLabel: string;
  baseCurrency: string;
  equity: number;
  status: RiskStatus;
  roomLeftPct: number;
  nextTradeRiskPct: number;
  nextTradeRiskAmount: number;
};

export type RiskGuardPosture = {
  status: RiskStatus;
  allowNewTrades: boolean;
  totalOpenRiskPct: number;
  dailyUsagePct: number;
  dailyRoomSharePct: number;
  heatUsagePct: number;
  correlationPressurePct: number;
  dominantExposure: RiskSnapshot["exposureBySymbol"][number] | null;
  dominantSharePct: number;
  accountPostures: RiskAccountPosture[];
  firstAccountAtRisk: RiskAccountPosture | null;
};

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

export function getRiskGuardPosture(workspace: WorkspaceState): RiskGuardPosture {
  const risk = workspace.risk;
  const exposures = [...risk.exposureBySymbol].toSorted(
    (a, b) => b.openRiskPct - a.openRiskPct,
  );
  const totalExposurePct = exposures.reduce(
    (sum, exposure) => sum + exposure.openRiskPct,
    0,
  );
  const dominantExposure = exposures[0] ?? null;
  const dominantSharePct =
    dominantExposure && risk.totalOpenRiskPct > 0
      ? (dominantExposure.openRiskPct / risk.totalOpenRiskPct) * 100
      : 0;
  const accountPostures = workspace.accounts
    .map<RiskAccountPosture>((account) => {
      const nextTradeRiskPct = account.funding?.recommendedRiskPct ?? 0.5;
      const status = account.funding?.status ?? risk.status;
      const roomLeftPct = account.funding?.dailyRoomLeftPct ?? risk.dailyRoomLeftPct;

      return {
        accountId: account.id,
        accountLabel: account.label,
        baseCurrency: account.baseCurrency,
        equity: account.equity,
        status,
        roomLeftPct,
        nextTradeRiskPct,
        nextTradeRiskAmount: account.equity * (nextTradeRiskPct / 100),
      };
    })
    .toSorted((a, b) => a.roomLeftPct - b.roomLeftPct);

  return {
    status: risk.status,
    allowNewTrades: risk.allowNewTrades,
    totalOpenRiskPct: risk.totalOpenRiskPct,
    dailyUsagePct:
      risk.dailyLimitPct > 0
        ? clampPercent((risk.dailyDrawdownPct / risk.dailyLimitPct) * 100)
        : 0,
    dailyRoomSharePct:
      risk.dailyLimitPct > 0
        ? clampPercent((risk.dailyRoomLeftPct / risk.dailyLimitPct) * 100)
        : 0,
    heatUsagePct:
      risk.heatLimitPct > 0
        ? clampPercent((risk.totalOpenRiskPct / risk.heatLimitPct) * 100)
        : 0,
    correlationPressurePct: clampPercent(totalExposurePct * 12),
    dominantExposure,
    dominantSharePct,
    accountPostures,
    firstAccountAtRisk: accountPostures[0] ?? null,
  };
}
