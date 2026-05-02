import { closeModal, openModal } from "./modal-system.js?v=build-20260406-213500";
import { formatCurrency, selectActiveAccount, selectActiveAccountId, selectLiveAccountIds } from "./utils.js?v=build-20260406-213500";
import { showToast } from "./toast.js?v=build-20260406-213500";
import { resolveAccountsRegistryUrl } from "./api-config.js?v=build-20260406-213500";
import { renderRiskMetricCard } from "./risk-panel-components.js?v=build-20260406-213500";
import { pageHeaderMarkup, pnlTextMarkup } from "./ui-primitives.js?v=build-20260406-213500";
const LAUNCHER_DOWNLOAD_URL = "https://github.com/kevinmartinezpallares-collab/kmfx-edge/releases/latest";
const LAUNCHER_OPEN_URL = "kmfx-launcher://open";
const MT5_WEBREQUEST_URL = "https://mt5-api.kmfxedge.com";

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

function isConnectedStatus(status = "") {
  return ["connected", "active", "first_sync_received"].includes(String(status || "").toLowerCase());
}

function accountStatusMeta(status = "", lastSyncAt = "") {
  const relative = relativeTime(lastSyncAt);
  if (status === "connected" || status === "active" || status === "first_sync_received") {
    return {
      label: "Conectada",
      tone: "connected",
      subtitle: lastSyncAt ? `Actualizada ${relative}` : "Lista para usar",
      actionLabel: "",
      action: "none",
    };
  }
  if (status === "waiting_sync" || status === "linked") {
    return {
      label: "Conectando…",
      tone: "waiting",
      subtitle: "Esperando sincronización",
      actionLabel: "Abrir Launcher",
      action: "launcher",
    };
  }
  if (status === "pending_setup" || status === "pending" || status === "pending_link" || status === "draft") {
    return {
      label: "Pendiente",
      tone: "pending",
      subtitle: "Vincúlala desde el Launcher",
      actionLabel: "Abrir Launcher",
      action: "launcher",
    };
  }
  if (status === "archived") {
    return {
      label: "Archivada",
      tone: "neutral",
      subtitle: "Fuera del panel",
      actionLabel: "Ver detalle",
      action: "none",
    };
  }
  if (status === "stale") {
    return {
      label: "Sin actualizar",
      tone: "stale",
      subtitle: lastSyncAt ? `Última actividad ${relative}` : "Sin actividad reciente",
      actionLabel: "",
      action: "none",
    };
  }
  if (status === "error") {
    return {
      label: "Error de conexión",
      tone: "error",
      subtitle: "Revisa la conexión en Launcher",
      actionLabel: "Abrir Launcher",
      action: "launcher",
    };
  }
  return {
    label: "Desconectada",
    tone: "neutral",
    subtitle: "Sin conexión reciente",
    actionLabel: "Descargar Launcher",
    action: "download",
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

function renderConnectionsHeader({ adminVisible = false, adminState = null } = {}) {
  return pageHeaderMarkup({
    eyebrow: "Cuentas",
    title: "Cuentas",
    description: "Conecta y gestiona tus cuentas MT5 desde KMFX Launcher. KMFX no pide tu contraseña ni ejecuta operaciones.",
    className: "calendar-screen__header",
    contentClassName: "calendar-screen__copy",
    eyebrowClassName: "calendar-screen__eyebrow",
    titleClassName: "calendar-screen__title",
    descriptionClassName: "calendar-screen__subtitle",
    actionsClassName: "connections-shell__actions",
    actionsHtml: `
        ${adminVisible ? `<button class="btn-secondary connections-shell__utility-btn" type="button" data-account-admin-toggle="true">${adminState?.open ? "Cerrar admin" : "Admin tools"}</button>` : ""}
        <button class="btn-secondary connections-shell__utility-btn" type="button" data-account-open-launcher="true">Abrir Launcher</button>
        <button class="btn-primary" type="button" data-open-connection-wizard="true" data-connection-source="connections">Conectar MT5</button>
      `,
  });
}

function renderConnectionsKpis(accounts = []) {
  const accountsCount = accounts.length;
  const connectedCount = accounts.filter((account) => isConnectedStatus(account.status)).length;
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
    </section>
  `;
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

function renderConnectionGuide() {
  const steps = [
    {
      title: "Descarga KMFX Launcher",
      body: "Instala el Launcher e inicia sesión con la misma cuenta de KMFX que usas en el dashboard.",
    },
    {
      title: "Instala el conector",
      body: "Pulsa Instalar conector en la instancia de MetaTrader 5 que quieras vincular.",
    },
    {
      title: "Permite WebRequest en MT5",
      body: "En MT5 ve a Herramientas > Opciones > Expert Advisors, activa WebRequest y añade la URL de KMFX.",
    },
    {
      title: "Activa el EA",
      body: "Arrastra KMFXConnector a un gráfico, activa Algo Trading y pega la key solo si MT5 la solicita.",
    },
    {
      title: "Confirma la sincronización",
      body: "Cuando Experts muestre Conectado a KMFX, la cuenta aparecerá en Cuentas y en el dashboard.",
    },
  ];

  return `
    <section class="tl-section-card connections-guide-card" style="display:grid;gap:18px;">
      <div class="calendar-panel-head">
        <div>
          <div class="dashboard-risk-block__title">Conectar MT5 paso a paso</div>
          <div class="row-sub">Flujo recomendado para usuarios: Launcher, conector, permiso WebRequest y primera sincronización.</div>
        </div>
        <div class="connections-empty-card__actions">
          <button class="btn-secondary connections-shell__utility-btn" type="button" data-account-open-launcher="true">Abrir Launcher</button>
          <button class="btn-primary" type="button" data-account-download-launcher="true">Descargar Launcher</button>
        </div>
      </div>
      <div class="connections-guide-card__endpoint" style="display:flex;align-items:center;justify-content:space-between;gap:14px;padding:14px 16px;border:1px solid var(--border);border-radius:16px;background:var(--surface-elevated);">
        <div>
          <div class="metric-label">URL para WebRequest en MetaTrader 5</div>
          <code style="display:block;margin-top:6px;font-size:14px;color:var(--text-primary);word-break:break-all;">${escapeHtml(MT5_WEBREQUEST_URL)}</code>
        </div>
        <button class="btn-secondary connections-shell__utility-btn" type="button" data-copy-value="${escapeHtml(MT5_WEBREQUEST_URL)}" data-copy-label="URL copiada">Copiar URL</button>
      </div>
      <div class="connections-guide-card__steps" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px;">
        ${steps.map((step, index) => `
          <article class="connections-guide-step" style="display:flex;gap:12px;min-height:118px;padding:14px;border:1px solid var(--border);border-radius:16px;background:color-mix(in srgb, var(--surface-elevated) 72%, transparent);">
            <span class="connections-guide-step__index" style="display:grid;place-items:center;flex:0 0 28px;width:28px;height:28px;border-radius:999px;background:var(--layer-accent);color:var(--accent);font-weight:700;">${index + 1}</span>
            <div>
              <strong style="display:block;color:var(--text-primary);font-size:14px;line-height:1.25;">${escapeHtml(step.title)}</strong>
              <p style="margin:6px 0 0;color:var(--text-secondary);font-size:12px;line-height:1.45;">${escapeHtml(step.body)}</p>
            </div>
          </article>
        `).join("")}
      </div>
    </section>
  `;
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
  return (
    account.connection_key ||
    account.connectionKey ||
    account.api_key ||
    account.apiKey ||
    directoryAccount?.apiKey ||
    directoryAccount?.api_key ||
    activeAccount?.apiKey ||
    activeAccount?.model?.account?.apiKey ||
    activeAccount?.dashboardPayload?.apiKey ||
    ""
  );
}

function openAccountInfoModal(account, state, activeAccount = null) {
  const meta = accountStatusMeta(account.status, account.last_sync_at || account.lastSyncAt || "");
  const connectionKey = resolveAccountConnectionKey(account, state, activeAccount);
  const canInspectConnectionKey = isAdminUser(state);
  openModal({
    title: "Detalle de cuenta",
    subtitle: "Estado visible de esta cuenta en KMFX.",
    maxWidth: 640,
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
        ${connectionKey && canInspectConnectionKey ? `
          <div class="connections-account-modal__key-block">
            <div>
              <div class="connections-account-modal__label">Connection Key</div>
              <div class="connections-account-modal__key-value">${escapeHtml(connectionKey)}</div>
            </div>
            <button class="btn-secondary" type="button" data-account-copy-key="true">Copiar</button>
          </div>
        ` : ""}
        <div class="connections-account-modal__actions">
          <button class="btn-primary" type="button" data-modal-dismiss="true">Cerrar</button>
        </div>
      </div>
    `,
    onMount(card) {
      card?.classList.add("connections-account-modal", "connections-account-modal--info");
      card?.querySelector("[data-account-copy-key='true']")?.addEventListener("click", () => {
        copyText(connectionKey, "Clave copiada");
      });
    },
  });
}

