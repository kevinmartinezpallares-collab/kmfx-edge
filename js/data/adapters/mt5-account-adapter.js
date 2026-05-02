import { createAccountRecord } from "./internal-model-adapter.js";

function toFiniteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeReportMetrics(rawMetrics = {}, context = {}) {
  if (!rawMetrics || typeof rawMetrics !== "object" || !Object.keys(rawMetrics).length) {
    return null;
  }

  const normalized = {
    balance: toFiniteNumber(rawMetrics.balance, context.balance ?? 0),
    equity: toFiniteNumber(rawMetrics.equity, context.equity ?? context.balance ?? 0),
    netProfit: toFiniteNumber(rawMetrics.netProfit),
    grossProfit: toFiniteNumber(rawMetrics.grossProfit),
    grossLoss: toFiniteNumber(rawMetrics.grossLoss),
    winRate: toFiniteNumber(rawMetrics.winRate),
    totalTrades: toFiniteNumber(rawMetrics.totalTrades, context.totalTrades ?? 0),
    profitFactor: toFiniteNumber(rawMetrics.profitFactor),
    drawdownPct: toFiniteNumber(rawMetrics.drawdownPct),
    commissions: toFiniteNumber(rawMetrics.commissions),
    swaps: toFiniteNumber(rawMetrics.swaps),
    dividends: toFiniteNumber(rawMetrics.dividends),
    winTrades: toFiniteNumber(rawMetrics.winTrades),
    lossTrades: toFiniteNumber(rawMetrics.lossTrades),
    bestTrade: toFiniteNumber(rawMetrics.bestTrade),
    worstTrade: toFiniteNumber(rawMetrics.worstTrade),
    maxConsecutiveWins: toFiniteNumber(rawMetrics.maxConsecutiveWins),
    maxConsecutiveLosses: toFiniteNumber(rawMetrics.maxConsecutiveLosses),
    maxConsecutiveProfit: toFiniteNumber(rawMetrics.maxConsecutiveProfit),
    maxConsecutiveLoss: toFiniteNumber(rawMetrics.maxConsecutiveLoss),
    tradesPerWeek: toFiniteNumber(rawMetrics.tradesPerWeek),
    averageHoldMinutes: toFiniteNumber(rawMetrics.averageHoldMinutes),
    longCount: toFiniteNumber(rawMetrics.longCount),
    shortCount: toFiniteNumber(rawMetrics.shortCount),
    manualCount: toFiniteNumber(rawMetrics.manualCount),
    robotCount: toFiniteNumber(rawMetrics.robotCount),
    signalCount: toFiniteNumber(rawMetrics.signalCount),
    growthPct: toFiniteNumber(rawMetrics.growthPct),
    source: rawMetrics.source || "backend_mt5_report_metrics",
  };

  console.debug("[KMFX][REPORT_METRICS_READY]", {
    source: normalized.source,
    balance: normalized.balance,
    equity: normalized.equity,
    netProfit: normalized.netProfit,
    grossProfit: normalized.grossProfit,
    grossLoss: normalized.grossLoss,
    winRate: normalized.winRate,
    totalTrades: normalized.totalTrades,
    profitFactor: normalized.profitFactor,
    drawdownPct: normalized.drawdownPct,
  });

  return normalized;
}

function resolveMt5Connection(rawAccount = {}, dashboardPayload = {}) {
  const lifecycleStatus = String(rawAccount.status || "").toLowerCase();
  const payloadSource = dashboardPayload.payloadSource || dashboardPayload.profile?.payloadSource || "";
  const lastSync = rawAccount.last_sync_at || dashboardPayload.timestamp || dashboardPayload.last_sync_at || null;
  const hasLivePayload = payloadSource === "mt5_sync_live" && Object.keys(dashboardPayload || {}).length > 0;
  const isConnected = ["connected", "active", "first_sync_received"].includes(lifecycleStatus)
    || (Boolean(lastSync) && !["archived", "deleted", "error"].includes(lifecycleStatus))
    || hasLivePayload;

  if (lifecycleStatus === "error") return { state: "error", connected: false, lastSync };
  if (isConnected) return { state: "connected", connected: true, lastSync };
  if (["pending_link", "linked", "draft"].includes(lifecycleStatus)) return { state: "connecting", connected: false, lastSync };
  return { state: "disconnected", connected: false, lastSync };
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
  if (!startValue || !endValue) return null;
  const start = new Date(startValue);
  const end = new Date(endValue || startValue);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
}

