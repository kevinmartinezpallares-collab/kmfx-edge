import { formatDateTime, resolveActiveAccountId, selectCurrentAccount } from "./utils.js?v=build-20260401-203500";
import { showToast } from "./toast.js?v=build-20260401-203500";

const DEFAULT_ACCOUNTS_REGISTRY_URL = "http://127.0.0.1:8000/accounts";

function normalizeRegistryUrl(rawUrl = "") {
  const value = String(rawUrl || "").trim();
  if (!value) return DEFAULT_ACCOUNTS_REGISTRY_URL;
  if (value.startsWith("ws://")) return value.replace("ws://", "http://").replace(/:\d+$/, ":8000") + "/accounts";
  if (value.startsWith("wss://")) return value.replace("wss://", "https://").replace(/:\d+$/, ":8000") + "/accounts";
  return DEFAULT_ACCOUNTS_REGISTRY_URL;
}

function getAccountsRegistryUrl() {
  try {
    const raw = window.localStorage.getItem("kmfx.settings.preferences");
    if (!raw) return DEFAULT_ACCOUNTS_REGISTRY_URL;
    const parsed = JSON.parse(raw);
    return normalizeRegistryUrl(parsed?.bridgeUrl || "");
  } catch {
    return DEFAULT_ACCOUNTS_REGISTRY_URL;
  }
}

function accountStatusMeta(status = "") {
  if (status === "connected") return { label: "Conectada", tone: "ok" };
  if (status === "pending" || status === "pending_setup" || status === "waiting_sync") return { label: "Pendiente", tone: "info" };
  if (status === "stale") return { label: "Sin actualizar", tone: "warn" };
  if (status === "error") return { label: "Error", tone: "error" };
  return { label: "Desconectada", tone: "neutral" };
}

function badge(meta = {}) {
  return `<span class="ui-badge ui-badge--${meta.tone || "neutral"} ui-badge--compact">${meta.label || "Estado"}</span>`;
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

async function fetchAccountsRegistry(store) {
  const url = getAccountsRegistryUrl();
  try {
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) return;
    const payload = await response.json();
    const accounts = Array.isArray(payload?.accounts) ? payload.accounts : [];
    store.setState((state) => ({
      ...state,
      managedAccounts: accounts,
    }));
  } catch (error) {
    console.warn("[KMFX][ACCOUNTS] registry fetch error", error);
  }
}

function copyText(value) {
  if (!value) return Promise.resolve(false);
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(value).then(() => true).catch(() => false);
  }
  return Promise.resolve(false);
}

function renderAccountWizard(root) {
  const wizard = getWizardState(root);
  if (!wizard.open) return "";
  return `
    <div class="kmfx-modal-backdrop">
      <div class="tl-section-card" style="max-width:560px;width:min(92vw,560px);margin:48px auto;padding:24px;">
        <div class="tl-section-header">
          <div>
            <div class="tl-section-title">Añadir cuenta MT5</div>
            <div class="row-sub">${wizard.step === 1 ? "Crea la cuenta y genera su connection_key." : "Vincula esta cuenta en KMFX Launcher y ejecuta el primer sync."}</div>
          </div>
          <button class="btn-secondary" type="button" data-account-close="true">Cerrar</button>
        </div>
        ${wizard.step === 1 ? `
          <div class="form-stack" style="display:grid;gap:12px;">
            <label class="form-stack">
              <span>Alias</span>
              <input type="text" data-account-alias value="${wizard.alias || ""}" placeholder="Darwinex Live · Principal">
            </label>
            ${wizard.error ? `<div class="row-sub" style="color:var(--negative);">${wizard.error}</div>` : ""}
            <div class="settings-actions">
              <button class="btn-primary" type="button" data-account-create="true" ${wizard.loading ? "disabled" : ""}>${wizard.loading ? "Creando..." : "Crear cuenta"}</button>
            </div>
          </div>
        ` : `
          <div class="info-list compact">
            <div><strong>Alias</strong><span>${wizard.created?.alias || "—"}</span></div>
            <div><strong>Connection Key</strong><span style="font-family:monospace;word-break:break-all;">${wizard.created?.connection_key || "—"}</span></div>
            <div><strong>Estado</strong><span>${wizard.created?.status || "pending_setup"}</span></div>
          </div>
          <div class="row-sub" style="margin-top:14px;">Abre KMFX Launcher, pega este <code>connection_key</code>, guarda la vinculación y luego lanza el primer sync desde MT5.</div>
          <div class="settings-actions" style="margin-top:16px;">
            <button class="btn-secondary" type="button" data-account-copy="true">Copiar código</button>
            <button class="btn-primary" type="button" data-account-done="true">Continuar</button>
          </div>
        `}
      </div>
    </div>
  `;
}

