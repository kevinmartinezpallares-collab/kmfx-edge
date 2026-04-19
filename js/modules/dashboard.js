import { formatCompact, formatCurrency, formatPercent, getAccountTypeLabel, hasLiveAccounts as hasResolvedLiveAccounts, resolveAccountDataAuthority, resolveAccountDisplayIdentity, resolveSelectedLiveAccountId, resolvePerformanceViewModel, selectCurrentAccount, selectCurrentDashboardPayload, selectCurrentModel } from "./utils.js?v=build-20260406-213500";
import { chartCanvas, lineAreaSpec, mountCharts } from "./chart-system.js?v=build-20260406-213500";
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

function renderDashboardKpiCard({ label, value, meta = "", trend = "", trendTone = "" }) {
  return `
    <article class="widget-card widget-card--kpi">
      <div class="tl-kpi-label">${label}</div>
      <div class="tl-kpi-val">${value}</div>
      ${meta ? `<div class="widget-card-meta">${meta}</div>` : ""}
      ${trend ? `<div class="widget-kpi-trend ${trendTone}">${trend}</div>` : ""}
    </article>
  `;
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
      summary: riskStatus?.actionRequired || "El motor de riesgo ha detectado una condición operativa que requiere atención.",
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
      summary: "La pérdida diaria ya consume una parte relevante del margen disponible. Conviene priorizar defensa y ejecución limpia.",
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
      summary: "La cuenta mantiene una lectura sólida de ejecución: profit factor sano y win rate consistente sobre una muestra operativa útil.",
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
      summary: "La lectura principal ahora depende de cómo se gestione el riesgo abierto. El foco está en heat, exposición y disciplina de salida.",
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
    summary: "No hay una señal dominante más fuerte que el control del capital. La referencia útil sigue siendo la consistencia del ledger y la calidad del riesgo.",
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
  const baseCurve = Array.isArray(performanceView.chartSeries) && performanceView.chartSeries.length
    ? performanceView.chartSeries
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
  const heroRangeLabel = heroRange === "1D" ? "intradía" : heroRange === "1W" ? "1 semana" : heroRange === "YTD" ? "YTD" : "1 mes";
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
  const hasEnforcementSignal = hasActiveEnforcementSignal(riskStatus);
  const hasExposureSignal = Array.isArray(riskExposure.symbolExposure) && riskExposure.symbolExposure.length > 0;
  const hasOpenTradeRisk = Array.isArray(riskExposure.openTradeRisks) && riskExposure.openTradeRisks.length > 0;
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
      ${adminTracePanel}
      <section class="dashboard-hero-shell">
        <article class="account-banner account-banner--premium dashboard-header-card">
          <div class="dashboard-header-card__copy">
            <div class="banner-kicker">Cuenta activa</div>
            <div class="banner-title">${display.title}</div>
            <div class="banner-sub">${[display.subtitle || accountTypeLabel, authority.firstTradeLabel ? `ledger desde ${authority.firstTradeLabel}` : ""].filter(Boolean).join(" · ")}</div>
          </div>
          <div class="dashboard-header-card__meta">
            <button class="btn-secondary btn-inline" type="button" data-open-connection-wizard="true" data-connection-source="dashboard">Añadir cuenta</button>
            ${renderRiskStatusBadge(riskStatus.riskStatus, riskStatus.severity)}
            <span class="widget-pill">${accountTypeLabel}</span>
          </div>
        </article>
      </section>

      <section class="tl-kpi-row dashboard-summary-kpis">
        ${renderDashboardKpiCard({
          label: "Balance / Equity",
          value: formatCurrency(model.account.equity),
          meta: `Balance ${formatCurrency(model.account.balance)}`,
          trend: model.account.equity >= model.account.balance ? "Equity por encima del balance" : "Equity por debajo del balance",
          trendTone: model.account.equity >= model.account.balance ? "green" : "red",
        })}
        ${renderDashboardKpiCard({
          label: panelSecondMetricLabel,
          value: `${panelSecondMetricValue >= 0 ? "+" : "-"}${formatCurrency(Math.abs(panelSecondMetricValue))}`,
          meta: `Retorno ${formatPercent(currentReturnPct)}`,
          trend: heroDelta >= 0 ? `Rango ${heroRangeLabel} +${heroRangeValueDisplay}` : `Rango ${heroRangeLabel} -${heroRangeValueDisplay}`,
          trendTone: panelSecondMetricValue >= 0 ? "green" : "red",
        })}
        ${renderDashboardKpiCard({
          label: "Drawdown actual",
          value: formatRiskValuePct(riskSummary.peakToEquityDrawdownPct, 2),
          meta: `Daily DD ${formatRiskValuePct(riskSummary.dailyDrawdownPct, 2)}`,
          trend: primaryDistanceToLimit <= 0 ? "Límite consumido" : `Margen ${formatRiskValuePct(primaryDistanceToLimit, 2)}`,
          trendTone: primaryDistanceToLimit <= 1 ? "red" : primaryDistanceToLimit <= 3 ? "" : "green",
        })}
        ${renderDashboardKpiCard({
          label: "Edge",
          value: Number(model?.totals?.profitFactor || 0) > 0 ? Number(model.totals.profitFactor).toFixed(2) : "—",
          meta: `Win rate ${formatPercent((model?.totals?.winRate || 0) / 100)}`,
          trend: `${Number(model?.totals?.totalTrades || 0)} trades`,
          trendTone: Number(model?.totals?.profitFactor || 0) >= 1.5 ? "green" : "",
        })}
      </section>

      <section class="dashboard-main-grid dashboard-main-grid--master">
        <article class="account-banner account-banner--premium account-banner--hero-refined dashboard-performance-hero">
          <div class="account-banner-body">
            <div class="account-banner-info">
              <div class="account-banner-heading">
                <div class="banner-kicker">Evolución de cuenta</div>
                <div class="banner-title">Equity & balance</div>
                <div class="banner-sub">${[display.title, display.subtitle || accountTypeLabel].filter(Boolean).join(" · ")}</div>
              </div>

              <div class="account-banner-hero">
                <div class="account-banner-metric">
                  <span class="account-banner-metric-value">${formatCurrency(model.account.equity)}</span>
                </div>
                <div class="account-banner-metrics-block">
                  <div class="metric-line">
                    <span class="metric-line-label">Balance</span>
                    <strong>${formatCurrency(model.account.balance)}</strong>
                  </div>

                  <div class="metric-line">
                    <span class="metric-line-label">${panelSecondMetricLabel}</span>
                    <strong class="${panelSecondMetricValue >= 0 ? "metric-positive" : "metric-negative"}">
                      ${panelSecondMetricValue >= 0 ? "+" : "-"}${totalPnlDisplay} (${totalReturnDisplay})
                    </strong>
                  </div>
                </div>
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

        <div class="dashboard-side-stack">
          <article class="widget-card dashboard-risk-block dashboard-ops-card">
            <div class="dashboard-risk-block__head">
              <div>
                <div class="dashboard-risk-block__title">Operational state</div>
                <div class="dashboard-risk-block__sub">${dashboardInsight.title} · ${dashboardInsight.summary}</div>
              </div>
              ${renderRiskStatusBadge(riskStatus.riskStatus, riskStatus.severity)}
            </div>

            <div class="dashboard-risk-block__grid">
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
              <span>${hasEnforcementSignal ? riskAction : riskHeadline}</span>
            </div>
          </article>

          <article class="widget-card dashboard-risk-block dashboard-risk-posture-card">
            <div class="dashboard-risk-block__head">
              <div>
                <div class="dashboard-risk-block__title">Risk posture</div>
                <div class="dashboard-risk-block__sub">Riesgo abierto y riesgo máximo por trade como lectura compacta del posture actual.</div>
              </div>
            </div>
            <div class="dashboard-risk-block__grid">
              ${renderRiskMetricCard({
                label: "Total open risk",
                value: formatRiskValuePct(riskSummary.totalOpenRiskPct, 2),
                meta: formatRiskCurrency(riskSummary.totalOpenRiskAmount),
              })}
              ${renderRiskMetricCard({
                label: "Max trade risk",
                value: formatRiskValuePct(riskSummary.maxOpenTradeRiskPct, 2),
                meta: `Política ${formatRiskValuePct(riskSummary.maxRiskPerTradePct, 2)}`,
              })}
            </div>
          </article>
        </div>
      </section>

      ${hasExposureSignal ? `
      <section class="dashboard-secondary-grid dashboard-secondary-grid--master">
          <article class="widget-card dashboard-risk-block">
            <div class="dashboard-risk-block__head">
              <div class="dashboard-risk-block__title">Exposición</div>
              <div class="dashboard-risk-block__sub">Lectura institucional por símbolo y riesgo abierto.</div>
            </div>
            ${renderSymbolExposureTable(riskExposure.symbolExposure)}
          </article>
      </section>
      ` : ""}

      ${hasEnforcementSignal ? `
        <section class="dashboard-bottom-grid dashboard-bottom-grid--master">
          <article class="widget-card dashboard-risk-block">
            <div class="dashboard-risk-block__head">
              <div class="dashboard-risk-block__title">Enforcement</div>
              <div class="dashboard-risk-block__sub">Decisión operativa del motor institucional.</div>
            </div>
            ${renderEnforcementPanel(riskStatus)}
          </article>
        </section>
      ` : ""}

      ${hasOpenTradeRisk ? `
      <article class="widget-card dashboard-risk-block dashboard-risk-block--wide">
          <div class="dashboard-risk-block__head">
            <div class="dashboard-risk-block__title">Riesgo por posición</div>
            <div class="dashboard-risk-block__sub">Detalle operativo de cada posición abierta con stop y P&amp;L.</div>
          </div>
          ${renderOpenTradeRiskTable(riskExposure.openTradeRisks)}
      </article>
      ` : ""}
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
