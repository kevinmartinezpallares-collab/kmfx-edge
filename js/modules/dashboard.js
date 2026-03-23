import { formatCompact, formatCurrency, formatPercent, getAccountTypeLabel, selectCurrentAccount, selectCurrentModel } from "./utils.js";
import { chartCanvas, lineAreaSpec, mountCharts } from "./chart-system.js";
import { computeRiskAlerts, riskAlertsMarkup } from "./risk-alerts.js";
import { computeRecommendedRiskFromModel } from "./risk-engine.js";

function clampPercent(value) {
  return Math.max(0, Math.min(100, value));
}

function radialWidget(value, label, tone = "blue") {
  const radius = 46;
  const circumference = 2 * Math.PI * radius;
  const progress = clampPercent(value);
  const offset = circumference - (progress / 100) * circumference;
  return `
    <div class="widget-ring widget-ring--${tone}">
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle cx="60" cy="60" r="${radius}" class="widget-ring-track"></circle>
        <circle cx="60" cy="60" r="${radius}" class="widget-ring-progress" stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"></circle>
      </svg>
      <div class="widget-ring-copy">
        <strong>${Math.round(value)}</strong>
        <span>${label}</span>
      </div>
    </div>
  `;
}

function statRail(label, value, width, tone = "blue", hint = "") {
  return `
    <div class="metric-rail">
      <div class="metric-rail-copy">
        <span>${label}</span>
        <strong>${value}</strong>
      </div>
      <div class="metric-rail-track">
        <div class="metric-rail-fill metric-rail-fill--${tone}" style="width:${clampPercent(width)}%"></div>
      </div>
      ${hint ? `<div class="metric-rail-hint">${hint}</div>` : ""}
    </div>
  `;
}

function detailMetric(icon, tone, label, value, sub = "") {
  return `
    <div class="widget-detail-item">
      <div class="widget-detail-icon widget-detail-icon--${tone}">${icon}</div>
      <div class="widget-detail-copy">
        <span>${label}</span>
        <strong>${value}</strong>
        ${sub ? `<small>${sub}</small>` : ""}
      </div>
    </div>
  `;
}

function getHeroRangePoints(range, curve) {
  if (range === "1D") return curve.slice(-5);
  if (range === "1W") return curve.slice(-7);
  if (range === "YTD") return curve;
  return curve.slice(-14);
}

