import type { TradeSession } from "@/lib/contracts/trade";
import type { WorkspaceState } from "@/lib/contracts/workspace-state";

type StrategyAccumulator = {
  name: string;
  trades: number;
  wins: number;
  losses: number;
  netPnl: number;
  durations: number[];
  bestTrade: number | null;
  worstTrade: number | null;
  sessions: Map<TradeSession, number>;
  symbols: Set<string>;
};

export type StrategyPerformanceRow = {
  name: string;
  trades: number;
  wins: number;
  losses: number;
  netPnl: number;
  bestTrade: number | null;
  worstTrade: number | null;
  expectancy: number;
  winRatePct: number;
  dominantSession: TradeSession | "Pend.";
  avgDuration: number | null;
  sampleLabel: "Operativa" | "Temprana" | "Pocas operaciones";
  symbols: string[];
};

export type StrategiesReadiness = {
  status: "empty" | "partial" | "ready";
  totalTrades: number;
  strategyCount: number;
  untaggedTrades: number;
  tagCoveragePct: number;
  topStrategy: StrategyPerformanceRow | null;
};

function percent(part: number, total: number) {
  return total > 0 ? (part / total) * 100 : 0;
}

export function buildStrategyRows(workspace: WorkspaceState): StrategyPerformanceRow[] {
  const grouped = workspace.trades.reduce<Map<string, StrategyAccumulator>>((acc, trade) => {
    const executionCount = Math.max(1, trade.executions.length);
    const executionNetPnls = trade.executions.length
      ? trade.executions.map((execution) => execution.netPnl)
      : [trade.netPnl];
    const name = trade.setup?.trim() || `${trade.session} discretionary`;
    const current = acc.get(name) ?? {
      name,
      trades: 0,
      wins: 0,
      losses: 0,
      netPnl: 0,
      durations: [],
      bestTrade: null,
      worstTrade: null,
      sessions: new Map<TradeSession, number>(),
      symbols: new Set<string>(),
    };

    current.trades += executionCount;
    current.netPnl += trade.netPnl;
    current.symbols.add(trade.symbol);
    current.sessions.set(
      trade.session,
      (current.sessions.get(trade.session) ?? 0) + executionCount,
    );

    current.wins += executionNetPnls.filter((netPnl) => netPnl >= 0).length;
    current.losses += executionNetPnls.filter((netPnl) => netPnl < 0).length;

    if (trade.durationMinutes !== null) {
      current.durations.push(trade.durationMinutes);
    }

    current.bestTrade =
      current.bestTrade === null ? trade.netPnl : Math.max(current.bestTrade, trade.netPnl);
    current.worstTrade =
      current.worstTrade === null ? trade.netPnl : Math.min(current.worstTrade, trade.netPnl);

    acc.set(name, current);
    return acc;
  }, new Map());

  return [...grouped.values()]
    .map((strategy) => {
      const dominantSession =
        [...strategy.sessions.entries()].toSorted((a, b) => b[1] - a[1])[0]?.[0] ?? "Pend.";
      const avgDuration =
        strategy.durations.length > 0
          ? strategy.durations.reduce((sum, value) => sum + value, 0) /
            strategy.durations.length
          : null;

      return {
        name: strategy.name,
        trades: strategy.trades,
        wins: strategy.wins,
        losses: strategy.losses,
        netPnl: strategy.netPnl,
        bestTrade: strategy.bestTrade,
        worstTrade: strategy.worstTrade,
        expectancy: strategy.trades > 0 ? strategy.netPnl / strategy.trades : 0,
        winRatePct: percent(strategy.wins, strategy.trades),
        dominantSession,
        avgDuration,
        sampleLabel:
          strategy.trades >= 4 ? "Operativa" : strategy.trades >= 2 ? "Temprana" : "Pocas operaciones",
        symbols: [...strategy.symbols].toSorted(),
      } satisfies StrategyPerformanceRow;
    })
    .toSorted((a, b) => {
      if (b.trades !== a.trades) return b.trades - a.trades;
      return b.netPnl - a.netPnl;
    });
}

export function getStrategiesReadiness(workspace: WorkspaceState): StrategiesReadiness {
  const rows = buildStrategyRows(workspace);
  const totalTrades = workspace.trades.reduce(
    (sum, trade) => sum + Math.max(1, trade.executions.length),
    0,
  );
  const untaggedTrades = workspace.trades.reduce(
    (sum, trade) => sum + (!trade.setup ? Math.max(1, trade.executions.length) : 0),
    0,
  );

  return {
    status:
      totalTrades === 0
        ? "empty"
        : untaggedTrades > 0 || rows.some((row) => row.sampleLabel !== "Operativa")
          ? "partial"
          : "ready",
    totalTrades,
    strategyCount: rows.length,
    untaggedTrades,
    tagCoveragePct: percent(totalTrades - untaggedTrades, totalTrades),
    topStrategy: rows[0] ?? null,
  };
}
