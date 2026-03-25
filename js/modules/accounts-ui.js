import { formatCurrency, formatPercent, getAccountTypeLabel, selectCurrentAccount, selectCurrentModel } from "./utils.js";
import { badgeMarkup, getConnectionStatusMeta, getRiskStatusMeta } from "./status-badges.js";

const accountSurfacePages = new Set(["dashboard"]);

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
    const accounts = Object.values(state.accounts);
    const activeAccountLabel = getAccountTypeLabel(activeAccount?.model?.profile?.mode, activeAccount?.name);

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
          ${accounts.map((account) => {
            const isActive = account.id === state.currentAccount;
            const pnl = account.model.totals.pnl;
            const accountTypeLabel = getAccountTypeLabel(account.model.profile.mode, account.name);
            return `
              <button class="account-hero-card ${isActive ? "active" : ""}" data-account-id="${account.id}">
                <div class="account-hero-card__top">
                  <div>
                    <div class="account-hero-card__name">${account.name}</div>
                    <div class="account-hero-card__meta">${accountTypeLabel}</div>
                  </div>
                  ${badgeMarkup(getConnectionStatusMeta(account.connection), "ui-badge--compact")}
                </div>
                <div class="account-hero-card__metrics">
                  <div>
                    <div class="metric-label">Equity</div>
                    <div class="account-hero-card__value">${formatCurrency(account.model.account.equity)}</div>
                  </div>
                  <div>
                    <div class="metric-label">P&L</div>
                    <div class="account-hero-card__value ${pnl >= 0 ? "metric-positive" : "metric-negative"}">${formatCurrency(pnl)}</div>
                  </div>
                  <div>
                    <div class="metric-label">Win rate</div>
                    <div class="account-hero-card__value">${formatPercent(account.model.totals.winRate)}</div>
                  </div>
                </div>
              </button>
            `;
          }).join("")}
        </div>
      </div>
    `;
  };

  render(store.getState());
  store.subscribe(render);
  console.log("[KMFX][ACCOUNT] ui ready");
}
