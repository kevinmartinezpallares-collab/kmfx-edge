export type RiskStatus = "safe" | "caution" | "blocked";

export type RiskSnapshot = {
  status: RiskStatus;
  severity: "info" | "warning" | "danger";
  actionRequired: string;
  blockingRule?: string;
  allowNewTrades: boolean;
  dailyDrawdownPct: number;
  dailyLimitPct: number;
  dailyRoomLeftPct: number;
  maxDrawdownPct: number;
  maxLimitPct: number;
  totalOpenRiskPct: number;
  heatLimitPct: number;
  exposureBySymbol: Array<{
    symbol: string;
    openRiskPct: number;
    tone: RiskStatus;
  }>;
};
