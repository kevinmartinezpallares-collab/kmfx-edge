import { createAccountRecord } from "./internal-model-adapter.js";

function toFiniteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toIsoString(value) {
  if (!value) return new Date().toISOString();
  if (typeof value === "string") {
    const mt5Match = value.match(/^(\d{4})\.(\d{2})\.(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/);
    if (mt5Match) {
      const [, year, month, day, hour, minute, second] = mt5Match;
      return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`).toISOString();
    }
  }
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
    const netPnl = Number(trade.profit || 0) + Number(trade.commission || 0) + Number(trade.swap || 0);
    return {
      id: trade.position_id || trade.ticket || `mt5-trade-${index}`,
      date,
      symbol: trade.symbol || "UNKNOWN",
      side: String(trade.type || trade.side || "BUY").toUpperCase(),
      pnl: netPnl,
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

function normalizeHistory(rawHistory = [], balance = 0, equity = 0) {
  const points = (Array.isArray(rawHistory) ? rawHistory : [])
    .map((point, index) => {
      const labelSource = point.label || point.timestamp || point.time || point.date || point.at || "";
      const value = point.value ?? point.equity ?? point.balance ?? point.pnl;
      const numericValue = Number(value);
      if (!Number.isFinite(numericValue)) return null;
      const parsedDate = labelSource ? new Date(toIsoString(labelSource)) : null;
      const label = parsedDate && !Number.isNaN(parsedDate.getTime())
        ? parsedDate.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit" })
        : `P${index + 1}`;
      return { label, value: numericValue };
    })
    .filter(Boolean);

  if (points.length) return points;

  const normalizedBalance = toFiniteNumber(balance);
  const normalizedEquity = toFiniteNumber(equity, normalizedBalance);
  return [
    { label: "Balance", value: normalizedBalance },
    { label: "Equity", value: normalizedEquity },
  ];
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
  const rawAccount = rawPayload.account && typeof rawPayload.account === "object" ? rawPayload.account : {};
  const balance = toFiniteNumber(rawPayload.balance ?? rawAccount.balance, 0);
  const equity = toFiniteNumber(rawPayload.equity ?? rawAccount.equity, balance);
  const openPnl = toFiniteNumber(rawPayload.openPnl ?? rawPayload.pnl ?? rawPayload.profit ?? rawAccount.openPnl ?? rawAccount.profit, equity - balance);
  const trades = normalizeTrades(rawPayload.trades || rawPayload.history?.trades || []);
  const positions = normalizePositions(rawPayload.positions || rawPayload.open_positions || []);
  const history = normalizeHistory(rawPayload.history || rawPayload.equityCurve || rawPayload.equity_curve || [], balance, equity);
  const winRate = toFiniteNumber(rawPayload.winrate ?? rawPayload.winRate ?? rawPayload.win_rate ?? rawAccount.winRate, trades.length ? (trades.filter((trade) => trade.pnl > 0).length / trades.length) * 100 : 0);
  const drawdownPct = toFiniteNumber(
    rawPayload.drawdown ?? rawPayload.drawdown_pct ?? rawPayload.max_drawdown_pct ?? rawAccount.drawdown ?? summarySnapshot.peak_to_equity_drawdown_pct,
    0,
  );
  return {
    profile: {
      trader: rawPayload.trader || "MT5 Trader",
      desk: rawPayload.name || rawPayload.accountName || rawPayload.server || "MT5 Account",
      mode: rawPayload.mode || "MT5 Live",
      broker: rawPayload.broker || rawPayload.server || "MT5",
      tagline: rawPayload.tagline || "Cuenta conectada en vivo desde MT5."
    },
    account: {
      balance,
      equity,
      openPnl,
      pnl: openPnl,
      winRate,
      drawdownPct,
      totalTrades: trades.length,
      openPositionsCount: positions.length,
      winRateTarget: Number(rawPayload.winRateTarget || winRate || 0),
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
    positions,
    trades,
    history
  };
}

export function adaptMt5Account(rawAccount = {}) {
  const dashboardPayload = rawAccount.dashboard_payload && typeof rawAccount.dashboard_payload === "object"
    ? rawAccount.dashboard_payload
    : rawAccount.payload && typeof rawAccount.payload === "object"
      ? rawAccount.payload
      : rawAccount;
  const payload = normalizeMt5Payload(dashboardPayload);
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
    dashboardPayload,
    riskSnapshot: dashboardPayload.riskSnapshot && typeof dashboardPayload.riskSnapshot === "object"
      ? dashboardPayload.riskSnapshot
      : {},
    connection: {
      ...record.connection,
      state: rawAccount.status || "disconnected",
      source: rawAccount.connection_mode || "bridge",
      lastSync: rawAccount.last_sync_at || null,
      connected: rawAccount.status === "connected",
    }
  };
}
