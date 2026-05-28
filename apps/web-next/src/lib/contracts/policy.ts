import type { RiskStatus } from "@/lib/contracts/risk";

export type RiskPolicyScope = "account" | "portfolio" | "strategy";

export type RiskPolicySource =
  | "user"
  | "funding"
  | "account"
  | "backend"
  | "assumption"
  | "default";

export type RiskPolicy = {
  id: string;
  scopeType: RiskPolicyScope;
  scopeId: string;
  defaultRiskPerTradePct: number | null;
  dailyDrawdownLimitPct: number | null;
  maxDrawdownLimitPct: number | null;
  portfolioHeatLimitPct: number | null;
  maxVolume: number | null;
  maxConcurrentPositions: number | null;
  maxSymbolExposurePct: number | null;
  maxFactorExposurePct: number | null;
  allowedSessions: string[];
  allowedSymbols: string[];
  autoBlockEnabled: boolean;
  playbookId: string | null;
  policySource: RiskPolicySource;
};

export type RiskEvaluation = {
  id: string;
  accountId: string | null;
  portfolioId: string | null;
  asOf: string;
  riskStatus: "ok" | "caution" | "danger" | "blocked" | "unavailable";
  severity: "info" | "warning" | "danger";
  reasonCode: string;
  blockingRule: string | null;
  enforcement: {
    allowNewTrades: boolean;
    blockNewTrades: boolean;
    reduceSize: boolean;
    closePositionsRequired: boolean;
  };
  room: {
    dailyRoomLeftAmount: number | null;
    dailyRoomLeftPct: number | null;
    overallRoomLeftAmount: number | null;
    overallRoomLeftPct: number | null;
  };
  heat: {
    totalOpenRiskAmount: number | null;
    totalOpenRiskPct: number | null;
    maxOpenTradeRiskPct: number | null;
    portfolioHeatLimitPct: number | null;
    heatUsageRatioPct: number | null;
    distanceToHeatLimitPct: number | null;
  };
  limitsStatus: Record<string, unknown>;
  breaches: string[];
  warnings: string[];
  assumptions: string[];
  confidence: "low" | "medium" | "high";
};

export type RiskRecommendation = {
  id: string;
  accountId: string | null;
  portfolioId: string | null;
  asOf: string;
  mode: "aggressive" | "standard" | "defensive" | "blocked";
  status: RiskStatus;
  maxRiskAllowedNowPct: number | null;
  recommendedRiskNowPct: number | null;
  maxAdditionalHeatPct: number | null;
  maxConcurrentPositionsNow: number | null;
  safeSizeBand: {
    minPct: number | null;
    maxPct: number | null;
  } | null;
  nextTradeAdvisory: string;
  blockedReasons: string[];
  assumptions: string[];
};