function normalizeMt5Side(value, fallback = "BUY") {
  const side = String(value || fallback).trim().toUpperCase();
  return side === "SELL" ? "SELL" : "BUY";
}

function invertMt5Side(value) {
  return normalizeMt5Side(value) === "BUY" ? "SELL" : "BUY";
}

function resolveOriginalMt5Side(rawTrade = {}) {
  const direct = rawTrade.position_side || rawTrade.position_type || rawTrade.parent_side || rawTrade.original_side || rawTrade.open_type;
  if (direct) return normalizeMt5Side(direct);

  const entryMode = String(
    rawTrade.deal_entry
    || rawTrade.entry_type
    || rawTrade.entry
    || rawTrade.deal_type
    || ""
  ).trim().toLowerCase();

  const technicalSide = normalizeMt5Side(rawTrade.type || rawTrade.side || "BUY");
  if (["out", "out_by", "close", "close_by", "partial_out"].includes(entryMode)) {
    return invertMt5Side(technicalSide);
  }

  if (
    (rawTrade.position_id || rawTrade.positionId || rawTrade.position)
    && (rawTrade.close_time || rawTrade.time)
    && (rawTrade.open_time || rawTrade.entry_price || rawTrade.open_price || rawTrade.price_open)
  ) {
    return invertMt5Side(technicalSide);
  }

  return technicalSide;
}

function resolveTradeGroupKey(rawTrade = {}, index = 0) {
  return String(
    rawTrade.position_id
    || rawTrade.positionId
    || rawTrade.position
    || rawTrade.trade_id
    || rawTrade.order
    || rawTrade.ticket
    || `mt5-trade-${index}`
  );
}

function toWeightedAverage(totalValue, totalWeight) {
  if (!Number.isFinite(totalWeight) || totalWeight <= 0) return null;
  return totalValue / totalWeight;
}

