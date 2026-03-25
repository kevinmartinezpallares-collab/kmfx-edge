import { formatCompact, formatCurrency, formatPercent, selectCurrentModel } from "./utils.js";
import { barChartSpec, chartCanvas, lineAreaSpec, mountCharts, radarSpec } from "./chart-system.js";
import { computeRiskAlerts, riskAlertsMarkup } from "./risk-alerts.js";
import { badgeMarkup } from "./status-badges.js";

function clampPercent(value) {
  return Math.max(0, Math.min(100, value));
}

function riskDrivers(model) {
  const experience = clampPercent((model.totals.totalTrades / 40) * 100);
  const riskMgmt = clampPercent(100 - model.totals.drawdown.maxPct * 8);
  const consistency = clampPercent((model.weekdays.filter((day) => day.pnl > 0).length / 5) * 100);
  const rr = clampPercent((model.totals.rr / 3) * 100);
  const riskAdjusted = clampPercent((Math.max(model.totals.ratios.sharpe, 0) / 2.5) * 100);
  const capital = clampPercent((model.account.equity / Math.max(model.account.balance, 1)) * 100);
  return [
    { label: "Experiencia", value: experience, tone: "blue", display: `${model.totals.totalTrades} trades` },
    { label: "Gest. Riesgo", value: riskMgmt, tone: "green", display: formatPercent(100 - model.totals.drawdown.maxPct) },
    { label: "Consistencia", value: consistency, tone: "violet", display: `${model.weekdays.filter((day) => day.pnl > 0).length}/5 días` },
    { label: "R:R", value: rr, tone: "blue", display: model.totals.rr.toFixed(2) },
    { label: "Risk-Adjusted", value: riskAdjusted, tone: "violet", display: model.totals.ratios.sharpe.toFixed(2) },
    { label: "Capital", value: capital, tone: "green", display: formatPercent(((model.account.equity - model.account.balance) / Math.max(model.account.balance, 1)) * 100) }
  ];
}

function monthlyMatrixRows(model) {
  if (model.monthlyMatrix?.length) return model.monthlyMatrix;
  return [];
}

function buildPerformanceProfile(model) {
  const ratios = model.totals.ratios || {};
  const profitability = clampPercent(Math.max(model.totals.profitFactor, 0) / 3 * 100);
  const consistency = clampPercent(model.totals.winRate);
  const riskManagement = clampPercent(100 - (model.totals.drawdown.maxPct || 0) * 8);
  const discipline = clampPercent((model.weekdays.filter((day) => day.pnl > 0).length / Math.max(model.weekdays.length, 1)) * 100);
  const efficiency = clampPercent((Math.max(ratios.sharpe || 0, 0) / 2.5) * 100);
  const riskReward = clampPercent((Math.max(model.totals.rr || 0, 0) / 3) * 100);

  return [
    { label: "Profitability", value: profitability },
    { label: "Consistency", value: consistency },
    { label: "Risk Management", value: riskManagement },
    { label: "Discipline", value: discipline },
    { label: "Efficiency", value: efficiency },
    { label: "Risk/Reward", value: riskReward }
  ];
}

function sumPnl(trades = []) {
  return trades.reduce((sum, trade) => sum + (trade.pnl || 0), 0);
}

function slicePeriods(items = [], size) {
  const recent = items.slice(-(size * 2));
  return {
    previous: recent.slice(0, size),
    current: recent.slice(size)
  };
}

function calcWinRate(trades = []) {
  if (!trades.length) return 0;
  return (trades.filter((trade) => trade.pnl > 0).length / trades.length) * 100;
}

function calcConsistency(days = []) {
  if (!days.length) return 0;
  return (days.filter((day) => day.pnl > 0).length / days.length) * 100;
}

function calcDrawdownPct(trades = [], startBalance = 100000) {
  let equity = startBalance;
  let peak = startBalance;
  let maxPct = 0;
  trades.forEach((trade) => {
    equity += trade.pnl || 0;
    peak = Math.max(peak, equity);
    const ddPct = peak ? ((peak - equity) / peak) * 100 : 0;
    maxPct = Math.max(maxPct, ddPct);
  });
  return maxPct;
}

function buildTrendMetric(label, current, previous, { higherIsBetter = true, formatter = (value) => `${value}` } = {}) {
  const delta = current - previous;
  const improving = higherIsBetter ? delta >= 0 : delta <= 0;
  return {
    label,
    value: formatter(current),
    deltaText: `${improving ? "↑" : "↓"} ${formatter(Math.abs(delta)).replace("-", "")}`,
    tone: improving ? "positive" : "negative"
  };
}

function computeTrendComparisons(model) {
  const tradePeriods = slicePeriods(model.trades || [], 10);
  const dayPeriods = slicePeriods(model.dayStats || [], 5);

  return [
    buildTrendMetric("Win Rate", calcWinRate(tradePeriods.current), calcWinRate(tradePeriods.previous), {
      formatter: (value) => `${Math.round(value)}%`
    }),
    buildTrendMetric("PnL", sumPnl(tradePeriods.current), sumPnl(tradePeriods.previous), {
      formatter: (value) => formatCompact(value)
    }),
    buildTrendMetric("Drawdown", calcDrawdownPct(tradePeriods.current, model.account?.balance || 100000), calcDrawdownPct(tradePeriods.previous, model.account?.balance || 100000), {
      higherIsBetter: false,
      formatter: (value) => `${Number(value).toFixed(1)}%`
    }),
    buildTrendMetric("Consistency", calcConsistency(dayPeriods.current), calcConsistency(dayPeriods.previous), {
      formatter: (value) => `${Math.round(value)}%`
    })
  ];
}

function analyticsRiskContext(model) {
  const drawdown = model.totals.drawdown.maxPct || 0;
  const consistency = (model.weekdays.filter((day) => day.pnl > 0).length / Math.max(model.weekdays.length, 1)) * 100;
  const winRate = model.totals.winRate || 0;

  const drawdownMeta = drawdown >= 8
    ? { label: "Risk pressure", tone: "error" }
    : drawdown >= 5
      ? { label: "Risk pressure", tone: "warn" }
      : { label: "Risk pressure", tone: "ok" };

  const stabilityMeta = winRate < 45 || consistency < 45
    ? { label: "Stability", tone: "error" }
    : winRate < 52 || consistency < 60
      ? { label: "Stability", tone: "warn" }
      : { label: "Stability", tone: "ok" };

  return { drawdownMeta, stabilityMeta };
}

