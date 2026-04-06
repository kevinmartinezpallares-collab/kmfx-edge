const esNumber = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 });
const esPct = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const weekdays = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const sessions = ["Asia", "London", "New York"];
import { DEFAULT_AUTH_STATE, selectVisibleUserProfile as selectAuthVisibleUserProfile, readPersistedAuthState } from "./auth-session.js?v=build-20260406-104500";
const symbolBasePrices = {
  EURUSD: 1.084,
  GBPUSD: 1.273,
  XAUUSD: 3024,
  USDJPY: 149.8,
  US30: 42840,
  NAS100: 18240
};

function readPreferredCurrency() {
  try {
    const settingsRaw = window.localStorage.getItem("kmfx.settings.preferences");
    if (settingsRaw) {
      const settings = JSON.parse(settingsRaw);
      if (settings?.baseCurrency === "EUR" || settings?.baseCurrency === "USD") {
        return settings.baseCurrency;
      }
    }
  } catch (error) {
    console.warn("[KMFX][UTILS] settings currency read failed", error);
  }

  try {
    const appRaw = window.localStorage.getItem("kmfx_frontend_state");
    if (appRaw) {
      const appState = JSON.parse(appRaw);
      const currency = appState?.workspace?.baseCurrency || appState?.preferences?.baseCurrency;
      if (currency === "EUR" || currency === "USD") return currency;
    }
  } catch (error) {
    console.warn("[KMFX][UTILS] app currency read failed", error);
  }

  return "USD";
}

function getCurrencySymbol(currency) {
  if (currency === "EUR") return "€";
  return "$";
}