function normalizeTrades(rawTrades = []) {
  const dayFormatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Andorra",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const monthFormatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Andorra",
    year: "numeric",
    month: "2-digit",
  });
  const toTradingDayKey = (value) => {
    const parsed = value ? new Date(value) : null;
    return parsed && !Number.isNaN(parsed.getTime()) ? dayFormatter.format(parsed) : "";
  };
  const toMonthKey = (value) => {
    const parsed = value ? new Date(value) : null;
    return parsed && !Number.isNaN(parsed.getTime()) ? monthFormatter.format(parsed) : "";
  };
  const normalizedDeals = (Array.isArray(rawTrades) ? rawTrades : []).map((trade, index) => {
    const date = toIsoString(trade.close_time || trade.time || trade.open_time);
    const profit = Number(trade.profit || 0);
    const commission = Number(trade.commission || 0);
    const swap = Number(trade.swap || 0);
    const dividend = Number(trade.dividend || 0);
    const fees = Number(trade.fees || trade.fee || 0);
    const netPnl = profit + commission + swap + dividend + fees;
    const technicalSide = normalizeMt5Side(trade.type || trade.side || "BUY");
    const originalSide = resolveOriginalMt5Side(trade);
    const volume = Number.isFinite(Number(trade.volume)) ? Number(trade.volume) : null;
    const entryPrice = Number.isFinite(Number(trade.entry || trade.entry_price || trade.open_price || trade.price_open))
      ? Number(trade.entry || trade.entry_price || trade.open_price || trade.price_open)
      : null;
    const exitPrice = Number.isFinite(Number(trade.exit || trade.exit_price || trade.close_price || trade.price_close || trade.price))
      ? Number(trade.exit || trade.exit_price || trade.close_price || trade.price_close || trade.price)
      : null;
    return {
      id: String(trade.ticket || `mt5-deal-${index}`),
      parentId: resolveTradeGroupKey(trade, index),
      date,
      closeTime: date,
      tradingDayKey: toTradingDayKey(date),
      monthKey: toMonthKey(date),
      symbol: trade.symbol || "UNKNOWN",
      side: originalSide,
      technicalSide,
      pnl: netPnl,
      net: netPnl,
      grossProfit: profit,
      profit,
      commission,
      swap,
      dividend,
      fees,
      rMultiple: Number(trade.r_multiple || trade.rMultiple || 0),
      setup: trade.comment || trade.strategy_tag || "MT5 sync",
      session: trade.session || inferSession(date),
      durationMin: durationMinutes(trade.open_time, trade.close_time),
      volume,
      entry: entryPrice,
      exit: exitPrice,
      sl: Number.isFinite(Number(trade.sl || trade.stop_loss)) ? Number(trade.sl || trade.stop_loss) : null,
      tp: Number.isFinite(Number(trade.tp || trade.take_profit)) ? Number(trade.tp || trade.take_profit) : null,
      openTime: trade.open_time || null,
      raw: trade,
    };
  });

  const groupedTrades = new Map();
  normalizedDeals.forEach((deal, index) => {
    const key = deal.parentId || deal.id || `mt5-trade-${index}`;
    if (!groupedTrades.has(key)) {
      groupedTrades.set(key, {
        id: key,
        parentId: key,
        date: deal.date,
        closeTime: deal.closeTime,
        tradingDayKey: deal.tradingDayKey,
        monthKey: deal.monthKey,
        symbol: deal.symbol,
        side: deal.side,
        pnl: 0,
        net: 0,
        grossProfit: 0,
        profit: 0,
        commission: 0,
        swap: 0,
        dividend: 0,
        fees: 0,
        rMultiple: 0,
        setup: deal.setup,
        session: deal.session || "—",
        durationMin: deal.durationMin,
        volume: 0,
        entry: deal.entry,
        exit: null,
        sl: deal.sl,
        tp: deal.tp,
        openTime: deal.openTime || null,
        partials: [],
        executions: [],
        __weightedExitSum: 0,
        __weightedExitVolume: 0,
      });
    }

    const aggregate = groupedTrades.get(key);
    aggregate.pnl += deal.pnl;
    aggregate.net += deal.net;
    aggregate.grossProfit += deal.grossProfit;
    aggregate.profit += deal.profit;
    aggregate.commission += deal.commission;
    aggregate.swap += deal.swap;
    aggregate.dividend += deal.dividend;
    aggregate.fees += deal.fees;
    aggregate.rMultiple += deal.rMultiple;
    aggregate.volume += Number.isFinite(Number(deal.volume)) ? Number(deal.volume) : 0;
    aggregate.closeTime = !aggregate.closeTime || new Date(deal.closeTime) > new Date(aggregate.closeTime) ? deal.closeTime : aggregate.closeTime;
    aggregate.date = aggregate.closeTime;
    aggregate.tradingDayKey = deal.tradingDayKey || aggregate.tradingDayKey;
    aggregate.monthKey = deal.monthKey || aggregate.monthKey;
    aggregate.side = aggregate.side || deal.side;
    if (!aggregate.entry && deal.entry != null) aggregate.entry = deal.entry;
    if (!aggregate.openTime && deal.openTime) aggregate.openTime = deal.openTime;
    if (aggregate.setup === "MT5 sync" && deal.setup !== "MT5 sync") aggregate.setup = deal.setup;
    if ((!aggregate.session || aggregate.session === "—") && deal.session) aggregate.session = deal.session;
    if (deal.exit != null && Number.isFinite(Number(deal.volume))) {
      aggregate.__weightedExitSum += Number(deal.exit) * Number(deal.volume);
      aggregate.__weightedExitVolume += Number(deal.volume);
    }

    const partial = {
      id: deal.id,
      parentId: key,
      side: deal.technicalSide,
      originalSide: deal.side,
      when: new Date(deal.closeTime),
      closeTime: deal.closeTime,
      volume: deal.volume,
      exit: deal.exit,
      pnl: deal.pnl,
      commission: deal.commission,
      swap: deal.swap,
      fees: deal.fees,
      net: deal.net,
      grossProfit: deal.grossProfit,
      cumulativePnl: Number((aggregate.pnl).toFixed(2)),
    };
    aggregate.partials.push(partial);
    aggregate.executions.push(partial);
  });

  return [...groupedTrades.values()]
    .map((trade) => {
      const partials = [...trade.partials].sort((a, b) => a.when - b.when);
      const firstPartial = partials[0] || null;
      const lastPartial = partials.at(-1) || null;
      const weightedExit = toWeightedAverage(trade.__weightedExitSum, trade.__weightedExitVolume);
      return {
        ...trade,
        date: trade.closeTime,
        closeTime: trade.closeTime,
        when: lastPartial?.when || new Date(trade.closeTime),
        durationMin: durationMinutes(trade.openTime || firstPartial?.closeTime, trade.closeTime),
        volume: Number.isFinite(Number(trade.volume)) ? Number(trade.volume) : null,
        exit: weightedExit,
        partials,
        executions: partials,
        partialCount: partials.length,
        entryTime: trade.openTime || null,
      };
    })
    .sort((a, b) => new Date(a.closeTime) - new Date(b.closeTime));
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
      return {
        label,
        value: numericValue,
        timestamp: parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate.toISOString() : null,
      };
    })
    .filter(Boolean);

  if (points.length) return points;

  const normalizedBalance = toFiniteNumber(balance);
  const normalizedEquity = toFiniteNumber(equity, normalizedBalance);
  return [
    { label: "Balance", value: normalizedBalance, timestamp: null },
    { label: "Equity", value: normalizedEquity, timestamp: null },
  ];
}

