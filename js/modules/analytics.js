import { formatCompact, formatCurrency, formatPercent, resolveAccountDataAuthority, resolveActiveAccountId, selectCurrentAccount, selectCurrentModel } from "./utils.js?v=build-20260406-213500";
import { barChartSpec, chartCanvas, lineAreaSpec, mountCharts } from "./chart-system.js?v=build-20260406-213500";
import { computeRiskAlerts, riskAlertsMarkup } from "./risk-alerts.js?v=build-20260406-213500";
import { badgeMarkup } from "./status-badges.js?v=build-20260406-213500";
import { renderAdminTracePanel } from "./admin-mode.js?v=build-20260406-213500";

const ANALYTICS_CALENDAR_HEADERS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function clampPercent(value) {
  return Math.max(0, Math.min(100, value));
}

function inRange(value, start, end) {
  return value >= start && value <= end;
}

function formatCompactSignedCurrency(value) {
  const numeric = Number(value || 0);
  const absolute = Math.abs(numeric);
  if (absolute < 1000) return `${numeric < 0 ? "-" : ""}$${Math.round(absolute)}`;
  const compact = absolute >= 10000 ? (absolute / 1000).toFixed(0) : (absolute / 1000).toFixed(1);
  return `${numeric < 0 ? "-" : ""}$${compact}k`;
}

function formatCompactSignedUsdMagnitude(value) {
  const numeric = Number(value || 0);
  const absolute = Math.abs(numeric);
  if (absolute < 1000) {
    return `${numeric < 0 ? "-" : ""}$${Math.round(absolute)}`;
  }
  const compact = absolute >= 10000 ? (absolute / 1000).toFixed(0) : (absolute / 1000).toFixed(1);
  return `${numeric < 0 ? "-" : ""}$${compact}k`;
}

function formatCompactSignedPercent(value) {
  const numeric = Number(value || 0);
  const absolute = Math.abs(numeric);
  const decimals = absolute >= 10 ? 0 : absolute >= 1 ? 1 : 2;
  return `${numeric < 0 ? "-" : ""}${absolute.toFixed(decimals)}%`;
}

function formatTradeCount(value) {
  const count = Number(value || 0);
  return `${count} trade${count === 1 ? "" : "s"}`;
}

function toLocalDayKey(dateLike) {
  const date = new Date(dateLike);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toLocalMonthKey(dateLike) {
  return toLocalDayKey(dateLike).slice(0, 7);
}

function monthKeyToDate(key) {
  const [year, month] = key.split("-").map(Number);
  return new Date(year, (month || 1) - 1, 1);
}

function buildFallbackMonthRecord() {
  const date = new Date();
  return {
    key: toLocalMonthKey(date),
    label: date.toLocaleDateString("es-ES", { month: "short", year: "numeric" }),
    pnl: 0,
    trades: 0,
    startBalance: 0,
    returnPct: 0
  };
}

function expandAnalyticsMonths(months) {
  if (!months.length) return [buildFallbackMonthRecord()];
  const byKey = new Map(months.map((month) => [month.key, month]));
  const years = [...new Set(months.map((month) => Number(month.key.slice(0, 4))))].sort((a, b) => a - b);
  const expanded = [];
  let runningBalance = Number(months[0]?.startBalance || 0);

  years.forEach((year) => {
    for (let monthNumber = 1; monthNumber <= 12; monthNumber += 1) {
      const key = `${year}-${String(monthNumber).padStart(2, "0")}`;
      const existing = byKey.get(key);
      if (existing) {
        runningBalance = Number(existing.startBalance || runningBalance) + Number(existing.pnl || 0);
        expanded.push(existing);
        continue;
      }
      const date = new Date(year, monthNumber - 1, 1);
      expanded.push({
        key,
        label: date.toLocaleDateString("es-ES", { month: "short", year: "numeric" }),
        pnl: 0,
        trades: 0,
        startBalance: runningBalance,
        returnPct: 0
      });
    }
  });

  return expanded;
}

function shiftMonthKey(months, currentKey, offset) {
  const index = months.findIndex((month) => month.key === currentKey);
  if (index === -1) return null;
  return months[index + offset]?.key || null;
}

function buildAnalyticsMonthView(dayStats, monthKey) {
  const anchorDate = monthKeyToDate(monthKey);
  const first = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1);
  const last = new Date(anchorDate.getFullYear(), anchorDate.getMonth() + 1, 0);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  const end = new Date(last);
  end.setDate(last.getDate() + (6 - last.getDay()));
  const todayKey = toLocalDayKey(new Date());
  const dayMap = new Map(dayStats.map((entry) => [entry.key, entry]));
  const cells = [];

  for (let current = new Date(start); current <= end; current.setDate(current.getDate() + 1)) {
    const key = toLocalDayKey(current);
    const day = dayMap.get(key);
    cells.push({
      key,
      inMonth: current.getMonth() === anchorDate.getMonth(),
      date: new Date(current),
      pnl: day?.pnl || 0,
      trades: day?.trades || 0,
      isToday: key === todayKey,
      state: !day?.trades ? "idle" : day.pnl >= 0 ? "win" : "loss"
    });
  }

  return {
    key: monthKey,
    label: anchorDate.toLocaleDateString("es-ES", { month: "long", year: "numeric" }),
    cells
  };
}

function describeDayBehavior(day, trades, bestSessionKey, worstSessionKey, bestHour, worstHour) {
  const mainSession = dominantValue(trades.map((trade) => trade.session).filter(Boolean));
  const avgTrades = trades.length;
  if (day.pnl > 0 && mainSession === bestSessionKey) return "Sesión fuerte. Cierre positivo.";
  if (day.pnl < 0 && mainSession === worstSessionKey) return "Sesión débil. La pérdida se amplifica.";
  if (day.pnl < 0 && trades.some((trade) => trade.when.getHours() === worstHour)) return "Timing débil. La calidad cae.";
  if (day.pnl > 0 && trades.some((trade) => trade.when.getHours() === bestHour)) return "Timing a favor. El día suma con claridad.";
  if (avgTrades >= 3 && day.pnl < 0) return "Alta frecuencia. Calidad más débil.";
  if (avgTrades === 1 && day.pnl > 0) return "Menos fricción. Mejor ejecución.";
  return day.pnl >= 0 ? "Control del día. Cierre favorable." : "Gestión más débil. Cierre negativo.";
}

function describeDayReviewLabel(day, trades = []) {
  if (day.pnl < 0) return trades.length >= 3 ? "Alta frecuencia" : "Mayor daño";
  if (day.pnl > 0) return "Mayor aporte";
  return "Impacto neutral";
}

