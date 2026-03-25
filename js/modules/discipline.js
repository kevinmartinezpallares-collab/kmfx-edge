import { formatCurrency, formatPercent, selectCurrentModel } from "./utils.js";
import { barChartSpec, chartCanvas, mountCharts } from "./chart-system.js";

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function currentLossStreak(trades = []) {
  let streak = 0;
  for (let index = trades.length - 1; index >= 0; index -= 1) {
    if ((trades[index]?.pnl || 0) < 0) {
      streak += 1;
      continue;
    }
    break;
  }
  return streak;
}

function avgR(trades = []) {
  if (!trades.length) return 0;
  return trades.reduce((sum, trade) => sum + (trade.rMultiple || 0), 0) / trades.length;
}

function winLossRatio(trades = []) {
  const wins = trades.filter((trade) => (trade.pnl || 0) > 0).length;
  const losses = trades.filter((trade) => (trade.pnl || 0) < 0).length;
  if (!losses) return wins;
  return wins / losses;
}

function tradesPerDay(model) {
  const activeDays = model.dailyReturns?.length || 0;
  if (!activeDays) return 0;
  return model.totals.totalTrades / activeDays;
}

function hourlyBehavior(model) {
  const rows = (model.hours || []).filter((hour) => hour.trades > 0);
  const peak = [...rows].sort((a, b) => b.trades - a.trades)[0] || { hour: 0, trades: 0, pnl: 0 };
  return {
    rows,
    peak,
    concentration: model.totals.totalTrades ? (peak.trades / model.totals.totalTrades) * 100 : 0
  };
}

function activeDayConsistency(model) {
  const activeDays = model.dailyReturns?.length || 0;
  const greenDays = model.weekdays?.filter((day) => day.pnl > 0).length || 0;
  if (!activeDays) return 0;
  return (greenDays / activeDays) * 100;
}

function buildDisciplineScore(model) {
  const scoreWinRate = clamp(model.totals.winRate);
  const scoreProfitFactor = clamp((Math.min(model.totals.profitFactor || 0, 3) / 3) * 100);
  const scoreDrawdown = clamp(100 - ((model.totals.drawdown.maxPct || 0) * 8));
  const scoreAvgR = clamp((Math.max(avgR(model.trades), 0) / 2) * 100);
  const total = Math.round(
    (scoreWinRate * 0.35)
    + (scoreProfitFactor * 0.25)
    + (scoreDrawdown * 0.20)
    + (scoreAvgR * 0.20)
  );

  return {
    total,
    parts: [
      { label: "Win rate", score: Math.round(scoreWinRate), note: formatPercent(model.totals.winRate) },
      { label: "Profit Factor", score: Math.round(scoreProfitFactor), note: model.totals.profitFactor.toFixed(2) },
      { label: "Max DD", score: Math.round(scoreDrawdown), note: formatPercent(model.totals.drawdown.maxPct) },
      { label: "Avg R", score: Math.round(scoreAvgR), note: `${avgR(model.trades).toFixed(2)}R` }
    ]
  };
}