function normalizeRiskRules(rawRiskSnapshot = {}, rawPayload = {}) {
  const explicitRules = Array.isArray(rawPayload.riskRules) ? rawPayload.riskRules : [];
  if (explicitRules.length) {
    return explicitRules.map((rule) => ({
      title: rule.title || rule.name || "Regla",
      description: rule.description || rule.impact || rule.state || "Sin impacto",
      value: rule.value || rule.condition || "Sin condición",
      condition: rule.condition || rule.value || "Sin condición",
      state: rule.state || "ok",
      impact: rule.impact || rule.description || "Sin impacto",
      tone: rule.tone || "ok",
      isDominant: Boolean(rule.isDominant),
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
    condition: rule.value || "Sin condición",
    state: "ok",
    impact: rule.description || "Sin impacto",
    tone: "ok",
    isDominant: false,
  }));
}

function normalizeMt5Payload(rawPayload = {}) {
  const riskSnapshot = rawPayload.riskSnapshot || rawPayload.risk_snapshot || {};
  const summarySnapshot = riskSnapshot.summary || {};
  const policySnapshot = riskSnapshot.policy || riskSnapshot.policy_snapshot || rawPayload.policy_snapshot || {};
  const rawAccount = rawPayload.account && typeof rawPayload.account === "object" ? rawPayload.account : {};
  const symbolSpecs = rawPayload.symbolSpecs && typeof rawPayload.symbolSpecs === "object"
    ? rawPayload.symbolSpecs
    : rawPayload.symbol_specs && typeof rawPayload.symbol_specs === "object"
      ? rawPayload.symbol_specs
      : {};
  const payloadSource = rawPayload.payloadSource || "mt5_sync_live";
  const hasExplicitFloatingPnl = rawPayload.floatingPnl != null;
  const hasExplicitOpenPnl = rawPayload.openPnl != null || rawAccount.openPnl != null;
  const hasExplicitClosedPnl = rawPayload.closedPnl != null || rawPayload.realizedPnl != null;
  const hasExplicitTotalPnl = rawPayload.totalPnl != null || rawPayload.pnl != null;
  const hasExplicitOpenPositionsCount = rawPayload.openPositionsCount != null;
  const balance = toFiniteNumber(rawPayload.balance ?? rawAccount.balance, 0);
  const equity = toFiniteNumber(rawPayload.equity ?? rawAccount.equity, balance);
  const trades = normalizeTrades(rawPayload.trades || rawPayload.history?.trades || []);
  const positions = normalizePositions(rawPayload.positions || rawPayload.open_positions || []);
  const history = normalizeHistory(rawPayload.history || rawPayload.equityCurve || rawPayload.equity_curve || [], balance, equity);
  const rawReportMetrics = rawPayload.reportMetrics && typeof rawPayload.reportMetrics === "object"
    ? rawPayload.reportMetrics
    : rawPayload.report_metrics && typeof rawPayload.report_metrics === "object"
      ? rawPayload.report_metrics
      : {};
  const reportMetrics = normalizeReportMetrics(rawReportMetrics, {
    balance,
    equity,
    totalTrades: trades.length,
  });
  const openPositionsCount = hasExplicitOpenPositionsCount
    ? toFiniteNumber(rawPayload.openPositionsCount, positions.length)
    : positions.length;
  const floatingPnl = toFiniteNumber(
    hasExplicitFloatingPnl
      ? rawPayload.floatingPnl
      : hasExplicitOpenPnl
        ? (rawPayload.openPnl ?? rawAccount.openPnl)
        : 0,
    0,
  );
  const openPnl = openPositionsCount === 0 && !hasExplicitFloatingPnl && !hasExplicitOpenPnl
    ? 0
    : floatingPnl;
  const closedPnl = toFiniteNumber(rawPayload.closedPnl ?? rawPayload.realizedPnl, 0);
  const totalPnl = toFiniteNumber(rawPayload.totalPnl ?? rawPayload.pnl, hasExplicitClosedPnl ? closedPnl : 0);
  const winRate = toFiniteNumber(rawPayload.winrate ?? rawPayload.winRate ?? rawPayload.win_rate ?? rawAccount.winRate, trades.length ? (trades.filter((trade) => trade.pnl > 0).length / trades.length) * 100 : 0);
  const drawdownPct = toFiniteNumber(
    rawPayload.drawdown ?? rawPayload.drawdown_pct ?? rawPayload.max_drawdown_pct ?? rawAccount.drawdown ?? summarySnapshot.peak_to_equity_drawdown_pct,
    0,
  );
  console.debug("[KMFX][ADAPTER][MT5]", {
    balance,
    equity,
    openPnl,
    closedPnl,
    totalPnl,
    trades: trades.length,
    history: history.length,
    positions: positions.length,
    winRate,
    drawdownPct,
    payloadSource,
  });
  return {
    profile: {
      trader: rawPayload.trader || "MT5 Trader",
      desk: rawPayload.name || rawPayload.accountName || rawPayload.server || "MT5 Account",
      mode: rawPayload.mode || "MT5 Live",
      broker: rawPayload.broker || rawPayload.server || "MT5",
      tagline: rawPayload.tagline || "Cuenta conectada en vivo desde MT5.",
      payloadSource,
    },
    payloadSource,
    account: {
      balance,
      equity,
      floatingPnl,
      openPnl,
      closedPnl,
      totalPnl,
      pnl: totalPnl,
      winRate,
      drawdownPct,
      totalTrades: Number(rawPayload.totalTrades || trades.length),
      openPositionsCount,
      winRateTarget: Number(rawPayload.winRateTarget || winRate || 0),
      profitFactorTarget: Number(rawPayload.profitFactorTarget || 0),
      maxDrawdownLimit: Number(policySnapshot.max_dd_limit_pct || rawPayload.maxDrawdownLimit || 0),
      hasExplicitFloatingPnl,
      hasExplicitOpenPnl,
      hasExplicitClosedPnl,
      hasExplicitTotalPnl,
      hasExplicitOpenPositionsCount
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
    reportMetrics,
    symbolSpecs,
    positions,
    trades,
    history
  };
}

export function adaptMt5Account(rawAccount = {}) {
  const dashboardPayload = rawAccount.dashboard_payload && typeof rawAccount.dashboard_payload === "object"
    ? rawAccount.dashboard_payload
    : rawAccount.dashboardPayload && typeof rawAccount.dashboardPayload === "object"
      ? rawAccount.dashboardPayload
      : rawAccount.latest_payload && typeof rawAccount.latest_payload === "object"
        ? rawAccount.latest_payload
        : rawAccount.payload && typeof rawAccount.payload === "object"
          ? rawAccount.payload
          : rawAccount;
  const safeDashboardPayload = dashboardPayload && typeof dashboardPayload === "object" ? dashboardPayload : {};
  const rawReportMetrics = safeDashboardPayload.reportMetrics && typeof safeDashboardPayload.reportMetrics === "object"
    ? safeDashboardPayload.reportMetrics
    : safeDashboardPayload.report_metrics && typeof safeDashboardPayload.report_metrics === "object"
      ? safeDashboardPayload.report_metrics
      : null;

  console.log("[KMFX][ADAPTER]", {
    accountId: rawAccount.account_id || rawAccount.id || null,
    hasPayload: Boolean(safeDashboardPayload && Object.keys(safeDashboardPayload).length),
    hasReportMetrics: Boolean(rawReportMetrics),
  });

  let payload;
  try {
    payload = normalizeMt5Payload(safeDashboardPayload);
  } catch (error) {
    console.error("[KMFX][ADAPTER] adaptMt5Account normalizeMt5Payload failed", {
      accountId: rawAccount.account_id || rawAccount.id || null,
      message: error instanceof Error ? error.message : String(error),
    });
    payload = normalizeMt5Payload({});
  }
  const reportMetrics = payload?.reportMetrics || rawReportMetrics || null;
  console.debug("[KMFX][ACCOUNT][RAW]", {
    accountId: rawAccount.account_id || rawAccount.id || "",
    login: rawAccount.login || "",
    status: rawAccount.status || "",
    dashboardPayloadKeys: Object.keys(safeDashboardPayload || {}),
    trades: Array.isArray(safeDashboardPayload?.trades) ? safeDashboardPayload.trades.length : 0,
    history: Array.isArray(safeDashboardPayload?.history) ? safeDashboardPayload.history.length : 0,
    positions: Array.isArray(safeDashboardPayload?.positions) ? safeDashboardPayload.positions.length : 0,
  });
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
  const connection = resolveMt5Connection(rawAccount, safeDashboardPayload);

  return {
    ...record,
    login: rawAccount.login || "",
    platform: rawAccount.platform || "mt5",
    connectionMode: rawAccount.connection_mode || "bridge",
    dashboardPayload: reportMetrics
      ? { ...safeDashboardPayload, reportMetrics }
      : safeDashboardPayload,
    reportMetrics,
    riskSnapshot: safeDashboardPayload.riskSnapshot && typeof safeDashboardPayload.riskSnapshot === "object"
      ? safeDashboardPayload.riskSnapshot
      : {},
    connection: {
      ...record.connection,
      state: connection.state,
      source: rawAccount.connection_mode || "bridge",
      lastSync: connection.lastSync,
      connected: connection.connected,
    }
  };
}
