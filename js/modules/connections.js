import { resolveActiveAccountId, selectCurrentAccount } from "./utils.js?v=build-20260406-104500";
import { showToast } from "./toast.js?v=build-20260406-104500";
import { resolveAccountsRegistryUrl } from "./api-config.js?v=build-20260406-104500";
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
  if (status === "connected") {
    return {
      label: "Conectada",
      tone: "connected",
      subtitle: lastSyncAt ? `Último sync ${relative}` : "Sincronización activa",
      actionLabel: "Usar en panel",
      action: "use",
    };
  }
  if (status === "waiting_sync") {
    return {
      label: "Conectando…",
      tone: "waiting",
      subtitle: "Esperando datos desde MT5",
      actionLabel: "Abrir Launcher",
      action: "launcher",
    };
  }
  if (status === "pending_setup" || status === "pending") {
    return {
      label: "Pendiente",
      tone: "pending",
      subtitle: "Abre el Launcher para vincular",
      actionLabel: "Abrir Launcher",
      action: "launcher",
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
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) return;
    const payload = await response.json();
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

function renderAccountCard(account, { isActive }) {
  const meta = accountStatusMeta(account.status, account.last_sync_at || account.lastSyncAt || "");
  const identityLine = [account.broker || null, account.login || null, account.server || null].filter(Boolean).join(" · ") || "Pendiente de primer sync";
  const actionMarkup = meta.action === "use"
    ? `<button class="btn-primary" type="button" data-account-use="${account.account_id}">${isActive ? "Usando en panel" : meta.actionLabel}</button>`
    : meta.action === "launcher"
      ? `<button class="btn-primary" type="button" data-account-open-launcher="true">${meta.actionLabel}</button>`
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
          <button class="btn-secondary" type="button" data-account-download-launcher="true">Descargar Launcher</button>
          <button class="btn-primary" type="button" data-account-add="true">+ Añadir cuenta</button>
        </div>
      </header>

      <div class="kmfx-mt5-grid">
        ${registryAccounts.map((account) => renderAccountCard(account, { isActive: account.account_id === activeAccountId && activeAccount?.id === account.account_id })).join("")}
      </div>

      ${renderAccountWizard(root)}
    </section>
  `;
}
