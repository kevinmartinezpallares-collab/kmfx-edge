export type ConnectionTone =
  | "connected"
  | "syncing"
  | "stale"
  | "warning"
  | "danger";

export type ConnectionState =
  | "connected"
  | "syncing"
  | "stale"
  | "pending"
  | "plan_limited"
  | "error";

export type TradingAccount = {
  id: string;
  label: string;
  broker: string;
  server: string;
  login: string;
  platform: "mt5";
  baseCurrency: string;
  balance: number;
  equity: number;
  floatingPnl: number;
  totalPnl: number;
  openPositionsCount: number;
  connectionState: ConnectionState;
  connectionTone: ConnectionTone;
  lastSyncLabel: string;
  isFunded: boolean;
  planAccess: "active" | "limited";
  profile?: {
    accountClass:
      | "own"
      | "real"
      | "demo"
      | "challenge"
      | "evaluation"
      | "funded";
    badgeLabel: string;
    source: "auto" | "manual";
  };
  riskGuard?: {
    accountTradeAllowed: boolean;
    activeEnforcementConfirmed: boolean;
    consentAccepted: boolean;
    deletePendingOrdersEnabled: boolean;
    enabled: boolean;
    firmCautionRequired: boolean;
    lastAckLabel: string;
    mode: string;
    policyHash: string;
    policyHashMatches: boolean;
    protectionState:
      | "pending"
      | "monitor_only"
      | "consent_required"
      | "terminal_confirmed_monitor"
      | "terminal_read_only_or_unavailable"
      | "reactive_entry_guard_confirmed"
      | "advanced_close_requires_firm_review";
    reactiveClosePositionsEnabled: boolean;
    terminalTradeAllowed: boolean;
  };
  equityHistory?: Array<{
    label: string;
    value: number;
    timestamp?: string;
  }>;
  funding?: {
    firm: string;
    accountMode: "challenge" | "funded" | "evaluation";
    phaseLabel: string;
    objectivePct: number | null;
    progressPct: number | null;
    consistencyPct: number | null;
    payoutCadenceLabel: string | null;
    nextPayoutLabel: string | null;
    playbookLabel: string;
    recommendedRiskPct: number;
    resetCostUsd: number | null;
    dailyRoomLeftPct: number;
    maxRoomLeftPct: number;
    status: "safe" | "caution" | "blocked";
    allowNewTrades: boolean;
  };
};
