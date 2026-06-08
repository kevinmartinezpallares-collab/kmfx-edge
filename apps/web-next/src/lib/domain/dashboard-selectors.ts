import type { TradingAccount } from "@/lib/contracts/account";
import type { ClosedTrade } from "@/lib/contracts/trade";
import type { WorkspaceState } from "@/lib/contracts/workspace-state";
import { countClosedTradeExecutions } from "@/lib/domain/trades-selectors";
import { formatSignedCurrency } from "@/lib/formatters/numbers";

export type DashboardPerformance = {
  netProfit: number;
  grossProfit: number;
  grossLoss: number;
  winRatePct: number;
  totalTrades: number;
  winCount: number;
  lossCount: number;
  profitFactor: number;
};

export type DashboardAttentionItem = {
  label: string;
  title: string;
  body: string;
  href: string;
  tone: "danger" | "warning" | "neutral";
};

export type DashboardSetupRow = {
  name: string;
  trades: number;
  pnl: number;
  wins: number;
};

export type DashboardSymbolRow = {
  symbol: string;
  trades: number;
  pnl: number;
};

export type DashboardSessionRow = {
  session: ClosedTrade["session"];
  trades: number;
  pnl: number;
};

export function resolveAccountMode(account: TradingAccount | undefined) {
  if (!account) return "Sin cuenta";

  const source = `${account.label} ${account.broker} ${account.server}`.toLowerCase();
  if (source.includes("darwin")) return "Darwinex";
  if (account.funding?.accountMode === "funded") return "Cuenta fondeada";
  if (account.funding) return "Reto";
  if (source.includes("live") || source.includes("real")) return "Real";
  return account.isFunded ? "Fondeo" : "MT5";
}

export function buildDashboardPerformance(
  workspace: WorkspaceState,
  options: { preferActiveTrades?: boolean } = {},
): DashboardPerformance {
  const trades = workspace.trades;
  const executionNetPnls = trades.flatMap((trade) =>
    trade.executions.length
      ? trade.executions.map((execution) => execution.netPnl)
      : [trade.netPnl],
  );
  const totalExecutions = executionNetPnls.length;
  const netProfit = trades.reduce((sum, trade) => sum + trade.netPnl, 0);
  const winCount = executionNetPnls.filter((netPnl) => netPnl >= 0).length;
  const lossCount = executionNetPnls.filter((netPnl) => netPnl < 0).length;
  const grossProfit = trades
    .filter((trade) => trade.netPnl > 0)
    .reduce((sum, trade) => sum + trade.netPnl, 0);
  const grossLoss = Math.abs(
    trades
      .filter((trade) => trade.netPnl < 0)
      .reduce((sum, trade) => sum + trade.netPnl, 0),
  );
  const fallback = {
    netProfit,
    grossProfit,
    grossLoss,
    winRatePct: totalExecutions > 0 ? (winCount / totalExecutions) * 100 : 0,
    totalTrades: totalExecutions,
    winCount,
    lossCount,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? grossProfit : 0,
  };
  const source = workspace.analytics.performance;
  const sourceLooksEmpty =
    trades.length > 0 &&
    source.netProfit === 0 &&
    source.profitFactor === 0 &&
    source.totalTrades === 0;
  const sourceLooksContradictory =
    trades.length > 0 &&
    source.netProfit === 0 &&
    (source.winCount > 0 || source.lossCount > 0 || source.profitFactor > 0);
  const sourceLooksAggregated =
    options.preferActiveTrades &&
    countClosedTradeExecutions(trades) > 0 &&
    source.totalTrades > 0 &&
    source.totalTrades !== countClosedTradeExecutions(trades);

  return sourceLooksEmpty || sourceLooksContradictory || sourceLooksAggregated
    ? fallback
    : {
        netProfit: source.netProfit,
        grossProfit: source.grossProfit,
        grossLoss: source.grossLoss,
        winRatePct: source.winRatePct,
        totalTrades: source.totalTrades,
        winCount: source.winCount,
        lossCount: source.lossCount,
        profitFactor: source.profitFactor,
      };
}

export function riskStatusLabel(status: WorkspaceState["risk"]["status"]) {
  if (status === "blocked") return "Bloqueado";
  if (status === "caution") return "Vigilar";
  return "Operable";
}

