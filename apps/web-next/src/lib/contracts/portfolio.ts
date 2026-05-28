import type { RiskPolicy } from "@/lib/contracts/policy";

export type PortfolioStatus = "active" | "paused" | "archived" | "requires_review";

export type PortfolioAccountRole =
  | "lead"
  | "follower"
  | "challenge"
  | "payout_protection"
  | "experimental"
  | "own_capital"
  | "requires_review";

export type Portfolio = {
  id: string;
  name: string;
  description: string | null;
  objective: string | null;
  status: PortfolioStatus;
  baseCurrency: string | null;
};

export type PortfolioAccount = {
  id: string;
  portfolioId: string;
  accountId: string;
  role: PortfolioAccountRole;
  priority: number | null;
  riskBudgetPct: number | null;
  maxHeatPct: number | null;
  enabled: boolean;
};

export type StrategyPermission = {
  strategyId: string;
  permission: "allowed" | "limited" | "blocked" | "requires_review";
  riskCapPct: number | null;
  allowedSessions: string[];
  allowedSymbols: string[];
};

export type RoutingPolicy = {
  copyMode: "none" | "copy_all" | "copy_selected";
  splitMode: "none" | "equal" | "weighted";
  maxAccountsPerIdea: number | null;
  preferSafestAccount: boolean;
  blockOnCorrelation: boolean;
  blockOnHeat: boolean;
  blockOnFundingDanger: boolean;
};

export type PortfolioPolicy = {
  portfolioId: string;
  accounts: PortfolioAccount[];
  strategyPermissions: StrategyPermission[];
  routing: RoutingPolicy;
  riskPolicy: RiskPolicy | null;
};

export type EAPolicyPackage = {
  id: string;
  version: string;
  generatedAt: string;
  exportMode: "risk_guardian" | "portfolio_router" | "strategy_bound";
  portfolioPolicy: PortfolioPolicy;
  emergencyFreeze: {
    enabled: boolean;
    freezeOnBlockedStatus: boolean;
    freezeOnDailyRoomBelowPct: number | null;
    freezeOnOverallRoomBelowPct: number | null;
  };
  checksum: string | null;
};
