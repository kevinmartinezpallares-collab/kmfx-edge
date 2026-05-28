export type TradeSide = "buy" | "sell";

export type TradeSession = "Asia" | "London" | "New York" | "Unknown";

export type ClosedTradeExecution = {
  id: string;
  volume: number;
  exitPrice: number;
  closedAt: string;
  grossPnl: number;
  commission: number;
  swap: number;
  netPnl: number;
};

export type ClosedTrade = {
  id: string;
  positionId: string;
  symbol: string;
  side: TradeSide;
  volume: number;
  entryPrice: number;
  exitPrice: number;
  openedAt: string;
  closedAt: string;
  durationMinutes: number | null;
  grossPnl: number;
  commission: number;
  swap: number;
  netPnl: number;
  session: TradeSession;
  setup: string | null;
  tradingDayKey: string;
  executions: ClosedTradeExecution[];
};

export type DailyTradeBucket = {
  tradingDayKey: string;
  label: string;
  pnl: number;
  trades: number;
  wins: number;
  losses: number;
  winRatePct: number;
};

export type HourlyTradeBucket = {
  hour: number;
  label: string;
  pnl: number;
  trades: number;
  wins: number;
  losses: number;
};
