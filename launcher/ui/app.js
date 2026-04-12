const state = {
  view: "home",
  status: null,
  installations: [],
  appInfo: {},
  diagnostics: {},
  busy: false,
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

function bridgeReady() {
  return Boolean(window.pywebview && window.pywebview.api);
}

async function callApi(method, ...args) {
  if (!bridgeReady()) {
    throw new Error("La API local todavía no está disponible.");
  }
  return window.pywebview.api[method](...args);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => toast.classList.remove("is-visible"), 2800);
}

function setBusy(isBusy) {
  state.busy = isBusy;
  $$(".tool-actions button, #refreshHome, #redetectButton, #openFolderButton").forEach((button) => {
    button.disabled = isBusy;
  });
}

function setView(view) {
  state.view = view;
  $$(".nav-item").forEach((item) => item.classList.toggle("is-active", item.dataset.view === view));
  $$(".view").forEach((section) => section.classList.remove("is-visible"));
  $(`#view-${view}`)?.classList.add("is-visible");
  render();
}

function connectorState() {
  const status = state.status || {};
  if (status.repair_recommended) {
    return { label: "Reparación recomendada", tone: "warning", mode: "repair" };
  }
  if (status.connector_installed) {
    return { label: "Instalado", tone: "success", mode: "installed" };
  }
  return { label: "No instalado", tone: "neutral", mode: "missing" };
}

function renderSidebar() {
  const status = state.status || {};
  const statusBox = $("#sidebarStatus");
  let title = "Pendiente";
  let caption = "Servicio local no disponible";
  let tone = "pending";

  if (status.service_on && status.mt5_count > 0) {
    title = "Servicio activo";
    caption = `${status.mt5_count} instalación MT5 detectada${status.mt5_count === 1 ? "" : "s"}`;
    tone = "ok";
  } else if (status.service_on) {
    title = "Servicio activo";
    caption = "MetaTrader no detectado";
    tone = "pending";
  } else if (status.mt5_count === 0) {
    title = "Pendiente";
    caption = "Buscando MetaTrader";
    tone = "pending";
  }

  statusBox.innerHTML = `
    <span class="status-dot status-${tone}"></span>
    <div>
      <p>${escapeHtml(title)}</p>
      <small>${escapeHtml(caption)}</small>
    </div>
  `;
}

function renderHome() {
  const status = state.status || {};
  const appInfo = state.appInfo || {};
  const connector = connectorState();
  const badge = $("#connectorBadge");
  badge.textContent = connector.label;
  badge.className = `status-badge ${connector.tone}`;

  $("#connectorVersion").textContent = `Connector v${appInfo.connector_version || "—"}`;

  const lines = [];
  lines.push(status.mt5_count > 0 ? "MetaTrader detectado" : "MetaTrader no detectado");
  lines.push(status.service_on ? "Servicio local activo" : "Servicio local inactivo");
  lines.push(status.last_sync_ago || "Sin sincronización reciente");
  $("#toolStatusLines").innerHTML = lines.map((item) => `<span>${escapeHtml(item)}</span>`).join("");

  const actions = $("#toolActions");
  const canUseMt5 = status.mt5_count > 0;
  if (connector.mode === "repair") {
    actions.innerHTML = `
      <button class="primary-button" data-action="repair" ${canUseMt5 ? "" : "disabled"}>Reparar</button>
      <button class="secondary-button" data-action="open" ${canUseMt5 ? "" : "disabled"}>Abrir MT5</button>
    `;
  } else if (connector.mode === "installed") {
    actions.innerHTML = `
      <button class="secondary-button" data-action="install" ${canUseMt5 ? "" : "disabled"}>Reinstalar</button>
      <button class="secondary-button" data-action="open" ${canUseMt5 ? "" : "disabled"}>Abrir MT5</button>
    `;
  } else {
    actions.innerHTML = `<button class="primary-button" data-action="install" ${canUseMt5 ? "" : "disabled"}>Instalar</button>`;
  }
}

function renderInstallations() {
  const container = $("#installationList");
  if (!state.installations.length) {
    container.innerHTML = `<div class="empty-state">No se ha detectado MetaTrader 5 en este equipo.</div>`;
    return;
  }
  container.innerHTML = state.installations
    .map(
      (installation) => `
        <div class="installation-row">
          <strong>${escapeHtml(installation.label)}</strong>
          <code>${escapeHtml(installation.data_path)}</code>
          <code>${escapeHtml(installation.experts_path)}</code>
        </div>
      `,
    )
    .join("");
}