export function renderDiscipline(root, state) {
  const model = selectCurrentModel(state);
  if (!model) {
    root.innerHTML = "";
    return;
  }

  const avgRValue = avgR(model.trades);
  const currentLosses = currentLossStreak(model.trades);
  const wlRatio = winLossRatio(model.trades);
  const tradesDay = tradesPerDay(model);
  const hourly = hourlyBehavior(model);
  const avgLossValue = model.totals.avgLoss || 0;
  const discipline = buildDisciplineScore(model);
  const lossConcentration = clamp(((currentLosses * Math.abs(avgLossValue)) / Math.max(Math.abs(model.totals.worstTrade || avgLossValue || 1), 1)) * 36, 0, 100);
  const behaviorConsistency = activeDayConsistency(model);
  const peakHourLabel = `${String(hourly.peak.hour).padStart(2, "0")}:00`;

  root.innerHTML = `
    <div class="tl-page-header">
      <div class="tl-page-title">Disciplina</div>
      <div class="tl-page-sub">¿Estás operando con disciplina o alejándote de tu sistema?</div>
    </div>

    <div class="discipline-page-stack">
      <div class="tl-kpi-row discipline-kpi-row">
        <article class="tl-kpi-card discipline-kpi-card discipline-kpi-card--score">
          <div class="tl-kpi-label">KMFX Discipline Score</div>
          <div class="tl-kpi-val">${discipline.total}</div>
          <div class="row-sub">Lectura agregada de disciplina operativa</div>
        </article>
        <article class="tl-kpi-card discipline-kpi-card">
          <div class="tl-kpi-label">Win rate</div>
          <div class="tl-kpi-val">${Math.round(model.totals.winRate)}%</div>
          <div class="row-sub">Tasa de acierto global</div>
        </article>
        <article class="tl-kpi-card discipline-kpi-card">
          <div class="tl-kpi-label">Avg R</div>
          <div class="tl-kpi-val">${avgRValue.toFixed(2)}R</div>
          <div class="row-sub">Promedio por trade</div>
        </article>
        <article class="tl-kpi-card discipline-kpi-card">
          <div class="tl-kpi-label">Win / Loss ratio</div>
          <div class="tl-kpi-val">${wlRatio.toFixed(2)}</div>
          <div class="row-sub">Ganadoras frente a perdedoras</div>
        </article>
      </div>

      <div class="tl-kpi-row discipline-kpi-row">
        <article class="tl-kpi-card discipline-kpi-card">
          <div class="tl-kpi-label">Consecutive losses</div>
          <div class="tl-kpi-val ${currentLosses >= 2 ? "red" : ""}">${currentLosses}</div>
          <div class="row-sub">Racha negativa actual</div>
        </article>
        <article class="tl-kpi-card discipline-kpi-card">
          <div class="tl-kpi-label">Trades por día</div>
          <div class="tl-kpi-val">${tradesDay.toFixed(1)}</div>
          <div class="row-sub">${model.totals.totalTrades} trades / ${model.dailyReturns.length} días activos</div>
        </article>
        <article class="tl-kpi-card discipline-kpi-card">
          <div class="tl-kpi-label">Loss concentration</div>
          <div class="tl-kpi-val ${currentLosses >= 2 ? "red" : ""}">${Math.round(lossConcentration)}%</div>
          <div class="row-sub">${currentLosses}x racha / ${formatCurrency(avgLossValue)} pérdida media</div>
        </article>
        <article class="tl-kpi-card discipline-kpi-card">
          <div class="tl-kpi-label">Consistencia activa</div>
          <div class="tl-kpi-val">${Math.round(behaviorConsistency)}%</div>
          <div class="row-sub">Días verdes sobre actividad registrada</div>
        </article>
      </div>

      <article class="tl-section-card discipline-hourly-card">
        <div class="tl-section-header">
          <div>
            <div class="tl-section-title">Hourly Behavior</div>
            <div class="tl-section-sub">La disciplina también se ve en cuándo operas: concentración, repetición y sesgo horario.</div>
          </div>
        </div>
        <div class="discipline-inline-notes discipline-inline-notes--chart">
          <div class="discipline-inline-note">
            <span>Hora dominante</span>
            <strong>${peakHourLabel}</strong>
            <small>${hourly.peak.trades} trades / ${formatCurrency(hourly.peak.pnl)}</small>
          </div>
          <div class="discipline-inline-note">
            <span>Concentración horaria</span>
            <strong>${Math.round(hourly.concentration)}%</strong>
            <small>del total de trades en una sola franja</small>
          </div>
        </div>
        ${chartCanvas("discipline-hourly-behavior", 240, "kmfx-chart-shell--feature")}
      </article>

      <article class="tl-section-card discipline-score-card">
        <div class="tl-section-header">
          <div>
            <div class="tl-section-title">Cómo se calcula el score</div>
            <div class="tl-section-sub">Transparencia simple: el score solo pondera métricas ya presentes en KMFX Edge.</div>
          </div>
        </div>
        <div class="discipline-score-layout">
          <div class="discipline-score-parts">
            ${discipline.parts.map((part) => `
              <div class="discipline-score-part">
                <div class="discipline-score-part-head">
                  <span>${part.label}</span>
                  <strong>${part.score}</strong>
                </div>
                <div class="discipline-score-part-track"><div class="discipline-score-part-fill" style="width:${part.score}%"></div></div>
                <small>${part.note}</small>
              </div>
            `).join("")}
          </div>
          <div class="discipline-score-main">
            <div class="discipline-score-value">${discipline.total}</div>
            <div class="discipline-score-copy">Disciplina operativa</div>
            <div class="discipline-score-meta">35% Win rate / 25% Profit Factor / 20% Max DD / 20% Avg R</div>
          </div>
        </div>
      </article>
    </div>
  `;

  mountCharts(root, [
    barChartSpec("discipline-hourly-behavior", hourly.rows.map((hour) => ({
      label: `${String(hour.hour).padStart(2, "0")}:00`,
      value: hour.trades
    })), {
      tone: "blue",
      formatter: (value) => `${Math.round(value)} trades`,
      literalHistogramBars: true,
      referenceSolidBars: true,
      solidBars: true,
      minimalTooltip: true,
      categoryPercentage: 1.0,
      barPercentage: 0.95,
      barThickness: 38,
      maxBarThickness: 44,
      trackMinWidth: 32,
      trackMaxWidth: 38,
      trackWidthRatio: 0.98,
      fillInset: 0.5,
      trackTopInset: 8,
      trackBottomInset: 4,
      xOffset: true,
      xTickPadding: 6,
      yTickPadding: 8,
      layoutPaddingLeft: 54,
      layoutPaddingRight: 54,
      showYGrid: false,
      showXGrid: false,
      showYAxis: false,
      maxXTicks: 6,
      maxYTicks: 4,
      valueLabelFormatter: (value) => value ? `${Math.round(value)}` : "",
      tooltipTitleFormatter: (column) => column.point?.label || "",
      tooltipBodyFormatter: (column) => `${Math.round(column.value)} trades`
    })
  ]);
}
