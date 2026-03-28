import { formatCurrency, formatDateTime, formatPercent, selectCurrentAccount, selectCurrentModel } from "./utils.js";
import { badgeMarkup, getRiskStatusMeta } from "./status-badges.js";
import { computeRiskAlerts, riskAlertsMarkup } from "./risk-alerts.js";
import { computeRecommendedRiskFromModel } from "./risk-engine.js";
import { chartCanvas, lineAreaSpec, mountCharts } from "./chart-system.js";

function ladderRows(risk) {
  return risk.ladder.map((row) => ({
    ...row,
    entryCondition: row.condition,
    riseCondition: row.rise,
    fallCondition: row.fall,
    tradesTo100k: Math.round(100 / Math.max(row.riskPct, 0.1))
  }));
}

function currentLadderLevel(ladder, risk) {
  const currentRiskPct = Number(risk?.currentRiskPct || 0);
  const protectRow = ladder.find((row) => row.level === "PROTECT");
  if (Number(risk?.marginTrades || 0) <= 1 && protectRow) return protectRow.level;

  let closest = ladder[0]?.level || "BASE";
  let minDiff = Number.POSITIVE_INFINITY;
  ladder.forEach((row) => {
    const diff = Math.abs(Number(row.riskPct || 0) - currentRiskPct);
    if (diff < minDiff) {
      minDiff = diff;
      closest = row.level;
    }
  });
  return closest;
}

function renderLadderProgress(ladder, currentLevel) {
  const currentIndex = Math.max(0, ladder.findIndex((row) => row.level === currentLevel));
  return `
    <div class="risk-ladder-progress" aria-label="Progresión de escalera de riesgo">
      ${ladder.map((row, index) => {
        const stateClass = index < currentIndex
          ? "done"
          : index === currentIndex
            ? "current"
            : "idle";
        return `
          <div class="risk-ladder-step risk-ladder-step--${stateClass}">
            <div class="risk-ladder-node">
              <span>${row.level}</span>
              <small>${row.riskPct.toFixed(2)}%</small>
            </div>
            ${index < ladder.length - 1 ? `<div class="risk-ladder-connector"></div>` : ""}
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function getRiskDraft(root, model) {
  if (!root.__riskDraft) {
    root.__riskDraft = {
      capital: Number(model.account.balance || 0),
      maxDd: Number(model.account.maxDrawdownLimit || 0),
      riskTrade: Number(model.riskProfile.maxTradeRiskPct || 0)
    };
  }
  return root.__riskDraft;
}

function polar(cx, cy, radius, deg) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return [cx + radius * Math.cos(rad), cy + radius * Math.sin(rad)];
}