function renderAppInfo() {
  const status = state.status || {};
  const appInfo = state.appInfo || {};
  const rows = [
    ["Versión del Launcher", appInfo.launcher_version || "—"],
    ["Versión del Connector", appInfo.connector_version || "—"],
    ["Backend URL", appInfo.backend_url || status.backend_base_url || "—"],
    ["Servicio local", status.service_on ? appInfo.service_url || "Activo" : "Inactivo"],
  ];
  $("#appInfo").innerHTML = rows
    .map(
      ([label, value]) => `
        <div class="info-item">
          <div class="info-label">${escapeHtml(label)}</div>
          <div class="info-value">${escapeHtml(value)}</div>
        </div>
      `,
    )
    .join("");
}

function renderDiagnostics() {
  const diagnostics = state.diagnostics || {};
  $("#diagnosticsBody").innerHTML = `
    <div class="diagnostic-block">
      <div class="info-label">Connection key</div>
      <div class="diagnostic-code">${escapeHtml(diagnostics.connection_key || "No configurada")}</div>
    </div>
    <div class="diagnostic-block">
      <div class="info-label">Estado backend</div>
      <div class="diagnostic-code">${diagnostics.backend_reachable ? "Reachable" : "Unreachable"} · HTTP ${escapeHtml(diagnostics.backend_status_code || 0)}</div>
    </div>
    <div class="diagnostic-block">
      <div class="info-label">Rutas técnicas</div>
      <div class="diagnostic-code">Terminal: ${escapeHtml(diagnostics.selected_terminal_path || "—")}</div>
      <div class="diagnostic-code">Data: ${escapeHtml(diagnostics.selected_data_path || "—")}</div>
      <div class="diagnostic-code">Experts: ${escapeHtml(diagnostics.selected_experts_path || "—")}</div>
    </div>
    <div class="diagnostic-block">
      <div class="info-label">Logs recientes</div>
      <pre class="diagnostic-code">${escapeHtml(diagnostics.logs || "Sin logs recientes")}</pre>
    </div>
  `;
}

function render() {
  renderSidebar();
  renderHome();
  if (state.view === "settings") {
    renderInstallations();
    renderAppInfo();
    renderDiagnostics();
  }
}

async function loadAll() {
  try {
    const payload = await callApi("refresh");
    state.status = payload.status || {};
    state.installations = payload.installations || [];
    state.appInfo = payload.app_info || {};
    state.diagnostics = await callApi("get_diagnostics");
    render();
  } catch (error) {
    showToast(error.message || "No se pudo refrescar el estado.");
  }
}

async function refreshStatusOnly() {
  try {
    state.status = await callApi("get_status");
    if (state.view === "settings") {
      state.diagnostics = await callApi("get_diagnostics");
    }
    render();
  } catch (error) {
    render();
  }
}

async function performAction(action) {
  if (state.busy) return;
  setBusy(true);
  try {
    let result;
    if (action === "open") {
      result = await callApi("open_mt5");
    } else if (action === "repair") {
      result = await callApi("repair_connector");
    } else {
      result = await callApi("install_connector");
    }
    showToast(result.message || (result.ok ? "Acción completada." : "No se pudo completar la acción."));
    await loadAll();
  } catch (error) {
    showToast(error.message || "No se pudo completar la acción.");
  } finally {
    setBusy(false);
  }
}

async function init() {
  $$(".nav-item").forEach((item) => item.addEventListener("click", () => setView(item.dataset.view)));
  $("#refreshHome").addEventListener("click", loadAll);
  $("#redetectButton").addEventListener("click", loadAll);
  $("#openFolderButton").addEventListener("click", async () => {
    try {
      const result = await callApi("open_mt5_folder");
      showToast(result.message || (result.ok ? "Carpeta abierta." : "No se pudo abrir la carpeta."));
    } catch (error) {
      showToast(error.message || "No se pudo abrir la carpeta.");
    }
  });
  $("#toolActions").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (button) performAction(button.dataset.action);
  });

  try {
    const payload = await callApi("startup");
    state.status = payload.status || {};
    state.installations = payload.installations || [];
    state.appInfo = payload.app_info || {};
    state.diagnostics = await callApi("get_diagnostics");
    render();
  } catch (error) {
    showToast(error.message || "No se pudo iniciar el launcher.");
    render();
  }

  window.setInterval(refreshStatusOnly, 3000);
}

window.addEventListener("pywebviewready", init);
