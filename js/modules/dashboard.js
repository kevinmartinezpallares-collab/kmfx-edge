import { formatCompact, formatCurrency, formatPercent, getAccountTypeLabel, hasLiveAccounts as hasResolvedLiveAccounts, resolveAccountPnlSummary, resolveActiveAccountId, resolvePerformanceCardSource, selectCurrentAccount, selectCurrentDashboardPayload, selectCurrentModel } from "./utils.js?v=build-20260406-104500";
import { chartCanvas, lineAreaSpec, mountCharts } from "./chart-system.js?v=build-20260406-104500";
import { selectRiskExposure, selectRiskLimits, selectRiskStatus, selectRiskSummary } from "./risk-selectors.js?v=build-20260406-104500";
import {
  formatRiskCurrency,
  formatRiskValuePct,
  renderEnforcementPanel,
  renderOpenTradeRiskTable,
  renderRiskLimitBar,
  renderRiskMetricCard,
  renderRiskStatusBadge,
  renderSymbolExposureTable,
  riskToneFromStatus,
} from "./risk-panel-components.js?v=build-20260406-104500";

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

function riskStateDisplayLabel(riskState) {
  const normalized = String(riskState || "").toLowerCase();
  if (normalized === "blocked") return "BLOQUEADO";
  if (normalized === "breach") return "BREACH";
  if (normalized === "warning") return "WARNING";
  return "OK";
}