function sessionExecutionMeta(session) {
  if (session.pnl > 0 && session.winRate >= 55) return { label: "Execution quality", tone: "ok" };
  if (session.pnl < 0 || session.winRate < 45) return { label: "Execution quality", tone: "error" };
  return { label: "Execution quality", tone: "warn" };
}

function computeDecisionEngine(model) {
  const bestSession = [...model.sessions].sort((a, b) => b.pnl - a.pnl)[0] || { key: "London", pnl: 0, winRate: 0 };
  const worstSession = [...model.sessions].sort((a, b) => a.pnl - b.pnl)[0] || bestSession;
  const bestHour = [...model.hours].sort((a, b) => b.pnl - a.pnl)[0] || { hour: 0, pnl: 0 };
  const worstHour = [...model.hours].sort((a, b) => a.pnl - b.pnl)[0] || bestHour;
  const winRate = model.totals.winRate;
  const rr = model.totals.rr;
  const drawdown = model.totals.drawdown.maxPct;
  const consistency = (model.weekdays.filter((day) => day.pnl > 0).length / Math.max(model.weekdays.length, 1)) * 100;

  const primaryCandidates = [
    {
      weight: drawdown >= 8 ? drawdown * 10 : 0,
      text: `Baja riesgo: el drawdown máximo ya está en ${formatPercent(drawdown)}.`
    },
    {
      weight: winRate < 45 && rr >= 1.7 ? (50 - winRate) * 3 : 0,
      text: `Mejora ejecución: ${formatPercent(winRate)} de WR con R:R ${rr.toFixed(2)} indica entradas flojas.`
    },
    {
      weight: consistency < 50 ? (60 - consistency) * 2 : 0,
      text: `Sube consistencia: solo ${Math.round(consistency)}% de los días terminan en verde.`
    },
    {
      weight: worstHour.pnl < 0 ? Math.abs(worstHour.pnl) / 20 : 0,
      text: `Filtra las ${String(worstHour.hour).padStart(2, "0")}:00: es la hora que más resta P&L.`
    }
  ].sort((a, b) => b.weight - a.weight);

  const secondaryCandidates = [
    {
      weight: bestSession.pnl > 0 ? bestSession.pnl / 25 : 0,
      text: `Refuerza ${bestSession.key}: concentra tu mejor edge con WR ${formatPercent(bestSession.winRate)}.`
    },
    {
      weight: rr < 1.5 ? (1.5 - rr) * 30 : 0,
      text: `Empuja el R:R por encima de 1.5 para ampliar margen operativo.`
    },
    {
      weight: bestHour.pnl > 0 ? bestHour.pnl / 25 : 0,
      text: `Prioriza la franja de las ${String(bestHour.hour).padStart(2, "0")}:00: ya tiene tracción positiva.`
    }
  ].sort((a, b) => b.weight - a.weight);

  const strengthCandidates = [
    {
      weight: bestSession.pnl > 0 ? bestSession.pnl / 25 : 0,
      text: `${bestSession.key} es tu fortaleza actual: ${formatCurrency(bestSession.pnl)} con buen WR.`
    },
    {
      weight: rr >= 1.8 ? rr * 20 : 0,
      text: `Tu R:R de ${rr.toFixed(2)} te da ventaja incluso con menor tasa de acierto.`
    },
    {
      weight: drawdown <= 5 ? (6 - drawdown) * 10 : 0,
      text: `El drawdown sigue contenido en ${formatPercent(drawdown)} y protege el capital.`
    }
  ].sort((a, b) => b.weight - a.weight);

  return {
    primary: primaryCandidates[0]?.text || "Mantén el control de riesgo y evita ampliar exposición sin ventaja clara.",
    secondary: secondaryCandidates[0]?.text || "Ajusta sesión y hora para concentrar mejores ejecuciones.",
    strength: strengthCandidates[0]?.text || "La estructura actual mantiene una base operativa estable."
  };
}

function polar(cx, cy, r, deg) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

