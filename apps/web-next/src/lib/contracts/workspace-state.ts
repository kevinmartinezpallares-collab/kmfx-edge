import type { TradingAccount } from "@/lib/contracts/account";
import type { DashboardModel } from "@/lib/contracts/dashboard-model";
import type {
  FundingJourney,
  FundingLedgerEntry,
  FundingProfile,
  FundingRuleSet,
  FundingStageAccount,
  FundingTimelineEvent,
} from "@/lib/contracts/funding";
import type {
  Portfolio,
  PortfolioAccount,
  PortfolioPolicy,
} from "@/lib/contracts/portfolio";
import type {
  RiskEvaluation,
  RiskPolicy,
  RiskRecommendation,
} from "@/lib/contracts/policy";
import type { RiskSnapshot } from "@/lib/contracts/risk";
import type {
  ClosedTrade,
  DailyTradeBucket,
  HourlyTradeBucket,
} from "@/lib/contracts/trade";

export type WorkspaceRouteKey =
  | "dashboard"
  | "accounts"
  | "risk"
  | "analytics";

export type WorkspaceState = {
  activeAccountId: string;
  accounts: TradingAccount[];
  trades: ClosedTrade[];
  dashboard: DashboardModel;
  risk: RiskSnapshot;
  funding?: {
    profiles: FundingProfile[];
    ruleSets: FundingRuleSet[];
    journeys: FundingJourney[];
    stageAccounts: FundingStageAccount[];
    ledgerEntries: FundingLedgerEntry[];
    timelineEvents: FundingTimelineEvent[];
  };
  portfolio?: {
    portfolios: Portfolio[];
    accounts: PortfolioAccount[];
    policies: PortfolioPolicy[];
  };
  policies?: {
    riskPolicies: RiskPolicy[];
    evaluations: RiskEvaluation[];
    recommendations: RiskRecommendation[];
  };
  analytics: {
    performance: {
      netProfit: number;
      grossProfit: number;
      grossLoss: number;
      winRatePct: number;
      totalTrades: number;
      winCount: number;
      lossCount: number;
      profitFactor: number;
      sortino: number | null;
      expectancy: number;
      avgWin: number;
      avgLoss: number;
      bestTrade: number | null;
      worstTrade: number | null;
      bestWinStreak: number;
      bestLossStreak: number;
      score: number;
    };
    summary: Array<{
      label: string;
      value: string;
      note: string;
    }>;
    daily: DailyTradeBucket[];
    hourly: HourlyTradeBucket[];
    periodOptions: string[];
    currentPeriod: string;
  };
  meta: {
    sourceMode: "mock" | "fixture" | "live";
    sourceLabel: string;
  };
};
