import { formatDateTime } from "./utils.js?v=build-20260401-203500";
import { showToast } from "./toast.js?v=build-20260401-203500";

function accountStatusMeta(status = "") {
  if (status === "connected") return { label: "Conectada", tone: "ok" };
  if (status === "pending") return { label: "Pendiente", tone: "info" };
  if (status === "error") return { label: "Error", tone: "error" };
  return { label: "Desconectada", tone: "neutral" };
}

function badge(meta = {}) {
  return `<span class="ui-badge ui-badge--${meta.tone || "neutral"} ui-badge--compact">${meta.label || "Estado"}</span>`;
}

export function initConnections(store) {
  const root = document.getElementById("connectionsRoot");
  if (!root) return;

  root.addEventListener("click", (event) => {
    const useButton = event.target.closest("[data-account-use]");
    if (useButton) {
      const accountId = useButton.dataset.accountUse;
      if (!accountId) return;
      store.setState((state) => ({
        ...state,
        currentAccount: accountId,
      }));
      showToast("Cuenta activa actualizada", "success");
      return;
    }

    const addButton = event.target.closest("[data-account-add]");
    if (addButton) {
      showToast("Añade la cuenta instalando el connector y sincronizando con el bridge.", "default");
    }
  });
}

export function renderConnections(root, state) {
  const liveAccountIds = Array.isArray(state.liveAccountIds) ? state.liveAccountIds : [];
  const accountDirectory = state.accountDirectory && typeof state.accountDirectory === "object" ? state.accountDirectory : {};
  const liveAccounts = liveAccountIds
    .map((accountId) => accountDirectory[accountId])
    .filter(Boolean);
  const connectedAccounts = liveAccounts.filter((account) => account.status === "connected");
  const pendingAccounts = liveAccounts.filter((account) => account.status === "pending");
  const erroredAccounts = liveAccounts.filter((account) => account.status === "error");

  if (!liveAccounts.length) {
    root.innerHTML = `
      <div class="tl-page-header">
        <div class="tl-page-title">Cuentas</div>
        <div class="tl-page-sub">Gestiona las cuentas reales conectadas a KMFX Edge y úsalas como fuente de verdad del dashboard.</div>
      </div>

      <article class="tl-section-card accounts-empty-state">
        <div class="tl-section-header">
          <div>
            <div class="tl-section-title">Sin cuentas conectadas</div>
            <div class="row-sub">El dashboard mostrará cuentas reales cuando el bridge o el connector MT5 sincronicen una cuenta.</div>
          </div>
          <button class="btn-primary" type="button" data-account-add="true">Añadir cuenta</button>
        </div>
        <div class="connections-guide-grid">
          <article class="connection-step-card">
            <div class="row-chip">1</div>
            <div class="row-title">Instala el connector</div>
            <div class="row-sub">Activa el KMFX Connector dentro de MT5 con el endpoint autorizado.</div>
          </article>
          <article class="connection-step-card">
            <div class="row-chip">2</div>
            <div class="row-title">Sincroniza la cuenta</div>
            <div class="row-sub">El backend registrará broker, servidor, login y último sync como cuenta real.</div>
          </article>
          <article class="connection-step-card">
            <div class="row-chip">3</div>
            <div class="row-title">Usa la cuenta en Panel</div>
            <div class="row-sub">La cuenta conectada aparecerá como opción real en el selector del dashboard.</div>
          </article>
        </div>
      </article>
    `;
    return;
  }

  root.innerHTML = `
    <div class="tl-page-header">
      <div class="tl-page-title">Cuentas</div>
      <div class="tl-page-sub">Fuente única de verdad para broker, conexión, sincronización y selección activa del dashboard.</div>
    </div>

    <div class="tl-kpi-row four">
      <article class="tl-kpi-card"><div class="tl-kpi-label">Conectadas</div><div class="tl-kpi-val green">${connectedAccounts.length}</div></article>
      <article class="tl-kpi-card"><div class="tl-kpi-label">Pendientes</div><div class="tl-kpi-val">${pendingAccounts.length}</div></article>
      <article class="tl-kpi-card"><div class="tl-kpi-label">Errores</div><div class="tl-kpi-val">${erroredAccounts.length}</div></article>
      <article class="tl-kpi-card"><div class="tl-kpi-label">Cuenta activa</div><div class="tl-kpi-val">${state.accounts?.[state.currentAccount]?.name || "Sin cuenta"}</div></article>
    </div>

    <article class="tl-section-card">
      <div class="tl-section-header">
        <div>
          <div class="tl-section-title">Cuentas conectadas</div>
          <div class="row-sub">Cada cuenta conserva estado, modo de conexión y última sincronización desde backend.</div>
        </div>
        <button class="btn-primary" type="button" data-account-add="true">Añadir cuenta</button>
      </div>
      <div class="connections-grid">
        ${liveAccounts.map((account) => {
          const statusMeta = accountStatusMeta(account.status);
          const isActive = account.accountId === state.currentAccount;
          return `
            <article class="tl-section-card ${isActive ? "account-registry-card--active" : ""}">
              <div class="tl-section-header">
                <div>
                  <div class="tl-section-title">${account.displayName}</div>
                  <div class="row-sub">${account.platform?.toUpperCase?.() || "MT5"} · ${account.connectionMode || "bridge"}</div>
                </div>
                ${badge(statusMeta)}
              </div>
              <div class="info-list compact">
                <div><strong>Broker</strong><span>${account.broker || "—"}</span></div>
                <div><strong>Login</strong><span>${account.login || "—"}</span></div>
                <div><strong>Servidor</strong><span>${account.server || "—"}</span></div>
                <div><strong>Último sync</strong><span>${formatDateTime(account.lastSyncAt)}</span></div>
              </div>
              <div class="settings-actions">
                <button class="btn-secondary" type="button" data-account-use="${account.accountId}">${isActive ? "Cuenta en uso" : "Usar en Panel"}</button>
              </div>
            </article>
          `;
        }).join("")}
      </div>
    </article>
  `;
}
