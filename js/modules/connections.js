import { closeModal, openModal } from "./modal-system.js?v=build-20260509-150500";
import { formatCurrency, selectActiveAccount, selectActiveAccountId, selectLiveAccountIds } from "./utils.js?v=build-20260509-150500";
import { showToast } from "./toast.js?v=build-20260509-150500";
import { resolveAccountsRegistryUrl } from "./api-config.js?v=build-20260509-150500";
import { renderRiskMetricCard } from "./risk-panel-components.js?v=build-20260509-150500";
import { emptyStateMarkup, pageHeaderMarkup, pnlTextMarkup } from "./ui-primitives.js?v=build-20260509-150500";
import { billingAccessLabel, billingAccessTone, billingEntitlementState, isBillingAttention, isBillingRestricted, selectBillingStatus } from "./billing-status.js?v=build-20260509-150500";
import { downloadArtifactSummary, downloadChecksumText } from "./download-artifacts.js?v=build-20260509-150500";
const DEFAULT_MAC_LAUNCHER_DOWNLOAD_URL = "./downloads/KMFX-Launcher-macOS.zip";
const DEFAULT_WINDOWS_LAUNCHER_DOWNLOAD_URL = "./downloads/KMFX-Launcher-Windows.exe";
const LAUNCHER_OPEN_URL = "kmfx-launcher://open";
const MT5_WEBREQUEST_URL = "https://mt5-api.kmfxedge.com";
const EA_DOWNLOAD_URL = "./KMFXConnector.ex5";
const LOCAL_CONNECTION_KEYS_STORAGE_KEY = "kmfx.connectionKeys.v1";

function launcherDownloadUrl(platform = "auto") {
  const macUrl = window.__KMFX_MAC_LAUNCHER_DOWNLOAD_URL__ || window.__KMFX_LAUNCHER_DOWNLOAD_URL__ || DEFAULT_MAC_LAUNCHER_DOWNLOAD_URL;
  const windowsUrl = window.__KMFX_WINDOWS_LAUNCHER_DOWNLOAD_URL__ || DEFAULT_WINDOWS_LAUNCHER_DOWNLOAD_URL;
  if (platform === "windows") return windowsUrl;
  if (platform === "mac") return macUrl;
  const userAgent = navigator.userAgent || "";
  return /Windows/i.test(userAgent) && windowsUrl ? windowsUrl : macUrl;
}

function windowsLauncherAvailable() {
  return Boolean(launcherDownloadUrl("windows"));
}

function isLocalRuntime() {
  const hostname = window.location.hostname || "";
  return window.location.protocol === "file:" || hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function registrySignature(accounts = []) {
  return JSON.stringify(
    (Array.isArray(accounts) ? accounts : []).map((account) => ({
      account_id: account?.account_id || "",
      connection_mode: account?.connection_mode || "",
      status: account?.status || "",
      broker: account?.broker || "",
      login: account?.login || "",
      server: account?.server || "",
      connection_key_preview: (
        account?.connection_key_preview ||
        account?.connectionKeyPreview ||
        account?.connection_key_masked ||
        account?.server_connection_key_masked ||
        account?.api_key_preview ||
        ""
      ),
      has_connection_key: Boolean(account?.has_connection_key),
      connection_key_revoked: Boolean(account?.connection_key_revoked),
      connection_key_revoked_at: account?.connection_key_revoked_at || "",
      last_sync_at: account?.last_sync_at || "",
      updated_at: account?.updated_at || "",
    }))
  );
}

function openLauncher() {
  try {
    showToast("Abriendo KMFX Launcher. Si no se abre, usa Descargar macOS o Descargar Windows.", "info");
    window.location.href = LAUNCHER_OPEN_URL;
  } catch {
    showToast("No se pudo abrir el Launcher. Descárgalo desde esta pantalla.", "warning");
  }
}

function downloadLauncher(platform = "auto") {
  const url = launcherDownloadUrl(platform);
  if (!url) {
    showToast("Launcher Windows pendiente de publicar", "warning");
    return;
  }
  window.open(url, "_blank", "noopener");
}

function downloadEa() {
  window.open(EA_DOWNLOAD_URL, "_blank", "noopener");
}

function relativeTime(value) {
  if (!value) return "Sin sincronización";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin sincronización";
  const seconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
  if (seconds < 5) return "hace unos segundos";
  if (seconds < 60) return `hace ${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `hace ${minutes}min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.round(hours / 24);
  return `hace ${days}d`;
}

function isConnectedStatus(status = "") {
  return ["connected", "active", "first_sync_received"].includes(String(status || "").toLowerCase());
}

function isDirectConnectionMode(connectionMode = "") {
  return String(connectionMode || "").trim().toLowerCase() === "direct";
}

function accountStatusMeta(status = "", lastSyncAt = "", connectionMode = "") {
  const relative = relativeTime(lastSyncAt);
  const normalizedStatus = String(status || "").trim().toLowerCase();
  if (isDirectConnectionMode(connectionMode) && !isConnectedStatus(normalizedStatus)) {
    return {
      label: "Directa registrada",
      tone: "waiting",
      subtitle: "Pendiente de datos",
      actionLabel: "Ver detalle",
      action: "none",
    };
  }
  if (normalizedStatus === "connected" || normalizedStatus === "active" || normalizedStatus === "first_sync_received") {
    return {
      label: "Conectada",
      tone: "connected",
      subtitle: lastSyncAt ? `Actualizada ${relative}` : "Lista para usar",
      actionLabel: "",
      action: "none",
    };
  }
  if (normalizedStatus === "waiting_sync" || normalizedStatus === "linked") {
    return {
      label: "Conectando…",
      tone: "waiting",
      subtitle: "Esperando primera sincronización de MT5",
      actionLabel: "Abrir o instalar conector",
      action: "launcher",
    };
  }
  if (normalizedStatus === "pending_setup" || normalizedStatus === "pending" || normalizedStatus === "pending_link" || normalizedStatus === "draft") {
    return {
      label: "Pendiente",
      tone: "pending",
      subtitle: "Instala el EA y espera la primera sincronización",
      actionLabel: "Abrir o instalar conector",
      action: "launcher",
    };
  }
  if (normalizedStatus === "archived") {
    return {
      label: "Archivada",
      tone: "neutral",
      subtitle: "Fuera del panel",
      actionLabel: "Ver detalle",
      action: "none",
    };
  }
  if (normalizedStatus === "revoked" || normalizedStatus === "key_revoked" || normalizedStatus === "connection_revoked") {
    return {
      label: "Key revocada",
      tone: "error",
      subtitle: "Crea una nueva conexión para volver a sincronizar",
      actionLabel: "Ver detalle",
      action: "none",
    };
  }
  if (
    normalizedStatus === "plan_limited"
    || normalizedStatus === "plan_limit_reached"
    || normalizedStatus === "billing_required"
    || normalizedStatus === "entitlement_required"
  ) {
    return {
      label: "Bloqueada por plan",
      tone: "pending",
      subtitle: "Actualiza el plan o libera una conexión",
      actionLabel: "Ver plan",
      action: "billing",
    };
  }
  if (normalizedStatus === "stale") {
    return {
      label: "Sin actualizar",
      tone: "stale",
      subtitle: lastSyncAt ? `Sin actualizar. Última actividad ${relative}. Abre el Launcher y reinstala el conector si no vuelve a sincronizar.` : "Sin actualizar. Abre MT5 o reinstala el conector de esta cuenta.",
      actionLabel: "Abrir Launcher",
      action: "launcher",
    };
  }
  if (normalizedStatus === "error") {
    return {
      label: "Error de conexión",
      tone: "error",
      subtitle: "Error de conexión. Revisa la conexión en Launcher antes de crear otra.",
      actionLabel: "Abrir Launcher",
      action: "launcher",
    };
  }
  return {
    label: "Desconectada",
    tone: "neutral",
    subtitle: "Conserva la KMFXKey y reinstala el conector de esta cuenta.",
    actionLabel: "Abrir Launcher",
    action: "launcher",
  };
}

function getAdminState(root) {
  if (!root.__accountAdminState) {
    root.__accountAdminState = {
      open: false,
      payloads: {},
      loading: "",
      error: "",
    };
  }
  return root.__accountAdminState;
}

function getConnectionsUiState(root) {
  if (!root.__connectionsUiState) {
    root.__connectionsUiState = {
      openMenuAccountId: "",
      revealedKeyAccountId: "",
    };
  }
  return root.__connectionsUiState;
}

function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function resolveRegistryAccounts(state) {
  // Connections UI source order: backend registry first; live snapshot fallback only
  // keeps the page useful while registry polling is unavailable or still loading.
  const managedAccounts = Array.isArray(state.managedAccounts) ? state.managedAccounts : [];
  if (managedAccounts.length) return { accounts: managedAccounts, source: "registry" };

  const liveAccountIds = selectLiveAccountIds(state);
  const accountDirectory = state.accountDirectory && typeof state.accountDirectory === "object" ? state.accountDirectory : {};
  const fallbackAccounts = liveAccountIds
    .map((accountId) => accountDirectory[accountId])
    .filter(Boolean)
    .map((account) => ({
      account_id: account.accountId,
      alias: account.displayName,
      display_name: account.displayName,
      platform: account.platform,
      connection_mode: account.connectionMode,
      status: account.status,
      broker: account.broker,
      login: account.login,
      server: account.server,
      last_sync_at: account.lastSyncAt,
    }));

  return { accounts: fallbackAccounts, source: fallbackAccounts.length ? "snapshot" : "empty" };
}

function renderConnectionsHeader({ adminVisible = false, adminState = null, connectionAccess = { allowed: true } } = {}) {
  const connectDisabled = connectionAccess.allowed ? "" : ` disabled aria-disabled="true" title="${escapeHtml(connectionAccess.title || "Conexión no disponible")}"`;
  return pageHeaderMarkup({
    eyebrow: "Cuentas",
    title: "Cuentas",
    description: "Administra tus cuentas MT5 conectadas. Si una deja de sincronizar, reinstala el conector de esa cuenta antes de crear otra.",
    className: "calendar-screen__header",
    contentClassName: "calendar-screen__copy",
    eyebrowClassName: "calendar-screen__eyebrow",
    titleClassName: "calendar-screen__title",
    descriptionClassName: "calendar-screen__subtitle",
    actionsClassName: "connections-shell__actions",
    actionsHtml: `
        ${adminVisible ? `<button class="btn-secondary connections-shell__utility-btn" type="button" data-account-admin-toggle="true">${adminState?.open ? "Cerrar admin" : "Admin tools"}</button>` : ""}
        <button class="btn-secondary connections-shell__utility-btn" type="button" data-account-guide-open="true">Guía</button>
        <button class="btn-primary" type="button" data-open-connection-wizard="true" data-connection-source="connections"${connectDisabled}>Añadir cuenta MT5</button>
      `,
  });
}

function renderConnectionsKpis(accounts = [], state = {}) {
  const accountsCount = accounts.length;
  const connectedCount = accounts.filter((account) => isConnectedStatus(account.status)).length;
  const billingState = selectBillingStatus(state);
  const planName = billingState.loading
    ? "Comprobando"
    : billingState.billing?.displayName || "Free / Demo";
  const planKey = String(billingState.billing?.effectivePlan || billingState.billing?.plan || "free")
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "");
  const planTone = billingAccessTone(state);
  const planMeta = billingAccessLabel(state);
  return `
    <section class="tl-kpi-row connections-shell__kpis">
      ${renderRiskMetricCard({
        label: "Total cuentas",
        value: accountsCount,
        meta: accountsCount === 1 ? "Registrada" : "Registradas",
        tone: "neutral",
      })}
      ${renderRiskMetricCard({
        label: "Conectadas",
        value: connectedCount,
        meta: connectedCount === 1 ? "Lista para usar" : connectedCount > 1 ? "Listas para usar" : "Sin conexión activa",
        tone: connectedCount > 0 ? "ok" : "neutral",
      })}
      <article class="risk-metric-card risk-metric-card--${escapeHtml(planTone)} connections-plan-kpi connections-plan-kpi--${escapeHtml(planKey || "free")}">
        <div class="risk-metric-card__label">Plan</div>
        <div class="risk-metric-card__value">${escapeHtml(planName)}</div>
        <div class="risk-metric-card__meta">${escapeHtml(planMeta)}</div>
      </article>
    </section>
  `;
}

