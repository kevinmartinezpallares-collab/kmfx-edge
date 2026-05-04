const esNumber = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 });
const esPct = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const weekdays = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const sessions = ["Asia", "London", "New York"];
const ACCOUNTING_TIMEZONE = "Europe/Andorra";
const dayKeyFormatter = new Intl.DateTimeFormat("sv-SE", {
  timeZone: ACCOUNTING_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const monthKeyFormatter = new Intl.DateTimeFormat("sv-SE", {
  timeZone: ACCOUNTING_TIMEZONE,
  year: "numeric",
  month: "2-digit",
});
const monthLabelFormatter = new Intl.DateTimeFormat("es-ES", {
  timeZone: ACCOUNTING_TIMEZONE,
  month: "short",
  year: "numeric",
});
import { DEFAULT_AUTH_STATE, selectVisibleUserProfile as selectAuthVisibleUserProfile, readPersistedAuthState } from "./auth-session.js?v=build-20260504-074512";
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

const MT5_ACCOUNT_CURRENCIES = new Set(["USD", "EUR", "GBP", "JPY"]);

function normalizeCurrencyCode(currency) {
  const code = typeof currency === "string" ? currency.trim().toUpperCase() : "";
  return MT5_ACCOUNT_CURRENCIES.has(code) ? code : "";
}

function getCurrencySymbol(currency) {
  const code = normalizeCurrencyCode(currency) || "USD";
  if (code === "EUR") return "€";
  if (code === "GBP") return "£";
  if (code === "JPY") return "¥";
  return "$";
}

export function getCurrencyFromModel(model) {
  const currency = normalizeCurrencyCode(model?.account?.currency);
  if (currency) return currency;
  return readPreferredCurrency();
}

function toLocalDayKey(dateLike) {
  const date = normalizeDateLike(dateLike);
  return date ? dayKeyFormatter.format(date) : "";
}

function toLocalMonthKey(dateLike) {
  const date = normalizeDateLike(dateLike);
  return date ? monthKeyFormatter.format(date) : "";
}

export function formatCurrency(value, currencyOverride) {
  const amount = Number(value) || 0;
  const currency = normalizeCurrencyCode(currencyOverride) || readPreferredCurrency();
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

export function formatDurationHuman(value) {
  const totalMinutes = Number(value);
  if (!Number.isFinite(totalMinutes) || totalMinutes < 0) return "—";

  const rounded = Math.round(totalMinutes);
  if (rounded < 60) return `${rounded} min`;

  const minutesPerDay = 24 * 60;
  const days = Math.floor(rounded / minutesPerDay);
  const hours = Math.floor((rounded % minutesPerDay) / 60);
  const minutes = rounded % 60;

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);

  return parts.join(" ");
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

function normalizeDateLike(value, unixFallbackSeconds) {
  const unixSeconds = Number(unixFallbackSeconds);
  if (Number.isFinite(unixSeconds) && unixSeconds > 0) {
    return new Date(unixSeconds * 1000);
  }
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "string") {
    const mt5Match = value.match(/^(\d{4})\.(\d{2})\.(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/);
    if (mt5Match) {
      const [, year, month, day, hour, minute, second] = mt5Match;
      const parsed = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function resolveTradeNet(trade) {
  const grossProfit = Number.isFinite(Number(trade?.grossProfit))
    ? Number(trade.grossProfit)
    : Number.isFinite(Number(trade?.profit))
      ? Number(trade.profit)
      : 0;
  const commission = Number.isFinite(Number(trade?.commission)) ? Number(trade.commission) : 0;
  const swap = Number.isFinite(Number(trade?.swap)) ? Number(trade.swap) : 0;
  const dividend = Number.isFinite(Number(trade?.dividend)) ? Number(trade.dividend) : 0;
  const fees = Number.isFinite(Number(trade?.fees))
    ? Number(trade.fees)
    : Number.isFinite(Number(trade?.fee))
      ? Number(trade.fee)
      : 0;
  const explicitNet = Number(trade?.net);
  const explicitPnl = Number(trade?.pnl);
  const hasExplicitNet = Number.isFinite(explicitNet);
  const hasExplicitPnl = Number.isFinite(explicitPnl);
  const net = hasExplicitNet
    ? explicitNet
    : hasExplicitPnl
      ? explicitPnl
      : grossProfit + commission + swap + dividend + fees;
  const closeTime = trade?.closeTime || trade?.close_time || trade?.time || trade?.when || trade?.date || "";
  const mode = hasExplicitNet ? "explicit_net" : hasExplicitPnl ? "explicit_pnl" : "profit_plus_costs";
  console.debug("[KMFX][TRADE_NET_AUDIT]", {
    id: trade?.id || trade?.ticket || trade?.trade_id || "",
    source: trade?.source || "model",
    profit: grossProfit,
    commission,
    swap,
    fees,
    grossProfit,
    net,
    mode,
    closeTime,
  });
  return { net, grossProfit, commission, swap, dividend, fees, mode };
}

function getTradeCloseDate(trade) {
  return normalizeDateLike(
    trade?.closeTime ||
    trade?.close_time ||
    trade?.time ||
    trade?.when ||
    trade?.date,
    trade?.close_time_unix || trade?.time_unix
  );
}

function buildDailyPnlMap(trades) {
  const dayMap = new Map();
  trades.forEach((trade) => {
    const accountingDate = getTradeCloseDate(trade);
    const key = trade.tradingDayKey || toLocalDayKey(accountingDate);
    if (!key) return;
    if (!dayMap.has(key)) {
      const dayDate = accountingDate || new Date();
      dayMap.set(key, {
        key,
        pnl: 0,
        grossProfit: 0,
        grossLoss: 0,
        commission: 0,
        swap: 0,
        trades: 0,
        date: dayDate,
        monthKey: trade.monthKey || toLocalMonthKey(dayDate),
      });
    }
    const entry = dayMap.get(key);
    const net = Number.isFinite(Number(trade.net)) ? Number(trade.net) : Number(trade.pnl || 0);
    const profit = Number.isFinite(Number(trade.grossProfit)) ? Number(trade.grossProfit) : Number(trade.profit || 0);
    const commission = Number.isFinite(Number(trade.commission)) ? Number(trade.commission) : 0;
    const swap = Number.isFinite(Number(trade.swap)) ? Number(trade.swap) : 0;
    entry.pnl += net;
    if (profit > 0) entry.grossProfit += profit;
    if (profit < 0) entry.grossLoss += profit;
    entry.commission += commission;
    entry.swap += swap;
    entry.trades += 1;
  });
  const auditRows = [...dayMap.values()]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((day) => {
      const row = {
        day: day.key,
        timezone: ACCOUNTING_TIMEZONE,
        grossProfit: Number(day.grossProfit.toFixed(2)),
        grossLoss: Number(day.grossLoss.toFixed(2)),
        commission: Number(day.commission.toFixed(2)),
        swap: Number(day.swap.toFixed(2)),
        net: Number(day.pnl.toFixed(2)),
        renderedCalendarValue: Number(day.pnl.toFixed(2)),
        delta: 0,
        trades: day.trades,
      };
      console.debug("[KMFX][DAILY_PNL_AUDIT]", {
        dayKey: row.day,
        timezone: ACCOUNTING_TIMEZONE,
        trades: row.trades,
        grossProfit: row.grossProfit,
        grossLoss: row.grossLoss,
        commission: row.commission,
        swap: row.swap,
        netPnl: row.net,
      });
      return row;
    });
  if (typeof console.table === "function") console.table(auditRows);
  return dayMap;
}

function normalizeReportMetricsShape(reportMetrics, context = {}) {
  if (!reportMetrics || typeof reportMetrics !== "object" || !Object.keys(reportMetrics).length) {
    return null;
  }

  const normalized = {
    balance: Number.isFinite(Number(reportMetrics.balance))
      ? Number(reportMetrics.balance)
      : Number(context.balance ?? 0),
    equity: Number.isFinite(Number(reportMetrics.equity))
      ? Number(reportMetrics.equity)
      : Number(context.equity ?? context.balance ?? 0),
    netProfit: Number.isFinite(Number(reportMetrics.netProfit)) ? Number(reportMetrics.netProfit) : 0,
    grossProfit: Number.isFinite(Number(reportMetrics.grossProfit)) ? Number(reportMetrics.grossProfit) : 0,
    grossLoss: Number.isFinite(Number(reportMetrics.grossLoss)) ? Number(reportMetrics.grossLoss) : 0,
    winRate: Number.isFinite(Number(reportMetrics.winRate)) ? Number(reportMetrics.winRate) : 0,
    totalTrades: Number.isFinite(Number(reportMetrics.totalTrades))
      ? Number(reportMetrics.totalTrades)
      : Number(context.totalTrades ?? 0),
    profitFactor: Number.isFinite(Number(reportMetrics.profitFactor)) ? Number(reportMetrics.profitFactor) : 0,
    drawdownPct: Number.isFinite(Number(reportMetrics.drawdownPct)) ? Number(reportMetrics.drawdownPct) : 0,
    commissions: Number.isFinite(Number(reportMetrics.commissions)) ? Number(reportMetrics.commissions) : 0,
    swaps: Number.isFinite(Number(reportMetrics.swaps)) ? Number(reportMetrics.swaps) : 0,
    dividends: Number.isFinite(Number(reportMetrics.dividends)) ? Number(reportMetrics.dividends) : 0,
    winTrades: Number.isFinite(Number(reportMetrics.winTrades)) ? Number(reportMetrics.winTrades) : 0,
    lossTrades: Number.isFinite(Number(reportMetrics.lossTrades)) ? Number(reportMetrics.lossTrades) : 0,
    bestTrade: Number.isFinite(Number(reportMetrics.bestTrade)) ? Number(reportMetrics.bestTrade) : 0,
    worstTrade: Number.isFinite(Number(reportMetrics.worstTrade)) ? Number(reportMetrics.worstTrade) : 0,
    maxConsecutiveWins: Number.isFinite(Number(reportMetrics.maxConsecutiveWins)) ? Number(reportMetrics.maxConsecutiveWins) : 0,
    maxConsecutiveLosses: Number.isFinite(Number(reportMetrics.maxConsecutiveLosses)) ? Number(reportMetrics.maxConsecutiveLosses) : 0,
    maxConsecutiveProfit: Number.isFinite(Number(reportMetrics.maxConsecutiveProfit)) ? Number(reportMetrics.maxConsecutiveProfit) : 0,
    maxConsecutiveLoss: Number.isFinite(Number(reportMetrics.maxConsecutiveLoss)) ? Number(reportMetrics.maxConsecutiveLoss) : 0,
    source: reportMetrics.source || "backend_mt5_report_metrics",
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

function formatAuthorityDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
}

export function resolveAccountDisplayIdentity(account) {
  const dashboardPayload = account?.dashboardPayload && typeof account.dashboardPayload === "object" ? account.dashboardPayload : {};
  const meta = account?.meta && typeof account.meta === "object" ? account.meta : {};
  const broker = account?.broker || meta.broker || dashboardPayload.broker || dashboardPayload.account?.broker || "";
  const login = account?.login || meta.login || dashboardPayload.login || dashboardPayload.account?.login || "";
  const server = account?.server || meta.server || dashboardPayload.server || dashboardPayload.account?.server || "";
  const nickname = meta.nickname || dashboardPayload.nickname || dashboardPayload.alias || "";
  const canonicalTitle = [broker, login].filter(Boolean).join(" · ");
  const title = nickname || canonicalTitle || account?.name || "Cuenta MT5";
  const subtitle = [server, getAccountTypeLabel(account?.model?.profile?.mode, account?.name)].filter(Boolean).join(" · ");

  return {
    title,
    subtitle,
    broker,
    login,
    server,
    nickname,
  };
}

export function resolveAccountDataAuthority(account) {
  const dashboardPayload = account?.dashboardPayload && typeof account.dashboardPayload === "object" ? account.dashboardPayload : {};
  const model = account?.model && typeof account.model === "object" ? account.model : {};
  const sourceType = account?.sourceType || "";
  const payloadSource = dashboardPayload.payloadSource || model?.sourceTrace?.payloadSource || "";
  const rawTrades = Array.isArray(dashboardPayload.trades) ? dashboardPayload.trades : [];
  const modelTrades = Array.isArray(model.trades) ? model.trades : [];
  const trades = rawTrades.length ? rawTrades : modelTrades;
  const rawHistory = Array.isArray(dashboardPayload.history) ? dashboardPayload.history : [];
  const modelHistory = Array.isArray(model.equityCurve) ? model.equityCurve : [];
  const history = rawHistory.length ? rawHistory : modelHistory;

  const tradeDates = trades
    .map((trade) => normalizeDateLike(
      trade?.close_time ||
      trade?.time ||
      trade?.open_time ||
      trade?.date ||
      trade?.when,
      trade?.time_unix || trade?.close_time_unix
    ))
    .filter(Boolean)
    .sort((left, right) => left.getTime() - right.getTime());

  const historyDates = history
    .map((point) => normalizeDateLike(point?.timestamp || point?.time || point?.date || point?.label))
    .filter(Boolean)
    .sort((left, right) => left.getTime() - right.getTime());

  const firstTradeAt = tradeDates[0] || null;
  const lastTradeAt = tradeDates[tradeDates.length - 1] || null;
  const firstHistoryAt = historyDates[0] || null;
  const lastHistoryAt = historyDates[historyDates.length - 1] || null;
  const tradeCount = rawTrades.length || modelTrades.length;
  const historyPoints = rawHistory.length || modelHistory.length;
  const hasRiskSnapshot = Boolean(account?.riskSnapshot && Object.keys(account.riskSnapshot).length) || Boolean(dashboardPayload.riskSnapshot && Object.keys(dashboardPayload.riskSnapshot).length);
  const hasLivePayload = sourceType === "mt5" && payloadSource === "mt5_sync_live";
  const hasRenderableIdentity = Boolean(resolveAccountDisplayIdentity(account).title);
  const hasUsableLiveSnapshot = hasLivePayload && (
    Number.isFinite(Number(dashboardPayload.balance)) ||
    Number.isFinite(Number(dashboardPayload.equity)) ||
    tradeCount > 0 ||
    historyPoints > 0
  );

  return {
    sourceType,
    payloadSource,
    tradeCount,
    historyPoints,
    firstTradeAt,
    lastTradeAt,
    firstTradeLabel: formatAuthorityDate(firstTradeAt),
    lastTradeLabel: formatAuthorityDate(lastTradeAt),
    firstHistoryAt,
    lastHistoryAt,
    firstHistoryLabel: formatAuthorityDate(firstHistoryAt),
    lastHistoryLabel: formatAuthorityDate(lastHistoryAt),
    hasRiskSnapshot,
    hasLivePayload,
    hasUsableLiveSnapshot,
    hasRenderableIdentity,
    shouldRenderLoadingSkeleton: sourceType === "mt5" && !hasUsableLiveSnapshot && !hasRenderableIdentity,
    sourceUsed: hasLivePayload ? "dashboard_payload_live" : "model_fallback",
  };
}

export function describeAccountAuthority(account, kind = "derived") {
  const authority = resolveAccountDataAuthority(account);
  if (kind === "workspace") {
    return {
      tone: "neutral",
      label: "Workspace",
      title: "Herramienta de workspace",
      text: "Esta vista usa la cuenta activa como contexto, pero parte de su contenido pertenece al workspace local del usuario y no al snapshot MT5 del backend.",
      authority,
    };
  }
  if (kind === "derived") {
    return {
      tone: "info",
      label: "Derivado",
      title: "Análisis derivado del ledger real",
      text: authority.firstTradeLabel
        ? `Esta vista se calcula sobre el ledger real de la cuenta activa, desde ${authority.firstTradeLabel}${authority.lastTradeLabel ? ` hasta ${authority.lastTradeLabel}` : ""}.`
        : "Esta vista se calcula sobre el ledger real disponible de la cuenta activa.",
      authority,
    };
  }
  return {
    tone: "ok",
    label: "Live",
    title: "Dato live de cuenta",
    text: authority.firstTradeLabel
      ? `Esta vista usa el snapshot live de la cuenta activa y el ledger real disponible desde ${authority.firstTradeLabel}.`
      : "Esta vista usa el snapshot live de la cuenta activa.",
    authority,
  };
}

export function renderAuthorityNotice(authorityMeta) {
  if (!authorityMeta) return "";
  return `
    <div class="calendar-inline-note calendar-inline-note--${authorityMeta.tone || "info"}">
      <strong>${authorityMeta.title || "Fuente de datos"}</strong> ${authorityMeta.text || ""}
    </div>
  `;
}

export function resolveActiveAccountId(state) {
  return resolveSelectedLiveAccountId(state);
}

function isLiveAccountCandidate(account, accountId, liveIds = []) {
  if (!account || typeof account !== "object") return false;
  if (liveIds.includes(accountId)) return true;
  if (account.source === "mt5" || account.sourceType === "mt5") return true;
  const dashboardPayload = account.dashboardPayload;
  return Boolean(dashboardPayload && typeof dashboardPayload === "object" && Object.keys(dashboardPayload).length > 0);
}

function resolveLiveAccountIds(state) {
  const accounts = state?.accounts && typeof state.accounts === "object" ? state.accounts : {};
  const explicitLiveIds = Array.isArray(state?.liveAccountIds) ? state.liveAccountIds.filter((id) => accounts[id]) : [];
  if (explicitLiveIds.length > 0) return explicitLiveIds;

  return Object.entries(accounts)
    .filter(([accountId, account]) => isLiveAccountCandidate(account, accountId, explicitLiveIds))
    .map(([accountId]) => accountId);
}

export function resolveSelectedLiveAccountId(state) {
  const accounts = state?.accounts && typeof state.accounts === "object" ? state.accounts : {};
  const liveIds = resolveLiveAccountIds(state);
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

export function resolveSelectedLiveAccount(state) {
  const selectedAccountId = resolveSelectedLiveAccountId(state);
  return selectedAccountId ? state?.accounts?.[selectedAccountId] || null : null;
}

export function hasLiveAccounts(state) {
  if (Array.isArray(state?.liveAccountIds) && state.liveAccountIds.length > 0) return true;
  const resolvedAccountId = resolveSelectedLiveAccountId(state);
  const account = resolvedAccountId ? state?.accounts?.[resolvedAccountId] || null : null;
  return isLiveAccountCandidate(account, resolvedAccountId, []);
}

// Public active-account selector API.
// New pages and future refactors should depend on these wrappers instead of
// reading state.currentAccount directly. They intentionally preserve the
// current live/mock resolution behavior for backwards compatibility.
export function selectActiveAccountId(state) {
  return resolveSelectedLiveAccountId(state);
}

export function selectActiveAccount(state) {
  const resolvedAccountId = selectActiveAccountId(state);
  return resolvedAccountId ? state?.accounts?.[resolvedAccountId] || null : null;
}

export function selectActiveAccountModel(state) {
  return selectActiveAccount(state)?.model || null;
}

export function selectActiveDashboardPayload(state) {
  const account = selectActiveAccount(state);
  return account?.dashboardPayload && typeof account.dashboardPayload === "object" ? account.dashboardPayload : {};
}

export function selectLiveAccountIds(state) {
  return resolveLiveAccountIds(state);
}

export function selectHasLiveAccount(state) {
  return hasLiveAccounts(state);
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
  return resolvePerformanceViewModel(account);
}

export function resolvePerformanceViewModel(account) {
  const model = account?.model || {};
  const dashboardPayload = account?.dashboardPayload && typeof account.dashboardPayload === "object"
    ? account.dashboardPayload
    : {};
  const reportMetrics = normalizeReportMetricsShape(
    dashboardPayload.reportMetrics && typeof dashboardPayload.reportMetrics === "object"
      ? dashboardPayload.reportMetrics
      : account?.reportMetrics && typeof account.reportMetrics === "object"
        ? account.reportMetrics
        : model?.reportMetrics && typeof model.reportMetrics === "object"
          ? model.reportMetrics
          : null,
    {
      balance: account?.model?.account?.balance ?? dashboardPayload.balance ?? 0,
      equity: account?.model?.account?.equity ?? dashboardPayload.equity ?? 0,
      totalTrades: model?.trades?.length ?? 0,
    },
  );
  const accountMetrics = model.account || {};
  const pnlSummary = resolveAccountPnlSummary(account);
  const payloadSource = pnlSummary.payloadSource || dashboardPayload.payloadSource || "";
  const balance = Number(accountMetrics.balance ?? dashboardPayload.balance ?? 0);
  const equity = Number(accountMetrics.equity ?? dashboardPayload.equity ?? balance);
  const explicitHistory = Array.isArray(dashboardPayload.history)
    ? dashboardPayload.history
        .map((point, index) => {
          const numericValue = Number(point?.value);
          if (!Number.isFinite(numericValue)) return null;
          const timestamp =
            point?.timestamp ||
            point?.time ||
            point?.date ||
            point?.datetime ||
            point?.when ||
            null;
          return {
            label: point?.label || `P${index + 1}`,
            value: numericValue,
            timestamp,
          };
        })
        .filter(Boolean)
    : [];
  const fallbackSeries = Array.isArray(model.equityCurve) && model.equityCurve.length
    ? model.equityCurve
    : [
        { label: "Base", value: Number(accountMetrics.balance || 0) },
        { label: "Ahora", value: Number(accountMetrics.equity ?? accountMetrics.balance ?? 0) },
      ];
  const chartSeries = pnlSummary.usedExplicitLivePayload
    ? (explicitHistory.length >= fallbackSeries.length && explicitHistory.length
      ? explicitHistory
      : fallbackSeries)
    : fallbackSeries;
  const historyPoints = chartSeries.length;
  const openPnl = Number(pnlSummary.heroOpenPnl || 0);
  const closedPnl = Number(pnlSummary.heroClosedPnl || 0);
  const totalPnl = Number(pnlSummary.heroTotalPnl || 0);
  const hasAuthoritativeReportMetrics = Boolean(
    reportMetrics
    && account?.sourceType === "mt5"
    && (
      Number.isFinite(Number(reportMetrics.equity))
      || Number.isFinite(Number(reportMetrics.balance))
    )
  );
  const mainPerformanceValue = hasAuthoritativeReportMetrics
    ? (Number.isFinite(Number(reportMetrics.equity)) ? Number(reportMetrics.equity) : Number(reportMetrics.balance ?? equity ?? balance))
    : pnlSummary.usedExplicitLivePayload && account?.sourceType === "mt5"
      ? (Number.isFinite(equity) ? equity : balance)
    : Number(accountMetrics.equity ?? totalPnl ?? 0);
  const firstPoint = chartSeries[0]?.value ?? balance;
  const lastPoint = chartSeries.at(-1)?.value ?? equity;
  const rangeValue = Number(lastPoint - firstPoint || 0);
  const primaryMetricUsed = hasAuthoritativeReportMetrics
    ? (Number.isFinite(Number(reportMetrics?.equity)) ? "reportMetrics.equity" : "reportMetrics.balance")
    : pnlSummary.usedExplicitLivePayload && account?.sourceType === "mt5"
      ? (Number.isFinite(equity) ? "dashboard_payload.equity" : "dashboard_payload.balance")
      : "equity_or_fallback";

  return {
    ...pnlSummary,
    selectedAccountId: account?.id || "",
    payloadSource,
    balance,
    equity,
    mainPerformanceValue,
    openPnl,
    closedPnl,
    totalPnl,
    rangeValue,
    chartSeries,
    historyPoints,
    primaryMetricUsed,
    sourceUsed: hasAuthoritativeReportMetrics
      ? "reportMetrics"
      : pnlSummary.usedExplicitLivePayload
        ? "dashboard_payload_explicit_live"
        : "model_fallback",
    broker: account?.broker || account?.meta?.broker || "",
    server: account?.server || account?.meta?.server || "",
    login: account?.login || account?.meta?.login || "",
    reportMetrics,
  };
}

export function buildDashboardModel(source) {
  const trades = source.trades
    .map((trade, index) => enrichTrade(trade, index))
    .sort((a, b) => a.when - b.when);
  const positions = (source.positions || []).map((position) => {
    const explicitFloatingPnl = Number(position?.floating_pnl ?? position?.floatingPnl);
    const fallbackProfit = Number(position?.profit ?? position?.pnl ?? 0);
    // floating_pnl = POSITION_PROFIT + POSITION_SWAP from MT5
    // Do not add swap separately — it is already included
    const floatingPnl = Number.isFinite(explicitFloatingPnl) ? explicitFloatingPnl : fallbackProfit;
    return {
      ...position,
      floating_pnl: floatingPnl,
      floatingPnl,
      pnl: floatingPnl,
    };
  });
  const riskProfile = source.riskProfile || {};
  const explicitHistory = Array.isArray(source.history)
    ? source.history
        .map((point, index) => {
          const numericValue = Number(point?.value);
          if (!Number.isFinite(numericValue)) return null;
          const timestamp =
            point?.timestamp ||
            point?.time ||
            point?.date ||
            point?.datetime ||
            point?.when ||
            null;
          return {
            label: point?.label || `P${index + 1}`,
            value: numericValue,
            timestamp,
          };
        })
        .filter(Boolean)
    : [];

  const payloadSource = source.payloadSource || source.profile?.payloadSource || "normalized";
  const accountCurrency = normalizeCurrencyCode(source?.account?.currency) || "USD";
  const reportMetrics = normalizeReportMetricsShape(source.reportMetrics, {
    balance: source?.account?.balance ?? 0,
    equity: source?.account?.equity ?? source?.account?.balance ?? 0,
    totalTrades: source?.trades?.length ?? 0,
  });
  const hasReportMetrics = Boolean(reportMetrics);
  if (!hasReportMetrics) {
    console.warn(
      "[KMFX][DATA_INTEGRITY] reportMetrics missing from payload. " +
      "Falling back to JS calculations — metrics may not match MT5. " +
      "Ensure KMFXConnector sends reportMetrics on every sync.",
      { payloadSource: source.payloadSource || source.profile?.payloadSource || "normalized", tradesCount: trades.length }
    );
  }
  const usedExplicitLivePayload = payloadSource === "mt5_sync_live";
  const explicitOpenPositionsCount = Number.isFinite(Number(source.account.openPositionsCount))
    ? Number(source.account.openPositionsCount)
    : positions.length;
  const explicitFloatingPnl = Number(source.account.floatingPnl);
  const explicitOpenPnl = Number(source.account.openPnl);
  const explicitClosedPnl = Number(source.account.closedPnl);
  const explicitTotalPnl = Number(source.account.totalPnl ?? source.account.pnl);
  const positionsFloatingPnl = positions.reduce((sum, position) => {
    const value = Number(position.floating_pnl ?? position.floatingPnl ?? position.pnl ?? position.profit ?? 0);
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);
  const hasPositionFloatingPnl = positions.some((position) => (
    Number.isFinite(Number(position.floating_pnl ?? position.floatingPnl))
  ));
  const heroOpenPnl = usedExplicitLivePayload
    ? (hasPositionFloatingPnl
      ? positionsFloatingPnl
      : (Number.isFinite(explicitFloatingPnl)
        ? explicitFloatingPnl
        : (Number.isFinite(explicitOpenPnl) ? explicitOpenPnl : 0)))
    : (Number.isFinite(explicitOpenPnl) ? explicitOpenPnl : 0);
  const heroClosedPnl = usedExplicitLivePayload
    ? (Number.isFinite(explicitClosedPnl) ? explicitClosedPnl : 0)
    : (Number.isFinite(explicitClosedPnl) ? explicitClosedPnl : trades.reduce((sum, trade) => sum + trade.pnl, 0));
  const totalPnl = hasReportMetrics
    ? Number(reportMetrics.netProfit || 0)
    : usedExplicitLivePayload
    ? (Number.isFinite(explicitTotalPnl) ? explicitTotalPnl : heroClosedPnl)
    : Number.isFinite(explicitClosedPnl)
      ? explicitClosedPnl
      : trades.length
        ? trades.reduce((sum, trade) => sum + trade.pnl, 0)
        : Number(source.account.pnl ?? source.account.openPnl ?? 0);
  const wins = trades.filter((trade) => trade.pnl > 0);
  const losses = trades.filter((trade) => trade.pnl < 0);
  const startBalance = source.account.balance - totalPnl;
  const winRate = hasReportMetrics
    ? Number(reportMetrics.winRate || 0)
    : trades.length ? (wins.length / trades.length) * 100 : Number(source.account.winRate || 0);
  const grossProfit = hasReportMetrics
    ? Number(reportMetrics.grossProfit || 0)
    : wins.reduce((sum, trade) => sum + trade.pnl, 0);
  const grossLoss = hasReportMetrics
    ? Math.abs(Number(reportMetrics.grossLoss || 0))
    : Math.abs(losses.reduce((sum, trade) => sum + trade.pnl, 0));
  const profitFactor = hasReportMetrics
    ? Number(reportMetrics.profitFactor || 0)
    : grossLoss ? grossProfit / grossLoss : grossProfit;
  const expectancy = trades.length ? totalPnl / trades.length : 0;
  const avgWin = wins.length ? grossProfit / wins.length : 0;
  const avgLoss = losses.length ? grossLoss / losses.length : 0;
  const rr = avgLoss ? avgWin / avgLoss : 0;
  const bestTrade = hasReportMetrics
    ? Number(reportMetrics.bestTrade || 0)
    : wins.reduce((best, trade) => Math.max(best, trade.pnl), 0);
  const worstTrade = hasReportMetrics
    ? Number(reportMetrics.worstTrade || 0)
    : losses.reduce((worst, trade) => Math.min(worst, trade.pnl), 0);

  let equity = startBalance;
  const generatedEquityCurve = trades.map((trade) => {
    equity += trade.pnl;
    return {
      label: trade.when.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit" }),
      value: equity,
      timestamp: trade.when.toISOString(),
    };
  });
  const equityCurve = explicitHistory.length >= generatedEquityCurve.length && explicitHistory.length
    ? explicitHistory
    : generatedEquityCurve;

  const dayMap = buildDailyPnlMap(trades);
  const dayStats = [...dayMap.values()].sort((a, b) => a.key.localeCompare(b.key));
  const weekly = buildWeeklyStrip(dayStats);
  const monthlyReturns = buildMonthlyReturns(dayStats, startBalance, trades);
  const calendar = buildCalendar(dayStats, trades[trades.length - 1]?.when || new Date());
  const symbols = buildGroupStats(trades, (trade) => trade.symbol);
  const sessionsBreakdown = buildGroupStats(trades, (trade) => trade.session, sessions);
  const hours = buildHourStats(trades);
  const weekdaysBreakdown = buildWeekdayStats(trades);
  const streaks = hasReportMetrics
    ? {
        bestWin: Number(reportMetrics.maxConsecutiveWins || 0),
        bestLoss: Number(reportMetrics.maxConsecutiveLosses || 0),
      }
    : buildStreaks(trades);
  const drawdown = calculateDrawdown(startBalance, trades);
  const drawdownWithFallback = {
    ...drawdown,
    maxPct: hasReportMetrics
      ? Number(reportMetrics.drawdownPct || 0)
      : trades.length ? drawdown.maxPct : Number(source.account.drawdownPct || 0),
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

  if (hasReportMetrics) {
    console.debug("[KMFX][REPORT_METRICS_USED]", {
      payloadSource,
      totalTrades: reportMetrics.totalTrades,
      winRate: reportMetrics.winRate,
      grossProfit: reportMetrics.grossProfit,
      grossLoss: reportMetrics.grossLoss,
      netProfit: reportMetrics.netProfit,
      profitFactor: reportMetrics.profitFactor,
      drawdownPct: reportMetrics.drawdownPct,
    });
  } else {
    console.debug("[KMFX][REPORT_METRICS_FALLBACK]", {
      payloadSource,
      totalTrades: trades.length,
      reason: "reportMetrics_missing",
    });
  }

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
      totalTrades: Number(hasReportMetrics ? reportMetrics.totalTrades : (source.account.totalTrades || trades.length)),
      bestMonth: monthlyBest,
      worstMonth: monthlyWorst,
      drawdown: drawdownWithFallback,
      riskScore,
      grossProfit,
      grossLoss,
      commissions: hasReportMetrics ? Number(reportMetrics.commissions || 0) : 0,
      swaps: hasReportMetrics ? Number(reportMetrics.swaps || 0) : 0,
      dividends: hasReportMetrics ? Number(reportMetrics.dividends || 0) : 0,
      ratios
    },
    account: {
      ...source.account,
      currency: accountCurrency,
      balance: hasReportMetrics ? Number(reportMetrics.balance ?? source.account.balance) : source.account.balance,
      equity: hasReportMetrics ? Number(reportMetrics.equity ?? source.account.equity) : source.account.equity,
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
      hasReportMetrics,
    },
    reportMetrics,
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

// Deprecated compatibility selectors.
// Keep these exports stable until existing modules are migrated to the public
// active-account selector API above.
export function selectCurrentAccount(state) {
  const resolvedAccountId = selectActiveAccountId(state);
  const account = selectActiveAccount(state);
  const isLive = isLiveAccountCandidate(
    account,
    resolvedAccountId,
    Array.isArray(state?.liveAccountIds) ? state.liveAccountIds : []
  );

  console.log("[KMFX][Panel Resolution]", {
    currentAccount: state?.currentAccount || null,
    resolvedAccountId,
    isLive,
    availableAccounts: Object.keys(state?.accounts || {})
  });

  return account;
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

function buildMonthlyReturns(dayStats, startBalance, trades = []) {
  const months = new Map();
  let runningBalance = Number(startBalance) || 0;
  const orderedTrades = Array.isArray(trades)
    ? [...trades].sort((a, b) => {
        const left = getTradeCloseDate(a)?.getTime() ?? 0;
        const right = getTradeCloseDate(b)?.getTime() ?? 0;
        return left - right;
      })
    : [];

  if (orderedTrades.length) {
    orderedTrades.forEach((trade) => {
      const date = getTradeCloseDate(trade);
      const key = trade.monthKey || toLocalMonthKey(date);
      if (!date || !key) return;
      if (!months.has(key)) {
        months.set(key, {
          key,
          label: monthLabelFormatter.format(date),
          pnl: 0,
          trades: 0,
          startBalance: runningBalance,
          endBalance: runningBalance
        });
      }
      const month = months.get(key);
      const net = Number.isFinite(Number(trade.net)) ? Number(trade.net) : Number(trade.pnl || 0);
      month.pnl += net;
      month.trades += 1;
      runningBalance += net;
      month.endBalance = runningBalance;
    });
  } else {
    dayStats.forEach((day) => {
      const date = day.date;
      const key = day.monthKey || toLocalMonthKey(date);
      if (!months.has(key)) {
        months.set(key, {
          key,
          label: monthLabelFormatter.format(date),
          pnl: 0,
          trades: 0,
          startBalance: runningBalance,
          endBalance: runningBalance
        });
      }
      const month = months.get(key);
      month.pnl += day.pnl;
      month.trades += day.trades;
      runningBalance += day.pnl;
      month.endBalance = runningBalance;
    });
  }

  const rows = [...months.values()].map((month) => {
    const returnPct = month.startBalance ? (month.pnl / month.startBalance) * 100 : 0;
    const renderedMonthlyPct = returnPct;
    console.debug("[KMFX][MONTHLY_RETURN_AUDIT]", {
      monthKey: month.key,
      startBalance: month.startBalance,
      pnl: month.pnl,
      endBalance: month.endBalance,
      returnPct,
      renderedMonthlyPct,
      delta: 0,
      tradeCount: month.trades,
    });
    return {
      ...month,
      returnPct,
      renderedMonthlyPct
    };
  });
  if (typeof console.table === "function") {
    console.table(rows.map((month) => ({
      month: month.key,
      month_start_balance: Number(month.startBalance.toFixed(2)),
      monthly_net_profit: Number(month.pnl.toFixed(2)),
      monthly_return_pct_raw: Number(month.returnPct.toFixed(4)),
      rendered_monthly_pct: Number(month.renderedMonthlyPct.toFixed(4)),
      delta: 0,
      trades: month.trades,
    })));
  }
  return rows;
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
        totalReturnPct: 0,
        startBalance: null,
        endBalance: null
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
    if (bucket.startBalance === null) bucket.startBalance = month.startBalance;
    bucket.endBalance = month.endBalance;
    bucket.totalPnl += month.pnl;
  });
  return [...years.values()].map((year) => ({
    ...year,
    totalReturnPct: year.startBalance ? (year.totalPnl / year.startBalance) * 100 : 0
  }));
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
  const when = normalizeDateLike(
    trade.closeTime || trade.close_time || trade.time || trade.date,
    trade.time_unix || trade.close_time_unix
  ) || new Date(trade.date);
  const accounting = resolveTradeNet(trade);
  const closeTime = trade.closeTime || trade.close_time || trade.time || trade.date || "";
  return {
    ...trade,
    closeTime,
    tradingDayKey: trade.tradingDayKey || toLocalDayKey(when),
    monthKey: trade.monthKey || toLocalMonthKey(when),
    pnl: accounting.net,
    net: accounting.net,
    grossProfit: accounting.grossProfit,
    commission: accounting.commission,
    swap: accounting.swap,
    dividend: accounting.dividend,
    fees: accounting.fees,
    when,
    durationMin: Number.isFinite(Number(trade.durationMin)) ? Number(trade.durationMin) : null,
    volume: Number.isFinite(Number(trade.volume)) ? Number(trade.volume) : null,
    direction: trade.direction || trade.type || "",
    entry: Number.isFinite(Number(trade.open_price)) && Number(trade.open_price) > 0
      ? roundPrice(Number(trade.open_price))
      : Number.isFinite(Number(trade.entry)) && Number(trade.entry) > 0
        ? roundPrice(Number(trade.entry))
        : null,
    exit: Number.isFinite(Number(trade.price)) && Number(trade.price) > 0
      ? roundPrice(Number(trade.price))
      : Number.isFinite(Number(trade.exit)) && Number(trade.exit) > 0
        ? roundPrice(Number(trade.exit))
        : null,
    openTime: trade.open_time || null,
    openTimeUnix: trade.open_time_unix || null,
    sl: Number.isFinite(Number(trade.sl)) ? roundPrice(Number(trade.sl)) : null,
    tp: Number.isFinite(Number(trade.tp)) ? roundPrice(Number(trade.tp)) : null,
    strategyTag: trade.strategy_tag || ""
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