function dominantValue(values = []) {
  const counts = new Map();
  values.forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "—";
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
    { label: "Rentabilidad", value: profitability },
    { label: "Consistencia", value: consistency },
    { label: "Gestión de riesgo", value: riskManagement },
    { label: "Disciplina", value: discipline },
    { label: "Eficiencia", value: efficiency },
    { label: "Riesgo/Beneficio", value: riskReward }
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

function resolveRiskProtectionMeta({
  account,
  riskProfile,
  riskSnapshot,
  hasSuggestedRules
}) {
  const connectionConnected = Boolean(account?.connection?.connected);
  const snapshotPolicy = riskSnapshot?.policy && typeof riskSnapshot.policy === "object" ? riskSnapshot.policy : {};
  const profileAutoBlock = Boolean(riskProfile?.autoBlock);
  const snapshotAutoBlock = Boolean(snapshotPolicy.auto_block_enabled);
  const isConfigured = profileAutoBlock || snapshotAutoBlock;
  const hasLocalSnapshot = Boolean(riskSnapshot);

  if (hasLocalSnapshot && !connectionConnected) {
    return {
      state: "Error de sincronización",
      tone: "warning",
      rulesState: "Configuradas",
      actionLabel: "Abrir Risk Engine",
      note: "Hay una política conocida, pero no puedo confirmar si el motor local sigue aplicándola."
    };
  }

  if (!connectionConnected && !hasLocalSnapshot) {
    return {
      state: "No conectado",
      tone: "warning",
      rulesState: hasSuggestedRules ? "Sugeridas" : "Pendientes",
      actionLabel: "Activar protección automática local",
      note: "Primero hay que enlazar el motor local para enviar y aplicar reglas de protección."
    };
  }

  if (connectionConnected && snapshotAutoBlock) {
    return {
      state: "Protección activa en local",
      tone: "positive",
      rulesState: "Activas",
      actionLabel: "Gestionar protección automática",
      note: "El Risk Engine ya tiene una política activa y puede cortar la operativa si la sesión se degrada."
    };
  }

  if (isConfigured) {
    return {
      state: "Configurado",
      tone: "info",
      rulesState: "Configuradas",
      actionLabel: "Enviar reglas al motor",
      note: "La política ya existe, pero falta confirmación de aplicación en el entorno local."
    };
  }

  return {
    state: "OFF",
    tone: "neutral",
    rulesState: hasSuggestedRules ? "Sugeridas" : "Pendientes",
    actionLabel: "Activar protección automática local",
    note: "Todavía no hay una protección automática activa: el control depende de supervisión manual."
  };
}

function calcAvgR(trades = []) {
  const validTrades = trades.filter((trade) => Number.isFinite(Number(trade.rMultiple)));
  if (!validTrades.length) return 0;
  return validTrades.reduce((sum, trade) => sum + Number(trade.rMultiple || 0), 0) / validTrades.length;
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

function standardDeviation(values = []) {
  if (!values.length) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / values.length;
  return Math.sqrt(variance);
}

function buildDenseProfitDistribution(trades = [], binCount = 10) {
  if (!trades.length) return [];
  const pnlValues = trades.map((trade) => Number(trade.pnl || 0));
  const min = Math.min(...pnlValues);
  const max = Math.max(...pnlValues);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (min === max) {
    return [{ label: `${Math.round(min)}`, value: pnlValues.length, tone: min < 0 ? "red" : "green" }];
  }

  const step = (max - min) / binCount || 1;
  const bins = Array.from({ length: binCount }, (_, index) => {
    const start = min + (step * index);
    const end = index === binCount - 1 ? max : min + (step * (index + 1));
    return {
      start,
      end,
      count: 0
    };
  });

  pnlValues.forEach((value) => {
    let index = Math.floor((value - min) / step);
    if (!Number.isFinite(index)) index = 0;
    index = Math.max(0, Math.min(binCount - 1, index));
    bins[index].count += 1;
  });

  return bins.map((bin) => {
    const nearZero = bin.start < 0 && bin.end >= 0;
    const tone = nearZero ? "red" : (((bin.start + bin.end) / 2) < 0 ? "red" : "green");
    const startLabel = Math.round(bin.start);
    const endLabel = Math.round(bin.end);
    return {
      label: `${startLabel} / ${endLabel}`,
      value: bin.count,
      tone
    };
  });
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
  const activeAccountId = resolveActiveAccountId(state);
  const account = selectCurrentAccount(state) || state.accounts?.[activeAccountId] || null;
  const authority = resolveAccountDataAuthority(account);
  console.log("[KMFX][VIEW]", {
    view: "analytics",
    activeAccountId,
    hasPayload: Boolean(account?.dashboardPayload),
    hasModel: Boolean(model),
  });
  if (!model) {
    root.innerHTML = "";
    return;
  }
  console.info("[KMFX][ANALYTICS_AUTHORITY]", {
    account_id: account?.id || "",
    login: account?.login || "",
    broker: account?.broker || "",
    payloadSource: authority.payloadSource,
    tradeCount: authority.tradeCount,
    historyPoints: authority.historyPoints,
    firstTradeLabel: authority.firstTradeLabel,
    lastTradeLabel: authority.lastTradeLabel,
    sourceUsed: authority.sourceUsed,
  });

  const workdayIndexes = new Set([1, 2, 3, 4, 5]);
  const weekdayTrades = new Map([...workdayIndexes].map((index) => [index, []]));
  model.trades.forEach((trade) => {
    const weekday = trade.when.getDay();
    if (weekdayTrades.has(weekday)) weekdayTrades.get(weekday).push(trade);
  });
  const weekdayWorkdays = model.weekdays
    .filter((day) => ["Lun", "Mar", "Mié", "Jue", "Vie"].includes(day.label))
    .map((day) => {
      const trades = weekdayTrades.get(day.index) || [];
      return {
        ...day,
        winRate: calcWinRate(trades),
        avgR: calcAvgR(trades),
        hasAvgR: trades.some((trade) => Number.isFinite(Number(trade.rMultiple)))
      };
    });
  const tradedWeekdays = weekdayWorkdays.filter((day) => day.trades > 0);
  const sortableWeekdays = tradedWeekdays.length ? tradedWeekdays : weekdayWorkdays;
  const bestWeekday = [...sortableWeekdays].sort((a, b) => b.pnl - a.pnl)[0] || weekdayWorkdays[0];
  const worstWeekday = [...sortableWeekdays].sort((a, b) => a.pnl - b.pnl)[0] || weekdayWorkdays[0];
  const bestHour = [...model.hours].sort((a, b) => b.pnl - a.pnl)[0] || { hour: 0, pnl: 0, trades: 0 };
  const worstHour = [...model.hours].sort((a, b) => a.pnl - b.pnl)[0] || { hour: 0, pnl: 0, trades: 0 };
  const activeHour = [...model.hours].sort((a, b) => b.trades - a.trades)[0] || { hour: 0, pnl: 0, trades: 0 };
  const drivers = riskDrivers(model);
  const scoreInterpretation = model.totals.riskScore >= 80
    ? "Riesgo estable y ejecución sólida."
    : model.totals.riskScore >= 65
      ? "Perfil saludable con margen de mejora."
      : "Edge positivo, margen todavía estrecho.";
  const decisionEngine = computeDecisionEngine(model);
  const hourlyRows = (model.hours || []).filter((hour) => hour.trades);
  const denseProfitDistribution = buildDenseProfitDistribution(model.trades, 10);
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
  const performanceProfile = buildPerformanceProfile(model).filter((metric) => [
    "Disciplina",
    "Consistencia",
    "Gestión de riesgo"
  ].includes(metric.label));
  const riskAlerts = computeRiskAlerts(model, account);
  const trendComparisons = computeTrendComparisons(model);
  const contextTags = analyticsRiskContext(model);
  const profitPerTrade = model.totals.totalTrades ? model.totals.pnl / model.totals.totalTrades : 0;
  const winLossRatio = averageLosingTrade ? averageWinningTrade / averageLosingTrade : 0;
  const stdDevPnl = standardDeviation((model.dayStats || []).map((day) => Number(day.pnl || 0)));
  const sessionRanking = [...model.sessions].sort((a, b) => b.pnl - a.pnl);
  const symbolRanking = [...model.symbols].sort((a, b) => b.pnl - a.pnl);
  const strongestSession = sessionRanking[0] || { key: "Sin datos", pnl: 0, winRate: 0, trades: 0 };
  const weakestSession = [...model.sessions].sort((a, b) => a.pnl - b.pnl)[0] || strongestSession;
  const strongestSymbol = symbolRanking[0] || { key: "—", pnl: 0, winRate: 0, trades: 0, profitFactor: 0 };
  const weakestSymbol = [...model.symbols].sort((a, b) => a.pnl - b.pnl)[0] || strongestSymbol;
  const focusSymbols = symbolRanking.slice(0, 4);
  const consistencyRatio = calcConsistency(model.dayStats || []);
  const analyticsMonths = Array.isArray(model.monthlyReturns) && model.monthlyReturns.length ? expandAnalyticsMonths(model.monthlyReturns) : [buildFallbackMonthRecord()];
  const latestAnalyticsMonthKey = analyticsMonths[analyticsMonths.length - 1]?.key || buildFallbackMonthRecord().key;
  const currentAnalyticsMonthKey = toLocalMonthKey(new Date());
  const defaultAnalyticsMonthKey = analyticsMonths.some((month) => month.key === currentAnalyticsMonthKey)
    ? currentAnalyticsMonthKey
    : latestAnalyticsMonthKey;
  if (!root.__analyticsDailyMonthKey || !analyticsMonths.some((month) => month.key === root.__analyticsDailyMonthKey)) {
    root.__analyticsDailyMonthKey = defaultAnalyticsMonthKey;
  }
  const analyticsDailyMonthKey = root.__analyticsDailyMonthKey;
  const analyticsDailyMonth = analyticsMonths.find((month) => month.key === analyticsDailyMonthKey) || analyticsMonths[analyticsMonths.length - 1];
  const analyticsDailyMonthIndex = analyticsMonths.findIndex((month) => month.key === analyticsDailyMonthKey);
  const analyticsDayView = buildAnalyticsMonthView(model.dayStats || [], analyticsDailyMonthKey);
  const monthDayStats = (model.dayStats || []).filter((day) => day.key.startsWith(analyticsDailyMonthKey));
  const operatedMonthDays = monthDayStats.filter((day) => Number(day.trades || 0) > 0);
  const dayTradeMap = new Map(monthDayStats.map((day) => [day.key, (model.trades || []).filter((trade) => toLocalDayKey(trade.when) === day.key)]));
  const keyDays = monthDayStats
    .slice()
    .sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl))
    .slice(0, 6)
    .map((day) => {
      const trades = dayTradeMap.get(day.key) || [];
      return {
        ...day,
        reviewLabel: describeDayReviewLabel(day, trades),
        behavior: describeDayBehavior(day, trades, strongestSession.key, weakestSession.key, bestHour.hour, worstHour.hour)
      };
    });
  const keyDaySet = new Set(keyDays.map((day) => day.key));
  const selectedDayKey = root.__analyticsDailySelectedDay && monthDayStats.some((day) => day.key === root.__analyticsDailySelectedDay)
    ? root.__analyticsDailySelectedDay
    : (keyDays[0]?.key || monthDayStats[0]?.key || "");
  root.__analyticsDailySelectedDay = selectedDayKey;
  const selectedDay = monthDayStats.find((day) => day.key === selectedDayKey) || null;
  const selectedDayTrades = selectedDay ? (dayTradeMap.get(selectedDay.key) || []) : [];
  const selectedDaySession = dominantValue(selectedDayTrades.map((trade) => trade.session).filter(Boolean));
  const selectedDayBehavior = selectedDay ? describeDayBehavior(selectedDay, selectedDayTrades, strongestSession.key, weakestSession.key, bestHour.hour, worstHour.hour) : "Selecciona un día con operativa para leer su patrón.";
  const selectedDaySymbol = dominantValue(selectedDayTrades.map((trade) => trade.symbol).filter(Boolean));
  const formatDailySignedCurrency = (value) => Number(value || 0) > 0 ? `+${formatCurrency(value)}` : formatCurrency(value);
  const positiveMonthDays = operatedMonthDays.filter((day) => day.pnl > 0);
  const negativeMonthDays = operatedMonthDays.filter((day) => day.pnl < 0);
  const neutralMonthDays = operatedMonthDays.filter((day) => day.pnl === 0);
  const totalTradesInMonth = operatedMonthDays.reduce((sum, day) => sum + Number(day.trades || 0), 0);
  const bestMonthDay = [...operatedMonthDays].sort((a, b) => b.pnl - a.pnl)[0] || null;
  const worstMonthDay = [...operatedMonthDays].sort((a, b) => a.pnl - b.pnl)[0] || null;
  const highestCostDay = [...operatedMonthDays]
    .map((day) => ({
      ...day,
      totalCost: Math.abs(Number(day.commission || 0)) + Math.abs(Number(day.swap || 0))
    }))
    .sort((a, b) => b.totalCost - a.totalCost)[0] || null;
  const reviewDay = negativeMonthDays.length
    ? worstMonthDay
    : keyDays[0] || bestMonthDay || null;
  const formatDayReviewLabel = (dayKey) => new Date(dayKey).toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
  const reviewReason = !reviewDay
    ? "Sin muestra diaria"
    : negativeMonthDays.length && reviewDay?.key === worstMonthDay?.key
      ? "Mayor pérdida del mes"
      : highestCostDay && reviewDay.key === highestCostDay.key && highestCostDay.totalCost > 0
        ? "Coste diario más alto"
        : "Mayor impacto del mes";
  const dailyReviewCards = operatedMonthDays.length ? [
    {
      label: "MEJOR DÍA",
      tone: "positive",
      value: bestMonthDay ? formatDayReviewLabel(bestMonthDay.key) : "Sin datos",
      meta: bestMonthDay ? formatDailySignedCurrency(bestMonthDay.pnl) : formatCurrency(0),
      metaTone: bestMonthDay && bestMonthDay.pnl >= 0 ? "positive" : "",
      secondary: bestMonthDay ? formatTradeCount(bestMonthDay.trades) : "Sin operaciones"
    },
    {
      label: "PEOR DÍA",
      tone: worstMonthDay && worstMonthDay.pnl < 0 ? "negative" : "neutral",
      value: worstMonthDay ? formatDayReviewLabel(worstMonthDay.key) : "Sin datos",
      meta: worstMonthDay ? formatDailySignedCurrency(worstMonthDay.pnl) : formatCurrency(0),
      metaTone: worstMonthDay
        ? worstMonthDay.pnl < 0 ? "negative" : worstMonthDay.pnl > 0 ? "positive" : ""
        : "",
      secondary: worstMonthDay ? formatTradeCount(worstMonthDay.trades) : "Sin operaciones"
    },
    {
      label: "DÍAS OPERADOS",
      tone: "neutral",
      value: `${operatedMonthDays.length}`,
      meta: totalTradesInMonth === 1 ? "1 trade en el mes" : `${totalTradesInMonth} trades en el mes`,
      secondary: `${positiveMonthDays.length} positivos / ${negativeMonthDays.length} negativos / ${neutralMonthDays.length} neutros`
    },
    {
      label: "DÍA A REVISAR",
      tone: negativeMonthDays.length ? "warning" : "neutral",
      value: reviewDay ? formatDayReviewLabel(reviewDay.key) : "Sin datos",
      meta: reviewReason,
      secondary: reviewDay ? `${formatDailySignedCurrency(reviewDay.pnl)}<br>${formatTradeCount(reviewDay.trades)}` : "Selecciona un mes con operaciones"
    }
  ] : [];
  const dailyReviewMarkup = operatedMonthDays.length ? `
    <section class="insights-daily-review" aria-labelledby="insights-daily-review-title">
      <header class="insights-daily-review__header">
        <div>
          <div class="insights-daily-review__eyebrow">DIARIO</div>
          <h3 id="insights-daily-review-title" class="insights-daily-review__title">Días que explican el mes</h3>
          <p class="insights-daily-review__description">Aporte, daño y días a revisar dentro del periodo seleccionado.</p>
        </div>
      </header>
      <div class="insights-daily-review__grid">
        ${dailyReviewCards.map((card) => `
          <article class="insights-daily-kpi insights-daily-kpi--${card.tone}">
            <span class="insights-daily-kpi__label">${card.label}</span>
            <strong class="insights-daily-kpi__value">${card.value}</strong>
            <span class="insights-daily-kpi__meta ${card.metaTone ? `insights-daily-kpi__meta--${card.metaTone}` : ""}">${card.meta}</span>
            <small class="insights-daily-kpi__secondary">${card.secondary}</small>
          </article>
        `).join("")}
      </div>
    </section>
  ` : `
    <section class="insights-daily-review insights-daily-review--empty" aria-labelledby="insights-daily-review-title">
      <header class="insights-daily-review__header">
        <div>
          <div class="insights-daily-review__eyebrow">DIARIO</div>
          <h3 id="insights-daily-review-title" class="insights-daily-review__title">Días que explican el mes</h3>
          <p class="insights-daily-review__description">Sin operaciones</p>
        </div>
      </header>
      <div class="insights-daily-review__empty">Selecciona un mes con operaciones para analizar días clave.</div>
    </section>
  `;
  const positiveSessionCounts = positiveMonthDays.reduce((acc, day) => {
    const trades = dayTradeMap.get(day.key) || [];
    const session = dominantValue(trades.map((trade) => trade.session).filter(Boolean));
    if (!session || session === "Sin dato") return acc;
    acc.set(session, (acc.get(session) || 0) + 1);
    return acc;
  }, new Map());
  const dominantPositiveSessionEntry = [...positiveSessionCounts.entries()].sort((a, b) => b[1] - a[1])[0] || null;
  const confidenceLevel = operatedMonthDays.length >= 6 && positiveMonthDays.length >= Math.max(3, Math.ceil(operatedMonthDays.length * 0.55)) && consistencyRatio >= 58
    ? "high"
    : operatedMonthDays.length >= 4 && positiveMonthDays.length >= Math.max(2, Math.ceil(operatedMonthDays.length * 0.45))
      ? "medium"
      : "low";
  const confidenceLevelLabel = confidenceLevel === "high" ? "Alta" : confidenceLevel === "medium" ? "Media" : "Baja";
  const confidenceHeadline = confidenceLevel === "high"
    ? "Alta consistencia en días positivos"
    : confidenceLevel === "medium"
      ? "Confianza moderada en el patrón"
      : "Confianza limitada en el patrón";
  const confidenceNote = operatedMonthDays.length === 0
    ? "Todavía no hay suficiente actividad en el mes para validar un patrón repetible."
    : confidenceLevel === "high"
      ? dominantPositiveSessionEntry
        ? `${dominantPositiveSessionEntry[0]} se repite en ${dominantPositiveSessionEntry[1]} cierres favorables del mes.`
        : "El patrón positivo aparece de forma repetida en varias sesiones."
      : confidenceLevel === "medium"
        ? dominantPositiveSessionEntry
          ? `${dominantPositiveSessionEntry[0]} sostiene parte del patrón, aunque con continuidad irregular.`
          : "Hay una señal útil, pero todavía necesita más repetición para consolidarse."
        : "El mes mezcla resultados y conviene validar más repeticiones antes de reforzar la lectura.";
  const dailyReadBullets = [
    `${strongestSession.key} concentra los cierres más limpios.`,
    `${String(worstHour.hour).padStart(2, "0")}:00 introduce fricción operativa.`,
    strongestSymbol.key !== "—" ? `${strongestSymbol.key} aporta la mayor tracción.` : "Setups simples. Mejor lectura del día.",
    selectedDayTrades.length >= 2 ? "Alta frecuencia. Calidad más débil." : "Menos fricción. Mejor resolución del día."
  ].slice(0, 4);
  const topInsightCards = [
    {
      label: "Mejor sesión",
      value: strongestSession.key,
      noteLead: formatCurrency(strongestSession.pnl),
      noteTail: `WR ${formatPercent(strongestSession.winRate)}`,
      noteTone: strongestSession.pnl >= 0 ? "positive" : "negative"
    },
    {
      label: "Mejor símbolo",
      value: strongestSymbol.key,
      noteLead: formatCurrency(strongestSymbol.pnl),
      noteTail: formatTradeCount(strongestSymbol.trades),
      noteTone: strongestSymbol.pnl >= 0 ? "positive" : "negative"
    }
  ];
  const summaryDrain = {
    label: "Drena rendimiento",
    value: `${String(worstHour.hour).padStart(2, "0")}:00`,
    noteLead: formatCurrency(worstHour.pnl),
    noteTail: "requiere filtro",
    noteTone: worstHour.pnl >= 0 ? "positive" : "negative"
  };
  const sessionComparisonRows = sessionRanking
    .filter((session) => Number(session.trades || 0) > 0 || Math.abs(Number(session.pnl || 0)) > 0)
    .slice(0, 4);
  const sessionChartRows = (sessionComparisonRows.length ? sessionComparisonRows : sessionRanking.slice(0, 4));
  const maxSessionPnlAbs = Math.max(
    1,
    ...sessionChartRows.map((session) => Math.abs(Number(session.pnl || 0)))
  );
  const sessionRowsMarkup = sessionChartRows.map((session) => {
    const pnl = Number(session.pnl || 0);
    const widthPercent = pnl === 0 ? 0 : Math.max(8, (Math.abs(pnl) / maxSessionPnlAbs) * 100);
    const toneClass = pnl >= 0 ? "insights-session-row--positive" : "insights-session-row--negative";
    const emphasisClass = session.key === strongestSession.key
      ? "insights-session-row--best"
      : session.key === weakestSession.key
        ? "insights-session-row--worst"
        : "";
    return `
      <article class="insights-session-row ${toneClass} ${emphasisClass}">
        <div class="insights-session-row__main">
          <div class="insights-session-row__copy">
            <strong>${session.key}</strong>
            <span>${formatTradeCount(session.trades)}<br>WR ${formatPercent(session.winRate)}</span>
          </div>
          <div class="insights-session-row__value ${pnl >= 0 ? "metric-positive" : "metric-negative"}">
            ${formatCurrency(pnl)}
          </div>
        </div>
        <div class="insights-session-row__line" aria-hidden="true">
          <span style="--session-contribution:${widthPercent.toFixed(2)}%;"></span>
        </div>
      </article>
    `;
  }).join("");
  const symbolRowsMarkup = focusSymbols.map((row, index) => `
    <article class="analytics-symbol-row ${index === 0 ? "analytics-symbol-row--best" : index === 1 ? "analytics-symbol-row--worst" : index > 1 ? "analytics-symbol-row--secondary" : ""}">
      <div class="analytics-symbol-row__main">
        <div class="analytics-symbol-row__copy">
          <strong>${row.key}</strong>
          <span>${index === 0 ? "Mayor contribución" : index === 1 ? (row.pnl >= 0 ? "Menor contribución" : "Mayor daño") : row.pnl >= 0 ? "Aporta en la muestra" : "Bajo presión"}</span>
        </div>
        <div class="analytics-symbol-row__meta">
          <strong class="${row.pnl >= 0 ? "metric-positive" : "metric-negative"}">${formatCurrency(row.pnl)}</strong>
          <span>${formatTradeCount(row.trades)}<br>WR ${formatPercent(row.winRate)}</span>
        </div>
      </div>
      <div class="analytics-symbol-row__aux">
        <span>PF ${row.profitFactor.toFixed(2)}</span>
        <span class="${(row.trades ? row.pnl / row.trades : 0) >= 0 ? "metric-positive" : "metric-negative"}">${formatCurrency(row.trades ? row.pnl / row.trades : 0)} / trade</span>
      </div>
    </article>
  `).join("");
  const profileHighlights = performanceProfile
    .map((metric) => `
      <div class="analytics-profile-row">
        <div class="analytics-profile-row__meta">
          <span>${metric.label}</span>
          <strong>${Math.round(metric.value)}%</strong>
        </div>
      </div>
    `).join("");
  const timingFocusRows = [
    bestHour,
    worstHour
  ].filter((row, index, list) => list.findIndex((item) => item.hour === row.hour) === index);
  const timingRowsMarkup = timingFocusRows.map((row) => `
    <article class="analytics-timing-row ${row.hour === bestHour.hour ? "analytics-timing-row--best" : row.hour === worstHour.hour ? "analytics-timing-row--worst" : ""}">
      <div class="analytics-timing-row__main">
        <div class="analytics-timing-row__copy">
          <strong>${String(row.hour).padStart(2, "0")}:00</strong>
          <span>${row.hour === bestHour.hour ? "Mayor aporte horario" : row.hour === worstHour.hour ? "Franja a revisar" : ""}</span>
        </div>
        <div class="analytics-timing-row__meta">
          <strong class="${row.pnl >= 0 ? "metric-positive" : "metric-negative"}">${formatCurrency(row.pnl)}</strong>
          <span>${formatTradeCount(row.trades)}</span>
        </div>
      </div>
    </article>
  `).join("");
  const hourMap = new Map((model.hours || []).map((hour) => [Number(hour.hour), hour]));
  const hourlyTimeline = Array.from({ length: 24 }, (_, hour) => {
    const source = hourMap.get(hour);
    return source ? { ...source, hour } : { hour, pnl: 0, trades: 0, winRate: 0 };
  });
  const hourlyMaxAbs = Math.max(...hourlyTimeline.map((hour) => Math.abs(Number(hour.pnl || 0))), 1);
  const formatHourLabel = (hour) => `${String(hour).padStart(2, "0")}:00`;
  let bestWindow = { start: bestHour.hour, end: bestHour.hour, pnl: bestHour.pnl, trades: bestHour.trades || 0 };
  for (let start = 0; start <= 21; start += 1) {
    const windowHours = hourlyTimeline.slice(start, start + 3);
    const pnl = windowHours.reduce((sum, hour) => sum + Number(hour.pnl || 0), 0);
    const trades = windowHours.reduce((sum, hour) => sum + Number(hour.trades || 0), 0);
    if (trades > 0 && pnl > bestWindow.pnl) {
      bestWindow = { start, end: start + 2, pnl, trades };
    }
  }
  const bestWindowLabel = `${formatHourLabel(bestWindow.start)}–${formatHourLabel(bestWindow.end)}`;
  const activeNegativeHours = hourlyTimeline.filter((hour) => hour.trades > 0 && hour.pnl < 0).sort((a, b) => a.pnl - b.pnl);
  const weakestTimingWindow = activeNegativeHours[0] || worstHour;
  if (!root.__analyticsHourValueMode || !["currency", "percent"].includes(root.__analyticsHourValueMode)) {
    root.__analyticsHourValueMode = "currency";
  }
  const analyticsHourValueMode = root.__analyticsHourValueMode;
  const analyticsHourPctBase = Math.max(Number(analyticsDailyMonth?.startBalance || model.account?.balance || model.account?.equity || 0), 1);
  const formatHourlyValue = (value) => analyticsHourValueMode === "percent"
    ? formatCompactSignedPercent((Number(value || 0) / analyticsHourPctBase) * 100)
    : formatCompactSignedCurrency(value);
  const formatHourlyOverviewValue = (value) => analyticsHourValueMode === "percent"
    ? formatCompactSignedPercent((Number(value || 0) / analyticsHourPctBase) * 100)
    : formatCompactSignedUsdMagnitude(value);
  const hourOverviewMarkup = hourlyTimeline.map((hour) => {
    const toneClass = hour.trades
      ? (hour.pnl >= 0 ? "is-positive" : "is-negative")
      : "is-empty";
    const inBestWindow = hour.hour >= bestWindow.start && hour.hour <= bestWindow.end;
    const windowClass = inBestWindow
      ? (hour.hour === bestWindow.start ? "is-window-start" : hour.hour === bestWindow.end ? "is-window-end" : "is-window-mid")
      : "";
    const intensity = hour.trades ? Math.max(0.16, Math.min(0.82, Math.abs(hour.pnl) / hourlyMaxAbs)) : 0;
    const showValue = hour.trades > 0;
    return `
      <div class="analytics-hour-segment ${toneClass} ${windowClass} ${hour.hour === bestHour.hour ? "is-best" : ""} ${hour.hour === weakestTimingWindow.hour ? "is-worst" : ""}" style="--hour-intensity:${intensity.toFixed(3)}">
        <span class="analytics-hour-segment__time">${String(hour.hour).padStart(2, "0")}</span>
        ${showValue ? `<strong class="${hour.pnl >= 0 ? "metric-positive" : "metric-negative"}">${formatHourlyOverviewValue(hour.pnl)}</strong>` : ""}
      </div>
    `;
  }).join("");
  const secondaryPositiveHour = hourlyTimeline
    .filter((hour) => hour.trades > 0 && hour.pnl > 0 && !inRange(hour.hour, bestWindow.start, bestWindow.end) && hour.hour !== bestHour.hour)
    .sort((a, b) => b.pnl - a.pnl)[0] || null;
  const bestWindowSupportingHours = hourlyTimeline
    .filter((hour) => hour.trades > 0 && inRange(hour.hour, bestWindow.start, bestWindow.end))
    .sort((a, b) => b.pnl - a.pnl);
  const detailHourRows = [
    {
      hour: bestHour.hour,
      pnl: bestHour.pnl,
      tone: bestHour.pnl >= 0 ? "positive" : "negative",
      label: "mejor franja",
      rowType: "leader"
    },
    ...bestWindowSupportingHours
      .filter((hour) => hour.hour !== bestHour.hour)
      .map((hour) => ({
        hour: hour.hour,
        pnl: hour.pnl,
        tone: hour.pnl >= 0 ? "positive" : "negative",
        label: "sostiene el edge",
        rowType: "support"
      })),
    {
      hour: weakestTimingWindow.hour,
      pnl: weakestTimingWindow.pnl,
      tone: "negative",
      label: "franja a vigilar",
      rowType: "weak"
    },
    ...(secondaryPositiveHour ? [{
      hour: secondaryPositiveHour.hour,
      pnl: secondaryPositiveHour.pnl,
      tone: "positive",
      label: "aporta pero no lidera",
      rowType: "support"
    }] : [])
  ].filter((row, index, list) => list.findIndex((item) => item.hour === row.hour) === index).slice(0, 4);
  const hourDetailRowsMarkup = detailHourRows.map((row) => `
    <div class="analytics-hour-detail-row analytics-hour-detail-row--${row.rowType}">
      <div class="analytics-hour-detail-row__time">${String(row.hour).padStart(2, "0")}:00</div>
      <div class="analytics-hour-detail-row__value ${row.tone === "positive" ? "metric-positive" : "metric-negative"}">${formatHourlyValue(row.pnl)}</div>
      <div class="analytics-hour-detail-row__label">${row.label}</div>
    </div>
  `).join("");
  const hourInsight = `${bestWindowLabel} concentra el edge; ${formatHourLabel(weakestTimingWindow.hour)} introduce la fricción a evitar.`;
  const shortHourDecision = `Concentra la operativa entre ${String(bestWindow.start).padStart(2, "0")}:00 y ${String(bestWindow.end).padStart(2, "0")}:00. Filtra ${String(weakestTimingWindow.hour).padStart(2, "0")}:00 salvo excepción muy clara.`;
  const startBalance = Number(account?.model?.account?.balance || model.account?.balance || 0) - Number(model.totals?.pnl || 0);
  let runningRiskBalance = startBalance;
  let riskPeak = startBalance;
  let currentDrawdownAmount = 0;
  let currentDrawdownPct = 0;
  (model.trades || []).forEach((trade) => {
    runningRiskBalance += Number(trade.pnl || 0);
    riskPeak = Math.max(riskPeak, runningRiskBalance);
    currentDrawdownAmount = Math.max(0, riskPeak - runningRiskBalance);
    currentDrawdownPct = riskPeak ? (currentDrawdownAmount / riskPeak) * 100 : 0;
  });
  const maxDrawdownPct = Number(model.totals?.drawdown?.maxPct || 0);
  const riskProfile = model.riskProfile || {};
  const riskSummary = model.riskSummary || {};
  const maxDrawdownLimit = Number(account?.maxDrawdownLimit || model.account?.maxDrawdownLimit || 10);
  const currentRiskPct = Number(riskSummary.currentRiskPct || riskProfile.currentRiskPct || 0);
  const currentRiskUsd = Number(riskSummary.currentRiskUsd || 0);
  const maxTradeRiskPct = Number(riskProfile.maxTradeRiskPct || 1);
  const lossStreak = Number(model.streaks?.bestLoss || 0);
  const weeklyRows = Array.isArray(model.weekly) ? model.weekly : [];
  const tradedWeeklyRows = weeklyRows.filter((day) => Number(day.trades || 0) > 0);
  const averageTradesPerDay = tradedWeeklyRows.length
    ? tradedWeeklyRows.reduce((sum, day) => sum + Number(day.trades || 0), 0) / tradedWeeklyRows.length
    : 0;
  const peakTradesPerDay = tradedWeeklyRows.length
    ? Math.max(...tradedWeeklyRows.map((day) => Number(day.trades || 0)))
    : 0;
  const ddUsagePct = maxDrawdownLimit ? (maxDrawdownPct / maxDrawdownLimit) * 100 : 0;
  const currentDdUsagePct = maxDrawdownLimit ? (currentDrawdownPct / maxDrawdownLimit) * 100 : 0;
  const riskPerTradeUsagePct = maxTradeRiskPct ? (currentRiskPct / maxTradeRiskPct) * 100 : 0;
  const recentWinRate = (model.trades || []).slice(-10).filter((trade) => Number(trade.pnl || 0) > 0).length / Math.max(Math.min((model.trades || []).length, 10), 1) * 100;
  const overtradingLevel = peakTradesPerDay >= Math.max(8, averageTradesPerDay * 2.1)
    ? "critical"
    : peakTradesPerDay >= Math.max(6, averageTradesPerDay * 1.7)
      ? "warning"
      : "stable";
  const scalingLevel = riskPerTradeUsagePct >= 92 || currentRiskPct >= 1.2
    ? "critical"
    : riskPerTradeUsagePct >= 72 || currentRiskPct >= 0.9
      ? "warning"
      : "stable";
  const consistencyPressure = consistencyRatio < 52 || recentWinRate <= model.totals.winRate - 12 || stdDevPnl >= Math.max(Math.abs(model.totals.expectancy || 0) * 2.8, 650);
  const inconsistencyLevel = consistencyPressure
    ? (consistencyRatio < 42 || recentWinRate <= model.totals.winRate - 18 ? "critical" : "warning")
    : "stable";
  const pressureLevel = (lossStreak >= 5 || overtradingLevel === "critical" || scalingLevel === "critical" || inconsistencyLevel === "critical")
    ? "critical"
    : (lossStreak >= 3 || overtradingLevel === "warning" || scalingLevel === "warning" || inconsistencyLevel === "warning")
      ? "warning"
      : "stable";
  const riskSnapshot = account?.riskSnapshot && typeof account.riskSnapshot === "object"
    ? account.riskSnapshot
    : account?.dashboardPayload?.riskSnapshot && typeof account.dashboardPayload.riskSnapshot === "object"
      ? account.dashboardPayload.riskSnapshot
      : null;
  const riskHeroTone = riskAlerts.some((alert) => alert.tone === "error") || currentDdUsagePct >= 70 || lossStreak >= 6
    ? "critical"
    : riskAlerts.length || currentDdUsagePct >= 45 || lossStreak >= 4
      ? "warning"
      : "safe";
  const riskHeroTitle = riskHeroTone === "critical"
    ? "Pérdida de control"
    : riskHeroTone === "warning"
      ? "Control deteriorado"
      : "Control estable";
  const heroSignalTitle = lossStreak >= 4
    ? `${lossStreak} pérdidas seguidas`
    : inconsistencyLevel !== "stable"
      ? "Ejecución deteriorada"
      : scalingLevel !== "stable"
        ? "Riesgo por trade elevado"
        : overtradingLevel !== "stable"
          ? "Frecuencia fuera de plan"
          : "Control en proceso";
  const heroSignalNote = lossStreak >= 4
    ? "La secuencia reciente ya está afectando la siguiente decisión y exige cortar impulso."
    : inconsistencyLevel !== "stable"
      ? "La calidad de ejecución ya no está replicando el patrón limpio del mes."
      : scalingLevel !== "stable"
        ? "El tamaño por operación está por encima de la zona cómoda del plan."
        : overtradingLevel !== "stable"
          ? "La frecuencia está invadiendo la calidad y estrechando el margen del sistema."
          : "No hay una fricción dominante: el control sigue dentro del proceso.";
  const riskHeroContext = riskHeroTone === "critical"
    ? "El problema principal ya no es solo el resultado: es cómo está reaccionando la ejecución ante la presión."
    : riskHeroTone === "warning"
      ? "Todavía hay margen, pero el comportamiento reciente ya está deteriorando la calidad de las decisiones."
      : "La exposición sigue contenida y el comportamiento actual todavía sostiene el plan.";
  const riskBehaviorRows = [
    {
      title: "Racha de pérdidas",
      tone: lossStreak >= 5 ? "critical" : lossStreak >= 3 ? "warning" : "stable",
      status: lossStreak >= 5 ? "Presión alta" : lossStreak >= 3 ? "En aumento" : "Contenida",
      metric: `${lossStreak}`,
      metricSuffix: "seguidas",
      note: lossStreak >= 4
        ? "La secuencia negativa ya está condicionando el siguiente trade."
        : "La secuencia aún no domina el proceso operativo.",
      progress: Math.max(12, Math.min(100, (lossStreak / 6) * 100)),
      kind: "loss"
    },
    {
      title: "Presión operativa",
      tone: pressureLevel,
      status: pressureLevel === "critical" ? "Alta" : pressureLevel === "warning" ? "Latente" : "Baja",
      metric: `${currentRiskPct.toFixed(2)}% · ${peakTradesPerDay || 0} trades pico`,
      note: scalingLevel !== "stable"
        ? `El tamaño está forzando el plan: tope ${maxTradeRiskPct.toFixed(2)}% por operación.`
        : averageTradesPerDay
          ? `La frecuencia sube hasta ${peakTradesPerDay || 0} trades frente a ${averageTradesPerDay.toFixed(1)} de media.`
          : "La presión sigue dentro de la zona operativa normal.",
      progress: Math.max(12, Math.min(100, Math.max(riskPerTradeUsagePct || 0, averageTradesPerDay ? (peakTradesPerDay / Math.max(averageTradesPerDay * 2.1, 1)) * 100 : 0))),
      kind: "pressure"
    },
    {
      title: "Inconsistencia",
      tone: inconsistencyLevel,
      status: inconsistencyLevel === "critical" ? "Frágil" : inconsistencyLevel === "warning" ? "Irregular" : "Sólida",
      metric: `${Math.round(consistencyRatio)} / 100`,
      note: `WR reciente ${Math.round(recentWinRate)}% · dispersión diaria ${formatCompactSignedCurrency(stdDevPnl)}.`,
      progress: Math.max(12, Math.min(100, 100 - consistencyRatio)),
      kind: "consistency"
    }
  ];
  const dominantRiskIssue = riskBehaviorRows.find((row) => row.kind === "loss" && row.tone !== "stable")
    || riskBehaviorRows.find((row) => row.tone === "critical")
    || riskBehaviorRows.find((row) => row.tone === "warning")
    || riskBehaviorRows[0];
  const riskInsight = dominantRiskIssue.kind === "loss"
    ? "La racha actual está empujando a operar peor, no solo a perder más."
    : dominantRiskIssue.kind === "pressure"
      ? "La presión tras las pérdidas está subiendo el tamaño o la frecuencia fuera de plan."
      : "La ejecución reciente ya no replica el patrón limpio que sí aparece en el resto del mes.";
  const recommendedLossCut = dominantRiskIssue.kind === "loss" ? 2 : 3;
  const recommendedRiskPct = dominantRiskIssue.kind === "loss"
    ? Math.max(0.25, Math.min(currentRiskPct || 0.5, maxTradeRiskPct * 0.5))
    : dominantRiskIssue.kind === "pressure"
      ? Math.max(0.25, Math.min(currentRiskPct || maxTradeRiskPct || 0.5, maxTradeRiskPct * 0.75))
      : Math.max(0.25, currentRiskPct || 0.5);
  const recommendedTradeLimit = Math.max(2, Math.round(averageTradesPerDay || 2));
  const riskDecision = dominantRiskIssue.kind === "loss"
    ? `Hoy: baja a ${recommendedRiskPct.toFixed(2)}% por trade y corta la sesión tras ${recommendedLossCut} pérdidas.`
    : dominantRiskIssue.kind === "pressure"
      ? `Hoy: mantén ${recommendedRiskPct.toFixed(2)}% y no superes ${recommendedTradeLimit} trades de calidad.`
      : `Hoy: mantén ${recommendedRiskPct.toFixed(2)}% y toma solo setups de máxima claridad hasta estabilizar la ejecución.`;
  const riskProtection = resolveRiskProtectionMeta({
    account,
    riskProfile,
    riskSnapshot,
    hasSuggestedRules: Boolean(lossStreak || currentRiskPct || averageTradesPerDay)
  });
  const riskProtectionRules = [
    `Cortar sesión tras ${recommendedLossCut} pérdidas seguidas`,
    `Reducir riesgo a ${recommendedRiskPct.toFixed(2)}% por trade`,
    `Limitar a ${recommendedTradeLimit} trades de calidad`
  ];
  const riskMetricCards = [
    {
      label: "Drawdown actual",
      value: formatPercent(-currentDrawdownPct),
      noteLead: formatCurrency(-currentDrawdownAmount),
      noteTail: "desde el último pico",
      tone: currentDrawdownPct > 0 ? "negative" : "",
      noteTone: currentDrawdownPct >= 1 ? "negative" : currentDrawdownPct > 0 ? "warning" : "positive"
    },
    {
      label: "Racha actual",
      value: `${lossStreak}`,
      note: lossStreak >= 4
        ? `Presión alta · tope ${maxTradeRiskPct.toFixed(2)}% por trade`
        : "Todavía dentro de tolerancia",
      tone: lossStreak >= 4 ? "negative" : "",
      noteTone: lossStreak >= 4 ? "negative" : lossStreak >= 2 ? "warning" : "positive"
    }
  ];
  const riskAlertsLimited = riskAlertsMarkup(riskAlerts, 3);
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
    barChartSpec("analytics-hourly-pnl", hourlyRows.map((hour) => ({ label: `${String(hour.hour).padStart(2, "0")}:00`, value: hour.pnl, rawValue: hour.pnl })), {
      positiveNegative: true,
      solidBars: true,
      maxBarThickness: 40,
      barThickness: 34,
      categoryPercentage: 0.78,
      barPercentage: 0.9,
      xOffset: true,
      xTickPadding: 8,
      autoSkipXTicks: false,
      yTickPadding: 10,
      layoutPaddingLeft: 6,
      layoutPaddingRight: 6,
      layoutPaddingBottom: 2,
      axisColor: "rgba(182, 188, 196, 0.76)",
      axisFontSize: 10,
      axisFontWeight: "600",
      showYAxis: true,
      showXAxis: true,
      showAxisBorder: true,
      axisBorderColor: "rgba(255,255,255,0.10)",
      axisLineAlpha: 0.46,
      showYGrid: false,
      zeroDivider: true,
      zeroDividerAlpha: 0.18,
      zeroDividerWidth: 1,
      formatter: (value, context) => formatCurrency(context.raw.rawValue ?? value),
      axisFormatter: (value) => formatCompact(value),
      xAxisFormatter: (label, index, point) => (point?.rawValue || point?.value ? label : ""),
      tooltipTitleFormatter: (column) => column.point?.label || "",
      tooltipBodyFormatter: (column) => formatCurrency(column.point?.rawValue ?? column.value)
    }),
    barChartSpec("analytics-hourly-trades", hourlyRows.map((hour) => ({ label: `${String(hour.hour).padStart(2, "0")}:00`, value: hour.trades })), {
      tone: "neutral",
      solidBars: true,
      maxBarThickness: 40,
      barThickness: 34,
      categoryPercentage: 0.78,
      barPercentage: 0.9,
      xOffset: true,
      xTickPadding: 8,
      autoSkipXTicks: false,
      yTickPadding: 10,
      layoutPaddingLeft: 6,
      layoutPaddingRight: 6,
      layoutPaddingBottom: 2,
      axisColor: "rgba(182, 188, 196, 0.76)",
      axisFontSize: 10,
      axisFontWeight: "600",
      showYAxis: true,
      showXAxis: true,
      showAxisBorder: true,
      axisBorderColor: "rgba(255,255,255,0.10)",
      axisLineAlpha: 0.46,
      showYGrid: false,
      formatter: (value) => `${value} trades`,
      xAxisFormatter: (label, index, point) => (point?.value ? label : ""),
      tooltipTitleFormatter: (column) => column.point?.label || "",
      tooltipBodyFormatter: (column) => `${column.value} trades`
    }),
    barChartSpec("analytics-profit-distribution", denseProfitDistribution.map((bin) => ({ label: bin.label, value: bin.value, tone: bin.tone })), {
      solidBars: true,
      maxBarThickness: 34,
      barThickness: 30,
      categoryPercentage: 0.78,
      barPercentage: 0.9,
      xOffset: true,
      xTickPadding: 8,
      yTickPadding: 10,
      layoutPaddingLeft: 6,
      layoutPaddingRight: 6,
      layoutPaddingBottom: 2,
      axisColor: "rgba(182, 188, 196, 0.76)",
      axisFontSize: 10,
      axisFontWeight: "600",
      showYAxis: true,
      showXAxis: true,
      showAxisBorder: true,
      axisBorderColor: "rgba(255,255,255,0.10)",
      axisLineAlpha: 0.46,
      showYGrid: false,
      pointTone: (point) => point.tone || "green",
      formatter: (value, context) => `${context.label}: ${value} trades`,
      tooltipTitleFormatter: (column) => {
        const count = column.value;
        return count === 1 ? "1 trade en rango" : `${count} trades en rango`;
      },
      tooltipBodyFormatter: (column) => `${column.point?.label || ""}`
    })
  ];
  const adminTracePanel = renderAdminTracePanel(state, {
    title: "Análisis source of truth",
    subtitle: "Contrato operativo usado por las métricas técnicas.",
    items: [
      { label: "account_id", value: account?.id || activeAccountId || "" },
      { label: "payloadSource", value: authority.payloadSource || "" },
      { label: "sourceUsed", value: authority.sourceUsed || "" },
      { label: "trades", value: authority.tradeCount || model.totals?.totalTrades || 0 },
      { label: "history", value: authority.historyPoints || 0 },
      { label: "sessions", value: model.sessions?.length || 0 },
      { label: "symbols", value: model.symbols?.length || 0 },
      { label: "riskScore", value: model.totals?.riskScore ?? "" },
    ],
  });
  const edgeHealthLabel = model.totals.profitFactor >= 1.4 && model.totals.expectancy >= 0
    ? "Edge positivo, margen amplio"
    : model.totals.expectancy >= 0
      ? "Edge positivo, margen estrecho"
      : "Edge bajo presión";
  const edgeHealthNote = model.totals.profitFactor >= 1.4 && model.totals.expectancy >= 0
    ? `Profit factor ${model.totals.profitFactor.toFixed(2)} y expectancy ${formatCurrency(model.totals.expectancy)}.`
    : model.totals.expectancy >= 0
      ? `La distribución sigue positiva, pero el margen se estrecha.`
      : `La expectancy queda negativa en la muestra actual.`;
  const sessionContrastTitle = weakestSession.pnl < 0
    ? `${strongestSession.key} aporta más; ${weakestSession.key} concentra el mayor drenaje.`
    : `${strongestSession.key} aporta más; ${weakestSession.key} queda como menor contribución.`;
  const timingContrastTitle = `Contrasta ${String(bestHour.hour).padStart(2, "0")}:00 frente a ${String(worstHour.hour).padStart(2, "0")}:00 antes de sacar conclusiones.`;
  const totalTrades = Number(model.totals?.totalTrades || model.trades?.length || 0);
  const hasBasicPatternSample = totalTrades >= 8;
  const hasStrongPatternSample = totalTrades >= 20;
  const edgeCandidates = [
    { type: "sesión", name: strongestSession.key, pnl: Number(strongestSession.pnl || 0), trades: Number(strongestSession.trades || 0), winRate: strongestSession.winRate },
    { type: "símbolo", name: strongestSymbol.key, pnl: Number(strongestSymbol.pnl || 0), trades: Number(strongestSymbol.trades || 0), winRate: strongestSymbol.winRate },
    { type: "hora", name: `${String(bestHour.hour).padStart(2, "0")}:00`, pnl: Number(bestHour.pnl || 0), trades: Number(bestHour.trades || 0), winRate: null }
  ].filter((item) => item.trades > 0 && item.pnl > 0).sort((a, b) => b.pnl - a.pnl);
  const damageCandidates = [
    { type: "sesión", name: weakestSession.key, pnl: Number(weakestSession.pnl || 0), trades: Number(weakestSession.trades || 0), winRate: weakestSession.winRate },
    { type: "símbolo", name: weakestSymbol.key, pnl: Number(weakestSymbol.pnl || 0), trades: Number(weakestSymbol.trades || 0), winRate: weakestSymbol.winRate },
    { type: "hora", name: `${String(worstHour.hour).padStart(2, "0")}:00`, pnl: Number(worstHour.pnl || 0), trades: Number(worstHour.trades || 0), winRate: null }
  ].filter((item) => item.trades > 0 && item.pnl < 0).sort((a, b) => a.pnl - b.pnl);
  const edgeDriver = edgeCandidates[0] || null;
  const damageDriver = damageCandidates[0] || null;
  const variablePressure = [
    {
      label: "La sesión",
      name: Math.abs(Number(strongestSession.pnl || 0)) >= Math.abs(Number(weakestSession.pnl || 0)) ? strongestSession.key : weakestSession.key,
      value: Math.max(Math.abs(Number(strongestSession.pnl || 0)), Math.abs(Number(weakestSession.pnl || 0)))
    },
    {
      label: "El símbolo",
      name: Math.abs(Number(strongestSymbol.pnl || 0)) >= Math.abs(Number(weakestSymbol.pnl || 0)) ? strongestSymbol.key : weakestSymbol.key,
      value: Math.max(Math.abs(Number(strongestSymbol.pnl || 0)), Math.abs(Number(weakestSymbol.pnl || 0)))
    },
    {
      label: "La hora",
      name: Math.abs(Number(bestHour.pnl || 0)) >= Math.abs(Number(worstHour.pnl || 0)) ? `${String(bestHour.hour).padStart(2, "0")}:00` : `${String(worstHour.hour).padStart(2, "0")}:00`,
      value: Math.max(Math.abs(Number(bestHour.pnl || 0)), Math.abs(Number(worstHour.pnl || 0)))
    }
  ].sort((a, b) => b.value - a.value);
  const dominantVariable = variablePressure[0];
  const secondVariable = variablePressure[1];
  const hasDominantVariable = hasStrongPatternSample && dominantVariable?.value > 0 && dominantVariable.value >= (secondVariable?.value || 0) * 1.18;
  const formatSignedCurrency = (value) => Number(value || 0) > 0 ? `+${formatCurrency(value)}` : formatCurrency(value);
  const formatUnsignedPercent = (value) => formatPercent(value).replace(/^\+/, "");
  const formatDominantVariableLabel = (label = "") => {
    const normalized = label.replace(/^(La|El)\s+/i, "");
    return `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)} dominante`;
  };
  const patternInsights = [
    edgeDriver && hasBasicPatternSample ? {
      label: "EDGE",
      tone: "positive",
      value: edgeDriver.name,
      meta: formatSignedCurrency(edgeDriver.pnl),
      metaTone: "positive",
      secondary: edgeDriver.winRate != null
        ? `${formatTradeCount(edgeDriver.trades)}<br>WR ${formatUnsignedPercent(edgeDriver.winRate)}`
        : formatTradeCount(edgeDriver.trades)
    } : {
      label: "MUESTRA",
      tone: "warning",
      value: "Sin edge claro",
      meta: formatTradeCount(totalTrades),
      secondary: "Falta repetición para confirmar patrón"
    },
    damageDriver ? {
      label: "DAÑO",
      tone: "negative",
      value: damageDriver.name,
      meta: formatSignedCurrency(damageDriver.pnl),
      metaTone: "negative",
      secondary: damageDriver.winRate != null
        ? `${formatTradeCount(damageDriver.trades)}<br>WR ${formatUnsignedPercent(damageDriver.winRate)}`
        : formatTradeCount(damageDriver.trades)
    } : {
      label: "DAÑO",
      tone: "neutral",
      value: "Sin drenaje único",
      meta: formatTradeCount(totalTrades),
      secondary: "La pérdida no se concentra en una sola variable"
    },
    hasDominantVariable ? {
      label: "PATRÓN",
      tone: "neutral",
      value: formatDominantVariableLabel(dominantVariable.label),
      meta: `Mayor impacto: ${dominantVariable.name}`,
      secondary: `Impacto ${formatSignedCurrency(dominantVariable.value)}`
    } : {
      label: "PATRÓN",
      tone: "neutral",
      value: "Resultado repartido",
      meta: hasStrongPatternSample ? "Sin dominio claro" : "Muestra limitada",
      secondary: `${formatTradeCount(totalTrades)} en la lectura actual`
    },
    totalTrades < 20 ? {
      label: "MUESTRA",
      tone: "warning",
      value: formatTradeCount(totalTrades),
      meta: "Muestra todavía corta",
      secondary: "Necesita más repetición"
    } : {
      label: "MUESTRA",
      tone: "neutral",
      value: formatTradeCount(totalTrades),
      meta: "Muestra suficiente",
      secondary: "Contraste por sesión, símbolo y hora"
    },
    {
      label: "REVISIÓN",
      tone: damageDriver ? "negative" : "neutral",
      value: damageDriver ? `Mayor daño: ${damageDriver.name}` : "Evidencia parcial",
      meta: damageDriver ? "Mayor daño de la muestra" : "Evidencia todavía parcial",
      secondary: damageDriver ? `${formatSignedCurrency(damageDriver.pnl)}<br>${formatTradeCount(damageDriver.trades)}` : formatTradeCount(totalTrades),
      secondaryTone: damageDriver ? "negative" : ""
    }
  ].slice(0, 5);
  const patternInsightsMarkup = patternInsights.map((item) => `
    <article class="insights-pattern-kpi insights-pattern-kpi--${item.tone}">
      <span class="insights-pattern-kpi__label">${item.label}</span>
      <strong class="insights-pattern-kpi__value">${item.value}</strong>
      <span class="insights-pattern-kpi__meta ${item.metaTone ? `insights-pattern-kpi__meta--${item.metaTone}` : ""}">${item.meta}</span>
      <small class="insights-pattern-kpi__secondary ${item.secondaryTone ? `insights-pattern-kpi__secondary--${item.secondaryTone}` : ""}">${item.secondary}</small>
    </article>
  `).join("");
  const summaryReviewTitle = summaryDrain.value;
  const summaryReviewMeta = "hora que más resta P&L";
  const distributionMain = model.totals.expectancy >= 0 ? "Edge positivo" : "Edge bajo presión";
  const distributionSecondary = model.totals.expectancy >= 0 && model.totals.profitFactor < 1.4
    ? "Margen todavía estrecho"
    : model.totals.expectancy >= 0
      ? "Distribución favorable"
      : "Expectancy negativa en la muestra";
  const distributionTradeTotal = winningTrades.length + losingTrades.length;
  const distributionWinRateValue = formatUnsignedPercent(model.totals.winRate);
  const distributionGaugeScore = clampPercent(model.totals.winRate);
  const distributionNote = model.totals.expectancy >= 0
    ? "Distribución positiva, pero con margen todavía estrecho."
    : "Distribución negativa en la muestra actual.";
  const concentrationCards = [
    {
      label: "SESIÓN",
      value: strongestSession.key,
      meta: `P&L ${formatSignedCurrency(strongestSession.pnl)}`,
      metaTone: strongestSession.pnl >= 0 ? "positive" : "negative",
      secondary: weakestSession?.key
        ? `WR ${formatUnsignedPercent(strongestSession.winRate)}. Mayor drenaje: ${weakestSession.key} ${formatSignedCurrency(weakestSession.pnl)}`
        : `WR ${formatUnsignedPercent(strongestSession.winRate)}`
    },
    {
      label: "SÍMBOLO",
      value: strongestSymbol.key,
      meta: `P&L ${formatSignedCurrency(strongestSymbol.pnl)}`,
      metaTone: strongestSymbol.pnl >= 0 ? "positive" : "negative",
      secondary: weakestSymbol?.key
        ? `${formatTradeCount(strongestSymbol.trades)}. Mayor drenaje: ${weakestSymbol.key} ${formatSignedCurrency(weakestSymbol.pnl)}`
        : formatTradeCount(strongestSymbol.trades)
    },
    {
      label: "HORARIO",
      value: `${String(bestHour.hour).padStart(2, "0")}:00`,
      meta: `P&L ${formatSignedCurrency(bestHour.pnl)}`,
      metaTone: bestHour.pnl >= 0 ? "positive" : "negative",
      secondary: `${formatTradeCount(bestHour.trades)}. ${String(worstHour.hour).padStart(2, "0")}:00 resta ${formatSignedCurrency(worstHour.pnl)}`
    },
    {
      label: "DISTRIBUCIÓN",
      value: distributionMain,
      meta: `PF ${model.totals.profitFactor.toFixed(2)}`,
      secondary: distributionSecondary
    }
  ];
  const concentrationCardsMarkup = concentrationCards.map((item) => `
    <article class="insights-variable-card">
      <span class="insights-variable-card__label">${item.label}</span>
      <strong class="insights-variable-card__value">${item.value}</strong>
      <span class="insights-variable-card__meta ${item.metaTone ? `insights-variable-card__meta--${item.metaTone}` : ""}">${item.meta}</span>
      <small class="insights-variable-card__secondary">${item.secondary}</small>
    </article>
  `).join("");
  root.innerHTML = `
    <section class="analytics-panel ${state.ui.analyticsTab === "summary" ? "active" : ""}" data-tab="summary">
      <div class="analytics-overview-shell">
        ${adminTracePanel}
        <section class="insights-patterns" aria-labelledby="insights-patterns-title">
          <header class="insights-patterns__header">
            <div>
              <div class="insights-patterns__eyebrow">QUÉ SE REPITE</div>
              <h3 id="insights-patterns-title" class="insights-patterns__title">Patrones detectados</h3>
              <p class="insights-patterns__description">Variables que aparecen de forma repetida en la muestra actual.</p>
            </div>
          </header>
          <div class="insights-patterns__grid">
            ${patternInsightsMarkup}
          </div>
        </section>
        <article class="tl-section-card analytics-overview-hero insights-summary insights-concentration">
          <div class="analytics-overview-hero__stack insights-summary__stack">
            <div class="analytics-overview-copy insights-summary__header">
              <div class="analytics-overview-kicker insights-summary__eyebrow">DÓNDE SE CONCENTRA</div>
              <h3 class="analytics-overview-title insights-summary__title">Dónde se concentra el resultado</h3>
              <p class="analytics-overview-subtitle insights-summary__description">Sesión, símbolo, horario y distribución que más pesan en la muestra actual.</p>
            </div>
            <div class="insights-concentration__grid">
              ${concentrationCardsMarkup}
            </div>
            <div class="insights-concentration__review">
              <span class="insights-concentration__review-label">Horario a revisar</span>
              <strong>${summaryReviewTitle}</strong>
              <small>
                <span class="analytics-value-${summaryDrain.noteTone}">${summaryDrain.noteLead}</span>
                <span>${summaryReviewMeta}</span>
              </small>
            </div>
          </div>
        </article>

        <div class="analytics-pattern-grid">
          <article class="tl-section-card analytics-pattern-card insights-session">
            <div class="tl-section-header insights-evidence__header">
              <div>
                <div class="tl-section-title">Rendimiento por sesión</div>
                <div class="row-sub">Comparativa de P&amp;L, muestra y win rate por sesión.</div>
              </div>
            </div>
            <div class="analytics-session-chart">
              ${sessionRowsMarkup}
            </div>
            <div class="analytics-pattern-footer analytics-pattern-footer--three">
              <div class="analytics-pattern-footer__item">
                <span>Mayor contribución</span>
                <strong>${strongestSession.key}</strong>
                <small class="analytics-value-${strongestSession.pnl >= 0 ? "positive" : "negative"}">${formatCurrency(strongestSession.pnl)}<br>${formatTradeCount(strongestSession.trades)}</small>
              </div>
              <div class="analytics-pattern-footer__item">
                <span>${weakestSession.pnl < 0 ? "Mayor drenaje" : "Menor contribución"}</span>
                <strong>${weakestSession.key}</strong>
                <small class="analytics-value-${weakestSession.pnl >= 0 ? "positive" : "negative"}">${formatCurrency(weakestSession.pnl)}<br>${formatTradeCount(weakestSession.trades)}</small>
              </div>
              <div class="analytics-pattern-footer__item">
                <span>Contraste principal</span>
                <strong>${sessionContrastTitle}</strong>
                <small>${formatPercent(strongestSession.winRate)} WR frente a ${formatPercent(weakestSession.winRate)} WR.</small>
              </div>
            </div>
          </article>

          <article class="tl-section-card analytics-pattern-card insights-symbol">
            <div class="tl-section-header insights-evidence__header">
              <div>
                <div class="tl-section-title">Rendimiento por símbolo</div>
                <div class="row-sub">Instrumentos con mayor contribución y mayor drenaje en la muestra.</div>
              </div>
            </div>
            <div class="analytics-symbol-stack">
              ${symbolRowsMarkup}
            </div>
          </article>
        </div>

        <div class="analytics-pattern-grid analytics-pattern-grid--timing">
          <article class="tl-section-card analytics-pattern-card analytics-pattern-card--timing insights-timing">
            <div class="tl-section-header insights-evidence__header">
              <div>
                <div class="tl-section-title">Timing y ventana operativa</div>
                <div class="row-sub">Franjas horarias que más aportan o restan en la muestra.</div>
              </div>
            </div>
            <div class="analytics-timing-list">
              ${timingRowsMarkup}
            </div>
            <div class="analytics-pattern-footer analytics-pattern-footer--single">
              <div class="analytics-pattern-footer__item">
                <span>Contraste horario</span>
                <strong>${timingContrastTitle}</strong>
                <small>${formatTradeCount(activeHour.trades)} pasan por la franja más activa.</small>
              </div>
            </div>
          </article>

          <article class="tl-section-card analytics-pattern-card analytics-pattern-card--distribution insights-distribution">
            <div class="tl-section-header insights-evidence__header">
              <div>
                <div class="tl-section-title">Distribución win/loss</div>
                <div class="row-sub">Relación entre aciertos, profit factor y expectativa.</div>
              </div>
            </div>
            <div class="insights-distribution__body">
              <div class="insights-distribution__layout">
                <div class="insights-distribution-gauge" style="--distribution-score:${distributionGaugeScore.toFixed(2)};" role="img" aria-label="Win rate ${distributionWinRateValue}">
                  <div class="insights-distribution-gauge__inner">
                    <strong>${distributionWinRateValue}</strong>
                    <span>Win rate</span>
                  </div>
                </div>
                <div class="insights-distribution__read">
                  <div class="insights-distribution__headline">${edgeHealthLabel}</div>
                  <p>${edgeHealthNote}</p>
                  <div class="insights-distribution__metrics">
                    <div class="insights-distribution__metric">
                      <span>PF</span>
                      <strong>${model.totals.profitFactor.toFixed(2)}</strong>
                    </div>
                    <div class="insights-distribution__metric">
                      <span>Expectancy</span>
                      <strong class="${model.totals.expectancy >= 0 ? "metric-positive" : "metric-negative"}">${formatCurrency(model.totals.expectancy)}</strong>
                    </div>
                    <div class="insights-distribution__metric">
                      <span>Muestra</span>
                      <strong>${formatTradeCount(distributionTradeTotal)}</strong>
                    </div>
                  </div>
                </div>
              </div>
              <div class="insights-distribution__note">${distributionNote}</div>
            </div>
          </article>
        </div>
      </div>
    </section>

    <section class="analytics-panel ${state.ui.analyticsTab === "daily" ? "active" : ""}" data-tab="daily">
      ${dailyReviewMarkup}
      <div class="analytics-daily-layout">
        <section class="tl-section-card calendar-month-panel analytics-daily-calendar">
          <div class="calendar-month-panel__head analytics-daily-calendar__head">
            <div>
              <div class="tl-section-title">Mapa diario</div>
              <div class="row-sub">Resultado y actividad diaria del mes seleccionado.</div>
            </div>
            <div class="calendar-month-nav" aria-label="Selector de mes del diario">
              <button class="calendar-month-nav__btn" type="button" data-analytics-daily-shift="-1" ${analyticsDailyMonthIndex <= 0 ? "disabled" : ""}>‹</button>
              <div class="calendar-month-nav__label">
                <strong>${analyticsDayView.label}</strong>
                <span>${monthDayStats.filter((day) => day.trades > 0).length} días operados</span>
              </div>
              <button class="calendar-month-nav__btn" type="button" data-analytics-daily-shift="1" ${analyticsDailyMonthIndex >= analyticsMonths.length - 1 ? "disabled" : ""}>›</button>
            </div>
          </div>
          <div class="calendar-month-grid">
            ${ANALYTICS_CALENDAR_HEADERS.map((header) => `<div class="calendar-month-grid__head">${header}</div>`).join("")}
            ${analyticsDayView.cells.map((cell) => {
              const classes = [
                "calendar-day",
                cell.inMonth ? "is-current-month" : "is-outside-month",
                cell.trades ? "has-trades" : "is-idle",
                keyDaySet.has(cell.key) ? "is-key-day" : "",
                cell.state === "win" ? "is-win" : "",
                cell.state === "loss" ? "is-loss" : "",
                cell.isToday ? "is-today" : "",
                selectedDayKey === cell.key ? "is-selected" : ""
              ].filter(Boolean).join(" ");
              const tradesLabel = cell.trades === 1 ? "1 trade" : `${cell.trades} trades`;
              return `
                <button class="${classes}" type="button" ${cell.trades ? `data-analytics-day="${cell.key}"` : "disabled"}>
                  <div class="calendar-day__top">
                    <span class="calendar-day__date">${cell.date.getDate()}</span>
                  </div>
                  <div class="calendar-day__body">
                    ${cell.trades
                      ? `<div class="calendar-day__pnl ${cell.pnl >= 0 ? "metric-positive" : "metric-negative"}">${formatCurrency(cell.pnl)}</div>
                         <div class="calendar-day__meta">${tradesLabel}</div>`
                      : `<div class="calendar-day__meta">${cell.inMonth ? "Sin op." : "—"}</div>`}
                  </div>
                </button>
              `;
            }).join("")}
          </div>
        </section>

        <aside class="analytics-daily-side">
          <article class="tl-section-card analytics-daily-card">
            <div class="tl-section-header">
              <div>
                <div class="tl-section-title">Días clave</div>
              <div class="row-sub">Días con mayor impacto real sobre el resultado.</div>
              </div>
            </div>
            <div class="analytics-key-days">
              ${keyDays.map((day, index) => `
                <button class="analytics-key-day ${index === 0 ? "analytics-key-day--lead" : ""} ${selectedDayKey === day.key ? "is-active" : ""}" type="button" data-analytics-day="${day.key}">
                  <span class="analytics-key-day__date">${new Date(day.key).toLocaleDateString("es-ES", { day: "2-digit", month: "short" })}</span>
                  <strong class="${day.pnl >= 0 ? "metric-positive" : "metric-negative"}">${formatCurrency(day.pnl)}</strong>
                  <span class="analytics-key-day__reason">${day.reviewLabel}</span>
                  <small>${day.behavior}</small>
                </button>
              `).join("")}
            </div>
          </article>

          <article class="tl-section-card analytics-daily-card">
            <div class="tl-section-header">
              <div>
                <div class="tl-section-title">Lectura del mes</div>
                <div class="row-sub">Señales de comportamiento que se repiten en los cierres del periodo.</div>
              </div>
            </div>
              <ul class="analytics-daily-bullets">
                ${dailyReadBullets.map((item, index) => `<li class="${index === 0 ? "is-lead" : ""}">${item}</li>`).join("")}
              </ul>
            </article>

            <article class="tl-section-card analytics-daily-card analytics-daily-card--confidence">
              <div class="tl-section-header">
                <div>
                  <div class="tl-section-title">Fiabilidad del patrón</div>
                  <div class="row-sub">Qué tan repetible parece la lectura del mes.</div>
                </div>
              </div>
              <div class="analytics-daily-confidence analytics-daily-confidence--${confidenceLevel}">
                <span class="analytics-daily-confidence__level">${confidenceLevelLabel}</span>
                <strong>${confidenceHeadline}</strong>
                <p>${confidenceNote}</p>
              </div>
            </article>

            <article class="tl-section-card analytics-daily-card analytics-daily-card--detail ${selectedDay ? "is-active" : ""}">
              <div class="tl-section-header">
                <div>
                  <div class="tl-section-title">Día seleccionado</div>
                <div class="row-sub">${selectedDay ? `Detalle rápido del ${new Date(selectedDay.key).toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" })}.` : "Detalle rápido del día marcado en el mapa."}</div>
              </div>
            </div>
            ${selectedDay ? `
              <div class="analytics-daily-detail">
                <div class="analytics-daily-detail__pnl ${selectedDay.pnl >= 0 ? "metric-positive" : "metric-negative"}">${formatCurrency(selectedDay.pnl)}</div>
                <div class="analytics-daily-detail__grid">
                  <div><span>Trades</span><strong>${selectedDay.trades}</strong></div>
                  <div><span>Sesión principal</span><strong>${selectedDaySession}</strong></div>
                  <div><span>Símbolo dominante</span><strong>${selectedDaySymbol}</strong></div>
                </div>
                <p class="analytics-daily-detail__note">${selectedDayBehavior}</p>
              </div>
            ` : `<p class="analytics-daily-detail__empty">Todavía no hay un día seleccionado con actividad.</p>`}
          </article>
        </aside>
      </div>
    </section>

    <section class="analytics-panel ${state.ui.analyticsTab === "hourly" ? "active" : ""}" data-tab="hourly">
      <div class="analytics-hour-layout">
        <article class="tl-section-card analytics-hour-hero">
          <div class="analytics-hour-hero__copy">
            <div class="analytics-overview-kicker">Ventana óptima</div>
            <h3 class="analytics-overview-title">${bestWindowLabel} es donde el sistema sostiene mejor el edge temporal.</h3>
            <p class="analytics-overview-subtitle"><span class="${bestWindow.pnl >= 0 ? "analytics-value-positive" : "analytics-value-negative"}">${formatCompactSignedCurrency(bestWindow.pnl)}</span> en ${formatTradeCount(bestWindow.trades)}. Fuera de esa ventana, la calidad cae especialmente al llegar a ${formatHourLabel(weakestTimingWindow.hour)}.</p>
          </div>
          <div class="analytics-hour-hero__stats">
            <div class="analytics-hour-stat">
              <span>Mejor franja</span>
              <strong>${formatHourLabel(bestHour.hour)}</strong>
              <small class="analytics-value-positive">${formatHourlyValue(bestHour.pnl)}</small>
            </div>
            <div class="analytics-hour-stat">
              <span>Franja a vigilar</span>
              <strong>${formatHourLabel(weakestTimingWindow.hour)}</strong>
              <small class="analytics-value-negative">${formatHourlyValue(weakestTimingWindow.pnl)}</small>
            </div>
          </div>
        </article>

        <article class="tl-section-card analytics-hour-timeline-card">
          <div class="tl-section-header">
            <div>
              <div class="tl-section-title">Overview temporal</div>
              <div class="row-sub">Lectura visual rápida de actividad, continuidad y fricción horaria.</div>
            </div>
            <div class="analytics-hour-toggle" role="tablist" aria-label="Unidad de valor para hora">
              <button class="analytics-hour-toggle__btn ${analyticsHourValueMode === "currency" ? "is-active" : ""}" type="button" data-analytics-hour-mode="currency">$</button>
              <button class="analytics-hour-toggle__btn ${analyticsHourValueMode === "percent" ? "is-active" : ""}" type="button" data-analytics-hour-mode="percent">%</button>
            </div>
          </div>
          <div class="analytics-hour-overview">
            ${hourOverviewMarkup}
          </div>
          <div class="analytics-hour-detail-shell">
            <div class="analytics-hour-detail-shell__head">
              <div class="tl-section-title">Detalle operativo</div>
              <div class="row-sub">Las horas que merecen foco o recorte dentro de la sesión.</div>
            </div>
            <div class="analytics-hour-detail-list">
              ${hourDetailRowsMarkup}
            </div>
          </div>
        </article>

        <div class="analytics-hour-insight-grid">
          <article class="tl-section-card analytics-hour-copy-card">
            <div class="tl-section-header">
              <div>
                <div class="tl-section-title">Insight</div>
              </div>
            </div>
            <div class="analytics-hour-insights">
              <p class="is-lead">${hourInsight}</p>
            </div>
          </article>
          <article class="tl-section-card analytics-hour-copy-card analytics-hour-copy-card--decision">
            <div class="tl-section-header">
              <div>
                <div class="tl-section-title">Decisión</div>
              </div>
            </div>
            <div class="analytics-hour-decision">
              <strong>${shortHourDecision}</strong>
            </div>
          </article>
        </div>
      </div>
    </section>

    <section class="analytics-panel ${state.ui.analyticsTab === "risk" ? "active" : ""}" data-tab="risk">
      <div class="analytics-risk-layout">
        <article class="tl-section-card analytics-risk-hero analytics-risk-hero--${riskHeroTone}">
          <div class="analytics-risk-hero__copy">
            <div class="eyebrow">Estado de control</div>
            <h3>${riskHeroTitle}</h3>
            <p>${riskHeroContext}</p>
            ${riskAlerts.length ? `<div class="analytics-risk-hero__alerts">${riskAlertsLimited}</div>` : ""}
          </div>
          <div class="analytics-risk-hero__signal ${lossStreak >= 4 ? "is-loss-streak" : ""}">
            <span class="analytics-risk-hero__signal-label">Señal dominante</span>
            <strong class="${lossStreak >= 4 || dominantRiskIssue.tone === "critical" ? "metric-negative" : dominantRiskIssue.tone === "warning" ? "text-warning" : ""}">${heroSignalTitle}</strong>
            <small>${heroSignalNote}</small>
          </div>
        </article>

        <div class="analytics-risk-kpis">
          ${riskMetricCards.map((item) => `
            <article class="tl-section-card analytics-risk-kpi">
              <span class="analytics-risk-kpi__label">${item.label}</span>
              <strong class="analytics-risk-kpi__value ${item.tone === "negative" ? "metric-negative" : ""}">${item.value}</strong>
              <small class="analytics-risk-kpi__note">${item.noteLead ? `<span class="analytics-risk-kpi__note-value analytics-risk-kpi__note-value--${item.noteTone || "neutral"}">${item.noteLead}</span>${item.noteTail ? ` ${item.noteTail}` : ""}` : item.note}</small>
            </article>
          `).join("")}
        </div>

        <div class="analytics-risk-grid">
          <article class="tl-section-card analytics-risk-behavior">
            <div class="tl-section-header">
              <div>
                <div class="tl-section-title">Qué está rompiendo el control</div>
                <div class="row-sub">Problema principal, causa operativa y presión actual</div>
              </div>
            </div>
            <div class="analytics-risk-behavior__list">
              ${riskBehaviorRows.map((row) => `
                <div class="analytics-risk-behavior-row analytics-risk-behavior-row--${row.tone} ${row.kind === dominantRiskIssue.kind ? "is-dominant" : ""}">
                  <div class="analytics-risk-behavior-row__copy">
                    <strong>${row.title}</strong>
                    <span>${row.note}</span>
                  </div>
                  <div class="analytics-risk-behavior-row__metric">
                    <strong>${row.metric}${row.metricSuffix ? ` <span>${row.metricSuffix}</span>` : ""}</strong>
                    <small>${row.status}</small>
                  </div>
                  <div class="analytics-risk-behavior-row__track" aria-hidden="true">
                    <span style="width:${row.progress}%"></span>
                  </div>
                </div>
              `).join("")}
            </div>
          </article>

          <div class="analytics-risk-side">
            <article class="tl-section-card analytics-risk-copy-card">
              <div class="tl-section-header">
                <div>
                  <div class="tl-section-title">Insight</div>
                </div>
              </div>
              <p>${riskInsight}</p>
            </article>
            <article class="tl-section-card analytics-risk-copy-card analytics-risk-copy-card--decision">
              <div class="tl-section-header">
                <div>
                  <div class="tl-section-title">Decisión</div>
                </div>
              </div>
              <div class="analytics-risk-decision">
                <strong>${riskDecision}</strong>
                <div class="analytics-risk-engine">
                <div class="analytics-risk-engine__meta">
                  <span class="analytics-risk-engine__state analytics-risk-engine__state--${riskProtection.tone}">${riskProtection.state}</span>
                  <small>${riskProtection.note}</small>
                </div>
                <div class="analytics-risk-engine__rules-header">
                  <span>Protección</span>
                  <em>${riskProtection.rulesState}</em>
                </div>
                <ul class="analytics-risk-engine__rules">
                  ${riskProtectionRules.map((rule) => `
                      <li>
                        <strong>${rule}</strong>
                      </li>
                    `).join("")}
                </ul>
                  <div class="analytics-risk-engine__footer">
                    <small>Risk Engine ejecuta localmente solo cuando el motor está conectado y la política ha sido aplicada por el EA.</small>
                    <button class="btn-primary btn-inline analytics-risk-engine__action" type="button" data-analytics-risk-engine-action="true">${riskProtection.actionLabel}</button>
                  </div>
                </div>
              </div>
            </article>
          </div>
        </div>
      </div>
    </section>
  `;

  root.querySelectorAll("[data-analytics-daily-shift]").forEach((button) => {
    button.addEventListener("click", () => {
      const offset = Number(button.dataset.analyticsDailyShift);
      const nextKey = shiftMonthKey(analyticsMonths, analyticsDailyMonthKey, offset);
      if (!nextKey) return;
      root.__analyticsDailyMonthKey = nextKey;
      root.__analyticsDailySelectedDay = "";
      renderAnalytics(root, state);
    });
  });

  root.querySelectorAll("[data-analytics-day]").forEach((button) => {
    button.addEventListener("click", () => {
      root.__analyticsDailySelectedDay = button.dataset.analyticsDay || "";
      renderAnalytics(root, state);
    });
  });

  root.querySelectorAll("[data-analytics-hour-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextMode = button.dataset.analyticsHourMode;
      if (!nextMode || nextMode === root.__analyticsHourValueMode) return;
      root.__analyticsHourValueMode = nextMode;
      renderAnalytics(root, state);
    });
  });

  root.querySelectorAll("[data-analytics-risk-engine-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const riskNavButton = document.querySelector('.nav-item[data-page="risk"]');
      if (riskNavButton instanceof HTMLButtonElement) {
        riskNavButton.click();
      }
    });
  });

  mountCharts(root, chartSpecs);

  attachArcInteractions(root);
}
