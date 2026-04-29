import { formatCompact, formatCurrency, formatPercent, getAccountTypeLabel, hasLiveAccounts as hasResolvedLiveAccounts, resolveAccountDataAuthority, resolveAccountDisplayIdentity, resolveSelectedLiveAccountId, resolvePerformanceViewModel, selectCurrentAccount, selectCurrentDashboardPayload, selectCurrentModel } from "./utils.js?v=build-20260406-213500";
import { chartCanvas, lineAreaSpec, mountCharts, updateCharts } from "./chart-system.js?v=build-20260406-213500";
import { selectRiskExposure, selectRiskLimits, selectRiskStatus, selectRiskSummary } from "./risk-selectors.js?v=build-20260406-213500";
import { kpiCardMarkup, kmfxBadgeMarkup, pageHeaderMarkup, pnlTextMarkup } from "./ui-primitives.js?v=build-20260406-213500";
import {
  formatRiskCurrency,
  formatRiskValuePct,
  renderOpenTradeRiskTable,
  renderRiskStatusBadge,
  renderSymbolExposureTable,
  riskToneFromStatus,
} from "./risk-panel-components.js?v=build-20260406-213500";
import { renderAdminTracePanel } from "./admin-mode.js?v=build-20260406-213500";

function parseChartAxisDate(pointOrLabel) {
  const rawValue = typeof pointOrLabel === "object" && pointOrLabel !== null
    ? (pointOrLabel.timestamp || pointOrLabel.time || pointOrLabel.date || pointOrLabel.datetime || pointOrLabel.when || pointOrLabel.label || "")
    : pointOrLabel;
  let raw = String(rawValue || "").trim();
  if (!raw) return null;
  // Normalize MT5 date format: "2026.01.06 16:45:35" → "2026-01-06T16:45:35"
  if (typeof raw === "string" && /^\d{4}\.\d{2}\.\d{2}/.test(raw)) {
    raw = raw.replace(/^(\d{4})\.(\d{2})\.(\d{2})/, "$1-$2-$3").replace(" ", "T");
  }
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

  if (range === "1D") return aggregateHeroPointsByDay(datedPoints, 14);
  if (range === "1W") return aggregateHeroPointsByWeek(datedPoints, 12);
  if (range === "1M") return aggregateHeroPointsByMonth(datedPoints);
  if (range === "YTD") return aggregateHeroPointsByWeek(datedPoints, null, { yearToDate: true });

  const endDate = datedPoints[datedPoints.length - 1].date;
  const startDate = getHeroRangeStartDate(range, endDate);

  const filteredEntries = datedPoints.filter(({ date }) => date >= startDate);
  const previousEntry = [...datedPoints].reverse().find(({ date }) => date < startDate);
  if (filteredEntries.length >= 2) {
    if (previousEntry && filteredEntries[0].date > startDate) {
      return [
        {
          ...previousEntry.point,
          label: startDate.toISOString(),
          timestamp: startDate.toISOString(),
          __syntheticBoundary: true,
        },
        ...filteredEntries.map(({ point }) => point),
      ];
    }
    return filteredEntries.map(({ point }) => point);
  }
  if (filteredEntries.length === 1) {
    if (previousEntry) {
      return [
        {
          ...previousEntry.point,
          label: startDate.toISOString(),
          timestamp: startDate.toISOString(),
          __syntheticBoundary: true,
        },
        filteredEntries[0].point,
      ];
    }
    return filteredEntries.map(({ point }) => point);
  }

  if (range === "H1") return points.slice(-4);
  if (range === "4H") return points.slice(-6);
  if (range === "1D") return points.slice(-5);
  if (range === "1W") return points.slice(-7);
  if (range === "YTD") return points;
  return points.slice(-14);
}

function getHeroTickTarget(range) {
  if (range === "H1") return 6;
  if (range === "4H") return 6;
  if (range === "1D") return 6;
  if (range === "1W") return 6;
  if (range === "1M") return 6;
  if (range === "YTD") return 6;
  return 5;
}

function getHeroRangeStartDate(range, endDate) {
  const startDate = new Date(endDate);
  if (range === "H1") startDate.setHours(startDate.getHours() - 5);
  else if (range === "4H") startDate.setHours(startDate.getHours() - 20);
  else if (range === "1D") startDate.setDate(startDate.getDate() - 13);
  else if (range === "1W") startDate.setDate(startDate.getDate() - 7 * 11);
  else if (range === "1M") startDate.setMonth(startDate.getMonth() - 11, 1);
  else if (range === "YTD") startDate.setMonth(0, 1);
  return startDate;
}

function formatHeroTimeTick(range, value) {
  if (!Number.isFinite(value)) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  if (range === "H1" || range === "4H") {
    return date.toLocaleTimeString("es-ES", { hour: "2-digit" });
  }
  if (range === "1D") {
    return date.toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
  }
  if (range === "1W") {
    return date.toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
  }
  if (range === "1M") {
    return date.toLocaleDateString("es-ES", { month: "short" });
  }
  return date.toLocaleDateString("es-ES", { month: "short" });
}

function formatHeroTooltipTitle(range, value) {
  if (!Number.isFinite(value)) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  if (range === "H1" || range === "4H") {
    return `${date.toLocaleDateString("es-ES", { day: "2-digit", month: "short" })} · ${date.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}`;
  }
  if (range === "1D" || range === "1W") {
    return date.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
  }
  return date.toLocaleDateString("es-ES", { month: "short", year: "numeric" });
}

function getHeroRangeSummaryLabel(range) {
  if (range === "H1") return "Últimas 5h";
  if (range === "4H") return "Últimas 20h";
  if (range === "1D") return "Últimos 14 días";
  if (range === "1W") return "Últimas 12 semanas";
  if (range === "1M") return "Histórico mensual";
  return "Año en curso";
}