function arcPath(cx, cy, r, startDeg, endDeg) {
  const [sx, sy] = polar(cx, cy, r, startDeg);
  const [ex, ey] = polar(cx, cy, r, endDeg);
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${sx} ${sy} A ${r} ${r} 0 ${largeArc} 1 ${ex} ${ey}`;
}

function renderArcScoreWidget({ key, score, label, subtitle, segments, compact = false }) {
  const cx = 120;
  const cy = 124;
  const radius = compact ? 86 : 98;
  const strokeWidth = compact ? 20 : 22;
  const gapDeg = compact ? 7 : 4;
  const totalDeg = 180;
  const total = segments.reduce((sum, seg) => sum + seg.value, 0) || 1;
  const usableDeg = totalDeg - gapDeg * segments.length;
  let currentDeg = -90;

  const paths = segments.map((segment, index) => {
    const sweep = Math.max((segment.value / total) * usableDeg, 12);
    const start = currentDeg + gapDeg / 2;
    const end = start + sweep;
    const arcLen = (sweep / 360) * (2 * Math.PI * radius);
    currentDeg = end;
    return `
      <path
        class="kmfx-arc-path kmfx-arc-path--${segment.tone}"
        data-arc-group="${key}"
        data-arc-index="${index}"
        d="${arcPath(cx, cy, radius, start, end)}"
        stroke-dasharray="${arcLen}"
        stroke-dashoffset="${arcLen}"
        style="animation-delay:${(0.15 + index * 0.18).toFixed(2)}s"
      ></path>
    `;
  }).join("");

  return `
    <div class="kmfx-arc-widget ${compact ? "kmfx-arc-widget--compact" : ""}" data-arc-widget="${key}">
      <svg viewBox="0 0 240 150" class="kmfx-arc-svg" aria-hidden="true">
        <path d="${arcPath(cx, cy, radius, -90, 90)}" class="kmfx-arc-track"></path>
        ${paths}
        <text x="120" y="${compact ? "98" : "96"}" text-anchor="middle" class="kmfx-arc-total">${Math.round(score)}</text>
        <text x="120" y="${compact ? "114" : "112"}" text-anchor="middle" class="kmfx-arc-subtitle">${subtitle}</text>
      </svg>
      ${compact ? "" : `
        <div class="kmfx-arc-caption">
          <strong>${label}</strong>
        </div>
      `}
    </div>
  `;
}

function renderDailyPerformanceBreakdown(days, summary = null) {
  const maxAbs = Math.max(...days.map((day) => Math.abs(day.pnl)), 1);
  const rows = days.map((day) => {
    const width = Math.max(10, (Math.abs(day.pnl) / maxAbs) * 100);
    const tone = day.pnl > 0 ? "positive" : day.pnl < 0 ? "negative" : "neutral";
    return `
      <div class="analytics-daily-breakdown-row analytics-daily-breakdown-row--${tone}">
        <div class="analytics-daily-breakdown-day">
          <strong>${day.label}</strong>
          <span>${day.trades} trades</span>
        </div>
        <div class="analytics-daily-breakdown-rail">
          <div class="analytics-daily-breakdown-track">
            <div class="analytics-daily-breakdown-fill analytics-daily-breakdown-fill--${tone}" style="width:${width}%"></div>
          </div>
        </div>
        <div class="analytics-daily-breakdown-meta">
          <strong class="${day.pnl >= 0 ? "metric-positive" : day.pnl < 0 ? "metric-negative" : ""}">${formatCurrency(day.pnl)}</strong>
          <span>${day.pnl > 0 ? "Sesión verde" : day.pnl < 0 ? "Sesión roja" : "Break-even"}</span>
        </div>
      </div>
    `;
  }).join("");

  return `
    ${summary ? `
      <div class="analytics-daily-summary-row">
        <div class="analytics-daily-summary-item">
          <span>Winning days</span>
          <strong>${summary.winningDays}</strong>
        </div>
        <div class="analytics-daily-summary-item">
          <span>Losing days</span>
          <strong>${summary.losingDays}</strong>
        </div>
        <div class="analytics-daily-summary-item">
          <span>Break-even</span>
          <strong>${summary.breakEven}</strong>
        </div>
      </div>
    ` : ""}
    <div class="analytics-daily-breakdown-list">
      ${rows}
    </div>
  `;
}

function buildHourlyBars(rows, mode = "pnl") {
  const width = 640;
  const height = 180;
  const padTop = 14;
  const padBottom = 10;
  const slots = rows.length || 24;
  const gap = width / slots;
  const barWidth = Math.max(6, Math.floor(gap * 0.34));
  const values = rows.map((row) => mode === "pnl" ? row.pnl : row.trades);
  const maxAbs = Math.max(...values.map((value) => Math.abs(value)), 1);
  const hasNeg = mode === "pnl" && values.some((value) => value < 0);
  const zeroY = hasNeg ? Math.round(height / 2) : height - padBottom;
  const positiveRange = zeroY - padTop;
  const negativeRange = hasNeg ? height - padBottom - zeroY : 0;

  const bars = rows.map((row, index) => {
    const value = mode === "pnl" ? row.pnl : row.trades;
    const cx = gap * index + gap / 2;
    const isPos = value >= 0;
    const rangeBase = isPos ? positiveRange : Math.max(negativeRange, 24);
    const barH = Math.max(3, (Math.abs(value) / maxAbs) * rangeBase);
    const barY = isPos ? zeroY - barH : zeroY;
    return {
      ...row,
      value,
      x: cx - barWidth / 2,
      y: barY,
      width: barWidth,
      height: barH,
      rx: Math.min(8, barWidth / 2.2)
    };
  });

  return { width, height, zeroY, bars };
}

function attachArcInteractions(root) {
  root.querySelectorAll("[data-arc-widget]").forEach((widget) => {
    const paths = [...widget.querySelectorAll(".kmfx-arc-path")];
    paths.forEach((path) => {
      path.addEventListener("mouseenter", () => {
        paths.forEach((item) => {
          if (item !== path) item.style.opacity = "0.25";
        });
        path.style.strokeWidth = "28";
        path.style.filter = "drop-shadow(0 0 10px currentColor)";
      });
      path.addEventListener("mouseleave", () => {
        paths.forEach((item) => {
          item.style.opacity = "";
          item.style.strokeWidth = "";
          item.style.filter = "";
        });
      });
    });
  });
}

export function renderAnalytics(root, state) {
  const model = selectCurrentModel(state);
  const account = state.accounts?.find?.((item) => item.id === state.ui.currentAccountId) || state.accounts?.[0];
  if (!model) {
    root.innerHTML = "";
    return;
  }

  const weekdayWorkdays = model.weekdays.filter((day) => ["Lun", "Mar", "Mié", "Jue", "Vie"].includes(day.label));
  const bestHour = [...model.hours].sort((a, b) => b.pnl - a.pnl)[0] || { hour: 0, pnl: 0, trades: 0 };
  const worstHour = [...model.hours].sort((a, b) => a.pnl - b.pnl)[0] || { hour: 0, pnl: 0, trades: 0 };
  const activeHour = [...model.hours].sort((a, b) => b.trades - a.trades)[0] || { hour: 0, pnl: 0, trades: 0 };
  const drivers = riskDrivers(model);
  const scoreInterpretation = model.totals.riskScore >= 80
    ? "Riesgo estable y ejecución sólida."
    : model.totals.riskScore >= 65
      ? "Perfil saludable con margen de mejora."
      : "Conviene reforzar control y consistencia.";
  const decisionEngine = computeDecisionEngine(model);
  const hourlyRows = model.hours.filter((hour) => hour.trades);
  const monthlyRows = monthlyMatrixRows(model);
  const winningTrades = model.trades.filter((trade) => trade.pnl > 0);
  const losingTrades = model.trades.filter((trade) => trade.pnl < 0);
  const breakEvenTrades = model.trades.filter((trade) => trade.pnl === 0);
  const winningDays = model.weekdays.filter((day) => day.pnl > 0).length;
  const losingDays = model.weekdays.filter((day) => day.pnl < 0).length;
  const averageWinningTrade = winningTrades.length
    ? winningTrades.reduce((sum, trade) => sum + trade.pnl, 0) / winningTrades.length
    : 0;
  const averageLosingTrade = losingTrades.length
    ? Math.abs(losingTrades.reduce((sum, trade) => sum + trade.pnl, 0) / losingTrades.length)
    : 0;
  const performanceProfile = buildPerformanceProfile(model);
  const riskAlerts = computeRiskAlerts(model, account);
  const trendComparisons = computeTrendComparisons(model);
  const contextTags = analyticsRiskContext(model);
  const detailedMetrics = [
    {
      tone: "blue",
      label: "Best Month",
      value: model.totals.bestMonth ? formatCurrency(model.totals.bestMonth.pnl) : "—",
      note: model.totals.bestMonth?.label || "Sin referencia mensual"
    },
    {
      tone: "red",
      label: "Worst Month",
      value: model.totals.worstMonth ? formatCurrency(model.totals.worstMonth.pnl) : "—",
      note: model.totals.worstMonth?.label || "Sin referencia mensual"
    },
    {
      tone: "red",
      label: "Total P&L",
      value: formatCurrency(model.totals.pnl),
      note: "P&L neto acumulado"
    },
    {
      tone: "green",
      label: "Total Number of Trades",
      value: `${model.totals.totalTrades}`,
      note: "Operaciones cerradas"
    },
    {
      tone: "green",
      label: "Win Rate",
      value: formatPercent(model.totals.winRate),
      note: "Porcentaje de aciertos"
    },
    {
      tone: "red",
      label: "Expectancy",
      value: formatCurrency(model.totals.expectancy),
      note: "Resultado esperado por trade"
    },
    {
      tone: "red",
      label: "Total Commissions",
      value: formatCurrency(-model.totals.commissions),
      note: "Coste operativo estimado"
    },
    {
      tone: "green",
      label: "Profit Factor",
      value: model.totals.profitFactor.toFixed(2),
      note: "Ratio entre beneficios y pérdidas"
    },
    {
      tone: "green",
      label: "Max Drawdown",
      value: formatCurrency(-model.totals.drawdown.maxAmount),
      note: "Drawdown máximo"
    },
    {
      tone: "green",
      label: "Current Drawdown",
      value: formatCurrency(-model.totals.drawdown.currentAmount),
      note: "Retroceso actual desde pico"
    },
    {
      tone: "green",
      label: "Risk Reward Ratio",
      value: model.totals.rr.toFixed(2),
      note: "Media beneficio / pérdida"
    }
  ];

  const chartSpecs = [
    radarSpec("analytics-overview-performance-radar", performanceProfile, {
      tone: "blue",
      minimalTooltip: true,
      fillAlpha: 0.08,
      borderWidth: 1.6,
      pointRadius: 2.2,
      pointHoverRadius: 2.8,
      formatter: (value) => `${Math.round(value)}%`
    }),
    radarSpec("analytics-performance-radar", performanceProfile, {
      tone: "blue",
      minimalTooltip: true,
      fillAlpha: 0.08,
      borderWidth: 1.6,
      pointRadius: 2.2,
      pointHoverRadius: 2.8,
      formatter: (value) => `${Math.round(value)}%`
    }),
    barChartSpec("analytics-hourly-pnl", hourlyRows.map((hour) => ({ label: `${String(hour.hour).padStart(2, "0")}:00`, value: hour.pnl })), {
      positiveNegative: true,
      referencePillBars: true,
      maxBarThickness: 32,
      barThickness: 28,
      categoryPercentage: 0.5,
      barPercentage: 0.7,
      xOffset: true,
      xTickPadding: 6,
      yTickPadding: 6,
      layoutPaddingLeft: 0,
      layoutPaddingRight: 0,
      trackAlpha: 0.08,
      trackActiveAlpha: 0.11,
      trackMinWidth: 28,
      trackMaxWidth: 28,
      trackTopInset: 10,
      trackBottomInset: 4,
      minimalTooltip: true,
      formatter: (value) => formatCurrency(value),
      axisFormatter: (value) => formatCompact(value)
    }),
    barChartSpec("analytics-overview-hourly-pnl", hourlyRows.map((hour) => ({ label: `${String(hour.hour).padStart(2, "0")}:00`, value: hour.pnl })), {
      positiveNegative: true,
      referencePillBars: true,
      maxBarThickness: 32,
      barThickness: 28,
      categoryPercentage: 0.5,
      barPercentage: 0.7,
      xOffset: true,
      xTickPadding: 6,
      yTickPadding: 6,
      layoutPaddingLeft: 0,
      layoutPaddingRight: 0,
      trackAlpha: 0.08,
      trackActiveAlpha: 0.11,
      trackMinWidth: 28,
      trackMaxWidth: 28,
      trackTopInset: 10,
      trackBottomInset: 4,
      minimalTooltip: true,
      formatter: (value) => formatCurrency(value),
      axisFormatter: (value) => formatCompact(value)
    }),
    barChartSpec("analytics-hourly-trades", hourlyRows.map((hour) => ({ label: `${String(hour.hour).padStart(2, "0")}:00`, value: hour.trades })), {
      tone: "blue",
      referencePillBars: true,
      maxBarThickness: 32,
      barThickness: 28,
      categoryPercentage: 0.5,
      barPercentage: 0.7,
      xOffset: true,
      xTickPadding: 6,
      yTickPadding: 6,
      layoutPaddingLeft: 0,
      layoutPaddingRight: 0,
      trackAlpha: 0.08,
      trackActiveAlpha: 0.11,
      trackMinWidth: 28,
      trackMaxWidth: 28,
      trackTopInset: 10,
      trackBottomInset: 4,
      minimalTooltip: true,
      formatter: (value) => `${value} trades`
    }),
    barChartSpec("analytics-overview-hourly-trades", hourlyRows.map((hour) => ({ label: `${String(hour.hour).padStart(2, "0")}:00`, value: hour.trades })), {
      tone: "blue",
      referencePillBars: true,
      maxBarThickness: 32,
      barThickness: 28,
      categoryPercentage: 0.5,
      barPercentage: 0.7,
      xOffset: true,
      xTickPadding: 6,
      yTickPadding: 6,
      layoutPaddingLeft: 0,
      layoutPaddingRight: 0,
      trackAlpha: 0.08,
      trackActiveAlpha: 0.11,
      trackMinWidth: 28,
      trackMaxWidth: 28,
      trackTopInset: 10,
      trackBottomInset: 4,
      minimalTooltip: true,
      formatter: (value) => `${value} trades`
    }),
    lineAreaSpec("analytics-overview-drawdown-curve", model.drawdownCurve, {
      tone: "red",
      borderWidth: 2.2,
      pointHoverRadius: 3,
      minimalTooltip: true,
      formatter: (value) => formatPercent(value),
      axisFormatter: (value) => `${Number(value).toFixed(1)}%`,
      fillAlphaStart: 0.12,
      fillAlphaEnd: 0.015,
      glowAlpha: 0.1
    }),
    lineAreaSpec("analytics-drawdown-curve", model.drawdownCurve, {
      tone: "red",
      borderWidth: 2.2,
      pointHoverRadius: 3,
      minimalTooltip: true,
      formatter: (value) => formatPercent(value),
      axisFormatter: (value) => `${Number(value).toFixed(1)}%`,
      fillAlphaStart: 0.12,
      fillAlphaEnd: 0.015,
      glowAlpha: 0.1
    }),
    barChartSpec("analytics-overview-profit-distribution", model.profitDistribution.map((bin) => ({ label: bin.label, value: bin.count })), {
      tone: "blue",
      maxBarThickness: 18,
      barThickness: 12,
      solidBars: true,
      gridAlpha: 0.04,
      categoryPercentage: 0.9,
      barPercentage: 0.94,
      xOffset: true,
      xTickPadding: 6,
      yTickPadding: 6,
      layoutPaddingLeft: 0,
      layoutPaddingRight: 0,
      trackAlpha: 0.13,
      minimalTooltip: true,
      formatter: (value) => `${value} trades`
    }),
    barChartSpec("analytics-profit-distribution", model.profitDistribution.map((bin) => ({ label: bin.label, value: bin.count })), {
      tone: "blue",
      maxBarThickness: 18,
      barThickness: 12,
      solidBars: true,
      gridAlpha: 0.04,
      categoryPercentage: 0.9,
      barPercentage: 0.94,
      xOffset: true,
      xTickPadding: 6,
      yTickPadding: 6,
      layoutPaddingLeft: 0,
      layoutPaddingRight: 0,
      trackAlpha: 0.13,
      minimalTooltip: true,
      formatter: (value) => `${value} trades`
    })
  ];
  const hourlyPnlBars = buildHourlyBars(hourlyRows, "pnl");
  const hourlyTradeBars = buildHourlyBars(hourlyRows, "trades");

  root.innerHTML = `
    <section class="analytics-panel ${state.ui.analyticsTab === "summary" ? "active" : ""}" data-tab="summary">
      <div class="analytics-bento-grid">
        <article class="tl-section-card analytics-bento-card analytics-bento-card--full">
          <div class="tl-section-header">
            <div>
              <div class="tl-section-title">Trading Insights</div>
              <div class="row-sub">Lectura operativa directa de aciertos, pérdidas y consistencia de ejecución.</div>
            </div>
          </div>
          ${riskAlertsMarkup(riskAlerts, 3)}
          <div class="analytics-trend-strip">
            ${trendComparisons.map((item) => `
              <div class="analytics-trend-chip analytics-trend-chip--${item.tone}">
                <span>${item.label}</span>
                <strong>${item.value}</strong>
                <small>${item.deltaText}</small>
              </div>
            `).join("")}
          </div>
          <div class="analytics-top-metrics-grid analytics-top-metrics-grid--seven">
            <article class="analytics-top-metric analytics-top-metric--green"><div class="analytics-top-metric-label">Winning Trades</div><div class="analytics-top-metric-value">${winningTrades.length}</div></article>
            <article class="analytics-top-metric analytics-top-metric--red"><div class="analytics-top-metric-label">Losing Trades</div><div class="analytics-top-metric-value">${losingTrades.length}</div></article>
            <article class="analytics-top-metric analytics-top-metric--green"><div class="analytics-top-metric-label">Average Winning Trade</div><div class="analytics-top-metric-value">${formatCurrency(averageWinningTrade)}</div></article>
            <article class="analytics-top-metric analytics-top-metric--red"><div class="analytics-top-metric-label">Average Losing Trade</div><div class="analytics-top-metric-value">${formatCurrency(-averageLosingTrade)}</div></article>
            <article class="analytics-top-metric"><div class="analytics-top-metric-label">Break-even trades</div><div class="analytics-top-metric-value">${breakEvenTrades.length}</div></article>
            <article class="analytics-top-metric analytics-top-metric--green"><div class="analytics-top-metric-label">Winning Days</div><div class="analytics-top-metric-value">${winningDays}</div></article>
            <article class="analytics-top-metric analytics-top-metric--red"><div class="analytics-top-metric-label">Losing Days</div><div class="analytics-top-metric-value">${losingDays}</div></article>
          </div>
        </article>

        <article class="tl-section-card analytics-bento-card analytics-bento-card--full analytics-decision-engine">
          <div class="tl-section-header">
            <div>
              <div class="tl-section-title">Trading Decision Engine</div>
              <div class="row-sub">Diagnóstico computado desde WR, R:R, drawdown, consistencia, sesiones y rendimiento horario.</div>
            </div>
          </div>
          <div class="analytics-decision-grid">
            <div class="analytics-decision-item analytics-decision-item--warn">
              <span>Primary Focus</span>
              <strong>${decisionEngine.primary}</strong>
            </div>
            <div class="analytics-decision-item analytics-decision-item--neutral">
              <span>Secondary Focus</span>
              <strong>${decisionEngine.secondary}</strong>
            </div>
            <div class="analytics-decision-item analytics-decision-item--positive">
              <span>Strength</span>
              <strong>${decisionEngine.strength}</strong>
            </div>
          </div>
        </article>

        <div class="tl-section-card analytics-score-card analytics-bento-card analytics-bento-card--4">
          <div class="score-header">
            <div class="analytics-score-copy">
              <div class="tl-section-title">Trading Risk Score</div>
              <p class="body-copy">Lectura agregada de calidad operativa y disciplina de ejecución.</p>
            </div>
            <div class="score-ring score-ring--arc">
              ${renderArcScoreWidget({
                key: "analytics-risk-score",
                score: model.totals.riskScore,
                label: "Trading Risk Score",
                subtitle: "SCORE",
                compact: true,
                segments: [
                  { tone: "orange", value: drivers[0].value, label: drivers[0].label },
                  { tone: "gold", value: drivers[1].value, label: drivers[1].label },
                  { tone: "green", value: drivers[2].value, label: drivers[2].label },
                  { tone: "blue", value: drivers[3].value, label: drivers[3].label }
                ]
              })}
            </div>
          </div>
          <div class="analytics-score-interpretation">
            <strong>${model.totals.riskScore} / 100</strong>
            <span>${scoreInterpretation}</span>
            <div class="analytics-score-badge">${badgeMarkup(contextTags.stabilityMeta, "ui-badge--compact")}</div>
          </div>
          <div class="analytics-drivers-grid">
            <div class="score-bar-row score-bar-row--compact">
              <span>Win Rate</span>
              <div class="score-bar-track"><div class="score-bar-fill score-bar-fill--green" style="width:${Math.max(0, Math.min(model.totals.winRate, 100))}%"></div></div>
              <strong>${formatPercent(model.totals.winRate)}</strong>
            </div>
            <div class="score-bar-row score-bar-row--compact">
              <span>Risk/Reward</span>
              <div class="score-bar-track"><div class="score-bar-fill score-bar-fill--blue" style="width:${Math.max(0, Math.min((model.totals.rr / 3) * 100, 100))}%"></div></div>
              <strong>${model.totals.rr.toFixed(2)}</strong>
            </div>
            <div class="score-bar-row score-bar-row--compact">
              <span>Consistency</span>
              <div class="score-bar-track"><div class="score-bar-fill score-bar-fill--violet" style="width:${drivers[2].value}%"></div></div>
              <strong>${drivers[2].display}</strong>
            </div>
          </div>
        </div>

        <article class="tl-section-card analytics-bento-card analytics-bento-card--8">
          <div class="tl-section-header">
            <div>
              <div class="tl-section-title">Advanced Ratios</div>
              <div class="row-sub">Relación entre retorno, estabilidad y recuperación del sistema.</div>
            </div>
          </div>
          <div class="analytics-ratios-minimal-grid analytics-ratios-minimal-grid--wide analytics-ratios-minimal-grid--bento">
            <article class="analytics-ratio-minimal-card analytics-ratio-minimal-card--bento">
              <span>Sharpe</span>
              <strong>${model.totals.ratios.sharpe.toFixed(2)}</strong>
              <small>Retorno ajustado por volatilidad.</small>
            </article>
            <article class="analytics-ratio-minimal-card analytics-ratio-minimal-card--bento">
              <span>Sortino</span>
              <strong>${model.totals.ratios.sortino.toFixed(2)}</strong>
              <small>Penaliza solo el downside.</small>
            </article>
            <article class="analytics-ratio-minimal-card analytics-ratio-minimal-card--bento">
              <span>Max DD</span>
              <strong class="metric-negative">${formatPercent(model.totals.drawdown.maxPct)}</strong>
              <small>Retroceso máximo desde pico.</small>
              <div class="analytics-ratio-meta">${badgeMarkup(contextTags.drawdownMeta, "ui-badge--compact")}</div>
            </article>
            <article class="analytics-ratio-minimal-card analytics-ratio-minimal-card--bento">
              <span>Calmar</span>
              <strong>${model.totals.ratios.calmar.toFixed(2)}</strong>
              <small>Rentabilidad frente a drawdown.</small>
            </article>
            <article class="analytics-ratio-minimal-card analytics-ratio-minimal-card--bento">
              <span>Recovery Factor</span>
              <strong>${model.totals.ratios.recovery.toFixed(2)}</strong>
              <small>Capacidad para recuperar pérdidas.</small>
            </article>
          </div>
        </article>

        <article class="tl-section-card analytics-performance-profile analytics-bento-card analytics-bento-card--6">
          <div class="tl-section-header">
            <div class="tl-section-title">Trading Performance Profile</div>
          </div>
          <div class="analytics-performance-bento">
            <div class="analytics-performance-radar-shell analytics-performance-radar-shell--bento">
              ${chartCanvas("analytics-overview-performance-radar", 280, "kmfx-chart-shell--feature")}
            </div>
            <div class="analytics-performance-bars analytics-performance-bars--stacked">
              ${performanceProfile.map((metric) => `
                <div class="analytics-performance-bar-row">
                  <div class="analytics-performance-bar-meta">
                    <span>${metric.label}</span>
                    <strong>${Math.round(metric.value)}%</strong>
                  </div>
                  <div class="analytics-performance-track">
                    <div class="analytics-performance-fill" style="width:${metric.value}%"></div>
                  </div>
                </div>
              `).join("")}
            </div>
          </div>
        </article>

        <article class="tl-section-card analytics-plain-block analytics-bento-card analytics-bento-card--6">
          <div class="tl-section-header"><div class="tl-section-title">Win / Loss Analysis</div></div>
          <div class="analytics-vertical-list">
            <div class="analytics-vertical-item">
              <span class="analytics-dot analytics-dot--green"></span>
              <span class="analytics-vertical-label">Winning Trades</span>
              <strong class="analytics-vertical-value">${winningTrades.length}</strong>
            </div>
            <div class="analytics-vertical-item">
              <span class="analytics-dot analytics-dot--red"></span>
              <span class="analytics-vertical-label">Losing Trades</span>
              <strong class="analytics-vertical-value">${losingTrades.length}</strong>
            </div>
            <div class="analytics-vertical-item">
              <span class="analytics-dot analytics-dot--green"></span>
              <span class="analytics-vertical-label">Average Winning Trade</span>
              <strong class="analytics-vertical-value">${formatCurrency(averageWinningTrade)}</strong>
            </div>
            <div class="analytics-vertical-item">
              <span class="analytics-dot analytics-dot--red"></span>
              <span class="analytics-vertical-label">Average Losing Trade</span>
              <strong class="analytics-vertical-value">${formatCurrency(-averageLosingTrade)}</strong>
            </div>
          </div>
        </article>

        <article class="tl-section-card analytics-bento-card analytics-bento-card--6">
          <div class="tl-section-header"><div class="tl-section-title">Daily Performance</div></div>
          ${renderDailyPerformanceBreakdown(weekdayWorkdays, {
            winningDays,
            losingDays,
            breakEven: Math.max(0, 5 - winningDays - losingDays)
          })}
        </article>

        <article class="tl-section-card analytics-bento-card analytics-bento-card--6">
          <div class="tl-section-header"><div class="tl-section-title">Hourly Performance</div></div>
          <div class="analytics-hourly-bento-grid">
            <article class="hhc-card green"><div class="hhc-label">Mejor hora</div><div class="hhc-val green">${String(bestHour.hour).padStart(2, "0")}:00</div><div class="hhc-sub">${formatCurrency(bestHour.pnl)}</div></article>
            <article class="hhc-card red"><div class="hhc-label">Peor hora</div><div class="hhc-val red">${String(worstHour.hour).padStart(2, "0")}:00</div><div class="hhc-sub">${formatCurrency(worstHour.pnl)}</div></article>
            <article class="hhc-card blue"><div class="hhc-label">Hora más activa</div><div class="hhc-val">${String(activeHour.hour).padStart(2, "0")}:00</div><div class="hhc-sub">${activeHour.trades} trades</div></article>
          </div>
          <div class="analytics-hourly-stack">
            <section class="analytics-hourly-section">
              <div class="analytics-hourly-section-head">
                <strong>PnL by Hour</strong>
              </div>
              <div class="analytics-hourly-bars-stage">
                <svg class="analytics-hourly-bars-svg" viewBox="0 0 ${hourlyPnlBars.width} ${hourlyPnlBars.height}" preserveAspectRatio="none" aria-hidden="true">
                  <line x1="0" y1="${hourlyPnlBars.zeroY}" x2="${hourlyPnlBars.width}" y2="${hourlyPnlBars.zeroY}" class="analytics-daily-zero"></line>
                  ${hourlyPnlBars.bars.map((bar) => `
                    <rect
                      class="analytics-hourly-bar ${bar.value >= 0 ? "is-positive" : "is-negative"}"
                      x="${bar.x}"
                      y="${bar.y}"
                      width="${bar.width}"
                      height="${bar.height}"
                      rx="${bar.rx}">
                    </rect>
                  `).join("")}
                </svg>
                <div class="analytics-hourly-bars-x">
                  ${hourlyRows.map((hour) => `<span>${String(hour.hour).padStart(2, "0")}</span>`).join("")}
                </div>
              </div>
            </section>
            <section class="analytics-hourly-section">
              <div class="analytics-hourly-section-head">
                <strong>Trades by Hour</strong>
              </div>
              <div class="analytics-hourly-bars-stage">
                <svg class="analytics-hourly-bars-svg" viewBox="0 0 ${hourlyTradeBars.width} ${hourlyTradeBars.height}" preserveAspectRatio="none" aria-hidden="true">
                  <line x1="0" y1="${hourlyTradeBars.zeroY}" x2="${hourlyTradeBars.width}" y2="${hourlyTradeBars.zeroY}" class="analytics-daily-zero"></line>
                  ${hourlyTradeBars.bars.map((bar) => `
                    <rect
                      class="analytics-hourly-bar analytics-hourly-bar--trades"
                      x="${bar.x}"
                      y="${bar.y}"
                      width="${bar.width}"
                      height="${bar.height}"
                      rx="${bar.rx}">
                    </rect>
                  `).join("")}
                </svg>
                <div class="analytics-hourly-bars-x">
                  ${hourlyRows.map((hour) => `<span>${String(hour.hour).padStart(2, "0")}</span>`).join("")}
                </div>
              </div>
            </section>
          </div>
        </article>

        <article class="tl-section-card analytics-bento-card analytics-bento-card--6">
          <div class="tl-section-header"><div class="tl-section-title">Heatmap 24h</div></div>
          <div class="heat-legend">
            <span><i class="heat-legend-dot heat-legend-dot--gain"></i>High profit</span>
            <span><i class="heat-legend-dot heat-legend-dot--neutral"></i>Neutral</span>
            <span><i class="heat-legend-dot heat-legend-dot--loss"></i>High loss</span>
            <span><i class="heat-legend-dot heat-legend-dot--empty"></i>No data</span>
          </div>
          <div class="heat-grid heat-grid--24 analytics-heatmap-grid">
            ${model.hours.map((hour) => `
              <div class="heat-cell analytics-heatmap-cell ${hour.trades ? "" : "heat-cell--empty"} ${hour.trades && hour.pnl === 0 ? "analytics-heatmap-cell--neutral" : ""}" style="${hour.trades ? `background:${hour.pnl > 0 ? "var(--green-bg)" : hour.pnl < 0 ? "var(--red-bg)" : "color-mix(in srgb, var(--surface2) 96%, transparent)"};border-color:${hour.pnl > 0 ? "var(--green-border)" : hour.pnl < 0 ? "var(--red-border)" : "color-mix(in srgb, var(--border) 42%, transparent)"}` : ""}">
                <div class="heat-hour">${String(hour.hour).padStart(2, "0")}:00</div>
                <div class="heat-pnl ${hour.pnl >= 0 ? "metric-positive" : "metric-negative"}">${hour.trades ? formatCurrency(hour.pnl) : "—"}</div>
                <div class="row-sub">${hour.trades ? `${hour.trades} trades` : "Sin datos"}</div>
              </div>
            `).join("")}
          </div>
        </article>

        <article class="tl-section-card analytics-bento-card analytics-bento-card--6">
          <div class="tl-section-header"><div class="tl-section-title">Session Analysis</div></div>
          <div class="analytics-session-stack">
            ${model.sessions.map((session) => `
              <article class="analytics-session-row">
                <div class="analytics-session-main">
                  <div>
                    <div class="session-label">${session.key}</div>
                    <div class="analytics-inline-risk-tag">${badgeMarkup(sessionExecutionMeta(session), "ui-badge--compact")}</div>
                  </div>
                  <div class="analytics-session-metrics">
                    <strong class="${session.pnl >= 0 ? "metric-positive" : "metric-negative"}">${formatCurrency(session.pnl)}</strong>
                    <span>WR ${formatPercent(session.winRate)}</span>
                  </div>
                </div>
                <div class="analytics-session-rail">
                  <div class="analytics-session-rail-fill ${session.winRate >= 50 ? "is-positive" : "is-negative"}" style="width:${Math.max(0, Math.min(session.winRate, 100))}%"></div>
                </div>
              </article>
            `).join("")}
          </div>
        </article>

        <article class="tl-section-card analytics-bento-card analytics-bento-card--6 analytics-bento-card--drawdown">
          <div class="tl-section-header"><div class="tl-section-title">Drawdown Curve</div></div>
          ${chartCanvas("analytics-overview-drawdown-curve", 260, "kmfx-chart-shell--feature analytics-drawdown-chart")}
        </article>

        <article class="tl-section-card analytics-bento-card analytics-bento-card--6 analytics-bento-card--distribution">
          <div class="tl-section-header"><div class="tl-section-title">Profit Distribution</div></div>
          <div class="row-sub">Buckets de resultados por rango de beneficio/pérdida.</div>
          ${chartCanvas("analytics-overview-profit-distribution", 260, "kmfx-chart-shell--feature analytics-distribution-chart")}
        </article>

        <div class="tl-section-card analytics-bento-card analytics-bento-card--full">
          <div class="tl-section-header"><div class="tl-section-title">Performance by Symbol</div></div>
          <div class="table-wrap">
            <table>
            <thead><tr><th>Símbolo</th><th class="num">P&amp;L Total</th><th class="num">Operaciones</th><th>Tasa Acierto</th><th class="num">Gan. Prom.</th><th class="num">Perd. Prom.</th><th class="num">P&amp;L Prom.</th><th class="num">Factor Ben.</th></tr></thead>
            <tbody>
              ${model.symbols.map((row) => `
                <tr>
                  <td>
                    <div class="analytics-symbol-cell">
                      <strong>${row.key}</strong>
                      <div class="row-sub">${row.pnl >= 0 ? "Rentable" : "Presión"}</div>
                    </div>
                  </td>
                  <td class="num ${row.pnl >= 0 ? "metric-positive" : "metric-negative"}">${formatCurrency(row.pnl)}</td>
                  <td class="num">${row.trades}</td>
                  <td>
                    <div class="analytics-wr-cell">
                      <div class="analytics-wr-meta">
                        <span>${formatPercent(row.winRate)}</span>
                      </div>
                      <div class="analytics-wr-track">
                        <div class="analytics-wr-fill ${row.winRate >= 50 ? "is-positive" : "is-negative"}" style="width:${Math.max(0, Math.min(row.winRate, 100))}%"></div>
                      </div>
                    </div>
                  </td>
                  <td class="num metric-positive">${formatCurrency(row.avgWin)}</td>
                  <td class="num metric-negative">${formatCurrency(-row.avgLoss)}</td>
                  <td class="num ${(row.trades ? row.pnl / row.trades : 0) >= 0 ? "metric-positive" : "metric-negative"}">${formatCurrency(row.trades ? row.pnl / row.trades : 0)}</td>
                  <td class="num">${row.profitFactor.toFixed(2)}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
        </div>
      </div>
    </section>

    <section class="analytics-panel ${state.ui.analyticsTab === "daily" ? "active" : ""}" data-tab="daily">
      <div class="hour-hero-cards analytics-daily-heroes">
        ${weekdayWorkdays.map((day) => `
          <article class="hhc-card blue">
            <div class="hhc-label">${day.label}</div>
            <div class="hhc-val ${day.pnl >= 0 ? "metric-positive" : "metric-negative"}">${formatCurrency(day.pnl)}</div>
            <div class="hhc-sub">${day.trades} trades</div>
          </article>
        `).join("")}
      </div>
      <article class="tl-section-card">
        <div class="tl-section-header"><div class="tl-section-title">Rendimiento por Día</div></div>
        ${renderDailyPerformanceBreakdown(weekdayWorkdays)}
      </article>
    </section>

    <section class="analytics-panel ${state.ui.analyticsTab === "hourly" ? "active" : ""}" data-tab="hourly">
      <div class="hour-hero-cards">
        <article class="hhc-card green"><div class="hhc-label">Mejor hora</div><div class="hhc-val green">${String(bestHour.hour).padStart(2, "0")}:00</div><div class="hhc-sub">${formatCurrency(bestHour.pnl)}</div></article>
        <article class="hhc-card red"><div class="hhc-label">Peor hora</div><div class="hhc-val red">${String(worstHour.hour).padStart(2, "0")}:00</div><div class="hhc-sub">${formatCurrency(worstHour.pnl)}</div></article>
        <article class="hhc-card blue"><div class="hhc-label">Hora más activa</div><div class="hhc-val">${String(activeHour.hour).padStart(2, "0")}:00</div><div class="hhc-sub">${activeHour.trades} trades</div></article>
      </div>

      <div class="tl-section-card">
        <div class="tl-section-header"><div class="tl-section-title">Heatmap 24 Horas</div></div>
        <div class="heat-legend">
          <span><i class="heat-legend-dot heat-legend-dot--gain"></i>Ganancia</span>
          <span><i class="heat-legend-dot heat-legend-dot--loss"></i>Pérdida</span>
          <span><i class="heat-legend-dot heat-legend-dot--empty"></i>Sin datos</span>
        </div>
        <div class="heat-grid heat-grid--24">
          ${model.hours.map((hour) => `
            <div class="heat-cell ${hour.trades ? "" : "heat-cell--empty"}" style="${hour.trades ? `background:${hour.pnl >= 0 ? "var(--green-bg)" : "var(--red-bg)"};border-color:${hour.pnl >= 0 ? "var(--green-border)" : "var(--red-border)"}` : ""}">
              <div class="heat-hour">${String(hour.hour).padStart(2, "0")}:00</div>
              <div class="heat-pnl ${hour.pnl >= 0 ? "metric-positive" : "metric-negative"}">${hour.trades ? formatCurrency(hour.pnl) : "—"}</div>
              <div class="row-sub">${hour.trades ? `${hour.trades} trades` : "Sin datos"}</div>
            </div>
          `).join("")}
        </div>
      </div>

      <div class="grid-2 equal">
        <article class="tl-section-card">
          <div class="tl-section-header"><div class="tl-section-title">PnL por Hora</div></div>
          ${chartCanvas("analytics-hourly-pnl", 240, "kmfx-chart-shell--feature")}
        </article>
        <article class="tl-section-card">
          <div class="tl-section-header"><div class="tl-section-title">Actividad por Hora</div></div>
          ${chartCanvas("analytics-hourly-trades", 240, "kmfx-chart-shell--feature")}
        </article>
      </div>

      <div class="tl-section-card">
        <div class="tl-section-header"><div class="tl-section-title">Desglose Métrico por Hora</div></div>
        <div class="breakdown-list">
          ${hourlyRows.sort((a, b) => b.pnl - a.pnl).map((hour) => `
            <div class="list-row">
              <div><div class="row-title">${String(hour.hour).padStart(2, "0")}:00</div><div class="row-sub">${hour.trades} trades ejecutados</div></div>
              <div class="row-chip">${hour.trades > 1 ? "Cluster" : "Single"}</div>
              <div class="row-pnl ${hour.pnl >= 0 ? "metric-positive" : "metric-negative"}">${formatCurrency(hour.pnl)}</div>
            </div>
          `).join("")}
        </div>
      </div>
    </section>

    <section class="analytics-panel ${state.ui.analyticsTab === "risk" ? "active" : ""}" data-tab="risk">
      <div class="sessions-grid">
        ${model.sessions.map((session) => `
          <div class="session-card">
            <div class="session-label">${session.key}</div>
            <div class="session-val ${session.pnl >= 0 ? "metric-positive" : "metric-negative"}">${formatCurrency(session.pnl)}</div>
            <div class="session-sub">WR ${formatPercent(session.winRate)} · ${session.trades} trades</div>
          </div>
        `).join("")}
      </div>

      <div class="grid-2 equal">
        <article class="tl-section-card">
          <div class="tl-section-header"><div class="tl-section-title">Curva de Drawdown</div></div>
          ${chartCanvas("analytics-drawdown-curve", 240, "kmfx-chart-shell--feature")}
        </article>
        <article class="tl-section-card">
          <div class="tl-section-header"><div class="tl-section-title">Distribución de Profits</div></div>
          ${chartCanvas("analytics-profit-distribution", 240, "kmfx-chart-shell--feature")}
        </article>
      </div>
    </section>
  `;

  mountCharts(root, chartSpecs);

  attachArcInteractions(root);
}
