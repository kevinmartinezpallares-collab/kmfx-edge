const state = {
  view: "home",
  session: { authenticated: false, user: {} },
  status: {},
  installations: [],
  appInfo: {},
  diagnostics: {},
  busy: false,
  message: ""
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

function apiReady() {
  return Boolean(window.pywebview && window.pywebview.api);
}

async function callApi(method, ...args) {
  if (!apiReady()) {
    throw new Error("La API local del launcher todavía no está lista.");
  }
  return window.pywebview.api[method](...args);
}

function setBusy(value) {
  state.busy = Boolean(value);
  ["#login-submit", "#install-button", "#open-mt5-button", "#refresh-button", "#redetect-button", "#logout-button"].forEach((selector) => {
    const element = $(selector);
    if (element) element.disabled = state.busy;
  });
}

function showToast(message) {
  const toast = $("#toast");
  if (!toast || !message) return;
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("is-visible"), 2800);
}

function initials(name = "", email = "") {
  const source = String(name || email || "KMFX").trim();
  return source
    .split(/[ ._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "K";
}

function renderShell() {
  const authenticated = Boolean(state.session?.authenticated);
  $("#auth-screen")?.classList.toggle("is-hidden", authenticated);
  $("#app-shell")?.classList.toggle("is-hidden", !authenticated);
  document.body.classList.toggle("is-authenticated", authenticated);

  if (!authenticated) return;

  const user = state.session.user || {};
  $("#user-name").textContent = user.name || "Usuario KMFX";
  $("#user-email").textContent = user.email || "Sesión activa";
  $("#user-initials").textContent = initials(user.name, user.email);

  $$(".nav-item").forEach((item) => item.classList.toggle("is-active", item.dataset.view === state.view));
  $$(".view").forEach((view) => view.classList.toggle("is-active", view.id === `view-${state.view}`));
}

function statusClass(ok, warning = false) {
  if (ok) return "success";
  if (warning) return "warning";
  return "neutral";
}

function setPill(selector, text, kind) {
  const element = $(selector);
  if (!element) return;
  element.textContent = text;
  element.className = `${selector.includes("badge") ? "status-badge" : "signal"} ${kind}`;
}

function renderHome() {
  const status = state.status || {};
  const installed = Boolean(status.connector_installed);
  const hasMt5 = Number(status.mt5_count || 0) > 0;
  const serviceOn = Boolean(status.service_on);
  const recentSync = Boolean(status.has_recent_sync);
  const needsRepair = Boolean(status.repair_recommended);

  const badgeText = installed ? (needsRepair ? "Reparación recomendada" : "Instalado") : "No instalado";
  const badgeKind = installed ? (needsRepair ? "warning" : "success") : "neutral";
  setPill("#install-badge", badgeText, badgeKind);
  setPill("#service-chip", serviceOn ? "Servicio local activo" : "Servicio local pendiente", statusClass(serviceOn, !serviceOn));
  setPill("#mt5-chip", hasMt5 ? "MetaTrader detectado" : "MetaTrader no detectado", statusClass(hasMt5, !hasMt5));
  setPill("#sync-chip", status.last_sync_ago || "Sin sincronización reciente", statusClass(recentSync, !recentSync));

  const installButton = $("#install-button");
  const openButton = $("#open-mt5-button");
  if (installButton) {
    installButton.textContent = installed ? (needsRepair ? "Reparar" : "Reinstalar") : "Instalar";
    installButton.className = `button ${installed && !needsRepair ? "secondary" : "primary"}`;
  }
  if (openButton) openButton.disabled = state.busy || !hasMt5;

  const message = $("#status-message");
  if (!message) return;
  if (!hasMt5) {
    message.textContent = "No hemos encontrado MetaTrader 5 en este equipo. Instálalo o vuelve a detectar desde Configuración.";
  } else if (!installed) {
    message.textContent = "MetaTrader está detectado. Instala el connector para empezar a sincronizar con KMFX Edge.";
  } else if (recentSync) {
    message.textContent = "Tu cuenta está sincronizando correctamente con KMFX Edge.";
  } else {
    message.textContent = "Connector instalado. Abre MetaTrader 5 y asegúrate de que el EA esté activo.";
  }
}

function renderInstallations() {
  const container = $("#installations-list");
  if (!container) return;
  if (!state.installations.length) {
    container.innerHTML = `<div class="empty-state">No se detectaron instalaciones de MetaTrader 5.</div>`;
    return;
  }
  container.innerHTML = state.installations
    .map((installation) => `
      <article class="installation-row">
        <div>
          <strong>${escapeHtml(installation.label || "MetaTrader 5")}</strong>
          <span>${escapeHtml(installation.data_path || installation.terminal_path || "")}</span>
        </div>
        <span class="status-badge ${installation.connector_installed ? "success" : "neutral"}">
          ${installation.connector_installed ? "Connector instalado" : "Sin connector"}
        </span>
      </article>
    `)
    .join("");
}

function renderAppInfo() {
  const container = $("#app-info");
  if (!container) return;
  const rows = [
    ["Launcher", state.appInfo.launcher_version || "1.0.0"],
    ["Connector", state.appInfo.connector_version || "—"],
    ["Backend", state.appInfo.backend_url || "—"],
    ["Servicio local", state.status.service_on ? "Activo" : "Pendiente"]
  ];
  container.innerHTML = rows
    .map(([label, value]) => `
      <div class="info-row">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(String(value))}</strong>
      </div>
    `)
    .join("");
}

function renderDiagnostics() {
  const panel = $("#diagnostics-panel");
  if (!panel) return;
  const diagnostics = state.diagnostics || {};
  const rows = [
    ["Connection key", diagnostics.connection_key || "No disponible"],
    ["Backend reachable", diagnostics.backend_reachable ? "Sí" : "No"],
    ["Backend status", diagnostics.backend_status_code || "—"],
    ["Service URL", diagnostics.service_url || state.appInfo.service_url || "—"],
    ["Terminal", diagnostics.selected_terminal_path || "—"],
    ["Data path", diagnostics.selected_data_path || "—"],
    ["Experts", diagnostics.selected_experts_path || "—"]
  ];
  panel.innerHTML = `
    <div class="diagnostic-grid">
      ${rows.map(([label, value]) => `
        <div class="diagnostic-row">
          <span>${escapeHtml(label)}</span>
          <code>${escapeHtml(String(value))}</code>
        </div>
      `).join("")}
    </div>
    <pre>${escapeHtml((diagnostics.logs || []).join("\n"))}</pre>
  `;
}

function render() {
  renderShell();
  if (!state.session?.authenticated) return;
  renderHome();
  renderInstallations();
  renderAppInfo();
  renderDiagnostics();
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function loadAll() {
  const payload = await callApi("startup");
  state.status = payload.status || {};
  state.installations = payload.installations || [];
  state.appInfo = payload.app_info || {};
  state.session = payload.session || state.session;
  if (state.session.authenticated) {
    state.diagnostics = await callApi("get_diagnostics");
  }
  render();
}

async function refreshStatusOnly() {
  if (!state.session?.authenticated) return;
  try {
    const status = await callApi("get_status");
    state.status = status || state.status;
    renderHome();
    renderAppInfo();
  } catch {
    // Keep the last stable state visible; the Python side also caches transient misses.
  }
}

async function handleLogin(event) {
  event.preventDefault();
  const error = $("#login-error");
  if (error) error.textContent = "";
  setBusy(true);
  try {
    const email = $("#login-email")?.value || "";
    const password = $("#login-password")?.value || "";
    const result = await callApi("login", email, password);
    if (!result.ok) {
      if (error) error.textContent = result.message || "No se pudo iniciar sesión.";
      return;
    }
    state.session = result.session || { authenticated: true };
    showToast("Sesión iniciada.");
    await loadAll();
  } catch (err) {
    if (error) error.textContent = err.message || "No se pudo iniciar sesión.";
  } finally {
    setBusy(false);
    render();
  }
}

async function performAction(method, successMessage) {
  setBusy(true);
  try {
    const result = await callApi(method);
    showToast(result.message || successMessage);
    if (result.status) state.status = result.status;
    if (result.installations) state.installations = result.installations;
    await refreshEverything();
  } catch (err) {
    showToast(err.message || "No se pudo completar la acción.");
  } finally {
    setBusy(false);
    render();
  }
}

async function refreshEverything() {
  const payload = await callApi("refresh");
  state.status = payload.status || state.status;
  state.installations = payload.installations || state.installations;
  state.appInfo = payload.app_info || state.appInfo;
  state.session = payload.session || state.session;
  state.diagnostics = await callApi("get_diagnostics");
}

function bindEvents() {
  $("#login-form")?.addEventListener("submit", handleLogin);
  $("#logout-button")?.addEventListener("click", async () => {
    setBusy(true);
    try {
      const result = await callApi("logout");
      state.session = result.session || { authenticated: false };
      showToast(result.message || "Sesión cerrada.");
    } finally {
      setBusy(false);
      render();
    }
  });
  $$(".nav-item").forEach((item) => {
    item.addEventListener("click", async () => {
      state.view = item.dataset.view || "home";
      if (state.view === "settings") {
        await refreshEverything();
      }
      render();
    });
  });
  $("#refresh-button")?.addEventListener("click", () => performAction("refresh", "Estado actualizado."));
  $("#redetect-button")?.addEventListener("click", async () => {
    setBusy(true);
    try {
      state.installations = await callApi("refresh_installations");
      state.status = await callApi("get_status");
      showToast("Instalaciones actualizadas.");
    } finally {
      setBusy(false);
      render();
    }
  });
  $("#install-button")?.addEventListener("click", () => performAction("install_connector", "Connector instalado."));
  $("#open-mt5-button")?.addEventListener("click", () => performAction("open_mt5", "MetaTrader abierto."));
}

async function init() {
  bindEvents();
  try {
    await loadAll();
  } catch {
    try {
      const session = await callApi("get_session");
      state.session = session || state.session;
    } catch {
      // noop
    }
    render();
  }
  window.setInterval(refreshStatusOnly, 3000);
}

window.addEventListener("pywebviewready", init);
if (apiReady()) init();