async function deleteManagedAccount({ store, root, accountId }) {
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

function renderEmptyState(root) {
  root.innerHTML = `
    <div class="dashboard-premium-grid connections-shell">
      ${renderConnectionsHeader()}
      ${renderConnectionsKpis([], null)}
      <section class="connections-shell__main">
        <article class="tl-section-card connections-empty-card">
          <div class="calendar-panel-head">
            <div>
              <div class="calendar-panel-title">Conecta tu cuenta MT5</div>
              <div class="calendar-panel-sub">KMFX no pide tu contraseña ni ejecuta operaciones. Solo recibe datos enviados desde tu terminal MT5.</div>
            </div>
          </div>
          <div class="connections-empty-card__actions">
            <button class="btn-primary" type="button" data-open-connection-wizard="true" data-connection-source="connections-empty">Conectar MT5</button>
            <button class="btn-secondary connections-shell__utility-btn" type="button" data-account-open-launcher="true">Ya tengo el Launcher</button>
          </div>
        </article>
        ${renderConnectionGuide()}
      </section>
    </div>
  `;
}

function renderAccountsSection(registryAccounts, activeAccountId, activeAccount, adminVisible, adminState, openMenuAccountId = "") {
  return `
    <div class="connections-account-list ${registryAccounts.length === 1 ? "connections-account-list--single" : ""}">
      ${registryAccounts.map((account) => renderAccountCard(account, {
          isActive: account.account_id === activeAccountId && activeAccount?.id === account.account_id,
          activeAccount,
          menuOpen: openMenuAccountId === account.account_id,
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

function renderAccountCard(account, { isActive, activeAccount = null, menuOpen = false, adminOpen = false, adminState = null }) {
  const meta = accountStatusMeta(account.status, account.last_sync_at || account.lastSyncAt || "");
  const balanceLabel = resolveAccountBalanceLabel(account, activeAccount);
  const pnl = resolveAccountPnlLabel(account, activeAccount);
  const statusLine = isActive ? "Activa en panel" : meta.label;
  const primaryLabel = resolveAccountPrimaryLabel(account, activeAccount);
  const secondaryLabel = resolveAccountSecondaryLabel(account, activeAccount);
  const accountTag = secondaryLabel === "Funded" || secondaryLabel === "Challenge" ? secondaryLabel : "Real";
  const metaLine = resolveAccountMetaLine(account, activeAccount);
  const lastSyncLabel = relativeTime(account.last_sync_at || account.lastSyncAt || "");

  return `
    <article class="widget-card connections-account-card">
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
            data-account-menu-trigger="${escapeHtml(account.account_id || "")}"
          >•••</button>
          ${menuOpen ? `
            <div class="connections-account-card__menu" role="menu" aria-label="Acciones de cuenta">
              <button class="connections-account-card__menu-item" type="button" role="menuitem" data-account-edit="${escapeHtml(account.account_id || "")}">Editar</button>
              <button class="connections-account-card__menu-item" type="button" role="menuitem" data-account-info="${escapeHtml(account.account_id || "")}">Ver detalle</button>
              <button class="connections-account-card__menu-item connections-account-card__menu-item--danger" type="button" role="menuitem" data-account-delete="${escapeHtml(account.account_id || "")}">Eliminar</button>
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
      openAccountInfoModal(account, state);
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
      await deleteManagedAccount({ store, root, accountId });
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

  console.info("[KMFX][BOOT]", {
    label: "render-connections",
    mode: selectLiveAccountIds(state).length > 0 ? "live" : "mock",
    activeAccountId,
    registrySource,
  });

  if (!registryAccounts.length) {
    renderEmptyState(root);
    return;
  }

  root.innerHTML = `
    <div class="dashboard-premium-grid connections-shell">
      ${renderConnectionsHeader({ adminVisible, adminState })}
      ${renderConnectionsKpis(registryAccounts)}
      <section class="connections-shell__main ${isSingleAccount ? "connections-shell__main--single" : ""}">
        ${renderConnectionGuide()}
        <div class="calendar-panel-head">
          <div class="dashboard-risk-block__title">Cuentas conectadas</div>
        </div>
        ${renderAccountsSection(registryAccounts, activeAccountId, activeAccount, adminVisible, adminState, uiState.openMenuAccountId)}
      </section>
    </div>
  `;
}
