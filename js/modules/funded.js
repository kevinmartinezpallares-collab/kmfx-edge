import { openModal } from "./modal-system.js";
import { formatCurrency, formatDateTime, formatPercent } from "./utils.js";
import { badgeMarkup, getConnectionStatusMeta, getFundedStatusMeta } from "./status-badges.js";

export function initFunded(store) {
  const root = document.getElementById("fundedRoot");
  if (!root) return;

  root.addEventListener("click", (event) => {
    const button = event.target.closest("[data-funded-action='view']");
    if (!button) return;
    const account = store.getState().workspace.fundedAccounts.find((item) => item.id === button.dataset.fundedId);
    if (!account) return;

    openModal({
      title: `${account.firm} · ${account.label}`,
      subtitle: "Detalle de cuenta fondeada",
      maxWidth: 560,
      content: `
        <div class="info-list compact">
          <div><strong>Fase</strong><span>${account.phase}</span></div>
          <div><strong>Tamaño</strong><span>${formatCurrency(account.size)}</span></div>
          <div><strong>Balance</strong><span>${formatCurrency(account.balance)}</span></div>
          <div><strong>Target</strong><span>${account.targetPct ? formatPercent(account.targetPct) : "Fondeada"}</span></div>
          <div><strong>DD Diario</strong><span>${formatPercent(account.dailyDdPct)}</span></div>
          <div><strong>DD Total</strong><span>${formatPercent(account.maxDdPct)}</span></div>
          <div><strong>Días</strong><span>${account.daysRemaining || "Sin límite"}</span></div>
          <div><strong>Inicio</strong><span>${account.startDate ? formatDateTime(account.startDate) : "—"}</span></div>
          <div><strong>Notas</strong><span>${account.notes || "Sin observaciones operativas."}</span></div>
        </div>
      `
    });
  });
}