export function renderDashboard(root, state) {
  const model = selectCurrentModel(state);
  const account = selectCurrentAccount(state);
  if (!model || !account) {
    root.innerHTML = "";
    return;
  }

  const weeklyTotal = model.weekly.reduce((sum, day) => sum + day.pnl, 0);
  const weeklyTrades = model.weekly.reduce((sum, day) => sum + day.trades, 0);
  const weeklyWinDays = model.weekly.filter((day) => day.pnl > 0).length;
  const weeklyReturn = model.account.balance ? (weeklyTotal / model.account.balance) * 100 : 0;
  const cumulativeReturn = model.cumulative?.totalPct || 0;
  const weekBaseEquity = model.account.equity - weeklyTotal;
  let runningWeekEquity = weekBaseEquity;
  const weeklyEquity = model.weekly.map((day) => {
    runningWeekEquity += day.pnl;
    return {
      label: day.label,
      pnl: day.pnl,
      trades: day.trades,
      value: runningWeekEquity
    };
  });
  const positionExposure = model.positions.reduce((sum, position) => sum + Math.abs(position.pnl), 0) || 1;
  const drawdownPct = model.totals.drawdown.maxPct || 0;
  const riskAlerts = computeRiskAlerts(model, account);
  const riskGuidance = computeRecommendedRiskFromModel(model, account);
  const accountTypeLabel = getAccountTypeLabel(model.profile.mode, account.name);
  const isDarkTheme = state.ui.theme === "dark";
  const axisStrong = getComputedStyle(document.documentElement).getPropertyValue("--chart-axis-strong").trim() || undefined;
  const axisStandard = getComputedStyle(document.documentElement).getPropertyValue("--chart-axis-text").trim() || undefined;
  const chartSpecs = [];
  const heroRange = root.dataset.heroRange || "1M";
  const heroCurve = getHeroRangePoints(heroRange, model.equityCurve);
  const heroStart = heroCurve[0]?.value ?? model.account.balance;
  const heroEnd = heroCurve.at(-1)?.value ?? model.account.equity;
  const heroDelta = heroEnd - heroStart;
  const heroDeltaPct = heroStart ? (heroDelta / heroStart) * 100 : 0;
  const heroRangeLabel = heroRange === "1D" ? "intradía" : heroRange === "1W" ? "1 semana" : heroRange === "YTD" ? "YTD" : "1 mes";
  const kpis = [
    {
      label: "P&L Total",
      value: formatCurrency(model.totals.pnl),
      tone: model.totals.pnl >= 0 ? "green" : "red",
      meta: `${model.totals.totalTrades} operaciones cerradas`
    },
    {
      label: "Win Rate",
      value: formatPercent(model.totals.winRate),
      tone: "blue",
      meta: `${weeklyWinDays} días ganadores esta semana`
    },
    {
      label: "Trades",
      value: `${model.totals.totalTrades}`,
      tone: "blue",
      meta: `${weeklyTrades} operaciones en la semana`
    },
    {
      label: "Profit Factor",
      value: model.totals.profitFactor.toFixed(2),
      tone: "violet",
      meta: `Expectativa ${formatCurrency(model.totals.expectancy)}`
    },
    {
      label: "Mejor Trade",
      value: formatCurrency(model.totals.bestTrade),
      tone: "green",
      meta: `${model.streaks.bestWin} racha ganadora`
    }
  ];

  chartSpecs.push(
    lineAreaSpec("dashboard-hero-equity-chart", heroCurve, {
      tone: "blue",
      showXAxis: true,
      showYAxis: true,
      maxYTicks: 4,
      borderWidth: 2.35,
      pointHoverRadius: 2.5,
      pointHitRadius: 18,
      fillAlphaStart: isDarkTheme ? 0.14 : 0.1,
      fillAlphaEnd: 0.01,
      glowAlpha: 0.07,
      tension: 0.36,
      axisColor: axisStrong,
      axisFontSize: 10,
      axisFontWeight: isDarkTheme ? "500" : "600",
      yTickPadding: 14,
      xTickPadding: 12,
      gridAlpha: isDarkTheme ? 0.045 : 0.06,
      crosshairAlpha: isDarkTheme ? 0.16 : 0.12,
      showAxisBorder: true,
      formatter: (value, context) => {
        const prev = heroCurve[Math.max(context.dataIndex - 1, 0)]?.value ?? value;
        const delta = value - prev;
        return `${formatCurrency(value)} · ${delta >= 0 ? "+" : ""}${formatCurrency(delta).replace("US$", "").trim()} US$`;
      },
      axisFormatter: (value) => formatCompact(value)
    }),
    lineAreaSpec("dashboard-weekly-equity-chart", weeklyEquity, {
      tone: "blue",
      borderWidth: 2.15,
      pointHoverRadius: 2.25,
      pointHitRadius: 16,
      fillAlphaStart: isDarkTheme ? 0.13 : 0.095,
      fillAlphaEnd: 0.015,
      glowAlpha: 0.06,
      tension: 0.34,
      axisColor: axisStandard,
      axisFontSize: 10,
      axisFontWeight: isDarkTheme ? "500" : "600",
      yTickPadding: 12,
      xTickPadding: 10,
      gridAlpha: isDarkTheme ? 0.05 : 0.06,
      crosshairAlpha: isDarkTheme ? 0.14 : 0.11,
      showAxisBorder: true,
      formatter: (value, context) => {
        const point = weeklyEquity[context.dataIndex];
        return `${formatCurrency(value)} · ${formatCurrency(point.pnl)} · ${point.trades} trades`;
      },
      axisFormatter: (value) => formatCompact(value),
      fillAlphaStart: 0.13
    })
  );

  const detailMetrics = [
    detailMetric("↑", "green", "Mejor Mes", model.totals.bestMonth ? formatCurrency(model.totals.bestMonth.pnl) : "—", model.totals.bestMonth?.label || ""),
    detailMetric("↓", "red", "Peor Mes", model.totals.worstMonth ? formatCurrency(model.totals.worstMonth.pnl) : "—", model.totals.worstMonth?.label || ""),
    detailMetric("$", "blue", "P&L Total", formatCurrency(model.totals.pnl)),
    detailMetric("#", "violet", "Total Trades", `${model.totals.totalTrades}`),
    detailMetric("%", "green", "Win Rate", formatPercent(model.totals.winRate)),
    detailMetric("E", "blue", "Expectativa", formatCurrency(model.totals.expectancy)),
    detailMetric("C", "violet", "Comisiones", formatCurrency(model.totals.commissions)),
    detailMetric("PF", "blue", "Profit Factor", model.totals.profitFactor.toFixed(2))
  ];

  const advancedMetrics = [
    { label: "Recommended Risk", value: `${riskGuidance.recommendedRiskPct.toFixed(2)}%`, width: riskGuidance.recommendedRiskPct * 100, tone: riskGuidance.risk_state === "LOCKED" ? "red" : riskGuidance.risk_state === "DANGER" ? "red" : riskGuidance.risk_state === "CAUTION" ? "violet" : "green" },
    { label: "Sharpe", value: model.totals.ratios.sharpe.toFixed(2), width: clampPercent(model.totals.ratios.sharpe * 20), tone: "blue" },
    { label: "Sortino", value: model.totals.ratios.sortino.toFixed(2), width: clampPercent(model.totals.ratios.sortino * 20), tone: "violet" },
    { label: "Calmar", value: model.totals.ratios.calmar.toFixed(2), width: clampPercent(model.totals.ratios.calmar * 20), tone: "green" },
    { label: "Recovery", value: model.totals.ratios.recovery.toFixed(2), width: clampPercent(model.totals.ratios.recovery * 18), tone: "blue" },
    { label: "R:R medio", value: model.totals.rr.toFixed(2), width: clampPercent(model.totals.rr * 30), tone: "violet" },
    { label: "Profit bruto", value: formatCurrency(model.totals.grossProfit), width: clampPercent((model.totals.grossProfit / Math.max(Math.abs(model.totals.pnl) || 1, 1)) * 36), tone: "green" },
    { label: "Loss bruto", value: formatCurrency(-model.totals.grossLoss), width: clampPercent((model.totals.grossLoss / Math.max(model.totals.grossProfit || 1, 1)) * 100), tone: "red" },
    { label: "Risk State", value: riskGuidance.risk_state, width: riskGuidance.risk_state === "LOCKED" ? 100 : riskGuidance.risk_state === "DANGER" ? 76 : riskGuidance.risk_state === "CAUTION" ? 52 : 28, tone: riskGuidance.risk_state === "LOCKED" ? "red" : riskGuidance.risk_state === "DANGER" ? "red" : riskGuidance.risk_state === "CAUTION" ? "violet" : "green" }
  ];

  const goals = [
    {
      label: "Win rate objetivo",
      current: model.totals.winRate,
      target: model.account.winRateTarget,
      value: formatPercent(model.totals.winRate),
      hint: `Objetivo ${formatPercent(model.account.winRateTarget)}`,
      width: model.account.winRateTarget ? (model.totals.winRate / model.account.winRateTarget) * 100 : 0,
      tone: "blue"
    },
    {
      label: "Profit factor objetivo",
      current: model.totals.profitFactor,
      target: model.account.profitFactorTarget,
      value: model.totals.profitFactor.toFixed(2),
      hint: `Objetivo ${model.account.profitFactorTarget.toFixed(2)}`,
      width: model.account.profitFactorTarget ? (model.totals.profitFactor / model.account.profitFactorTarget) * 100 : 0,
      tone: "violet"
    },
    {
      label: "Drawdown máximo",
      current: model.totals.drawdown.maxPct,
      target: model.account.maxDrawdownLimit,
      value: `${model.totals.drawdown.maxPct.toFixed(1)}%`,
      hint: `Límite ${model.account.maxDrawdownLimit.toFixed(1)}%`,
      width: 100 - ((model.totals.drawdown.maxPct / Math.max(model.account.maxDrawdownLimit, 0.01)) * 100),
      tone: "green"
    },
    {
      label: "Sharpe objetivo",
      current: model.totals.ratios.sharpe,
      target: 1,
      value: model.totals.ratios.sharpe.toFixed(2),
      hint: "Objetivo 1.00",
      width: model.totals.ratios.sharpe * 100,
      tone: "blue"
    }
  ];

  root.innerHTML = `
    <div class="dashboard-premium-grid">
      <section class="dashboard-hero-shell">
        <article class="account-banner account-banner--premium">
          <div class="account-banner-copy">
            <div class="banner-kicker">Rendimiento</div>
            <div class="banner-topline">
              <div>
                <div class="banner-title">${account.name}</div>
                <div class="banner-sub">${accountTypeLabel}</div>
              </div>
              <div class="widget-segmented" role="tablist" aria-label="Rango del gráfico">
                ${["1D", "1W", "1M", "YTD"].map((range) => `
                  <button class="widget-segmented-btn ${heroRange === range ? "active" : ""}" type="button" data-hero-range="${range}">${range}</button>
                `).join("")}
              </div>
            </div>
            <div class="account-banner-badges">
              <span class="widget-pill">${accountTypeLabel}</span>
              <span class="widget-pill">Estado: ${riskGuidance.risk_state}</span>
              <span class="widget-pill">Recomendado ${riskGuidance.recommendedRiskPct.toFixed(2)}%</span>
              <span class="widget-pill">Riesgo ${model.riskProfile.currentRiskPct?.toFixed(2) || "0.00"}%</span>
              <span class="widget-pill">${model.positions.length} posiciones activas</span>
            </div>
            ${riskAlertsMarkup(riskAlerts, 2)}
          </div>
          <div class="account-banner-side">
            <div class="account-banner-metric">${formatCurrency(model.account.equity)}</div>
            <div class="account-banner-meta ${model.totals.pnl >= 0 ? "metric-positive" : "metric-negative"}">
              ${formatCurrency(model.totals.pnl)} · ${formatPercent(cumulativeReturn)}
            </div>
            <div class="account-banner-context">
              <span>Rango activo: ${heroRangeLabel}</span>
              <strong class="${heroDelta >= 0 ? "metric-positive" : "metric-negative"}">${heroDelta >= 0 ? "+" : ""}${formatCurrency(heroDelta)} · ${formatPercent(heroDeltaPct)}</strong>
            </div>
          </div>
          <div class="account-banner-chart">
            <div class="account-banner-viz">
              ${chartCanvas("dashboard-hero-equity-chart", 164, "kmfx-chart-shell--hero")}
            </div>
          </div>
        </article>

        <div class="dashboard-kpi-premium-grid">
          ${kpis.map((kpi) => `
            <article class="widget-card widget-card--kpi widget-card--kpi-${kpi.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}">
              <div class="widget-card-head">
                <div class="tl-kpi-label">${kpi.label}</div>
                <div class="widget-dot widget-dot--${kpi.tone}"></div>
              </div>
              <div class="tl-kpi-val ${kpi.tone === "green" ? "green" : kpi.tone === "red" ? "red" : ""}">${kpi.value}</div>
              <div class="widget-card-meta">${kpi.meta}</div>
              <div class="widget-kpi-trend ${kpi.tone}">
                <span class="widget-kpi-trend-arrow">${kpi.tone === "red" ? "↓" : "↑"}</span>
                <span>${kpi.tone === "red" ? "presión reciente" : "tracción positiva"}</span>
              </div>
            </article>
          `).join("")}
        </div>
      </section>

      <section class="dashboard-main-grid">
        <article class="widget-card widget-card--feature widget-card--weekly">
          <div class="widget-card-head">
            <div>
              <div class="widget-eyebrow">Resumen semanal</div>
              <div class="tl-section-title">Rendimiento semanal</div>
            </div>
            <div class="widget-pill">${model.weekly.filter((day) => day.trades).length} días activos</div>
          </div>
          <div class="widget-metric-row">
            <div class="widget-metric">
              <span>Total semana</span>
              <strong class="${weeklyTotal >= 0 ? "metric-positive" : "metric-negative"}">${formatCurrency(weeklyTotal)}</strong>
            </div>
            <div class="widget-metric">
              <span>Días ganadores</span>
              <strong>${weeklyWinDays}</strong>
            </div>
            <div class="widget-metric">
              <span>Operaciones</span>
              <strong>${weeklyTrades}</strong>
            </div>
            <div class="widget-metric">
              <span>Retorno semanal</span>
              <strong>${formatPercent(weeklyReturn)}</strong>
            </div>
          </div>
          <div class="week-strip week-strip--premium">
            ${model.weekly.map((day) => `
              <div class="week-day-cell ${day.state === "win" ? "win" : day.state === "loss" ? "loss" : ""}">
                <div class="wdc-label">${day.label}</div>
                <div class="wdc-val">${formatCompact(day.pnl)}</div>
                <div class="wdc-meta">${day.trades} trades</div>
              </div>
            `).join("")}
          </div>
          <div class="widget-feature-chart">
            ${chartCanvas("dashboard-weekly-equity-chart", 220, "kmfx-chart-shell--feature")}
          </div>
        </article>

        <article class="widget-card widget-card--feature widget-card--return">
          <div class="widget-card-head">
            <div>
              <div class="widget-eyebrow">Cumulative return</div>
              <div class="tl-section-title">Retorno acumulado</div>
            </div>
            <div class="widget-pill ${cumulativeReturn >= 0 ? "metric-positive" : "metric-negative"}">${formatPercent(cumulativeReturn)}</div>
          </div>
          <div class="widget-return-shell">
            <div>
              <div class="metric-label">Crecimiento desde balance inicial</div>
              <div class="metric-large ${cumulativeReturn >= 0 ? "metric-positive" : "metric-negative"}">${formatPercent(cumulativeReturn)}</div>
              <div class="row-sub">${formatCurrency(model.cumulative.totalUsd || 0)} netos acumulados</div>
              <div class="widget-return-rails">
                ${statRail("Balance", formatCurrency(model.account.balance), 72, "blue")}
                ${statRail("Equity", formatCurrency(model.account.equity), 78, "violet")}
                ${statRail("Retorno semanal", formatPercent(weeklyReturn), clampPercent(Math.abs(weeklyReturn) * 12), weeklyReturn >= 0 ? "green" : "red")}
                ${statRail("DD máximo", formatPercent(-drawdownPct), 100 - clampPercent(drawdownPct * 8), "red")}
              </div>
            </div>
            ${radialWidget(model.totals.riskScore, "Trader score", "blue")}
          </div>
        </article>
      </section>

      <section class="dashboard-secondary-grid">
        <article class="widget-card">
          <div class="widget-card-head">
            <div>
              <div class="widget-eyebrow">Detailed metrics</div>
              <div class="tl-section-title">Métricas detalladas</div>
            </div>
          </div>
          <div class="widget-detail-grid">
            ${detailMetrics.join("")}
          </div>
        </article>

        <article class="widget-card">
          <div class="widget-card-head">
            <div>
              <div class="widget-eyebrow">Advanced metrics</div>
              <div class="tl-section-title">Métricas avanzadas</div>
            </div>
          </div>
          <div class="widget-advanced-grid">
            ${advancedMetrics.map((metric) => `
              <div class="widget-advanced-item">
                <div class="widget-advanced-label">${metric.label}</div>
                <div class="widget-advanced-value">${metric.value}</div>
                <div class="metric-rail-track"><div class="metric-rail-fill metric-rail-fill--${metric.tone}" style="width:${metric.width}%"></div></div>
              </div>
            `).join("")}
          </div>
        </article>
      </section>

      <section class="dashboard-tertiary-grid">
        <article class="widget-card">
          <div class="widget-card-head">
            <div>
              <div class="widget-eyebrow">Recent activity</div>
              <div class="tl-section-title">Actividad reciente</div>
            </div>
            <div class="widget-pill">${model.recentTrades.length} últimas</div>
          </div>
          <div class="widget-activity-list">
            ${model.recentTrades.map((trade) => `
              <div class="widget-activity-item">
                <div class="widget-activity-main">
                  <strong>${trade.symbol}</strong>
                  <span>${trade.side} · ${trade.session}</span>
                </div>
                <div class="widget-activity-side">
                  <span>${trade.side}</span>
                  <strong class="${trade.pnl >= 0 ? "metric-positive" : "metric-negative"}">${formatCurrency(trade.pnl)}</strong>
                </div>
              </div>
            `).join("")}
          </div>
        </article>

        <article class="widget-card">
          <div class="widget-card-head">
            <div>
              <div class="widget-eyebrow">Open positions</div>
              <div class="tl-section-title">Posiciones abiertas</div>
            </div>
            <div class="widget-pill">${model.positions.length} abiertas</div>
          </div>
          <div class="table-wrap widget-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Par</th>
                  <th>Dir</th>
                  <th>Vol</th>
                  <th>Entrada</th>
                  <th>P&amp;L</th>
                </tr>
              </thead>
              <tbody>
                ${model.positions.map((position) => `
                  <tr>
                    <td><span class="table-symbol">${position.symbol}</span></td>
                    <td><span class="row-chip">${position.side}</span></td>
                    <td>${position.volume}</td>
                    <td>${position.entry}</td>
                    <td class="${position.pnl >= 0 ? "metric-positive" : "metric-negative"}">${formatCurrency(position.pnl)}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
          <div class="widget-position-rails">
            ${model.positions.map((position) => statRail(
              `${position.symbol} · ${position.side}`,
              formatCurrency(position.pnl),
              clampPercent((Math.abs(position.pnl) / positionExposure) * 100),
              position.pnl >= 0 ? "green" : "red",
              `Vol ${position.volume} · Entrada ${position.entry}`
            )).join("")}
          </div>
        </article>
      </section>

      <section class="dashboard-bottom-grid">
        <article class="widget-card">
          <div class="widget-card-head">
            <div>
              <div class="widget-eyebrow">Trader score</div>
              <div class="tl-section-title">Score del trader</div>
            </div>
          </div>
          <div class="widget-score-grid">
            ${radialWidget(model.totals.riskScore, "Disciplina", "violet")}
            <div class="widget-stat-list">
              ${statRail("Win rate", formatPercent(model.totals.winRate), model.totals.winRate, "green")}
              ${statRail("R:R medio", model.totals.rr.toFixed(2), clampPercent(model.totals.rr * 30), "blue")}
              ${statRail("Profit factor", model.totals.profitFactor.toFixed(2), clampPercent(model.totals.profitFactor * 25), "violet")}
              ${statRail("Drawdown", formatPercent(-drawdownPct), 100 - clampPercent(drawdownPct * 8), "red")}
            </div>
          </div>
        </article>

        <article class="widget-card">
          <div class="widget-card-head">
            <div>
              <div class="widget-eyebrow">Goals</div>
              <div class="tl-section-title">Objetivos</div>
            </div>
          </div>
          <div class="goal-grid">
            ${goals.map((goal) => `
              <div class="goal-card">
                <div class="metric-label">${goal.label}</div>
                <div class="goal-card-value">${goal.value}</div>
                <div class="goal-card-sub">${goal.hint}</div>
                <div class="metric-rail-track">
                  <div class="metric-rail-fill metric-rail-fill--${goal.tone}" style="width:${clampPercent(goal.width)}%"></div>
                </div>
              </div>
            `).join("")}
          </div>
        </article>
      </section>
    </div>
  `;
  mountCharts(root, chartSpecs);

  root.querySelectorAll("[data-hero-range]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextRange = button.dataset.heroRange;
      if (!nextRange || nextRange === root.dataset.heroRange) return;
      root.dataset.heroRange = nextRange;
      renderDashboard(root, state);
    });
  });
}
