import { formatCurrency, selectCurrentModel } from "./utils.js";

export function renderTrades(root, state) {
  const model = selectCurrentModel(state);
  if (!model) {
    root.innerHTML = "";
    return;
  }
  const filters = getTradeFilters(root);
  const symbols = uniqueValues(model.trades, "symbol");
  const sessions = uniqueValues(model.trades, "session");
  const setups = uniqueValues(model.trades, "setup");
  const filteredTrades = model.trades.filter((trade) => {
    const matchesSymbol = filters.symbol === "all" || trade.symbol === filters.symbol;
    const matchesSession = filters.session === "all" || trade.session === filters.session;
    const matchesSetup = filters.setup === "all" || trade.setup === filters.setup;
    const matchesSide = filters.side === "all" || trade.side === filters.side;
    const searchValue = `${trade.symbol} ${trade.setup} ${trade.session} ${trade.side}`.toLowerCase();
    const matchesSearch = !filters.query || searchValue.includes(filters.query);
    return matchesSymbol && matchesSession && matchesSetup && matchesSide && matchesSearch;
  });
  const avgDuration = model.trades.length ? Math.round(model.trades.reduce((sum, trade) => sum + trade.durationMin, 0) / model.trades.length) : 0;
  const bestSetup = aggregateBy(model.trades, "setup")[0];
  const bestSession = aggregateBy(model.trades, "session")[0];
  const filteredPnl = filteredTrades.reduce((sum, trade) => sum + trade.pnl, 0);
  const filteredWinRate = filteredTrades.length ? (filteredTrades.filter((trade) => trade.pnl > 0).length / filteredTrades.length) * 100 : 0;
  const filteredAvgR = filteredTrades.length ? filteredTrades.reduce((sum, trade) => sum + trade.rMultiple, 0) / filteredTrades.length : 0;

  root.innerHTML = `
    <div class="tl-page-header">
      <div class="tl-page-title">Historial de Trades</div>
      <div class="tl-page-sub">Registro completo de ejecución para auditar setups, sesiones y consistencia operativa.</div>
    </div>

    <div class="tl-kpi-row five">
      <article class="tl-kpi-card"><div class="tl-kpi-label">Trades filtrados</div><div class="tl-kpi-val">${filteredTrades.length}</div></article>
      <article class="tl-kpi-card"><div class="tl-kpi-label">Balance</div><div class="tl-kpi-val">${formatCurrency(model.account.balance)}</div></article>
      <article class="tl-kpi-card"><div class="tl-kpi-label">Equity</div><div class="tl-kpi-val">${formatCurrency(model.account.equity)}</div></article>
      <article class="tl-kpi-card"><div class="tl-kpi-label">Duración media</div><div class="tl-kpi-val">${avgDuration}m</div></article>
      <article class="tl-kpi-card"><div class="tl-kpi-label">Open P&L</div><div class="tl-kpi-val ${model.account.openPnl >= 0 ? "green" : "red"}">${formatCurrency(model.account.openPnl)}</div></article>
    </div>

    <div class="grid-2 equal">
      <article class="tl-section-card">
        <div class="tl-section-header"><div class="tl-section-title">Resumen Operativo</div></div>
        <div class="breakdown-list">
          <div class="list-row"><div><div class="row-title">Setup con mejor edge</div><div class="row-sub">Mayor P&L agregado</div></div><div class="row-chip">${bestSetup?.count || 0} trades</div><div class="row-pnl ${bestSetup?.pnl >= 0 ? "metric-positive" : "metric-negative"}">${bestSetup?.key || "—"}</div></div>
          <div class="list-row"><div><div class="row-title">Sesión más rentable</div><div class="row-sub">Mejor distribución de P&L</div></div><div class="row-chip">${bestSession?.count || 0} trades</div><div class="row-pnl ${bestSession?.pnl >= 0 ? "metric-positive" : "metric-negative"}">${bestSession?.key || "—"}</div></div>
          <div class="list-row"><div><div class="row-title">Profit Factor</div><div class="row-sub">Curva de ejecución</div></div><div class="row-chip">Global</div><div class="row-pnl">${model.totals.profitFactor.toFixed(2)}</div></div>
        </div>
      </article>
      <article class="tl-section-card">
        <div class="tl-section-header"><div class="tl-section-title">Top Símbolos</div></div>
        <div class="breakdown-list">
          ${model.symbols.slice(0, 4).map((symbol) => `
            <div class="list-row">
              <div><div class="row-title">${symbol.key}</div><div class="row-sub">${symbol.trades} trades · WR ${symbol.winRate.toFixed(0)}%</div></div>
              <div class="row-chip">${symbol.profitFactor.toFixed(2)} PF</div>
              <div class="row-pnl ${symbol.pnl >= 0 ? "metric-positive" : "metric-negative"}">${formatCurrency(symbol.pnl)}</div>
            </div>
          `).join("")}
        </div>
      </article>
    </div>

    <div class="tl-section-card trades-history-surface">
      <div class="tl-section-header">
        <div class="tl-section-title">Tabla de ejecución</div>
        <div class="trades-table-summary">
          <span>${formatCurrency(filteredPnl)}</span>
          <span>WR ${filteredWinRate.toFixed(0)}%</span>
          <span>${filteredAvgR.toFixed(1)}R medio</span>
        </div>
      </div>
      <div class="trades-toolbar">
        <label class="trades-filter-field">
          <span>Símbolo</span>
          <select data-trades-filter="symbol">
            <option value="all">Todos</option>
            ${symbols.map((symbol) => `<option value="${symbol}" ${filters.symbol === symbol ? "selected" : ""}>${symbol}</option>`).join("")}
          </select>
        </label>
        <label class="trades-filter-field">
          <span>Sesión</span>
          <select data-trades-filter="session">
            <option value="all">Todas</option>
            ${sessions.map((session) => `<option value="${session}" ${filters.session === session ? "selected" : ""}>${session}</option>`).join("")}
          </select>
        </label>
        <label class="trades-filter-field">
          <span>Setup</span>
          <select data-trades-filter="setup">
            <option value="all">Todos</option>
            ${setups.map((setup) => `<option value="${setup}" ${filters.setup === setup ? "selected" : ""}>${setup}</option>`).join("")}
          </select>
        </label>
        <label class="trades-filter-field">
          <span>Dirección</span>
          <select data-trades-filter="side">
            <option value="all">Ambas</option>
            <option value="BUY" ${filters.side === "BUY" ? "selected" : ""}>BUY</option>
            <option value="SELL" ${filters.side === "SELL" ? "selected" : ""}>SELL</option>
          </select>
        </label>
        <label class="trades-filter-field trades-filter-field--search">
          <span>Buscar</span>
          <input type="search" value="${escapeHtml(filters.queryRaw)}" placeholder="Símbolo, setup o sesión" data-trades-filter="query">
        </label>
      </div>
      <div class="table-wrap trades-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Símbolo</th>
              <th>Dir</th>
              <th>Entrada</th>
              <th>Salida</th>
              <th>SL</th>
              <th>TP</th>
              <th>Vol</th>
              <th>P&amp;L $</th>
              <th>R-Multiple</th>
              <th>Duración</th>
              <th>Setup</th>
              <th>Sesión</th>
            </tr>
          </thead>
          <tbody>
            ${filteredTrades.slice().reverse().map((trade) => `
              <tr>
                <td>${trade.when.toLocaleDateString("es-ES")} ${trade.when.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}</td>
                <td>${trade.symbol}</td>
                <td><span class="trade-side trade-side--${trade.side.toLowerCase()}">${trade.side}</span></td>
                <td class="table-num">${trade.entry}</td>
                <td class="table-num">${trade.exit}</td>
                <td class="table-num">${trade.sl}</td>
                <td class="table-num">${trade.tp}</td>
                <td class="table-num">${trade.volume}</td>
                <td class="table-num ${trade.pnl >= 0 ? "metric-positive" : "metric-negative"}">${formatCurrency(trade.pnl)}</td>
                <td class="table-num">${trade.rMultiple.toFixed(1)}R</td>
                <td class="table-num">${trade.durationMin} min</td>
                <td>${trade.setup}</td>
                <td>${trade.session}</td>
              </tr>
            `).join("")}
            ${!filteredTrades.length ? `
              <tr>
                <td colspan="13" class="trades-empty-state">No hay trades que coincidan con los filtros activos.</td>
              </tr>
            ` : ""}
          </tbody>
        </table>
      </div>
    </div>
  `;

  root.querySelectorAll("[data-trades-filter]").forEach((input) => {
    input.addEventListener("input", () => {
      const next = getTradeFilters(root);
      const field = input.dataset.tradesFilter;
      next[field] = field === "query" ? input.value.trim().toLowerCase() : input.value;
      next.queryRaw = field === "query" ? input.value : next.queryRaw;
      root.__tradeFilters = next;
      renderTrades(root, state);
    });
    input.addEventListener("change", () => {
      const next = getTradeFilters(root);
      const field = input.dataset.tradesFilter;
      next[field] = field === "query" ? input.value.trim().toLowerCase() : input.value;
      next.queryRaw = field === "query" ? input.value : next.queryRaw;
      root.__tradeFilters = next;
      renderTrades(root, state);
    });
  });
}

function aggregateBy(trades, field) {
  const map = new Map();
  trades.forEach((trade) => {
    const key = trade[field];
    if (!map.has(key)) map.set(key, { key, pnl: 0, count: 0 });
    const entry = map.get(key);
    entry.pnl += trade.pnl;
    entry.count += 1;
  });
  return [...map.values()].sort((a, b) => b.pnl - a.pnl);
}

function uniqueValues(trades, field) {
  return [...new Set(trades.map((trade) => trade[field]).filter(Boolean))];
}

function getTradeFilters(root) {
  if (!root.__tradeFilters) {
    root.__tradeFilters = {
      symbol: "all",
      session: "all",
      setup: "all",
      side: "all",
      query: "",
      queryRaw: ""
    };
  }
  return root.__tradeFilters;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