function toLocalDayKey(dateLike) {
  const date = new Date(dateLike);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatCurrency(value, currencyOverride) {
  const amount = Number(value) || 0;
  const currency = currencyOverride || readPreferredCurrency();
  const symbol = getCurrencySymbol(currency);
  const sign = amount < 0 ? "-" : "";
  const abs = esNumber.format(Math.abs(amount));
  return `${sign}${symbol}${abs}`;
}

export function formatCompact(value) {
  if (Math.abs(value) >= 1000) return `${value > 0 ? "+" : ""}${(value / 1000).toFixed(1)}k`;
  return `${value > 0 ? "+" : ""}${Math.round(value)}`;
}

export function formatPercent(value) {
  return `${value > 0 ? "+" : ""}${esPct.format(value || 0)}%`;
}

export function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function getInitialsFromName(name = "") {
  return String(name || "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0] || "")
    .join("")
    .toUpperCase();
}

export function readVisibleUserProfile() {
  return selectAuthVisibleUserProfile({ auth: readPersistedAuthState() || DEFAULT_AUTH_STATE });
}

export function selectVisibleUserProfile(state) {
  return selectAuthVisibleUserProfile(state);
}

export function getAccountTypeLabel(mode = "", name = "") {
  const normalized = String(mode || "").toLowerCase();
  const normalizedName = String(name || "").toLowerCase();
  if (normalizedName.includes("macro swing") || normalized.includes("swing")) return "Cuenta swing";
  if (normalizedName.includes("apex evaluation") || normalized.includes("fondeo") || normalized.includes("fund") || normalized.includes("prop")) return "Cuenta fondeada";
  if (normalizedName.includes("kmfx master")) return "Cuenta principal";
  if (normalized.includes("fund") || normalized.includes("prop")) return "Cuenta fondeada";
  if (normalized.includes("sandbox") || normalized.includes("master") || normalized.includes("principal")) return "Cuenta principal";
  return "Cuenta principal";
}

export function resolveActiveAccountId(state) {
  const accounts = state?.accounts && typeof state.accounts === "object" ? state.accounts : {};
  const liveIds = Array.isArray(state?.liveAccountIds) ? state.liveAccountIds.filter((id) => accounts[id]) : [];
  const activeLiveAccountId = state?.activeLiveAccountId;
  const currentAccount = state?.currentAccount;

  if (liveIds.length > 0) {
    if (currentAccount && liveIds.includes(currentAccount)) return currentAccount;
    if (activeLiveAccountId && liveIds.includes(activeLiveAccountId)) return activeLiveAccountId;
    return liveIds[0] || null;
  }

  if (currentAccount && accounts[currentAccount]) return currentAccount;
  return Object.keys(accounts)[0] || null;
}

export function hasLiveAccounts(state) {
  return Array.isArray(state?.liveAccountIds) && state.liveAccountIds.length > 0;
}

export function resolveAccountPnlSummary(account) {
  const model = account?.model || {};
  const accountMetrics = model.account || {};
  const sourceTrace = model.sourceTrace || {};
  const sourceType = account?.sourceType || "";
  const payloadSource = sourceTrace.payloadSource || account?.dashboardPayload?.payloadSource || "";
  const usedExplicitLivePayload = Boolean(sourceTrace.usedExplicitLivePayload) || (sourceType === "mt5" && Boolean(payloadSource));
  const openPositionsCount = Number.isFinite(Number(sourceTrace.openPositionsCount))
    ? Number(sourceTrace.openPositionsCount)
    : Number.isFinite(Number(accountMetrics.openPositionsCount))
      ? Number(accountMetrics.openPositionsCount)
      : Array.isArray(model.positions)
        ? model.positions.length
        : 0;

  return {
    sourceType,
    payloadSource,
    heroOpenPnl: Number.isFinite(Number(sourceTrace.heroOpenPnl)) ? Number(sourceTrace.heroOpenPnl) : Number(accountMetrics.openPnl || 0),
    heroClosedPnl: Number.isFinite(Number(sourceTrace.heroClosedPnl)) ? Number(sourceTrace.heroClosedPnl) : Number(accountMetrics.closedPnl || 0),
    heroTotalPnl: Number.isFinite(Number(sourceTrace.heroTotalPnl)) ? Number(sourceTrace.heroTotalPnl) : Number(accountMetrics.totalPnl ?? model.totals?.pnl ?? 0),
    openPositionsCount,
    usedExplicitLivePayload,
  };
}

export function resolvePerformanceCardSource(account) {
  const model = account?.model || {};
  const accountMetrics = model.account || {};
  const pnlSummary = resolveAccountPnlSummary(account);
  const historyPoints = Array.isArray(model.equityCurve) ? model.equityCurve.length : 0;
  const mainPerformanceValue = pnlSummary.usedExplicitLivePayload && account?.sourceType === "mt5"
    ? Number(accountMetrics.equity ?? accountMetrics.balance ?? 0)
    : Number(accountMetrics.equity ?? pnlSummary.heroTotalPnl ?? 0);

  return {
    ...pnlSummary,
    mainPerformanceValue,
    historyPoints,
    sourceUsed: pnlSummary.usedExplicitLivePayload ? "mt5_live_payload" : "model_fallback",
    broker: account?.broker || account?.meta?.broker || "",
    login: account?.login || account?.meta?.login || "",
  };
}

export function buildDashboardModel(source) {
  const trades = source.trades
    .map((trade, index) => enrichTrade(trade, index))
    .sort((a, b) => a.when - b.when);
  const positions = (source.positions || []).map((position) => ({ ...position }));
  const riskProfile = source.riskProfile || {};
  const explicitHistory = Array.isArray(source.history)
    ? source.history
        .map((point, index) => {
          const numericValue = Number(point?.value);
          if (!Number.isFinite(numericValue)) return null;
          return {
            label: point?.label || `P${index + 1}`,
            value: numericValue,
          };
        })
        .filter(Boolean)
    : [];

  const payloadSource = source.payloadSource || source.profile?.payloadSource || "normalized";
  const usedExplicitLivePayload = payloadSource === "mt5_sync_live";
  const explicitOpenPositionsCount = Number.isFinite(Number(source.account.openPositionsCount))
    ? Number(source.account.openPositionsCount)
    : positions.length;
  const explicitFloatingPnl = Number(source.account.floatingPnl);
  const explicitOpenPnl = Number(source.account.openPnl);
  const explicitClosedPnl = Number(source.account.closedPnl);
  const explicitTotalPnl = Number(source.account.totalPnl ?? source.account.pnl);
  const heroOpenPnl = usedExplicitLivePayload
    ? (Number.isFinite(explicitFloatingPnl)
      ? explicitFloatingPnl
      : Number.isFinite(explicitOpenPnl)
        ? explicitOpenPnl
        : 0)
    : (Number.isFinite(explicitOpenPnl) ? explicitOpenPnl : 0);
  const heroClosedPnl = usedExplicitLivePayload
    ? (Number.isFinite(explicitClosedPnl) ? explicitClosedPnl : 0)
    : (Number.isFinite(explicitClosedPnl) ? explicitClosedPnl : trades.reduce((sum, trade) => sum + trade.pnl, 0));
  const totalPnl = usedExplicitLivePayload
    ? (Number.isFinite(explicitTotalPnl) ? explicitTotalPnl : heroClosedPnl)
    : Number.isFinite(explicitClosedPnl)
      ? explicitClosedPnl
      : trades.length
        ? trades.reduce((sum, trade) => sum + trade.pnl, 0)
        : Number(source.account.pnl ?? source.account.openPnl ?? 0);
  const wins = trades.filter((trade) => trade.pnl > 0);
  const losses = trades.filter((trade) => trade.pnl < 0);
  const startBalance = source.account.balance - totalPnl;
  const winRate = trades.length ? (wins.length / trades.length) * 100 : Number(source.account.winRate || 0);
  const grossProfit = wins.reduce((sum, trade) => sum + trade.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((sum, trade) => sum + trade.pnl, 0));
  const profitFactor = grossLoss ? grossProfit / grossLoss : grossProfit;
  const expectancy = trades.length ? totalPnl / trades.length : 0;
  const avgWin = wins.length ? grossProfit / wins.length : 0;
  const avgLoss = losses.length ? grossLoss / losses.length : 0;
  const rr = avgLoss ? avgWin / avgLoss : 0;
  const bestTrade = wins.reduce((best, trade) => Math.max(best, trade.pnl), 0);
  const worstTrade = losses.reduce((worst, trade) => Math.min(worst, trade.pnl), 0);

  let equity = startBalance;
  const generatedEquityCurve = trades.map((trade) => {
    equity += trade.pnl;
    return { label: trade.when.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit" }), value: equity };
  });
  const equityCurve = explicitHistory.length ? explicitHistory : generatedEquityCurve;

  const dayMap = new Map();
  trades.forEach((trade) => {
    const key = toLocalDayKey(trade.when);
    if (!dayMap.has(key)) dayMap.set(key, { pnl: 0, trades: 0, date: new Date(trade.when) });
    const entry = dayMap.get(key);
    entry.pnl += trade.pnl;
    entry.trades += 1;
  });

  const dayStats = [...dayMap.entries()].map(([key, value]) => ({ key, ...value })).sort((a, b) => a.key.localeCompare(b.key));
  const weekly = buildWeeklyStrip(dayStats);
  const monthlyReturns = buildMonthlyReturns(dayStats, startBalance);
  const calendar = buildCalendar(dayStats, trades[trades.length - 1]?.when || new Date());
  const symbols = buildGroupStats(trades, (trade) => trade.symbol);
  const sessionsBreakdown = buildGroupStats(trades, (trade) => trade.session, sessions);
  const hours = buildHourStats(trades);
  const weekdaysBreakdown = buildWeekdayStats(trades);
  const streaks = buildStreaks(trades);
  const drawdown = calculateDrawdown(startBalance, trades);
  const drawdownWithFallback = {
    ...drawdown,
    maxPct: trades.length ? drawdown.maxPct : Number(source.account.drawdownPct || 0),
  };
  const dailyReturns = buildDailyReturns(dayStats, startBalance);
  const ratios = calculateRatios(dailyReturns, monthlyReturns, totalPnl, drawdown);
  const profitDistribution = buildProfitDistribution(trades);
  const monthlyMatrix = buildMonthlyMatrix(monthlyReturns);
  const cumulative = buildCumulativeReturns(trades, startBalance);
  const riskSummary = buildRiskSummary({
    account: source.account,
    trades,
    dayStats,
    drawdown,
    totals: { totalPnl, expectancy, profitFactor, rr },
    positions,
    riskProfile,
    symbols,
    sessionsBreakdown
  });
  const monthlyBest = [...monthlyReturns].sort((a, b) => b.pnl - a.pnl)[0];
  const monthlyWorst = [...monthlyReturns].sort((a, b) => a.pnl - b.pnl)[0];
  const riskScore = Math.max(0, Math.min(100, Math.round((winRate * 0.38) + (Math.min(rr, 3) / 3 * 28) + ((100 - drawdown.maxPct * 6) * 0.34))));

  return {
    profile: {
      ...(source.profile || {})
    },
    trades,
    totals: {
      pnl: totalPnl,
      winRate,
      profitFactor,
      expectancy,
      avgWin,
      avgLoss,
      rr,
      bestTrade,
      worstTrade,
      totalTrades: Number(source.account.totalTrades || trades.length),
      bestMonth: monthlyBest,
      worstMonth: monthlyWorst,
      drawdown: drawdownWithFallback,
      riskScore,
      grossProfit,
      grossLoss,
      commissions: trades.length * 4,
      ratios
    },
    account: {
      ...source.account,
      balance: source.account.balance,
      equity: source.account.equity,
      floatingPnl: usedExplicitLivePayload
        ? heroOpenPnl
        : (Number.isFinite(explicitFloatingPnl) ? explicitFloatingPnl : source.account.openPnl),
      openPnl: heroOpenPnl,
      closedPnl: heroClosedPnl,
      totalPnl,
      pnl: totalPnl,
      openPositionsCount: explicitOpenPositionsCount
    },
    sourceTrace: {
      kind: source.profile?.mode || source.profile?.broker || "unknown",
      payloadSource,
      tradesCount: trades.length,
      positionsCount: positions.length,
      historyCount: explicitHistory.length,
      currentAccountPnl: heroOpenPnl,
      closedPnl: heroClosedPnl,
      heroOpenPnl,
      heroClosedPnl,
      heroTotalPnl: totalPnl,
      openPositionsCount: explicitOpenPositionsCount,
      usedExplicitLivePayload,
    },
    riskProfile,
    riskRules: [...(source.riskRules || [])],
    positions,
    recentTrades: [...trades].slice(-6).reverse(),
    dayStats,
    weekly,
    equityCurve,
    drawdownCurve: drawdownWithFallback.curve,
    monthlyReturns,
    monthlyMatrix,
    calendar,
    symbols,
    sessions: sessionsBreakdown,
    hours,
    weekdays: weekdaysBreakdown,
    streaks,
    profitDistribution,
    dailyReturns,
    cumulative,
    riskSummary
  };
}

export function selectCurrentAccount(state) {
  const activeAccountId = resolveActiveAccountId(state);
  return activeAccountId ? state?.accounts?.[activeAccountId] || null : null;
}

export function selectCurrentModel(state) {
  const account = selectCurrentAccount(state);
  return account?.model || null;
}

export function selectCurrentDashboardPayload(state) {
  const account = selectCurrentAccount(state);
  return account?.dashboardPayload && typeof account.dashboardPayload === "object" ? account.dashboardPayload : {};
}

function buildWeeklyStrip(dayStats) {
  const last = dayStats[dayStats.length - 1]?.date || new Date();
  const end = new Date(last);
  end.setDate(end.getDate() + (6 - end.getDay()));
  const start = new Date(end);
  start.setDate(end.getDate() - 6);
  const strip = [];
  for (let i = 0; i < 7; i += 1) {
    const current = new Date(start);
    current.setDate(start.getDate() + i);
    const key = toLocalDayKey(current);
    const day = dayStats.find((entry) => entry.key === key);
    strip.push({
      label: weekdays[current.getDay()],
      key,
      pnl: day?.pnl || 0,
      trades: day?.trades || 0,
      state: day ? (day.pnl >= 0 ? "win" : "loss") : "flat"
    });
  }
  return strip;
}

function buildMonthlyReturns(dayStats, startBalance) {
  const months = new Map();
  let runningBalance = startBalance;
  dayStats.forEach((day) => {
    const date = day.date;
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    if (!months.has(key)) months.set(key, {
      key,
      label: date.toLocaleDateString("es-ES", { month: "short", year: "numeric" }),
      pnl: 0,
      trades: 0,
      startBalance: runningBalance
    });
    const month = months.get(key);
    month.pnl += day.pnl;
    month.trades += day.trades;
    runningBalance += day.pnl;
  });
  return [...months.values()].map((month) => ({
    ...month,
    returnPct: month.startBalance ? (month.pnl / month.startBalance) * 100 : 0
  }));
}

function buildMonthlyMatrix(monthlyReturns) {
  const monthNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  const years = new Map();
  monthlyReturns.forEach((month) => {
    const [year, monthNumber] = month.key.split("-");
    if (!years.has(year)) {
      years.set(year, {
        year,
        months: Array.from({ length: 12 }, (_, index) => ({
          label: monthNames[index],
          pnl: null,
          returnPct: null,
          trades: 0
        })),
        totalPnl: 0,
        totalReturnPct: 0
      });
    }
    const bucket = years.get(year);
    const idx = Number(monthNumber) - 1;
    bucket.months[idx] = {
      label: monthNames[idx],
      pnl: month.pnl,
      returnPct: month.returnPct,
      trades: month.trades
    };
    bucket.totalPnl += month.pnl;
    bucket.totalReturnPct += month.returnPct;
  });
  return [...years.values()];
}

function buildGroupStats(trades, getKey, order = []) {
  const map = new Map();
  trades.forEach((trade) => {
    const key = getKey(trade);
    if (!map.has(key)) map.set(key, { key, pnl: 0, trades: 0, wins: 0, grossProfit: 0, grossLoss: 0 });
    const entry = map.get(key);
    entry.pnl += trade.pnl;
    entry.trades += 1;
    if (trade.pnl > 0) {
      entry.wins += 1;
      entry.grossProfit += trade.pnl;
    } else {
      entry.grossLoss += Math.abs(trade.pnl);
    }
  });
  const items = [...map.values()].map((entry) => ({
    ...entry,
    winRate: entry.trades ? (entry.wins / entry.trades) * 100 : 0,
    avgPnl: entry.trades ? entry.pnl / entry.trades : 0,
    avgWin: entry.wins ? entry.grossProfit / entry.wins : 0,
    avgLoss: entry.trades - entry.wins ? entry.grossLoss / (entry.trades - entry.wins) : 0,
    profitFactor: entry.grossLoss ? entry.grossProfit / entry.grossLoss : entry.grossProfit
  }));
  if (!order.length) return items.sort((a, b) => b.pnl - a.pnl);
  return order.map((key) => items.find((item) => item.key === key) || {
    key, pnl: 0, trades: 0, wins: 0, grossProfit: 0, grossLoss: 0, winRate: 0, avgPnl: 0, avgWin: 0, avgLoss: 0, profitFactor: 0
  });
}

function buildHourStats(trades) {
  const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, pnl: 0, trades: 0 }));
  trades.forEach((trade) => {
    const hour = trade.when.getHours();
    hours[hour].pnl += trade.pnl;
    hours[hour].trades += 1;
  });
  return hours;
}