export function initConnections(store) {
  const root = document.getElementById("connectionsRoot");
  if (!root) return;
  fetchAccountsRegistry(store);
  window.setInterval(() => fetchAccountsRegistry(store), 5000);

  root.addEventListener("input", (event) => {
    const aliasInput = event.target.closest("[data-account-alias]");
    if (!aliasInput) return;
    getWizardState(root).alias = aliasInput.value;
  });

  root.addEventListener("click", async (event) => {
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
      root.__accountWizardState = { open: true, step: 1, alias: "", created: null, loading: false, error: "" };
      renderConnections(root, store.getState());
      return;
    }

    if (event.target.closest("[data-account-close]")) {
      root.__accountWizardState = { open: false, step: 1, alias: "", created: null, loading: false, error: "" };
      renderConnections(root, store.getState());
      return;
    }

    if (event.target.closest("[data-account-copy]")) {
      const wizard = getWizardState(root);
      const copied = await copyText(wizard.created?.connection_key || "");
      showToast(copied ? "Connection key copiada" : "No pude copiar el código", copied ? "success" : "error");
      return;
    }

    if (event.target.closest("[data-account-done]")) {
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
        const response = await fetch(getAccountsRegistryUrl(), {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
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
        showToast("Cuenta creada. Vincúlala ahora en KMFX Launcher.", "success");
      } catch (error) {
        wizard.loading = false;
        wizard.error = "No pude conectar con el backend.";
        renderConnections(root, store.getState());
      }
    }
  });
}

export function renderConnections(root, state) {
  const managedAccounts = Array.isArray(state.managedAccounts) ? state.managedAccounts : [];
  const liveAccountIds = Array.isArray(state.liveAccountIds) ? state.liveAccountIds : [];
  const accountDirectory = state.accountDirectory && typeof state.accountDirectory === "object" ? state.accountDirectory : {};
  const activeAccountId = resolveActiveAccountId(state);
  const activeAccount = selectCurrentAccount(state);
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
    connection_key: account.apiKey || account.connectionKey || "",
  }));
  const connectedAccounts = registryAccounts.filter((account) => account.status === "connected");
  const pendingAccounts = registryAccounts.filter((account) => account.status === "pending" || account.status === "pending_setup" || account.status === "waiting_sync");
  const erroredAccounts = registryAccounts.filter((account) => account.status === "error");

  if (!registryAccounts.length) {
    root.innerHTML = `
      <div class="tl-page-header">
        <div class="tl-page-title">Cuentas</div>
        <div class="tl-page-sub">Crea cuentas MT5, genera su connection_key y vincúlalas desde KMFX Launcher.</div>
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
            <div class="row-title">Crea la cuenta</div>
            <div class="row-sub">Genera su connection_key desde el dashboard.</div>
          </article>
          <article class="connection-step-card">
            <div class="row-chip">2</div>
            <div class="row-title">Vincúlala en Launcher</div>
            <div class="row-sub">Pega el connection_key y reinstala/repara el connector si hace falta.</div>
          </article>
          <article class="connection-step-card">
            <div class="row-chip">3</div>
            <div class="row-title">Haz el primer sync</div>
            <div class="row-sub">El backend rellenará broker, login, server y último sync automáticamente.</div>
          </article>
        </div>
      </article>
      ${renderAccountWizard(root)}
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
      <article class="tl-kpi-card"><div class="tl-kpi-label">Cuenta activa</div><div class="tl-kpi-val">${activeAccount?.name || "Sin cuenta"}</div></article>
    </div>

    <article class="tl-section-card">
      <div class="tl-section-header">
        <div>
          <div class="tl-section-title">Cuentas conectadas</div>
          <div class="row-sub">Cada cuenta conserva alias, connection_key, estado y sincronización real desde backend.</div>
        </div>
        <button class="btn-primary" type="button" data-account-add="true">Añadir cuenta</button>
      </div>
      <div class="connections-grid">
        ${registryAccounts.map((account) => {
          const statusMeta = accountStatusMeta(account.status);
          const isActive = account.account_id === activeAccountId;
          return `
            <article class="tl-section-card ${isActive ? "account-registry-card--active" : ""}">
              <div class="tl-section-header">
                <div>
                  <div class="tl-section-title">${account.alias || account.display_name || `${account.broker || "MT5"} · ${account.login || "Cuenta"}`}</div>
                  <div class="row-sub">${account.platform?.toUpperCase?.() || "MT5"} · ${account.connection_mode || account.connectionMode || "launcher"}</div>
                </div>
                ${badge(statusMeta)}
              </div>
              <div class="info-list compact">
                <div><strong>Broker</strong><span>${account.broker || "—"}</span></div>
                <div><strong>Login</strong><span>${account.login || "—"}</span></div>
                <div><strong>Servidor</strong><span>${account.server || "—"}</span></div>
                <div><strong>Último sync</strong><span>${formatDateTime(account.last_sync_at || account.lastSyncAt)}</span></div>
              </div>
              <div class="settings-actions">
                <button class="btn-secondary" type="button" data-account-use="${account.account_id}">${isActive ? "Cuenta en uso" : "Usar en Panel"}</button>
              </div>
            </article>
          `;
        }).join("")}
      </div>
    </article>
    ${renderAccountWizard(root)}
  `;
}
