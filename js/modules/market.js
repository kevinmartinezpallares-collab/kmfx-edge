import { formatCurrency, formatPercent, selectCurrentModel } from "./utils.js";

export function renderMarket(root, state) {
  const model = selectCurrentModel(state);
  if (!model) {
    root.innerHTML = "";
    return;
  }

  const strongestSymbol = [...model.symbols].sort((a, b) => b.pnl - a.pnl)[0];

  root.innerHTML = `
    <div class="tl-page-header">
      <div class="tl-page-title">Market</div>
      <div class="tl-page-sub">Panel táctico de watchlist, régimen y catalizadores para la sesión actual.</div>
    </div>

    <div class="tl-kpi-row five">
      <article class="tl-kpi-card"><div class="tl-kpi-label">Focus symbol</div><div class="tl-kpi-val">${strongestSymbol?.key || "—"}</div></article>
      <article class="tl-kpi-card"><div class="tl-kpi-label">Best PnL symbol</div><div class="tl-kpi-val green">${formatCurrency(strongestSymbol?.pnl || 0)}</div></article>
      <article class="tl-kpi-card"><div class="tl-kpi-label">Active watchlist</div><div class="tl-kpi-val">${state.workspace.market.watchlist.length}</div></article>
      <article class="tl-kpi-card"><div class="tl-kpi-label">Event risk</div><div class="tl-kpi-val">${state.workspace.market.events.length}</div></article>
      <article class="tl-kpi-card"><div class="tl-kpi-label">Session bias</div><div class="tl-kpi-val">${model.sessions[0]?.key || "—"}</div></article>
    </div>

    <div class="grid-2 equal">
      <article class="tl-section-card">
        <div class="tl-section-header"><div class="tl-section-title">Watchlist</div></div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Symbol</th><th>Bias</th><th>Regime</th><th>Change</th><th>Volatility</th><th>Session</th></tr></thead>
            <tbody>
              ${state.workspace.market.watchlist.map((item) => `
                <tr>
                  <td>${item.symbol}</td>
                  <td>${item.bias}</td>
                  <td>${item.regime}</td>
                  <td class="${item.changePct >= 0 ? "metric-positive" : "metric-negative"}">${formatPercent(item.changePct)}</td>
                  <td>${item.volatility}</td>
                  <td>${item.session}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </article>

      <article class="tl-section-card">
        <div class="tl-section-header"><div class="tl-section-title">Catalysts</div></div>
        <div class="breakdown-list">
          ${state.workspace.market.events.map((event) => `
            <div class="list-row">
              <div>
                <div class="row-title">${event.time} · ${event.title}</div>
                <div class="row-sub">${event.narrative}</div>
              </div>
              <div class="row-chip">${event.impact}</div>
            </div>
          `).join("")}
        </div>
      </article>
    </div>
  `;
}
