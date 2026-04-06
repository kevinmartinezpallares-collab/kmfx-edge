import { selectCurrentAccount } from "./utils.js?v=build-20260406-203500";

function safeObject(value) {
  return value && typeof value === "object" ? value : {};
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toBoolean(value) {
  return Boolean(value);
}

export function selectRiskSnapshot(state) {
  const account = selectCurrentAccount(state);
  return safeObject(account?.riskSnapshot || account?.dashboardPayload?.riskSnapshot);
}

export function selectRiskSummary(state) {
  const snapshot = selectRiskSnapshot(state);
  const summary = safeObject(snapshot.summary);
  return {
    floatingDrawdownPct: toNumber(summary.floating_drawdown_pct),
    peakToEquityDrawdownPct: toNumber(summary.peak_to_equity_drawdown_pct),
    rollingMaxDrawdownPct: toNumber(summary.rolling_max_drawdown_pct),
    persistedMaxDrawdownPct: toNumber(summary.persisted_max_drawdown_pct),
    maxDrawdownLimitPct: toNumber(summary.max_drawdown_limit_pct),
    distanceToMaxDdLimitPct: toNumber(summary.distance_to_max_dd_limit_pct),
    dailyDrawdownPct: toNumber(summary.daily_drawdown_pct),
    dailyPeakEquity: toNumber(summary.daily_peak_equity),
    distanceToDailyDdLimitPct: toNumber(summary.distance_to_daily_dd_limit_pct),
    totalOpenRiskAmount: toNumber(summary.total_open_risk_amount),
    totalOpenRiskPct: toNumber(summary.total_open_risk_pct),
    maxRiskPerTradePct: toNumber(summary.max_risk_per_trade_pct),
    maxOpenTradeRiskPct: toNumber(summary.max_open_trade_risk_pct),
    openPositionsCount: toNumber(summary.open_positions_count),
    portfolioHeatLimitPct: Number.isFinite(Number(summary.portfolio_heat_limit_pct)) ? Number(summary.portfolio_heat_limit_pct) : null,
    distanceToHeatLimitPct: Number.isFinite(Number(summary.distance_to_heat_limit_pct)) ? Number(summary.distance_to_heat_limit_pct) : null,
    heatUsageRatioPct: Number.isFinite(Number(summary.heat_usage_ratio_pct)) ? Number(summary.heat_usage_ratio_pct) : null,
  };
}

export function selectRiskStatus(state) {
  const snapshot = selectRiskSnapshot(state);
  const status = safeObject(snapshot.status);
  const enforcement = safeObject(status.enforcement);
  return {
    riskStatus: String(status.risk_status || "unavailable"),
    severity: String(status.severity || "info"),
    reasonCode: String(status.reason_code || "UNAVAILABLE"),
    blockingRule: String(status.blocking_rule || ""),
    actionRequired: String(status.action_required || "Sin acción requerida."),
    allowNewTrades: toBoolean(enforcement.allow_new_trades),
    blockNewTrades: toBoolean(enforcement.block_new_trades),
    reduceSize: toBoolean(enforcement.reduce_size),
    closePositionsRequired: toBoolean(enforcement.close_positions_required),
  };
}

export function selectRiskLimits(state) {
  const snapshot = selectRiskSnapshot(state);
  const summary = selectRiskSummary(state);
  const policy = safeObject(snapshot.policy);
  const policyEvaluation = safeObject(snapshot.policy_evaluation);
  const limitsStatus = safeObject(policyEvaluation.limits_status);
  return {
    policy: {
      riskPerTradePct: toNumber(policy.risk_per_trade_pct),
      dailyDdLimitPct: toNumber(policy.daily_dd_limit_pct),
      maxDdLimitPct: toNumber(policy.max_dd_limit_pct),
      portfolioHeatLimitPct: Number.isFinite(Number(policy.portfolio_heat_limit_pct)) ? Number(policy.portfolio_heat_limit_pct) : null,
      maxVolume: toNumber(policy.max_volume),
      allowedSessions: safeArray(policy.allowed_sessions),
      allowedSymbols: safeArray(policy.allowed_symbols),
      autoBlockEnabled: toBoolean(policy.auto_block_enabled),
      currentLevel: String(policy.current_level || ""),
      recommendedLevel: String(policy.recommended_level || ""),
    },
    summary,
    evaluation: {
      ok: toBoolean(policyEvaluation.ok),
      breaches: safeArray(policyEvaluation.breaches),
      warnings: safeArray(policyEvaluation.warnings),
      limitsStatus,
    },
  };
}

export function selectRiskExposure(state) {
  const snapshot = selectRiskSnapshot(state);
  return {
    symbolExposure: safeArray(snapshot.symbol_exposure),
    openTradeRisks: safeArray(snapshot.open_trade_risks),
    metadata: safeObject(snapshot.metadata),
  };
}
