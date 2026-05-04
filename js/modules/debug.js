import { formatDateTime } from "./utils.js?v=build-20260504-070424";
import { badgeMarkup, getConnectionStatusMeta, getFundedStatusMeta, getRiskStatusMeta, getWorkspaceStatusMeta } from "./status-badges.js?v=build-20260504-070424";

export function renderDebug(root, state) {
  if (state?.auth?.user?.role !== "admin") {
    root.innerHTML = "";
    return;
  }
  root.innerHTML = `
    <div class="debug-page-stack">
    <div class="tl-page-header">
      <div class="tl-page-title">Diagnóstico</div>
      <div class="tl-page-sub">Panel local para revisar salud del store, adapters y superficie del frontend antes de integrar datos live.</div>
    </div>

    <div class="grid-2 equal">
      <article class="tl-section-card">
        <div class="tl-section-header"><div class="tl-section-title">Paneles del sistema</div></div>
        <div class="breakdown-list">
          ${state.workspace.debug.panels.map((panel) => `
            <div class="list-row">
              <div>
                <div class="row-title">${panel.name}</div>
                <div class="row-sub">${panel.detail}</div>
              </div>
              ${badgeMarkup({ label: panel.value, tone: "neutral" }, "ui-badge--compact")}
            </div>
          `).join("")}
        </div>
      </article>

      <article class="tl-section-card">
        <div class="tl-section-header"><div class="tl-section-title">Checkpoints del runtime</div></div>
        <div class="info-list compact">
          ${state.workspace.debug.checkpoints.map((checkpoint) => `
            <div><strong>${checkpoint.label}</strong><span>${checkpoint.label === "Página actual" ? state.ui.activePage : checkpoint.label === "Cuenta actual" ? state.currentAccount : checkpoint.value}</span></div>
          `).join("")}
          <div><strong>Cuentas cargadas</strong><span>${Object.keys(state.accounts).length}</span></div>
          <div><strong>Módulos del workspace</strong><span>${Object.keys(state.workspace).length}</span></div>
          <div><strong>Tema</strong><span>${state.ui.theme === "dark" ? "Oscuro" : "Claro"}</span></div>
        </div>
      </article>
    </div>

    <article class="tl-section-card">
      <div class="tl-section-header"><div class="tl-section-title">Runtime por cuenta</div></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Cuenta</th><th>Origen</th><th>Estado</th><th>Último sync</th><th>Error</th><th>Riesgo</th><th>Fondeo</th></tr></thead>
          <tbody>
            ${Object.values(state.accounts).map((account) => `
              <tr>
                <td>${account.name}</td>
                <td>${badgeMarkup(getWorkspaceStatusMeta(account.connection.source), "ui-badge--compact")}</td>
                <td>${badgeMarkup(getConnectionStatusMeta(account.connection), "ui-badge--compact")}</td>
                <td>${formatDateTime(account.connection.lastSync)}</td>
                <td>${account.connection.lastError || "—"}</td>
                <td>${badgeMarkup(getRiskStatusMeta(account.compliance), "ui-badge--compact")}</td>
                <td>${badgeMarkup(getFundedStatusMeta(state.workspace.fundedAccounts.find((item) => item.accountId === account.id)?.status, account.compliance), "ui-badge--compact")}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </article>

    <article class="tl-section-card">
      <div class="tl-section-header"><div class="tl-section-title">Modelo actual</div></div>
      <div class="info-list compact">
        <div><strong>Cuenta activa</strong><span>${state.currentAccount}</span></div>
        <div><strong>Perfil</strong><span>${state.accounts[state.currentAccount]?.model?.profile?.desk || "—"}</span></div>
        <div><strong>Operaciones totales</strong><span>${state.accounts[state.currentAccount]?.model?.totals?.totalTrades || 0}</span></div>
        <div><strong>Score de riesgo</strong><span>${state.accounts[state.currentAccount]?.model?.totals?.riskScore || 0}</span></div>
        <div><strong>Última actualización</strong><span>${formatDateTime(state.accounts[state.currentAccount]?.connection?.lastSync)}</span></div>
      </div>
    </article>

    <article class="tl-section-card">
      <div class="tl-section-header"><div class="tl-section-title">Contexto de restauración</div></div>
      <p class="body-copy">Esta página sustituye por ahora al debug legacy ligado al bridge. La meta es que, cuando llegue MT5, el adapter layer solo tenga que poblar el store y esta superficie pueda enriquecerse con sync timestamps, payload stats y errores de normalización sin reescribir el frontend.</p>
    </article>
    </div>
  `;
}
