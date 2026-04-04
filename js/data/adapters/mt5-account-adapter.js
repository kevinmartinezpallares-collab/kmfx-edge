import { createAccountRecord } from "./internal-model-adapter.js";

function toIsoString(value) {
  if (!value) return new Date().toISOString();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString();
  return parsed.toISOString();
}

function inferSession(dateLike) {
  const date = new Date(dateLike);
  const hour = Number.isFinite(date.getUTCHours()) ? date.getUTCHours() : 0;
  if (hour < 7) return "Asia";
  if (hour < 13) return "London";
  return "New York";
}

function durationMinutes(startValue, endValue) {
  const start = new Date(startValue);
  const end = new Date(endValue || startValue);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
}

function normalizeTrades(rawTrades = []) {
  return (Array.isArray(rawTrades) ? rawTrades : []).map((trade, index) => {
    const date = toIsoString(trade.close_time || trade.time || trade.open_time);
    return {
      id: trade.position_id || trade.ticket || `mt5-trade-${index}`,
      date,
      symbol: trade.symbol || "UNKNOWN",
      side: String(trade.type || trade.side || "BUY").toUpperCase(),
      pnl: Number(trade.profit || 0),
      rMultiple: Number(trade.r_multiple || trade.rMultiple || 0),
      setup: trade.comment || trade.strategy_tag || "MT5 sync",
      session: trade.session || inferSession(date),
      durationMin: durationMinutes(trade.open_time || date, trade.close_time || date),
    };
  });
}

function normalizePositions(rawPositions = []) {
  return (Array.isArray(rawPositions) ? rawPositions : []).map((position, index) => ({
    id: position.position_id || position.ticket || `mt5-pos-${index}`,
    symbol: position.symbol || "UNKNOWN",
    side: String(position.type || position.side || "BUY").toUpperCase(),
    volume: Number(position.volume || position.size || 0),
    entry: Number(position.open_price || position.price_open || position.entry_price || 0),
    current: Number(position.current || position.price_current || position.current_price || 0),
    pnl: Number(position.profit || 0),
  }));
}

function normalizeRiskRules(rawRiskSnapshot = {}, rawPayload = {}) {
  const explicitRules = Array.isArray(rawPayload.riskRules) ? rawPayload.riskRules : [];
  if (explicitRules.length) {
    return explicitRules.map((rule) => ({
      title: rule.title || rule.name || "Regla",
      description: rule.description || rule.impact || rule.state || "Sin impacto",
      value: rule.value || rule.condition || "Sin condición",
    }));
  }

  const status = rawRiskSnapshot.status && typeof rawRiskSnapshot.status === "object" ? rawRiskSnapshot.status : {};
  const summary = rawRiskSnapshot.summary && typeof rawRiskSnapshot.summary === "object" ? rawRiskSnapshot.summary : {};
  if (!Object.keys(status).length && !Object.keys(summary).length) return [];

  const activeRules = [
    {
      title: status.blocking_rule || "Estado operativo",
      description: status.action_required || "Sin acción requerida",
      value: summary.peak_to_equity_drawdown_pct != null ? `${Number(summary.peak_to_equity_drawdown_pct).toFixed(2)}% DD` : "Sin DD",
    },
  ];
  return activeRules.map((rule) => ({
    title: rule.title || rule.name || "Regla",
    description: rule.description || rule.impact || rule.state || "Sin impacto",
    value: rule.value || rule.condition || "Sin condición",
  }));
}

function normalizeMt5Payload(rawPayload = {}) {
  const riskSnapshot = rawPayload.riskSnapshot || rawPayload.risk_snapshot || {};
  const summarySnapshot = riskSnapshot.summary || {};
  const policySnapshot = riskSnapshot.policy || riskSnapshot.policy_snapshot || rawPayload.policy_snapshot || {};
  return {
    profile: {
      trader: rawPayload.trader || "MT5 Trader",
      desk: rawPayload.name || rawPayload.accountName || rawPayload.server || "MT5 Account",
      mode: rawPayload.mode || "MT5 Live",
      broker: rawPayload.broker || rawPayload.server || "MT5",
      tagline: rawPayload.tagline || "Cuenta conectada en vivo desde MT5."
    },
    account: {
      balance: Number(rawPayload.balance || 0),
      equity: Number(rawPayload.equity || rawPayload.balance || 0),
      openPnl: Number(rawPayload.openPnl || rawPayload.profit || 0),
      winRateTarget: Number(rawPayload.winRateTarget || 0),
      profitFactorTarget: Number(rawPayload.profitFactorTarget || 0),
      maxDrawdownLimit: Number(policySnapshot.max_dd_limit_pct || rawPayload.maxDrawdownLimit || 0)
    },
    riskProfile: {
      currentRiskPct: Number(summarySnapshot.total_open_risk_pct || rawPayload.currentRiskPct || 0),
      dailyLossLimitPct: Number(policySnapshot.daily_dd_limit_pct || rawPayload.dailyLossLimitPct || 0),
      weeklyHeatLimitPct: Number(policySnapshot.max_dd_limit_pct || rawPayload.weeklyHeatLimitPct || 0),
      maxTradeRiskPct: Number(policySnapshot.risk_per_trade_pct || rawPayload.maxTradeRiskPct || 0),
      maxVolume: Number(policySnapshot.max_volume || rawPayload.maxVolume || 0),
      allowedSessions: Array.isArray(policySnapshot.allowed_sessions) ? policySnapshot.allowed_sessions : [],
      allowedSymbols: Array.isArray(policySnapshot.allowed_symbols) ? policySnapshot.allowed_symbols : [],
      autoBlock: Boolean(policySnapshot.auto_block_enabled)
    },
    riskRules: normalizeRiskRules(riskSnapshot, rawPayload),
    positions: normalizePositions(rawPayload.positions || []),
    trades: normalizeTrades(rawPayload.trades || [])
  };
}

export function adaptMt5Account(rawAccount = {}) {
  const payload = normalizeMt5Payload(rawAccount.dashboard_payload || rawAccount.payload || rawAccount);
  const record = createAccountRecord({
    id: rawAccount.account_id || rawAccount.id || rawAccount.login || "mt5-account",
    name: rawAccount.display_name || rawAccount.nickname || rawAccount.name || `${rawAccount.broker || "MT5"} · ${rawAccount.login || "Cuenta"}`,
    broker: rawAccount.broker || rawAccount.server || "MT5",
    sourceType: "mt5",
    payload,
    meta: {
      environment: rawAccount.environment || "live",
      server: rawAccount.server || null,
      platform: rawAccount.platform || "mt5",
      login: rawAccount.login || null,
      connectionMode: rawAccount.connection_mode || "bridge"
    }
  });

  return {
    ...record,
    login: rawAccount.login || "",
    platform: rawAccount.platform || "mt5",
    connectionMode: rawAccount.connection_mode || "bridge",
    connection: {
      ...record.connection,
      state: rawAccount.status || "disconnected",
      source: rawAccount.connection_mode || "bridge",
      lastSync: rawAccount.last_sync_at || null,
      connected: rawAccount.status === "connected",
    }
  };
}
