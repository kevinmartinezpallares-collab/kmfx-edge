import { formatCurrency, formatPercent, getAccountTypeLabel, selectCurrentAccount, selectCurrentModel } from "./utils.js";
import { badgeMarkup, getConnectionStatusMeta, getRiskStatusMeta } from "./status-badges.js?v=status-badges-1";

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
  const pnl = Number(account?.model?.totals?.pnl || 0);
  const accountTypeLabel = getAccountTypeLabel(account?.model?.profile?.mode, account?.name);
  const trades = Number(account?.model?.totals?.totalTrades || 0);
  const meta = isMain ? `${accountTypeLabel} · activa` : accountTypeLabel;

  return `
    <button
      class="account-card account-hero-card ${isMain ? "account-hero-card--main" : "account-hero-card--side"} ${isActive ? "active" : ""} ${isLoading ? "is-loading" : ""}"
      data-account-id="${account.id}"
      type="button"
    >
      ${accountMeshMarkup()}
      <div class="account-hero-card__content">
        <div class="account-hero-card__top">
          <div>
            <div class="account-hero-card__name">${account.name}</div>
            <div class="account-hero-card__meta">${meta}</div>
          </div>
          ${accountStatusBadge(account)}
        </div>
        <div class="account-hero-card__equity">${formatCurrency(account.model.account.equity)}</div>
        <div class="account-hero-card__equity-label">Equity actual</div>
        <div class="account-hero-card__stats">
          <div>
            <div class="account-hero-card__stat-label">P&amp;L</div>
            <div class="account-hero-card__stat-val ${pnl >= 0 ? "green" : "metric-negative"}">${formatCurrency(pnl)}</div>
          </div>
          <div>
            <div class="account-hero-card__stat-label">Win Rate</div>
            <div class="account-hero-card__stat-val">${formatPercent(account.model.totals.winRate)}</div>
          </div>
          ${isMain ? `
            <div>
              <div class="account-hero-card__stat-label">Trades</div>
              <div class="account-hero-card__stat-val">${trades}</div>
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

  root.addEventListener("click", (event) => {
    const button = event.target.closest("[data-account-id]");
    if (!button) return;
    const accountId = button.dataset.accountId;
    if (!accountId || accountId === store.getState().currentAccount) return;

    store.setState((state) => ({
      ...state,
      currentAccount: accountId
    }));

    console.log("[KMFX][ACCOUNT] switched", accountId);
  });

  const render = (state) => {
    const visible = accountSurfacePages.has(state.ui.activePage);
    root.classList.toggle("is-empty", !visible);
    if (!visible) {
      root.innerHTML = "";
      return;
    }

    const activeAccount = selectCurrentAccount(state);
    const activeModel = selectCurrentModel(state);
    const accounts = Object.values(state.accounts).filter((account) => account && typeof account === "object" && "id" in account);
    const activeAccountLabel = getAccountTypeLabel(activeAccount?.model?.profile?.mode, activeAccount?.name);
    const activeAccountId = state.accounts?.activeAccountId || state.currentAccount;
    const orderedAccounts = [...accounts].sort((left, right) => {
      if (left.id === activeAccountId) return -1;
      if (right.id === activeAccountId) return 1;
      return 0;
    });

    root.innerHTML = `
      <div class="account-switcher">
        <div class="account-switcher-header">
          <div>
            <div class="account-switcher-label">Cuentas</div>
            <div class="account-switcher-title">Cuenta activa: ${activeAccount?.name || "Sin cuenta seleccionada"}</div>
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

        <div class="account-cards-grid">
          ${orderedAccounts.map((account) => {
            const isActive = account.id === activeAccountId;
            const isLoading = isBridgeDataPending(account);
            return renderAccountCard(account, isActive, isActive, isLoading);
          }).join("")}
        </div>
      </div>
    `;
  };

  render(store.getState());
  store.subscribe(render);
  console.log("[KMFX][ACCOUNT] ui ready");
}