function startOfDay(date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function startOfHour(date, stepHours = 1) {
  const next = new Date(date);
  next.setMinutes(0, 0, 0);
  if (stepHours > 1) {
    next.setHours(next.getHours() - (next.getHours() % stepHours));
  }
  return next;
}

function startOfMonth(date) {
  const next = new Date(date);
  next.setDate(1);
  next.setHours(0, 0, 0, 0);
  return next;
}

function startOfWeek(date) {
  const next = startOfDay(date);
  const day = next.getDay();
  const diff = (day + 6) % 7;
  next.setDate(next.getDate() - diff);
  return next;
}

function buildDayTickRange(startDate, endDate, stepDays = 1) {
  const tickValues = [];
  const cursor = startOfDay(startDate);
  const endValue = startOfDay(endDate).getTime();
  while (cursor.getTime() <= endValue) {
    tickValues.push(cursor.getTime());
    cursor.setDate(cursor.getDate() + stepDays);
  }
  return tickValues;
}

function buildWeekTickRange(startDate, endDate, stepWeeks = 1) {
  const tickValues = [];
  const cursor = startOfWeek(startDate);
  const endValue = startOfWeek(endDate).getTime();
  while (cursor.getTime() <= endValue) {
    tickValues.push(cursor.getTime());
    cursor.setDate(cursor.getDate() + (stepWeeks * 7));
  }
  return tickValues;
}

function buildMonthTickRange(startDate, endDate) {
  const tickValues = [];
  const cursor = startOfMonth(startDate);
  const endValue = startOfMonth(endDate).getTime();
  while (cursor.getTime() <= endValue) {
    tickValues.push(cursor.getTime());
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return tickValues;
}

function buildExactHourTickRange(startDate, endDate, stepHours = 1) {
  const tickValues = [];
  const cursor = new Date(startDate);
  const endValue = endDate.getTime();
  while (cursor.getTime() <= endValue) {
    tickValues.push(cursor.getTime());
    cursor.setHours(cursor.getHours() + stepHours);
  }
  return tickValues;
}

function buildExactMonthTickRange(startDate, endDate) {
  const tickValues = [];
  const cursor = new Date(startDate);
  const endValue = endDate.getTime();
  while (cursor.getTime() <= endValue) {
    tickValues.push(cursor.getTime());
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return tickValues;
}

function getWeekNumber(date) {
  const target = startOfDay(date);
  target.setDate(target.getDate() + 4 - (target.getDay() || 7));
  const yearStart = new Date(target.getFullYear(), 0, 1);
  return Math.ceil((((target - yearStart) / 86400000) + 1) / 7);
}

function aggregateHeroPoints(entries, bucketKeyFn, bucketTimestampFn) {
  const buckets = new Map();
  entries.forEach(({ point, date }) => {
    const key = bucketKeyFn(date);
    buckets.set(key, { point, date });
  });
  return [...buckets.values()].map(({ point, date }) => ({
    ...point,
    label: bucketTimestampFn(date).toISOString(),
    timestamp: bucketTimestampFn(date).toISOString(),
  }));
}

function aggregateHeroPointsByDay(entries, days = 14) {
  const aggregated = aggregateHeroPoints(
    entries,
    (date) => startOfDay(date).toISOString(),
    (date) => startOfDay(date),
  );
  return aggregated.slice(-days);
}

function aggregateHeroPointsByWeek(entries, weeks = 12, { yearToDate = false } = {}) {
  const scopedEntries = yearToDate
    ? entries.filter(({ date }) => date.getFullYear() === entries.at(-1)?.date?.getFullYear())
    : entries;
  const aggregated = aggregateHeroPoints(
    scopedEntries,
    (date) => startOfWeek(date).toISOString(),
    (date) => startOfWeek(date),
  );
  return Number.isFinite(weeks) ? aggregated.slice(-weeks) : aggregated;
}

function aggregateHeroPointsByMonth(entries, { yearToDate = false } = {}) {
  const scopedEntries = yearToDate
    ? entries.filter(({ date }) => date.getFullYear() === entries.at(-1)?.date?.getFullYear())
    : entries;
  return aggregateHeroPoints(
    scopedEntries,
    (date) => `${date.getFullYear()}-${date.getMonth()}`,
    (date) => startOfMonth(date),
  );
}

function sampleTimeValues(values, targetCount) {
  const uniqueValues = [...new Set(values.filter((value) => Number.isFinite(value)))].sort((a, b) => a - b);
  if (!uniqueValues.length) return [];
  if (!targetCount || uniqueValues.length <= targetCount) return uniqueValues;

  const sampled = [];
  for (let i = 0; i < targetCount; i += 1) {
    const index = Math.round((i * (uniqueValues.length - 1)) / Math.max(targetCount - 1, 1));
    sampled.push(uniqueValues[index]);
  }
  return [...new Set(sampled)];
}

function buildTickRange(startDate, endDate, unitHours = 1) {
  const tickValues = [];
  const cursor = startOfHour(startDate, unitHours);
  const alignedEnd = startOfHour(endDate, unitHours).getTime();
  while (cursor.getTime() <= alignedEnd) {
    tickValues.push(cursor.getTime());
    cursor.setHours(cursor.getHours() + unitHours);
  }
  return tickValues;
}

function buildHeroTickValues(range, heroCurve, startDate, endDate) {
  if (range === "H1") return buildExactHourTickRange(startDate, endDate, 1);
  if (range === "4H") return buildExactHourTickRange(startDate, endDate, 4);
  if (range === "1D") return buildDayTickRange(startDate, endDate, 3);
  if (range === "1W") return buildWeekTickRange(startDate, endDate, 2);
  if (range === "YTD") return buildExactMonthTickRange(startDate, endDate);
  return buildMonthTickRange(startDate, endDate);
}

function getHeroAxisPaddingMs(range) {
  if (range === "H1") return 12 * 60 * 1000;
  if (range === "4H") return 45 * 60 * 1000;
  if (range === "1D") return 12 * 60 * 60 * 1000;
  if (range === "1W") return 2 * 24 * 60 * 60 * 1000;
  if (range === "1M") return 7 * 24 * 60 * 60 * 1000;
  if (range === "YTD") return 10 * 24 * 60 * 60 * 1000;
  return 0;
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
  const targetTicks = getHeroTickTarget(range);
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

  const visibleIndices = new Set([0, total - 1].filter((index) => index >= 0 && index < total));
  if (firstDate && lastDate && total > 2 && targetTicks > 2) {
    const spanMs = Math.max(lastDate.getTime() - firstDate.getTime(), 1);
    for (let i = 1; i < targetTicks - 1; i += 1) {
      const targetTime = firstDate.getTime() + ((spanMs * i) / (targetTicks - 1));
      let bestIndex = -1;
      let bestDelta = Number.POSITIVE_INFINITY;
      parsedDates.forEach((date, index) => {
        if (!date) return;
        const delta = Math.abs(date.getTime() - targetTime);
        if (delta < bestDelta) {
          bestDelta = delta;
          bestIndex = index;
        }
      });
      if (bestIndex >= 0) visibleIndices.add(bestIndex);
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
  if (normalized === "breach") return "Reducir exposición";
  if (normalized === "warning") return "Riesgo moderado";
  return "Dentro de límites";
}

function dashboardEnforcementTone(value, activeTone = "risk") {
  return value ? activeTone : "neutral";
}

function renderDashboardEnforcementRow({ label, description, value, tone = "neutral" }) {
  return `
    <div class="dashboard-enforcement-row">
      <div>
        <span class="dashboard-enforcement-row__label">${escapeDashboardHtml(label)}</span>
        <p class="dashboard-enforcement-row__description">${escapeDashboardHtml(description)}</p>
      </div>
      ${kmfxBadgeMarkup({
        text: value,
        tone,
        className: "dashboard-enforcement-status",
      })}
    </div>
  `;
}

function renderDashboardEnforcementCard(riskStatus = {}) {
  const blockNewTrades = Boolean(riskStatus.blockNewTrades);
  const reduceSize = Boolean(riskStatus.reduceSize);
  const closePositionsRequired = Boolean(riskStatus.closePositionsRequired);
  const hasAllowNewTradesFlag = typeof riskStatus.allowNewTrades === "boolean";
  const allowNewTrades = riskStatus.allowNewTrades === true && !blockNewTrades;
  const newTradesValue = blockNewTrades
    ? "Bloqueadas"
    : hasAllowNewTradesFlag
      ? (allowNewTrades ? "Permitidas" : "No permitidas")
      : "Sin dato";
  const hasSpecificRestriction = blockNewTrades || reduceSize || closePositionsRequired || (hasAllowNewTradesFlag && !allowNewTrades);
  const normalizedStatus = String(riskStatus.riskStatus || "").toLowerCase();
  const statusTone = normalizedStatus === "blocked" || normalizedStatus === "breach"
    ? "risk"
    : normalizedStatus === "warning"
      ? "warning"
      : "info";
  const description = hasSpecificRestriction
    ? "El Risk Engine está aplicando restricciones para proteger la cuenta."
    : "El Risk Engine detectó una condición de vigilancia; revisa el estado antes de continuar.";
  const generalStatusDescription = hasSpecificRestriction
    ? "Restricción activa por el estado de riesgo."
    : "Revisa el estado antes de ampliar exposición.";

  return `
    <section class="dashboard-section-stack dashboard-enforcement">
      <article class="kmfx-ui-card dashboard-enforcement__card">
        <header class="dashboard-enforcement__header">
          <div>
            <p class="dashboard-enforcement__eyebrow">Risk Engine</p>
            <h2 class="dashboard-enforcement__title">Protección activa</h2>
            <p class="dashboard-enforcement__description">${description}</p>
          </div>
          ${kmfxBadgeMarkup({
            text: riskStateDisplayLabel(riskStatus.riskStatus),
            tone: statusTone,
            className: "dashboard-enforcement__badge",
          })}
        </header>

        <div class="dashboard-enforcement__grid">
          ${renderDashboardEnforcementRow({
            label: "Nuevas operaciones",
            description: "Permiso actual para abrir entradas nuevas.",
            value: newTradesValue,
            tone: blockNewTrades || (hasAllowNewTradesFlag && !allowNewTrades) ? "risk" : "neutral",
          })}
          ${renderDashboardEnforcementRow({
            label: "Tamaño de posición",
            description: "Ajuste aplicado al tamaño de nuevas posiciones.",
            value: reduceSize ? "Reducir" : "Sin ajuste",
            tone: dashboardEnforcementTone(reduceSize, "warning"),
          })}
          ${renderDashboardEnforcementRow({
            label: "Cierre requerido",
            description: "Indica si hay cierre de posiciones requerido.",
            value: closePositionsRequired ? "Sí" : "No",
            tone: dashboardEnforcementTone(closePositionsRequired, "risk"),
          })}
          ${renderDashboardEnforcementRow({
            label: "Estado general",
            description: generalStatusDescription,
            value: riskStateDisplayLabel(riskStatus.riskStatus),
            tone: statusTone,
          })}
        </div>
      </article>
    </section>
  `;
}

function getDashboardKpiTone(value) {
  const numericValue = Number(value || 0);
  if (numericValue > 0) return "profit";
  if (numericValue < 0) return "loss";
  return "neutral";
}

function getDashboardDrawdownKpiTone(drawdownPct) {
  const valueClass = getDrawdownValueClass(drawdownPct);
  if (valueClass === "metric-negative") return "risk";
  if (valueClass === "metric-warning") return "warning";
  return "neutral";
}

function renderDashboardKpiValue({ key = "", value, valueClass = "", tone = "neutral", meta = "", trend = "" }) {
  const metaHtml = (meta || trend)
    ? `<span class="dashboard-kpi-card__meta" data-kpi-meta>${[meta, trend].filter(Boolean).join(" / ")}</span>`
    : "";

  if (key === "pnl") {
    return `
      <span class="dashboard-kpi-card__value-stack">
        ${pnlTextMarkup({
          value,
          text: value,
          tone,
          className: `dashboard-kpi-card__metric ${valueClass}`,
          attrs: { "data-kpi-value": true },
        })}
        ${metaHtml}
      </span>
    `;
  }

  return `
    <span class="dashboard-kpi-card__value-stack">
      <span class="dashboard-kpi-card__metric ${escapeDashboardHtml(valueClass)}" data-kpi-value>${escapeDashboardHtml(value)}</span>
      ${metaHtml}
    </span>
  `;
}

function renderDashboardKpiCard({
  key = "",
  label,
  value,
  valueClass = "",
  meta = "",
  trend = "",
  trendTone = "",
  cardClass = "",
  tone = "neutral",
  badge = "",
}) {
  return kpiCardMarkup({
    label,
    valueHtml: renderDashboardKpiValue({ key, value, valueClass, tone, meta, trend }),
    trend: badge,
    trendTone: trendTone || tone,
    tone,
    className: `dashboard-kpi-card ${cardClass}`,
    attrs: key ? { "data-dashboard-kpi": key } : {},
  });
}

function setNodeHTML(root, selector, value) {
  const node = root.querySelector(selector);
  if (node) node.innerHTML = value;
}

function setNodeOuterHTML(root, selector, value) {
  const node = root.querySelector(selector);
  if (node) node.outerHTML = value;
}

function setNodeText(root, selector, value) {
  const node = root.querySelector(selector);
  if (node) node.textContent = value;
}

function toggleValueClasses(node, classMap = {}) {
  if (!node?.classList) return;
  Object.entries(classMap).forEach(([className, enabled]) => {
    node.classList.toggle(className, Boolean(enabled));
  });
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
  const pnlKpiTone = getDashboardKpiTone(payload.pnlValue);
  const pnlKpi = root.querySelector('[data-dashboard-kpi="pnl"]');
  const pnlValueNode = pnlKpi?.querySelector("[data-kpi-value]");
  if (pnlKpi) pnlKpi.setAttribute("data-tone", pnlKpiTone);
  if (pnlValueNode) {
    pnlValueNode.setAttribute("data-tone", pnlKpiTone);
    pnlValueNode.classList.toggle("metric-positive", pnlKpiTone === "profit");
    pnlValueNode.classList.toggle("metric-negative", pnlKpiTone === "loss");
  }
  setNodeText(root, '[data-dashboard-kpi="pnl"] [data-kpi-meta]', payload.pnlMeta);
  animateNumberContent(
    root.querySelector('[data-dashboard-kpi="dd"] [data-kpi-value]'),
    payload.drawdownValue,
    (value) => formatRiskValuePct(value, 2),
    620,
  );
  toggleValueClasses(root.querySelector('[data-dashboard-kpi="dd"] [data-kpi-value]'), {
    "metric-warning": payload.drawdownTone === "warning",
    "metric-negative": payload.drawdownTone === "risk",
  });
  const drawdownKpi = root.querySelector('[data-dashboard-kpi="dd"]');
  if (drawdownKpi) drawdownKpi.setAttribute("data-tone", payload.drawdownTone);
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
  if (payload.exposureTableHtml != null) {
    setNodeHTML(root, "[data-dashboard-exposure-table]", payload.exposureTableHtml);
  }
  if (payload.openTradeRiskHtml != null) {
    setNodeHTML(root, "[data-dashboard-open-trade-risk-table]", payload.openTradeRiskHtml);
  }
  if (payload.decisionLayerHtml != null) {
    setNodeOuterHTML(root, "[data-dashboard-decision-layer-shell]", payload.decisionLayerHtml);
  }
}

function renderDashboardInlineRiskCard({ label, value, meta = "", tone = "neutral", valueAttr = "", metaAttr = "" }) {
  return `
    <article class="dashboard-state-metric" data-tone="${tone}">
      <div class="dashboard-state-metric__label">${label}</div>
      <div class="dashboard-state-metric__value"${valueAttr ? ` ${valueAttr}` : ""}>${value}</div>
      ${meta ? `<div class="dashboard-state-metric__meta"${metaAttr ? ` ${metaAttr}` : ""}>${meta}</div>` : ""}
    </article>
  `;
}

const DASHBOARD_MIN_SAMPLE_TRADES = 5;

function firstFiniteDashboardNumber(...values) {
  for (const value of values) {
    const numericValue = Number(value);
    if (Number.isFinite(numericValue)) return numericValue;
  }
  return 0;
}

function escapeDashboardHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatSignedDashboardCurrency(value) {
  const numericValue = Number(value || 0);
  if (Math.abs(numericValue) < 0.005) return formatCurrency(0);
  return `${numericValue >= 0 ? "+" : "-"}${formatCurrency(Math.abs(numericValue))}`;
}

function getDashboardDecisionTone(statusTitle) {
  if (statusTitle === "Trader en control") return "success";
  if (statusTitle === "Bajo presión") return "warning";
  if (statusTitle === "Riesgo elevado" || statusTitle === "Protección activa") return "danger";
  if (statusTitle === "Cuenta sin sincronizar") return "neutral";
  if (statusTitle === "Sin muestra suficiente") return "warning";
  if (statusTitle === "Sin posiciones abiertas") return "info";
  return "neutral";
}

function getDashboardActionTone(statusTitle) {
  if (statusTitle === "Riesgo elevado" || statusTitle === "Protección activa") return "danger";
  if (statusTitle === "Bajo presión" || statusTitle === "Sin muestra suficiente") return "warning";
  if (statusTitle === "Trader en control" || statusTitle === "Sin posiciones abiertas") return "info";
  return "neutral";
}

function hasReliableDashboardSnapshot({ model, account, authority, dashboardPayload }) {
  if (!model || !account) return false;
  const sourceType = String(account?.sourceType || "").toLowerCase();
  if (sourceType !== "mt5") return true;

  const connectionState = String(account?.connection?.state || "").toLowerCase();
  const explicitlyDisconnected = ["disconnected", "offline", "error", "failed"].includes(connectionState);
  const hasUsableSnapshot = Boolean(authority?.hasUsableLiveSnapshot);
  const hasHistory = Number(authority?.historyPoints || 0) > 0 || Array.isArray(model?.equityCurve) && model.equityCurve.length > 0;
  const hasTrades = Number(authority?.tradeCount || model?.totals?.totalTrades || 0) > 0;
  const hasPositions = Number(model?.account?.openPositionsCount || 0) > 0 || Array.isArray(dashboardPayload?.positions) && dashboardPayload.positions.length > 0;
  const hasFiniteEquity = Number.isFinite(Number(model?.account?.equity));

  if (hasUsableSnapshot || hasHistory || hasTrades || hasPositions) return true;
  return !explicitlyDisconnected && hasFiniteEquity;
}

function buildDashboardEvidenceHtml(summary) {
  return `
    <dl class="dashboard-decision-compact__evidence">
      <div>
        <dt>Equity</dt>
        <dd>${escapeDashboardHtml(summary.equityText)}</dd>
      </div>
      <div>
        <dt>PnL neto</dt>
        <dd>${pnlTextMarkup({ value: summary.pnlValue, text: summary.pnlText })}</dd>
      </div>
      <div>
        <dt>DD actual</dt>
        <dd>${escapeDashboardHtml(summary.currentDrawdownText)}</dd>
      </div>
      <div>
        <dt>Daily DD</dt>
        <dd>${escapeDashboardHtml(summary.dailyDrawdownText)}</dd>
      </div>
      <div>
        <dt>Riesgo abierto</dt>
        <dd>${escapeDashboardHtml(summary.openRiskText)}</dd>
      </div>
      <div>
        <dt>Muestra</dt>
        <dd>${escapeDashboardHtml(summary.sampleText)}</dd>
      </div>
      <div>
        <dt>Edge</dt>
        <dd>${escapeDashboardHtml(summary.edgeText)}</dd>
      </div>
    </dl>
  `;
}

function buildMissingDashboardDecisionSummary() {
  return {
    statusTitle: "Cuenta sin sincronizar",
    statusDescription: "No hay una cuenta activa con datos suficientes para leer el estado.",
    causeTitle: "No hay snapshot fiable todavía",
    causeDescription: "El panel no tiene una fuente de datos válida para evaluar riesgo y rendimiento.",
    evidenceTitle: "Sin datos suficientes",
    evidenceDescription: "Falta una muestra operativa para interpretar la cuenta.",
    evidenceHtml: "",
    actionTitle: "Sincroniza la cuenta",
    actionDescription: "Conecta o sincroniza una cuenta para evaluar el estado.",
    tone: "warning",
    signature: "missing-account",
  };
}

function buildDashboardDecisionSummary({
  model,
  account,
  authority,
  dashboardPayload,
  performanceView,
  riskStatus,
  riskSummary,
  riskLimits,
  primaryDistanceToLimit,
  hasOpenPositions,
  panelSecondMetricValue,
  panelSecondMetricLabel,
}) {
  const reliableSnapshot = hasReliableDashboardSnapshot({ model, account, authority, dashboardPayload });
  const totalTrades = Number(model?.totals?.totalTrades || model?.trades?.length || 0);
  const winRate = Number(model?.totals?.winRate || 0);
  const profitFactor = Number(model?.totals?.profitFactor || 0);
  const currentDrawdownPct = firstFiniteDashboardNumber(
    riskSummary?.floatingDrawdownPct,
    riskSummary?.peakToEquityDrawdownPct,
    0
  );
  const dailyDrawdownPct = firstFiniteDashboardNumber(riskSummary?.dailyDrawdownPct, 0);
  const dailyLimitPct = Number(riskLimits?.policy?.dailyDdLimitPct || 0);
  const totalOpenRiskPct = Number(riskSummary?.totalOpenRiskPct || 0);
  const maxOpenTradeRiskPct = Number(riskSummary?.maxOpenTradeRiskPct || 0);
  const maxRiskPerTradePct = Number(riskSummary?.maxRiskPerTradePct || 0);
  const riskState = String(riskStatus?.riskStatus || "").toLowerCase();
  const severity = String(riskStatus?.severity || "").toLowerCase();
  const explicitRiskBreach = Boolean(
    riskStatus?.riskBreach ||
    riskStatus?.breach ||
    riskStatus?.isBreach ||
    riskSummary?.riskBreach ||
    riskSummary?.breach
  );
  const hardEnforcement = Boolean(
    riskStatus?.blockNewTrades ||
    riskStatus?.reduceSize ||
    riskStatus?.closePositionsRequired ||
    explicitRiskBreach ||
    ["blocked", "breach"].includes(riskState) ||
    severity === "critical"
  );
  const nearDailyLimit = dailyLimitPct > 0 && dailyDrawdownPct >= dailyLimitPct * 0.85;
  const dailyPressure = dailyLimitPct > 0 && dailyDrawdownPct >= dailyLimitPct * 0.6;
  const distanceIsKnown = Number.isFinite(Number(primaryDistanceToLimit)) && Number(primaryDistanceToLimit) > 0;
  const riskSignalActive = hasOpenPositions || dailyDrawdownPct > 0 || currentDrawdownPct > 0 || hardEnforcement;
  const lowRiskMargin = riskSignalActive && distanceIsKnown && Number(primaryDistanceToLimit) <= 0.35;
  const openRiskElevated = hasOpenPositions && totalOpenRiskPct > 0 && totalOpenRiskPct >= Math.max(maxRiskPerTradePct * 1.5, 1.25);
  const openRiskPressure = hasOpenPositions && totalOpenRiskPct > 0 && totalOpenRiskPct >= Math.max(maxRiskPerTradePct || 0.5, 0.75);
  const tradeRiskPressure = hasOpenPositions && maxRiskPerTradePct > 0 && maxOpenTradeRiskPct >= maxRiskPerTradePct * 0.8;
  const sampleIsEnough = totalTrades >= DASHBOARD_MIN_SAMPLE_TRADES;
  const performancePressure = sampleIsEnough && (
    Number(panelSecondMetricValue || 0) < 0 &&
    ((Number.isFinite(profitFactor) && profitFactor > 0 && profitFactor < 1) || winRate < 45)
  );
  const elevatedRisk = hardEnforcement || nearDailyLimit || lowRiskMargin || openRiskElevated || currentDrawdownPct >= 5;
  const underPressure = riskState === "warning" || dailyPressure || openRiskPressure || tradeRiskPressure || performancePressure || currentDrawdownPct >= 2;

  const summary = {
    equityText: formatCurrency(model?.account?.equity || 0),
    pnlLabel: panelSecondMetricLabel || "PnL",
    pnlValue: Number(panelSecondMetricValue || 0),
    pnlText: formatSignedDashboardCurrency(panelSecondMetricValue),
    currentDrawdownText: formatRiskValuePct(currentDrawdownPct, 2),
    dailyDrawdownText: formatRiskValuePct(dailyDrawdownPct, 2),
    openRiskText: hasOpenPositions
      ? `${formatRiskValuePct(totalOpenRiskPct, 2)} · ${Number(performanceView?.openPositionsCount || 0)} posiciones`
      : "Sin exposición",
    sampleText: `${totalTrades} trades · WR ${totalTrades > 0 ? formatPercent(winRate / 100) : "—"}`,
    edgeText: Number.isFinite(profitFactor) && profitFactor > 0 ? `PF ${profitFactor.toFixed(2)}` : "PF —",
  };

  let statusTitle = "Trader en control";
  let statusDescription = "Riesgo y rendimiento no muestran una presión dominante.";
  let causeTitle = "Sin presión operativa";
  let causeDescription = "No hay una señal urgente por riesgo, drawdown o exposición.";
  let actionTitle = "Mantén el proceso";
  let actionDescription = "Mantén riesgo actual y sigue registrando.";

  if (!reliableSnapshot) {
    statusTitle = "Cuenta sin sincronizar";
    statusDescription = "La cuenta no tiene un snapshot fiable para evaluar el estado.";
    causeTitle = "Cuenta sin snapshot fiable";
    causeDescription = "Falta una fuente reciente de equity, posiciones o histórico.";
    actionTitle = "Sincroniza la cuenta";
    actionDescription = "Sincroniza cuenta antes de evaluar el estado.";
  } else if (elevatedRisk) {
    statusTitle = hardEnforcement ? "Protección activa" : "Riesgo elevado";
    statusDescription = hardEnforcement
      ? "Hay una restricción activa para contener el riesgo."
      : "Hay una señal interna que exige proteger la cuenta.";
    causeTitle = hardEnforcement ? "Risk Engine limitando exposición" : nearDailyLimit ? "Drawdown diario cerca del límite" : lowRiskMargin ? "Margen de riesgo estrecho" : "Exposición abierta elevada";
    causeDescription = hardEnforcement
      ? "La cuenta tiene restricciones activas por riesgo, drawdown o exposición."
      : "Riesgo, drawdown o distancia a límites requieren atención.";
    actionTitle = hardEnforcement ? "Sigue la restricción activa" : hasOpenPositions ? "Reduce exposición" : "Pausa y revisa";
    actionDescription = hardEnforcement
      ? "Mantén la restricción activa antes de abrir o aumentar exposición."
      : hasOpenPositions
        ? "Reduce exposición antes de abrir nuevos trades."
        : "Revisa límites antes de tomar nuevas decisiones.";
  } else if (!sampleIsEnough) {
    statusTitle = "Sin muestra suficiente";
    statusDescription = "Todavía no hay suficientes trades cerrados para juzgar rendimiento.";
    causeTitle = "Muestra insuficiente";
    causeDescription = `${totalTrades} de ${DASHBOARD_MIN_SAMPLE_TRADES} trades mínimos para una lectura estable.`;
    actionTitle = "Sigue registrando";
    actionDescription = "No saques conclusiones hasta tener más muestra.";
  } else if (underPressure) {
    statusTitle = "Bajo presión";
    statusDescription = "Hay presión moderada por drawdown, riesgo abierto o margen.";
    causeTitle = dailyPressure ? "Drawdown diario cerca del límite" : openRiskPressure ? "Exposición abierta elevada" : performancePressure ? "Rendimiento reciente débil" : "Riesgo moderado activo";
    causeDescription = "La cuenta sigue operativa, pero el margen de maniobra es menor.";
    actionTitle = hasOpenPositions ? "Revisa exposición" : performancePressure ? "Revisa la muestra" : "Opera con cautela";
    actionDescription = hasOpenPositions
      ? "Revisa posiciones abiertas con mayor riesgo."
      : performancePressure
        ? "Revisa la muestra antes de aumentar exposición."
      : "Mantén tamaño controlado y prioriza calidad de ejecución.";
  } else if (!hasOpenPositions) {
    statusTitle = "Sin posiciones abiertas";
    statusDescription = "No hay riesgo vivo ahora mismo; la cuenta está en reposo.";
    causeTitle = "Sin presión operativa";
    causeDescription = "La exposición abierta es cero y no hay restricción activa.";
    actionTitle = "Prepara la sesión";
    actionDescription = "Mantén seguimiento y espera una nueva oportunidad válida.";
  }

  const tone = getDashboardDecisionTone(statusTitle);
  const evidenceDescription = [
    summary.equityText,
    summary.pnlText,
    `DD actual ${summary.currentDrawdownText}`,
    `Daily DD ${summary.dailyDrawdownText}`,
    summary.openRiskText,
    summary.sampleText,
    summary.edgeText,
  ].join(" | ");

  return {
    ...summary,
    statusTitle,
    statusDescription,
    causeTitle,
    causeDescription,
    evidenceTitle: "Datos clave",
    evidenceDescription: "Muestra compacta de capital, riesgo y rendimiento.",
    evidenceHtml: buildDashboardEvidenceHtml(summary),
    actionTitle,
    actionDescription,
    tone,
    signature: JSON.stringify({
      statusTitle,
      causeTitle,
      actionTitle,
      evidenceDescription,
    }),
  };
}

function renderDashboardDecisionLayer(summary) {
  const actionTone = getDashboardActionTone(summary.statusTitle);

  return `
    <section class="dashboard-decision-compact" data-dashboard-decision-layer-shell>
      <header class="dashboard-decision-compact__header">
        <p class="dashboard-decision-compact__eyebrow">LECTURA OPERATIVA</p>
        <h2 class="dashboard-decision-compact__title">Estado actual de la cuenta</h2>
        <p class="dashboard-decision-compact__description">Riesgo, rendimiento y exposición resumidos en una sola lectura.</p>
      </header>

      <div class="dashboard-decision-compact__grid">
        <article class="dashboard-decision-compact__cell" data-role="estado" data-tone="${escapeDashboardHtml(summary.tone)}">
          <span class="dashboard-decision-compact__label">Situación</span>
          <strong class="dashboard-decision-compact__cell-title">${escapeDashboardHtml(summary.statusTitle)}</strong>
          <p>${escapeDashboardHtml(summary.statusDescription)}</p>
        </article>

        <article class="dashboard-decision-compact__cell" data-role="causa" data-tone="neutral">
          <span class="dashboard-decision-compact__label">Motivo</span>
          <strong class="dashboard-decision-compact__cell-title">${escapeDashboardHtml(summary.causeTitle)}</strong>
          <p>${escapeDashboardHtml(summary.causeDescription)}</p>
        </article>

        <article class="dashboard-decision-compact__cell dashboard-decision-compact__cell--evidence" data-role="evidencia" data-tone="neutral">
          <span class="dashboard-decision-compact__label">Datos clave</span>
          ${summary.evidenceHtml}
        </article>

        <article class="dashboard-decision-compact__cell" data-role="accion" data-tone="${escapeDashboardHtml(actionTone)}">
          <span class="dashboard-decision-compact__label">Siguiente paso</span>
          <strong class="dashboard-decision-compact__cell-title">${escapeDashboardHtml(summary.actionTitle)}</strong>
          <p>${escapeDashboardHtml(summary.actionDescription)}</p>
        </article>
      </div>
    </section>
  `;
}

function getOperationalRead({ riskStatus, primaryDistanceToLimit, openPositionsCount }) {
  const normalized = String(riskStatus?.riskStatus || "").toLowerCase();
  if (normalized === "blocked" || normalized === "breach") {
    return {
      summary: "Intervención requerida.",
      detail: "Restricción activa.",
      footer: "Riesgo restringido.",
    };
  }

  if (normalized === "warning") {
    return {
      summary: "Riesgo activo moderado.",
      detail: "Revisa margen y tamaño.",
      footer: "Supervisa la sesión.",
    };
  }

  if (openPositionsCount > 0) {
    return {
      summary: "Dentro de límites operativos.",
      detail: "Exposición controlada.",
      footer: "",
    };
  }

  return {
    summary: "Sin posiciones abiertas.",
    detail: "Sin riesgo activo.",
    footer: "",
  };
}

function getRiskPostureRead({ totalOpenRiskPct, maxOpenTradeRiskPct, maxRiskPerTradePct, openPositionsCount = 0 }) {
  const totalOpenRisk = Number(totalOpenRiskPct || 0);
  const maxTradeRisk = Number(maxOpenTradeRiskPct || 0);
  const policyRisk = Number(maxRiskPerTradePct || 0);

  if (totalOpenRisk <= 0 && maxTradeRisk <= 0) {
    if (openPositionsCount > 0) {
      return {
        summary: "Exposición controlada.",
        detail: "Riesgo residual mínimo.",
        tone: "neutral",
      };
    }
    return {
      summary: "Sin exposición.",
      detail: "Sin posiciones abiertas.",
      tone: "neutral",
    };
  }

  if ((policyRisk > 0 && maxTradeRisk >= policyRisk * 0.8) || totalOpenRisk >= Math.max(policyRisk * 1.5, 1)) {
    return {
      summary: "Riesgo activo elevado.",
      detail: "Exposición alta.",
      tone: "breach",
    };
  }

  return {
    summary: "Exposición controlada.",
    detail: "Riesgo activo moderado.",
    tone: "warning",
  };
}

function getDrawdownValueClass(drawdownPct) {
  const value = Number(drawdownPct || 0);
  if (value > 2) return "metric-negative";
  if (value > 0.5) return "metric-warning";
  return "";
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
      summary: "Restricción activa por el estado de riesgo.",
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
    root.innerHTML = `
      <section class="dashboard-screen dashboard-page-flow">
        ${pageHeaderMarkup({
          eyebrow: "Dashboard",
          title: "Dashboard",
          description: "Conecta o sincroniza una cuenta para evaluar el estado global.",
          className: "calendar-screen__header dashboard-screen__header",
          contentClassName: "calendar-screen__copy",
          eyebrowClassName: "calendar-screen__eyebrow",
          titleClassName: "calendar-screen__title",
          descriptionClassName: "calendar-screen__subtitle",
          actionsClassName: "dashboard-screen__actions",
          actionsHtml: `<button class="btn-primary btn-inline dashboard-screen__add-account" type="button" data-open-connection-wizard="true" data-connection-source="dashboard">Añadir cuenta</button>`,
        })}
        ${renderDashboardDecisionLayer(buildMissingDashboardDecisionSummary())}
      </section>
    `;
    root.__dashboardRendered = true;
    root.__dashboardStructureSignature = "";
    root.__dashboardLiveSignature = "";
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
  const heroXAxisFormatter = createHeroXAxisFormatter(heroRange, heroCurve);
  const heroXValues = heroCurve.map((point, index) => {
    const parsed = parseChartAxisDate(point);
    return parsed ? parsed.getTime() : index;
  });
  const heroVisibleEndDate = heroCurve.length ? (parseChartAxisDate(heroCurve.at(-1)) || new Date()) : new Date();
  const heroFirstPointDate = heroCurve.length ? (parseChartAxisDate(heroCurve[0]) || null) : null;
  const heroVisibleStartDate = (heroRange === "H1" || heroRange === "4H" || heroRange === "YTD")
    ? (heroFirstPointDate || getHeroRangeStartDate(heroRange, heroVisibleEndDate))
    : (heroCurve.length ? (heroFirstPointDate || getHeroRangeStartDate(heroRange, heroVisibleEndDate)) : getHeroRangeStartDate(heroRange, heroVisibleEndDate));
  const heroXMin = heroVisibleStartDate.getTime();
  const heroXMax = heroVisibleEndDate.getTime();
  const heroTickValues = buildHeroTickValues(heroRange, heroCurve, heroVisibleStartDate, heroVisibleEndDate);
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
    ? "5 horas"
    : heroRange === "4H"
      ? "20 horas"
      : heroRange === "1D"
        ? "14 días"
        : heroRange === "1W"
          ? "12 semanas"
          : heroRange === "YTD"
            ? "YTD"
            : "mensual";
  const heroRangeSignedValue = `${heroDelta >= 0 ? "+" : "-"}${heroRangeValueDisplay}`;
  const heroRangeSignedPct = `${heroDeltaPct >= 0 ? "+" : "-"}${heroRangePctDisplay}`;
  const heroSummaryLabel = getHeroRangeSummaryLabel(heroRange);
  const heroSummaryValue = Math.abs(heroDelta) < 0.005 && Math.abs(heroDeltaPct) < 0.005
    ? "Sin cambio"
    : `${heroRangeSignedValue} (${heroRangeSignedPct})`;
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
    openPositionsCount: performanceView.openPositionsCount,
  });
  const postureTone = riskPostureRead.tone || "neutral";
  const operationalMarginTone = ["warning", "breach", "blocked"].includes(riskTone) ? riskTone : "neutral";
  const hasEnforcementSignal = hasActiveEnforcementSignal(riskStatus);
  const hasExposureSignal = Array.isArray(riskExposure.symbolExposure) && riskExposure.symbolExposure.length > 0;
  const hasOpenTradeRisk = Array.isArray(riskExposure.openTradeRisks) && riskExposure.openTradeRisks.length > 0;
  const hasOpenPositions = Number(performanceView.openPositionsCount || 0) > 0;
  const dashboardDecision = buildDashboardDecisionSummary({
    model,
    account,
    authority,
    dashboardPayload,
    performanceView,
    riskStatus,
    riskSummary,
    riskLimits,
    primaryDistanceToLimit,
    hasOpenPositions,
    panelSecondMetricValue,
    panelSecondMetricLabel,
  });
  const dashboardDecisionLayerHtml = renderDashboardDecisionLayer(dashboardDecision);
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
        borderDash: [3, 8],
        borderWidth: 0.8,
        borderAlpha: 0.42,
        formatter: (value) => formatCurrency(value)
      }],
      showXAxis: true,
      showYAxis: true,
      maxYTicks: 5,
      autoSkipXTicks: false,
      xAxisFormatter: heroXAxisFormatter,
      xScaleType: "linear",
      xScaleOffset: false,
      xValues: heroXValues,
      xMin: heroXMin,
      xMax: heroXMax,
      xTickValues: heroTickValues,
      xTickValueFormatter: (value) => formatHeroTimeTick(heroRange, value),
      customLineHover: true,
      hoverTitleFormatter: (value) => formatHeroTooltipTitle(heroRange, value),
      hoverBodyFormatter: (value) => `Equity ${formatCurrency(value)}`,
      tooltip: false,
      yMin: heroMinValue - heroValuePadding,
      yMax: heroMaxValue + heroValuePadding,
      borderWidth: 2.15,
      pointRadius: (context) => (context.dataIndex === heroCurve.length - 1 ? 4 : 0),
      pointHoverRadius: (context) => (context.dataIndex === heroCurve.length - 1 ? 4.6 : 0),
      pointHitRadius: 20,
      pointBorderWidth: 1.25,
      fill: true,
      fillAlphaStart: 0.20,
      fillAlphaEnd: 0.001,
      glowAlpha: 0,
      tension: 0.68,
      animationDisabled: true,
      animationDuration: 0,
      axisColor: axisStandard,
      axisFontSize: 10,
      axisFontWeight: "500",
      yTickPadding: 4,
      xTickPadding: 10,
      maxXTicks: getHeroTickTarget(heroRange),
      showYGrid: true,
      gridAlpha: isDarkTheme ? 0.018 : 0.03,
      gridColor: isDarkTheme ? "rgba(255,255,255,0.035)" : "rgba(15,23,42,0.05)",
      yGridDash: [3, 9],
      yGridWidth: 0.65,
      crosshairAlpha: isDarkTheme ? 0.06 : 0.06,
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
      formatter: (value) => `Equity ${formatCurrency(value)}`,
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
    decision: dashboardDecision.signature,
    symbolExposure: (riskExposure.symbolExposure || []).map((item) => ({
      symbol: item.symbol || "",
      risk: Number(item.risk_pct || 0),
      pnl: Number(item.open_pnl || 0),
      direction: item.direction || "",
    })),
    openTradeRisks: (riskExposure.openTradeRisks || []).map((item) => ({
      symbol: item.symbol || "",
      side: item.side || "",
      risk: Number(item.risk_pct || 0),
      sl: Number(item.stop_loss || 0),
      pnl: Number(item.open_pnl || 0),
    })),
  });
  const liveBindings = {
    dashboardSubtitle,
    heroSub: `${heroSummaryLabel} / ${heroSummaryValue}`,
    equityValue: Number(model.account.equity || 0),
    equityMeta: `<span class="${panelSecondMetricValue >= 0 ? "metric-positive" : "metric-negative"}">${panelSecondMetricValue >= 0 ? "+" : "-"}${totalPnlDisplay} / ${currentReturnPct >= 0 ? "+" : "-"}${totalReturnDisplay} total</span>`,
    pnlValue: Number(panelSecondMetricValue || 0),
    pnlMeta: `Retorno ${formatPercent(currentReturnPct)}`,
    drawdownValue: Number(riskSummary.peakToEquityDrawdownPct || 0),
    drawdownTone: Number(riskSummary.peakToEquityDrawdownPct || 0) > 2 ? "risk" : Number(riskSummary.peakToEquityDrawdownPct || 0) > 0.5 ? "warning" : "neutral",
    drawdownMeta: `Daily DD ${formatRiskValuePct(riskSummary.dailyDrawdownPct, 2)} / Margen ${formatRiskValuePct(primaryDistanceToLimit, 2)}`,
    edgeValue: Number(model?.totals?.profitFactor || 0) > 0 ? Number(model.totals.profitFactor).toFixed(2) : "—",
    edgeMeta: `Profit Factor · ${Number(model?.totals?.totalTrades || 0)} trades`,
    operationalSummary: operationalRead.summary,
    riskSummary: riskPostureRead.summary,
    hasOpenPositions,
    dailyDdValue: Number(riskSummary.dailyDrawdownPct || 0),
    dailyDdMeta: `Pico ${formatRiskCurrency(riskSummary.dailyPeakEquity)}`,
    marginValue: Number(primaryDistanceToLimit || 0),
    marginMeta: `Max ${formatRiskValuePct(riskSummary.distanceToMaxDdLimitPct, 2)} / Diario ${formatRiskValuePct(riskSummary.distanceToDailyDdLimitPct, 2)}`,
    stateValue: riskStateLabel,
    stateMeta: operationalRead.detail,
    operationalFoot: operationalRead.footer || "",
    openRiskValue: Number(riskSummary.totalOpenRiskPct || 0),
    openRiskMeta: formatRiskCurrency(riskSummary.totalOpenRiskAmount),
    tradeRiskValue: Number(riskSummary.maxOpenTradeRiskPct || 0),
    tradeRiskMeta: `Política ${formatRiskValuePct(riskSummary.maxRiskPerTradePct, 2)}`,
    riskFoot: riskPostureRead.detail,
    exposureTableHtml: hasExposureSignal ? renderSymbolExposureTable(riskExposure.symbolExposure) : null,
    openTradeRiskHtml: hasOpenTradeRisk ? renderOpenTradeRiskTable(riskExposure.openTradeRisks) : null,
    decisionLayerHtml: dashboardDecisionLayerHtml,
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
      ${pageHeaderMarkup({
        eyebrow: "Dashboard",
        title: "Dashboard",
        description: dashboardSubtitle,
        className: "calendar-screen__header dashboard-screen__header",
        contentClassName: "calendar-screen__copy",
        eyebrowClassName: "calendar-screen__eyebrow",
        titleClassName: "calendar-screen__title",
        descriptionClassName: "calendar-screen__subtitle",
        descriptionAttributes: { "data-dashboard-subtitle": true },
        actionsClassName: "dashboard-screen__actions",
        actionsHtml: `<button class="btn-primary btn-inline dashboard-screen__add-account" type="button" data-open-connection-wizard="true" data-connection-source="dashboard">Añadir cuenta</button>`,
      })}

      ${dashboardDecisionLayerHtml}

      <section class="tl-kpi-row dashboard-summary-kpis dashboard-kpi-row">
        ${renderDashboardKpiCard({
          key: "equity",
          label: "Equity",
          value: formatCurrency(model.account.equity),
          meta: `<span class="${panelSecondMetricValue >= 0 ? "metric-positive" : "metric-negative"}">${panelSecondMetricValue >= 0 ? "+" : "-"}${totalPnlDisplay} / ${currentReturnPct >= 0 ? "+" : "-"}${totalReturnDisplay} total</span>`,
          tone: "info",
          badge: "Actual",
          trendTone: "neutral",
        })}
        ${renderDashboardKpiCard({
          key: "pnl",
          label: panelSecondMetricLabel,
          value: `${panelSecondMetricValue >= 0 ? "+" : "-"}${formatCurrency(Math.abs(panelSecondMetricValue))}`,
          valueClass: panelSecondMetricValue >= 0 ? "metric-positive" : "metric-negative",
          meta: `Retorno ${formatPercent(currentReturnPct)}`,
          tone: getDashboardKpiTone(panelSecondMetricValue),
          badge: "PnL",
          trendTone: "neutral",
        })}
        ${renderDashboardKpiCard({
          key: "dd",
          label: "Drawdown actual",
          value: formatRiskValuePct(riskSummary.peakToEquityDrawdownPct, 2),
          valueClass: getDrawdownValueClass(riskSummary.peakToEquityDrawdownPct),
          meta: `Daily DD ${formatRiskValuePct(riskSummary.dailyDrawdownPct, 2)} / Margen ${formatRiskValuePct(primaryDistanceToLimit, 2)}`,
          tone: getDashboardDrawdownKpiTone(riskSummary.peakToEquityDrawdownPct),
          badge: "Riesgo",
          trendTone: "neutral",
        })}
        ${renderDashboardKpiCard({
          key: "edge",
          label: "Edge",
          value: Number(model?.totals?.profitFactor || 0) > 0 ? Number(model.totals.profitFactor).toFixed(2) : "—",
          meta: `Profit Factor · ${Number(model?.totals?.totalTrades || 0)} trades`,
          cardClass: "dashboard-kpi-support",
          tone: "neutral",
          badge: "PF",
          trendTone: "neutral",
        })}
      </section>

      <section class="dashboard-layout">
        <article class="kmfx-ui-chart-card dashboard-chart-card dashboard-primary-card">
          <header class="kmfx-ui-chart-card__header dashboard-chart-card__header">
            <div class="dashboard-chart-card__copy">
              <h2 class="kmfx-ui-chart-card__title dashboard-chart-card__title">Equity y balance</h2>
              <p class="kmfx-ui-chart-card__description dashboard-chart-card__description" data-dashboard-hero-sub>${heroSummaryLabel} / ${heroSummaryValue}</p>
            </div>
            <div class="widget-segmented dashboard-chart-range" role="tablist" aria-label="Rango del gráfico">
              ${["H1", "4H", "1D", "1W", "1M", "YTD"].map((range) => `
                <button class="widget-segmented-btn dashboard-chart-range__button ${heroRange === range ? "active" : ""}" type="button" data-hero-range="${range}">${range}</button>
              `).join("")}
            </div>
          </header>

          <div class="kmfx-ui-chart-card__content dashboard-chart-card__content dashboard-primary-card__body">
            <div class="dashboard-primary-card__chart dashboard-chart-card__chart">
              ${chartCanvas("dashboard-hero-equity-chart", 288, "kmfx-chart-shell--hero")}
            </div>
          </div>
        </article>

        <div class="dashboard-secondary-stack dashboard-state-grid">
          <article class="kmfx-ui-card dashboard-state-card dashboard-secondary-card" data-dashboard-state-card="operational">
            <header class="dashboard-state-card__header dashboard-secondary-card__head">
              <div>
                <h2 class="dashboard-state-card__title">Estado operativo</h2>
                <p class="dashboard-state-card__description" data-dashboard-operational-summary>${operationalRead.summary}</p>
              </div>
              ${hasOpenPositions ? renderRiskStatusBadge(riskStatus.riskStatus, riskStatus.severity) : ""}
            </header>

            ${hasOpenPositions ? `
              <div class="dashboard-state-card__metrics dashboard-secondary-card__metrics">
                ${renderDashboardInlineRiskCard({
                  label: "DD diario",
                  value: formatRiskValuePct(riskSummary.dailyDrawdownPct, 2),
                  meta: `Pico ${formatRiskCurrency(riskSummary.dailyPeakEquity)}`,
                  tone: riskTone,
                  valueAttr: 'data-dashboard-operational-dailydd-value',
                  metaAttr: 'data-dashboard-operational-dailydd-meta',
                })}
                ${renderDashboardInlineRiskCard({
                  label: "Margen",
                  value: formatRiskValuePct(primaryDistanceToLimit, 2),
                  meta: `Max ${formatRiskValuePct(riskSummary.distanceToMaxDdLimitPct, 2)} / Diario ${formatRiskValuePct(riskSummary.distanceToDailyDdLimitPct, 2)}`,
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
                <div class="dashboard-state-card__foot dashboard-secondary-card__foot">
                  <span data-dashboard-operational-foot>${operationalRead.footer}</span>
                </div>
              ` : ""}
            ` : `
              <div class="dashboard-state-card__metrics dashboard-secondary-card__metrics dashboard-secondary-card__metrics--two">
                ${renderDashboardInlineRiskCard({
                  label: "Estado",
                  value: "Sin posiciones abiertas",
                  meta: "Sin riesgo activo.",
                  tone: "neutral",
                })}
              </div>
            `}
          </article>

          <article class="kmfx-ui-card dashboard-state-card dashboard-secondary-card" data-dashboard-state-card="risk">
            <header class="dashboard-state-card__header dashboard-secondary-card__head">
              <div>
                <h2 class="dashboard-state-card__title">Postura de riesgo</h2>
                <p class="dashboard-state-card__description" data-dashboard-risk-summary>${riskPostureRead.summary}</p>
              </div>
            </header>
            ${hasOpenPositions ? `
              <div class="dashboard-state-card__metrics dashboard-secondary-card__metrics dashboard-secondary-card__metrics--two">
                ${renderDashboardInlineRiskCard({
                  label: "Riesgo abierto",
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
              <div class="dashboard-state-card__foot dashboard-secondary-card__foot">
                <span data-dashboard-risk-foot>${riskPostureRead.detail}</span>
              </div>
            ` : `
              <div class="dashboard-state-card__metrics dashboard-secondary-card__metrics dashboard-secondary-card__metrics--two">
                ${renderDashboardInlineRiskCard({
                  label: "Exposición",
                  value: "Sin exposición",
                  meta: "Sin posiciones abiertas.",
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
                <div class="calendar-panel-sub">Lectura agregada por símbolo y dirección.</div>
              </div>
            </div>
            <div data-dashboard-exposure-table>${renderSymbolExposureTable(riskExposure.symbolExposure)}</div>
          </article>
        </section>
      ` : ""}

      ${hasEnforcementSignal ? `
        ${renderDashboardEnforcementCard(riskStatus)}
      ` : ""}

      ${hasOpenTradeRisk ? `
        <section class="dashboard-section-stack">
          <article class="tl-section-card dashboard-section-card">
            <div class="calendar-panel-head">
              <div>
                <div class="calendar-panel-title">Riesgo por posición</div>
                <div class="calendar-panel-sub">Detalle de trades abiertos con stop, riesgo y P&amp;L.</div>
              </div>
            </div>
            <div data-dashboard-open-trade-risk-table>${renderOpenTradeRiskTable(riskExposure.openTradeRisks)}</div>
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
