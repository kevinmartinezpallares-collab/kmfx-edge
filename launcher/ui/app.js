const state = {
  view: "home",
  session: { authenticated: false, user: {} },
  status: {},
  installations: [],
  accountConnections: [],
  appInfo: {},
  toolFilter: "all",
  selectedInstallationLabel: "",
  busy: false,
  oauthPending: false,
  message: ""
};

let oauthPollTimer = null;
let oauthPollStartedAt = 0;
let lastHomeSignature = "";
let lastInstallationsSignature = "";
let lastAppInfoSignature = "";
let lastConnectionsSignature = "";
let initStarted = false;

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
  ["#login-submit", "#login-google", "#password-reset-button", "#install-button", "#open-mt5-button", "#refresh-button", "#redetect-button", "#create-connection-button", "#logout-button"].forEach((selector) => {
    const element = $(selector);
    if (element) element.disabled = state.busy;
  });
}

function stopOAuthPolling() {
  if (oauthPollTimer) {
    window.clearInterval(oauthPollTimer);
    oauthPollTimer = null;
  }
  state.oauthPending = false;
  setOAuthStatus("");
}

function setOAuthStatus(message = "") {
  const element = $("#oauth-status");
  if (!element) return;
  element.textContent = message;
  element.classList.toggle("is-visible", Boolean(message));
}

function setGoogleButtonLabel(label) {
  const googleLabel = $("#login-google [data-google-label]");
  if (googleLabel) googleLabel.textContent = label;
}

function stableStringify(value) {
  try {
    return JSON.stringify(value || {});
  } catch {
    return String(Date.now());
  }
}

function showToast(message) {
  const toast = $("#toast");
  if (!toast || !message) return;
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("is-visible"), 2800);
}

function ensureSelectedInstallation() {
  const labels = state.installations.map((installation) => installation.label).filter(Boolean);
  if (!labels.length) {
    state.selectedInstallationLabel = "";
    return;
  }
  if (!labels.includes(state.selectedInstallationLabel)) {
    state.selectedInstallationLabel = labels[0];
  }
}

function installationDisplayLabel(installation = {}) {
  return installation.display_label || installation.label || "MetaTrader 5";
}

