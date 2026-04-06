import { formatCurrency, formatPercent, getAccountTypeLabel, resolveAccountPnlSummary, resolveSelectedLiveAccountId, selectCurrentAccount, selectCurrentModel } from "./utils.js?v=build-20260406-104500";
import { badgeMarkup, getConnectionStatusMeta, getRiskStatusMeta } from "./status-badges.js?v=build-20260406-104500";

const accountSurfacePages = new Set(["dashboard"]);
const accountMeshMarkup = () => `
  <div class="account-card-blobs" aria-hidden="true">
    <div class="account-card-blob blob-1"></div>
    <div class="account-card-blob blob-2"></div>
    <div class="account-card-blob blob-3"></div>
    <div class="account-card-blob blob-4"></div>
  </div>
`;

function isBridgeDataPending(account) {
  if (!account || account.sourceType !== "mt5") return false;
  return !account.connection?.lastSync;
}

function accountStatusBadge(account) {
  const isConnected = Boolean(account?.connection?.connected);
  return `
    <span class="status-badge">
      <span class="status-dot ${isConnected ? "connected" : ""}"></span>
      ${isConnected ? "Conectada" : "Desconectada"}
    </span>
  `;
}

function renderAccountCard(account, isMain, isActive, isLoading) {
  const pnlSummary = resolveAccountPnlSummary(account);
  const pnl = account?.sourceType === "mt5"
    ? Number(pnlSummary.heroOpenPnl || 0)
    : Number(account?.model?.totals?.pnl || 0);
  const accountTypeLabel = getAccountTypeLabel(account?.model?.profile?.mode, account?.name);
  const trades = Number(account?.model?.totals?.totalTrades || 0);
  const meta = isMain ? `${accountTypeLabel} · activa` : accountTypeLabel;
  const cardInlineStyle = isMain
    ? "min-height:240px;box-shadow:none;filter:none;"
    : "min-height:240px;box-shadow:none;filter:none;";
  const topInlineStyle = isMain
    ? "display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:22px;"
    : "display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:16px;";
  const nameInlineStyle = isMain
    ? "font-size:18px;font-weight:700;letter-spacing:-0.02em;"
    : "font-size:14px;font-weight:700;letter-spacing:-0.01em;";
  const metaInlineStyle = isMain
    ? "font-size:12px;color:rgba(255,255,255,0.45);margin-top:3px;"
    : "font-size:11px;color:rgba(255,255,255,0.4);margin-top:2px;";
  const equityInlineStyle = isMain
    ? "font-size:34px;font-weight:700;letter-spacing:-0.04em;line-height:1;margin-bottom:4px;"
    : "font-size:22px;font-weight:700;letter-spacing:-0.03em;line-height:1;margin-bottom:3px;";
  const equityLabelInlineStyle = isMain
    ? "font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.07em;color:rgba(255,255,255,0.38);margin-bottom:18px;"
    : "font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:.07em;color:rgba(255,255,255,0.35);margin-bottom:14px;";
  const statsInlineStyle = isMain
    ? "display:grid;grid-template-columns:repeat(3,1fr);gap:10px;border-top:1px solid rgba(255,255,255,0.08);padding-top:16px;"
    : "display:grid;grid-template-columns:1fr 1fr;gap:8px;border-top:1px solid rgba(255,255,255,0.07);padding-top:12px;";
  const statLabelInlineStyle = isMain
    ? "font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:.07em;color:rgba(255,255,255,0.38);margin-bottom:4px;"
    : "font-size:8px;font-weight:600;text-transform:uppercase;letter-spacing:.07em;color:rgba(255,255,255,0.35);margin-bottom:3px;";
  const statValueInlineStyle = isMain
    ? "font-size:18px;font-weight:700;letter-spacing:-0.02em;"
    : "font-size:15px;font-weight:700;letter-spacing:-0.01em;";
  const pnlValueInlineStyle = `font-size:18px;font-weight:700;letter-spacing:-0.02em;color:${pnl >= 0 ? "var(--positive)" : "var(--negative)"};`;

  return `
    <button
      class="account-card account-hero-card ${isMain ? "account-hero-card--main" : "account-hero-card--side"} ${isActive ? "active" : ""} ${isLoading ? "is-loading" : ""}"
      data-account-id="${account.id}"
      type="button"
      style="${cardInlineStyle}"
    >
      ${accountMeshMarkup()}
      <div class="account-hero-card__content">
        <div class="account-hero-card__top" style="${topInlineStyle}">
          <div>
            <div class="account-hero-card__name" style="${nameInlineStyle}">${account.name}</div>
            <div class="account-hero-card__meta" style="${metaInlineStyle}">${meta}</div>
          </div>
          ${accountStatusBadge(account)}
        </div>
        <div class="account-hero-card__equity" style="${equityInlineStyle}">${formatCurrency(account.model.account.equity)}</div>
        <div class="account-hero-card__equity-label" style="${equityLabelInlineStyle}">Equity actual</div>
        <div class="account-hero-card__stats" style="${statsInlineStyle}">
          <div>
            <div class="account-hero-card__stat-label" style="${statLabelInlineStyle}">P&amp;L</div>
            <div class="account-hero-card__stat-val" style="${pnlValueInlineStyle}">${formatCurrency(pnl)}</div>
          </div>
          <div>
            <div class="account-hero-card__stat-label" style="${statLabelInlineStyle}">Win Rate</div>
            <div class="account-hero-card__stat-val" style="${statValueInlineStyle}">${formatPercent(account.model.totals.winRate)}</div>
          </div>
          ${isMain ? `
            <div>
              <div class="account-hero-card__stat-label" style="${statLabelInlineStyle}">Trades</div>
              <div class="account-hero-card__stat-val" style="${statValueInlineStyle}">${trades}</div>
            </div>
          ` : ""}
        </div>
      </div>
    </button>
  `;
}

