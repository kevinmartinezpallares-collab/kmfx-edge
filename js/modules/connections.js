import { resolveActiveAccountId, selectCurrentAccount } from "./utils.js?v=build-20260406-213500";
import { showToast } from "./toast.js?v=build-20260406-213500";
import { resolveAccountsRegistryUrl } from "./api-config.js?v=build-20260406-213500";
const LAUNCHER_DOWNLOAD_URL = "https://github.com/kevinmartinezpallares-collab/kmfx-edge/releases/latest";
const LAUNCHER_OPEN_URL = "kmfx-launcher://open";

function isLocalRuntime() {
  const hostname = window.location.hostname || "";
  return window.location.protocol === "file:" || hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function registrySignature(accounts = []) {
  return JSON.stringify(
    (Array.isArray(accounts) ? accounts : []).map((account) => ({
      account_id: account?.account_id || "",
      status: account?.status || "",
      broker: account?.broker || "",
      login: account?.login || "",
      server: account?.server || "",
      last_sync_at: account?.last_sync_at || "",
      updated_at: account?.updated_at || "",
    }))
  );
}

function openLauncher() {
  try {
    window.location.href = LAUNCHER_OPEN_URL;
    window.setTimeout(() => {
      window.open(LAUNCHER_DOWNLOAD_URL, "_blank", "noopener");
    }, 900);
  } catch {
    window.open(LAUNCHER_DOWNLOAD_URL, "_blank", "noopener");
  }
}

function downloadLauncher() {
  window.open(LAUNCHER_DOWNLOAD_URL, "_blank", "noopener");
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

function accountStatusMeta(status = "", lastSyncAt = "") {
  const relative = relativeTime(lastSyncAt);
  if (status === "connected" || status === "active") {
    return {
      label: "Conectada",
      tone: "connected",
      subtitle: lastSyncAt ? `Último sync ${relative}` : "Sincronización activa",
      actionLabel: "Usar en panel",
      action: "use",
    };
  }
  if (status === "waiting_sync" || status === "linked") {
    return {
      label: "Conectando…",
      tone: "waiting",
      subtitle: "Esperando datos desde MT5",
      actionLabel: "Abrir Launcher",
      action: "launcher",
    };
  }
  if (status === "pending_setup" || status === "pending" || status === "pending_link" || status === "draft") {
    return {
      label: "Pendiente",
      tone: "pending",
      subtitle: "Abre el Launcher para vincular",
      actionLabel: "Abrir Launcher",
      action: "launcher",
    };
  }
  if (status === "archived") {
    return {
      label: "Archivada",
      tone: "neutral",
      subtitle: "Fuera del Panel operativo",
      actionLabel: "Ver detalle",
      action: "none",
    };
  }
  if (status === "stale") {
    return {
      label: "Sin actualizar",
      tone: "stale",
      subtitle: lastSyncAt ? `Último sync ${relative}` : "Aún sin sync reciente",
      actionLabel: "Usar en panel",
      action: "use",
    };
  }
  if (status === "error") {
    return {
      label: "Error de conexión",
      tone: "error",
      subtitle: "Revisa la vinculación en Launcher",
      actionLabel: "Abrir Launcher",
      action: "launcher",
    };
  }
  return {
    label: "Desconectada",
    tone: "neutral",
    subtitle: "Sin actividad reciente",
    actionLabel: "Descargar Launcher",
    action: "download",
  };
}

function getWizardState(root) {
  if (!root.__accountWizardState) {
    root.__accountWizardState = {
      open: false,
      step: 1,
      alias: "",
      created: null,
      loading: false,
      error: "",
    };
  }
  return root.__accountWizardState;
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

function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function isAdminUser(state) {
  return state?.auth?.user?.is_admin === true;
}

function buildAuthHeaders(state, extra = {}) {
  const headers = {
    Accept: "application/json",
    ...extra,
  };
  const token = state?.auth?.session?.accessToken;
  const email = state?.auth?.user?.email;
  if (token) headers.Authorization = `Bearer ${token}`;
  if (email) headers["X-KMFX-User-Email"] = email;
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

async function fetchAccountsRegistry(store) {
  const url = resolveAccountsRegistryUrl();
  if (!url) {
    console.info("[KMFX][API]", {
      label: "accounts-fetch-disabled",
      reason: "missing_api_base_url",
    });
    return;
  }
  try {
    const response = await fetch(url, { headers: buildAuthHeaders(store.getState()) });
    if (!response.ok) return;
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

function renderAccountWizard(root) {
  const wizard = getWizardState(root);
  if (!wizard.open) return "";
  return `
    <div class="kmfx-modal-backdrop">
      <div class="kmfx-mt5-modal">
        <div class="kmfx-mt5-modal__header">
          <div>
            <div class="kmfx-mt5-modal__eyebrow">Nuevo onboarding</div>
            <div class="kmfx-mt5-modal__title">Añadir cuenta MT5</div>
            <div class="kmfx-mt5-modal__subtitle">${wizard.step === 1 ? "Crea la cuenta para generar su flujo de vinculación." : "La cuenta ya está lista. El siguiente paso ocurre en KMFX Launcher."}</div>
          </div>
          <button class="btn-secondary" type="button" data-account-close="true">Cerrar</button>
        </div>
        ${wizard.step === 1 ? `
          <div class="kmfx-mt5-modal__body">
            <label class="form-stack">
              <span>Alias</span>
              <input type="text" data-account-alias value="${wizard.alias || ""}" placeholder="Darwinex principal">
            </label>
            ${wizard.error ? `<div class="kmfx-mt5-inline-error">${wizard.error}</div>` : ""}
          </div>
          <div class="kmfx-mt5-modal__footer">
            <button class="btn-primary" type="button" data-account-create="true" ${wizard.loading ? "disabled" : ""}>${wizard.loading ? "Creando..." : "Crear cuenta"}</button>
          </div>
        ` : `
          <div class="kmfx-mt5-modal__success">
            <div class="kmfx-mt5-modal__success-icon">✓</div>
            <div class="kmfx-mt5-modal__success-title">Cuenta creada correctamente</div>
            <div class="kmfx-mt5-modal__success-copy">Abre KMFX Launcher y pulsa Vincular para completar la conexión automática.</div>
          </div>
          <div class="kmfx-mt5-modal__footer">
            <button class="btn-secondary" type="button" data-account-done="true">Cerrar</button>
            <button class="btn-primary" type="button" data-account-open-launcher="true">Abrir Launcher</button>
          </div>
        `}
      </div>
    </div>
  `;
}

function renderEmptyState(root) {
  root.innerHTML = `
    <section class="kmfx-mt5-page">
      <header class="kmfx-mt5-header">
        <div>
          <h1 class="kmfx-mt5-header__title">Cuentas MT5</h1>
          <p class="kmfx-mt5-header__subtitle">Gestiona y conecta tus cuentas de trading</p>
        </div>
        <div class="kmfx-mt5-header__actions">
          <button class="btn-secondary" type="button" data-account-download-launcher="true">Descargar Launcher</button>
          <button class="btn-primary" type="button" data-account-add="true">+ Añadir cuenta</button>
        </div>
      </header>

      <article class="kmfx-mt5-empty">
        <div class="kmfx-mt5-empty__icon">◎</div>
        <div class="kmfx-mt5-empty__title">Conecta tu primera cuenta MT5</div>
        <div class="kmfx-mt5-empty__copy">Descarga el Launcher y vincula tu cuenta en segundos</div>
        <ol class="kmfx-mt5-empty__steps">
          <li>Descarga KMFX Launcher</li>
          <li>Crea una cuenta</li>
          <li>Vincúlala automáticamente</li>
        </ol>
        <div class="kmfx-mt5-empty__actions">
          <button class="btn-secondary" type="button" data-account-download-launcher="true">Descargar Launcher</button>
          <button class="btn-primary" type="button" data-account-add="true">Añadir cuenta</button>
        </div>
      </article>
      ${renderAccountWizard(root)}
    </section>
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
        <button class="btn-secondary" type="button" data-admin-account-primary="${accountId}">Marcar primaria</button>
        <button class="btn-secondary" type="button" data-admin-account-inspect="${accountId}">Ver payload</button>
        <button class="btn-secondary" type="button" data-admin-account-regenerate="${accountId}">Regenerar key</button>
        <button class="btn-secondary" type="button" data-admin-account-archive="${accountId}">Archivar</button>
        <button class="btn-secondary" type="button" data-admin-account-delete="${accountId}">Borrar</button>
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

function renderAccountCard(account, { isActive, adminOpen = false, adminState = null }) {
  const meta = accountStatusMeta(account.status, account.last_sync_at || account.lastSyncAt || "");
  const identityLine = [account.broker || null, account.login || null, account.server || null].filter(Boolean).join(" · ") || "Pendiente de primer sync";
  const actionMarkup = meta.action === "use"
    ? `<button class="btn-primary" type="button" data-account-use="${account.account_id}">${isActive ? "Usando en panel" : meta.actionLabel}</button>`
    : meta.action === "launcher"
      ? `<button class="btn-primary" type="button" data-account-open-launcher="true">${meta.actionLabel}</button>`
      : meta.action === "none"
        ? `<button class="btn-secondary" type="button" disabled>${meta.actionLabel}</button>`
      : `<button class="btn-secondary" type="button" data-account-download-launcher="true">${meta.actionLabel}</button>`;

  return `
    <article class="kmfx-mt5-card ${isActive ? "is-active" : ""}">
      <div class="kmfx-mt5-card__top">
        <div>
          <div class="kmfx-mt5-card__alias">${account.alias || account.display_name || "Cuenta MT5"}</div>
          <div class="kmfx-mt5-card__identity">${identityLine}</div>
        </div>
      </div>
      <div class="kmfx-mt5-card__status-row">
        <div class="kmfx-mt5-status kmfx-mt5-status--${meta.tone}">
          <span class="kmfx-mt5-status__dot"></span>
          <div>
            <div class="kmfx-mt5-status__label">${meta.label}</div>
            <div class="kmfx-mt5-status__subtitle">${meta.subtitle}</div>
          </div>
        </div>
        <div class="kmfx-mt5-card__sync">${account.last_sync_at || account.lastSyncAt ? relativeTime(account.last_sync_at || account.lastSyncAt) : "Sin sync"}</div>
      </div>
      <div class="kmfx-mt5-card__actions">
        ${actionMarkup}
      </div>
      ${adminOpen && adminState ? renderAccountAdminPanel(account, adminState) : ""}
    </article>
  `;
}

export function initConnections(store) {
  const root = document.getElementById("connectionsRoot");
  if (!root) return;
  fetchAccountsRegistry(store);
  const pollMs = isLocalRuntime() ? 5000 : 30000;
  console.info("[KMFX][ACCOUNTS]", {
    label: "registry-poll-config",
    intervalMs: pollMs,
    mode: isLocalRuntime() ? "local" : "production",
  });
  window.setInterval(() => fetchAccountsRegistry(store), pollMs);

  root.addEventListener("input", (event) => {
    const aliasInput = event.target.closest("[data-account-alias]");
    if (!aliasInput) return;
    getWizardState(root).alias = aliasInput.value;
  });

  root.addEventListener("click", async (event) => {
    if (event.target.closest("[data-account-admin-toggle]")) {
      const adminState = getAdminState(root);
      adminState.open = !adminState.open;
      adminState.error = "";
      renderConnections(root, store.getState());
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
        await fetchAccountsRegistry(store);
        showToast("Key regenerada. Vuelve a vincular el Launcher.", "success");
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
      if (!accountId) return;
      if (!window.confirm("Borrar esta cuenta de forma permanente?")) return;
      try {
        const response = await fetch(resolveAdminAccountUrl(accountId), {
          method: "DELETE",
          headers: buildAuthHeaders(store.getState()),
        });
        const payload = await response.json();
        if (!response.ok || payload?.ok === false) {
          showToast(payload?.reason || "No pude borrar la cuenta.", "error");
          return;
        }
        await fetchAccountsRegistry(store);
        showToast("Cuenta borrada", "success");
        renderConnections(root, store.getState());
      } catch {
        showToast("No pude conectar con el endpoint admin.", "error");
      }
      return;
    }

    const useButton = event.target.closest("[data-account-use]");
    if (useButton) {
      const accountId = useButton.dataset.accountUse;
      if (!accountId) return;
      store.setState((state) => ({
        ...state,
        currentAccount: accountId,
        activeLiveAccountId: accountId,
        activeAccountId: accountId,
        mode: state.accounts?.[accountId]?.sourceType === "mt5" || state.accountDirectory?.[accountId] ? "live" : state.mode,
        ui: {
          ...state.ui,
          activePage: "dashboard",
        },
      }));
      showToast("Cuenta activa actualizada", "success");
      return;
    }

    if (event.target.closest("[data-account-open-launcher]")) {
      openLauncher();
      return;
    }

    if (event.target.closest("[data-account-download-launcher]")) {
      downloadLauncher();
      return;
    }

    if (event.target.closest("[data-account-add]")) {
      root.__accountWizardState = { open: true, step: 1, alias: "", created: null, loading: false, error: "" };
      renderConnections(root, store.getState());
      return;
    }

    if (event.target.closest("[data-account-close]") || event.target.closest("[data-account-done]")) {
      root.__accountWizardState = { open: false, step: 1, alias: "", created: null, loading: false, error: "" };
      renderConnections(root, store.getState());
      return;
    }

    if (event.target.closest("[data-account-create]")) {
      const wizard = getWizardState(root);
      const alias = String(wizard.alias || "").trim();
      if (!alias) {
        wizard.error = "El alias es obligatorio.";
        renderConnections(root, store.getState());
        return;
      }
      wizard.loading = true;
      wizard.error = "";
      renderConnections(root, store.getState());
      try {
        const registryUrl = resolveAccountsRegistryUrl();
        if (!registryUrl) {
          wizard.loading = false;
          wizard.error = "Configura KMFX API Base URL para crear cuentas en producción.";
          renderConnections(root, store.getState());
          return;
        }
        const response = await fetch(registryUrl, {
          method: "POST",
          headers: buildAuthHeaders(store.getState(), { "Content-Type": "application/json" }),
          body: JSON.stringify({ alias, platform: "mt5" }),
        });
        const payload = await response.json();
        if (!response.ok || !payload?.account_id) {
          wizard.loading = false;
          wizard.error = payload?.reason || "No pude crear la cuenta.";
          renderConnections(root, store.getState());
          return;
        }
        wizard.loading = false;
        wizard.step = 2;
        wizard.created = payload;
        await fetchAccountsRegistry(store);
        renderConnections(root, store.getState());
        showToast("Cuenta creada. Sigue en Launcher para vincularla.", "success");
      } catch {
        wizard.loading = false;
        wizard.error = "No pude conectar con el backend.";
        renderConnections(root, store.getState());
      }
    }
  });
}

export function renderConnections(root, state) {
  console.info("[KMFX][BOOT]", {
    label: "render-connections",
    mode: Array.isArray(state.liveAccountIds) && state.liveAccountIds.length > 0 ? "live" : "mock",
    currentAccount: state.currentAccount,
    liveAccountIds: state.liveAccountIds || [],
  });
  const managedAccounts = Array.isArray(state.managedAccounts) ? state.managedAccounts : [];
  const liveAccountIds = Array.isArray(state.liveAccountIds) ? state.liveAccountIds : [];
  const accountDirectory = state.accountDirectory && typeof state.accountDirectory === "object" ? state.accountDirectory : {};
  const activeAccountId = resolveActiveAccountId(state);
  const activeAccount = selectCurrentAccount(state);
  const adminVisible = isAdminUser(state);
  const adminState = getAdminState(root);
  const fallbackLiveAccounts = liveAccountIds
    .map((accountId) => accountDirectory[accountId])
    .filter(Boolean);
  const registryAccounts = managedAccounts.length ? managedAccounts : fallbackLiveAccounts.map((account) => ({
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

  if (!registryAccounts.length) {
    renderEmptyState(root);
    return;
  }

  root.innerHTML = `
    <section class="kmfx-mt5-page">
      <header class="kmfx-mt5-header">
        <div>
          <h1 class="kmfx-mt5-header__title">Cuentas MT5</h1>
          <p class="kmfx-mt5-header__subtitle">Gestiona y conecta tus cuentas de trading</p>
        </div>
        <div class="kmfx-mt5-header__actions">
          ${adminVisible ? `<button class="btn-secondary" type="button" data-account-admin-toggle="true">${adminState.open ? "Cerrar admin" : "Admin tools"}</button>` : ""}
          <button class="btn-secondary" type="button" data-account-download-launcher="true">Descargar Launcher</button>
          <button class="btn-primary" type="button" data-account-add="true">+ Añadir cuenta</button>
        </div>
      </header>

      <div class="kmfx-mt5-grid">
        ${registryAccounts.map((account) => renderAccountCard(account, {
          isActive: account.account_id === activeAccountId && activeAccount?.id === account.account_id,
          adminOpen: adminVisible && adminState.open,
          adminState,
        })).join("")}
      </div>

      ${renderAccountWizard(root)}
    </section>
  `;
}
