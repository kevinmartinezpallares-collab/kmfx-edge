import { closeModal, openModal } from "./modal-system.js?v=build-20260329-201102";
import { formatCurrency } from "./utils.js?v=build-20260329-201102";

function emptyForm() {
  return {
    name: "",
    market: "",
    timeframe: "M15",
    session: "London",
    sl: "",
    tp: "",
    description: "",
    status: "testing",
    score: ""
  };
}

function upsertStrategy(items, strategy) {
  const index = items.findIndex((item) => item.id === strategy.id);
  if (index === -1) return [strategy, ...items];
  const copy = [...items];
  copy[index] = strategy;
  return copy;
}

function safeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function percent(value) {
  return `${safeNumber(value).toFixed(1)}%`;
}

function scoreLabel(score) {
  if (score >= 8.5) return "A+";
  if (score >= 7) return "A";
  if (score >= 5.5) return "B";
  return "C";
}

function normalizeStrategy(item) {
  return {
    ...item,
    sl: item.sl || "",
    tp: item.tp || "",
    description: item.description || item.notes || "",
    notes: item.notes || item.description || ""
  };
}

function buildSetupStats(entries) {
  const setups = new Map();
  entries.forEach((entry) => {
    const key = entry.setup?.trim() || "Sin setup";
    const current = setups.get(key) || { name: key, trades: 0, wins: 0, pnl: 0 };
    current.trades += 1;
    current.pnl += safeNumber(entry.pnl);
    if (safeNumber(entry.pnl) > 0) current.wins += 1;
    setups.set(key, current);
  });

  return [...setups.values()]
    .map((item) => ({
      ...item,
      winRate: item.trades ? (item.wins / item.trades) * 100 : 0
    }))
    .sort((a, b) => b.pnl - a.pnl || b.trades - a.trades);
}

function deriveStrategyStats(strategy, journalEntries) {
  const relatedEntries = journalEntries.filter((entry) => {
    const symbolMatch = (entry.symbol || "").toUpperCase() === (strategy.market || "").toUpperCase();
    const setupMatch = (entry.setup || "").toLowerCase().includes((strategy.name || "").toLowerCase())
      || (strategy.name || "").toLowerCase().includes((entry.setup || "").toLowerCase());
    return symbolMatch || setupMatch;
  });

  const trades = relatedEntries.length;
  const pnl = relatedEntries.reduce((sum, entry) => sum + safeNumber(entry.pnl), 0);
  const wins = relatedEntries.filter((entry) => safeNumber(entry.pnl) > 0).length;
  const winRate = trades ? (wins / trades) * 100 : safeNumber(strategy.winRate);

  return {
    trades,
    pnl,
    winRate,
    rr: safeNumber(strategy.rr),
    score: safeNumber(strategy.score)
  };
}

function renderStrategyEditor({ item, form, store }) {
  openModal({
    title: item ? "Editar estrategia" : "Nueva estrategia",
    subtitle: "Catálogo de setups con parámetros operativos y validación local.",
    content: `
      <form class="modal-form-shell" data-modal-form>
        <div class="form-grid-clean">
          <label class="form-stack"><span>Nombre</span><input type="text" name="name" value="${form.name}"></label>
          <label class="form-stack"><span>Par</span><input type="text" name="market" value="${form.market}"></label>
          <label class="form-stack"><span>TF</span><select name="timeframe">${["M5", "M15", "M30", "H1", "H4"].map((value) => `<option value="${value}" ${form.timeframe === value ? "selected" : ""}>${value}</option>`).join("")}</select></label>
          <label class="form-stack"><span>Sesión</span><select name="session">${["Asia", "London", "New York", "Overlap"].map((value) => `<option value="${value}" ${form.session === value ? "selected" : ""}>${value}</option>`).join("")}</select></label>
          <label class="form-stack"><span>SL</span><input type="text" name="sl" value="${form.sl}"></label>
          <label class="form-stack"><span>TP</span><input type="text" name="tp" value="${form.tp}"></label>
          <label class="form-stack"><span>Estado</span><select name="status">${["testing", "active", "paused", "retired"].map((value) => `<option value="${value}" ${form.status === value ? "selected" : ""}>${value}</option>`).join("")}</select></label>
          <label class="form-stack"><span>Puntuación</span><input type="number" step="0.1" name="score" value="${form.score}"></label>
          <label class="form-stack form-stack-wide"><span>Descripción</span><textarea rows="3" name="description">${form.description}</textarea></label>
        </div>
        <div class="modal-actions">
          <button class="btn-secondary" type="button" data-modal-dismiss="true">Cancelar</button>
          <button class="btn-primary" type="button" data-strategy-modal-save="true">${item ? "Guardar cambios" : "Guardar estrategia"}</button>
        </div>
      </form>
    `,
    onMount(card) {
      card.querySelector("[data-strategy-modal-save='true']")?.addEventListener("click", () => {
        const payload = Object.fromEntries(new FormData(card.querySelector("[data-modal-form]")).entries());
        store.setState((prev) => {
          const next = {
            ...normalizeStrategy(item || {}),
            id: item?.id || `st-${Date.now()}`,
            name: payload.name,
            market: payload.market,
            timeframe: payload.timeframe,
            session: payload.session,
            sl: payload.sl,
            tp: payload.tp,
            description: payload.description,
            notes: payload.description,
            status: payload.status,
            score: safeNumber(payload.score),
            rr: safeNumber(item?.rr),
            winRate: safeNumber(item?.winRate)
          };

          return {
            ...prev,
            workspace: {
              ...prev.workspace,
              strategies: {
                items: upsertStrategy(prev.workspace.strategies.items, next),
                form: emptyForm(),
                editingId: null
              }
            }
          };
        });
        closeModal();
      });
    }
  });
}

