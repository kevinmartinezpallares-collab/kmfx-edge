import { connectAccount, disconnectAccount, reconnectAccount } from "./account-runtime.js";
import { formatDateTime, selectCurrentAccount, selectCurrentModel } from "./utils.js";
import { badgeMarkup, getConnectionStatusMeta, getWorkspaceStatusMeta } from "./status-badges.js";
import { showToast } from "./toast.js";

function connectionCatalogStatusMeta(status) {
  if (status === "ready") return { label: "Lista", tone: "ok" };
  if (status === "standby") return { label: "En espera", tone: "info" };
  if (status === "planned") return { label: "Planificada", tone: "neutral" };
  return { label: status, tone: "neutral" };
}

export function initConnections(store) {
  const root = document.getElementById("connectionsRoot");
  if (!root) return;

  root.addEventListener("click", (event) => {
    const button = event.target.closest("[data-connection-action]");
    if (!button) return;
    const id = button.dataset.connectionId;
    const action = button.dataset.connectionAction;

    if (action === "connect") {
      connectAccount(store, id);
      showToast("MT5 conectado", "success");
    }
    if (action === "disconnect") {
      disconnectAccount(store, id);
      showToast("Bridge desconectado", "error");
    }
    if (action === "reconnect") reconnectAccount(store, id);

    const addButton = event.target.closest("[data-connection-add='true']");
    if (addButton) {
      const nameInput = root.querySelector("[data-connection-field='name']");
      const urlInput = root.querySelector("[data-connection-field='url']");
      const name = nameInput?.value.trim();
      const url = urlInput?.value.trim();
      if (!name || !url) return;
      store.setState((state) => ({
        ...state,
        workspace: {
          ...state.workspace,
          connections: [
            {
              id: `conn-${Date.now()}`,
              name,
              provider: "Manual WS",
              status: "planned",
              endpoint: url,
              lastEvent: "Conexión preparada en frontend. Integración live pendiente.",
              accountId: state.currentAccount,
              syncMode: "Realtime-ready",
              health: 60
            },
            ...state.workspace.connections
          ]
        }
      }));
    }
  });
}

