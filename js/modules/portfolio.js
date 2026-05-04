import { describeAccountAuthority, formatCurrency, formatDateTime, getAccountTypeLabel, resolveAccountDisplayIdentity, resolveAccountPnlSummary } from "./utils.js?v=build-20260504-080918";
import { chartCanvas, lineAreaSpec, mountCharts, updateCharts } from "./chart-system.js?v=build-20260504-080918";
import { pageHeaderMarkup, pnlTextMarkup } from "./ui-primitives.js?v=build-20260504-080918";

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

function renderCapitalKpi({ key, label, valueHtml, meta = "", tone = "neutral" }) {
  return `
    <article class="capital-kpi" data-tone="${tone}" ${key ? `data-capital-kpi="${key}"` : ""}>
      <span class="capital-kpi__label">${label}</span>
      <strong class="capital-kpi__value" data-capital-kpi-value>${valueHtml}</strong>
      ${meta ? `<span class="capital-kpi__meta" data-capital-kpi-meta>${meta}</span>` : ""}
    </article>
  `;
}

function buildCapitalKpis({ totalEquity, totalBalance, floatingPnl, totalPnl, totalTrades, globalPositions, drawdownPct, drawdownValues, drawdownTone }) {
  return [
    {
      key: "equity",
      label: "Equity",
      valueHtml: formatCurrency(totalEquity),
      meta: "Capital con flotante",
      tone: "info",
    },
    {
      key: "balance",
      label: "Balance",
      valueHtml: formatCurrency(totalBalance),
      meta: "Capital cerrado",
      tone: "neutral",
    },
    {
      key: "open-pnl",
      label: "P&L abierto",
      valueHtml: pnlTextMarkup({
        value: floatingPnl,
        text: formatCurrency(floatingPnl),
        tone: capitalToneFromValue(floatingPnl),
        className: floatingPnl > 0 ? "metric-positive" : floatingPnl < 0 ? "metric-negative" : "",
      }),
      meta: `${globalPositions.length} posiciones abiertas`,
      tone: capitalToneFromValue(floatingPnl),
    },
    {
      key: "total-pnl",
      label: "P&L total",
      valueHtml: pnlTextMarkup({
        value: totalPnl,
        text: formatCurrency(totalPnl),
        tone: capitalToneFromValue(totalPnl),
        className: totalPnl > 0 ? "metric-positive" : totalPnl < 0 ? "metric-negative" : "",
      }),
      meta: `${totalTrades} trades registrados`,
      tone: capitalToneFromValue(totalPnl),
    },
    {
      key: "drawdown",
      label: "Drawdown",
      valueHtml: formatCapitalPercent(drawdownPct),
      meta: drawdownValues.length ? "Máx. disponible en cuentas" : "Sin drawdown disponible",
      tone: drawdownTone,
    },
  ];
}

function renderCapitalDataNoticeContent(authorityMeta) {
  const authority = authorityMeta?.authority || {};
  const period = authority.firstTradeLabel
    ? `${authority.firstTradeLabel}${authority.lastTradeLabel ? ` — ${authority.lastTradeLabel}` : ""}`
    : "";
  return `
    <span>Análisis basado en el ledger disponible de la cuenta activa.</span>
    ${period ? `<span><strong>Periodo:</strong> ${period}.</span>` : ""}
  `;
}

