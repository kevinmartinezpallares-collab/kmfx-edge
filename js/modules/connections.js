import { formatCurrency, selectActiveAccount, selectActiveAccountId, selectLiveAccountIds } from "./utils.js?v=build-20260406-213500";
import { showToast } from "./toast.js?v=build-20260406-213500";
import { resolveAccountsRegistryUrl } from "./api-config.js?v=build-20260406-213500";
import { renderRiskMetricCard } from "./risk-panel-components.js?v=build-20260406-213500";
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
  return `
    <header class="calendar-screen__header">
      <div class="calendar-screen__copy">
        <div class="calendar-screen__eyebrow">Cuentas</div>
        <h1 class="calendar-screen__title">Cuentas</h1>
        <p class="calendar-screen__subtitle">Consulta tus cuentas disponibles y añade nuevas cuando lo necesites.</p>
      </div>
      <div class="connections-shell__actions">
        ${adminVisible ? `<button class="btn-secondary connections-shell__utility-btn" type="button" data-account-admin-toggle="true">${adminState?.open ? "Cerrar admin" : "Admin tools"}</button>` : ""}
        <button class="btn-secondary connections-shell__utility-btn connections-shell__download-btn" type="button" data-account-download-launcher="true">Descargar instalador</button>
        <button class="btn-primary" type="button" data-open-connection-wizard="true" data-connection-source="connections">Añadir cuenta</button>
      </div>
    </header>
  `;
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

function renderEmptyState(root) {
  root.innerHTML = `
    <div class="dashboard-premium-grid connections-shell">
      ${renderConnectionsHeader()}
      ${renderConnectionsKpis([], null)}
      <section class="connections-shell__main">
        <article class="tl-section-card connections-empty-card">
          <div class="calendar-panel-head">
            <div>
              <div class="calendar-panel-title">Aún no tienes cuentas conectadas</div>
              <div class="calendar-panel-sub">Añade tu primera cuenta para empezar a operar con datos reales.</div>
            </div>
          </div>
          <div class="connections-empty-card__actions">
            <button class="btn-primary" type="button" data-open-connection-wizard="true" data-connection-source="connections-empty">Añadir cuenta</button>
            <button class="btn-secondary connections-shell__utility-btn connections-shell__download-btn" type="button" data-account-download-launcher="true">Descargar instalador</button>
          </div>
        </article>
      </section>
    </div>
  `;
}

function renderAccountsSection(registryAccounts, activeAccountId, activeAccount, adminVisible, adminState) {
  return `
    <div class="connections-account-list ${registryAccounts.length === 1 ? "connections-account-list--single" : ""}">
      ${registryAccounts.map((account) => renderAccountCard(account, {
          isActive: account.account_id === activeAccountId && activeAccount?.id === account.account_id,
          activeAccount,
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
  if (!Number.isFinite(pnlValue)) return { label: "—", tone: "neutral" };
  return {
    label: formatCurrency(pnlValue, account.currency || account.account_currency || activeAccount?.model?.account?.currency || activeAccount?.dashboardPayload?.currency),
    tone: pnlValue > 0 ? "positive" : pnlValue < 0 ? "negative" : "neutral",
  };
}

function renderAccountCard(account, { isActive, activeAccount = null, adminOpen = false, adminState = null }) {
  const meta = accountStatusMeta(account.status, account.last_sync_at || account.lastSyncAt || "");
  const balanceLabel = resolveAccountBalanceLabel(account, activeAccount);
  const pnl = resolveAccountPnlLabel(account, activeAccount);
  const statusLine = isActive ? "Activa en panel" : meta.label;
  const secondaryLabel = account.broker || account.server || account.platform || "";
  const lastSyncLabel = relativeTime(account.last_sync_at || account.lastSyncAt || "");
  const canUseInPanel = !isActive && meta.tone !== "error" && meta.tone !== "neutral";

  return `
    <article class="widget-card connections-account-card">
      <div class="connections-account-card__layout">
        <div class="connections-account-card__identity">
          <div class="calendar-panel-title">${escapeHtml(account.alias || account.display_name || "Cuenta MT5")}</div>
          ${secondaryLabel ? `<div class="row-sub">${escapeHtml(secondaryLabel)}</div>` : ""}
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
          <div class="metric-value">${escapeHtml(balanceLabel)}</div>
        </div>
        <div class="connections-account-card__metric">
          <div class="metric-label">PnL actual</div>
          <div class="metric-value connections-account-card__pnl connections-account-card__pnl--${pnl.tone}">${escapeHtml(pnl.label)}</div>
        </div>
        <div class="connections-account-card__actions">
          <button
            class="btn-secondary"
            type="button"
            ${canUseInPanel ? `data-account-use-panel="${escapeHtml(account.account_id || "")}"` : "disabled"}
          >${isActive ? "En panel" : "Usar en panel"}</button>
          <button class="btn-ghost" type="button" disabled>Editar</button>
          <button class="btn-ghost connections-account-card__danger" type="button" disabled>Eliminar</button>
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
  const pollMs = isLocalRuntime() ? 5000 : 30000;
  console.info("[KMFX][ACCOUNTS]", {
    label: "registry-poll-config",
    intervalMs: pollMs,
    mode: isLocalRuntime() ? "local" : "production",
  });
  window.setInterval(() => fetchAccountsRegistry(store), pollMs);

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
        <div class="calendar-panel-head">
          <div class="dashboard-risk-block__title">Cuentas conectadas</div>
        </div>
        ${renderAccountsSection(registryAccounts, activeAccountId, activeAccount, adminVisible, adminState)}
      </section>
    </div>
  `;
}
