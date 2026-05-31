import type { ClosedTrade, TradeSession } from "@/lib/contracts/trade";
import type { WorkspaceState } from "@/lib/contracts/workspace-state";
import { buildReviewPriorityRows } from "@/lib/domain/review-selectors";

export type TradeAggregationRow = {
  key: string;
  label: string;
  trades: number;
  netPnl: number;
};

export type TradeLedgerRow = {
  trade: ClosedTrade;
  costs: number;
  reviewScore: number | null;
};

export type TradesOverview = {
  trades: ClosedTrade[];
  ledgerRows: TradeLedgerRow[];
  totalTrades: number;
  wins: number;
  losses: number;
  netPnl: number;
  costs: number;
  reviewQueueCount: number;
  tagCoveragePct: number;
  partialTrades: number;
  bySymbol: TradeAggregationRow[];
  bySession: TradeAggregationRow[];
};

function sortAggregationRows(a: TradeAggregationRow, b: TradeAggregationRow) {
  if (b.trades !== a.trades) return b.trades - a.trades;
  return Math.abs(b.netPnl) - Math.abs(a.netPnl);
}

export function countClosedTradeExecutions(trades: ClosedTrade[]) {
  return trades.reduce(
    (sum, trade) => sum + Math.max(1, trade.executions.length),
    0,
  );
}

function tradeExecutionNetPnls(trade: ClosedTrade) {
  return trade.executions.length
    ? trade.executions.map((execution) => execution.netPnl)
    : [trade.netPnl];
}

function buildSymbolRows(trades: ClosedTrade[]): TradeAggregationRow[] {
  return Object.values(
    trades.reduce<Record<string, TradeAggregationRow>>((acc, trade) => {
      const executionCount = Math.max(1, trade.executions.length);
      const current = acc[trade.symbol] ?? {
        key: trade.symbol,
        label: trade.symbol,
        trades: 0,
        netPnl: 0,
      };
      current.trades += executionCount;
      current.netPnl += trade.netPnl;
      acc[trade.symbol] = current;
      return acc;
    }, {}),
  ).toSorted(sortAggregationRows);
}

function buildSessionRows(trades: ClosedTrade[]): TradeAggregationRow[] {
  return Object.values(
    trades.reduce<Partial<Record<TradeSession, TradeAggregationRow>>>((acc, trade) => {
      const executionCount = Math.max(1, trade.executions.length);
      const current = acc[trade.session] ?? {
        key: trade.session,
        label: trade.session,
        trades: 0,
        netPnl: 0,
      };
      current.trades += executionCount;
      current.netPnl += trade.netPnl;
      acc[trade.session] = current;
      return acc;
    }, {}),
  ).toSorted(sortAggregationRows);
}

export function getTradesOverview(workspace: WorkspaceState): TradesOverview {
  const trades = workspace.trades;
  const reviewQueue = buildReviewPriorityRows(workspace);
  const reviewScoreByTradeId = new Map(
    reviewQueue.map((item) => [item.trade.id, item.score]),
  );
  const executionNetPnls = trades.flatMap(tradeExecutionNetPnls);
  const totalTrades = executionNetPnls.length;
  const wins = executionNetPnls.filter((netPnl) => netPnl >= 0).length;
  const costs = trades.reduce(
    (sum, trade) => sum + Math.abs(trade.commission) + Math.abs(trade.swap),
    0,
  );
  const taggedTrades = trades.reduce(
    (sum, trade) => sum + (trade.setup ? Math.max(1, trade.executions.length) : 0),
    0,
  );

  return {
    trades,
    ledgerRows: trades.map((trade) => ({
      trade,
      costs: Math.abs(trade.commission) + Math.abs(trade.swap),
      reviewScore: reviewScoreByTradeId.get(trade.id) ?? null,
    })),
    totalTrades,
    wins,
    losses: totalTrades - wins,
    netPnl: trades.reduce((sum, trade) => sum + trade.netPnl, 0),
    costs,
    reviewQueueCount: reviewQueue.length,
    tagCoveragePct: totalTrades > 0 ? (taggedTrades / totalTrades) * 100 : 0,
    partialTrades: trades.filter((trade) => trade.executions.length > 1).length,
    bySymbol: buildSymbolRows(trades),
    bySession: buildSessionRows(trades),
  };
}
