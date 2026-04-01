import { formatCompact, formatCurrency, formatPercent, getAccountTypeLabel, selectCurrentAccount, selectCurrentModel } from "./utils.js?v=build-20260329-201102";
import { chartCanvas, lineAreaSpec, mountCharts } from "./chart-system.js?v=build-20260329-201102";
import { computeRiskAlerts, riskAlertsMarkup } from "./risk-alerts.js?v=build-20260329-201102";
import { computeRecommendedRiskFromModel } from "./risk-engine.js?v=build-20260329-201102";

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

  const weeklyWinDays = model.weekly.filter((day) => day.pnl > 0).length;
  const cumulativeReturn = model.cumulative?.totalPct || 0;
  const riskAlerts = computeRiskAlerts(model, account);
  const riskGuidance = computeRecommendedRiskFromModel(model, account);
  const accountTypeLabel = getAccountTypeLabel(model.profile.mode, account.name);
  const isDarkTheme = state.ui.theme === "dark";
  const axisStrong = getComputedStyle(document.documentElement).getPropertyValue("--chart-axis-strong").trim() || undefined;
  const axisStandard = getComputedStyle(document.documentElement).getPropertyValue("--chart-axis-text").trim() || undefined;
  const chartSpecs = [];
  const heroRange = root.dataset.heroRange || "1M";
  const heroCurve = getHeroRangePoints(heroRange, model.equityCurve);
  const balanceCurve = heroCurve.map((point) => ({ ...point, value: model.account.balance }));
  const heroStart = heroCurve[0]?.value ?? model.account.balance;
  const heroEnd = heroCurve.at(-1)?.value ?? model.account.equity;
  const heroDelta = heroEnd - heroStart;
  const heroDeltaPct = heroStart ? (heroDelta / heroStart) * 100 : 0;
  const heroRangeLabel = heroRange === "1D" ? "intradía" : heroRange === "1W" ? "1 semana" : heroRange === "YTD" ? "YTD" : "1 mes";
  const latestDay = model.dayStats?.at?.(-1) || model.weekly?.at?.(-1) || { pnl: 0 };
  const accountStateLabel = account.compliance?.riskStatus === "violation"
    ? "Bloqueada"
    : account.compliance?.riskStatus === "warning"
      ? "En vigilancia"
      : "Operativa";
  const kpis = [
    {
      label: "Equity actual",
      value: formatCurrency(model.account.equity),
      tone: "blue",
      meta: `${account.name}`
    },
    {
      label: "Balance",
      value: formatCurrency(model.account.balance),
      tone: "blue",
      meta: "Capital base"
    },
    {
      label: "P&L Total",
      value: formatCurrency(model.totals.pnl),
      tone: model.totals.pnl >= 0 ? "green" : "red",
      meta: `${model.totals.totalTrades} operaciones cerradas`
    },
    {
      label: "P&L del día",
      value: formatCurrency(latestDay.pnl || 0),
      tone: (latestDay.pnl || 0) >= 0 ? "green" : "red",
      meta: "Sesión actual"
    },
    {
      label: "% retorno",
      value: formatPercent(cumulativeReturn),
      tone: cumulativeReturn >= 0 ? "green" : "red",
      meta: "Desde balance inicial"
    },
    {
      label: "Total trades",
      value: `${model.totals.totalTrades}`,
      tone: "blue",
      meta: `${weeklyWinDays} días ganadores`
    },
    {
      label: "Win Rate",
      value: formatPercent(model.totals.winRate),
      tone: "blue",
      meta: "Tasa de acierto"
    },
    {
      label: "Profit Factor",
      value: model.totals.profitFactor.toFixed(2),
      tone: "violet",
      meta: `Expectativa ${formatCurrency(model.totals.expectancy)}`
    },
    {
      label: "Avg R",
      value: `${model.totals.rr.toFixed(2)}R`,
      tone: "violet",
      meta: "R multiple medio"
    },
    {
      label: "Mejor Trade",
      value: formatCurrency(model.totals.bestTrade),
      tone: "green",
      meta: `${model.streaks.bestWin} racha ganadora`
    },
    {
      label: "Estado cuenta",
      value: accountStateLabel,
      tone: riskGuidance.risk_state === "LOCKED" || accountStateLabel === "Bloqueada"
        ? "red"
        : riskGuidance.risk_state === "DANGER" || accountStateLabel === "En vigilancia"
          ? "violet"
          : "green",
      meta: `Riesgo ${riskGuidance.risk_state}`
    }
  ];

  chartSpecs.push(
    lineAreaSpec("dashboard-hero-equity-chart", heroCurve, {
      tone: "blue",
      extraDatasets: [{
        label: "Balance",
        points: balanceCurve,
        tone: "violet",
        borderDash: [4, 6],
        borderWidth: 1.1,
        formatter: (value) => formatCurrency(value)
      }],
      showXAxis: true,
      showYAxis: true,
      maxYTicks: 4,
      borderWidth: 2.8,
      pointHoverRadius: 3.25,
      pointHitRadius: 20,
      fill: isDarkTheme,
      fillAlphaStart: isDarkTheme ? 0.32 : 0.05,
      fillAlphaEnd: isDarkTheme ? 0.005 : 0,
      glowAlpha: 0.18,
      tension: 0.74,
      axisColor: axisStandard,
      axisFontSize: 9,
      axisFontWeight: "500",
      yTickPadding: 14,
      xTickPadding: 12,
      maxXTicks: 7,
      gridAlpha: isDarkTheme ? 0.014 : 0.045,
      crosshairAlpha: isDarkTheme ? 0.10 : 0.10,
      yHeadroomRatio: 0.001,
      yBottomPaddingRatio: -0.012,
      showAxisBorder: false,
      formatter: (value, context) => {
        const prev = heroCurve[Math.max(context.dataIndex - 1, 0)]?.value ?? value;
        const delta = value - prev;
        return `${formatCurrency(value)} / ${delta >= 0 ? "+" : "-"}${formatCurrency(Math.abs(delta))}`;
      },
      axisFormatter: (value) => formatCompact(value)
    })
  );

  root.innerHTML = `
    <div class="dashboard-premium-grid">
      <section class="dashboard-hero-shell">
        <article class="account-banner account-banner--premium account-banner--hero-refined">
          <div class="account-banner-head">
            <div class="account-banner-heading">
              <div class="banner-kicker">Rendimiento</div>
              <div class="banner-title">${account.name}</div>
              <div class="banner-sub">${accountTypeLabel}</div>
            </div>
            <div class="account-banner-controls">
              <div class="widget-segmented" role="tablist" aria-label="Rango del gráfico">
                ${["1D", "1W", "1M", "YTD"].map((range) => `
                  <button class="widget-segmented-btn ${heroRange === range ? "active" : ""}" type="button" data-hero-range="${range}">${range}</button>
                `).join("")}
              </div>
            </div>
          </div>

          <div class="account-banner-body">
            <div class="account-banner-hero">
              <div class="account-banner-metric">
                <span class="account-banner-currency">€</span>
                <span class="account-banner-metric-value">${formatCurrency(model.account.equity).replace(/^€/, "")}</span>
              </div>
              <div class="account-banner-metrics-block">
                <div class="metric-line">
                  <span class="metric-line-label">PnL total</span>
                  <strong class="${model.totals.pnl >= 0 ? "metric-positive" : "metric-negative"}">
                    ${formatCurrency(model.totals.pnl)} (${formatPercent(cumulativeReturn)})
                  </strong>
                </div>

                <div class="metric-line">
                  <span class="metric-line-label">Rango (${heroRangeLabel})</span>
                  <strong class="${heroDelta >= 0 ? "metric-positive" : "metric-negative"}">
                    ${heroDelta >= 0 ? "+" : ""}${formatCurrency(heroDelta)} (${formatPercent(heroDeltaPct)})
                  </strong>
                </div>
              </div>
              <div class="account-banner-badges">
                <span class="widget-pill">Estado: ${riskGuidance.risk_state}</span>
                <span class="widget-pill">Riesgo ${model.riskProfile.currentRiskPct?.toFixed(2) || "0.00"}%</span>
                <span class="widget-pill">${model.positions.length} posiciones activas</span>
              </div>
              ${riskAlertsMarkup(riskAlerts, 2)}
            </div>

            <div class="account-banner-chart account-banner-chart--full">
              <div class="account-banner-viz">
                ${chartCanvas("dashboard-hero-equity-chart", 186, "kmfx-chart-shell--hero")}
              </div>
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