export function initStrategies(store) {
  const root = document.getElementById("strategiesRoot");
  if (!root) return;

  function openStrategyEditor(strategyId = null) {
    const state = store.getState();
    const item = strategyId
      ? state.workspace.strategies.items.find((entry) => entry.id === strategyId)
      : null;
    const normalizedItem = item ? normalizeStrategy(item) : null;
    const form = normalizedItem ? {
      name: normalizedItem.name,
      market: normalizedItem.market,
      timeframe: normalizedItem.timeframe,
      session: normalizedItem.session,
      sl: normalizedItem.sl,
      tp: normalizedItem.tp,
      description: normalizedItem.description,
      status: normalizedItem.status,
      score: normalizedItem.score
    } : emptyForm();

    renderStrategyEditor({ item: normalizedItem, form, store });
  }

  root.addEventListener("click", (event) => {
    const button = event.target.closest("[data-strategy-action]");
    if (!button) return;
    const action = button.dataset.strategyAction;
    const strategyId = button.dataset.strategyId;

    if (action === "new") openStrategyEditor();

    if (action === "edit") openStrategyEditor(strategyId);

    if (action === "delete") {
      store.setState((state) => ({
        ...state,
        workspace: {
          ...state.workspace,
          strategies: {
            ...state.workspace.strategies,
            items: state.workspace.strategies.items.filter((item) => item.id !== strategyId),
            editingId: state.workspace.strategies.editingId === strategyId ? null : state.workspace.strategies.editingId
          }
        }
      }));
    }
  });
}

export function renderStrategies(root, state) {
  const items = state.workspace.strategies.items.map(normalizeStrategy);
  const journalEntries = state.workspace.journal.entries || [];
  const setupStats = buildSetupStats(journalEntries);

  root.innerHTML = `
    <div class="strategies-page-stack">
    <div class="tl-page-header">
      <div class="tl-page-title">Estrategias</div>
      <div class="tl-page-sub">Catálogo de setups, rendimiento derivado del diario y edición modular en modal.</div>
      <div class="page-actions">
        <button class="btn-primary" data-strategy-action="new">Nueva estrategia</button>
      </div>
    </div>

    <article class="tl-section-card">
      <div class="tl-section-header">
        <div class="tl-section-title">Stats por Setup</div>
        <div class="pill">${setupStats.length} setups detectados</div>
      </div>
      <div class="detail-metrics-grid">
        ${setupStats.map((item) => `
          <div class="metric-item">
            <div class="metric-label">${item.name}</div>
            <div class="metric-value">${item.trades} trades</div>
            <div class="row-sub">${percent(item.winRate)} WR · <span class="${item.pnl >= 0 ? "metric-positive" : "metric-negative"}">${formatCurrency(item.pnl)}</span></div>
          </div>
        `).join("") || `
          <div class="metric-item">
            <div class="metric-label">Sin setups detectados</div>
            <div class="metric-value">0 trades</div>
            <div class="row-sub">El diario empezará a poblar este bloque cuando existan entradas con setup.</div>
          </div>
        `}
      </div>
    </article>

    <article class="tl-section-card">
      <div class="tl-section-header">
        <div class="tl-section-title">Lista de Estrategias</div>
        <div class="pill">${items.length} estrategias</div>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Par</th>
              <th>TF</th>
              <th>Sesión</th>
              <th>Trades</th>
              <th>WR</th>
              <th>R:R</th>
              <th>P&amp;L</th>
              <th>Score</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            ${items.map((item) => {
              const stats = deriveStrategyStats(item, journalEntries);
              return `
                <tr>
                  <td>
                    <div class="table-primary-cell">
                      <strong>${item.name}</strong>
                      <div class="row-sub">${item.description || "Sin descripción operativa."}</div>
                    </div>
                  </td>
                  <td>${item.market || "—"}</td>
                  <td>${item.timeframe || "—"}</td>
                  <td>${item.session || "—"}</td>
                  <td class="num">${stats.trades}</td>
                  <td class="num">${percent(stats.winRate)}</td>
                  <td class="num">${stats.rr ? stats.rr.toFixed(2) : "—"}</td>
                  <td class="num ${stats.pnl >= 0 ? "metric-positive" : "metric-negative"}">${formatCurrency(stats.pnl)}</td>
                  <td>
                    <div class="score-bar-row">
                      <div class="score-bar-track"><div class="score-bar-fill" style="width:${Math.max(0, Math.min(stats.score * 10, 100))}%"></div></div>
                      <span>${stats.score.toFixed(1)} · ${scoreLabel(stats.score)}</span>
                    </div>
                  </td>
                  <td>
                    <div class="table-actions">
                      <button class="btn-secondary btn-inline" data-strategy-action="edit" data-strategy-id="${item.id}">Editar</button>
                      <button class="btn-secondary btn-inline" data-strategy-action="delete" data-strategy-id="${item.id}">Eliminar</button>
                    </div>
                  </td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
    </article>
    </div>
  `;
}