function renderBillingNotice(state = {}) {
  const billingState = selectBillingStatus(state);
  if (!isBillingRestricted(state) && !isBillingAttention(state) && !billingState.error) return "";
  const isRestricted = isBillingRestricted(state);
  const title = billingState.error
    ? "No pude comprobar el plan"
    : isRestricted
      ? "Plan con acceso restringido"
      : "Pago pendiente de revisar";
  const copy = billingState.error
    ? "Puedes seguir usando el panel. KMFX volverá a comprobar el estado del plan automáticamente."
    : isRestricted
      ? "Tus cuentas siguen visibles. La creación de nuevas conexiones queda pausada hasta regularizar el plan."
      : "Tus cuentas siguen visibles durante el periodo de gracia. La creación de nuevas conexiones puede pausarse hasta confirmar el pago.";
  return `
    <article class="widget-card connections-billing-notice connections-billing-notice--${isRestricted ? "restricted" : "attention"}">
      <div class="calendar-panel-head">
        <div>
          <div class="calendar-panel-title">${escapeHtml(title)}</div>
          <div class="row-sub">${escapeHtml(copy)}</div>
        </div>
        <span class="risk-status-badge risk-status-badge--${isRestricted ? "blocked" : "warning"}">${escapeHtml(billingAccessLabel(state))}</span>
      </div>
    </article>
  `;
}

function renderConnectionAccessState(connectionAccess) {
  if (connectionAccess.allowed) return "";
  const actionHtml = connectionAccess.reason === "auth_required"
    ? ""
    : `<a class="btn-secondary connections-shell__utility-btn" href="/ajustes">Revisar plan</a>`;
  return emptyStateMarkup({
    title: connectionAccess.title,
    description: connectionAccess.description,
    className: "connections-plan-state",
    actionHtml,
  });
}

function isAdminUser(state) {
  return state?.auth?.user?.is_admin === true;
}

function buildAuthHeaders(state, extra = {}) {
  const headers = {
    Accept: "application/json",
    ...extra,
  };
  if (state?.auth?.status !== "authenticated") return headers;
  const token = state?.auth?.session?.accessToken;
  const email = state?.auth?.user?.email;
  const userId = state?.auth?.user?.id;
  if (token) headers.Authorization = `Bearer ${token}`;
  if (email) headers["X-KMFX-User-Email"] = email;
  if (userId) headers["X-KMFX-User-Id"] = userId;
  return headers;
}

function applyAdminAccess(store, isAdmin) {
  if (typeof isAdmin !== "boolean") return;
  store.setState((state) => {
    if (state.auth?.user?.is_admin === isAdmin && state.auth?.user?.role === (isAdmin ? "admin" : "user")) {
      return state;
    }
    return {
      ...state,
      auth: {
        ...(state.auth || {}),
        user: {
          ...(state.auth?.user || {}),
          is_admin: isAdmin,
          role: isAdmin ? "admin" : "user",
        },
      },
    };
  });
}

function resolveAdminAccountUrl(accountId, action = "") {
  const registryUrl = resolveAccountsRegistryUrl();
  const url = new URL(registryUrl, window.location.origin);
  url.pathname = url.pathname.replace(/\/accounts\/?$/, `/api/admin/accounts/${encodeURIComponent(accountId)}${action ? `/${action}` : ""}`);
  return url.toString();
}

function resolveOwnAccountUrl(accountId, action = "") {
  const registryUrl = resolveAccountsRegistryUrl();
  const url = new URL(registryUrl, window.location.origin);
  url.pathname = url.pathname.replace(/\/accounts\/?$/, `/api/accounts/${encodeURIComponent(accountId)}${action ? `/${action}` : ""}`);
  return url.toString();
}

async function recordAccountAuditEvent({ accountId = "", event = "", state = {}, source = "dashboard_connections" } = {}) {
  const normalizedAccountId = String(accountId || "").trim();
  const normalizedEvent = String(event || "").trim();
  if (!normalizedAccountId || !normalizedEvent) return;
  try {
    await fetch(resolveOwnAccountUrl(normalizedAccountId, "audit-event"), {
      method: "POST",
      headers: buildAuthHeaders(state, { "Content-Type": "application/json" }),
      body: JSON.stringify({ event: normalizedEvent, source }),
      keepalive: true,
    });
  } catch {
    // Audit telemetry must never block the account workflow.
  }
}

function updateManagedAccountLocally(store, accountId, nextFields) {
  store.setState((state) => {
    const managedAccounts = Array.isArray(state.managedAccounts) ? state.managedAccounts : [];
    const accountDirectory = state.accountDirectory && typeof state.accountDirectory === "object" ? state.accountDirectory : {};
    const nextManagedAccounts = managedAccounts.map((account) => (
      account?.account_id === accountId
        ? { ...account, ...nextFields }
        : account
    ));

    const nextAccountDirectory = { ...accountDirectory };
    if (nextAccountDirectory[accountId]) {
      nextAccountDirectory[accountId] = {
        ...nextAccountDirectory[accountId],
        displayName: nextFields.alias ?? nextFields.display_name ?? nextAccountDirectory[accountId].displayName,
        login: nextFields.login ?? nextAccountDirectory[accountId].login,
        server: nextFields.server ?? nextAccountDirectory[accountId].server,
      };
    }

    return {
      ...state,
      managedAccounts: nextManagedAccounts,
      accountDirectory: nextAccountDirectory,
    };
  });
}