function renderCapitalDataNotice(authorityMeta) {
  return `
    <section class="capital-data-note" aria-label="Fuente de datos de Capital" data-capital-data-note>
      ${renderCapitalDataNoticeContent(authorityMeta)}
    </section>
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

function compactCapitalAxisLabel(label) {
  const text = String(label || "");
  if (!text) return "";
  const date = new Date(text);
  if (!Number.isNaN(date.getTime()) && /\d{4}|\d{2}\/\d{2}|\d{2}-\d{2}/.test(text)) {
    return date.toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
  }
  return text.length > 11 ? `${text.slice(0, 10)}…` : text;
}

function formatCapitalAxisPoint(point, index, lastIndex) {
  const dateSource = point?.timestamp || point?.date || point?.time || point?.label || "";
  const parsedDate = dateSource ? new Date(dateSource) : null;
  if (parsedDate && !Number.isNaN(parsedDate.getTime()) && /\d{4}|\d{2}\/\d{2}|\d{2}-\d{2}/.test(String(dateSource))) {
    return parsedDate.toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
  }
  const label = String(point?.label || "");
  const normalized = label.toLowerCase();
  if (normalized.includes("balance")) return "Inicio";
  if (normalized.includes("equity") || normalized.includes("ahora") || normalized.includes("actual")) {
    return index === lastIndex ? "Actual" : "Equity";
  }
  if (/^p\d+$/i.test(label)) {
    if (index === 0) return "Inicio";
    if (index === lastIndex) return "Actual";
  }
  return compactCapitalAxisLabel(label);
}

function buildCapitalAxisOptions(series) {
  const lastIndex = Math.max(series.length - 1, 0);
  const tickValues = lastIndex <= 2
    ? series.map((_, index) => index)
    : [0, Math.round(lastIndex / 2), lastIndex];
  return {
    xScaleType: "linear",
    xScaleOffset: false,
    xValues: series.map((_, index) => index),
    xMin: 0,
    xMax: lastIndex,
    xTickValues: [...new Set(tickValues)],
    xTickValueFormatter: (value) => {
      const index = Math.max(0, Math.min(lastIndex, Math.round(Number(value) || 0)));
      return formatCapitalAxisPoint(series[index], index, lastIndex);
    },
  };
}

function setCapitalHtml(root, selector, html) {
  const node = root.querySelector(selector);
  if (node && node.innerHTML !== html) node.innerHTML = html;
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

  return `
    <article class="capital-evolution-card">
      <div class="capital-section__header">
        <div>
          <div class="capital-section__eyebrow">EVOLUCIÓN</div>
          <h2 class="capital-section__title">Evolución del capital</h2>
          <p class="capital-section__description">Serie de equity disponible para ${display.title || "la cuenta activa"}.</p>
        </div>
        <div class="capital-evolution-card__summary" data-capital-evolution-summary>
          ${renderCapitalEvolutionSummary(series)}
        </div>
      </div>
      <div class="capital-evolution-card__chart">
        ${chartCanvas("capital-evolution-chart", 236, "kmfx-chart-shell--feature capital-evolution-chart")}
      </div>
    </article>
  `;
}

function renderCapitalEvolutionSummary(series) {
  const firstValue = Number(series[0]?.value || 0);
  const lastValue = Number(series.at(-1)?.value || 0);
  const delta = lastValue - firstValue;
  return `
    ${pnlTextMarkup({
      value: delta,
      text: `${delta >= 0 ? "+" : "-"}${formatCurrency(Math.abs(delta))}`,
      tone: capitalToneFromValue(delta),
      className: delta > 0 ? "metric-positive" : delta < 0 ? "metric-negative" : "",
    })}
    <span>${series.length} puntos</span>
  `;
}

function accountCapitalStatus(account) {
  const connection = account?.connection || {};
  const sourceType = String(account?.sourceType || "").toLowerCase();
  const hasSnapshot = Boolean(account?.dashboardPayload && typeof account.dashboardPayload === "object" && Object.keys(account.dashboardPayload).length);
  if (connection.connected || connection.state === "connected") {
    return { label: "Conectada", tone: "connected" };
  }
  if (connection.state === "connecting" || connection.isSyncing) {
    return { label: "Sincronizando", tone: "warning" };
  }
  if (connection.state === "error") {
    return { label: "Conexión parcial", tone: "warning" };
  }
  if (sourceType === "mock") {
    return { label: "Demo", tone: "neutral" };
  }
  if (hasSnapshot) {
    return { label: "Snapshot", tone: "info" };
  }
  return { label: "Desconectada", tone: "muted" };
}

function renderCapitalChip(label, tone = "neutral") {
  if (!label) return "";
  return `<span class="capital-account-card__chip" data-tone="${tone}">${label}</span>`;
}

function accountCardPnlValue(account) {
  const pnlSummary = resolveAccountPnlSummary(account);
  return account?.sourceType === "mt5"
    ? Number(pnlSummary.heroOpenPnl || 0)
    : Number(account?.model?.totals?.pnl || account?.model?.account?.openPnl || 0);
}

function buildCapitalStructureSignature({ accounts, currentAccount, hasChart, viewportKey }) {
  return JSON.stringify({
    viewportKey,
    hasChart,
    currentAccountId: currentAccount?.id || "",
    accountIds: accounts.map((account) => account.id || ""),
  });
}

function buildCapitalLiveSignature({
  accounts,
  authorityMeta,
  totals,
  globalPositions,
  capitalSeries,
}) {
  const theme = document.documentElement.dataset.theme || document.body.dataset.theme || "";
  return JSON.stringify({
    theme,
    period: [
      authorityMeta?.authority?.firstTradeLabel || "",
      authorityMeta?.authority?.lastTradeLabel || "",
    ],
    totals,
    accounts: accounts.map((account) => ({
      id: account.id,
      title: resolveAccountDisplayIdentity(account).title,
      subtitle: resolveAccountDisplayIdentity(account).subtitle,
      status: accountCapitalStatus(account).label,
      equity: Number(account?.model?.account?.equity || 0),
      pnl: accountCardPnlValue(account),
      trades: Number(account?.model?.totals?.totalTrades || 0),
      winRate: Number(account?.model?.totals?.winRate || 0),
    })),
    positions: globalPositions.map((position) => ({
      accountName: position.accountName,
      symbol: position.symbol,
      side: position.side,
      volume: position.volume,
      pnl: Number(position.pnl || 0),
      openedAt: position.openedAt || "",
    })),
    series: capitalSeries.map((point) => ({
      label: point.label,
      value: Number(point.value || 0),
    })),
  });
}

function updateCapitalLiveNodes(root, { kpis, accounts, currentAccount, authorityMeta, globalPositions, capitalSeries, chartSpecs }) {
  setCapitalHtml(root, "[data-capital-data-note]", renderCapitalDataNoticeContent(authorityMeta));
  kpis.forEach((kpi) => {
    const card = root.querySelector(`[data-capital-kpi="${kpi.key}"]`);
    if (!card) return;
    card.dataset.tone = kpi.tone;
    setCapitalHtml(card, "[data-capital-kpi-value]", kpi.valueHtml);
    setCapitalHtml(card, "[data-capital-kpi-meta]", kpi.meta);
  });
  if (capitalSeries.length >= 2) {
    setCapitalHtml(root, "[data-capital-evolution-summary]", renderCapitalEvolutionSummary(capitalSeries));
  }
  setCapitalHtml(
    root,
    "[data-capital-account-grid]",
    accounts.map((account) => renderPortfolioAccountCard(account, account.id === currentAccount.id)).join("")
  );
  setCapitalHtml(root, "[data-capital-exposure-body]", renderCapitalExposureRows(globalPositions));
  updateCharts(root, chartSpecs);
}

function renderPortfolioAccountCard(account, isCurrent) {
  const display = resolveAccountDisplayIdentity(account);
  const status = accountCapitalStatus(account);
  const pnl = accountCardPnlValue(account);
  const trades = Number(account?.model?.totals?.totalTrades || 0);
  const winRate = Number(account?.model?.totals?.winRate || 0);
  const accountTypeLabel = getAccountTypeLabel(account?.model?.profile?.mode, account?.name);
  const subtitle = display.subtitle || [display.broker, display.server].filter(Boolean).join(" · ") || "Cuenta registrada";

  return `
    <button
      class="portfolio-account-card capital-account-card ${isCurrent ? "is-current" : ""}"
      data-portfolio-account-id="${account.id}"
      type="button"
    >
      <div class="capital-account-card__identity">
        <div>
          <strong class="capital-account-card__name">${display.title}</strong>
          <span class="capital-account-card__meta">${subtitle}</span>
        </div>
        <div class="capital-account-card__chips" aria-label="Estado de cuenta">
          ${isCurrent ? renderCapitalChip("Activa", "info") : ""}
          ${renderCapitalChip(accountTypeLabel, "neutral")}
          ${renderCapitalChip(status.label, status.tone)}
        </div>
      </div>
      <div class="capital-account-card__metrics">
        <div class="capital-account-card__metric">
          <span>Equity</span>
          <strong>${formatCurrency(account.model.account.equity)}</strong>
        </div>
        <div class="capital-account-card__metric">
          <span>P&amp;L</span>
          <strong>
            ${pnlTextMarkup({
              value: pnl,
              text: formatCurrency(pnl),
              tone: capitalToneFromValue(pnl),
              className: pnl > 0 ? "metric-positive" : pnl < 0 ? "metric-negative" : "",
            })}
          </strong>
        </div>
        <div class="capital-account-card__metric">
          <span>Acierto</span>
          <strong>${winRate.toFixed(1)}%</strong>
        </div>
        <div class="capital-account-card__metric">
          <span>Operaciones</span>
          <strong>${trades}</strong>
        </div>
      </div>
    </button>
  `;
}

function renderCapitalExposureRows(globalPositions) {
  return globalPositions.length ? globalPositions.map((position) => `
    <tr>
      <td>${position.accountName}</td>
      <td>${position.symbol}</td>
      <td><span class="trade-side trade-side--${position.side.toLowerCase()}">${position.side}</span></td>
      <td class="table-num">${position.volume}</td>
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
      <td colspan="6" class="capital-table-empty">Sin exposición abierta.</td>
    </tr>
  `;
}

export function renderPortfolio(root, state) {
  const accounts = Object.values(state.accounts);
  if (!accounts.length) {
    root.__capitalRendered = false;
    root.__capitalStructureSignature = "";
    root.__capitalLiveSignature = "";
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
  const capitalAxisOptions = capitalSeries.length >= 2 ? buildCapitalAxisOptions(capitalSeries) : {};
  const chartSpecs = capitalSeries.length >= 2
    ? [
        lineAreaSpec("capital-evolution-chart", capitalSeries, {
          tone: "blue",
          showXAxis: true,
          showYAxis: true,
          autoSkipXTicks: false,
          ...capitalAxisOptions,
          maxXTicks: capitalAxisOptions.xTickValues?.length || 3,
          maxYTicks: 4,
          formatter: (value) => formatCurrency(value),
          axisFormatter: (value) => formatCurrency(value),
          fill: true,
          tension: 0.58,
          animationDisabled: true,
          animationDuration: 0,
          layoutPaddingLeft: 12,
          layoutPaddingRight: 18,
        }),
      ]
    : [];
  const isMobileViewport = window.innerWidth <= 768;
  const viewportKey = isMobileViewport ? "mobile" : "desktop";
  const kpis = buildCapitalKpis({
    totalEquity,
    totalBalance,
    floatingPnl,
    totalPnl,
    totalTrades,
    globalPositions,
    drawdownPct,
    drawdownValues,
    drawdownTone,
  });
  const totalsSignature = {
    totalBalance,
    totalEquity,
    floatingPnl,
    totalPnl,
    totalTrades,
    drawdownPct,
  };
  const structureSignature = buildCapitalStructureSignature({
    accounts,
    currentAccount,
    hasChart: capitalSeries.length >= 2,
    viewportKey,
  });
  const liveSignature = buildCapitalLiveSignature({
    accounts,
    authorityMeta,
    totals: totalsSignature,
    globalPositions,
    capitalSeries,
  });
  if (root.__capitalStructureSignature === structureSignature && root.__capitalRendered) {
    if (root.__capitalLiveSignature !== liveSignature) {
      updateCapitalLiveNodes(root, { kpis, accounts, currentAccount, authorityMeta, globalPositions, capitalSeries, chartSpecs });
      root.__capitalLiveSignature = liveSignature;
    }
    return;
  }
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

      ${renderCapitalDataNotice(authorityMeta)}

      <section class="capital-overview" aria-label="Resumen de capital">
        ${kpis.map((kpi) => renderCapitalKpi(kpi)).join("")}
      </section>

      ${renderCapitalEvolution({ account: currentAccount, series: capitalSeries })}

      <section class="capital-cashflow-notice" aria-label="Estado de movimientos de capital">
        Depósitos y retiradas pendientes de modelar.
      </section>

      <article class="capital-section capital-section--accounts" data-portfolio-render="equal-cards">
        <div class="capital-section__header">
          <div>
            <h2 class="capital-section__title">Capital por cuenta</h2>
            <p class="capital-section__description">Composición por cuenta conectada o registrada.</p>
          </div>
          <span class="capital-section__pill">${accounts.length} registradas</span>
        </div>
        <div class="portfolio-account-grid capital-account-grid" data-capital-account-grid data-portfolio-layout="dashboard" style="${gridInlineStyle}">
          ${accounts.map((account) => renderPortfolioAccountCard(account, account.id === currentAccount.id)).join("")}
        </div>
      </article>

      <article class="capital-section capital-section--exposure">
        <div class="capital-section__header">
          <div>
            <h2 class="capital-section__title">Exposición abierta</h2>
            <p class="capital-section__description">Posiciones abiertas que afectan a la equity actual.</p>
          </div>
        </div>
        <div class="capital-exposure-table">
          <table>
            <thead>
              <tr>
                <th>Cuenta</th>
                <th>Símbolo</th>
                <th>Tipo</th>
                <th>Volumen</th>
                <th>P&amp;L</th>
                <th>Apertura</th>
              </tr>
            </thead>
            <tbody data-capital-exposure-body>
              ${renderCapitalExposureRows(globalPositions)}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  `;
  mountCharts(root, chartSpecs);
  root.__capitalRendered = true;
  root.__capitalStructureSignature = structureSignature;
  root.__capitalLiveSignature = liveSignature;
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
