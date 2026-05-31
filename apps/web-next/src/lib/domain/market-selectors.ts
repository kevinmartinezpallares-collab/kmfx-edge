import type { RiskStatus } from "@/lib/contracts/risk";
import type { TradeSession } from "@/lib/contracts/trade";
import type { WorkspaceState } from "@/lib/contracts/workspace-state";

export type MarketSymbolRow = {
  symbol: string;
  trades: number;
  netPnl: number;
  session: TradeSession | "Pend.";
  openRiskPct: number;
  tone: RiskStatus;
};

export type MarketReadiness = {
  status: "empty" | "partial" | "ready";
  symbolCount: number;
  exposedSymbols: number;
  hotSymbol: MarketSymbolRow | null;
  cautionSymbols: number;
};

export function buildMarketRows(workspace: WorkspaceState): MarketSymbolRow[] {
  const tradeMap = workspace.trades.reduce<
    Map<
      string,
      {
        trades: number;
        netPnl: number;
        session: TradeSession;
      }
    >
  >((acc, trade) => {
    const current = acc.get(trade.symbol) ?? {
      trades: 0,
      netPnl: 0,
      session: trade.session,
    };
    current.trades += 1;
    current.netPnl += trade.netPnl;
    current.session = trade.session;
    acc.set(trade.symbol, current);
    return acc;
  }, new Map());

  const exposureMap = new Map(
    workspace.risk.exposureBySymbol.map((item) => [item.symbol, item]),
  );

  return [...new Set([...tradeMap.keys(), ...exposureMap.keys()])]
    .map((symbol) => {
      const tradeDetail = tradeMap.get(symbol);
      const exposure = exposureMap.get(symbol);

      return {
        symbol,
        trades: tradeDetail?.trades ?? 0,
        netPnl: tradeDetail?.netPnl ?? 0,
        session: tradeDetail?.session ?? "Pend.",
        openRiskPct: exposure?.openRiskPct ?? 0,
        tone: exposure?.tone ?? "safe",
      } satisfies MarketSymbolRow;
    })
    .toSorted((a, b) => {
      if (b.trades !== a.trades) return b.trades - a.trades;
      return b.openRiskPct - a.openRiskPct;
    });
}

export function getMarketReadiness(workspace: WorkspaceState): MarketReadiness {
  const rows = buildMarketRows(workspace);
  const exposedSymbols = rows.filter((row) => row.openRiskPct > 0).length;

  return {
    status:
      rows.length === 0 ? "empty" : exposedSymbols === 0 || workspace.trades.length === 0 ? "partial" : "ready",
    symbolCount: rows.length,
    exposedSymbols,
    hotSymbol: rows[0] ?? null,
    cautionSymbols: rows.filter((row) => row.tone !== "safe").length,
  };
}