function installationForConnection(connection = {}) {
  const key = String(connection.connection_key || "").trim();
  const accountId = String(connection.account_id || "").trim();
  if (!key && !accountId) return null;
  return state.installations.find((installation) => (
    (key && String(installation.connection_key || "").trim() === key) ||
    (accountId && String(installation.linked_account_id || "").trim() === accountId)
  )) || null;
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

function activeAccountCount() {
  return state.accountConnections.filter((connection) => String(connection.status || "").toLowerCase() === "active").length;
}

function latestSyncLabel() {
  const active = state.accountConnections.find((connection) => String(connection.status || "").toLowerCase() === "active");
  return active?.last_sync_label || state.status?.last_sync_ago || "Pendiente";
}

function setText(selector, text) {
  const element = $(selector);
  if (element) element.textContent = text;
}

function setStepState(selector, stateName) {
  const element = $(selector);
  if (!element) return;
  element.classList.remove("is-current", "is-complete", "is-muted");
  element.classList.add(stateName);
}

function setPill(selector, text, kind) {
  const element = $(selector);
  if (!element) return;
  element.textContent = text;
  element.className = `${selector.includes("badge") ? "status-badge" : "signal"} ${kind}`;
}

function renderHome() {
  ensureSelectedInstallation();
  const status = state.status || {};
  const nextSignature = stableStringify({
    status,
    busy: state.busy,
    toolFilter: state.toolFilter,
    installations: state.installations,
    accountConnections: state.accountConnections,
    selectedInstallationLabel: state.selectedInstallationLabel
  });
  if (nextSignature === lastHomeSignature) return;
  lastHomeSignature = nextSignature;
  const installed = Boolean(status.connector_installed);
  const hasMt5 = Number(status.mt5_count || 0) > 0;
  const recentSync = Boolean(status.has_recent_sync);
  const needsRepair = Boolean(status.repair_recommended);
  const activeCount = activeAccountCount();
  $$('[data-tool="mt5"]').forEach((element) => {
    element.hidden = !(state.toolFilter === "all" || state.toolFilter === "mt5");
  });

  const badgeText = installed ? (needsRepair ? "Reparación recomendada" : "Instalado") : "No instalado";
  const badgeKind = installed ? (needsRepair ? "warning" : "success") : "neutral";
  setPill("#install-badge", badgeText, badgeKind);
  setText("#hero-service-status", status.service_on ? "Activo" : "Pendiente");
  setText("#hero-active-accounts", String(activeCount));
  setText("#hero-last-sync", latestSyncLabel());
  setStepState("#step-installation", hasMt5 ? "is-complete" : "is-current");
  setStepState("#step-connector", installed ? "is-complete" : (hasMt5 ? "is-current" : "is-muted"));
  setStepState("#step-sync", activeCount > 0 ? "is-complete" : (installed ? "is-current" : "is-muted"));

  const installButton = $("#install-button");
  const openButton = $("#open-mt5-button");
  if (installButton) {
    installButton.textContent = installed ? (needsRepair ? "Reparar conector" : "Reinstalar conector") : "Instalar conector";
    installButton.className = `button ${installed && !needsRepair ? "secondary" : "primary"}`;
  }
  if (openButton) openButton.disabled = state.busy || !hasMt5;

  const picker = $("#installation-picker");
  if (picker) {
    if (!state.installations.length) {
      picker.innerHTML = `<div class="installation-picker__empty">No se ha detectado MetaTrader 5.</div>`;
    } else if (state.installations.length === 1) {
      const installation = state.installations[0];
      picker.innerHTML = `
        <div class="installation-picker__single">
          <span>MetaTrader detectado</span>
          <strong>${escapeHtml(installationDisplayLabel(installation))}</strong>
        </div>
      `;
    } else {
      picker.innerHTML = `
        <label class="installation-picker__select">
          <span>MetaTrader detectado</span>
          <select id="selected-installation">
            ${state.installations.map((installation) => `
              <option value="${escapeHtml(installation.label || "")}" ${installation.label === state.selectedInstallationLabel ? "selected" : ""}>
                ${escapeHtml(installationDisplayLabel(installation))}
              </option>
            `).join("")}
          </select>
        </label>
      `;
    }
  }

  const message = $("#status-message");
  if (!message) return;
  if (!hasMt5) {
    message.textContent = "No se ha detectado MetaTrader 5.";
  } else if (!installed) {
    message.textContent = "MetaTrader detectado. Instala el conector para continuar.";
  } else if (recentSync) {
    message.textContent = "Conector instalado. Tus cuentas se están sincronizando.";
  } else {
    message.textContent = "Conector instalado. Abre MetaTrader 5 para iniciar la sincronización.";
  }
}

function renderAccountConnections() {
  const container = $("#connections-list");
  if (!container) return;
  const nextSignature = stableStringify({
    connections: state.accountConnections,
    installations: state.installations,
    busy: state.busy,
    toolFilter: state.toolFilter
  });
  if (nextSignature === lastConnectionsSignature) return;
  lastConnectionsSignature = nextSignature;

  if (!state.accountConnections.length) {
    container.innerHTML = `<div class="empty-state">Pulsa Añadir cuenta MT5 y después instala el conector en MetaTrader 5.</div>`;
    return;
  }

  container.innerHTML = state.accountConnections
    .map((connection) => {
      const status = String(connection.status || "").toLowerCase();
      const isActive = status === "active";
      const statusKind = escapeHtml(connection.status_kind || (isActive ? "success" : "neutral"));
      const meta = [connection.broker, connection.login ? `Login ${connection.login}` : "", connection.server]
        .filter(Boolean)
        .join(" · ");
      const primaryMeta = meta || "Sin datos de broker hasta el primer sync";
      const installation = installationForConnection(connection);
      const targetInstallationLabel = installation?.label || state.selectedInstallationLabel || "";
      const actionDisabled = state.busy || !targetInstallationLabel;
      const actionTitle = installation
        ? `Instalación vinculada: ${installationDisplayLabel(installation)}`
        : "Elige una instalación de MetaTrader arriba para continuar.";
      return `
        <article class="connection-row ${statusKind}">
          <div class="connection-symbol" aria-hidden="true">MT5</div>
          <div class="connection-main">
            <div class="connection-title-row">
              <strong>${escapeHtml(connection.label || "Cuenta MT5")}</strong>
              <span class="status-badge ${statusKind}">${escapeHtml(connection.status_label || "Pendiente")}</span>
            </div>
            <span class="connection-meta">${escapeHtml(primaryMeta)}</span>
            <span class="connection-meta">${escapeHtml(connection.last_sync_label || "")}</span>
          </div>
          <div class="connection-state-card">
            <span>Estado</span>
            <strong>${escapeHtml(connection.status_label || "Pendiente")}</strong>
            <small>${escapeHtml(connection.last_sync_label || "Esperando sincronización")}</small>
          </div>
          <div class="connection-row-actions">
            <button class="button ${isActive ? "secondary" : "primary"} small" type="button" data-install-account="${escapeHtml(connection.account_id || "")}" data-installation-label="${escapeHtml(targetInstallationLabel)}" title="${escapeHtml(actionTitle)}" ${actionDisabled ? "disabled" : ""}>
              ${isActive ? "Reinstalar" : "Instalar conector"}
            </button>
            <button class="button secondary small" type="button" data-open-mt5-account="${escapeHtml(connection.account_id || "")}" data-installation-label="${escapeHtml(targetInstallationLabel)}" title="${escapeHtml(actionTitle)}" ${actionDisabled ? "disabled" : ""}>
              Abrir MT5
            </button>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderInstallations() {
  const container = $("#installations-list");
  if (!container) return;
  const nextSignature = stableStringify(state.installations);
  if (nextSignature === lastInstallationsSignature) return;
  lastInstallationsSignature = nextSignature;
  if (!state.installations.length) {
    container.innerHTML = `<div class="empty-state">No se detectaron instalaciones de MetaTrader 5.</div>`;
    return;
  }
  container.innerHTML = state.installations
    .map((installation) => {
      const path = installation.data_path || installation.terminal_path || "";
      return `
      <article class="installation-row">
        <div>
          <strong>${escapeHtml(installationDisplayLabel(installation))}</strong>
          <span title="${escapeHtml(path)}">${escapeHtml(path)}</span>
        </div>
        <span class="status-badge ${installation.connector_installed ? "success" : "neutral"}">
          ${installation.connector_installed ? "Conector instalado" : "Sin conector"}
        </span>
      </article>
    `;
    })
    .join("");
}

function renderAppInfo() {
  const container = $("#app-info");
  if (!container) return;
  const nextSignature = stableStringify({ appInfo: state.appInfo, service_on: state.status?.service_on });
  if (nextSignature === lastAppInfoSignature) return;
  lastAppInfoSignature = nextSignature;
  const rows = [
    ["Launcher", state.appInfo.launcher_version || "1.0.0"],
    ["Conector", state.appInfo.connector_version || "—"]
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

function render() {
  renderShell();
  if (!state.session?.authenticated) return;
  renderHome();
  renderAccountConnections();
  renderInstallations();
  renderAppInfo();
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
  state.accountConnections = payload.account_connections || [];
  state.appInfo = payload.app_info || {};
  state.session = payload.session || state.session;
  ensureSelectedInstallation();
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

async function handleGoogleLogin() {
  const error = $("#login-error");
  if (error) error.textContent = "";
  setGoogleButtonLabel("Entrar con Google");
  showToast("Abriendo Google en tu navegador...");
  setBusy(true);
  try {
    const result = await callApi("login_with_google");
    if (!result.ok) {
      if (error) error.textContent = result.message || "No se pudo iniciar sesión con Google.";
      setBusy(false);
      return;
    }
    state.oauthPending = true;
    oauthPollStartedAt = Date.now();
    console.info("[KMFX][AUTH][GOOGLE] oauth_browser_opened pending=true");
    setOAuthStatus("Esperando autorización de Google...");
    showToast(result.message || "Completa el acceso con Google en tu navegador.");
    startOAuthPolling();
  } catch (err) {
    if (error) error.textContent = err.message || "No se pudo iniciar sesión con Google.";
    setBusy(false);
  } finally {
    render();
  }
}

function startOAuthPolling() {
  if (oauthPollTimer) return;
  setOAuthStatus("Esperando autorización de Google...");
  oauthPollTimer = window.setInterval(async () => {
    const error = $("#login-error");
    try {
      const status = await callApi("get_oauth_status");
      if (status?.status === "authenticated" || status?.session?.authenticated) {
        stopOAuthPolling();
        state.session = status.session || { authenticated: true };
        setBusy(false);
        console.info("[KMFX][AUTH][GOOGLE] transition login -> app");
        showToast(status.message || "Sesión iniciada con Google.");
        await loadAll();
        render();
        return;
      }
      if (status?.status === "error") {
        stopOAuthPolling();
        setBusy(false);
        if (error) error.textContent = status.message || "No se pudo iniciar sesión con Google.";
        render();
        return;
      }
      if (Date.now() - oauthPollStartedAt > 180000) {
        stopOAuthPolling();
        setBusy(false);
        if (error) error.textContent = "No se completó el acceso con Google. Inténtalo de nuevo.";
        setGoogleButtonLabel("Reintentar con Google");
        render();
      }
    } catch {
      // Keep polling while the local callback service finishes the OAuth exchange.
    }
  }, 1000);
}

async function handlePasswordReset() {
  const error = $("#login-error");
  if (error) error.textContent = "";
  setBusy(true);
  try {
    const result = await callApi("open_password_reset");
    showToast(result.message || "Recuperación abierta en el navegador.");
    if (!result.ok && error) {
      error.textContent = result.message || "No se pudo abrir la recuperación de contraseña.";
    }
  } catch (err) {
    if (error) error.textContent = err.message || "No se pudo abrir la recuperación de contraseña.";
  } finally {
    setBusy(false);
    render();
  }
}

async function performAction(method, successMessage, ...args) {
  setBusy(true);
  try {
    const result = await callApi(method, ...args);
    showToast(result.message || successMessage);
    if (result.status) state.status = result.status;
    if (result.installations) state.installations = result.installations;
    if (result.account_connections) state.accountConnections = result.account_connections;
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
  state.accountConnections = payload.account_connections || state.accountConnections;
  state.appInfo = payload.app_info || state.appInfo;
  state.session = payload.session || state.session;
  ensureSelectedInstallation();
}

async function copyToClipboard(value, successMessage) {
  const text = String(value || "").trim();
  if (!text) {
    showToast("No hay nada que copiar.");
    return;
  }
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      fallbackCopy(text);
    }
    showToast(successMessage || "Copiado.");
  } catch {
    fallbackCopy(text);
    showToast(successMessage || "Copiado.");
  }
}

function fallbackCopy(text) {
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  document.execCommand("copy");
  area.remove();
}

function bindEvents() {
  $("#login-form")?.addEventListener("submit", handleLogin);
  $("#login-google")?.addEventListener("click", handleGoogleLogin);
  $("#password-reset-button")?.addEventListener("click", handlePasswordReset);
  $("#logout-button")?.addEventListener("click", async () => {
    setBusy(true);
    try {
      const result = await callApi("logout");
      stopOAuthPolling();
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
      renderShell();
      if (state.view === "settings") {
        refreshEverything()
          .then(() => render())
          .catch(() => {});
      }
    });
  });
  $$(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      state.toolFilter = tab.dataset.filter || "all";
      $$(".tab").forEach((item) => item.classList.toggle("is-active", item === tab));
      renderHome();
    });
  });
  $("#refresh-button")?.addEventListener("click", () => performAction("refresh", "Estado actualizado."));
  $("#redetect-button")?.addEventListener("click", async () => {
    setBusy(true);
    try {
      state.installations = await callApi("refresh_installations");
      state.status = await callApi("get_status");
      ensureSelectedInstallation();
      showToast("Instalaciones actualizadas.");
    } finally {
      setBusy(false);
      render();
    }
  });
  document.addEventListener("change", (event) => {
    const select = event.target.closest("#selected-installation");
    if (!select) return;
    state.selectedInstallationLabel = select.value || "";
    renderHome();
  });
  $("#install-button")?.addEventListener("click", () => performAction("install_connector", "Conector instalado.", state.selectedInstallationLabel));
  $("#open-mt5-button")?.addEventListener("click", () => performAction("open_mt5", "MetaTrader abierto.", state.selectedInstallationLabel));
  $("#create-connection-button")?.addEventListener("click", () => performAction("create_account_connection", "Conexión MT5 creada."));
  document.addEventListener("click", (event) => {
    const installAccountButton = event.target.closest("[data-install-account]");
    if (installAccountButton) {
      performAction("install_connector_for_connection", "Conector instalado.", installAccountButton.dataset.installAccount || "", installAccountButton.dataset.installationLabel || state.selectedInstallationLabel);
      return;
    }
    const openAccountMt5Button = event.target.closest("[data-open-mt5-account]");
    if (openAccountMt5Button) {
      performAction("open_mt5", "MetaTrader abierto.", openAccountMt5Button.dataset.installationLabel || state.selectedInstallationLabel);
      return;
    }
    const button = event.target.closest("[data-copy-value]");
    if (!button) return;
    copyToClipboard(button.dataset.copyValue || "", button.dataset.copyLabel || "Copiado.");
  });
}

async function init() {
  if (initStarted) return;
  initStarted = true;
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
  window.setInterval(refreshStatusOnly, 5000);
}

window.addEventListener("pywebviewready", init);
if (apiReady()) init();