export function buildDashboardAttentionItems(
  workspace: WorkspaceState,
): DashboardAttentionItem[] {
  const trades = workspace.trades;
  const staleAccounts = workspace.accounts.filter(
    (account) =>
      account.connectionState === "stale" ||
      account.connectionState === "plan_limited" ||
      account.connectionTone === "warning" ||
      account.connectionTone === "danger",
  );
  const worstTrade = trades
    .filter((trade) => trade.netPnl < 0)
    .toSorted((a, b) => a.netPnl - b.netPnl)[0];
  const items: DashboardAttentionItem[] = [];

  if (workspace.risk.status === "blocked") {
    items.push({
      label: "Mesa de Riesgo",
      title: "Nuevas entradas bloqueadas",
      body: workspace.risk.actionRequired,
      href: "/risk",
      tone: "danger",
    });
  } else if (workspace.risk.status === "caution") {
    items.push({
      label: "Mesa de Riesgo",
      title: "Riesgo en vigilancia",
      body: workspace.risk.actionRequired,
      href: "/risk",
      tone: "warning",
    });
  }

  if (staleAccounts.length > 0) {
    items.push({
      label: "Cuentas",
      title: `${staleAccounts.length} cuenta(s) con sincronización a revisar`,
      body: "No mezclar datos desactualizados o de plan limitado con decisiones de capital real.",
      href: "/accounts",
      tone: "warning",
    });
  }

  if (worstTrade) {
    items.push({
      label: "Trades",
      title: `${worstTrade.symbol} ${formatSignedCurrency(worstTrade.netPnl)}`,
      body: `${worstTrade.setup ?? "Sin estrategia"} / ${worstTrade.session} / ${worstTrade.tradingDayKey}`,
      href: "/trades",
      tone: "neutral",
    });
  }

  return items.slice(0, 3);
}

export function buildDashboardSetupRows(trades: ClosedTrade[]): DashboardSetupRow[] {
  const setupMap = trades.reduce<Map<string, DashboardSetupRow>>((acc, trade) => {
    const executionCount = Math.max(1, trade.executions.length);
    const executionWins = trade.executions.length
      ? trade.executions.filter((execution) => execution.netPnl >= 0).length
      : trade.netPnl >= 0
        ? 1
        : 0;
    const name = trade.setup || "Sin etiqueta";
    const row = acc.get(name) ?? { name, trades: 0, pnl: 0, wins: 0 };
    row.trades += executionCount;
    row.pnl += trade.netPnl;
    row.wins += executionWins;
    acc.set(name, row);
    return acc;
  }, new Map());

  return [...setupMap.values()].toSorted((a, b) => b.pnl - a.pnl);
}

export function buildDashboardSymbolRows(trades: ClosedTrade[]): DashboardSymbolRow[] {
  const symbolMap = trades.reduce<Map<string, DashboardSymbolRow>>((acc, trade) => {
    const executionCount = Math.max(1, trade.executions.length);
    const row = acc.get(trade.symbol) ?? { symbol: trade.symbol, trades: 0, pnl: 0 };
    row.trades += executionCount;
    row.pnl += trade.netPnl;
    acc.set(trade.symbol, row);
    return acc;
  }, new Map());

  return [...symbolMap.values()].toSorted((a, b) => b.trades - a.trades || b.pnl - a.pnl);
}

export function buildDashboardSessionRows(trades: ClosedTrade[]): DashboardSessionRow[] {
  const sessionMap = trades.reduce<Map<ClosedTrade["session"], DashboardSessionRow>>(
    (acc, trade) => {
      const executionCount = Math.max(1, trade.executions.length);
      const row = acc.get(trade.session) ?? { session: trade.session, trades: 0, pnl: 0 };
      row.trades += executionCount;
      row.pnl += trade.netPnl;
      acc.set(trade.session, row);
      return acc;
    },
    new Map(),
  );

  return [...sessionMap.values()].toSorted((a, b) => b.trades - a.trades || b.pnl - a.pnl);
}

export function sessionLabel(session: ClosedTrade["session"]) {
  if (session === "London") return "Londres";
  if (session === "New York") return "NY";
  if (session === "Unknown") return "Sin sesión";
  return session;
}
