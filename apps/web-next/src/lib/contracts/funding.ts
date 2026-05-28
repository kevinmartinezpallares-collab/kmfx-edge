export type FundingStage = "phase_1" | "phase_2" | "funded";

export type FundingJourneyStatus =
  | "active"
  | "passed_phase_1"
  | "passed_phase_2"
  | "funded_active"
  | "funded_closed"
  | "failed"
  | "cancelled"
  | "requires_review";

export type FundingStageStatus =
  | "pending"
  | "active"
  | "passed"
  | "failed"
  | "closed"
  | "requires_review";

export type FundingDrawdownType =
  | "static"
  | "trailing"
  | "daily_balance_or_equity"
  | "unknown";

export type FundingDailyResetMode =
  | "server_time"
  | "local_time"
  | "unknown";

export type FundingProfile = {
  id: string;
  accountId: string;
  firmId: string;
  firmName: string;
  programId: string;
  programName: string;
  phaseId: FundingStage;
  phaseName: string;
  accountSize: number | null;
  drawdownType: FundingDrawdownType;
  dailyResetMode: FundingDailyResetMode;
  sourceUrl: string | null;
  verified: boolean;
  requiresReview: boolean;
};

export type FundingRuleSet = {
  firmId: string;
  programId: string;
  phaseId: FundingStage;
  dailyLossLimitPct: number | null;
  dailyLossLimitAmount: number | null;
  maxLossLimitPct: number | null;
  maxLossLimitAmount: number | null;
  drawdownType: FundingDrawdownType;
  dailyResetMode: FundingDailyResetMode;
  floatingLossCounts: boolean;
  consistencyRuleEnabled: boolean;
  consistencyThresholdPct: number | null;
  minimumTradingDays: number | null;
  payoutCycleDays: number | null;
  profitTargetPct: number | null;
  sourceUrl: string | null;
  sourceLabel: string;
  verified: boolean;
  requiresReview: boolean;
};

export type FundingJourney = {
  id: string;
  firmId: string;
  firmName: string;
  programId: string;
  programName: string;
  accountSize: number;
  baseCurrency: string;
  currentStage: FundingStage | "closed";
  status: FundingJourneyStatus;
  startedAt: string | null;
  completedAt: string | null;
  fundedAt: string | null;
  closedAt: string | null;
  failureReason: string | null;
  notes: string | null;
};

export type FundingStageAccount = {
  id: string;
  fundingJourneyId: string;
  accountId: string | null;
  stage: FundingStage;
  status: FundingStageStatus;
  startedAt: string | null;
  endedAt: string | null;
  startingBalance: number | null;
  endingBalance: number | null;
  startingEquity: number | null;
  endingEquity: number | null;
  profitAmount: number | null;
  profitPct: number | null;
  maxDrawdownAmount: number | null;
  maxDrawdownPct: number | null;
  tradeCount: number | null;
  resultSnapshotId: string | null;
  notes: string | null;
};

export type FundingLedgerEntryType =
  | "payout_received"
  | "payout_requested"
  | "challenge_fee"
  | "reset_fee"
  | "refund"
  | "commission"
  | "manual_adjustment";

export type FundingLedgerEntryStatus =
  | "draft"
  | "pending"
  | "paid"
  | "rejected"
  | "cancelled";

export type FundingLedgerEntry = {
  id: string;
  fundingJourneyId: string;
  accountId: string | null;
  type: FundingLedgerEntryType;
  status: FundingLedgerEntryStatus;
  grossAmount: number | null;
  feesAmount: number | null;
  netReceivedAmount: number | null;
  currency: string;
  method: "bank" | "crypto" | "deel" | "rise" | "other" | "manual" | null;
  requestedAt: string | null;
  paidAt: string | null;
  occurredAt: string;
  proofUrl: string | null;
  notes: string | null;
};

export type FundingTimelineEvent = {
  id: string;
  fundingJourneyId: string;
  accountId: string | null;
  type: string;
  occurredAt: string;
  title: string;
  description: string | null;
  source: "manual" | "stage" | "ledger" | "snapshot";
};
