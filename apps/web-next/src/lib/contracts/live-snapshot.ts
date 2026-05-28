export type RawLiveRiskStatus = "ok" | "warning" | "violation";

export type RawLiveTrade = {
  trade_id?: string;
  ticket?: string | number;
  position_id?: string | number;
  symbol?: string;
  type?: string;
  direction?: string;
  volume?: number;
  open_price?: number;
  entry_price?: number;
  price?: number;
  exit_price?: number;
  open_time?: string;
  close_time?: string;
  time?: string;
  open_time_unix?: number;
  close_time_unix?: number;
  time_unix?: number;
  profit?: number;
  commission?: number;
  swap?: number;
  net?: number;
  strategy_tag?: string;
  comment?: string;
};

export type RawLiveDashboardPayload = {
  payloadSource?: string;
  accountName?: string;
  name?: string;
  broker?: string;
  server?: string;
  platform?: string;
  mode?: string;
  balance?: number;
  equity?: number;
  floatingPnl?: number;
  openPnl?: number;
  closedPnl?: number;
  totalPnl?: number;
  winRate?: number;
  openPositionsCount?: number;
  totalTrades?: number;
  timestamp?: string;
  history?: Array<{
    timestamp?: string;
    value?: number;
    equity?: number;
    balance?: number;
  }>;
  trades?: RawLiveTrade[];
  reportMetrics?: {
    source?: string;
    balance?: number;
    equity?: number;
    netProfit?: number;
    grossProfit?: number;
    grossLoss?: number;
    profitFactor?: number;
    winRate?: number;
    totalTrades?: number;
    drawdownPct?: number;
    commissions?: number;
    swaps?: number;
    bestTrade?: number;
    worstTrade?: number;
    bestWinningStreak?: number;
    bestLosingStreak?: number;
  };
  fundingProfile?: {
    firm?: string;
    account_type?: "challenge" | "funded" | "evaluation";
    phase_label?: string;
    objective_pct?: number;
    current_progress_pct?: number;
    consistency_pct?: number;
    payout_cadence_label?: string;
    next_payout_label?: string;
    playbook_label?: string;
    recommended_risk_pct?: number;
    reset_cost_usd?: number;
  };
  riskSnapshot?: {
    summary?: {
      daily_drawdown_pct?: number;
      distance_to_daily_dd_limit_pct?: number;
      peak_to_equity_drawdown_pct?: number;
      max_drawdown_limit_pct?: number;
      total_open_risk_pct?: number;
      portfolio_heat_limit_pct?: number;
    };
    status?: {
      risk_status?: RawLiveRiskStatus;
      severity?: "info" | "warning" | "danger";
      blocking_rule?: string;
      action_required?: string;
      enforcement?: {
        allow_new_trades?: boolean;
      };
    };
    policy?: {
      daily_dd_limit_pct?: number;
      max_dd_limit_pct?: number;
      portfolio_heat_limit_pct?: number;
    };
    policy_evaluation?: {
      warnings?: unknown[];
      breaches?: unknown[];
    };
    symbol_exposure?: Array<{
      symbol?: string;
      risk_pct?: number;
    }>;
    professional_metrics?: {
      risk_adjusted?: {
        sortino_ratio?: number;
      };
    };
  };
};

export type RawLiveSnapshotAccount = {
  account_id?: string;
  user_id?: string;
  display_name?: string;
  broker?: string;
  platform?: string;
  login?: string | number;
  server?: string;
  connection_mode?: string;
  status?: string;
  last_sync_at?: string;
  is_default?: boolean;
  dashboard_payload?: RawLiveDashboardPayload;
};

export type RawLiveAccountsSnapshot = {
  accounts?: RawLiveSnapshotAccount[];
  user_id?: string;
  scope_user_id?: string;
  is_admin?: boolean;
  summary_only?: boolean;
  redaction?: {
    redactionLevel?: string;
    redactionMethod?: string;
    redactionNotes?: string;
    containsShiftedTimestamps?: boolean;
    containsScaledFinancialValues?: boolean;
  };
};
