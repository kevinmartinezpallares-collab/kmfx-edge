import { describeAccountAuthority, formatCurrency, formatPercent, renderAuthorityNotice, selectCurrentAccount, selectCurrentModel } from "./utils.js?v=build-20260514-093300";
import { pageHeaderMarkup } from "./ui-primitives.js?v=build-20260514-093300";

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function renderMarket(root, state) {
  const account = selectCurrentAccount(state);
  const model = selectCurrentModel(state);
  if (!model) {
    root.innerHTML = "";
    return;
  }
  const authorityMeta = describeAccountAuthority(account, "workspace");
  console.info("[KMFX][MARKET_AUTHORITY]", {
    account_id: account?.id || "",
    login: account?.login || "",
    broker: account?.broker || "",
    payloadSource: authorityMeta.authority.payloadSource,
    tradeCount: authorityMeta.authority.tradeCount,
    sourceUsed: "workspace_plus_live_context",
  });

  const strongestSymbol = [...model.symbols].sort((a, b) => b.pnl - a.pnl)[0];

  root.innerHTML = `
    ${pageHeaderMarkup({
      title: "Mercado",
      description: "Panel táctico de seguimiento, régimen y catalizadores para la sesión actual.",
      className: "tl-page-header",
      titleClassName: "tl-page-title",
      descriptionClassName: "tl-page-sub",
    })}

    ${renderAuthorityNotice(authorityMeta)}

    <div class="tl-kpi-row five">
      <article class="tl-kpi-card"><div class="tl-kpi-label">Símbolo foco</div><div class="tl-kpi-val">${escapeHtml(strongestSymbol?.key || "—")}</div></article>
      <article class="tl-kpi-card"><div class="tl-kpi-label">Mejor símbolo por PnL</div><div class="tl-kpi-val green">${formatCurrency(strongestSymbol?.pnl || 0)}</div></article>
      <article class="tl-kpi-card"><div class="tl-kpi-label">Seguimiento activo</div><div class="tl-kpi-val">${state.workspace.market.watchlist.length}</div></article>
      <article class="tl-kpi-card"><div class="tl-kpi-label">Eventos vigilados</div><div class="tl-kpi-val">${state.workspace.market.events.length}</div></article>
      <article class="tl-kpi-card"><div class="tl-kpi-label">Sesión dominante</div><div class="tl-kpi-val">${escapeHtml(model.sessions[0]?.key || "—")}</div></article>
    </div>

    <div class="grid-2 equal">
      <article class="tl-section-card">
        <div class="tl-section-header"><div class="tl-section-title">Seguimiento</div></div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Símbolo</th><th>Sesgo</th><th>Régimen</th><th>Cambio</th><th>Volatilidad</th><th>Sesión</th></tr></thead>
            <tbody>
              ${state.workspace.market.watchlist.map((item) => `
                <tr>
                  <td>${escapeHtml(item.symbol)}</td>
                  <td>${escapeHtml(item.bias)}</td>
                  <td>${escapeHtml(item.regime)}</td>
                  <td class="${item.changePct >= 0 ? "metric-positive" : "metric-negative"}">${formatPercent(item.changePct)}</td>
                  <td>${escapeHtml(item.volatility)}</td>
                  <td>${escapeHtml(item.session)}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </article>

      <article class="tl-section-card">
        <div class="tl-section-header"><div class="tl-section-title">Catalizadores</div></div>
        <div class="breakdown-list">
          ${state.workspace.market.events.map((event) => `
            <div class="list-row">
              <div>
                <div class="row-title">${escapeHtml(event.time)} · ${escapeHtml(event.title)}</div>
                <div class="row-sub">${escapeHtml(event.narrative)}</div>
              </div>
              <div class="row-chip">${escapeHtml(event.impact)}</div>
            </div>
          `).join("")}
        </div>
      </article>
    </div>
  `;
}