function copyText(value, successLabel = "Copiado") {
  if (!value) return;
  const complete = () => showToast(successLabel, "success");

  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(value).then(complete).catch(() => {
      const input = document.createElement("textarea");
      input.value = value;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      input.remove();
      complete();
    });
    return;
  }

  const input = document.createElement("textarea");
  input.value = value;
  document.body.appendChild(input);
  input.select();
  document.execCommand("copy");
  input.remove();
  complete();
}

function readLocalConnectionKeys() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(LOCAL_CONNECTION_KEYS_STORAGE_KEY) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function persistLocalConnectionKey({ accountId = "", connectionKey = "", label = "", state = {} } = {}) {
  const normalizedAccountId = String(accountId || "").trim();
  const normalizedKey = String(connectionKey || "").trim();
  if (!normalizedAccountId || !normalizedKey) return;
  try {
    const cache = readLocalConnectionKeys();
    cache[normalizedAccountId] = {
      accountId: normalizedAccountId,
      connectionKey: normalizedKey,
      label: String(label || "").trim(),
      userId: state?.auth?.user?.id || "",
      updatedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(LOCAL_CONNECTION_KEYS_STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // The account still works if browser storage is unavailable.
  }
}

function forgetLocalConnectionKey(accountId = "") {
  const normalizedAccountId = String(accountId || "").trim();
  if (!normalizedAccountId) return;
  try {
    const cache = readLocalConnectionKeys();
    if (!Object.prototype.hasOwnProperty.call(cache, normalizedAccountId)) return;
    delete cache[normalizedAccountId];
    window.localStorage.setItem(LOCAL_CONNECTION_KEYS_STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // Browser storage is best-effort only.
  }
}

function resolveLocalConnectionKey(accountId = "", state = {}) {
  const normalizedAccountId = String(accountId || "").trim();
  if (!normalizedAccountId) return "";
  const cached = readLocalConnectionKeys()[normalizedAccountId];
  if (!cached || typeof cached !== "object") return "";
  const currentUserId = String(state?.auth?.user?.id || "").trim();
  const cachedUserId = String(cached.userId || "").trim();
  if (cachedUserId && currentUserId && cachedUserId !== currentUserId) return "";
  return String(cached.connectionKey || "").trim();
}

function maskConnectionKeyForDisplay(value = "") {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  if (normalized.length <= 12) return "••••••••";
  return `${normalized.slice(0, 6)}...${normalized.slice(-4)}`;
}

function resolveServerConnectionPreview(account = {}) {
  return String(
    account.connection_key_preview ||
    account.connectionKeyPreview ||
    account.connection_key_masked ||
    account.server_connection_key_masked ||
    account.api_key_preview ||
    ""
  ).trim();
}

function connectionKeyMatchesPreview(connectionKey = "", preview = "") {
  const normalizedKey = String(connectionKey || "").trim();
  const normalizedPreview = String(preview || "").trim();
  return Boolean(normalizedKey && (!normalizedPreview || maskConnectionKeyForDisplay(normalizedKey) === normalizedPreview));
}

function renderConnectionGuide() {
  const steps = [
    {
      title: "Abre o instala KMFX Launcher",
      body: "Prepara el conector en este equipo. Si no se abre, descarga tu versión.",
    },
    {
      title: "Instala el conector",
      body: "Instálalo en la instancia de MetaTrader 5 que vas a vincular.",
    },
    {
      title: "Permite WebRequest en MT5",
      body: "Activa WebRequest en Expert Advisors y añade la URL de KMFX.",
    },
    {
      title: "Activa el EA",
      body: "Arrastra KMFXConnector a un gráfico y deja Algo Trading activo.",
    },
    {
      title: "Confirma la sincronización",
      body: "Cuando Experts confirme KMFX, la cuenta quedará sincronizada.",
    },
  ];

  return `
    <section class="connections-guide-card">
      <div class="connections-guide-card__intro">
        <div class="connections-guide-card__copy">
          <div class="dashboard-risk-block__title">Conectar cuenta paso a paso</div>
          <div class="row-sub">Instala el conector con Launcher y deja MT5 abierto con el EA activo para la primera sincronización.</div>
        </div>
        <div class="connections-guide-card__launcher-actions">
          <button class="btn-secondary connections-shell__utility-btn" type="button" data-account-open-launcher="true">Abrir Launcher</button>
          <button class="btn-primary" type="button" data-account-download-launcher="mac">Descargar macOS</button>
          <button class="btn-primary" type="button" data-account-download-launcher="windows" ${windowsLauncherAvailable() ? "" : "disabled"}>${windowsLauncherAvailable() ? "Descargar Windows" : "Windows pendiente"}</button>
        </div>
      </div>
      <div class="row-sub" style="margin-top:-8px;">macOS puede pedir confirmación la primera vez: abre KMFX Launcher con clic derecho > Abrir.</div>
      <div class="connections-guide-card__release">
        <div>
          <div class="metric-label">Paquete publicado</div>
          <div class="connections-guide-card__release-list">
            ${downloadArtifactSummary().map((item) => `<span>${escapeHtml(item)}</span>`).join("")}
          </div>
        </div>
        <button class="btn-secondary connections-shell__utility-btn" type="button" data-copy-download-checksums="true">Copiar checksums</button>
      </div>
      <div class="connections-guide-card__endpoint">
        <div>
          <div class="metric-label">URL para WebRequest en MetaTrader 5</div>
          <code>${escapeHtml(MT5_WEBREQUEST_URL)}</code>
        </div>
        <button class="btn-secondary connections-shell__utility-btn" type="button" data-copy-value="${escapeHtml(MT5_WEBREQUEST_URL)}" data-copy-label="URL copiada">Copiar URL</button>
      </div>
      <div class="connections-guide-card__steps">
        ${steps.map((step, index) => `
          <article class="connections-guide-step">
            <span class="connections-guide-step__index">${index + 1}</span>
            <div>
              <strong>${escapeHtml(step.title)}</strong>
              <p>${escapeHtml(step.body)}</p>
            </div>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function openConnectionGuideModal() {
  openModal({
    title: "Guía de conexión",
    subtitle: "Consulta el paso a paso solo cuando lo necesites.",
    maxWidth: 1040,
    content: renderConnectionGuide(),
    onMount(card) {
      card?.classList.add("connections-guide-modal");
      card?.addEventListener("click", (event) => {
        const copyButton = event.target.closest("[data-copy-value]");
        if (copyButton) {
          copyText(copyButton.dataset.copyValue || "", copyButton.dataset.copyLabel || "Copiado");
          return;
        }
        if (event.target.closest("[data-account-open-launcher]")) {
          openLauncher();
          return;
        }
        const launcherButton = event.target.closest("[data-account-download-launcher]");
        if (launcherButton) {
          downloadLauncher(launcherButton.dataset.accountDownloadLauncher || "auto");
          return;
        }
        if (event.target.closest("[data-copy-download-checksums]")) {
          copyText(downloadChecksumText(), "Checksums copiados");
          return;
        }
        if (event.target.closest("[data-account-download-ea]")) {
          downloadEa();
          return;
        }
        if (event.target.closest("[data-open-connection-wizard]")) {
          closeModal();
        }
      });
    },
  });
}

function openAccountEditModal({ account, store, root }) {
  const selectedLabel = resolveAccountSecondaryLabel(account);
  openModal({
    title: "Actualizar Cuenta",
    subtitle: "Ajusta la información visible de esta cuenta.",
    maxWidth: 640,
    content: `
      <form class="connections-account-modal__form" data-account-edit-form>
        <div class="connections-account-modal__stack">
          <label class="form-stack connections-account-modal__field">
            <span>Alias</span>
            <input type="text" name="alias" value="${escapeHtml(account.alias || account.display_name || account.login || "")}">
          </label>
          <label class="form-stack connections-account-modal__field">
            <span>Login</span>
            <input type="text" name="login" value="${escapeHtml(account.login || "")}">
          </label>
          <label class="form-stack connections-account-modal__field">
            <span>Servidor</span>
            <input type="text" name="server" value="${escapeHtml(account.server || "")}">
          </label>
          <label class="form-stack connections-account-modal__field">
            <span>Etiqueta</span>
            <select name="accountLabel">
              ${["Real", "Funded", "Challenge"].map((option) => `
                <option value="${option}" ${selectedLabel === option ? "selected" : ""}>${option}</option>
              `).join("")}
            </select>
          </label>
        </div>
        <div class="connections-account-modal__actions">
          <button class="btn-secondary" type="button" data-modal-dismiss="true">Cancelar</button>
          <button class="btn-primary" type="button" data-account-edit-save="true">Guardar cambios</button>
        </div>
      </form>
    `,
    onMount(card) {
      card?.classList.add("connections-account-modal", "connections-account-modal--edit");
      card?.querySelector("[data-account-edit-save='true']")?.addEventListener("click", () => {
        const form = card.querySelector("[data-account-edit-form]");
        if (!form) return;
        const payload = Object.fromEntries(new FormData(form).entries());
        updateManagedAccountLocally(store, account.account_id, {
          alias: String(payload.alias || "").trim(),
          display_name: String(payload.alias || "").trim(),
          login: String(payload.login || "").trim(),
          server: String(payload.server || "").trim(),
          label: String(payload.accountLabel || "").trim(),
          account_type: String(payload.accountLabel || "").trim(),
        });
        closeModal();
        renderConnections(root, store.getState());
        showToast("Cuenta actualizada", "success");
      });
    },
  });
}

function resolveAccountConnectionKey(account, state, activeAccount = null) {
  const directoryAccount = state?.accountDirectory?.[account.account_id];
  const serverPreview = resolveServerConnectionPreview(account);
  const activeAccountMatches = Boolean(
    activeAccount
      && account?.account_id
      && (activeAccount.id === account.account_id || activeAccount.accountId === account.account_id)
  );
  const directCandidates = [
    account.connection_key,
    account.connectionKey,
    account.api_key,
    account.apiKey,
    directoryAccount?.apiKey,
    directoryAccount?.api_key,
    activeAccountMatches ? (
      activeAccount?.apiKey ||
      activeAccount?.model?.account?.apiKey ||
      activeAccount?.dashboardPayload?.apiKey
    ) : "",
  ].map((value) => String(value || "").trim()).filter(Boolean);
  const directMatch = directCandidates.find((candidate) => connectionKeyMatchesPreview(candidate, serverPreview));
  if (directMatch) return directMatch;

  const localKey = resolveLocalConnectionKey(account.account_id, state);
  if (connectionKeyMatchesPreview(localKey, serverPreview)) return localKey;
  if (localKey && serverPreview) forgetLocalConnectionKey(account.account_id);
  return "";
}

function resolveAccountConnectionPreview(account, connectionKey = "") {
  const serverPreview = resolveServerConnectionPreview(account);
  if (serverPreview) return serverPreview;
  if (connectionKey) return maskConnectionKeyForDisplay(connectionKey);
  return "";
}

function finiteAccountNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function resolveAccountDashboardPayload(account, state, activeAccount = null) {
  const directoryAccount = state?.accountDirectory?.[account.account_id] || {};
  const activeAccountMatches = Boolean(
    activeAccount
      && account?.account_id
      && (activeAccount.id === account.account_id || activeAccount.accountId === account.account_id)
  );
  if (activeAccountMatches && activeAccount?.dashboardPayload) return activeAccount.dashboardPayload;
  if (directoryAccount.dashboardPayload) return directoryAccount.dashboardPayload;
  if (account.dashboardPayload) return account.dashboardPayload;
  if (account.dashboard_payload) return account.dashboard_payload;
  return {};
}

function resolveAccountRiskSnapshot(account, state, activeAccount = null) {
  const directoryAccount = state?.accountDirectory?.[account.account_id] || {};
  const payload = resolveAccountDashboardPayload(account, state, activeAccount);
  if (payload.riskSnapshot && typeof payload.riskSnapshot === "object") return payload.riskSnapshot;
  if (directoryAccount.riskSnapshot && typeof directoryAccount.riskSnapshot === "object") return directoryAccount.riskSnapshot;
  if (activeAccount?.riskSnapshot && typeof activeAccount.riskSnapshot === "object") return activeAccount.riskSnapshot;
  return {};
}

function resolveAccountWarnings(riskSnapshot = {}) {
  const professional = riskSnapshot.professional_metrics && typeof riskSnapshot.professional_metrics === "object"
    ? riskSnapshot.professional_metrics
    : {};
  const metadata = riskSnapshot.metadata && typeof riskSnapshot.metadata === "object" ? riskSnapshot.metadata : {};
  const policyEvaluation = riskSnapshot.policy_evaluation && typeof riskSnapshot.policy_evaluation === "object" ? riskSnapshot.policy_evaluation : {};
  return [
    ...(Array.isArray(professional.warnings) ? professional.warnings : []),
    ...(Array.isArray(riskSnapshot.warnings) ? riskSnapshot.warnings : []),
    ...(Array.isArray(metadata.warnings) ? metadata.warnings : []),
    ...(Array.isArray(policyEvaluation.warnings) ? policyEvaluation.warnings : []),
  ].filter(Boolean);
}

function normalizeAccountWarningText(warning) {
  if (!warning) return "";
  const readable = (value) => {
    if (value === null || value === undefined) return "";
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      return String(value).trim();
    }
    return "";
  };
  if (typeof warning === "object") {
    const code = readable(warning.code || warning.key || warning.metric || warning.field);
    const message = readable(warning.message || warning.detail || warning.reason || warning.description);
    const joined = [code, message].filter(Boolean).join(": ");
    return joined || "";
  }
  return readable(warning);
}

function accountWarningToUserCopy(warning) {
  const raw = normalizeAccountWarningText(warning);
  const normalized = raw.toLowerCase();
  if (!raw) return "";
  if (normalized.includes("[object object]")) return "";
  if (
    normalized.includes("portfolio_heat")
    || normalized.includes("current_level")
    || normalized.includes("inferido")
  ) {
    return "KMFX está usando un límite de riesgo por defecto hasta que configures una política propia.";
  }
  if (normalized.includes("fallback")) {
    return "";
  }
  if (normalized.includes("sample") || normalized.includes("muestra") || normalized.includes("insufficient")) {
    return "La muestra todavía es corta; algunas métricas ganarán precisión con más operaciones cerradas.";
  }
  if (normalized.includes("stale") || normalized.includes("desactualiz") || normalized.includes("last_sync")) {
    return "La cuenta lleva demasiado tiempo sin sincronizar. Abre MT5 y comprueba el EA.";
  }
  if (normalized.includes("webrequest") || normalized.includes("web_request")) {
    return "MT5 no puede enviar datos. Añade la URL de KMFX en WebRequest y deja Algo Trading activo.";
  }
  if (
    normalized.includes("backend")
    || normalized.includes("service_unavailable")
    || normalized.includes("temporarily")
    || normalized.includes("timeout")
    || normalized.includes("http_502")
    || normalized.includes("http_503")
    || normalized.includes("http_504")
  ) {
    return "El servidor de KMFX no respondió temporalmente. No cambies la key; el EA reintentará la sincronización.";
  }
  if (
    normalized.includes("entitlement")
    || normalized.includes("billing")
    || normalized.includes("plan")
    || normalized.includes("permission")
    || normalized.includes("forbidden")
  ) {
    return "Tu plan o permisos no permiten sincronizar esta cuenta ahora mismo. Revisa tu suscripción o contacta con soporte.";
  }
  if (normalized.includes("unknown_connection_key") || normalized.includes("invalid_connection_key")) {
    return "KMFX no reconoce la KMFXKey pegada en el EA. Copia la key de esta cuenta y pégala de nuevo.";
  }
  if (normalized.includes("revoked_connection_key") || normalized.includes("connection_revoked")) {
    return "La KMFXKey está revocada. Regenera una nueva desde esta cuenta y pégala en el EA.";
  }
  if (normalized.includes("key") || normalized.includes("connection")) {
    return "La key o la conexión necesita revisión. Usa esta misma KMFXKey en el EA o regenera una nueva.";
  }
  return raw.length > 160 ? `${raw.slice(0, 157)}...` : raw;
}

function resolveAccountDataHealth(account, technicalTrace) {
  const status = String(account?.status || "").trim().toLowerCase();
  const userWarnings = [...new Set((technicalTrace.warnings || [])
    .map(accountWarningToUserCopy)
    .filter(Boolean))];
  if (userWarnings.length) {
    return {
      label: "Revisar sincronización",
      detail: userWarnings.slice(0, 2).join(" · "),
    };
  }
  if (status === "pending" || status === "pending_setup" || status === "draft" || status === "waiting_sync") {
    return {
      label: "Esperando primera sincronización",
      detail: "Abre MT5 con el EA activo. Cuando llegue el primer dato, la cuenta quedará lista en el dashboard.",
    };
  }
  if (account?.login || technicalTrace.updatedAt) {
    return {
      label: "Datos sincronizados",
      detail: "KMFX está recibiendo datos de esta cuenta. Las métricas se estabilizan cuanto más historial cerrado tenga MT5.",
    };
  }
  return {
    label: "Pendiente de datos",
    detail: "Instala el conector, pega la KMFXKey en el EA y espera la primera sincronización desde MetaTrader 5.",
  };
}

function accountDataSourceLabel(source) {
  const normalized = String(source || "").trim().toLowerCase();
  if (!normalized) return "Pendiente de datos";
  if (normalized.includes("mt5_sync_live") || normalized.includes("mt5")) return "MT5 sincronizado";
  if (normalized.includes("registry")) return "Registro de cuenta";
  if (normalized.includes("direct")) return "Conexión directa";
  if (normalized.includes("manual")) return "Dato manual";
  return "Datos de cuenta";
}

function accountConnectionModeLabel(mode) {
  const normalized = String(mode || "").trim().toLowerCase();
  if (!normalized) return "Conector";
  if (normalized.includes("launcher")) return "Launcher";
  if (normalized.includes("direct")) return "Conexión directa";
  if (normalized.includes("ea") || normalized.includes("connector")) return "EA Connector";
  return "Conector";
}

function resolveAccountTechnicalTrace(account, state, activeAccount = null) {
  const payload = resolveAccountDashboardPayload(account, state, activeAccount);
  const riskSnapshot = resolveAccountRiskSnapshot(account, state, activeAccount);
  const professional = riskSnapshot.professional_metrics && typeof riskSnapshot.professional_metrics === "object"
    ? riskSnapshot.professional_metrics
    : {};
  const inputs = professional.inputs && typeof professional.inputs === "object" ? professional.inputs : {};
  const monteCarlo = professional.monte_carlo && typeof professional.monte_carlo === "object" ? professional.monte_carlo : {};
  const tailRisk = professional.tail_risk && typeof professional.tail_risk === "object" ? professional.tail_risk : {};
  const var95 = tailRisk.var_95 && typeof tailRisk.var_95 === "object" ? tailRisk.var_95 : {};
  const reportMetrics = payload.reportMetrics && typeof payload.reportMetrics === "object" ? payload.reportMetrics : {};
  const warnings = resolveAccountWarnings(riskSnapshot);
  const sampleSize = finiteAccountNumber(
    inputs.closed_trades_count
      ?? monteCarlo.sample_size
      ?? var95.sample_size
      ?? reportMetrics.totalTrades
      ?? payload.totalTrades,
    0
  );
  const payloadSource = String(payload.payloadSource || account.source || account.registry_source || "registry").trim();
  const connectionMode = String(account.connection_mode || account.connectionMode || payload.mode || "EA").trim();
  return {
    payloadSource,
    connectionMode,
    sampleSize,
    warnings,
    updatedAt: account.last_sync_at || account.lastSyncAt || payload.timestamp || "",
    riskStatus: riskSnapshot.status?.risk_status || riskSnapshot.risk_status || account.status || "",
  };
}

function openAccountInfoModal(account, state, activeAccount = null) {
  const meta = accountStatusMeta(account.status, account.last_sync_at || account.lastSyncAt || "", account.connection_mode || account.connectionMode || "");
  let connectionKey = resolveAccountConnectionKey(account, state, activeAccount);
  let connectionPreview = resolveAccountConnectionPreview(account, connectionKey) || "No disponible";
  const accountId = account.account_id || "";
  const hasRecoverableKey = Boolean(connectionKey);
  const unavailableCopy = account.has_connection_key || account.connection_key_preview || account.connectionKeyPreview;
  const technicalTrace = resolveAccountTechnicalTrace(account, state, activeAccount);
  const dataHealth = resolveAccountDataHealth(account, technicalTrace);
  openModal({
    title: "Detalles de cuenta",
    subtitle: "Estado, servidor y KMFXKey de esta cuenta.",
    maxWidth: 980,
    content: `
      <div class="connections-account-modal__info">
        <div class="connections-account-modal__info-grid">
          <div class="connections-account-modal__info-block">
            <div class="connections-account-modal__label">Login</div>
            <div class="connections-account-modal__value">${escapeHtml(account.login || "—")}</div>
          </div>
          <div class="connections-account-modal__info-block">
            <div class="connections-account-modal__label">Servidor</div>
            <div class="connections-account-modal__value">${escapeHtml(account.server || "—")}</div>
          </div>
          <div class="connections-account-modal__info-block">
            <div class="connections-account-modal__label">Estado</div>
            <div class="connections-account-modal__value connections-account-modal__value--subtle">${escapeHtml(meta.label)}</div>
          </div>
          <div class="connections-account-modal__info-block">
            <div class="connections-account-modal__label">Última sincronización</div>
            <div class="connections-account-modal__value connections-account-modal__value--subtle">${escapeHtml(relativeTime(account.last_sync_at || account.lastSyncAt || ""))}</div>
          </div>
        </div>
        <div class="connections-account-modal__key-block">
          <div>
            <div class="connections-account-modal__label">KMFXKey</div>
            <div class="connections-account-modal__key-value" data-account-key-value="${escapeHtml(connectionPreview)}">${escapeHtml(connectionPreview)}</div>
            ${hasRecoverableKey ? "" : `
              <div class="connections-account-modal__key-note">
                ${unavailableCopy
                  ? "Por seguridad, la key completa solo se muestra al crearla o regenerarla. Si la has perdido, genera una nueva y pégala en el EA."
                  : "Esta cuenta todavía no tiene una KMFXKey lista para copiar."}
              </div>
            `}
          </div>
          <div class="connections-account-modal__key-actions">
            ${connectionKey ? `
              <button class="btn-secondary" type="button" data-account-modal-toggle-key="true">Mostrar</button>
              <button class="btn-secondary" type="button" data-account-copy-key="true">Copiar key</button>
              <button class="btn-secondary" type="button" data-account-regenerate-key="true">Regenerar key</button>
            ` : `<button class="btn-secondary" type="button" data-account-regenerate-key="true">Regenerar y copiar key</button>`}
          </div>
        </div>
        <div class="connections-account-modal__technical">
          <div class="connections-account-modal__guide-title">Estado de datos</div>
          <div class="connections-account-modal__technical-grid">
            <div>
              <span>Origen</span>
              <strong>${escapeHtml(accountDataSourceLabel(technicalTrace.payloadSource))}</strong>
            </div>
            <div>
              <span>Modo</span>
              <strong>${escapeHtml(accountConnectionModeLabel(technicalTrace.connectionMode))}</strong>
            </div>
            <div>
              <span>Muestra</span>
              <strong>${technicalTrace.sampleSize.toLocaleString("es-ES")} operaciones</strong>
            </div>
            <div>
              <span>Último dato recibido</span>
              <strong>${escapeHtml(relativeTime(technicalTrace.updatedAt))}</strong>
            </div>
          </div>
          <div class="connections-account-modal__technical-warning">
            <span>Lectura para el usuario</span>
            <strong>${escapeHtml(dataHealth.label)}</strong>
            <p>${escapeHtml(dataHealth.detail)}</p>
          </div>
        </div>
        <div class="connections-account-modal__guide">
          <div class="connections-account-modal__guide-title">Si esta cuenta se desconecta</div>
          <ol class="connections-account-modal__guide-list">
            <li>Abre MT5 y comprueba que Algo Trading está activo.</li>
            <li>Usa esta misma KMFXKey y reinstala el conector en el mismo MT5.</li>
            <li>Crea una key nueva solo si has eliminado o revocado la conexión, o si añades otra cuenta MT5.</li>
          </ol>
        </div>
        <div class="connections-account-modal__actions">
          <button class="btn-secondary" type="button" data-account-open-launcher="true">Abrir Launcher</button>
          <button class="btn-primary" type="button" data-modal-dismiss="true">Cerrar</button>
        </div>
      </div>
    `,
    onMount(card) {
      card?.classList.add("connections-account-modal", "connections-account-modal--info");
      let revealed = false;
      const valueNode = card?.querySelector("[data-account-key-value]");
      const toggleButton = card?.querySelector("[data-account-modal-toggle-key='true']");
      const copyButton = card?.querySelector("[data-account-copy-key='true']");
      const regenerateButton = card?.querySelector("[data-account-regenerate-key='true']");
      const regenerateDefaultText = regenerateButton?.textContent || "Regenerar y copiar key";
      toggleButton?.addEventListener("click", () => {
        if (!connectionKey || !valueNode) return;
        revealed = !revealed;
        valueNode.textContent = revealed ? connectionKey : connectionPreview;
        toggleButton.textContent = revealed ? "Ocultar" : "Mostrar";
        if (revealed) {
          void recordAccountAuditEvent({ accountId, event: "show_key", state });
        }
      });
      copyButton?.addEventListener("click", () => {
        copyText(connectionKey, "Clave copiada");
        void recordAccountAuditEvent({ accountId, event: "copy_key", state });
      });
      regenerateButton?.addEventListener("click", async () => {
        if (!accountId) return;
        const confirmed = window.confirm("Regenerar la KMFXKey sustituye la key actual. MT5 dejará de sincronizar hasta que pegues la nueva key en el EA o reinstales el conector desde el Launcher. ¿Continuar?");
        if (!confirmed) return;
        let regeneratedOk = false;
        regenerateButton.disabled = true;
        regenerateButton.textContent = "Generando...";
        try {
          const response = await fetch(resolveOwnAccountUrl(accountId, "regenerate-key"), {
            method: "POST",
            headers: buildAuthHeaders(state),
          });
          const payload = await response.json();
          if (!response.ok || payload?.ok === false || !payload?.connection_key) {
            showToast(payload?.reason || "No pude regenerar la key.", "error");
            return;
          }
          regeneratedOk = true;
          connectionKey = payload.connection_key;
          connectionPreview = maskConnectionKeyForDisplay(connectionKey);
          persistLocalConnectionKey({
            accountId,
            connectionKey,
            label: account.alias || account.display_name || account.login || "",
            state,
          });
          revealed = true;
          if (valueNode) valueNode.textContent = connectionKey;
          if (toggleButton) {
            toggleButton.disabled = false;
            toggleButton.textContent = "Ocultar";
          }
          if (copyButton) copyButton.disabled = false;
          copyText(connectionKey, "Key nueva copiada. Pégala en el EA.");
          window.dispatchEvent(new CustomEvent("kmfx:accounts-refresh"));
          regenerateButton.textContent = "Key regenerada";
        } catch {
          showToast("No pude conectar con el servidor de KMFX.", "error");
        } finally {
          regenerateButton.disabled = false;
          if (!regeneratedOk) regenerateButton.textContent = regenerateDefaultText;
        }
      });
      card?.querySelector("[data-account-open-launcher='true']")?.addEventListener("click", () => {
        openLauncher();
        void recordAccountAuditEvent({ accountId, event: "open_launcher", state });
      });
    },
  });
}

async function deleteManagedAccount({ store, root, accountId }) {
  if (!accountId) return;
  if (!window.confirm("Eliminar esta cuenta del dashboard? La KMFXKey actual quedará revocada y MT5 tendrá que conectarse con una key nueva si quieres volver a usarla.")) return;
  try {
    const response = await fetch(resolveOwnAccountUrl(accountId), {
      method: "DELETE",
      headers: buildAuthHeaders(store.getState()),
    });
    const payload = await response.json();
    if (!response.ok || payload?.ok === false) {
      showToast(payload?.reason || "No pude borrar la cuenta.", "error");
      return;
    }
    forgetLocalConnectionKey(accountId);
    await fetchAccountsRegistry(store);
    showToast("Cuenta eliminada", "success");
    renderConnections(root, store.getState());
  } catch {
    showToast("No pude conectar con el servidor de KMFX.", "error");
  }
}

async function fetchAccountsRegistry(store) {
  const url = resolveAccountsRegistryUrl();
  if (store.getState()?.auth?.status !== "authenticated") {
    store.setState((state) => ({
      ...state,
      managedAccounts: [],
    }));
    return;
  }
  if (!url) {
    console.info("[KMFX][API]", {
      label: "accounts-fetch-disabled",
      reason: "missing_api_base_url",
    });
    return;
  }
  try {
    const response = await fetch(url, { headers: buildAuthHeaders(store.getState()) });
    if (!response.ok) {
      store.setState((state) => ({
        ...state,
        managedAccounts: [],
      }));
      return;
    }
    const payload = await response.json();
    applyAdminAccess(store, payload?.is_admin);
    const accounts = Array.isArray(payload?.accounts) ? payload.accounts : [];
    const previousAccounts = Array.isArray(store.getState().managedAccounts) ? store.getState().managedAccounts : [];
    if (registrySignature(previousAccounts) === registrySignature(accounts)) {
      console.info("[KMFX][ACCOUNTS]", {
        label: "registry-unchanged",
        count: accounts.length,
      });
      return;
    }
    store.setState((state) => ({
      ...state,
      managedAccounts: accounts,
    }));
  } catch (error) {
    console.warn("[KMFX][ACCOUNTS] registry fetch error", error);
  }
}

function renderEmptyState(root, state = {}) {
  const connectionAccess = billingEntitlementState(state, "launcherConnection", { allowLimited: false, allowPending: false });
  root.innerHTML = `
    <div class="dashboard-premium-grid connections-shell">
      ${renderConnectionsHeader({ connectionAccess })}
      ${renderConnectionsKpis([], state)}
      <section class="connections-shell__main">
        ${renderBillingNotice(state)}
        ${renderConnectionAccessState(connectionAccess)}
        <article class="tl-section-card connections-empty-card">
          <div class="calendar-panel-head">
            <div>
              <div class="calendar-panel-title">Conecta tu cuenta MT5</div>
              <div class="calendar-panel-sub">Instala el conector con el Launcher y deja MT5 abierto con el EA activo. El Launcher puede cerrarse tras la primera sincronización.</div>
            </div>
          </div>
          <div class="connections-empty-card__actions">
            <button class="btn-primary" type="button" data-open-connection-wizard="true" data-connection-source="connections-empty"${connectionAccess.allowed ? "" : " disabled aria-disabled=\"true\""}>Conectar cuenta</button>
            <button class="btn-secondary connections-shell__utility-btn" type="button" data-account-guide-open="true">Ver guía</button>
          </div>
        </article>
      </section>
    </div>
  `;
}

function renderAccountsSection(registryAccounts, activeAccountId, activeAccount, adminVisible, adminState, uiState, state) {
  return `
    <div class="connections-account-list ${registryAccounts.length === 1 ? "connections-account-list--single" : ""}">
      ${registryAccounts.map((account, index) => renderAccountCard(account, {
          isActive: account.account_id === activeAccountId && activeAccount?.id === account.account_id,
          activeAccount,
          menuOpen: uiState.openMenuAccountId === account.account_id,
          menuOpenAbove: registryAccounts.length > 2 && index >= registryAccounts.length - 2,
          state,
          adminOpen: adminVisible && adminState.open,
          adminState,
        })).join("")}
    </div>
  `;
}

function renderAccountAdminPanel(account, adminState) {
  const accountId = account.account_id || "";
  const inspector = adminState.payloads?.[accountId];
  const syncError = account.sync_error || account.last_sync_error || account.error || "Sin error técnico registrado";
  const payloadMarkup = inspector
    ? `<pre class="kmfx-mt5-admin-payload">${escapeHtml(JSON.stringify(inspector.payload || inspector, null, 2))}</pre>`
    : `<div class="kmfx-mt5-admin-empty">Inspector preparado. Pulsa “Ver payload” para cargar el snapshot técnico.</div>`;

  return `
    <div class="kmfx-mt5-admin-panel">
      <div class="kmfx-mt5-admin-panel__head">
        <div>
          <div class="kmfx-mt5-admin-panel__eyebrow">Admin tools</div>
          <div class="kmfx-mt5-admin-panel__title">Capa técnica de cuenta</div>
        </div>
        <span class="kmfx-mt5-admin-panel__badge">solo admin</span>
      </div>
      <div class="kmfx-mt5-admin-actions">
        <button class="btn-secondary" type="button" data-admin-account-primary="${escapeHtml(accountId)}">Marcar primaria</button>
        <button class="btn-secondary" type="button" data-admin-account-inspect="${escapeHtml(accountId)}">Ver payload</button>
        <button class="btn-secondary" type="button" data-admin-account-regenerate="${escapeHtml(accountId)}">Regenerar key</button>
        <button class="btn-secondary" type="button" data-admin-account-archive="${escapeHtml(accountId)}">Archivar</button>
        <button class="btn-secondary" type="button" data-admin-account-delete="${escapeHtml(accountId)}">Borrar</button>
      </div>
      <div class="kmfx-mt5-admin-meta">
        <div><span>Account ID</span><strong>${escapeHtml(accountId || "sin account_id")}</strong></div>
        <div><span>Sync error</span><strong>${escapeHtml(syncError)}</strong></div>
      </div>
      ${adminState.loading === accountId ? `<div class="kmfx-mt5-admin-empty">Cargando detalle técnico...</div>` : payloadMarkup}
      ${adminState.error ? `<div class="kmfx-mt5-inline-error">${escapeHtml(adminState.error)}</div>` : ""}
    </div>
  `;
}

function resolveAccountBalanceLabel(account, activeAccount = null) {
  const registryBalance = Number(account.balance ?? account.equity ?? account.account_balance ?? account.account_equity);
  if (Number.isFinite(registryBalance)) {
    return formatCurrency(registryBalance, account.currency || account.account_currency);
  }

  if (activeAccount?.id === account.account_id) {
    const liveBalance = Number(activeAccount?.model?.account?.balance ?? activeAccount?.dashboardPayload?.balance);
    if (Number.isFinite(liveBalance)) {
      return formatCurrency(liveBalance, activeAccount?.model?.account?.currency || activeAccount?.dashboardPayload?.currency);
    }
  }

  return "Sin balance";
}

function resolveAccountPnlValue(account, activeAccount = null) {
  const registryPnl = Number(
    account.total_pnl ??
    account.totalPnl ??
    account.pnl ??
    account.open_pnl ??
    account.openPnl
  );
  if (Number.isFinite(registryPnl)) return registryPnl;

  if (activeAccount?.id === account.account_id) {
    const livePnl = Number(
      activeAccount?.model?.totals?.pnl ??
      activeAccount?.dashboardPayload?.totalPnl ??
      activeAccount?.dashboardPayload?.pnl
    );
    if (Number.isFinite(livePnl)) return livePnl;
  }

  return null;
}

function resolveAccountPnlLabel(account, activeAccount = null) {
  const pnlValue = resolveAccountPnlValue(account, activeAccount);
  if (!Number.isFinite(pnlValue)) return { label: "—", tone: "neutral", value: null };
  return {
    label: formatCurrency(pnlValue, account.currency || account.account_currency || activeAccount?.model?.account?.currency || activeAccount?.dashboardPayload?.currency),
    tone: pnlValue > 0 ? "positive" : pnlValue < 0 ? "negative" : "neutral",
    value: pnlValue,
  };
}

function resolveAccountPrimaryLabel(account, activeAccount = null) {
  return (
    account.login ||
    activeAccount?.model?.account?.login ||
    activeAccount?.dashboardPayload?.login ||
    account.account_id ||
    "Cuenta MT5"
  );
}

function resolveAccountSecondaryLabel(account, activeAccount = null) {
  const rawLabel = (
    account.label ||
    account.account_type ||
    account.mode ||
    activeAccount?.model?.account?.accountType ||
    activeAccount?.dashboardPayload?.accountType ||
    ""
  );

  const normalized = String(rawLabel).trim().toLowerCase();
  if (normalized.includes("demo")) return "Demo";
  if (normalized.includes("fund")) return "Funded";
  if (normalized.includes("chall") || normalized.includes("eval")) return "Challenge";
  if (normalized.includes("real") || normalized.includes("live")) return "Real";

  if (rawLabel) return String(rawLabel).trim();
  return "Real";
}

function resolveAccountMetaLine(account, activeAccount = null) {
  const primaryLabel = resolveAccountPrimaryLabel(account, activeAccount);
  const alias = String(account.alias || account.display_name || "").trim();
  if (account.server && String(account.server).trim() !== primaryLabel) return String(account.server).trim();
  if (alias && alias !== primaryLabel && alias.length <= 28) return alias;
  if (account.server) return String(account.server).trim();
  if (account.platform) return `Plataforma ${String(account.platform).toUpperCase()}`;
  return "Cuenta disponible";
}

function renderAccountCard(account, { isActive, activeAccount = null, menuOpen = false, menuOpenAbove = false, state = {}, adminOpen = false, adminState = null }) {
  const meta = accountStatusMeta(account.status, account.last_sync_at || account.lastSyncAt || "", account.connection_mode || account.connectionMode || "");
  const balanceLabel = resolveAccountBalanceLabel(account, activeAccount);
  const pnl = resolveAccountPnlLabel(account, activeAccount);
  const statusLine = isActive && isConnectedStatus(account.status) ? "Activa en panel" : meta.label;
  const primaryLabel = resolveAccountPrimaryLabel(account, activeAccount);
  const secondaryLabel = resolveAccountSecondaryLabel(account, activeAccount);
  const accountTag = secondaryLabel === "Funded" || secondaryLabel === "Challenge" ? secondaryLabel : "Real";
  const metaLine = resolveAccountMetaLine(account, activeAccount);
  const lastSyncLabel = relativeTime(account.last_sync_at || account.lastSyncAt || "");
  const accountId = account.account_id || "";
  const launcherLabel = "Abrir Launcher";
  return `
    <article class="widget-card connections-account-card ${menuOpen ? "connections-account-card--menu-open" : ""} ${menuOpen && menuOpenAbove ? "connections-account-card--menu-above" : ""}">
      <div class="connections-account-card__layout">
        <div class="connections-account-card__identity">
          <div class="calendar-panel-title">${escapeHtml(primaryLabel)}</div>
          <div class="row-sub">${escapeHtml(metaLine)}</div>
        </div>
        <div class="connections-account-card__metric connections-account-card__metric--tag">
          <div class="metric-label">Etiqueta</div>
          <div class="row-sub connections-account-card__tag-text">${escapeHtml(accountTag)}</div>
        </div>
        <div class="connections-account-card__metric">
          <div class="metric-label">Estado</div>
          <div class="row-sub">${escapeHtml(statusLine)}</div>
          ${meta.subtitle ? `<div class="row-sub connections-account-card__status-note">${escapeHtml(meta.subtitle)}</div>` : ""}
        </div>
        <div class="connections-account-card__metric">
          <div class="metric-label">Última sincronización</div>
          <div class="row-sub">${escapeHtml(lastSyncLabel)}</div>
        </div>
        <div class="connections-account-card__metric">
          <div class="metric-label">Balance actual</div>
          <div class="connections-account-card__metric-value">${escapeHtml(balanceLabel)}</div>
        </div>
        <div class="connections-account-card__metric">
          <div class="metric-label">PnL actual</div>
          <div class="connections-account-card__metric-value connections-account-card__pnl connections-account-card__pnl--${pnl.tone}">
            ${pnlTextMarkup({
              value: pnl.value,
              text: pnl.label,
              tone: pnl.tone === "positive" ? "profit" : pnl.tone === "negative" ? "loss" : "neutral",
              className: `connections-account-card__pnl--${pnl.tone}`,
            })}
          </div>
        </div>
        <div class="connections-account-card__actions">
          <button
            class="connections-account-card__menu-trigger"
            type="button"
            aria-label="Acciones de cuenta"
            aria-expanded="${menuOpen ? "true" : "false"}"
            data-account-menu-trigger="${escapeHtml(accountId)}"
          >•••</button>
          ${menuOpen ? `
            <div class="connections-account-card__menu" role="menu" aria-label="Acciones de cuenta" ${menuOpenAbove ? `style="top:auto;bottom:calc(100% + 10px);"` : ""}>
              <button class="connections-account-card__menu-item" type="button" role="menuitem" data-account-edit="${escapeHtml(accountId)}">Editar</button>
              <button class="connections-account-card__menu-item" type="button" role="menuitem" data-account-info="${escapeHtml(accountId)}">Ver detalles</button>
              <button class="connections-account-card__menu-item" type="button" role="menuitem" data-account-open-launcher="true">${escapeHtml(launcherLabel)}</button>
              <button class="connections-account-card__menu-item connections-account-card__menu-item--danger" type="button" role="menuitem" data-account-delete="${escapeHtml(accountId)}">Eliminar</button>
            </div>
          ` : ""}
        </div>
      </div>
      ${adminOpen && adminState ? renderAccountAdminPanel(account, adminState) : ""}
    </article>
  `;
}

export function initConnections(store) {
  const root = document.getElementById("connectionsRoot");
  if (!root) return;
  fetchAccountsRegistry(store);
  getConnectionsUiState(root);
  if (!root.__connectionsMenuEscapeBound) {
    root.__connectionsMenuEscapeBound = true;
    window.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      const uiState = getConnectionsUiState(root);
      if (!uiState.openMenuAccountId) return;
      uiState.openMenuAccountId = "";
      renderConnections(root, store.getState());
    });
  }
  const pollMs = isLocalRuntime() ? 5000 : 30000;
  console.info("[KMFX][ACCOUNTS]", {
    label: "registry-poll-config",
    intervalMs: pollMs,
    mode: isLocalRuntime() ? "local" : "production",
  });
  window.setInterval(() => fetchAccountsRegistry(store), pollMs);
  window.addEventListener("kmfx:accounts-refresh", async () => {
    await fetchAccountsRegistry(store);
    renderConnections(root, store.getState());
  });

  root.addEventListener("click", async (event) => {
    const uiState = getConnectionsUiState(root);
    const state = store.getState();
    const { accounts: registryAccounts } = resolveRegistryAccounts(state);

    const copyButton = event.target.closest("[data-copy-value]");
    if (copyButton) {
      copyText(copyButton.dataset.copyValue || "", copyButton.dataset.copyLabel || "Copiado");
      return;
    }

    const menuTrigger = event.target.closest("[data-account-menu-trigger]");
    if (menuTrigger) {
      const accountId = menuTrigger.dataset.accountMenuTrigger || "";
      uiState.openMenuAccountId = uiState.openMenuAccountId === accountId ? "" : accountId;
      renderConnections(root, store.getState());
      return;
    }

    if (!event.target.closest(".connections-account-card__menu")) {
      if (uiState.openMenuAccountId) {
        uiState.openMenuAccountId = "";
        renderConnections(root, store.getState());
        return;
      }
    }

    const editButton = event.target.closest("[data-account-edit]");
    if (editButton) {
      const accountId = editButton.dataset.accountEdit || "";
      const account = registryAccounts.find((item) => item.account_id === accountId);
      if (!account) return;
      uiState.openMenuAccountId = "";
      renderConnections(root, state);
      openAccountEditModal({ account, store, root });
      return;
    }

    const infoButton = event.target.closest("[data-account-info]");
    if (infoButton) {
      const accountId = infoButton.dataset.accountInfo || "";
      const account = registryAccounts.find((item) => item.account_id === accountId);
      if (!account) return;
      uiState.openMenuAccountId = "";
      renderConnections(root, state);
      openAccountInfoModal(account, state, selectActiveAccount(state));
      return;
    }

    const accountDeleteButton = event.target.closest("[data-account-delete]");
    if (accountDeleteButton) {
      const accountId = accountDeleteButton.dataset.accountDelete || "";
      uiState.openMenuAccountId = "";
      await deleteManagedAccount({ store, root, accountId });
      return;
    }

    if (event.target.closest("[data-account-admin-toggle]")) {
      const adminState = getAdminState(root);
      adminState.open = !adminState.open;
      adminState.error = "";
      renderConnections(root, store.getState());
      return;
    }

    if (event.target.closest("[data-account-guide-open]")) {
      openConnectionGuideModal();
      return;
    }

    const inspectButton = event.target.closest("[data-admin-account-inspect]");
    if (inspectButton) {
      const accountId = inspectButton.dataset.adminAccountInspect;
      if (!accountId) return;
      const adminState = getAdminState(root);
      adminState.loading = accountId;
      adminState.error = "";
      renderConnections(root, store.getState());
      try {
        const response = await fetch(resolveAdminAccountUrl(accountId, "payload"), {
          headers: buildAuthHeaders(store.getState()),
        });
        const payload = await response.json();
        if (!response.ok || payload?.ok === false) {
          adminState.error = payload?.reason || "No pude cargar el detalle técnico.";
        } else {
          adminState.payloads[accountId] = payload;
        }
      } catch {
        adminState.error = "No pude conectar con el endpoint admin.";
      } finally {
        adminState.loading = "";
        renderConnections(root, store.getState());
      }
      return;
    }

    const primaryButton = event.target.closest("[data-admin-account-primary]");
    if (primaryButton) {
      const accountId = primaryButton.dataset.adminAccountPrimary;
      if (!accountId) return;
      try {
        const response = await fetch(resolveAdminAccountUrl(accountId, "primary"), {
          method: "POST",
          headers: buildAuthHeaders(store.getState()),
        });
        const payload = await response.json();
        if (!response.ok || payload?.ok === false) {
          showToast(payload?.reason || "No pude marcar la cuenta como primaria.", "error");
          return;
        }
        await fetchAccountsRegistry(store);
        showToast("Cuenta marcada como primaria", "success");
        renderConnections(root, store.getState());
      } catch {
        showToast("No pude conectar con el endpoint admin.", "error");
      }
      return;
    }

    const regenerateButton = event.target.closest("[data-admin-account-regenerate]");
    if (regenerateButton) {
      const accountId = regenerateButton.dataset.adminAccountRegenerate;
      if (!accountId) return;
      try {
        const response = await fetch(resolveAdminAccountUrl(accountId, "regenerate-key"), {
          method: "POST",
          headers: buildAuthHeaders(store.getState()),
        });
        const payload = await response.json();
        if (!response.ok || payload?.ok === false) {
          showToast(payload?.reason || "No pude regenerar la key.", "error");
          return;
        }
        if (payload?.connection_key) {
          persistLocalConnectionKey({
            accountId,
            connectionKey: payload.connection_key,
            label: registryAccounts.find((item) => item.account_id === accountId)?.alias || "",
            state: store.getState(),
          });
          uiState.revealedKeyAccountId = accountId;
        }
        await fetchAccountsRegistry(store);
        showToast(payload?.connection_key ? "Key regenerada y lista para copiar" : "Key regenerada. Vuelve a vincular el Launcher.", "success");
        renderConnections(root, store.getState());
      } catch {
        showToast("No pude conectar con el endpoint admin.", "error");
      }
      return;
    }

    const archiveButton = event.target.closest("[data-admin-account-archive]");
    if (archiveButton) {
      const accountId = archiveButton.dataset.adminAccountArchive;
      if (!accountId) return;
      try {
        const response = await fetch(resolveAdminAccountUrl(accountId, "archive"), {
          method: "POST",
          headers: buildAuthHeaders(store.getState()),
        });
        const payload = await response.json();
        if (!response.ok || payload?.ok === false) {
          showToast(payload?.reason || "No pude archivar la cuenta.", "error");
          return;
        }
        await fetchAccountsRegistry(store);
        showToast("Cuenta archivada", "success");
        renderConnections(root, store.getState());
      } catch {
        showToast("No pude conectar con el endpoint admin.", "error");
      }
      return;
    }

    const deleteButton = event.target.closest("[data-admin-account-delete]");
    if (deleteButton) {
      const accountId = deleteButton.dataset.adminAccountDelete;
      await deleteManagedAccount({ store, root, accountId });
      return;
    }

    if (event.target.closest("[data-account-open-launcher]")) {
      openLauncher();
      return;
    }

    if (event.target.closest("[data-account-download-launcher]")) {
      const button = event.target.closest("[data-account-download-launcher]");
      downloadLauncher(button?.dataset.accountDownloadLauncher || "auto");
      return;
    }

    if (event.target.closest("[data-account-download-ea]")) {
      downloadEa();
      return;
    }

    const usePanelButton = event.target.closest("[data-account-use-panel]");
    if (usePanelButton) {
      const accountId = usePanelButton.dataset.accountUsePanel;
      if (!accountId) return;
      uiState.openMenuAccountId = "";
      store.setState((current) => ({
        ...current,
        currentAccount: accountId,
        activeLiveAccountId: accountId,
        activeAccountId: accountId,
        mode: Array.isArray(current.liveAccountIds) && current.liveAccountIds.includes(accountId) ? "live" : current.mode,
      }));
      showToast("Cuenta activada en el panel", "success");
      renderConnections(root, store.getState());
      return;
    }
  });
}

export function renderConnections(root, state) {
  const activeAccountId = selectActiveAccountId(state);
  const activeAccount = selectActiveAccount(state);
  const { accounts: registryAccounts, source: registrySource } = resolveRegistryAccounts(state);
  const adminVisible = isAdminUser(state);
  const adminState = getAdminState(root);
  const uiState = getConnectionsUiState(root);
  const isSingleAccount = registryAccounts.length === 1;
  const connectionAccess = billingEntitlementState(state, "launcherConnection", { allowLimited: false, allowPending: false });

  console.info("[KMFX][BOOT]", {
    label: "render-connections",
    mode: selectLiveAccountIds(state).length > 0 ? "live" : "mock",
    activeAccountId,
    registrySource,
  });

  if (!registryAccounts.length) {
    renderEmptyState(root, state);
    return;
  }

  root.innerHTML = `
    <div class="dashboard-premium-grid connections-shell">
      ${renderConnectionsHeader({ adminVisible, adminState, connectionAccess })}
      ${renderConnectionsKpis(registryAccounts, state)}
      <section class="connections-shell__main ${isSingleAccount ? "connections-shell__main--single" : ""}">
        ${renderBillingNotice(state)}
        ${renderConnectionAccessState(connectionAccess)}
        <div class="calendar-panel-head">
          <div class="dashboard-risk-block__title">Cuentas conectadas</div>
        </div>
        ${renderAccountsSection(registryAccounts, activeAccountId, activeAccount, adminVisible, adminState, uiState, state)}
      </section>
    </div>
  `;
}