export function initAccountsUI(store) {
  const root = document.getElementById("accountSwitcher");
  if (!root) return;
  let lastViewportMode = window.innerWidth <= 768 ? "mobile" : "desktop";

  root.addEventListener("change", (event) => {
    const select = event.target.closest("[data-account-selector]");
    if (!select) return;
    const accountId = select.value;
    const state = store.getState();
    const selectedAccount = state.accounts?.[accountId];
    if (!accountId || !selectedAccount || accountId === state.currentAccount) return;

    store.setState((current) => ({
      ...current,
      currentAccount: accountId,
      activeLiveAccountId: accountId,
      activeAccountId: accountId,
      mode: Array.isArray(current.liveAccountIds) && current.liveAccountIds.length > 0 ? "live" : current.mode,
    }));

    console.info("[KMFX][ACCOUNT_SELECTOR]", {
      selectedAccountId: accountId,
      login: selectedAccount.login || "",
      broker: selectedAccount.broker || "",
      payloadSource: selectedAccount.dashboardPayload?.payloadSource || selectedAccount.model?.sourceTrace?.payloadSource || "",
    });
    console.info("[KMFX][ACCOUNT_SELECTION_RESOLVED]", {
      selectedAccountId: accountId,
      selectedLogin: selectedAccount.login || "",
      broker: selectedAccount.broker || "",
      sourceType: selectedAccount.sourceType || "",
    });
  });

  root.addEventListener("click", (event) => {
    const button = event.target.closest("[data-account-id]");
    if (!button) return;
    const accountId = button.dataset.accountId;
    if (!accountId || accountId === store.getState().currentAccount) return;

    store.setState((state) => ({
      ...state,
      currentAccount: accountId,
      activeLiveAccountId: accountId,
      activeAccountId: accountId,
      mode: Array.isArray(state.liveAccountIds) && state.liveAccountIds.length > 0 ? "live" : state.mode,
    }));

    console.info("[KMFX][ACCOUNT_SELECTION_RESOLVED]", {
      selectedAccountId: accountId,
      selectedLogin: state.accounts?.[accountId]?.login || "",
      broker: state.accounts?.[accountId]?.broker || "",
      sourceType: state.accounts?.[accountId]?.sourceType || "",
    });
  });

  const render = (state) => {
    const visible = accountSurfacePages.has(state.ui.activePage);
    root.classList.toggle("is-empty", !visible);
    if (!visible) {
      root.innerHTML = "";
      return;
    }

    const liveAccountIds = Array.isArray(state.liveAccountIds) ? state.liveAccountIds : [];
    const activeAccountId = resolveSelectedLiveAccountId(state);
    const hasLiveAccounts = liveAccountIds.length > 0;
    console.log("[KMFX][PANEL]", {
      liveAccountIds,
      currentAccount: state.currentAccount,
      activeAccountId,
      hasLiveAccounts,
    });
    const accounts = liveAccountIds
      .map((accountId) => state.accounts?.[accountId])
      .filter((account) => account && typeof account === "object" && "id" in account);
    const activeAccount = state.accounts?.[activeAccountId] || accounts[0] || selectCurrentAccount(state);
    const activeModel = activeAccount?.model || selectCurrentModel(state);

    if (!hasLiveAccounts) {
      root.innerHTML = `
        <div class="account-switcher account-switcher--empty">
          <div class="account-switcher-header">
            <div>
              <div class="account-switcher-label">Cuentas</div>
              <div class="account-switcher-title">No hay cuentas conectadas</div>
              <div class="account-switcher-badges">
                <span class="ui-badge ui-badge--compact">Conecta MT5 para activar el selector real</span>
              </div>
            </div>
          </div>
        </div>
      `;
      return;
    }

    const activeAccountLabel = getAccountTypeLabel(activeAccount?.model?.profile?.mode, activeAccount?.name);
    const orderedAccounts = [...accounts].sort((left, right) => {
      if (left.id === activeAccountId) return -1;
      if (right.id === activeAccountId) return 1;
      return 0;
    });

    const accountCount = orderedAccounts.length;
    const scrollMode = accountCount >= 3;

    root.innerHTML = `
      <div class="account-switcher">
        <div class="account-switcher-header">
          <div>
            <div class="account-switcher-label">Cuentas</div>
            <div class="account-switcher-title">Cuenta activa</div>
            <div style="margin-top:10px;max-width:420px;">
              <select
                data-account-selector
                aria-label="Seleccionar cuenta activa"
                style="width:100%;padding:12px 14px;border-radius:14px;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.06);color:inherit;font:inherit;outline:none;"
              >
                ${accounts.map((account) => {
                  const label = [account.meta?.nickname || account.dashboardPayload?.nickname || "", account.broker, account.login, account.server].filter(Boolean).join(" · ");
                  return `<option value="${account.id}" ${account.id === activeAccountId ? "selected" : ""}>${label || account.name}</option>`;
                }).join("")}
              </select>
            </div>
            <div class="account-switcher-badges">
              ${badgeMarkup(getConnectionStatusMeta(activeAccount?.connection))}
              ${badgeMarkup(getRiskStatusMeta(activeAccount?.compliance))}
              <span class="ui-badge ui-badge--compact">${activeAccountLabel}</span>
            </div>
          </div>
          <div class="account-switcher-summary">
            <div class="footer-chip">${accounts.length} cuentas activas</div>
          </div>
        </div>

        <div class="account-cards-rail ${scrollMode ? "is-scrollable" : ""}" data-count="${accountCount}">
          <div class="account-cards-grid" data-count="${accountCount}" data-scrollable="${scrollMode ? "true" : "false"}">
            ${orderedAccounts.map((account) => {
              const isActive = account.id === activeAccountId;
              const isLoading = isBridgeDataPending(account);
              return renderAccountCard(account, isActive, isActive, isLoading);
            }).join("")}
          </div>
        </div>
      </div>
    `;
    console.info("[KMFX][ACCOUNT_RENDER]", {
      selectedAccountId: activeAccount?.id || "",
      login: activeAccount?.login || "",
      broker: activeAccount?.broker || "",
      payloadSource: activeAccount?.dashboardPayload?.payloadSource || activeAccount?.model?.sourceTrace?.payloadSource || "",
      sourceUsed: activeAccount?.sourceType === "mt5" ? "live" : "mock",
    });
  };

  render(store.getState());
  store.subscribe(render);
  window.addEventListener("resize", () => {
    const nextViewportMode = window.innerWidth <= 768 ? "mobile" : "desktop";
    if (nextViewportMode === lastViewportMode) return;
    lastViewportMode = nextViewportMode;
    render(store.getState());
  });
  console.log("[KMFX][ACCOUNT] ui ready");
}
