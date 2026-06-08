import type { TradeSession } from "@/lib/contracts/trade";
import type { WorkspaceState } from "@/lib/contracts/workspace-state";

export type ExecutionQuality = {
  status: "empty" | "partial" | "ready";
  totalTrades: number;
  taggedTrades: number;
  tagCoveragePct: number;
  scaleOutTrades: number;
  averageDurationMinutes: number | null;
  fastLosses: number;
  worstSession: TradeSession | "Pend.";
  hints: string[];
};

export type ExecutionRMetricRow = {
  label: string;
  capturedR: number;
  mfeR: number;
  maeR: number;
  plannedRewardRiskRatio: number;
  exitEfficiencyPct: number | null;
  symbol: string;
  setup: string | null;
};

export type ExecutionRMetrics = {
  status: "empty" | "partial" | "ready";
  totalTrades: number;
  measuredTrades: number;
  coveragePct: number;
  avgCapturedR: number | null;
  avgMfeR: number | null;
  avgMaeR: number | null;
  avgPlannedRewardRiskRatio: number | null;
  avgExitEfficiencyPct: number | null;
  rows: ExecutionRMetricRow[];
};

function percent(part: number, total: number) {
  return total > 0 ? (part / total) * 100 : 0;
}

function average(values: number[]) {
  return values.length > 0
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function getExecutionQuality(workspace: WorkspaceState): ExecutionQuality {
  const trades = workspace.trades;
  const taggedTrades = trades.filter((trade) => Boolean(trade.setup)).length;
  const scaleOutTrades = trades.filter((trade) => trade.executions.length > 1).length;
  const durations = trades
    .map((trade) => trade.durationMinutes)
    .filter((duration): duration is number => duration !== null);
  const averageDurationMinutes =
    durations.length > 0
      ? durations.reduce((sum, duration) => sum + duration, 0) / durations.length
      : null;
  const fastLosses = trades.filter(
    (trade) => trade.netPnl < 0 && (trade.durationMinutes ?? 0) <= 45,
  ).length;
  const worstSession =
    Object.entries(
      trades
        .filter((trade) => trade.netPnl < 0)
        .reduce<Record<string, number>>((acc, trade) => {
          acc[trade.session] = (acc[trade.session] ?? 0) + 1;
          return acc;
        }, {}),
    ).toSorted((a, b) => b[1] - a[1])[0]?.[0] as TradeSession | undefined;
  const tagCoveragePct = percent(taggedTrades, trades.length);
  const hints = [
    fastLosses > 0
      ? `Hay ${fastLosses} pérdida(s) cerradas en menos de 45 min; prioriza revisar timing y contexto de entrada.`
      : "No aparecen pérdidas rápidas en los datos actuales; buena señal de contención inicial.",
    taggedTrades < trades.length
      ? "Faltan etiquetas en parte de las operaciones; la calidad de ejecución todavía tiene contexto incompleto."
      : "Todas las operaciones visibles llegan con setup; la review puede ser más diagnóstica.",
    scaleOutTrades > 0
      ? `Se detectan ${scaleOutTrades} operaciones con salida parcial; ya se puede leer gestión de salida básica.`
      : "Todavía no hay salidas parciales visibles; la lectura de calidad de salida es limitada.",
  ];

  return {
    status:
      trades.length === 0
        ? "empty"
        : taggedTrades < trades.length || durations.length < trades.length
          ? "partial"
          : "ready",
    totalTrades: trades.length,
    taggedTrades,
    tagCoveragePct,
    scaleOutTrades,
    averageDurationMinutes,
    fastLosses,
    worstSession: worstSession ?? "Pend.",
    hints,
  };
}

export function getExecutionRMetrics(workspace: WorkspaceState): ExecutionRMetrics {
  const trades = workspace.trades;
  const rows = trades
    .filter(
      (trade) =>
        finiteNumber(trade.capturedR) ||
        finiteNumber(trade.mfeR) ||
        finiteNumber(trade.maeR) ||
        finiteNumber(trade.plannedRewardRiskRatio) ||
        finiteNumber(trade.exitEfficiencyPct),
    )
    .map((trade) => ({
      label: trade.symbol,
      capturedR: finiteNumber(trade.capturedR) ? trade.capturedR : 0,
      mfeR: finiteNumber(trade.mfeR) ? trade.mfeR : 0,
      maeR: finiteNumber(trade.maeR) ? trade.maeR : 0,
      plannedRewardRiskRatio: finiteNumber(trade.plannedRewardRiskRatio)
        ? trade.plannedRewardRiskRatio
        : 0,
      exitEfficiencyPct: finiteNumber(trade.exitEfficiencyPct)
        ? trade.exitEfficiencyPct
        : null,
      symbol: trade.symbol,
      setup: trade.setup,
    }))
    .slice(0, 8);
  const capturedValues = trades
    .map((trade) => trade.capturedR)
    .filter(finiteNumber);
  const mfeValues = trades.map((trade) => trade.mfeR).filter(finiteNumber);
  const maeValues = trades.map((trade) => trade.maeR).filter(finiteNumber);
  const plannedRewardRiskRatios = trades
    .map((trade) => trade.plannedRewardRiskRatio)
    .filter(finiteNumber);
  const exitEfficiencyValues = trades
    .map((trade) => trade.exitEfficiencyPct)
    .filter(finiteNumber);
  const measuredTradeIds = new Set(
    trades
      .filter(
        (trade) =>
          finiteNumber(trade.capturedR) ||
          finiteNumber(trade.mfeR) ||
          finiteNumber(trade.maeR) ||
          finiteNumber(trade.plannedRewardRiskRatio) ||
          finiteNumber(trade.exitEfficiencyPct),
      )
      .map((trade) => trade.id),
  );
  const measuredTrades = measuredTradeIds.size;
  const coveragePct = percent(measuredTrades, trades.length);

  return {
    status:
      trades.length === 0
        ? "empty"
        : measuredTrades === 0
          ? "empty"
          : measuredTrades < trades.length
            ? "partial"
            : "ready",
    totalTrades: trades.length,
    measuredTrades,
    coveragePct,
    avgCapturedR: average(capturedValues),
    avgMfeR: average(mfeValues),
    avgMaeR: average(maeValues),
    avgPlannedRewardRiskRatio: average(plannedRewardRiskRatios),
    avgExitEfficiencyPct: average(exitEfficiencyValues),
    rows,
  };
}