export function renderDashboard(root, state) {
  const liveAccountIds = Array.isArray(state.liveAccountIds) ? state.liveAccountIds : [];
  const activeAccountId = resolveActiveAccountId(state);
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
  const pnlSummary = resolveAccountPnlSummary(account);
  const performanceSource = resolvePerformanceCardSource(account);
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

  const cumulativeReturn = model.cumulative?.totalPct || 0;
  const accountTypeLabel = getAccountTypeLabel(model.profile.mode, account.name);
  const isDarkTheme = state.ui.theme === "dark";
  const axisLine = getComputedStyle(document.documentElement).getPropertyValue("--chart-axis-line").trim() || undefined;
  const axisStandard = getComputedStyle(document.documentElement).getPropertyValue("--chart-axis-text").trim() || undefined;
  const chartSpecs = [];
  const heroRange = root.dataset.heroRange || "1M";
  const baseCurve = Array.isArray(model.equityCurve) && model.equityCurve.length
    ? model.equityCurve
    : [
        { label: "Base", value: model.account.balance },
        { label: "Ahora", value: model.account.equity },
      ];
  const heroCurve = getHeroRangePoints(heroRange, baseCurve);
  const balanceCurve = heroCurve.map((point) => ({ ...point, value: model.account.balance }));
  const heroStart = heroCurve[0]?.value ?? model.account.balance;
  const heroEnd = heroCurve.at(-1)?.value ?? model.account.equity;
  const heroDelta = heroEnd - heroStart;
  const heroDeltaPct = heroStart ? (heroDelta / heroStart) * 100 : 0;
  const currentPnl = account?.sourceType === "mt5"
    ? Number(pnlSummary.heroOpenPnl || 0)
    : Number(model.totals.pnl || 0);
  const bannerMetricValue = Number(performanceSource.mainPerformanceValue || 0);
  const currentReturnPct = account?.sourceType === "mt5"
    ? (model.account.balance ? (currentPnl / model.account.balance) * 100 : 0)
    : cumulativeReturn;
  console.log("[KMFX][HERO][SOURCE]", {
    accountId: account?.id || "",
    sourceType: pnlSummary.sourceType,
    payloadSource: pnlSummary.payloadSource,
    heroOpenPnl: pnlSummary.heroOpenPnl,
    heroClosedPnl: pnlSummary.heroClosedPnl,
    heroTotalPnl: pnlSummary.heroTotalPnl,
    openPositionsCount: pnlSummary.openPositionsCount,
    usedExplicitLivePayload: pnlSummary.usedExplicitLivePayload,
  });
  console.log("[KMFX][ACCOUNT_BANNER][SOURCE]", {
    accountId: account?.id || "",
    sourceType: pnlSummary.sourceType,
    payloadSource: pnlSummary.payloadSource,
    bannerMetricValue,
    heroOpenPnl: pnlSummary.heroOpenPnl,
    heroClosedPnl: pnlSummary.heroClosedPnl,
    heroTotalPnl: pnlSummary.heroTotalPnl,
    openPositionsCount: pnlSummary.openPositionsCount,
    usedExplicitLivePayload: pnlSummary.usedExplicitLivePayload,
  });
  console.log("[KMFX][PERFORMANCE_CARD][SOURCE]", {
    selectedAccountId: account?.id || "",
    login: performanceSource.login,
    broker: performanceSource.broker,
    payloadSource: performanceSource.payloadSource,
    mainPerformanceValue: performanceSource.mainPerformanceValue,
    openPnl: performanceSource.heroOpenPnl,
    totalPnl: performanceSource.heroTotalPnl,
    sourceUsed: performanceSource.sourceUsed,
  });
  console.log("[KMFX][CHART][SOURCE]", {
    selectedAccountId: account?.id || "",
    login: performanceSource.login,
    broker: performanceSource.broker,
    payloadSource: performanceSource.payloadSource,
    historyPoints: performanceSource.historyPoints,
    mainPerformanceValue: performanceSource.mainPerformanceValue,
    openPnl: performanceSource.heroOpenPnl,
    totalPnl: performanceSource.heroTotalPnl,
    sourceUsed: Array.isArray(model.equityCurve) && model.equityCurve.length ? "history_or_fallback_curve" : "balance_equity_fallback",
  });
  const totalPnlDisplay = formatCurrency(Math.abs(currentPnl));
  const totalReturnDisplay = formatPercent(Math.abs(currentReturnPct)).replace(/^[+-]/, "");
  const heroRangeValueDisplay = formatCurrency(Math.abs(heroDelta));
  const heroRangePctDisplay = formatPercent(Math.abs(heroDeltaPct)).replace(/^[+-]/, "");
  const heroRangeLabel = heroRange === "1D" ? "intradía" : heroRange === "1W" ? "1 semana" : heroRange === "YTD" ? "YTD" : "1 mes";
  const heroPnlLabel = account?.sourceType === "mt5" ? "Open PnL" : "PnL total";
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
  const limitBars = [
    {
      label: "Max DD",
      currentPct: riskSummary.peakToEquityDrawdownPct,
      limitPct: riskSummary.maxDrawdownLimitPct,
      distancePct: riskSummary.distanceToMaxDdLimitPct,
      state: riskLimits.evaluation.limitsStatus?.max_drawdown?.state || "ok",
    },
    {
      label: "Daily DD",
      currentPct: riskSummary.dailyDrawdownPct,
      limitPct: riskLimits.policy.dailyDdLimitPct,
      distancePct: riskSummary.distanceToDailyDdLimitPct,
      state: riskLimits.evaluation.limitsStatus?.daily_drawdown?.state || "ok",
    },
    {
      label: "Heat",
      currentPct: riskSummary.totalOpenRiskPct,
      limitPct: riskSummary.portfolioHeatLimitPct,
      distancePct: riskSummary.distanceToHeatLimitPct,
      state: riskLimits.evaluation.limitsStatus?.portfolio_heat?.state || "ok",
    },
    {
      label: "Risk / trade",
      currentPct: riskSummary.maxOpenTradeRiskPct,
      limitPct: riskSummary.maxRiskPerTradePct,
      distancePct: Math.max(0, (riskSummary.maxRiskPerTradePct || 0) - (riskSummary.maxOpenTradeRiskPct || 0)),
      state: riskLimits.evaluation.limitsStatus?.risk_per_trade?.state || "ok",
    },
  ].filter((item) => Number.isFinite(Number(item.limitPct)) && Number(item.limitPct) > 0);

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
      fillAlphaStart: isDarkTheme ? 0.18 : 0.05,
      fillAlphaEnd: 0,
      glowAlpha: 0.18,
      tension: 0.82,
      axisColor: axisStandard,
      axisFontSize: 10,
      axisFontWeight: "600",
      yTickPadding: 8,
      xTickPadding: 2,
      maxXTicks: 7,
      showYGrid: false,
      gridAlpha: isDarkTheme ? 0.02 : 0.045,
      crosshairAlpha: isDarkTheme ? 0.10 : 0.10,
      yHeadroomRatio: 0.06,
      yBottomPaddingRatio: -0.01,
      layoutPaddingTop: 12,
      layoutPaddingBottom: 0,
      layoutPaddingLeft: 2,
      layoutPaddingRight: 2,
      showAxisBorder: true,
      axisBorderColor: axisLine,
      axisBorderWidth: 1,
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
          <div class="account-banner-body">
            <div class="account-banner-info">
              <div class="account-banner-heading">
                <div class="banner-kicker">Rendimiento</div>
                <div class="banner-title">${account.name}</div>
                <div class="banner-sub">${accountTypeLabel}</div>
              </div>

              <div class="account-banner-hero">
                <div class="account-banner-metric">
                  <span class="account-banner-metric-value">${formatCurrency(bannerMetricValue)}</span>
                </div>
                <div class="account-banner-metrics-block">
                  <div class="metric-line">
                    <span class="metric-line-label">${heroPnlLabel}</span>
                    <strong class="${currentPnl >= 0 ? "metric-positive" : "metric-negative"}">
                      ${totalPnlDisplay} (${totalReturnDisplay})
                    </strong>
                  </div>

                  <div class="metric-line">
                    <span class="metric-line-label">Rango (${heroRangeLabel})</span>
                    <strong class="${heroDelta >= 0 ? "metric-positive" : "metric-negative"}">
                      ${heroRangeValueDisplay} (${heroRangePctDisplay})
                    </strong>
                  </div>
                </div>
                <div class="account-banner-badges">
                  <span class="widget-pill">Estado: ${riskStatus.riskStatus}</span>
                  <span class="widget-pill">Heat ${formatRiskValuePct(riskSummary.totalOpenRiskPct, 2)}</span>
                  <span class="widget-pill">${pnlSummary.openPositionsCount} posiciones activas</span>
                </div>
                <div class="dashboard-risk-inline">${riskAction}</div>
              </div>
            </div>

            <div class="account-banner-chart account-banner-chart--full">
              <div class="account-banner-controls account-banner-controls--overlay">
                <div class="widget-segmented" role="tablist" aria-label="Rango del gráfico">
                  ${["1D", "1W", "1M", "YTD"].map((range) => `
                    <button class="widget-segmented-btn ${heroRange === range ? "active" : ""}" type="button" data-hero-range="${range}">${range}</button>
                  `).join("")}
                </div>
              </div>
              <div class="account-banner-viz">
                ${chartCanvas("dashboard-hero-equity-chart", 216, "kmfx-chart-shell--hero")}
              </div>
            </div>
          </div>
        </article>

        <section class="dashboard-risk-panel">
          <article class="tl-section-card dashboard-risk-overview dashboard-risk-overview--${riskTone}">
            <div class="dashboard-risk-overview__head">
              <div>
                <div class="tl-section-title">Risk Overview</div>
                <div class="dashboard-risk-overview__sub">${riskHeadline}</div>
              </div>
              ${renderRiskStatusBadge(riskStatus.riskStatus, riskStatus.severity)}
            </div>

            <div class="dashboard-risk-overview__grid">
              ${renderRiskMetricCard({
                label: "Drawdown actual",
                value: formatRiskValuePct(riskSummary.peakToEquityDrawdownPct, 2),
                meta: `Flotante ${formatRiskValuePct(riskSummary.floatingDrawdownPct, 2)}`,
                tone: riskTone,
              })}
              ${renderRiskMetricCard({
                label: "Daily DD",
                value: formatRiskValuePct(riskSummary.dailyDrawdownPct, 2),
                meta: `Pico diario ${formatRiskCurrency(riskSummary.dailyPeakEquity)}`,
                tone: riskTone,
              })}
              ${renderRiskMetricCard({
                label: "Distance to limit",
                value: formatRiskValuePct(primaryDistanceToLimit, 2),
                meta: `Max DD ${formatRiskValuePct(riskSummary.distanceToMaxDdLimitPct, 2)} · Daily ${formatRiskValuePct(riskSummary.distanceToDailyDdLimitPct, 2)}`,
                tone: riskTone,
              })}
              ${renderRiskMetricCard({
                label: "Acción requerida",
                value: riskStateLabel,
                meta: riskAction,
                tone: riskTone,
              })}
            </div>

            <div class="dashboard-risk-overview__foot">
              <span>${riskStatus.blockingRule || "Sin regla bloqueante activa"}</span>
              <span>${riskStatus.reasonCode}</span>
            </div>
          </article>

          <div class="dashboard-risk-grid">
            <article class="widget-card dashboard-risk-block">
              <div class="dashboard-risk-block__head">
                <div class="dashboard-risk-block__title">Risk Usage</div>
                <div class="dashboard-risk-block__sub">Heat real, riesgo abierto y posición más expuesta.</div>
              </div>
              <div class="dashboard-risk-block__grid">
                ${renderRiskMetricCard({
                  label: "Total open risk",
                  value: formatRiskValuePct(riskSummary.totalOpenRiskPct, 2),
                  meta: formatRiskCurrency(riskSummary.totalOpenRiskAmount),
                })}
                ${renderRiskMetricCard({
                  label: "Heat usage",
                  value: riskSummary.heatUsageRatioPct == null ? "—" : formatRiskValuePct(riskSummary.heatUsageRatioPct, 1),
                  meta: riskSummary.portfolioHeatLimitPct == null ? "Sin límite explícito" : `Límite ${formatRiskValuePct(riskSummary.portfolioHeatLimitPct, 2)}`,
                })}
                ${renderRiskMetricCard({
                  label: "Max trade risk",
                  value: formatRiskValuePct(riskSummary.maxOpenTradeRiskPct, 2),
                  meta: `Política ${formatRiskValuePct(riskSummary.maxRiskPerTradePct, 2)}`,
                })}
              </div>
            </article>

            <article class="widget-card dashboard-risk-block">
              <div class="dashboard-risk-block__head">
                <div class="dashboard-risk-block__title">Limits</div>
                <div class="dashboard-risk-block__sub">Uso actual de los límites que realmente mandan.</div>
              </div>
              <div class="dashboard-risk-limits">
                ${limitBars.map((item) => renderRiskLimitBar(item)).join("")}
              </div>
            </article>

            <article class="widget-card dashboard-risk-block">
              <div class="dashboard-risk-block__head">
                <div class="dashboard-risk-block__title">Enforcement</div>
                <div class="dashboard-risk-block__sub">Decisión operativa del motor institucional.</div>
              </div>
              ${renderEnforcementPanel(riskStatus)}
            </article>

            <article class="widget-card dashboard-risk-block">
              <div class="dashboard-risk-block__head">
                <div class="dashboard-risk-block__title">Exposición</div>
                <div class="dashboard-risk-block__sub">Lectura institucional por símbolo y riesgo abierto.</div>
              </div>
              ${renderSymbolExposureTable(riskExposure.symbolExposure)}
            </article>
          </div>
        </section>

        <article class="widget-card dashboard-risk-block dashboard-risk-block--wide">
          <div class="dashboard-risk-block__head">
            <div class="dashboard-risk-block__title">Riesgo por posición</div>
            <div class="dashboard-risk-block__sub">Detalle operativo de cada posición abierta con stop y P&amp;L.</div>
          </div>
          ${renderOpenTradeRiskTable(riskExposure.openTradeRisks)}
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