function arcPath(cx, cy, radius, startDeg, endDeg) {
  const [sx, sy] = polar(cx, cy, radius, startDeg);
  const [ex, ey] = polar(cx, cy, radius, endDeg);
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${sx} ${sy} A ${radius} ${radius} 0 ${largeArc} 1 ${ex} ${ey}`;
}

function securitySegments({ account, model, risk, score }) {
  const ddHeadroom = Math.max(0, Math.min(100, 100 - ((model.totals.drawdown.maxPct / Math.max(account.maxDrawdownLimit || 10, 0.01)) * 100)));
  const riskDiscipline = Math.max(0, Math.min(100, 100 - ((risk.currentRiskPct / Math.max(model.riskProfile.maxTradeRiskPct || 1, 0.01)) * 100) * 0.45));
  const exposureControl = Math.max(0, Math.min(100, 100 - ((Math.abs(model.account.openPnl) / 1500) * 100)));
  const complianceState = account.compliance.riskStatus === "violation" ? 14 : account.compliance.riskStatus === "warning" ? 46 : 82;

  return [
    { label: "Drawdown", value: Math.round(ddHeadroom), tone: "blue" },
    { label: "Riesgo", value: Math.round(riskDiscipline), tone: "violet" },
    { label: "Exposición", value: Math.round(exposureControl), tone: "green" },
    { label: "Cumplimiento", value: Math.round((complianceState + score) / 2), tone: account.compliance.riskStatus === "violation" ? "red" : "gold" }
  ];
}

function renderSecurityArc(segments, score) {
  const radius = 84;
  const cx = 120;
  const cy = 128;
  const gapDeg = 7;
  const totalDeg = 180;
  const totalValue = segments.reduce((sum, segment) => sum + segment.value, 0) || 1;
  const usableDeg = totalDeg - gapDeg * segments.length;
  let currentDeg = -90;

  const paths = segments.map((segment, index) => {
    const sweep = Math.max((segment.value / totalValue) * usableDeg, 12);
    const start = currentDeg + gapDeg / 2;
    const end = start + sweep;
    const arcLen = (sweep / 360) * (2 * Math.PI * radius);
    currentDeg = end;
    return `
      <path
        d="${arcPath(cx, cy, radius, start, end)}"
        class="kmfx-arc-path kmfx-arc-path--${segment.tone}"
        data-risk-arc="${index}"
        stroke-dasharray="${arcLen}"
        stroke-dashoffset="${arcLen}"
        style="animation-delay:${(0.15 + index * 0.18).toFixed(2)}s"
      ></path>
    `;
  }).join("");

  const track = arcPath(cx, cy, radius, -90, 90);

  return `
    <div class="security-arc-widget" data-arc-widget="risk-security-score">
      <div class="security-arc-shell">
        <svg viewBox="0 0 240 162" class="security-arc-svg" aria-hidden="true">
          <path d="${track}" class="kmfx-arc-track"></path>
          ${paths}
          <text x="120" y="106" text-anchor="middle" class="kmfx-arc-total kmfx-arc-total--risk">${Math.round(score)}</text>
          <text x="120" y="126" text-anchor="middle" class="kmfx-arc-subtitle kmfx-arc-subtitle--risk">SCORE</text>
        </svg>
      </div>
      <div class="security-arc-legend">
        ${segments.map((segment) => `
          <div class="security-arc-legend-item">
            <i class="security-arc-dot security-arc-dot--${segment.tone}"></i>
            <span>${segment.label}</span>
            <strong>${segment.value}</strong>
          </div>
        `).join("")}
      </div>
    </div>
  `;
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

export function renderRisk(root, state) {
  const model = selectCurrentModel(state);
  const account = selectCurrentAccount(state);
  if (!model || !account) {
    root.innerHTML = "";
    return;
  }

  const risk = model.riskSummary;
  const riskBadge = getRiskStatusMeta(account.compliance);
  const isBlocked = account.compliance.riskStatus === "violation";
  const runtimeTone = isBlocked ? "danger" : account.compliance.riskStatus === "warning" ? "warn" : "ok";
  const securityScore = isBlocked ? 8 : account.compliance.riskStatus === "warning" ? Math.min(risk.securityProgress, 52) : risk.securityProgress;
  const ladder = ladderRows(risk);
  const draft = getRiskDraft(root, model);
  const securityArc = renderSecurityArc(securitySegments({ account, model, risk, score: securityScore }), securityScore);
  const riskAlerts = computeRiskAlerts(model, account);
  const riskGuidance = computeRecommendedRiskFromModel(model, account);
  const equityPeak = Math.max(account.balance || 0, ...((model.equityCurve || []).map((point) => Number(point.value || 0))));
  const currentDrawdownAmount = Math.max(0, equityPeak - Number(account.equity || 0));
  const currentDrawdownPct = equityPeak ? (currentDrawdownAmount / equityPeak) * 100 : 0;
  const dailyDrawdownPct = account.balance ? (Math.abs(Math.min(0, risk.dailyLossUsd || 0)) / account.balance) * 100 : 0;
  const exposureOpen = model.positions.reduce((sum, item) => sum + Math.abs(item.pnl || 0), 0);
  const currentLossStreak = (() => {
    let streak = 0;
    for (let index = model.trades.length - 1; index >= 0; index -= 1) {
      const trade = model.trades[index];
      if ((trade.pnl || 0) < 0) {
        streak += 1;
        continue;
      }
      break;
    }
    return streak;
  })();
  const avgLoss = Number(model.totals.avgLoss || 0);
  const ladderLevel = currentLadderLevel(ladder, risk);
  const riskStateTone = riskGuidance.risk_state === "LOCKED" || riskGuidance.risk_state === "DANGER"
    ? "error"
    : riskGuidance.risk_state === "CAUTION"
      ? "warn"
      : "ok";
  const riskStatusMessage = riskGuidance.risk_state === "LOCKED"
    ? "Trading blocked"
    : riskGuidance.risk_state === "DANGER"
      ? "Reduce exposure"
      : riskGuidance.risk_state === "CAUTION"
        ? "Reduce exposure"
        : "Trading normal";

  root.innerHTML = `
    <div class="risk-page-stack">
    <div class="tl-page-header">
      <div class="tl-page-title">Gestor de Riesgo</div>
      <div class="tl-page-sub">Controles operativos, configuración de límites y lectura clara del estado de seguridad.</div>
    </div>
    ${riskAlertsMarkup(riskAlerts, 3)}

    <article class="tl-section-card risk-overview-surface">
      <div class="tl-section-header">
        <div>
          <div class="tl-section-title">Resumen de Riesgo</div>
          <div class="row-sub">Drawdown, exposición y presión actual concentrados en un único bloque.</div>
        </div>
      </div>
      <div class="trades-kpi-row risk-current-grid">
        <article class="tl-kpi-card risk-kpi-card">
          <div class="tl-kpi-label">Current Drawdown</div>
          <div class="tl-kpi-val ${currentDrawdownAmount > 0 ? "red" : ""}">${formatCurrency(-currentDrawdownAmount)}</div>
          <div class="row-sub">${formatPercent(currentDrawdownPct)} desde el último pico</div>
        </article>
        <article class="tl-kpi-card risk-kpi-card">
          <div class="tl-kpi-label">Daily Drawdown</div>
          <div class="tl-kpi-val ${risk.dailyLossUsd < 0 ? "red" : ""}">${formatCurrency(risk.dailyLossUsd)}</div>
          <div class="row-sub">${formatPercent(dailyDrawdownPct)} del balance</div>
        </article>
        <article class="tl-kpi-card risk-kpi-card">
          <div class="tl-kpi-label">Max Drawdown</div>
          <div class="tl-kpi-val red">${formatCurrency(-model.totals.drawdown.maxAmount)}</div>
          <div class="row-sub">${formatPercent(model.totals.drawdown.maxPct)} máximo histórico</div>
        </article>
        <article class="tl-kpi-card risk-kpi-card">
          <div class="tl-kpi-label">Risk Pressure</div>
          <div class="tl-kpi-val ${riskStateTone === "error" ? "red" : riskStateTone === "warn" ? "metric-warning" : "green"}">${riskGuidance.risk_state}</div>
          <div class="row-sub">Recomendado ${riskGuidance.recommendedRiskPct.toFixed(2)}%</div>
        </article>
        <article class="tl-kpi-card risk-kpi-card">
          <div class="tl-kpi-label">Risk / Trade</div>
          <div class="tl-kpi-val">${risk.currentRiskPct.toFixed(2)}%</div>
          <div class="row-sub">${formatCurrency(risk.currentRiskUsd)} por operación</div>
        </article>
        <article class="tl-kpi-card risk-kpi-card">
          <div class="tl-kpi-label">Exposure</div>
          <div class="tl-kpi-val ${account.openPnl >= 0 ? "green" : "red"}">${formatCurrency(account.openPnl)}</div>
          <div class="row-sub">${formatCurrency(exposureOpen)} flotante absoluta</div>
        </article>
        <article class="tl-kpi-card risk-kpi-card">
          <div class="tl-kpi-label">Consecutive Losses</div>
          <div class="tl-kpi-val ${currentLossStreak >= 3 ? "red" : ""}">${currentLossStreak}</div>
          <div class="row-sub">Máximo histórico ${model.streaks.bestLoss}</div>
        </article>
        <article class="tl-kpi-card risk-kpi-card">
          <div class="tl-kpi-label">Average Loss</div>
          <div class="tl-kpi-val red">${formatCurrency(-avgLoss)}</div>
          <div class="row-sub">Recovery ${model.totals.ratios.recovery.toFixed(2)}</div>
        </article>
      </div>
      <div class="widget-feature-chart">
        ${chartCanvas("risk-drawdown-curve", 240, "kmfx-chart-shell--feature kmfx-chart-shell--blended-card")}
      </div>
      <div class="risk-overview-meta">
        <span>Límite DD total ${formatPercent(account.maxDrawdownLimit || 0)}</span>
        <span>Límite DD diario ${formatPercent(model.riskProfile.dailyLossLimitPct || 0)}</span>
        <span>Max consecutive losses ${model.streaks.bestLoss}</span>
        <span>Recovery Factor ${model.totals.ratios.recovery.toFixed(2)}</span>
      </div>
    </article>

    <article class="tl-section-card risk-status-widget risk-status-widget--${riskStateTone}">
      <div class="risk-status-top">
        <div>
          <div class="tl-section-title">Risk Status</div>
          <div class="row-sub">Lectura global del motor de riesgo</div>
        </div>
        ${badgeMarkup({ label: riskGuidance.risk_state, tone: riskStateTone })}
      </div>
      <div class="risk-status-grid">
        <div class="risk-status-main">
          <span class="risk-status-label">Recommended Risk</span>
          <strong class="risk-status-value">${riskGuidance.recommendedRiskPct.toFixed(2)}%</strong>
        </div>
        <div class="risk-status-main">
          <span class="risk-status-label">Estado actual</span>
          <strong class="risk-status-message">${riskStatusMessage}</strong>
        </div>
      </div>
      <div class="risk-status-explanation">${riskGuidance.blocked ? riskGuidance.block_reason : riskGuidance.explanation}</div>
    </article>

    <article class="tl-section-card risk-current-surface">
      <div class="tl-section-header"><div class="tl-section-title">Estado Actual</div></div>
      <div class="trades-kpi-row risk-current-grid">
        <article class="tl-kpi-card risk-kpi-card risk-kpi-card--current"><div class="tl-kpi-label">Riesgo Actual</div><div class="tl-kpi-val">${formatCurrency(risk.currentRiskUsd)}</div><div class="row-sub">${risk.currentRiskPct.toFixed(2)}% por operación</div></article>
        <article class="tl-kpi-card risk-kpi-card risk-kpi-card--margin"><div class="tl-kpi-label">Margen de Error</div><div class="tl-kpi-val ${risk.marginTrades <= 2 ? "red" : ""}">${risk.marginTrades}</div><div class="row-sub">Trades hasta DD</div></article>
        <article class="tl-kpi-card risk-kpi-card risk-kpi-card--daily"><div class="tl-kpi-label">Pérdida Hoy</div><div class="tl-kpi-val ${risk.dailyLossUsd < 0 ? "red" : ""}">${formatCurrency(risk.dailyLossUsd)}</div><div class="row-sub">PnL neto del día</div></article>
      </div>
    </article>

    ${isBlocked ? `
      <article class="risk-lock-banner">
        <div class="risk-lock-copy">
          <strong>EA bloqueado por protección de capital</strong>
          <span>${account.compliance.messages[0] || "Se activó el bloqueo automático por incumplimiento de límites."}</span>
        </div>
        <div class="risk-lock-meta">Último sync: ${formatDateTime(account.connection.lastSync)}</div>
      </article>
    ` : ""}

    <div class="risk-security-card risk-security-card--premium">
      <div class="risk-sec-header">
        <span class="risk-sec-title">Estado de Seguridad</span>
        ${badgeMarkup({ label: account.compliance.riskStatus === "ok" ? risk.securityLevel : riskBadge.label, tone: riskBadge.tone })}
      </div>
      <div class="risk-security-layout">
        <div class="risk-security-gauge">
          ${securityArc}
        </div>
        <div class="risk-security-copy">
          <div class="risk-sec-score-line">
            <strong>${Math.round(securityScore)}</strong>
            <span>/ 100</span>
          </div>
          <div class="risk-sec-score-sub">Lectura actual de seguridad operativa</div>
          <div class="risk-sec-bar-track">
            <div class="risk-sec-bar-fill ${runtimeTone}" style="width:${isBlocked ? 96 : risk.securityProgress}%"></div>
          </div>
          <div class="risk-sec-msg">${account.compliance.messages[0] || risk.securityMessage}</div>
        </div>
      </div>
    </div>

    <article class="tl-section-card risk-config-surface">
      <div class="tl-section-header"><div class="tl-section-title">Reglas Configurables</div></div>
      <div class="risk-config-grid">
        ${risk.guardrails.map((rule) => `
          <article class="risk-config-card">
            <div class="risk-config-title">${rule.title}</div>
            <div class="risk-config-meta">${rule.description}</div>
            <div class="risk-config-value">${rule.value}</div>
            <div style="margin-top:10px;">${badgeMarkup({ label: rule.status, tone: rule.status === "Activo" ? "ok" : rule.status === "Alerta" ? "warn" : "neutral" }, "ui-badge--compact")}</div>
          </article>
        `).join("")}
      </div>
    </article>

    <div class="grid-2 equal risk-split-grid">
      <article class="tl-section-card risk-limits-surface">
        <div class="tl-section-header"><div class="tl-section-title">Configurar Límites</div></div>
        <div class="risk-limit-form">
          <label class="risk-input-field">
            <span>Capital inicial</span>
            <input type="number" step="100" value="${draft.capital}">
          </label>
          <label class="risk-input-field">
            <span>Max DD</span>
            <input type="number" step="0.1" value="${draft.maxDd}">
          </label>
          <label class="risk-input-field">
            <span>Riesgo / trade</span>
            <input type="number" step="0.05" value="${draft.riskTrade}">
          </label>
        </div>
        <div class="risk-limit-actions">
          <button class="btn btn-secondary" type="button" data-risk-reset>Reset</button>
          <button class="btn btn-primary" type="button" data-risk-save>Guardar local</button>
        </div>
        <div class="risk-limit-note">Ajuste local del panel. La persistencia real llegará con la siguiente fase de configuración.</div>
      </article>

      <article class="tl-section-card">
        <div class="tl-section-header"><div class="tl-section-title">Reglas Stop Diario</div></div>
        <div class="breakdown-list">
          ${risk.stopRules.map((rule) => `
            <div class="list-row">
              <div><div class="row-title">${rule.text}</div><div class="row-sub">Disciplina operativa KMFX</div></div>
              <div class="row-chip">${rule.tone.toUpperCase()}</div>
              <div class="row-pnl ${rule.tone === "green" ? "metric-positive" : rule.tone === "red" ? "metric-negative" : ""}">${rule.tone === "green" ? "OK" : rule.tone === "red" ? "STOP" : "WATCH"}</div>
            </div>
          `).join("")}
        </div>
      </article>
    </div>

    <article class="tl-section-card risk-ladder-surface">
      <div class="tl-section-header"><div class="tl-section-title">Escalera de Riesgo Dinámica</div></div>
      ${renderLadderProgress(ladder, ladderLevel)}
      <div class="table-wrap risk-ladder-table">
        <table>
          <thead><tr><th>Nivel</th><th>Riesgo/Trade</th><th>Condición Entrada</th><th>Condición Subida</th><th>Condición Bajada</th><th>Trades a $100k</th><th>Estado</th></tr></thead>
          <tbody>
            ${ladder.map((row) => `
              <tr>
                <td>${row.level}</td>
                <td>${row.riskPct.toFixed(2)}%</td>
                <td>${row.entryCondition}</td>
                <td>${row.riseCondition}</td>
                <td>${row.fallCondition}</td>
                <td>${row.tradesTo100k}</td>
                <td>${badgeMarkup({ label: row.state, tone: row.level === "PROTECT" ? "warn" : row.level === "MAX" ? "info" : "neutral" }, "ui-badge--compact")}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </article>

    <div class="grid-2 equal risk-split-grid">
      <article class="tl-section-card">
        <div class="tl-section-header"><div class="tl-section-title">Monitor de Riesgo</div></div>
        <div class="score-bar-row"><span>Límite diario</span><div class="risk-track"><div class="risk-fill" style="width:${(model.riskProfile.dailyLossLimitPct || 1.2) * 50}%;background:var(--gold)"></div></div><strong>${(model.riskProfile.dailyLossLimitPct || 1.2).toFixed(2)}%</strong></div>
        <div class="score-bar-row"><span>Heat semanal</span><div class="risk-track"><div class="risk-fill" style="width:${Math.min(model.totals.drawdown.maxPct * 10, 100)}%;background:var(--red)"></div></div><strong>${formatPercent(model.totals.drawdown.maxPct)}</strong></div>
        <div class="score-bar-row"><span>Exposición abierta</span><div class="risk-track"><div class="risk-fill" style="width:${Math.min((Math.abs(model.account.openPnl) / 1500) * 100, 100)}%;background:var(--accent)"></div></div><strong>${formatCurrency(model.account.openPnl)}</strong></div>
      </article>
      <article class="tl-section-card">
        <div class="tl-section-header"><div class="tl-section-title">Risk Ledger</div></div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Métrica</th><th>Valor</th><th>Comentario</th></tr></thead>
            <tbody>
              ${risk.ledger.map((item) => `
                <tr>
                  <td>${item.metric}</td>
                  <td>${item.format === "currency" ? formatCurrency(item.value) : item.format === "percent" ? formatPercent(item.value) : Number(item.value).toFixed(2)}</td>
                  <td>${item.note}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </article>
    </div>
    </div>
  `;

  const formInputs = root.querySelectorAll(".risk-limit-form input");
  formInputs.forEach((input) => {
    input.addEventListener("input", () => {
      const [capitalInput, maxDdInput, riskTradeInput] = root.querySelectorAll(".risk-limit-form input");
      root.__riskDraft = {
        capital: Number(capitalInput.value || 0),
        maxDd: Number(maxDdInput.value || 0),
        riskTrade: Number(riskTradeInput.value || 0)
      };
    });
  });

  root.querySelector("[data-risk-reset]")?.addEventListener("click", () => {
    root.__riskDraft = {
      capital: Number(model.account.balance || 0),
      maxDd: Number(model.account.maxDrawdownLimit || 0),
      riskTrade: Number(model.riskProfile.maxTradeRiskPct || 0)
    };
    renderRisk(root, state);
  });

  root.querySelector("[data-risk-save]")?.addEventListener("click", () => {
    const [capitalInput, maxDdInput, riskTradeInput] = root.querySelectorAll(".risk-limit-form input");
    root.__riskDraft = {
      capital: Number(capitalInput.value || 0),
      maxDd: Number(maxDdInput.value || 0),
      riskTrade: Number(riskTradeInput.value || 0)
    };
    const note = root.querySelector(".risk-limit-note");
    if (note) note.textContent = "Ajuste local guardado en la sesión actual del panel.";
  });

  attachArcInteractions(root);
  const axisLine = getComputedStyle(document.documentElement).getPropertyValue("--chart-axis-line").trim() || undefined;
  mountCharts(root, [
    lineAreaSpec("risk-drawdown-curve", model.drawdownCurve, {
      tone: "red",
      showAxisBorder: true,
      axisBorderColor: axisLine,
      axisBorderWidth: 1,
      borderWidth: 2.2,
      pointHoverRadius: 3,
      minimalTooltip: true,
      formatter: (value) => formatPercent(value),
      axisFormatter: (value) => `${Number(value).toFixed(1)}%`,
      fillAlphaStart: 0.12,
      fillAlphaEnd: 0.015,
      glowAlpha: 0.1
    })
  ]);
}
