import { formatCurrency, formatDateTime, getAccountTypeLabel } from "./utils.js";
import { badgeMarkup, getConnectionStatusMeta } from "./status-badges.js";

const accountMeshMarkup = () => `
  <div class="account-card-blobs" aria-hidden="true">
    <div class="account-card-blob blob-1"></div>
    <div class="account-card-blob blob-2"></div>
    <div class="account-card-blob blob-3"></div>
    <div class="account-card-blob blob-4"></div>
  </div>
`;

export function renderPortfolio(root, state) {
  const accounts = Object.values(state.accounts);
  if (!accounts.length) {
    root.innerHTML = "";
    return;
  }

  const activeAccounts = accounts.filter((account) => account.connection.state === "connected" || account.connection.state === "connecting" || account.connection.state === "error");
  const totalBalance = accounts.reduce((sum, account) => sum + (account.model?.account?.balance || 0), 0);
  const totalEquity = accounts.reduce((sum, account) => sum + (account.model?.account?.equity || 0), 0);
  const floatingPnl = accounts.reduce((sum, account) => sum + (account.model?.account?.openPnl || 0), 0);
  const globalPositions = accounts.flatMap((account) => buildPortfolioPositions(account));

  root.innerHTML = `
    <div class="tl-page-header">
      <div class="tl-page-title">Portfolio</div>
      <div class="tl-page-sub">Vista global del libro multi-cuenta con balance, equity y exposición abierta consolidada.</div>
    </div>

    <div class="tl-kpi-row five">
      <article class="tl-kpi-card"><div class="tl-kpi-label">Balance Total</div><div class="tl-kpi-val">${formatCurrency(totalBalance)}</div></article>
      <article class="tl-kpi-card"><div class="tl-kpi-label">Equity Total</div><div class="tl-kpi-val">${formatCurrency(totalEquity)}</div></article>
      <article class="tl-kpi-card"><div class="tl-kpi-label">PnL Flotante</div><div class="tl-kpi-val ${floatingPnl >= 0 ? "green" : "red"}">${formatCurrency(floatingPnl)}</div></article>
      <article class="tl-kpi-card"><div class="tl-kpi-label">Cuentas activas</div><div class="tl-kpi-val">${activeAccounts.length}</div></article>
      <article class="tl-kpi-card"><div class="tl-kpi-label">Posiciones totales</div><div class="tl-kpi-val">${globalPositions.length}</div></article>
    </div>

    <article class="tl-section-card">
      <div class="tl-section-header"><div class="tl-section-title">Detalle por Cuenta</div></div>
      <div class="portfolio-account-grid">
        ${accounts.map((account) => {
          const model = account.model;
          const status = getConnectionStatusMeta(account.connection);
          const accountTypeLabel = getAccountTypeLabel(model.profile?.mode, account.name);
          return `
            <article class="account-card account-hero-card portfolio-account-card ${account.id === state.currentAccount ? "active" : ""}">
              ${accountMeshMarkup()}
              <div class="account-hero-card__top">
                <div>
                  <div class="account-hero-card__name">${account.name}</div>
                  <div class="account-hero-card__meta">${accountTypeLabel}</div>
                </div>
                ${badgeMarkup(status, "ui-badge--compact")}
              </div>
              <div class="account-hero-card__metrics">
                <div>
                  <div class="tl-kpi-label">Balance</div>
                  <div class="account-hero-card__value">${formatCurrency(model.account.balance)}</div>
                </div>
                <div>
                  <div class="tl-kpi-label">Equity</div>
                  <div class="account-hero-card__value">${formatCurrency(model.account.equity)}</div>
                </div>
                <div>
                  <div class="tl-kpi-label">P&L</div>
                  <div class="account-hero-card__value ${model.account.openPnl >= 0 ? "metric-positive" : "metric-negative"}">${formatCurrency(model.account.openPnl)}</div>
                </div>
              </div>
            </article>
          `;
        }).join("")}
      </div>
    </article>

    <article class="tl-section-card">
      <div class="tl-section-header"><div class="tl-section-title">Posiciones abiertas globales</div></div>
      <div class="table-wrap portfolio-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Cuenta</th>
              <th>Símbolo</th>
              <th>Tipo</th>
              <th>Vol</th>
              <th>Entrada</th>
              <th>Actual</th>
              <th>SL</th>
              <th>TP</th>
              <th>PnL</th>
              <th>Apertura</th>
            </tr>
          </thead>
          <tbody>
            ${globalPositions.map((position) => `
              <tr>
                <td>${position.accountName}</td>
                <td>${position.symbol}</td>
                <td><span class="trade-side trade-side--${position.side.toLowerCase()}">${position.side}</span></td>
                <td class="table-num">${position.volume}</td>
                <td class="table-num">${position.entry}</td>
                <td class="table-num">${position.current}</td>
                <td class="table-num">${position.sl}</td>
                <td class="table-num">${position.tp}</td>
                <td class="table-num ${position.pnl >= 0 ? "metric-positive" : "metric-negative"}">${formatCurrency(position.pnl)}</td>
                <td>${formatDateTime(position.openedAt)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </article>
  `;
}

function buildPortfolioPositions(account) {
  const model = account.model;
  const recentTrade = [...(model.trades || [])].reverse();
  return (model.positions || []).map((position, index) => {
    const relatedTrade = recentTrade.find((trade) => trade.symbol === position.symbol && trade.side === position.side) || recentTrade[index] || null;
    const entry = Number(position.entry);
    const current = Number(position.current);
    const step = entry > 1000 ? Math.max(entry * 0.004, 8) : entry > 100 ? Math.max(entry * 0.003, 0.6) : Math.max(entry * 0.003, 0.0012);
    const sl = position.sl ?? roundPortfolioPrice(position.side === "BUY" ? entry - step : entry + step);
    const tp = position.tp ?? roundPortfolioPrice(position.side === "BUY" ? entry + step * 1.8 : entry - step * 1.8);
    return {
      ...position,
      accountName: account.name,
      sl,
      tp,
      openedAt: relatedTrade?.when || account.connection.lastSync || null,
      current
    };
  });
}

function roundPortfolioPrice(value) {
  if (Math.abs(value) > 1000) return Number(value.toFixed(1));
  if (Math.abs(value) > 100) return Number(value.toFixed(2));
  return Number(value.toFixed(4));
}
