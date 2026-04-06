import { openModal } from "./modal-system.js?v=build-20260406-203500";
import { formatCurrency, selectCurrentModel } from "./utils.js?v=build-20260406-203500";

function clampPercent(value) {
  return Math.max(0, Math.min(100, value));
}

function formatTableValue(value) {
  return value == null || value === "" ? "—" : value;
}

function positionRail(position, exposureBase) {
  return `
    <div class="metric-rail">
      <div class="metric-rail-copy">
        <span>${position.symbol} / ${position.side}</span>
        <strong class="${position.pnl >= 0 ? "metric-positive" : "metric-negative"}">${formatCurrency(position.pnl)}</strong>
      </div>
      <div class="metric-rail-track">
        <div class="metric-rail-fill metric-rail-fill--${position.pnl >= 0 ? "green" : "red"}" style="width:${clampPercent((Math.abs(position.pnl) / Math.max(exposureBase, 1)) * 100)}%"></div>
      </div>
      <div class="metric-rail-hint">Vol ${position.volume} / Entrada ${position.entry}</div>
    </div>
  `;
}

function addLongPress(element, callback, delay = 500) {
  let timer = null;

  element.addEventListener("touchstart", (e) => {
    timer = setTimeout(() => {
      callback(e);
      if (navigator.vibrate) navigator.vibrate(20);
    }, delay);
  }, { passive: true });

  element.addEventListener("touchend", () => clearTimeout(timer));
  element.addEventListener("touchmove", () => clearTimeout(timer));
  element.addEventListener("touchcancel", () => clearTimeout(timer));
}

function showTradeContextMenu(trade) {
  if (!trade) return;
  openModal({
    title: `${trade.symbol} · ${trade.side}`,
    subtitle: "Acciones rápidas de la operación",
    maxWidth: 420,
    content: `
      <div class="info-list compact">
        <div><strong>Fecha</strong><span>${trade.when.toLocaleDateString("es-ES")} ${trade.when.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}</span></div>
        <div><strong>Setup</strong><span>${trade.setup}</span></div>
        <div><strong>Sesión</strong><span>${trade.session}</span></div>
        <div><strong>P&L</strong><span class="${trade.pnl >= 0 ? "metric-positive" : "metric-negative"}">${formatCurrency(trade.pnl)}</span></div>
        <div><strong>R-Multiple</strong><span>${trade.rMultiple.toFixed(1)}R</span></div>
      </div>
      <div class="settings-actions">
        <button class="btn-secondary" type="button" data-modal-dismiss="true">Cerrar</button>
      </div>
    `
  });
}

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
  const tradesWithDuration = model.trades.filter((trade) => Number.isFinite(Number(trade.durationMin)));
  const avgDuration = tradesWithDuration.length
    ? Math.round(tradesWithDuration.reduce((sum, trade) => sum + Number(trade.durationMin || 0), 0) / tradesWithDuration.length)
    : null;
  const bestSetup = aggregateBy(model.trades, "setup")[0];
  const bestSession = aggregateBy(model.trades, "session")[0];
  const filteredPnl = filteredTrades.reduce((sum, trade) => sum + trade.pnl, 0);
  const filteredWinRate = filteredTrades.length ? (filteredTrades.filter((trade) => trade.pnl > 0).length / filteredTrades.length) * 100 : 0;
  const filteredAvgR = filteredTrades.length ? filteredTrades.reduce((sum, trade) => sum + trade.rMultiple, 0) / filteredTrades.length : 0;
  const exposureBase = model.positions.reduce((sum, position) => sum + Math.abs(position.pnl || 0), 0) || 1;

  root.innerHTML = `
    <div class="tl-page-header">
      <div class="tl-page-title">Historial de Trades</div>
      <div class="tl-page-sub">Registro completo de ejecución para auditar setups, sesiones y consistencia operativa.</div>
    </div>

    <div class="tl-kpi-row five">
      <article class="tl-kpi-card"><div class="tl-kpi-label">Trades filtrados</div><div class="tl-kpi-val">${filteredTrades.length}</div></article>
      <article class="tl-kpi-card"><div class="tl-kpi-label">PnL filtrado</div><div class="tl-kpi-val ${filteredPnl >= 0 ? "green" : "red"}">${formatCurrency(filteredPnl)}</div></article>
      <article class="tl-kpi-card"><div class="tl-kpi-label">Win Rate</div><div class="tl-kpi-val">${Math.round(filteredWinRate)}%</div></article>
      <article class="tl-kpi-card"><div class="tl-kpi-label">R medio</div><div class="tl-kpi-val">${filteredAvgR.toFixed(1)}R</div></article>
      <article class="tl-kpi-card"><div class="tl-kpi-label">Duración media</div><div class="tl-kpi-val">${avgDuration == null ? "—" : `${avgDuration}m`}</div></article>
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

    <div class="tl-section-card">
      <div class="tl-section-header">
        <div class="tl-section-title">Posiciones abiertas</div>
        <div class="trades-table-summary">
          <span>${model.positions.length} abiertas</span>
          <span>${formatCurrency(model.account.openPnl)}</span>
        </div>
      </div>
      <div class="table-wrap widget-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Par</th>
              <th>Dir</th>
              <th>Vol</th>
              <th>Entrada</th>
              <th>P&amp;L</th>
            </tr>
          </thead>
          <tbody>
            ${model.positions.map((position) => `
              <tr>
                <td><span class="table-symbol">${position.symbol}</span></td>
                <td><span class="row-chip">${position.side}</span></td>
                <td>${position.volume}</td>
                <td>${position.entry}</td>
                <td class="${position.pnl >= 0 ? "metric-positive" : "metric-negative"}">${formatCurrency(position.pnl)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
      <div class="widget-position-rails">
        ${model.positions.map((position) => positionRail(position, exposureBase)).join("")}
      </div>
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
              <tr class="trade-row" data-trade-id="${trade.id}">
                <td>${trade.when.toLocaleDateString("es-ES")} ${trade.when.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}</td>
                <td>${trade.symbol}</td>
                <td><span class="trade-side trade-side--${trade.side.toLowerCase()}">${trade.side}</span></td>
                <td class="table-num">${formatTableValue(trade.entry)}</td>
                <td class="table-num">${formatTableValue(trade.exit)}</td>
                <td class="table-num">${formatTableValue(trade.sl)}</td>
                <td class="table-num">${formatTableValue(trade.tp)}</td>
                <td class="table-num">${formatTableValue(trade.volume)}</td>
                <td class="table-num ${trade.pnl >= 0 ? "metric-positive" : "metric-negative"}">${formatCurrency(trade.pnl)}</td>
                <td class="table-num">${trade.rMultiple.toFixed(1)}R</td>
                <td class="table-num">${trade.durationMin == null ? "—" : `${trade.durationMin} min`}</td>
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

  const tradesById = new Map(filteredTrades.map((trade) => [String(trade.id), trade]));
  root.querySelectorAll(".trade-row").forEach((row) => {
    addLongPress(row, () => {
      showTradeContextMenu(tradesById.get(String(row.dataset.tradeId)));
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
