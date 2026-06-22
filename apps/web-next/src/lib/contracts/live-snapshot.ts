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
  sl?: number;
  stop_loss?: number;
  initial_stop_price?: number;
  tp?: number;
  take_profit?: number;
  target_price?: number;
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
  risk_amount?: number;
  planned_risk_amount?: number;
  initial_risk_amount?: number;
  planned_reward_amount?: number;
  reward_amount?: number;
  planned_rr?: number;
  planned_reward_risk_ratio?: number;
  rr?: number;
  captured_r?: number;
  r_multiple?: number;
  mfe?: number;
  max_favorable_excursion?: number;
  max_favorable_excursion_amount?: number;
  mfe_r?: number;
  mae?: number;
  max_adverse_excursion?: number;
  max_adverse_excursion_amount?: number;
  mae_r?: number;
  exit_efficiency_pct?: number;
  exit_efficiency?: number;
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
  connector_version?: string;
  connectorVersion?: string;
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
  riskguard_alert_event?: RawRiskGuardAlertEvent;
  riskGuardAlertEvent?: RawRiskGuardAlertEvent;
  riskguard_terminal_ack?: RawRiskGuardTerminalAck;
  riskGuardTerminalAck?: RawRiskGuardTerminalAck;
  risk_policy_hash?: string;
  riskPolicyHash?: string;
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
  account_profile?: RawLiveAccountProfile;
  accountProfile?: RawLiveAccountProfile;
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

export type RawLiveAccountProfile = {
  account_class?:
    | "own"
    | "real"
    | "demo"
    | "challenge"
    | "evaluation"
    | "funded";
  accountClass?:
    | "own"
    | "real"
    | "demo"
    | "challenge"
    | "evaluation"
    | "funded";
  badge_label?: string;
  badgeLabel?: string;
  source?: "auto" | "manual";
  updated_at?: string;
  updatedAt?: string;
};

export type RawRiskGuardAlertEvent = {
  id?: string;
  tone?: "danger" | "warning" | "info";
  label?: string;
  reason?: string;
  event_type?: string;
  eventType?: string;
  policy_hash?: string;
  policyHash?: string;
  blocking_rule?: string;
  blockingRule?: string;
  risk_status?: string;
  riskStatus?: string;
  occurred_at?: string;
  occurredAt?: string;
  received_at?: string;
  receivedAt?: string;
};

export type RawRiskGuardTerminalAck = {
  account_trade_allowed?: boolean;
  active_enforcement_confirmed?: boolean;
  alert_event?: RawRiskGuardAlertEvent;
  alertEvent?: RawRiskGuardAlertEvent;
  auto_block_received?: boolean;
  blocking_rule?: string;
  consent_accepted?: boolean;
  ea_name?: string;
  ea_version?: string;
  event_type?: string;
  eventType?: string;
  firm_caution_required?: boolean;
  mode?: string;
  policy_hash?: string;
  policy_hash_matches?: boolean;
  protection_state?: string;
  risk_status?: string;
  severity?: "info" | "warning" | "danger";
  reactive_close_market_positions?: boolean;
  reactive_delete_pending_orders?: boolean;
  received_at?: string;
  riskguard_enabled?: boolean;
  terminal_trade_allowed?: boolean;
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
  connector_version?: string;
  connectorVersion?: string;
  status?: string;
  last_sync_at?: string;
  is_default?: boolean;
  riskguard_terminal_ack?: RawRiskGuardTerminalAck;
  riskGuardTerminalAck?: RawRiskGuardTerminalAck;
  dashboard_payload?: RawLiveDashboardPayload;
};

export type RawLiveAccountsSnapshot = {
  accounts?: RawLiveSnapshotAccount[];
  auth_avatar_url?: string;
  auth_email?: string;
  auth_picture?: string;
  avatar_url?: string;
  picture?: string;
  user_id?: string;
  user_avatar_url?: string;
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