function buildWeekdayStats(trades) {
  const stats = weekdays.map((label, index) => ({ index, label, pnl: 0, trades: 0 }));
  trades.forEach((trade) => {
    const bucket = stats[trade.when.getDay()];
    bucket.pnl += trade.pnl;
    bucket.trades += 1;
  });
  return stats.filter((item) => item.index !== 0);
}

function buildStreaks(trades) {
  let currentWin = 0;
  let currentLoss = 0;
  let bestWin = 0;
  let bestLoss = 0;

  trades.forEach((trade) => {
    if (trade.pnl > 0) {
      currentWin += 1;
      currentLoss = 0;
      bestWin = Math.max(bestWin, currentWin);
    } else {
      currentLoss += 1;
      currentWin = 0;
      bestLoss = Math.max(bestLoss, currentLoss);
    }
  });

  return { bestWin, bestLoss };
}

function calculateDrawdown(startBalance, trades) {
  let balance = startBalance;
  let peak = startBalance;
  let maxAmount = 0;
  let maxPct = 0;
  const curve = [];
  trades.forEach((trade) => {
    balance += trade.pnl;
    peak = Math.max(peak, balance);
    const ddAmount = peak - balance;
    const ddPct = peak ? (ddAmount / peak) * 100 : 0;
    maxAmount = Math.max(maxAmount, ddAmount);
    maxPct = Math.max(maxPct, ddPct);
    curve.push({ label: trade.when.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit" }), value: ddPct });
  });
  return { maxAmount, maxPct, curve };
}

function buildCalendar(dayStats, anchorDate) {
  const first = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1);
  const last = new Date(anchorDate.getFullYear(), anchorDate.getMonth() + 1, 0);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  const end = new Date(last);
  end.setDate(last.getDate() + (6 - last.getDay()));

  const cells = [];
  for (let current = new Date(start); current <= end; current.setDate(current.getDate() + 1)) {
    const key = toLocalDayKey(current);
    const day = dayStats.find((entry) => entry.key === key);
    cells.push({
      key,
      inMonth: current.getMonth() === anchorDate.getMonth(),
      date: new Date(current),
      pnl: day?.pnl || 0,
      trades: day?.trades || 0
    });
  }

  return {
    monthLabel: anchorDate.toLocaleDateString("es-ES", { month: "long", year: "numeric" }),
    headers: weekdays,
    cells
  };
}

export function buildPolyline(points, width = 760, height = 180, padding = 22) {
  if (!points.length) return "";
  const min = Math.min(...points.map((point) => point.value));
  const max = Math.max(...points.map((point) => point.value));
  const range = max - min || 1;
  return points.map((point, index) => {
    const x = padding + (index / Math.max(points.length - 1, 1)) * (width - padding * 2);
    const y = height - padding - ((point.value - min) / range) * (height - padding * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}

export function buildBars(values, width = 760, height = 180, padding = 24) {
  if (!values.length) return [];
  const max = Math.max(...values.map((item) => Math.abs(item.value)), 1);
  const barWidth = Math.max(10, (width - padding * 2) / values.length - 8);
  return values.map((item, index) => {
    const x = padding + index * ((width - padding * 2) / values.length) + 4;
    const valueHeight = (Math.abs(item.value) / max) * (height - padding * 2);
    const y = item.value >= 0 ? height / 2 - valueHeight : height / 2;
    return {
      ...item,
      x,
      y,
      width: barWidth,
      height: Math.max(2, valueHeight)
    };
  });
}

function buildDailyReturns(dayStats, startBalance) {
  let runningBalance = startBalance;
  return dayStats.map((day) => {
    const start = runningBalance;
    runningBalance += day.pnl;
    return {
      ...day,
      returnPct: start ? (day.pnl / start) * 100 : 0
    };
  });
}

function calculateRatios(dailyReturns, monthlyReturns, totalPnl, drawdown) {
  const dailyPct = dailyReturns.map((day) => day.returnPct / 100);
  const mean = average(dailyPct);
  const std = standardDeviation(dailyPct);
  const downside = standardDeviation(dailyPct.filter((value) => value < 0));
  const monthlyMean = average(monthlyReturns.map((month) => month.returnPct / 100));
  const sharpe = std ? (mean / std) * Math.sqrt(252) : 0;
  const sortino = downside ? (mean / downside) * Math.sqrt(252) : 0;
  const calmar = drawdown.maxPct ? ((monthlyMean * 12) * 100) / drawdown.maxPct : 0;
  const recovery = drawdown.maxAmount ? totalPnl / drawdown.maxAmount : totalPnl;
  return { sharpe, sortino, calmar, recovery };
}

function buildProfitDistribution(trades) {
  const bins = [
    { label: "< -200", min: -Infinity, max: -200, count: 0 },
    { label: "-200 / -50", min: -200, max: -50, count: 0 },
    { label: "-50 / 50", min: -50, max: 50, count: 0 },
    { label: "50 / 200", min: 50, max: 200, count: 0 },
    { label: "> 200", min: 200, max: Infinity, count: 0 }
  ];
  trades.forEach((trade) => {
    const bin = bins.find((item) => trade.pnl > item.min && trade.pnl <= item.max);
    if (bin) bin.count += 1;
  });
  return bins;
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values) {
  if (!values.length) return 0;
  const mean = average(values);
  const variance = average(values.map((value) => (value - mean) ** 2));
  return Math.sqrt(variance);
}

function enrichTrade(trade, index) {
  const when = new Date(trade.date);
  const base = symbolBasePrices[trade.symbol] || 100;
  const step = base < 10 ? 0.0012 : base < 1000 ? 0.85 : 34;
  const move = ((Math.abs(trade.pnl) % 9) + 3) / 10;
  const direction = trade.side === "BUY" ? 1 : -1;
  const entry = base + index * step * 0.08;
  const exit = entry + direction * step * move;
  const sl = entry - direction * step * 0.9;
  const tp = entry + direction * step * 1.8;
  const volume = Number((0.2 + (Math.abs(trade.pnl) % 5) * 0.15).toFixed(2));
  return {
    ...trade,
    when,
    volume,
    entry: roundPrice(entry),
    exit: roundPrice(exit),
    sl: roundPrice(sl),
    tp: roundPrice(tp)
  };
}

function roundPrice(value) {
  if (value > 1000) return Number(value.toFixed(1));
  if (value > 100) return Number(value.toFixed(2));
  return Number(value.toFixed(4));
}

function buildCumulativeReturns(trades, startBalance) {
  let runningBalance = startBalance;
  let cumulativePct = 0;
  const curve = trades.map((trade) => {
    runningBalance += trade.pnl;
    cumulativePct = startBalance ? ((runningBalance - startBalance) / startBalance) * 100 : 0;
    return {
      label: trade.when.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit" }),
      value: cumulativePct,
      pnl: runningBalance - startBalance
    };
  });
  return {
    totalPct: cumulativePct,
    totalUsd: runningBalance - startBalance,
    curve,
    lastUpdate: trades[trades.length - 1]?.when || null
  };
}

function buildRiskSummary({ account, trades, dayStats, drawdown, totals, positions, riskProfile, symbols, sessionsBreakdown }) {
  const todayKey = trades[trades.length - 1]?.when ? toLocalDayKey(trades[trades.length - 1].when) : "";
  const todayStats = dayStats.find((day) => day.key === todayKey);
  const currentRiskUsd = account.balance * ((riskProfile.currentRiskPct || 0.5) / 100);
  const ddBudgetUsd = account.balance * ((account.maxDrawdownLimit || riskProfile.weeklyHeatLimitPct || 10) / 100);
  const marginTrades = currentRiskUsd ? Math.floor((ddBudgetUsd - drawdown.maxAmount) / currentRiskUsd) : 0;
  const allowedSymbols = riskProfile.allowedSymbols || symbols.map((item) => item.key);
  const sessionConcentration = sessionsBreakdown.find((item) => item.key === "London")?.trades || 0;
  const totalSessionTrades = sessionsBreakdown.reduce((sum, item) => sum + item.trades, 0) || 1;
  const securityLevel = drawdown.maxPct < 4 && (todayStats?.pnl || 0) > -(account.balance * 0.01) ? "Seguro" : drawdown.maxPct < 7 ? "Vigilando" : "Presion";
  const securityProgress = Math.min(100, Math.max(8, 100 - drawdown.maxPct * 10 - Math.abs(todayStats?.pnl || 0) / 20));
  return {
    currentRiskUsd,
    currentRiskPct: riskProfile.currentRiskPct || 0.5,
    marginTrades,
    dailyLossUsd: Math.min(0, todayStats?.pnl || 0),
    securityLevel,
    securityProgress,
    securityMessage: securityLevel === "Seguro"
      ? "Riesgo bajo control y capital protegido."
      : securityLevel === "Vigilando"
        ? "Hay presión moderada. Conviene bajar agresividad."
        : "La curva exige modo defensivo inmediato.",
    guardrails: [
      { title: "Control de Drawdown", description: "DD total y DD diario", status: drawdown.maxPct < 8 ? "Activo" : "Alerta", value: `${(account.maxDrawdownLimit || 10).toFixed(1)}% · ${(riskProfile.dailyLossLimitPct || 1.2).toFixed(1)}%` },
      { title: "Riesgo por Trade", description: "% máximo por operación", status: "Activo", value: `${(riskProfile.maxTradeRiskPct || 1).toFixed(2)}%` },
      { title: "Horarios Permitidos", description: "Ventanas operativas UTC", status: "Activo", value: `${(riskProfile.allowedSessions || ["London"]).join(" · ")} UTC` },
      { title: "Control de Volumen", description: "Lote máximo por trade", status: "Activo", value: `${riskProfile.maxVolume || 1.5} lotes` },
      { title: "Símbolos Permitidos", description: "Universo habilitado", status: "Activo", value: allowedSymbols.join(" · ") },
      { title: "Bloqueo Automático", description: "Cierre o pausa por límites", status: riskProfile.autoBlock ? "Activo" : "Off", value: riskProfile.autoBlock ? "ON" : "OFF" }
    ],
    ladder: [
      { level: "BASE", riskPct: 0.5, condition: "Inicio / reset", rise: "1 win -> +1", fall: "Nivel mínimo", state: "Arranque" },
      { level: "+1", riskPct: 0.75, condition: "1 win consecutivo", rise: "1 win -> +2", fall: "1 loss -> BASE", state: "Momentum" },
      { level: "+2", riskPct: 1.0, condition: "2 wins consecutivos", rise: "1 win -> +3", fall: "1 loss -> +1", state: "Optimo" },
      { level: "+3", riskPct: 1.25, condition: "3 wins consecutivos", rise: "1 win -> MAX", fall: "1 loss -> +1", state: "Alto rendimiento" },
      { level: "MAX", riskPct: 1.5, condition: "4+ wins consecutivos", rise: "Techo", fall: "1 loss -> +2", state: "Peak" },
      { level: "PROTECT", riskPct: 0.25, condition: "2 losses consecutivos", rise: "2 wins -> BASE", fall: "Modo minimo", state: "Proteccion" }
    ],
    stopRules: [
      { tone: "red", text: "DD diario >= 1.2% -> stop total del dia" },
      { tone: "red", text: "2 losses seguidos -> activar PROTECT" },
      { tone: "orange", text: "1 loss desde niveles altos -> reducir agresividad" },
      { tone: "green", text: "Objetivo diario cumplido -> stop voluntario" }
    ],
    ledger: [
      { metric: "Expectativa", value: totals.expectancy, format: "currency", note: "Resultado esperado por trade" },
      { metric: "Profit Factor", value: totals.profitFactor, format: "number", note: "Sostenibilidad de la curva" },
      { metric: "Recovery Capacity", value: account.balance - drawdown.maxAmount, format: "currency", note: "Capital util tras DD" },
      { metric: "Session Concentration", value: totalSessionTrades ? (sessionConcentration / totalSessionTrades) * 100 : 0, format: "percent", note: "Peso de London en el sample" },
      { metric: "Open Exposure", value: positions.reduce((sum, item) => sum + Math.abs(item.pnl), 0), format: "currency", note: "Exposicion flotante" },
      { metric: "R:R Medio", value: totals.rr, format: "number", note: "Calidad de salida" }
    ]
  };
}