export function renderConnections(root, state) {
  const currentAccount = selectCurrentAccount(state);
  const model = selectCurrentModel(state);
  if (!currentAccount || !model) {
    root.innerHTML = "";
    return;
  }

  const connectedCount = Object.values(state.accounts).filter((account) => account.connection.state === "connected").length;
  const syncingCount = Object.values(state.accounts).filter((account) => account.connection.isSyncing).length;

  root.innerHTML = `
    <div class="tl-page-header">
      <div class="tl-page-title">Conexiones</div>
      <div class="tl-page-sub">Superficie preparada para futuras integraciones de cuentas, con estados, sincronización y preparación operativa.</div>
    </div>

    <div class="tl-kpi-row five">
      <article class="tl-kpi-card"><div class="tl-kpi-label">Cuenta activa</div><div class="tl-kpi-val">${currentAccount.name}</div></article>
      <article class="tl-kpi-card"><div class="tl-kpi-label">Conectadas</div><div class="tl-kpi-val green">${connectedCount}</div></article>
      <article class="tl-kpi-card"><div class="tl-kpi-label">Sync activo</div><div class="tl-kpi-val">${syncingCount}</div></article>
      <article class="tl-kpi-card"><div class="tl-kpi-label">Modelo actual</div><div class="tl-kpi-val">${model.profile.mode}</div></article>
      <article class="tl-kpi-card"><div class="tl-kpi-label">Origen</div><div class="tl-kpi-val">${currentAccount.connection.source}</div></article>
    </div>

    <div class="grid-2 equal">
      <article class="tl-section-card">
        <div class="tl-section-header"><div class="tl-section-title">Preparación de conexión</div></div>
        <div class="score-bar-row"><span>Modelo normalizado</span><div class="score-bar-track"><div class="score-bar-fill" style="width:100%;background:var(--green)"></div></div><strong>100%</strong></div>
        <div class="score-bar-row"><span>Store multi-cuenta</span><div class="score-bar-track"><div class="score-bar-fill" style="width:100%;background:var(--green)"></div></div><strong>100%</strong></div>
        <div class="score-bar-row"><span>Preparación del proveedor</span><div class="score-bar-track"><div class="score-bar-fill" style="width:76%;background:var(--accent)"></div></div><strong>76%</strong></div>
        <div class="score-bar-row"><span>Sync live</span><div class="score-bar-track"><div class="score-bar-fill" style="width:${connectedCount ? 64 : 18}%;background:${connectedCount ? "var(--gold)" : "var(--red)"}"></div></div><strong>${connectedCount ? "Simulado" : "Inactivo"}</strong></div>
      </article>

      <article class="tl-section-card">
        <div class="tl-section-header"><div class="tl-section-title">Mapa actual del workspace</div></div>
        <div class="info-list compact">
          <div><strong>Cuenta actual</strong><span>${currentAccount.name}</span></div>
          <div><strong>Broker</strong><span>${currentAccount.broker}</span></div>
          <div><strong>Tipo de origen</strong><span>${badgeMarkup(getWorkspaceStatusMeta(currentAccount.connection.source), "ui-badge--compact")}</span></div>
          <div><strong>Estado de conexión</strong><span>${badgeMarkup(getConnectionStatusMeta(currentAccount.connection), "ui-badge--compact")}</span></div>
          <div><strong>Último sync</strong><span>${formatDateTime(currentAccount.connection.lastSync)}</span></div>
        </div>
      </article>
    </div>

    <article class="tl-section-card">
      <div class="tl-section-header"><div class="tl-section-title">Cuentas MT5 conectadas</div></div>
      <div class="connections-grid">
        ${Object.values(state.accounts).map((account) => `
          <article class="tl-section-card">
            <div class="tl-section-header">
              <div>
                <div class="tl-section-title">${account.name}</div>
                <div class="row-sub">${account.broker} · ${account.connection.source}</div>
              </div>
              ${badgeMarkup(getConnectionStatusMeta(account.connection))}
            </div>
            <div class="info-list compact">
              <div><strong>Última actualización</strong><span>${formatDateTime(account.connection.lastSync)}</span></div>
              <div><strong>Reconexiones</strong><span>${account.connection.reconnectCount}</span></div>
              <div><strong>Error</strong><span>${account.connection.lastError || "—"}</span></div>
            </div>
            <div class="settings-actions">
              ${account.connection.state === "disconnected" ? `<button class="btn-primary" data-connection-action="connect" data-connection-id="${account.id}">Conectar</button>` : ""}
              ${account.connection.state === "connecting" ? `<button class="btn-secondary" disabled>Conectando...</button>` : ""}
              ${account.connection.state === "connected" ? `<button class="btn-secondary" data-connection-action="disconnect" data-connection-id="${account.id}">Desconectar</button>` : ""}
              ${account.connection.state === "error" ? `<button class="btn-primary" data-connection-action="reconnect" data-connection-id="${account.id}">Reconnect</button>` : ""}
            </div>
          </article>
        `).join("")}
      </div>
    </article>

    <div class="grid-2 equal">
      <article class="tl-section-card">
        <div class="tl-section-header"><div class="tl-section-title">Añadir cuenta</div></div>
        <div class="form-grid-clean">
          <label class="form-stack">
            <span>Nombre</span>
            <input type="text" placeholder="MT5 Main" data-connection-field="name">
          </label>
          <label class="form-stack">
            <span>WebSocket URL</span>
            <input type="url" placeholder="wss://bridge.kmfxedge.com" data-connection-field="url">
          </label>
        </div>
        <div class="settings-actions">
          <button class="btn-primary" type="button" data-connection-add="true">Conectar</button>
        </div>
      </article>

      <article class="tl-section-card">
        <div class="tl-section-header"><div class="tl-section-title">Guía de instalación EA</div></div>
        <div class="connections-guide-grid">
          <article class="connection-step-card">
            <div class="row-chip">1</div>
            <div class="row-title">Descargar EA</div>
            <div class="row-sub">Preparar el ejecutable y la configuración base del bridge.</div>
          </article>
          <article class="connection-step-card">
            <div class="row-chip">2</div>
            <div class="row-title">Configurar MT5</div>
            <div class="row-sub">Asignar permisos, símbolo base, endpoint y parámetros del entorno.</div>
          </article>
          <article class="connection-step-card">
            <div class="row-chip">3</div>
            <div class="row-title">Datos en vivo</div>
            <div class="row-sub">Validar handshake, heartbeat y llegada de datos al dashboard.</div>
          </article>
        </div>
      </article>
    </div>

    <div class="connections-grid">
      ${state.workspace.connections.map((connection) => `
        <article class="tl-section-card">
          <div class="tl-section-header">
            <div>
              <div class="tl-section-title">${connection.name}</div>
              <div class="row-sub">${connection.provider}</div>
            </div>
            ${badgeMarkup(connectionCatalogStatusMeta(connection.status))}
          </div>
          <div class="info-list compact">
            <div><strong>Endpoint</strong><span>${connection.endpoint}</span></div>
            <div><strong>Modo de sync</strong><span>${connection.syncMode}</span></div>
            <div><strong>Cuenta vinculada</strong><span>${state.accounts[connection.accountId]?.name || "Sin asignar"}</span></div>
            <div><strong>Salud</strong><span>${connection.health}%</span></div>
          </div>
          <p class="body-copy">${connection.lastEvent}</p>
        </article>
      `).join("")}
    </div>
  `;
}
