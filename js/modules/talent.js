import { chartCanvas, mountCharts } from "./chart-system.js?v=build-20260504-071418";
import { describeAccountAuthority, formatPercent, renderAuthorityNotice, selectCurrentAccount, selectCurrentModel } from "./utils.js?v=build-20260504-071418";
import { pageHeaderMarkup } from "./ui-primitives.js?v=build-20260504-071418";

export function renderTalent(root, state) {
  const account = selectCurrentAccount(state);
  const model = selectCurrentModel(state);
  if (!model) {
    root.innerHTML = "";
    return;
  }
  const authorityMeta = describeAccountAuthority(account, "derived");
  console.info("[KMFX][TALENT_AUTHORITY]", {
    account_id: account?.id || "",
    login: account?.login || "",
    broker: account?.broker || "",
    payloadSource: authorityMeta.authority.payloadSource,
    tradeCount: authorityMeta.authority.tradeCount,
    sourceUsed: "derived_skill_profile",
  });
  const score = model.totals.riskScore || 0;
  const maxDd = model.totals.drawdown?.maxPct || 0;
  const rr = model.totals.rr || 0;
  const ratios = model.totals.ratios || {};
  const radarDimensions = buildRadarDimensions(model);
  const advancedRatios = [
    { label: "Sharpe", value: ratios.sharpe || 0, note: "Calidad del retorno ajustado por volatilidad." },
    { label: "Sortino", value: ratios.sortino || 0, note: "Penaliza solo la volatilidad negativa." },
    { label: "Calmar", value: ratios.calmar || 0, note: "Retorno frente al drawdown máximo." },
    { label: "Recovery Factor", value: ratios.recovery || 0, note: "Capacidad de recuperación tras caídas." }
  ];
  const objectives = [
    { label: "Win Rate ≥ 50%", current: model.totals.winRate, target: 50, suffix: "%" },
    { label: "Profit Factor ≥ 1.5", current: model.totals.profitFactor, target: 1.5, suffix: "" },
    { label: "Max DD ≤ 10%", current: maxDd, target: 10, suffix: "%", inverse: true },
    { label: "Sharpe ≥ 1.0", current: ratios.sharpe || 0, target: 1, suffix: "" }
  ];

  root.innerHTML = `
    ${pageHeaderMarkup({
      title: "Talent / Progress Tracker",
      description: "Lectura de desarrollo del trader con score, radar competencial, ratios avanzados y objetivos de ejecución.",
      className: "tl-page-header",
      titleClassName: "tl-page-title",
      descriptionClassName: "tl-page-sub",
    })}

    ${renderAuthorityNotice(authorityMeta)}

    <div class="grid-2 equal">
      <article class="tl-section-card talent-score-surface">
        <div class="tl-section-header"><div class="tl-section-title">KMFX Score</div></div>
        <div class="talent-score-layout">
          <div class="widget-ring widget-ring--blue">
            <svg viewBox="0 0 120 120" aria-hidden="true">
              <circle class="widget-ring-track" cx="60" cy="60" r="44"></circle>
              <circle class="widget-ring-progress" cx="60" cy="60" r="44" stroke-dasharray="${2 * Math.PI * 44}" stroke-dashoffset="${2 * Math.PI * 44 * (1 - score / 100)}"></circle>
            </svg>
            <div class="widget-ring-copy">
              <strong>${score}</strong>
              <span>KMFX Score</span>
            </div>
          </div>
          <div class="talent-radar-shell">
            ${chartCanvas("talent-radar-chart", 240, "kmfx-chart-shell--feature")}
          </div>
        </div>
      </article>

      <article class="tl-section-card">
        <div class="tl-section-header"><div class="tl-section-title">Ratios avanzados</div></div>
        <div class="detail-metrics-grid talent-ratios-grid">
          ${advancedRatios.map((ratio) => `
            <div class="metric-item">
              <div class="metric-label">${ratio.label}</div>
              <div class="metric-value">${Number(ratio.value).toFixed(2)}</div>
              <div class="goal-card-sub">${ratio.note}</div>
            </div>
          `).join("")}
        </div>
      </article>
    </div>

    <article class="tl-section-card">
      <div class="tl-section-header"><div class="tl-section-title">Objetivos de Trading</div></div>
      <div class="goal-grid">
        ${objectives.map((goal) => {
          const progress = goal.inverse
            ? Math.max(0, Math.min(100, ((goal.target - Math.min(goal.current, goal.target)) / goal.target) * 100))
            : Math.max(0, Math.min(100, (goal.current / goal.target) * 100));
          return `
            <article class="goal-card">
              <div class="goal-card-value">${goal.label}</div>
              <div class="goal-card-sub">Actual ${formatGoalValue(goal.current, goal.suffix)} · Objetivo ${formatGoalValue(goal.target, goal.suffix)}</div>
              <div class="score-bar-row talent-goal-row">
                <span>Progreso</span>
                <div class="score-bar-track">
                  <div class="score-bar-fill" style="width:${progress}%;background:var(--accent)"></div>
                </div>
                <strong>${Math.round(progress)}%</strong>
              </div>
            </article>
          `;
        }).join("")}
      </div>
    </article>
  `;

  mountCharts(root, [
    {
      id: "talent-radar-chart",
      type: "radar",
      data: {
        labels: radarDimensions.map((item) => item.label),
        datasets: [
          {
            data: radarDimensions.map((item) => item.value),
            borderColor: "rgba(75, 141, 255, 0.92)",
            backgroundColor: "rgba(75, 141, 255, 0.12)",
            pointBackgroundColor: "rgba(155, 192, 255, 1)",
            pointBorderColor: "rgba(11, 11, 15, 0.9)",
            pointRadius: 3,
            pointHoverRadius: 4,
            borderWidth: 2
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: true,
            backgroundColor: "rgba(11, 11, 15, 0.94)",
            borderColor: "rgba(255,255,255,0.08)",
            borderWidth: 1,
            padding: 10,
            displayColors: false,
            titleColor: "#f3f2ee",
            bodyColor: "rgba(243,242,238,0.84)"
          }
        },
        scales: {
          r: {
            min: 0,
            max: 100,
            ticks: { display: false, stepSize: 20 },
            angleLines: { color: "rgba(255,255,255,0.08)" },
            grid: { color: "rgba(255,255,255,0.08)" },
            pointLabels: {
              color: "rgba(243,242,238,0.68)",
              font: { size: 11, weight: 600 }
            }
          }
        }
      }
    }
  ]);
}

function buildRadarDimensions(model) {
  const ratios = model.totals.ratios || {};
  const rr = model.totals.rr || 0;
  const maxDd = model.totals.drawdown?.maxPct || 0;
  return [
    { label: "Experiencia", value: Math.min(100, model.totals.totalTrades * 4) },
    { label: "Gest. Riesgo", value: Math.max(0, 100 - maxDd * 8) },
    { label: "Consistencia", value: Math.min(100, model.totals.winRate) },
    { label: "R:R", value: Math.min(100, (rr / 3) * 100) },
    { label: "Risk-Adjusted", value: Math.min(100, Math.max(0, (ratios.sharpe || 0) * 28)) },
    { label: "Capital", value: Math.min(100, model.totals.riskScore || 0) }
  ];
}

function formatGoalValue(value, suffix) {
  if (suffix === "%") return `${Number(value).toFixed(1)}%`;
  return Number(value).toFixed(2);
}