export function renderFunded(root, state) {
  const funded = state.workspace.fundedAccounts.map((account, index) => enrichFundedAccount(account, state.accounts[account.accountId], index));
  const totalBalance = funded.reduce((sum, item) => sum + item.balance, 0);
  const onTrack = funded.filter((item) => item.status === "on-track" || item.status === "funded").length;
  const bestProgress = Math.max(...funded.map((item) => item.progressPct), 0);
  const ladder = fundedRiskLadder();
  const phaseRules = fundedPhaseRules();
  const stopRules = fundedStopRules();

  root.innerHTML = `
    <div class="funded-page-stack">
    <div class="tl-page-header">
      <div class="tl-page-title">Funded / Challenge Manager</div>
      <div class="tl-page-sub">Seguimiento de cuentas fondeadas, fases, escalera de riesgo y disciplina diaria.</div>
    </div>

    <div class="tl-kpi-row five">
      <article class="tl-kpi-card"><div class="tl-kpi-label">Challenges</div><div class="tl-kpi-val">${funded.length}</div></article>
      <article class="tl-kpi-card"><div class="tl-kpi-label">En objetivo</div><div class="tl-kpi-val green">${onTrack}</div></article>
      <article class="tl-kpi-card"><div class="tl-kpi-label">Balance agregado</div><div class="tl-kpi-val">${formatCurrency(totalBalance)}</div></article>
      <article class="tl-kpi-card"><div class="tl-kpi-label">Mayor progreso</div><div class="tl-kpi-val">${formatPercent(bestProgress)}</div></article>
      <article class="tl-kpi-card"><div class="tl-kpi-label">Sistema</div><div class="tl-kpi-val">Operativo</div></article>
    </div>

    <div class="funded-grid funded-challenge-grid">
      ${funded.map((account) => `
        <article class="tl-section-card funded-challenge-card">
          <div class="tl-section-header">
            <div>
              <div class="tl-section-title">${account.firm}</div>
              <div class="row-sub">${account.label} · ${account.phase}</div>
            </div>
            ${badgeMarkup(getFundedStatusMeta(account.status, account.linked?.compliance), "ui-badge--compact")}
          </div>
          <div class="detail-metrics-grid">
            <div class="metric-item"><div class="metric-label">Tamaño</div><div class="metric-value">${formatCurrency(account.size)}</div></div>
            <div class="metric-item"><div class="metric-label">Balance</div><div class="metric-value">${formatCurrency(account.balance)}</div></div>
            <div class="metric-item"><div class="metric-label">Target</div><div class="metric-value">${account.targetPct ? formatPercent(account.targetPct) : "Fondeada"}</div></div>
            <div class="metric-item"><div class="metric-label">DD</div><div class="metric-value">${formatPercent(account.maxDdPct)}</div></div>
            <div class="metric-item"><div class="metric-label">Daily DD</div><div class="metric-value">${formatPercent(account.dailyDdPct)}</div></div>
            <div class="metric-item"><div class="metric-label">Días</div><div class="metric-value">${account.daysRemaining || "Sin límite"}</div></div>
            <div class="metric-item"><div class="metric-label">Inicio</div><div class="metric-value">${account.startDate ? new Date(account.startDate).toLocaleDateString("es-ES") : "—"}</div></div>
            <div class="metric-item"><div class="metric-label">Conexión</div><div class="metric-value">${badgeMarkup(getConnectionStatusMeta(account.linked?.connection || {}), "ui-badge--compact")}</div></div>
          </div>
          <div class="goal-card-sub">${account.notes}</div>
          <div class="settings-actions">
            <button class="btn-secondary" data-funded-action="view" data-funded-id="${account.id}">Ver detalle</button>
          </div>
        </article>
      `).join("")}
    </div>

    <div class="grid-2 equal">
      <article class="tl-section-card">
        <div class="tl-section-header"><div class="tl-section-title">Sistema de Riesgo Dinámico</div></div>
        <div class="breakdown-list">
          <div class="list-row"><div><div class="row-title">Protocolo base</div><div class="row-sub">Reducir tamaño al primer signo de pérdida de control.</div></div><div class="row-chip">KMFX Method</div></div>
          <div class="list-row"><div><div class="row-title">Escalado</div><div class="row-sub">Solo subir riesgo cuando se consolida consistencia y equity.</div></div><div class="row-chip">Controlado</div></div>
          <div class="list-row"><div><div class="row-title">Protección</div><div class="row-sub">Activar PROTECT cuando la curva se deteriora o el DD presiona.</div></div><div class="row-chip">Automático</div></div>
        </div>
      </article>

      <article class="tl-section-card">
        <div class="tl-section-header"><div class="tl-section-title">Progresión Visual</div></div>
        <div class="funded-progression">
          ${["BASE", "+2", "MAX", "PROTECT"].map((step, index) => `
            <div class="funded-progress-step ${index === 0 ? "active" : ""}">
              <div class="funded-progress-dot"></div>
              <div class="funded-progress-label">${step}</div>
            </div>
          `).join("")}
        </div>
      </article>
    </div>

    <article class="tl-section-card risk-ladder-surface">
      <div class="tl-section-header"><div class="tl-section-title">Escalera de riesgo por trade</div></div>
      <div class="table-wrap risk-ladder-table">
        <table>
          <thead><tr><th>Nivel</th><th>Riesgo/Trade</th><th>Condición Entrada</th><th>Condición Subida</th><th>Condición Bajada</th><th>Trades/Día</th><th>Estado</th></tr></thead>
          <tbody>
            ${ladder.map((row) => `
              <tr>
                <td>${row.level}</td>
                <td>${row.risk}</td>
                <td>${row.entry}</td>
                <td>${row.up}</td>
                <td>${row.down}</td>
                <td>${row.trades}</td>
                <td>${badgeMarkup({ label: row.state, tone: row.tone }, "ui-badge--compact")}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </article>

    <div class="grid-2 equal">
      <article class="tl-section-card">
        <div class="tl-section-header"><div class="tl-section-title">Reglas por fase</div></div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Fase</th><th>Objetivo</th><th>DD Diario</th><th>DD Total</th><th>Riesgo Inicial</th><th>Riesgo Máximo</th><th>Trades/Día</th><th>Mentalidad</th></tr></thead>
            <tbody>
              ${phaseRules.map((row) => `
                <tr>
                  <td>${row.phase}</td>
                  <td>${row.target}</td>
                  <td>${row.dailyDd}</td>
                  <td>${row.maxDd}</td>
                  <td>${row.initialRisk}</td>
                  <td>${row.maxRisk}</td>
                  <td>${row.tradesPerDay}</td>
                  <td>${row.mindset}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </article>

      <article class="tl-section-card">
        <div class="tl-section-header"><div class="tl-section-title">Reglas de Stop Diario</div></div>
        <div class="breakdown-list">
          ${stopRules.map((rule) => `
            <div class="list-row">
              <div>
                <div class="row-title">${rule.title}</div>
                <div class="row-sub">${rule.detail}</div>
              </div>
              <div class="row-chip">${rule.state}</div>
            </div>
          `).join("")}
        </div>
      </article>
    </div>
    </div>
  `;
}

function enrichFundedAccount(account, linked, index) {
  return {
    ...account,
    linked,
    startDate: account.startDate || `2026-0${Math.min(index + 1, 3)}-0${index + 4}T09:00:00`,
    notes: account.notes || (account.status === "funded"
      ? "Cuenta fondeada con foco en preservar capital y consolidar consistencia."
      : "Challenge activo con atención a DD diario, disciplina y progresión estable.")
  };
}

function fundedRiskLadder() {
  return [
    { level: "BASE", risk: "0.25%", entry: "Inicio challenge", up: "2R netos", down: "DD diario > 1.5%", trades: "2", state: "Base", tone: "neutral" },
    { level: "+1", risk: "0.35%", entry: "Semana limpia", up: "4R netos", down: "2 pérdidas", trades: "2", state: "Escalando", tone: "info" },
    { level: "+2", risk: "0.45%", entry: "Consistencia validada", up: "6R netos", down: "DD > 3%", trades: "3", state: "Objetivo", tone: "ok" },
    { level: "+3", risk: "0.55%", entry: "Curva fuerte", up: "8R netos", down: "Pérdida semanal", trades: "3", state: "Expansión", tone: "ok" },
    { level: "MAX", risk: "0.65%", entry: "Alta convicción", up: "Solo setups A+", down: "1 error grave", trades: "2", state: "Controlado", tone: "warn" },
    { level: "PROTECT", risk: "0.15%", entry: "DD o fatiga", up: "Recuperar estabilidad", down: "Nuevo stop", trades: "1", state: "Defensivo", tone: "warn" }
  ];
}

function fundedPhaseRules() {
  return [
    { phase: "Phase 1", target: "8%", dailyDd: "5%", maxDd: "10%", initialRisk: "0.25%", maxRisk: "0.65%", tradesPerDay: "2-3", mindset: "Validar edge" },
    { phase: "Phase 2", target: "5%", dailyDd: "5%", maxDd: "10%", initialRisk: "0.25%", maxRisk: "0.55%", tradesPerDay: "2", mindset: "Preservar + ejecutar" },
    { phase: "Funded", target: "Consistencia", dailyDd: "5%", maxDd: "10%", initialRisk: "0.20%", maxRisk: "0.45%", tradesPerDay: "1-2", mindset: "Capital primero" }
  ];
}

function fundedStopRules() {
  return [
    { title: "Stop inmediato", detail: "Cerrar sesión si se alcanza el DD diario permitido o dos errores de ejecución consecutivos.", state: "STOP" },
    { title: "Go condicional", detail: "Solo continuar si el plan del día sigue válido y la sesión mantiene estructura.", state: "GO" },
    { title: "Protect mode", detail: "Reducir riesgo y frecuencia si la curva pierde consistencia o el estado mental cae.", state: "PROTECT" }
  ];
}
