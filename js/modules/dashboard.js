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

function riskStateDisplayLabel(riskState) {
  if (riskState === "LOCKED" || riskState === "DANGER") return "RIESGO";
  if (riskState === "CAUTION") return "VIGILANCIA";
  return "SEGURO";
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
  const totalPnlDisplay = formatCurrency(Math.abs(model.totals.pnl));
  const totalReturnDisplay = formatPercent(Math.abs(cumulativeReturn)).replace(/^[+-]/, "");
  const heroRangeValueDisplay = formatCurrency(Math.abs(heroDelta));
  const heroRangePctDisplay = formatPercent(Math.abs(heroDeltaPct)).replace(/^[+-]/, "");
  const heroRangeLabel = heroRange === "1D" ? "intradía" : heroRange === "1W" ? "1 semana" : heroRange === "YTD" ? "YTD" : "1 mes";
  const latestDay = model.dayStats?.at?.(-1) || model.weekly?.at?.(-1) || { pnl: 0 };
  const currentRiskPct = Number(model.riskProfile?.currentRiskPct || 0);
  const maxTradeRiskPct = Number(model.riskProfile?.maxTradeRiskPct || currentRiskPct || 1);
  const drawdownPct = Number(model.totals?.drawdown?.maxPct || 0);
  const maxDrawdownLimitPct = Number(account.maxDrawdownLimit || model.account?.maxDrawdownLimit || 10);
  const distanceToLimitPct = Math.max(0, maxDrawdownLimitPct - drawdownPct);
  const riskUsedRatio = maxTradeRiskPct ? Math.min(100, (currentRiskPct / maxTradeRiskPct) * 100) : 0;
  const riskStateLabel = riskStateDisplayLabel(riskGuidance.risk_state);
  const riskTone = riskStateLabel === "SAFE" ? "safe" : riskStateLabel === "WATCH" ? "watch" : "danger";
  const riskAlertLine = account.compliance?.messages?.[0]
    || riskGuidance.explanation
    || "Dentro de reglas";
  const accountStateLabel = account.compliance?.riskStatus === "violation"
    ? "Bloqueada"
    : account.compliance?.riskStatus === "warning"
      ? "En vigilancia"
      : "Operativa";
  const accountStateTone = riskGuidance.risk_state === "LOCKED" || accountStateLabel === "Bloqueada"
    ? "red"
    : riskGuidance.risk_state === "DANGER" || accountStateLabel === "En vigilancia"
      ? "violet"
      : "green";

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
      areaSideFade: true,
      areaSideFadeStart: 0.09,
      areaSideFadeEnd: 0.91,
      glowAlpha: 0.18,
      tension: 0.82,
      axisColor: axisStrong,
      axisFontSize: 9,
      axisFontWeight: "500",
      yTickPadding: 8,
      xTickPadding: 2,
      maxXTicks: 7,
      showYGrid: true,
      gridAlpha: isDarkTheme ? 0.02 : 0.045,
      crosshairAlpha: isDarkTheme ? 0.10 : 0.10,
      yHeadroomRatio: 0.018,
      yBottomPaddingRatio: -0.001,
      layoutPaddingTop: 6,
      layoutPaddingBottom: 0,
      layoutPaddingLeft: 2,
      layoutPaddingRight: 2,
      showAxisBorder: true,
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
                  <span class="account-banner-currency">€</span>
                  <span class="account-banner-metric-value">${formatCurrency(model.account.equity).replace(/^€/, "")}</span>
                </div>
                <div class="account-banner-metrics-block">
                  <div class="metric-line">
                    <span class="metric-line-label">PnL total</span>
                    <strong class="${model.totals.pnl >= 0 ? "metric-positive" : "metric-negative"}">
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
                  <span class="widget-pill">Estado: ${riskGuidance.risk_state}</span>
                  <span class="widget-pill">Riesgo ${model.riskProfile.currentRiskPct?.toFixed(2) || "0.00"}%</span>
                  <span class="widget-pill">${model.positions.length} posiciones activas</span>
                </div>
                ${riskAlertsMarkup(riskAlerts, 2)}
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

        <article class="tl-section-card dashboard-risk-card dashboard-risk-card--${riskTone}">
          <div class="dashboard-risk-card__head">
            <div>
              <div class="tl-section-title">Risk</div>
              <div class="dashboard-risk-card__sub">Lectura operativa inmediata para disciplina y límites.</div>
            </div>
            <div class="dashboard-risk-card__state dashboard-risk-card__state--${riskTone}">${riskStateLabel}</div>
          </div>

          <div class="dashboard-risk-card__metrics">
            <div class="dashboard-risk-metric">
              <div class="dashboard-risk-metric__label">Risk used</div>
              <div class="dashboard-risk-metric__value">${currentRiskPct.toFixed(2)}%</div>
              <div class="dashboard-risk-metric__meta">${Math.round(riskUsedRatio)}% del riesgo permitido</div>
            </div>

            <div class="dashboard-risk-metric">
              <div class="dashboard-risk-metric__label">Max allowed</div>
              <div class="dashboard-risk-metric__value">${maxTradeRiskPct.toFixed(2)}%</div>
              <div class="dashboard-risk-metric__meta">riesgo máximo por trade</div>
            </div>

            <div class="dashboard-risk-metric">
              <div class="dashboard-risk-metric__label">Drawdown actual</div>
              <div class="dashboard-risk-metric__value">${formatPercent(drawdownPct).replace(/^[+-]/, "")}</div>
              <div class="dashboard-risk-metric__meta">máximo registrado</div>
            </div>

            <div class="dashboard-risk-metric">
              <div class="dashboard-risk-metric__label">Distance to limit</div>
              <div class="dashboard-risk-metric__value">${formatPercent(distanceToLimitPct).replace(/^[+-]/, "")}</div>
              <div class="dashboard-risk-metric__meta">hasta el límite de ${formatPercent(maxDrawdownLimitPct).replace(/^[+-]/, "")}</div>
            </div>
          </div>

          <div class="dashboard-risk-card__alert dashboard-risk-card__alert--${riskTone}">
            ${riskAlertLine}
          </div>
        </article>

        <div class="dashboard-kpi-premium-grid dashboard-kpi-clusters">
          <article class="widget-card dashboard-kpi-cluster dashboard-kpi-cluster--capital">
            <div class="dashboard-kpi-cluster__head">
              <div class="dashboard-kpi-cluster__title">Capital</div>
              <div class="dashboard-kpi-cluster__sub">Base financiera y resultado acumulado.</div>
            </div>
            <div class="dashboard-kpi-cluster__items">
              <div class="dashboard-kpi-item">
                <div class="dashboard-kpi-item__label">Equity actual</div>
                <div class="dashboard-kpi-item__value">${formatCurrency(model.account.equity)}</div>
                <div class="dashboard-kpi-item__meta">${account.name}</div>
              </div>
              <div class="dashboard-kpi-item">
                <div class="dashboard-kpi-item__label">Balance</div>
                <div class="dashboard-kpi-item__value">${formatCurrency(model.account.balance)}</div>
                <div class="dashboard-kpi-item__meta">Capital base</div>
              </div>
              <div class="dashboard-kpi-item">
                <div class="dashboard-kpi-item__label">P&amp;L total</div>
                <div class="dashboard-kpi-item__value ${model.totals.pnl >= 0 ? "green" : "red"}">${formatCurrency(model.totals.pnl)}</div>
                <div class="dashboard-kpi-item__meta">${model.totals.totalTrades} operaciones cerradas</div>
              </div>
            </div>
          </article>

          <article class="widget-card dashboard-kpi-cluster dashboard-kpi-cluster--performance">
            <div class="dashboard-kpi-cluster__head">
              <div class="dashboard-kpi-cluster__title">Rendimiento</div>
              <div class="dashboard-kpi-cluster__sub">Calidad estadística y tracción del sistema.</div>
            </div>
            <div class="dashboard-kpi-cluster__items">
              <div class="dashboard-kpi-item">
                <div class="dashboard-kpi-item__label">Win rate</div>
                <div class="dashboard-kpi-item__value">${formatPercent(model.totals.winRate)}</div>
                <div class="dashboard-kpi-item__meta">Tasa de acierto</div>
              </div>
              <div class="dashboard-kpi-item">
                <div class="dashboard-kpi-item__label">Profit factor</div>
                <div class="dashboard-kpi-item__value">${model.totals.profitFactor.toFixed(2)}</div>
                <div class="dashboard-kpi-item__meta">Expectativa ${formatCurrency(model.totals.expectancy)}</div>
              </div>
              <div class="dashboard-kpi-item">
                <div class="dashboard-kpi-item__label">Avg R</div>
                <div class="dashboard-kpi-item__value">${model.totals.rr.toFixed(2)}R</div>
                <div class="dashboard-kpi-item__meta">R múltiple medio</div>
              </div>
              <div class="dashboard-kpi-item">
                <div class="dashboard-kpi-item__label">Mejor trade</div>
                <div class="dashboard-kpi-item__value green">${formatCurrency(model.totals.bestTrade)}</div>
                <div class="dashboard-kpi-item__meta">${model.streaks.bestWin} racha ganadora</div>
              </div>
            </div>
          </article>

          <article class="widget-card dashboard-kpi-cluster dashboard-kpi-cluster--activity">
            <div class="dashboard-kpi-cluster__head">
              <div class="dashboard-kpi-cluster__title">Actividad</div>
              <div class="dashboard-kpi-cluster__sub">Sesión actual, ritmo operativo y estado.</div>
            </div>
            <div class="dashboard-kpi-cluster__items">
              <div class="dashboard-kpi-item">
                <div class="dashboard-kpi-item__label">P&amp;L del día</div>
                <div class="dashboard-kpi-item__value ${(latestDay.pnl || 0) >= 0 ? "green" : "red"}">${formatCurrency(latestDay.pnl || 0)}</div>
                <div class="dashboard-kpi-item__meta">Sesión actual</div>
              </div>
              <div class="dashboard-kpi-item">
                <div class="dashboard-kpi-item__label">Total trades</div>
                <div class="dashboard-kpi-item__value">${model.totals.totalTrades}</div>
                <div class="dashboard-kpi-item__meta">${weeklyWinDays} días ganadores</div>
              </div>
              <div class="dashboard-kpi-item">
                <div class="dashboard-kpi-item__label">Estado cuenta</div>
                <div class="dashboard-kpi-item__value ${accountStateTone === "green" ? "green" : accountStateTone === "red" ? "red" : ""}">${accountStateLabel}</div>
                <div class="dashboard-kpi-item__meta">Riesgo ${riskGuidance.risk_state}</div>
              </div>
            </div>
          </article>
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
