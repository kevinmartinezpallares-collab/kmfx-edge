import { describeAccountAuthority, formatCurrency, formatDateTime, getAccountTypeLabel, renderAuthorityNotice, resolveAccountDisplayIdentity, resolveAccountPnlSummary } from "./utils.js?v=build-20260406-213500";
import { chartCanvas, lineAreaSpec, mountCharts } from "./chart-system.js?v=build-20260406-213500";
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

function formatCapitalPercent(value, digits = 2) {
  const numericValue = Number(value || 0);
  return `${numericValue.toLocaleString("es-ES", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}%`;
}

function capitalToneFromValue(value) {
  const numericValue = Number(value || 0);
  if (numericValue > 0) return "profit";
  if (numericValue < 0) return "loss";
  return "neutral";
}

function renderCapitalKpi({ label, valueHtml, meta = "", tone = "neutral" }) {
  return `
    <article class="capital-kpi" data-tone="${tone}">
      <span class="capital-kpi__label">${label}</span>
      <strong class="capital-kpi__value">${valueHtml}</strong>
      ${meta ? `<span class="capital-kpi__meta">${meta}</span>` : ""}
    </article>
  `;
}

function accountPnlValues(account) {
  const pnlSummary = resolveAccountPnlSummary(account);
  return {
    open: Number(pnlSummary.heroOpenPnl || 0),
    total: Number(pnlSummary.heroTotalPnl || 0),
  };
}

function readAccountDrawdownPct(account) {
  const candidates = [
    account?.model?.totals?.drawdown?.maxPct,
    account?.model?.account?.drawdownPct,
    account?.reportMetrics?.drawdownPct,
    account?.dashboardPayload?.reportMetrics?.drawdownPct,
  ];
  const match = candidates.find((value) => Number.isFinite(Number(value)));
  return match == null ? null : Number(match);
}

function normalizeCapitalSeries(account) {
  const payloadHistory = Array.isArray(account?.dashboardPayload?.history) ? account.dashboardPayload.history : [];
  const modelHistory = Array.isArray(account?.model?.equityCurve) ? account.model.equityCurve : [];
  const source = payloadHistory.length ? payloadHistory : modelHistory;
  return source
    .map((point, index) => {
      const value = Number(point?.value ?? point?.equity ?? point?.balance);
      if (!Number.isFinite(value)) return null;
      return {
        label: point?.label || `P${index + 1}`,
        value,
        timestamp: point?.timestamp || point?.time || point?.date || point?.datetime || point?.when || null,
      };
    })
    .filter(Boolean);
}

