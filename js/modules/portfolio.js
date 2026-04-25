import { describeAccountAuthority, formatCurrency, formatDateTime, getAccountTypeLabel, renderAuthorityNotice, resolveAccountDisplayIdentity, resolveAccountPnlSummary } from "./utils.js?v=build-20260406-213500";
import { pageHeaderMarkup, pnlTextMarkup } from "./ui-primitives.js?v=build-20260406-213500";

const accountMeshMarkup = () => `
  <div class="account-card-blobs" aria-hidden="true">
    <div class="account-card-blob blob-1"></div>
    <div class="account-card-blob blob-2"></div>
    <div class="account-card-blob blob-3"></div>
    <div class="account-card-blob blob-4"></div>
  </div>
`;

function accountStatusBadge(account) {
  const isConnected = Boolean(account?.connection?.connected);
  return `
    <span class="status-badge">
      <span class="status-dot ${isConnected ? "connected" : ""}"></span>
      ${isConnected ? "Conectada" : "Desconectada"}
    </span>
  `;
}

function renderPortfolioAccountCard(account, isMain) {
  const display = resolveAccountDisplayIdentity(account);
  const pnlSummary = resolveAccountPnlSummary(account);
  const pnl = account?.sourceType === "mt5"
    ? Number(pnlSummary.heroOpenPnl || 0)
    : Number(account?.model?.totals?.pnl || account?.model?.account?.openPnl || 0);
  const trades = Number(account?.model?.totals?.totalTrades || 0);
  const winRate = Number(account?.model?.totals?.winRate || 0);
  const accountTypeLabel = getAccountTypeLabel(account?.model?.profile?.mode, account?.name);
  const meta = isMain ? `${accountTypeLabel} · activa` : accountTypeLabel;
  const cardInlineStyle = "min-height:240px;box-shadow:none;filter:none;";
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

  return `
    <button
      class="account-card account-hero-card portfolio-account-card ${isMain ? "account-hero-card--main" : "account-hero-card--side"}"
      data-portfolio-account-id="${account.id}"
      data-portfolio-card-layout="dashboard"
      data-portfolio-card-variant="uniform"
      type="button"
      style="${cardInlineStyle}"
    >
      ${accountMeshMarkup()}
      <div class="account-hero-card__content">
        <div class="account-hero-card__top" style="${topInlineStyle}">
          <div>
              <div class="account-hero-card__name" style="${nameInlineStyle}">${display.title}</div>
            <div class="account-hero-card__meta" style="${metaInlineStyle}">${meta}</div>
          </div>
          ${accountStatusBadge(account)}
        </div>
        <div class="account-hero-card__equity" style="${equityInlineStyle}">${formatCurrency(account.model.account.equity)}</div>
        <div class="account-hero-card__equity-label" style="${equityLabelInlineStyle}">Equity actual</div>
        <div class="account-hero-card__stats" style="${statsInlineStyle}">
          <div>
            <div class="account-hero-card__stat-label" style="${statLabelInlineStyle}">P&amp;L</div>
            <div class="account-hero-card__stat-val ${pnl >= 0 ? "green" : "metric-negative"}" style="${statValueInlineStyle}">
              ${pnlTextMarkup({
                value: pnl,
                text: formatCurrency(pnl),
                className: pnl >= 0 ? "green" : "metric-negative",
              })}
            </div>
          </div>
          <div>
            <div class="account-hero-card__stat-label" style="${statLabelInlineStyle}">Win Rate</div>
            <div class="account-hero-card__stat-val" style="${statValueInlineStyle}">${winRate.toFixed(1)}%</div>
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

export function renderPortfolio(root, state) {
  const accounts = Object.values(state.accounts);
  if (!accounts.length) {
    root.innerHTML = "";
    return;
  }
  const authorityMeta = describeAccountAuthority(accounts[0], "derived");
  console.info("[KMFX][PORTFOLIO_AUTHORITY]", {
    account_id: accounts[0]?.id || "",
    login: accounts[0]?.login || "",
    broker: accounts[0]?.broker || "",
    payloadSource: authorityMeta.authority.payloadSource,
    tradeCount: authorityMeta.authority.tradeCount,
    sourceUsed: "live_plus_derived_aggregate",
  });

  const activeAccounts = accounts.filter((account) => account.connection.state === "connected" || account.connection.state === "connecting" || account.connection.state === "error");
  const totalBalance = accounts.reduce((sum, account) => sum + (account.model?.account?.balance || 0), 0);
  const totalEquity = accounts.reduce((sum, account) => sum + (account.model?.account?.equity || 0), 0);
  const floatingPnl = accounts.reduce((sum, account) => sum + (account.model?.account?.openPnl || 0), 0);
  const globalPositions = accounts.flatMap((account) => buildPortfolioPositions(account));
  const isMobileViewport = window.innerWidth <= 768;
  const gridInlineStyle = isMobileViewport
    ? "display:grid;grid-template-columns:1fr;gap:10px;"
    : "display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;";

  root.innerHTML = `
    ${pageHeaderMarkup({
      title: "Portfolio",
      description: "Vista global del libro multi-cuenta con balance, equity y exposición abierta consolidada.",
      className: "tl-page-header",
      titleClassName: "tl-page-title",
      descriptionClassName: "tl-page-sub",
    })}

    ${renderAuthorityNotice(authorityMeta)}

    <div class="tl-kpi-row five">
      <article class="tl-kpi-card"><div class="tl-kpi-label">Balance Total</div><div class="tl-kpi-val">${formatCurrency(totalBalance)}</div></article>
      <article class="tl-kpi-card"><div class="tl-kpi-label">Equity Total</div><div class="tl-kpi-val">${formatCurrency(totalEquity)}</div></article>
      <article class="tl-kpi-card"><div class="tl-kpi-label">PnL Flotante</div><div class="tl-kpi-val ${floatingPnl >= 0 ? "green" : "red"}">${formatCurrency(floatingPnl)}</div></article>
      <article class="tl-kpi-card"><div class="tl-kpi-label">Cuentas activas</div><div class="tl-kpi-val">${activeAccounts.length}</div></article>
      <article class="tl-kpi-card"><div class="tl-kpi-label">Posiciones totales</div><div class="tl-kpi-val">${globalPositions.length}</div></article>
    </div>

    <article class="tl-section-card" data-portfolio-render="equal-cards">
      <div class="tl-section-header"><div class="tl-section-title">Detalle por Cuenta</div></div>
      <div class="portfolio-account-grid" data-portfolio-layout="dashboard" style="${gridInlineStyle}">
        ${accounts.map((account) => renderPortfolioAccountCard(account, false)).join("")}
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
                <td class="table-num">
                  ${pnlTextMarkup({
                    value: position.pnl,
                    text: formatCurrency(position.pnl),
                    className: position.pnl >= 0 ? "metric-positive" : "metric-negative",
                  })}
                </td>
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
