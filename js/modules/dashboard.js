import { formatCompact, formatCurrency, formatPercent, getAccountTypeLabel, hasLiveAccounts as hasResolvedLiveAccounts, resolveAccountDataAuthority, resolveAccountDisplayIdentity, resolveSelectedLiveAccountId, resolvePerformanceViewModel, selectCurrentAccount, selectCurrentDashboardPayload, selectCurrentModel } from "./utils.js?v=build-20260406-213500";
import { chartCanvas, lineAreaSpec, mountCharts, updateCharts } from "./chart-system.js?v=build-20260406-213500";
import { selectRiskExposure, selectRiskLimits, selectRiskStatus, selectRiskSummary } from "./risk-selectors.js?v=build-20260406-213500";
import {
  formatRiskCurrency,
  formatRiskValuePct,
  renderEnforcementPanel,
  renderOpenTradeRiskTable,
  renderRiskMetricCard,
  renderRiskStatusBadge,
  renderSymbolExposureTable,
  riskToneFromStatus,
} from "./risk-panel-components.js?v=build-20260406-213500";
import { renderAdminTracePanel } from "./admin-mode.js?v=build-20260406-213500";

function parseChartAxisDate(pointOrLabel) {
  const rawValue = typeof pointOrLabel === "object" && pointOrLabel !== null
    ? (pointOrLabel.timestamp || pointOrLabel.time || pointOrLabel.date || pointOrLabel.datetime || pointOrLabel.when || pointOrLabel.label || "")
    : pointOrLabel;
  const raw = String(rawValue || "").trim();
  if (!raw) return null;
  const mt5Like = raw.match(/^(\d{4})\.(\d{2})\.(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (mt5Like) {
    const [, y, m, d, hh = "00", mm = "00", ss = "00"] = mt5Like;
    const parsed = new Date(`${y}-${m}-${d}T${hh}:${mm}:${ss}`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getHeroRangePoints(range, curve) {
  const points = Array.isArray(curve) ? curve : [];
  if (!points.length) return [];
  const datedPoints = points
    .map((point) => ({ point, date: parseChartAxisDate(point) }))
    .filter((entry) => entry.date);

  if (!datedPoints.length) {
    if (range === "H1") return points.slice(-4);
    if (range === "4H") return points.slice(-6);
    if (range === "1D") return points.slice(-5);
    if (range === "1W") return points.slice(-7);
    if (range === "YTD") return points;
    return points.slice(-14);
  }

  const endDate = datedPoints[datedPoints.length - 1].date;
  const startDate = new Date(endDate);
  if (range === "H1") startDate.setHours(startDate.getHours() - 1);
  else if (range === "4H") startDate.setHours(startDate.getHours() - 4);
  else if (range === "1D") startDate.setHours(startDate.getHours() - 24);
  else if (range === "1W") startDate.setDate(startDate.getDate() - 7);
  else if (range === "1M") startDate.setDate(startDate.getDate() - 30);
  else if (range === "YTD") startDate.setMonth(0, 1);

  const filtered = datedPoints.filter(({ date }) => date >= startDate).map(({ point }) => point);
  if (filtered.length >= 2) return filtered;

  if (range === "H1") return points.slice(-4);
  if (range === "4H") return points.slice(-6);
  if (range === "1D") return points.slice(-5);
  if (range === "1W") return points.slice(-7);
  if (range === "YTD") return points;
  return points.slice(-14);
}

function normalizeHeroCurvePoints(points) {
  return (Array.isArray(points) ? points : [])
    .map((point, index) => {
      const numericValue = Number(point?.value);
      if (!Number.isFinite(numericValue)) return null;
      return {
        label: point?.label || `P${index + 1}`,
        value: numericValue,
        timestamp:
          point?.timestamp ||
          point?.time ||
          point?.date ||
          point?.datetime ||
          point?.when ||
          null,
      };
    })
    .filter(Boolean);
}

function buildHeroCurve(root, { cacheKey, incomingCurve, liveValue, hasOpenPositions }) {
  const normalizedIncoming = normalizeHeroCurvePoints(incomingCurve);
  if (!normalizedIncoming.length) return [];

  if (root.__heroCurveBaseKey !== cacheKey || !Array.isArray(root.__heroCurveBase) || !root.__heroCurveBase.length) {
    root.__heroCurveBaseKey = cacheKey;
    root.__heroCurveBase = normalizedIncoming.map((point) => ({ ...point }));
    root.__heroCurveLivePoint = null;
  }

  if (!hasOpenPositions) {
    root.__heroCurveBase = normalizedIncoming.map((point) => ({ ...point }));
    root.__heroCurveLivePoint = null;
    return root.__heroCurveBase;
  }

  const baseCurve = root.__heroCurveBase;
  const lastHistoricalPoint = baseCurve.at(-1) || normalizedIncoming.at(-1);
  if (!lastHistoricalPoint) return normalizedIncoming;

  const targetLiveValue = Number.isFinite(Number(liveValue)) ? Number(liveValue) : Number(lastHistoricalPoint.value || 0);
  const previousLiveTimestamp = root.__heroCurveLivePoint?.timestamp;
  const lastHistoricalDate = parseChartAxisDate(lastHistoricalPoint);
  const stableLiveTimestamp = previousLiveTimestamp || (lastHistoricalDate
    ? new Date(lastHistoricalDate.getTime() + 60_000).toISOString()
    : (lastHistoricalPoint.timestamp || null));
  const nextLivePoint = {
    label: "Ahora",
    value: targetLiveValue,
    timestamp: stableLiveTimestamp,
    __live: true,
  };
  root.__heroCurveLivePoint = nextLivePoint;
  return [...baseCurve, nextLivePoint];
}

function createHeroXAxisFormatter(range, points) {
  const total = points.length;
  const parsedDates = points.map((point) => parseChartAxisDate(point));
  const targetTicks = range === "YTD" ? 6 : range === "1M" ? 5 : range === "1W" ? 5 : range === "1D" ? 5 : range === "4H" ? 4 : 4;
  const validDates = parsedDates.filter(Boolean);
  const firstDate = validDates[0] || null;
  const lastDate = validDates[validDates.length - 1] || null;
  const spanHours = firstDate && lastDate ? Math.max(0, (lastDate.getTime() - firstDate.getTime()) / 36e5) : 0;
  const spanDays = spanHours / 24;

  const formatLabel = (date) => {
    if (!date) return "";
    if (range === "H1" || range === "4H" || range === "1D") {
      return date.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
    }
    if (range === "1W") {
      if (spanDays <= 2) {
        return date.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
      }
      return date.toLocaleDateString("es-ES", { weekday: "short", day: "2-digit" });
    }
    if (range === "1M") {
      if (spanDays <= 7) {
        return date.toLocaleDateString("es-ES", { day: "2-digit", month: "short", hour: "2-digit" }).replace(",", "");
      }
      return date.toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
    }
    if (spanDays <= 45) {
      return date.toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
    }
    return date.toLocaleDateString("es-ES", { month: "short" });
  };

  const getBucketKey = (date) => {
    if (!date) return "";
    if (range === "H1" || range === "4H" || range === "1D") {
      return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${date.getHours()}`;
    }
    if (range === "1W") {
      if (spanDays <= 2) {
        return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${date.getHours()}`;
      }
      return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    }
    if (range === "1M") {
      if (spanDays <= 7) {
        return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
      }
      return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    }
    if (spanDays <= 45) {
      return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    }
    return `${date.getFullYear()}-${date.getMonth()}`;
  };

  const candidateIndices = [];
  const seenBuckets = new Set();
  parsedDates.forEach((date, index) => {
    const key = getBucketKey(date);
    if (!key || seenBuckets.has(key)) return;
    seenBuckets.add(key);
    candidateIndices.push(index);
  });

  const baseIndices = [...new Set([0, total - 1, ...candidateIndices])]
    .filter((index) => index >= 0 && index < total)
    .sort((a, b) => a - b);
  const visibleIndices = new Set();

  if (baseIndices.length <= targetTicks) {
    baseIndices.forEach((index) => visibleIndices.add(index));
  } else {
    for (let i = 0; i < targetTicks; i += 1) {
      const position = Math.round((i * (baseIndices.length - 1)) / Math.max(targetTicks - 1, 1));
      visibleIndices.add(baseIndices[position]);
    }
  }

  const labelByIndex = new Map();
  const usedLabels = new Set();
  [...visibleIndices].sort((a, b) => a - b).forEach((index) => {
    const label = formatLabel(parsedDates[index]);
    if (!label || usedLabels.has(label)) return;
    usedLabels.add(label);
    labelByIndex.set(index, label);
  });

  return (_, index) => labelByIndex.get(index) || "";
}

function riskStateDisplayLabel(riskState) {
  const normalized = String(riskState || "").toLowerCase();
  if (normalized === "blocked") return "Bloqueado";
  if (normalized === "breach") return "Reducir riesgo";
  if (normalized === "warning") return "Vigilar";
  return "Bajo control";
}

function renderDashboardKpiCard({ key = "", label, value, valueClass = "", meta = "", trend = "", trendTone = "", cardClass = "" }) {
  return `
    <article class="widget-card widget-card--kpi ${cardClass}" ${key ? `data-dashboard-kpi="${key}"` : ""}>
      <div class="tl-kpi-label">${label}</div>
      <div class="tl-kpi-val ${valueClass}" data-kpi-value>${value}</div>
      ${(meta || trend) ? `<div class="widget-card-meta" data-kpi-meta>${[meta, trend].filter(Boolean).join(" · ")}</div>` : ""}
    </article>
  `;
}

function setNodeHTML(root, selector, value) {
  const node = root.querySelector(selector);
  if (node) node.innerHTML = value;
}

function setNodeText(root, selector, value) {
  const node = root.querySelector(selector);
  if (node) node.textContent = value;
}

function animateNumberContent(node, target, formatter, duration = 680) {
  if (!node || !Number.isFinite(target) || typeof formatter !== "function") {
    if (node && typeof formatter === "function") node.textContent = formatter(target);
    return;
  }
  if (node.__kmfxNumberFrame) cancelAnimationFrame(node.__kmfxNumberFrame);
  const startValue = Number(node.dataset.kmfxValue);
  const initialValue = Number.isFinite(startValue) ? startValue : target;
  node.dataset.kmfxValue = String(target);
  if (Math.abs(initialValue - target) < 0.0001) {
    node.textContent = formatter(target);
    return;
  }
  const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
  const easeOut = (t) => 1 - ((1 - t) * (1 - t) * (1 - t));
  const step = (now) => {
    const progress = Math.min(1, (now - startedAt) / duration);
    const nextValue = initialValue + ((target - initialValue) * easeOut(progress));
    node.textContent = formatter(nextValue);
    if (progress < 1) {
      node.__kmfxNumberFrame = requestAnimationFrame(step);
      return;
    }
    node.textContent = formatter(target);
    node.__kmfxNumberFrame = null;
  };
  node.__kmfxNumberFrame = requestAnimationFrame(step);
}

function updateDashboardLiveNodes(root, payload) {
  setNodeText(root, "[data-dashboard-subtitle]", payload.dashboardSubtitle);
  setNodeText(root, "[data-dashboard-hero-sub]", payload.heroSub);
  animateNumberContent(
    root.querySelector('[data-dashboard-kpi="equity"] [data-kpi-value]'),
    payload.equityValue,
    (value) => formatCurrency(value),
    720,
  );
  setNodeHTML(root, '[data-dashboard-kpi="equity"] [data-kpi-meta]', payload.equityMeta);
  animateNumberContent(
    root.querySelector('[data-dashboard-kpi="pnl"] [data-kpi-value]'),
    payload.pnlValue,
    (value) => `${value >= 0 ? "+" : "-"}${formatCurrency(Math.abs(value))}`,
    720,
  );
  setNodeText(root, '[data-dashboard-kpi="pnl"] [data-kpi-meta]', payload.pnlMeta);
  animateNumberContent(
    root.querySelector('[data-dashboard-kpi="dd"] [data-kpi-value]'),
    payload.drawdownValue,
    (value) => formatRiskValuePct(value, 2),
    620,
  );
  setNodeText(root, '[data-dashboard-kpi="dd"] [data-kpi-meta]', payload.drawdownMeta);
  setNodeText(root, '[data-dashboard-kpi="edge"] [data-kpi-value]', payload.edgeValue);
  setNodeText(root, '[data-dashboard-kpi="edge"] [data-kpi-meta]', payload.edgeMeta);

  setNodeText(root, "[data-dashboard-operational-summary]", payload.operationalSummary);
  setNodeText(root, "[data-dashboard-risk-summary]", payload.riskSummary);
  if (payload.hasOpenPositions) {
    animateNumberContent(
      root.querySelector("[data-dashboard-operational-dailydd-value]"),
      payload.dailyDdValue,
      (value) => formatRiskValuePct(value, 2),
      620,
    );
    setNodeText(root, "[data-dashboard-operational-dailydd-meta]", payload.dailyDdMeta);
    animateNumberContent(
      root.querySelector("[data-dashboard-operational-margin-value]"),
      payload.marginValue,
      (value) => formatRiskValuePct(value, 2),
      620,
    );
    setNodeText(root, "[data-dashboard-operational-margin-meta]", payload.marginMeta);
    setNodeText(root, "[data-dashboard-operational-state-value]", payload.stateValue);
    setNodeText(root, "[data-dashboard-operational-state-meta]", payload.stateMeta);
    if (payload.operationalFoot != null) setNodeText(root, "[data-dashboard-operational-foot]", payload.operationalFoot);
    animateNumberContent(
      root.querySelector("[data-dashboard-risk-open-value]"),
      payload.openRiskValue,
      (value) => formatRiskValuePct(value, 2),
      620,
    );
    setNodeText(root, "[data-dashboard-risk-open-meta]", payload.openRiskMeta);
    animateNumberContent(
      root.querySelector("[data-dashboard-risk-trade-value]"),
      payload.tradeRiskValue,
      (value) => formatRiskValuePct(value, 2),
      620,
    );
    setNodeText(root, "[data-dashboard-risk-trade-meta]", payload.tradeRiskMeta);
    setNodeText(root, "[data-dashboard-risk-foot]", payload.riskFoot);
  }
}

function renderDashboardInlineRiskCard({ label, value, meta = "", tone = "neutral", valueAttr = "", metaAttr = "" }) {
  return `
    <article class="risk-metric-card risk-metric-card--${tone}">
      <div class="risk-metric-card__label">${label}</div>
      <div class="risk-metric-card__value"${valueAttr ? ` ${valueAttr}` : ""}>${value}</div>
      ${meta ? `<div class="risk-metric-card__meta"${metaAttr ? ` ${metaAttr}` : ""}>${meta}</div>` : ""}
    </article>
  `;
}

function getOperationalRead({ riskStatus, primaryDistanceToLimit, openPositionsCount }) {
  const normalized = String(riskStatus?.riskStatus || "").toLowerCase();
  if (normalized === "blocked" || normalized === "breach") {
    return {
      summary: "Actúa ahora.",
      detail: "Intervención requerida.",
      footer: "Reduce riesgo.",
    };
  }

  if (normalized === "warning") {
    return {
      summary: "Vigilar.",
      detail: "Revisa el margen.",
      footer: "Supervisa la sesión.",
    };
  }

  if (openPositionsCount > 0) {
    return {
      summary: "Bajo control.",
      detail: "Sin acción requerida.",
      footer: "",
    };
  }

  return {
    summary: "Bajo control.",
    detail: "Sin acción requerida.",
    footer: "",
  };
}

function getRiskPostureRead({ totalOpenRiskPct, maxOpenTradeRiskPct, maxRiskPerTradePct }) {
  const totalOpenRisk = Number(totalOpenRiskPct || 0);
  const maxTradeRisk = Number(maxOpenTradeRiskPct || 0);
  const policyRisk = Number(maxRiskPerTradePct || 0);

  if (totalOpenRisk <= 0 && maxTradeRisk <= 0) {
    return {
      summary: "Sin exposición.",
      detail: "Sin riesgo abierto.",
      tone: "neutral",
    };
  }

  if ((policyRisk > 0 && maxTradeRisk >= policyRisk * 0.8) || totalOpenRisk >= Math.max(policyRisk * 1.5, 1)) {
    return {
      summary: "Reducir riesgo.",
      detail: "Exposición alta.",
      tone: "breach",
    };
  }

  return {
    summary: "Vigilar exposición.",
    detail: "Riesgo medio.",
    tone: "warning",
  };
}

function deriveDashboardInsight({ riskStatus, riskSummary, riskLimits, model, openPositionsCount }) {
  const profitFactor = Number(model?.totals?.profitFactor || 0);
  const winRate = Number(model?.totals?.winRate || 0);
  const totalTrades = Number(model?.totals?.totalTrades || 0);
  const dailyLimitPct = Number(riskLimits?.policy?.dailyDdLimitPct || 0);
  const dailyDrawdownPct = Number(riskSummary?.dailyDrawdownPct || 0);
  const totalOpenRiskPct = Number(riskSummary?.totalOpenRiskPct || 0);
  const distanceToLimitPct = Number(
    Math.min(
      riskSummary?.distanceToMaxDdLimitPct || 0,
      riskSummary?.distanceToDailyDdLimitPct || 0
    ) || 0
  );

  if (riskStatus?.severity === "critical" || ["blocked", "breach"].includes(String(riskStatus?.riskStatus || "").toLowerCase())) {
    return {
      title: "Riesgo dominante",
      summary: riskStatus?.actionRequired || "Atención inmediata requerida.",
      metrics: [
        {
          label: "Distance to limit",
          value: formatRiskValuePct(distanceToLimitPct, 2),
          meta: riskStatus?.blockingRule || "Control crítico activo",
          tone: "blocked",
        },
        {
          label: "Open risk",
          value: formatRiskValuePct(totalOpenRiskPct, 2),
          meta: `${openPositionsCount} posiciones abiertas`,
          tone: "warning",
        },
      ],
    };
  }

  if (dailyLimitPct > 0 && dailyDrawdownPct >= dailyLimitPct * 0.6) {
    return {
      title: "Presión diaria",
      summary: "El margen diario se está estrechando.",
      metrics: [
        {
          label: "Daily DD",
          value: formatRiskValuePct(dailyDrawdownPct, 2),
          meta: `Límite ${formatRiskValuePct(dailyLimitPct, 2)}`,
          tone: "warning",
        },
        {
          label: "Distance",
          value: formatRiskValuePct(distanceToLimitPct, 2),
          meta: "Margen antes de tocar límite",
          tone: "warning",
        },
      ],
    };
  }

  if (totalTrades >= 10 && profitFactor >= 1.5 && winRate >= 50) {
    return {
      title: "Ventaja estable",
      summary: "Profit factor y win rate sostienen la lectura.",
      metrics: [
        {
          label: "Profit factor",
          value: Number.isFinite(profitFactor) && profitFactor > 0 ? profitFactor.toFixed(2) : "—",
          meta: `${totalTrades} trades analizados`,
          tone: "ok",
        },
        {
          label: "Win rate",
          value: formatPercent(winRate / 100),
          meta: "Sesgo de ejecución favorable",
          tone: "ok",
        },
      ],
    };
  }

  if (openPositionsCount > 0) {
    return {
      title: "Sesión en desarrollo",
      summary: "El foco está en el riesgo vivo.",
      metrics: [
        {
          label: "Posiciones",
          value: openPositionsCount,
          meta: "Operaciones abiertas ahora",
          tone: "neutral",
        },
        {
          label: "Heat",
          value: formatRiskValuePct(totalOpenRiskPct, 2),
          meta: "Riesgo vivo sobre capital",
          tone: "neutral",
        },
      ],
    };
  }

  return {
    title: "Lectura neutral",
    summary: "Sin señal dominante fuera del control del capital.",
    metrics: [
      {
        label: "Profit factor",
        value: Number.isFinite(profitFactor) && profitFactor > 0 ? profitFactor.toFixed(2) : "—",
        meta: `${totalTrades} trades`,
        tone: "neutral",
      },
      {
        label: "Win rate",
        value: totalTrades > 0 ? formatPercent(winRate / 100) : "—",
        meta: "Sin señal extrema activa",
        tone: "neutral",
      },
    ],
  };
}

function hasActiveEnforcementSignal(riskStatus) {
  return Boolean(
    riskStatus?.blockNewTrades ||
    riskStatus?.reduceSize ||
    riskStatus?.closePositionsRequired ||
    ["blocked", "breach", "warning"].includes(String(riskStatus?.riskStatus || "").toLowerCase())
  );
}

export function renderDashboard(root, state) {
  const accountSwitcher = document.getElementById("accountSwitcher");
  if (accountSwitcher) {
    accountSwitcher.innerHTML = "";
    accountSwitcher.classList.add("is-empty");
  }

  const liveAccountIds = Array.isArray(state.liveAccountIds) ? state.liveAccountIds : [];
  const activeAccountId = resolveSelectedLiveAccountId(state);
  const hasLiveAccounts = hasResolvedLiveAccounts(state);
  console.log("[KMFX][PANEL]", {
    liveAccountIds,
    currentAccount: state.currentAccount,
    activeAccountId,
    hasLiveAccounts,
  });
  const model = selectCurrentModel(state);
  const account = selectCurrentAccount(state);
  const dashboardPayload = selectCurrentDashboardPayload(state);
  const performanceView = resolvePerformanceViewModel(account);
  console.log("[KMFX][PANEL][TRACE]", {
    currentAccount: state.currentAccount,
    activeAccountId,
    accountId: account?.id || "",
    sourceType: account?.sourceType || "",
    payloadSource: dashboardPayload?.payloadSource || "",
    rawSnapshot: {
      balance: dashboardPayload?.balance,
      equity: dashboardPayload?.equity,
      openPnl: dashboardPayload?.openPnl,
      closedPnl: dashboardPayload?.closedPnl,
      positions: Array.isArray(dashboardPayload?.positions) ? dashboardPayload.positions.length : 0,
      trades: Array.isArray(dashboardPayload?.trades) ? dashboardPayload.trades.length : 0,
      history: Array.isArray(dashboardPayload?.history) ? dashboardPayload.history.length : 0,
    },
    model: {
      equity: model?.account?.equity,
      openPnl: model?.account?.openPnl,
      closedPnl: model?.account?.closedPnl,
      totalPnl: model?.account?.totalPnl,
      totalTrades: model?.totals?.totalTrades,
      equityCurve: Array.isArray(model?.equityCurve) ? model.equityCurve.length : 0,
      sourceTrace: model?.sourceTrace || null,
    },
  });

  if (!model || !account) {
    root.innerHTML = "";
    return;
  }

  console.log("[KMFX][DASHBOARD_MODE]", {
    mode: account?.sourceType === "mt5" ? "live" : "sandbox",
    activeAccountId,
    activeLiveAccountId: state.activeLiveAccountId || "",
    liveAccountIds,
    hasLiveAccounts,
    accountId: account?.id || "",
    sourceType: account?.sourceType || "",
  });

  const cumulativeReturn = model.cumulative?.totalPct || 0;
  const display = resolveAccountDisplayIdentity(account);
  const authority = resolveAccountDataAuthority(account);
  const accountTypeLabel = getAccountTypeLabel(model.profile.mode, account.name);
  const isDarkTheme = state.ui.theme === "dark";
  const axisLine = getComputedStyle(document.documentElement).getPropertyValue("--chart-axis-line").trim() || undefined;
  const axisStandard = getComputedStyle(document.documentElement).getPropertyValue("--chart-axis-text").trim() || undefined;
  const chartSpecs = [];
  const heroRange = root.dataset.heroRange || "1M";
  const adminTracePanel = renderAdminTracePanel(state, {
    title: "Panel source trace",
    subtitle: "Resolución de cuenta y contrato usado para este render.",
    items: [
      { label: "account_id", value: account?.id || "" },
      { label: "currentAccount", value: state.currentAccount || "" },
      { label: "activeLiveAccountId", value: state.activeLiveAccountId || "" },
      { label: "sourceType", value: account?.sourceType || "" },
      { label: "payloadSource", value: authority.payloadSource || dashboardPayload?.payloadSource || "" },
      { label: "sourceUsed", value: authority.sourceUsed || performanceView.sourceUsed || "" },
      { label: "trades", value: authority.tradeCount || model?.totals?.totalTrades || 0 },
      { label: "history", value: authority.historyPoints || 0 },
    ],
  });
  const liveBaseCurve = Array.isArray(performanceView.chartSeries) && performanceView.chartSeries.length
    ? performanceView.chartSeries
    : [
        { label: "Base", value: model.account.balance },
        { label: "Ahora", value: model.account.equity },
      ];
  const heroCurveCacheKey = `${account?.id || "dashboard"}:${account?.sourceType || ""}`;
  const baseCurve = buildHeroCurve(root, {
    cacheKey: heroCurveCacheKey,
    incomingCurve: liveBaseCurve,
    liveValue: performanceView.equity,
    hasOpenPositions: Number(performanceView.openPositionsCount || 0) > 0,
  });
  const heroCurve = getHeroRangePoints(heroRange, baseCurve);
  const heroXAxisFormatter = (label, index, allLabels, value, ticks) => {
    if (!label) return "";
    const d = new Date(label);
    if (isNaN(d)) return label;
    if (heroRange === "YTD" || heroRange === "1M") {
      return d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
    } else if (heroRange === "1W") {
      return d.toLocaleDateString("es-ES", { weekday: "short", day: "numeric" });
    } else if (heroRange === "1D") {
      return d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
    } else if (heroRange === "4H" || heroRange === "H1") {
      return d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
    }
    return label;
  };
  const balanceCurve = heroCurve.map((point) => ({ ...point, value: model.account.balance }));
  const heroChartValues = [...heroCurve, ...balanceCurve]
    .map((point) => Number(point?.value))
    .filter((value) => Number.isFinite(value));
  const heroMinValue = heroChartValues.length ? Math.min(...heroChartValues) : model.account.balance;
  const heroMaxValue = heroChartValues.length ? Math.max(...heroChartValues) : model.account.equity;
  const heroValueSpan = Math.max(
    heroMaxValue - heroMinValue,
    Math.max(Math.abs(heroMaxValue), Math.abs(heroMinValue), 1) * 0.008,
  );
  const heroValuePadding = Math.max(
    heroValueSpan * 0.22,
    Math.max(Math.abs(heroMaxValue), Math.abs(heroMinValue), 1) * 0.002,
  );
  const heroStart = heroCurve[0]?.value ?? model.account.balance;
  const heroEnd = heroCurve.at(-1)?.value ?? model.account.equity;
  const heroDelta = heroEnd - heroStart;
  const heroDeltaPct = heroStart ? (heroDelta / heroStart) * 100 : 0;
  if (account?.sourceType === "mt5" && performanceView.usedExplicitLivePayload) {
    console.info("[KMFX][LEGACY_BLOCKED]", {
      account_id: account?.id || "",
      login: account?.login || "",
      broker: account?.broker || "",
      payloadSource: performanceView.payloadSource,
      balance: performanceView.balance,
      equity: performanceView.equity,
      openPnl: performanceView.openPnl,
      totalPnl: performanceView.totalPnl,
      historyLength: performanceView.historyPoints,
      renderTarget: "dashboard_performance",
      primaryMetricUsed: performanceView.primaryMetricUsed,
    });
  }
  const currentPnl = Number(performanceView.openPnl || 0);
  const bannerMetricValue = Number(performanceView.mainPerformanceValue || 0);
  const heroPnlLabel = account?.sourceType === "mt5" ? "Open PnL" : "PnL total";
  const hasPanelSecondMetricFromReport = Number.isFinite(Number(performanceView?.reportMetrics?.netProfit));
  const panelSecondMetricValue = hasPanelSecondMetricFromReport
    ? Number(performanceView.reportMetrics.netProfit)
    : currentPnl;
  const panelSecondMetricLabel = hasPanelSecondMetricFromReport ? "PnL neto" : heroPnlLabel;
  if (performanceView?.sourceUsed === "reportMetrics") {
    console.info("[KMFX][PANEL_SINGLE_METRIC_SOURCE]", {
      account_id: performanceView.selectedAccountId,
      login: performanceView.login,
      broker: performanceView.broker,
      payloadSource: performanceView.payloadSource,
      renderTarget: "dashboard_main_performance_value",
      sourceUsed: performanceView.sourceUsed,
      primaryMetricUsed: performanceView.primaryMetricUsed,
      value: bannerMetricValue,
    });
  } else {
    console.info("[KMFX][PANEL_SINGLE_METRIC_FALLBACK]", {
      account_id: performanceView.selectedAccountId,
      login: performanceView.login,
      broker: performanceView.broker,
      payloadSource: performanceView.payloadSource,
      renderTarget: "dashboard_main_performance_value",
      sourceUsed: performanceView.sourceUsed,
      primaryMetricUsed: performanceView.primaryMetricUsed,
      value: bannerMetricValue,
    });
  }
  if (hasPanelSecondMetricFromReport) {
    console.info("[KMFX][PANEL_SECOND_METRIC_SOURCE]", {
      account_id: performanceView.selectedAccountId,
      login: performanceView.login,
      broker: performanceView.broker,
      payloadSource: performanceView.payloadSource,
      renderTarget: "dashboard_secondary_pnl_value",
      sourceUsed: "reportMetrics.netProfit",
      value: panelSecondMetricValue,
    });
  } else {
    console.info("[KMFX][PANEL_SECOND_METRIC_FALLBACK]", {
      account_id: performanceView.selectedAccountId,
      login: performanceView.login,
      broker: performanceView.broker,
      payloadSource: performanceView.payloadSource,
      renderTarget: "dashboard_secondary_pnl_value",
      sourceUsed: "existing_open_pnl",
      value: panelSecondMetricValue,
    });
  }
  const currentReturnPct = model.account.balance ? (panelSecondMetricValue / model.account.balance) * 100 : cumulativeReturn;
  console.log("[KMFX][HERO][SOURCE]", {
    accountId: account?.id || "",
    sourceType: account?.sourceType || "",
    payloadSource: performanceView.payloadSource,
    heroOpenPnl: performanceView.openPnl,
    heroClosedPnl: performanceView.closedPnl,
    heroTotalPnl: performanceView.totalPnl,
    openPositionsCount: performanceView.openPositionsCount,
    usedExplicitLivePayload: performanceView.usedExplicitLivePayload,
  });
  console.log("[KMFX][ACCOUNT_BANNER][SOURCE]", {
    accountId: account?.id || "",
    sourceType: account?.sourceType || "",
    payloadSource: performanceView.payloadSource,
    bannerMetricValue,
    heroOpenPnl: performanceView.openPnl,
    heroClosedPnl: performanceView.closedPnl,
    heroTotalPnl: performanceView.totalPnl,
    openPositionsCount: performanceView.openPositionsCount,
    usedExplicitLivePayload: performanceView.usedExplicitLivePayload,
  });
  console.info("[KMFX][PERFORMANCE_VIEW_MODEL]", {
    account_id: performanceView.selectedAccountId,
    login: performanceView.login,
    broker: performanceView.broker,
    sourceType: account?.sourceType || "",
    payloadSource: performanceView.payloadSource,
    balance: performanceView.balance,
    equity: performanceView.equity,
    mainPerformanceValue: performanceView.mainPerformanceValue,
    openPnl: performanceView.openPnl,
    totalPnl: performanceView.totalPnl,
    openPositionsCount: performanceView.openPositionsCount,
    historyLength: performanceView.historyPoints,
    sourceUsed: performanceView.sourceUsed,
    primaryMetricUsed: performanceView.primaryMetricUsed,
  });
  console.info("[KMFX][PERFORMANCE_SOURCE]", {
    account_id: performanceView.selectedAccountId,
    login: performanceView.login,
    broker: performanceView.broker,
    sourceType: account?.sourceType || "",
    payloadSource: performanceView.payloadSource,
    balance: performanceView.balance,
    equity: performanceView.equity,
    mainPerformanceValue: performanceView.mainPerformanceValue,
    openPnl: performanceView.openPnl,
    totalPnl: performanceView.totalPnl,
    openPositionsCount: performanceView.openPositionsCount,
    historyLength: performanceView.historyPoints,
    renderTarget: "account_banner_and_performance_card",
    sourceUsed: performanceView.sourceUsed,
    primaryMetricUsed: performanceView.primaryMetricUsed,
  });
  console.info("[KMFX][PERFORMANCE_PRIMARY_VALUE]", {
    account_id: performanceView.selectedAccountId,
    login: performanceView.login,
    broker: performanceView.broker,
    payloadSource: performanceView.payloadSource,
    balance: performanceView.balance,
    equity: performanceView.equity,
    openPnl: performanceView.openPnl,
    totalPnl: performanceView.totalPnl,
    historyLength: performanceView.historyPoints,
    primaryMetricUsed: performanceView.primaryMetricUsed,
    mainPerformanceValue: performanceView.mainPerformanceValue,
  });
  console.info("[KMFX][CHART_SOURCE]", {
    account_id: performanceView.selectedAccountId,
    login: performanceView.login,
    broker: performanceView.broker,
    sourceType: account?.sourceType || "",
    payloadSource: performanceView.payloadSource,
    balance: performanceView.balance,
    equity: performanceView.equity,
    mainPerformanceValue: performanceView.mainPerformanceValue,
    openPnl: performanceView.openPnl,
    totalPnl: performanceView.totalPnl,
    openPositionsCount: performanceView.openPositionsCount,
    historyLength: performanceView.historyPoints,
    renderTarget: "dashboard_hero_equity_chart",
    sourceUsed: performanceView.usedExplicitLivePayload ? "dashboard_payload.history" : "model.equityCurve_fallback",
    primaryMetricUsed: performanceView.primaryMetricUsed,
  });
  console.info("[KMFX][DASHBOARD_LEDGER_AUTHORITY]", {
    account_id: account?.id || "",
    login: display.login,
    broker: display.broker,
    payloadSource: authority.payloadSource,
    tradeCount: authority.tradeCount,
    historyPoints: authority.historyPoints,
    firstTradeLabel: authority.firstTradeLabel,
    lastTradeLabel: authority.lastTradeLabel,
    sourceUsed: authority.sourceUsed,
  });
  const totalPnlDisplay = formatCurrency(Math.abs(panelSecondMetricValue));
  const totalReturnDisplay = formatPercent(Math.abs(currentReturnPct)).replace(/^[+-]/, "");
  const heroRangeValueDisplay = formatCurrency(Math.abs(heroDelta));
  const heroRangePctDisplay = formatPercent(Math.abs(heroDeltaPct)).replace(/^[+-]/, "");
  const heroRangeLabel = heroRange === "H1"
    ? "1 hora"
    : heroRange === "4H"
      ? "4 horas"
      : heroRange === "1D"
        ? "intradía"
        : heroRange === "1W"
          ? "1 semana"
          : heroRange === "YTD"
            ? "YTD"
            : "1 mes";
  const heroRangeSignedValue = `${heroDelta >= 0 ? "+" : "-"}${heroRangeValueDisplay}`;
  const heroRangeSignedPct = `${heroDeltaPct >= 0 ? "+" : "-"}${heroRangePctDisplay}`;
  const riskSummary = selectRiskSummary(state);
  const riskStatus = selectRiskStatus(state);
  const riskLimits = selectRiskLimits(state);
  const riskExposure = selectRiskExposure(state);
  const riskTone = riskToneFromStatus(riskStatus.riskStatus, riskStatus.severity);
  const riskStateLabel = riskStateDisplayLabel(riskStatus.riskStatus);
  const primaryDistanceToLimit = Math.min(
    riskSummary.distanceToMaxDdLimitPct || 0,
    riskSummary.distanceToDailyDdLimitPct || 0
  );
  const riskHeadline = riskStatus.blockingRule || riskStatus.reasonCode || "Monitorización activa";
  const riskAction = riskStatus.actionRequired || "Sin acción requerida.";
  const dashboardInsight = deriveDashboardInsight({
    riskStatus,
    riskSummary,
    riskLimits,
    model,
    openPositionsCount: performanceView.openPositionsCount,
  });
  const operationalRead = getOperationalRead({
    riskStatus,
    primaryDistanceToLimit,
    openPositionsCount: performanceView.openPositionsCount,
  });
  const riskPostureRead = getRiskPostureRead({
    totalOpenRiskPct: riskSummary.totalOpenRiskPct,
    maxOpenTradeRiskPct: riskSummary.maxOpenTradeRiskPct,
    maxRiskPerTradePct: riskSummary.maxRiskPerTradePct,
  });
  const postureTone = riskPostureRead.tone || "neutral";
  const operationalMarginTone = ["warning", "breach", "blocked"].includes(riskTone) ? riskTone : "neutral";
  const hasEnforcementSignal = hasActiveEnforcementSignal(riskStatus);
  const hasExposureSignal = Array.isArray(riskExposure.symbolExposure) && riskExposure.symbolExposure.length > 0;
  const hasOpenTradeRisk = Array.isArray(riskExposure.openTradeRisks) && riskExposure.openTradeRisks.length > 0;
  const hasOpenPositions = Number(performanceView.openPositionsCount || 0) > 0;
  const dashboardSubtitle = hasOpenPositions
    ? "Capital, riesgo y estado operativo de un vistazo."
    : "Capital, riesgo y estado operativo de un vistazo. Sin posiciones abiertas.";
  console.log("[KMFX][PANEL_STATE_RESOLUTION]", {
    selectedAccountId: account?.id || activeAccountId || "",
    currentAccount: state.currentAccount,
    sourceType: account?.sourceType || "",
    panelSourceUsed: authority.sourceUsed || "",
    payloadSource: authority.payloadSource || dashboardPayload?.payloadSource || "",
    hasLiveAccounts,
    hasUsableLiveSnapshot: Boolean(authority.hasUsableLiveSnapshot),
    sinConexionTrigger: {
      connectionState: account?.connection?.state || "",
      connected: Boolean(account?.connection?.connected),
      lastSync: account?.connection?.lastSync || dashboardPayload?.timestamp || "",
    },
    riesgoFueraDeReglaTrigger: {
      complianceRiskStatus: account?.compliance?.riskStatus || "",
      riskSnapshotStatus: riskStatus.riskStatus,
      severity: riskStatus.severity,
      blockingRule: riskStatus.blockingRule,
      reasonCode: riskStatus.reasonCode,
      enforcement: {
        blockNewTrades: riskStatus.blockNewTrades,
        reduceSize: riskStatus.reduceSize,
        closePositionsRequired: riskStatus.closePositionsRequired,
      },
    },
  });
  chartSpecs.push(
    lineAreaSpec("dashboard-hero-equity-chart", heroCurve, {
      tone: "blue",
      extraDatasets: [{
        label: "Balance",
        points: balanceCurve,
        tone: "neutral",
        borderDash: [2, 6],
        borderWidth: 0.95,
        formatter: (value) => formatCurrency(value)
      }],
      showXAxis: true,
      showYAxis: true,
      maxYTicks: 5,
      autoSkipXTicks: true,
      xAxisFormatter: heroXAxisFormatter,
      yMin: heroMinValue - heroValuePadding,
      yMax: heroMaxValue + heroValuePadding,
      borderWidth: 2.15,
      pointRadius: (context) => (context.dataIndex === heroCurve.length - 1 ? 4 : 0),
      pointHoverRadius: (context) => (context.dataIndex === heroCurve.length - 1 ? 4.6 : 3),
      pointHitRadius: 20,
      pointBorderWidth: 1.25,
      fill: true,
      fillAlphaStart: 0.18,
      fillAlphaEnd: 0.0,
      glowAlpha: 0,
      tension: 0.68,
      animationDisabled: true,
      animationDuration: 0,
      axisColor: axisStandard,
      axisFontSize: 10,
      axisFontWeight: "500",
      yTickPadding: 4,
      xTickPadding: 10,
      maxXTicks: heroRange === "YTD" ? 5 : heroRange === "1M" ? 4 : heroRange === "1W" ? 5 : heroRange === "1D" ? 6 : heroRange === "4H" ? 5 : 4,
      showYGrid: true,
      gridAlpha: isDarkTheme ? 0.028 : 0.045,
      gridColor: isDarkTheme ? "rgba(255,255,255,0.055)" : "rgba(15,23,42,0.08)",
      yGridDash: [3, 7],
      yGridWidth: 0.8,
      crosshairAlpha: isDarkTheme ? 0.08 : 0.08,
      yHeadroomRatio: 0,
      yBottomPaddingRatio: 0,
      layoutPaddingTop: 0,
      layoutPaddingBottom: 0,
      layoutPaddingLeft: 0,
      layoutPaddingRight: 12,
      showAxisBorder: false,
      axisBorderColor: axisLine,
      axisBorderWidth: 0,
      liveSmoothing: hasOpenPositions,
      liveSmoothingDuration: 840,
      endpointPulse: {
        radius: 4,
        amplitude: 4.4,
        alpha: isDarkTheme ? 0.24 : 0.18,
        minAlpha: isDarkTheme ? 0.1 : 0.08,
        steadyAlpha: isDarkTheme ? 0.16 : 0.1,
        coreAmplitude: 0.55,
        ringWidth: 1.35,
        ringWidthActive: 0.8,
        duration: 2200,
        animate: true,
      },
      formatter: (value, context) => {
        const prev = heroCurve[Math.max(context.dataIndex - 1, 0)]?.value ?? value;
        const delta = value - prev;
        return `${formatCurrency(value)} / ${delta >= 0 ? "+" : "-"}${formatCurrency(Math.abs(delta))}`;
      },
      axisFormatter: (value) => formatCompact(value)
    })
  );

  const structureSignature = JSON.stringify({
    accountId: account?.id || "",
    heroRange,
    hasOpenPositions,
    riskStatus: String(riskStatus?.riskStatus || ""),
    riskSeverity: String(riskStatus?.severity || ""),
    hasExposureSignal,
    hasOpenTradeRisk,
    hasEnforcementSignal,
  });
  const liveSignature = JSON.stringify({
    subtitle: dashboardSubtitle,
    equity: Number(model.account.equity || 0),
    pnl: Number(panelSecondMetricValue || 0),
    drawdown: Number(riskSummary.peakToEquityDrawdownPct || 0),
    edge: Number(model?.totals?.profitFactor || 0),
    heroDelta: Number(heroDelta || 0),
    openRisk: Number(riskSummary.totalOpenRiskPct || 0),
    tradeRisk: Number(riskSummary.maxOpenTradeRiskPct || 0),
    dailyDd: Number(riskSummary.dailyDrawdownPct || 0),
    margin: Number(primaryDistanceToLimit || 0),
  });
  const liveBindings = {
    dashboardSubtitle,
    heroSub: `${heroRangeLabel} · ${heroRangeSignedValue} (${heroRangeSignedPct})`,
    equityValue: Number(model.account.equity || 0),
    equityMeta: `${panelSecondMetricLabel} <span class="${panelSecondMetricValue >= 0 ? "metric-positive" : "metric-negative"}">${panelSecondMetricValue >= 0 ? "+" : "-"}${totalPnlDisplay} (${currentReturnPct >= 0 ? "+" : "-"}${totalReturnDisplay})</span>`,
    pnlValue: Number(panelSecondMetricValue || 0),
    pnlMeta: `Retorno ${formatPercent(currentReturnPct)}`,
    drawdownValue: Number(riskSummary.peakToEquityDrawdownPct || 0),
    drawdownMeta: `Daily DD ${formatRiskValuePct(riskSummary.dailyDrawdownPct, 2)} · Margen ${formatRiskValuePct(primaryDistanceToLimit, 2)}`,
    edgeValue: Number(model?.totals?.profitFactor || 0) > 0 ? Number(model.totals.profitFactor).toFixed(2) : "—",
    edgeMeta: `Win rate ${formatPercent((model?.totals?.winRate || 0) / 100)} · ${Number(model?.totals?.totalTrades || 0)} trades`,
    operationalSummary: hasOpenPositions ? operationalRead.summary : "Sin riesgo activo",
    riskSummary: hasOpenPositions ? riskPostureRead.summary : "Sin exposición",
    hasOpenPositions,
    dailyDdValue: Number(riskSummary.dailyDrawdownPct || 0),
    dailyDdMeta: `Pico ${formatRiskCurrency(riskSummary.dailyPeakEquity)}`,
    marginValue: Number(primaryDistanceToLimit || 0),
    marginMeta: `Max ${formatRiskValuePct(riskSummary.distanceToMaxDdLimitPct, 2)} · Daily ${formatRiskValuePct(riskSummary.distanceToDailyDdLimitPct, 2)}`,
    stateValue: riskStateLabel,
    stateMeta: operationalRead.detail,
    operationalFoot: operationalRead.footer || "",
    openRiskValue: Number(riskSummary.totalOpenRiskPct || 0),
    openRiskMeta: formatRiskCurrency(riskSummary.totalOpenRiskAmount),
    tradeRiskValue: Number(riskSummary.maxOpenTradeRiskPct || 0),
    tradeRiskMeta: `Política ${formatRiskValuePct(riskSummary.maxRiskPerTradePct, 2)}`,
    riskFoot: riskPostureRead.detail,
  };

  if (root.__dashboardStructureSignature === structureSignature && root.__dashboardRendered) {
    if (root.__dashboardLiveSignature !== liveSignature) {
      updateDashboardLiveNodes(root, liveBindings);
      updateCharts(root, chartSpecs);
      root.__dashboardLiveSignature = liveSignature;
    }
    return;
  }

  root.innerHTML = `
    <section class="dashboard-screen dashboard-page-flow">
      <header class="calendar-screen__header dashboard-screen__header">
        <div class="calendar-screen__copy">
          <div class="calendar-screen__eyebrow">Dashboard</div>
          <h1 class="calendar-screen__title">Dashboard</h1>
          <p class="calendar-screen__subtitle" data-dashboard-subtitle>${dashboardSubtitle}</p>
        </div>
        <div class="dashboard-screen__actions">
          <button class="btn-primary btn-inline dashboard-screen__add-account" type="button" data-open-connection-wizard="true" data-connection-source="dashboard">Añadir cuenta</button>
        </div>
      </header>

      <section class="tl-kpi-row dashboard-summary-kpis">
        ${renderDashboardKpiCard({
          key: "equity",
          label: "Equity",
          value: formatCurrency(model.account.equity),
          meta: `${panelSecondMetricLabel} <span class="${panelSecondMetricValue >= 0 ? "metric-positive" : "metric-negative"}">${panelSecondMetricValue >= 0 ? "+" : "-"}${totalPnlDisplay} (${currentReturnPct >= 0 ? "+" : "-"}${totalReturnDisplay})</span>`,
        })}
        ${renderDashboardKpiCard({
          key: "pnl",
          label: panelSecondMetricLabel,
          value: `${panelSecondMetricValue >= 0 ? "+" : "-"}${formatCurrency(Math.abs(panelSecondMetricValue))}`,
          valueClass: panelSecondMetricValue >= 0 ? "metric-positive" : "metric-negative",
          meta: `Retorno ${formatPercent(currentReturnPct)}`,
        })}
        ${renderDashboardKpiCard({
          key: "dd",
          label: "Drawdown actual",
          value: formatRiskValuePct(riskSummary.peakToEquityDrawdownPct, 2),
          valueClass: Number(riskSummary.peakToEquityDrawdownPct || 0) > 0 && String(riskStatus.riskStatus || "").toLowerCase() === "warning"
            ? "metric-warning"
            : "",
          meta: `Daily DD ${formatRiskValuePct(riskSummary.dailyDrawdownPct, 2)} · Margen ${formatRiskValuePct(primaryDistanceToLimit, 2)}`,
        })}
        ${renderDashboardKpiCard({
          key: "edge",
          label: "Edge",
          value: Number(model?.totals?.profitFactor || 0) > 0 ? Number(model.totals.profitFactor).toFixed(2) : "—",
          meta: `Win rate ${formatPercent((model?.totals?.winRate || 0) / 100)} · ${Number(model?.totals?.totalTrades || 0)} trades`,
          valueClass: "dashboard-kpi-muted-value",
          cardClass: "dashboard-kpi-support",
        })}
      </section>

      <section class="dashboard-layout">
        <article class="tl-section-card dashboard-primary-card">
          <div class="calendar-panel-head dashboard-primary-card__head">
            <div>
              <div class="calendar-panel-title">Equity y balance</div>
              <div class="calendar-panel-sub" data-dashboard-hero-sub>${heroRangeLabel} · ${heroRangeSignedValue} (${heroRangeSignedPct})</div>
            </div>
            <div class="widget-segmented" role="tablist" aria-label="Rango del gráfico">
              ${["H1", "4H", "1D", "1W", "1M", "YTD"].map((range) => `
                <button class="widget-segmented-btn ${heroRange === range ? "active" : ""}" type="button" data-hero-range="${range}">${range}</button>
              `).join("")}
            </div>
          </div>

          <div class="dashboard-primary-card__body">
            <div class="dashboard-primary-card__chart">
              ${chartCanvas("dashboard-hero-equity-chart", 288, "kmfx-chart-shell--hero")}
            </div>
          </div>
        </article>

        <div class="dashboard-secondary-stack">
          <article class="tl-section-card dashboard-secondary-card">
            <div class="calendar-panel-head dashboard-secondary-card__head">
              <div>
                <div class="calendar-panel-title">Operational state</div>
                <div class="calendar-panel-sub" data-dashboard-operational-summary>${hasOpenPositions ? operationalRead.summary : "Sin riesgo activo"}</div>
              </div>
              ${hasOpenPositions ? renderRiskStatusBadge(riskStatus.riskStatus, riskStatus.severity) : ""}
            </div>

            ${hasOpenPositions ? `
              <div class="dashboard-secondary-card__metrics">
                ${renderDashboardInlineRiskCard({
                  label: "Daily DD",
                  value: formatRiskValuePct(riskSummary.dailyDrawdownPct, 2),
                  meta: `Pico ${formatRiskCurrency(riskSummary.dailyPeakEquity)}`,
                  tone: riskTone,
                  valueAttr: 'data-dashboard-operational-dailydd-value',
                  metaAttr: 'data-dashboard-operational-dailydd-meta',
                })}
                ${renderDashboardInlineRiskCard({
                  label: "Margen",
                  value: formatRiskValuePct(primaryDistanceToLimit, 2),
                  meta: `Max ${formatRiskValuePct(riskSummary.distanceToMaxDdLimitPct, 2)} · Daily ${formatRiskValuePct(riskSummary.distanceToDailyDdLimitPct, 2)}`,
                  tone: operationalMarginTone,
                  valueAttr: 'data-dashboard-operational-margin-value',
                  metaAttr: 'data-dashboard-operational-margin-meta',
                })}
                ${renderDashboardInlineRiskCard({
                  label: "Estado",
                  value: riskStateLabel,
                  meta: operationalRead.detail,
                  tone: riskTone,
                  valueAttr: 'data-dashboard-operational-state-value',
                  metaAttr: 'data-dashboard-operational-state-meta',
                })}
              </div>

              ${operationalRead.footer ? `
                <div class="dashboard-secondary-card__foot">
                  <span data-dashboard-operational-foot>${operationalRead.footer}</span>
                </div>
              ` : ""}
            ` : `
              <div class="dashboard-secondary-card__metrics dashboard-secondary-card__metrics--two">
                ${renderRiskMetricCard({
                  label: "Estado",
                  value: "Sin riesgo activo",
                  meta: "No hay posiciones abiertas ahora.",
                  tone: "neutral",
                })}
              </div>
            `}
          </article>

          <article class="tl-section-card dashboard-secondary-card">
            <div class="calendar-panel-head">
              <div>
                <div class="calendar-panel-title">Risk posture</div>
                <div class="calendar-panel-sub" data-dashboard-risk-summary>${hasOpenPositions ? riskPostureRead.summary : "Sin exposición"}</div>
              </div>
            </div>
            ${hasOpenPositions ? `
              <div class="dashboard-secondary-card__metrics dashboard-secondary-card__metrics--two">
                ${renderDashboardInlineRiskCard({
                  label: "Open risk",
                  value: formatRiskValuePct(riskSummary.totalOpenRiskPct, 2),
                  meta: formatRiskCurrency(riskSummary.totalOpenRiskAmount),
                  tone: postureTone,
                  valueAttr: 'data-dashboard-risk-open-value',
                  metaAttr: 'data-dashboard-risk-open-meta',
                })}
                ${renderDashboardInlineRiskCard({
                  label: "Riesgo por trade",
                  value: formatRiskValuePct(riskSummary.maxOpenTradeRiskPct, 2),
                  meta: `Política ${formatRiskValuePct(riskSummary.maxRiskPerTradePct, 2)}`,
                  tone: postureTone,
                  valueAttr: 'data-dashboard-risk-trade-value',
                  metaAttr: 'data-dashboard-risk-trade-meta',
                })}
              </div>
              <div class="dashboard-secondary-card__foot">
                <span data-dashboard-risk-foot>${riskPostureRead.detail}</span>
              </div>
            ` : `
              <div class="dashboard-secondary-card__metrics dashboard-secondary-card__metrics--two">
                ${renderRiskMetricCard({
                  label: "Exposición",
                  value: "Sin exposición",
                  meta: "0% de riesgo abierto sobre capital.",
                  tone: "neutral",
                })}
              </div>
            `}
          </article>
        </div>
      </section>

      ${hasExposureSignal ? `
        <section class="dashboard-section-stack">
          <article class="tl-section-card dashboard-section-card">
            <div class="calendar-panel-head">
              <div>
                <div class="calendar-panel-title">Exposición</div>
                <div class="calendar-panel-sub">Riesgo abierto por símbolo.</div>
              </div>
            </div>
            ${renderSymbolExposureTable(riskExposure.symbolExposure)}
          </article>
        </section>
      ` : ""}

      ${hasEnforcementSignal ? `
        <section class="dashboard-section-stack">
          <article class="tl-section-card dashboard-section-card">
            <div class="calendar-panel-head">
              <div>
                <div class="calendar-panel-title">Enforcement</div>
                <div class="calendar-panel-sub">Decisión operativa del motor de riesgo.</div>
              </div>
            </div>
            ${renderEnforcementPanel(riskStatus)}
          </article>
        </section>
      ` : ""}

      ${hasOpenTradeRisk ? `
        <section class="dashboard-section-stack">
          <article class="tl-section-card dashboard-section-card">
            <div class="calendar-panel-head">
              <div>
                <div class="calendar-panel-title">Riesgo por posición</div>
                <div class="calendar-panel-sub">Posiciones abiertas con stop y P&amp;L.</div>
              </div>
            </div>
            ${renderOpenTradeRiskTable(riskExposure.openTradeRisks)}
          </article>
        </section>
      ` : ""}
    </section>
  `;
  mountCharts(root, chartSpecs);
  root.__dashboardStructureSignature = structureSignature;
  root.__dashboardLiveSignature = liveSignature;
  root.__dashboardRendered = true;

  root.querySelectorAll("[data-hero-range]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextRange = button.dataset.heroRange;
      if (!nextRange || nextRange === root.dataset.heroRange) return;
      root.dataset.heroRange = nextRange;
      renderDashboard(root, state);
    });
  });
}