function renderCapitalEvolution({ account, series }) {
  const display = resolveAccountDisplayIdentity(account);
  if (!series.length || series.length < 2) {
    return `
      <article class="capital-evolution-card">
        <div class="capital-section__header">
          <div>
            <div class="capital-section__eyebrow">EVOLUCIÓN</div>
            <h2 class="capital-section__title">Evolución del capital</h2>
            <p class="capital-section__description">El historial de capital aparecerá cuando exista serie suficiente.</p>
          </div>
        </div>
        <div class="capital-evolution-empty">
          <strong>Evolución no disponible</strong>
          <span>El historial de capital aparecerá cuando exista serie suficiente.</span>
        </div>
      </article>
    `;
  }

  const firstValue = Number(series[0]?.value || 0);
  const lastValue = Number(series.at(-1)?.value || 0);
  const delta = lastValue - firstValue;
  return `
    <article class="capital-evolution-card">
      <div class="capital-section__header">
        <div>
          <div class="capital-section__eyebrow">EVOLUCIÓN</div>
          <h2 class="capital-section__title">Evolución del capital</h2>
          <p class="capital-section__description">Serie de equity disponible para ${display.title || "la cuenta activa"}.</p>
        </div>
        <div class="capital-evolution-card__summary">
          ${pnlTextMarkup({
            value: delta,
            text: `${delta >= 0 ? "+" : "-"}${formatCurrency(Math.abs(delta))}`,
            tone: capitalToneFromValue(delta),
            className: delta > 0 ? "metric-positive" : delta < 0 ? "metric-negative" : "",
          })}
          <span>${series.length} puntos</span>
        </div>
      </div>
      <div class="capital-evolution-card__chart">
        ${chartCanvas("capital-evolution-chart", 236, "kmfx-chart-shell--feature capital-evolution-chart")}
      </div>
    </article>
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
  const cardInlineStyle = `min-height:${isMain ? "240px" : "188px"};box-shadow:none;filter:none;`;
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
  const currentAccount = accounts.find((account) => account.id === state.currentAccount) || accounts[0];
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
  const accountPnl = accounts.map((account) => accountPnlValues(account));
  const floatingPnl = accountPnl.reduce((sum, item) => sum + item.open, 0);
  const totalPnl = accountPnl.reduce((sum, item) => sum + item.total, 0);
  const totalTrades = accounts.reduce((sum, account) => sum + Number(account.model?.totals?.totalTrades || 0), 0);
  const drawdownValues = accounts
    .map((account) => readAccountDrawdownPct(account))
    .filter((value) => value != null);
  const drawdownPct = drawdownValues.length ? Math.max(...drawdownValues) : 0;
  const drawdownTone = drawdownPct >= 5 ? "risk" : drawdownPct > 0 ? "warning" : "neutral";
  const globalPositions = accounts.flatMap((account) => buildPortfolioPositions(account));
  const capitalSeries = normalizeCapitalSeries(currentAccount);
  const chartSpecs = capitalSeries.length >= 2
    ? [
        lineAreaSpec("capital-evolution-chart", capitalSeries, {
          tone: "blue",
          showXAxis: true,
          showYAxis: true,
          maxYTicks: 4,
          formatter: (value) => formatCurrency(value),
          axisFormatter: (value) => formatCurrency(value),
          fill: true,
          tension: 0.58,
        }),
      ]
    : [];
  const isMobileViewport = window.innerWidth <= 768;
  const gridInlineStyle = isMobileViewport
    ? "display:grid;grid-template-columns:1fr;gap:10px;"
    : "display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;";

  root.innerHTML = `
    <section class="capital-page portfolio-page">
      ${pageHeaderMarkup({
        title: "Capital",
        description: "Evolución del capital, resultado abierto y composición por cuenta.",
        className: "tl-page-header capital-page__header",
        titleClassName: "tl-page-title",
        descriptionClassName: "tl-page-sub",
      })}

      ${renderAuthorityNotice(authorityMeta)}

      <section class="capital-overview" aria-label="Resumen de capital">
        ${renderCapitalKpi({
          label: "Equity",
          valueHtml: formatCurrency(totalEquity),
          meta: "Capital con flotante",
          tone: "info",
        })}
        ${renderCapitalKpi({
          label: "Balance",
          valueHtml: formatCurrency(totalBalance),
          meta: "Capital cerrado",
          tone: "neutral",
        })}
        ${renderCapitalKpi({
          label: "P&L abierto",
          valueHtml: pnlTextMarkup({
            value: floatingPnl,
            text: formatCurrency(floatingPnl),
            tone: capitalToneFromValue(floatingPnl),
            className: floatingPnl > 0 ? "metric-positive" : floatingPnl < 0 ? "metric-negative" : "",
          }),
          meta: `${globalPositions.length} posiciones abiertas`,
          tone: capitalToneFromValue(floatingPnl),
        })}
        ${renderCapitalKpi({
          label: "P&L total",
          valueHtml: pnlTextMarkup({
            value: totalPnl,
            text: formatCurrency(totalPnl),
            tone: capitalToneFromValue(totalPnl),
            className: totalPnl > 0 ? "metric-positive" : totalPnl < 0 ? "metric-negative" : "",
          }),
          meta: `${totalTrades} trades registrados`,
          tone: capitalToneFromValue(totalPnl),
        })}
        ${renderCapitalKpi({
          label: "Drawdown",
          valueHtml: formatCapitalPercent(drawdownPct),
          meta: drawdownValues.length ? "Máx. disponible en cuentas" : "Sin drawdown disponible",
          tone: drawdownTone,
        })}
      </section>

      <section class="capital-cashflow-note" aria-label="Estado de movimientos de capital">
        <strong>Movimientos</strong>
        <span>Depósitos y retiradas pendientes de modelar.</span>
      </section>

      ${renderCapitalEvolution({ account: currentAccount, series: capitalSeries })}

      <article class="tl-section-card capital-section" data-portfolio-render="equal-cards">
        <div class="tl-section-header capital-section__header">
          <div>
            <div class="tl-section-title">Capital por cuenta</div>
            <div class="tl-section-sub">Lectura agregada por cuenta conectada.</div>
          </div>
          <span class="capital-section__pill">${activeAccounts.length} activas</span>
        </div>
        <div class="portfolio-account-grid capital-account-grid" data-portfolio-layout="dashboard" style="${gridInlineStyle}">
          ${accounts.map((account) => renderPortfolioAccountCard(account, false)).join("")}
        </div>
      </article>

      <article class="tl-section-card capital-section">
        <div class="tl-section-header capital-section__header">
          <div>
            <div class="tl-section-title">Exposición abierta</div>
            <div class="tl-section-sub">Posiciones abiertas que afectan a la equity actual.</div>
          </div>
        </div>
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
                <th>SL ref.</th>
                <th>TP ref.</th>
                <th>PnL</th>
                <th>Apertura</th>
              </tr>
            </thead>
            <tbody>
              ${globalPositions.length ? globalPositions.map((position) => `
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
              `).join("") : `
                <tr>
                  <td colspan="10" class="capital-table-empty">Sin exposición abierta.</td>
                </tr>
              `}
            </tbody>
          </table>
        </div>
        <p class="capital-section__footnote">SL/TP se muestran como referencia cuando el snapshot no trae valores explícitos.</p>
      </article>
    </section>
  `;
  mountCharts(root, chartSpecs);
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
