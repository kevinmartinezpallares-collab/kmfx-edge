import { closeModal, openModal } from "./modal-system.js?v=build-20260406-213500";
import { buildApiUrl } from "./api-config.js?v=build-20260406-213500";
import { showToast } from "./toast.js?v=build-20260406-213500";
import { formatCurrency, selectActiveDashboardPayload } from "./utils.js?v=build-20260406-213500";
import { pageHeaderMarkup, pnlTextMarkup } from "./ui-primitives.js?v=build-20260406-213500";
import { buildBacktestVsRealReport, renderBacktestVsRealSection } from "./backtest-real.js?v=build-20260406-213500";

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
  if (score >= 8) return "Alta";
  if (score >= 6) return "Media";
  return "Baja";
}

function sampleLabel(trades) {
  const count = safeNumber(trades);
  if (count >= 30) return "Histórico suficiente";
  if (count >= 12) return "Datos insuficientes";
  if (count > 0) return "Pocas operaciones";
  return "Sin histórico suficiente";
}

function normalizeEvidenceText(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function complianceScore(value) {
  const text = normalizeEvidenceText(value);
  if (!text) return null;
  if (["cumplida", "cumplido", "ok", "si", "yes", "passed", "full"].some((token) => text.includes(token))) return 100;
  if (["parcial", "partial", "mixed", "warning"].some((token) => text.includes(token))) return 65;
  if (["rota", "roto", "incumplida", "incumplido", "no", "failed", "broken"].some((token) => text.includes(token))) return 20;
  return null;
}

function emotionScore(value) {
  const text = normalizeEvidenceText(value);
  if (!text) return null;
  if (["calma", "calm", "tranquilo", "foco"].some((token) => text.includes(token))) return 100;
  if (["confianza", "confidence"].some((token) => text.includes(token))) return 90;
  if (text.includes("neutral")) return 80;
  if (["duda", "hesitation"].some((token) => text.includes(token))) return 65;
  if (["ansiedad", "fomo", "impulso", "frustracion", "tilt", "revenge"].some((token) => text.includes(token))) return 35;
  return null;
}

function hasMistake(value) {
  const text = normalizeEvidenceText(value);
  return Boolean(text && !["no", "none", "n/a", "na", "sin error", "sin errores", "ninguno", "-"].includes(text));
}

function calculateStrategyDiscipline(entries) {
  const sampleSize = entries.length;
  const tradeScores = [];
  let mistakeCount = 0;
  entries.forEach((entry) => {
    const scores = [];
    const compliance = complianceScore(entry.compliance || entry.execution_compliance || entry.rule_compliance);
    if (compliance !== null) scores.push(compliance);
    const emotion = emotionScore(entry.emotion || entry.emotionalState || entry.emotional_state);
    if (emotion !== null) scores.push(emotion);
    const mistake = hasMistake(entry.mistake || entry.error || entry.execution_error);
    if (mistake) {
      mistakeCount += 1;
      if (!scores.length) scores.push(45);
    }
    if (!scores.length) return;
    const base = scores.reduce((sum, value) => sum + value, 0) / scores.length;
    tradeScores.push(Math.max(0, Math.min(100, base - (mistake ? 12 : 0))));
  });
  const taggedSampleSize = tradeScores.length;
  const disciplineScore = taggedSampleSize
    ? tradeScores.reduce((sum, value) => sum + value, 0) / taggedSampleSize
    : null;
  const coveragePct = sampleSize ? (taggedSampleSize / sampleSize) * 100 : 0;
  return {
    sampleSize,
    taggedSampleSize,
    coveragePct,
    disciplineScore,
    mistakeRatePct: taggedSampleSize ? (mistakeCount / taggedSampleSize) * 100 : 0,
    label: disciplineScore === null ? "Disc —" : `Disc ${disciplineScore.toFixed(0)}`
  };
}

function pluralLabel(count, singular, plural) {
  return `${count} ${count === 1 ? singular : plural}`;
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

function strategyStatusLabel(status) {
  switch ((status || "").toLowerCase()) {
    case "active":
      return "Activa";
    case "paused":
      return "Pausada";
    case "retired":
      return "Descartada";
    case "testing":
    default:
      return "Testing";
  }
}

function buildSetupStats(strategies, journalEntries) {
  const setups = new Map();
  strategies.forEach((strategy) => {
    const key = strategy.name?.trim() || "Sin estrategia";
    const stats = deriveStrategyStats(strategy, journalEntries);
    const current = setups.get(key) || { name: key, trades: 0, wins: 0, pnl: 0 };
    current.trades += stats.trades;
    current.pnl += stats.pnl;
    current.wins += Math.round((stats.winRate / 100) * stats.trades);
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
  const discipline = calculateStrategyDiscipline(relatedEntries);
  const baseScore = safeNumber(strategy.score);
  const disciplineScore = discipline.disciplineScore === null ? null : discipline.disciplineScore / 10;
  const combinedScore = disciplineScore === null
    ? baseScore
    : baseScore
      ? ((baseScore * 0.75) + (disciplineScore * 0.25))
      : disciplineScore;

  return {
    trades,
    pnl,
    winRate,
    rr: safeNumber(strategy.rr),
    score: combinedScore,
    baseScore,
    discipline
  };
}

function journalEntryToTrade(entry = {}) {
  return {
    time: entry.date || entry.time || "",
    symbol: entry.symbol || "",
    setup: entry.setup || "",
    strategy_tag: entry.strategy_tag || entry.strategyTag || entry.setup || "",
    type: entry.direction || entry.type || "",
    session: entry.session || "",
    profit: safeNumber(entry.pnl),
    commission: safeNumber(entry.commission),
    swap: safeNumber(entry.swap)
  };
}

function resolveRealTradesForBacktest(state, journalEntries) {
  const payload = selectActiveDashboardPayload(state);
  const liveTrades = Array.isArray(payload.trades) ? payload.trades : [];
  if (liveTrades.length) return liveTrades;
  return journalEntries.map(journalEntryToTrade);
}

async function importBacktestFiles(store, files) {
  const selectedFiles = Array.from(files || []);
  if (!selectedFiles.length) return;
  try {
    const reports = await Promise.all(selectedFiles.map(async (file) => ({
      filename: file.name,
      content: await file.text()
    })));
    const response = await fetch(buildApiUrl("/api/backtests/mt5/import"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reports })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok === false) {
      throw new Error(payload.reason || "import_failed");
    }
    const imported = Array.isArray(payload.backtests) ? payload.backtests : [];
    if (!imported.length) {
      showToast("No se detectaron backtests válidos en los reports MT5.", "warning");
      return;
    }
    store.setState((prev) => ({
      ...prev,
      workspace: {
        ...prev.workspace,
        strategies: {
          ...prev.workspace.strategies,
          backtests: [
            ...imported,
            ...(Array.isArray(prev.workspace.strategies.backtests) ? prev.workspace.strategies.backtests : [])
          ]
        }
      }
    }));
    showToast(`${imported.length} backtest${imported.length === 1 ? "" : "s"} importado${imported.length === 1 ? "" : "s"}.`, "success");
  } catch (error) {
    console.warn("[KMFX][BACKTEST_IMPORT] import failed", error);
    showToast("No se pudo importar el report MT5.", "error");
  }
}

function buildStrategiesSetupSummary(items, setupStats) {
  const totalStrategies = items.length;
  const statusCounts = items.reduce((counts, item) => {
    const status = (item.status || "testing").toLowerCase();
    counts[status] = (counts[status] || 0) + 1;
    return counts;
  }, {});
  const totalTrades = setupStats.reduce((sum, item) => sum + safeNumber(item.trades), 0);
  const totalPnl = setupStats.reduce((sum, item) => sum + safeNumber(item.pnl), 0);
  const pnlText = `${totalPnl > 0 ? "+" : ""}${formatCurrency(totalPnl)}`;

  return [
    { label: "Sistema", value: `${pluralLabel(totalStrategies, "estrategia", "estrategias")} registradas` },
    { label: "Estado", value: `${statusCounts.testing || 0} en testing` },
    { label: "Muestra", value: pluralLabel(totalTrades, "trade asociado", "trades asociados") },
    {
      label: "P&L asociado",
      value: pnlTextMarkup({
        value: totalPnl,
        text: pnlText,
        className: totalPnl >= 0 ? "metric-positive" : "metric-negative"
      }),
      tone: totalPnl > 0 ? "profit" : totalPnl < 0 ? "loss" : "neutral"
    }
  ];
}

function renderStrategiesSetupSummary(summary) {
  return `
    <div class="strategies-summary" aria-label="Resumen de setups">
      ${summary.map((item) => `
        <div class="strategies-summary__item" data-tone="${item.tone || "neutral"}">
          <span class="strategies-summary__label">${item.label}</span>
          <strong class="strategies-summary__value">${item.value}</strong>
        </div>
      `).join("")}
    </div>
  `;
}

function renderStrategyEditor({ item, form, store }) {
  openModal({
    title: item ? "Editar estrategia" : "Nueva estrategia",
    subtitle: "Define el setup, su contexto operativo y el estado actual de validación.",
    content: `
      <div class="strategies-dialog">
        <form class="strategies-dialog__form" data-modal-form>
          <div class="strategies-dialog__grid">
            <label class="strategies-dialog__field">
              <span>Nombre</span>
              <input type="text" name="name" value="${form.name}">
            </label>
            <label class="strategies-dialog__field">
              <span>Par</span>
              <input type="text" name="market" value="${form.market}">
            </label>
            <label class="strategies-dialog__field">
              <span>TF</span>
              <select name="timeframe">${["M5", "M15", "M30", "H1", "H4"].map((value) => `<option value="${value}" ${form.timeframe === value ? "selected" : ""}>${value}</option>`).join("")}</select>
            </label>
            <label class="strategies-dialog__field">
              <span>Sesión</span>
              <select name="session">${["Asia", "London", "New York", "Overlap"].map((value) => `<option value="${value}" ${form.session === value ? "selected" : ""}>${value}</option>`).join("")}</select>
            </label>
            <label class="strategies-dialog__field">
              <span>SL</span>
              <input type="text" name="sl" value="${form.sl}">
            </label>
            <label class="strategies-dialog__field">
              <span>TP</span>
              <input type="text" name="tp" value="${form.tp}">
            </label>
            <label class="strategies-dialog__field">
              <span>Estado</span>
              <select name="status">${[
                ["testing", "Testing"],
                ["active", "Activa"],
                ["paused", "Pausada"],
                ["retired", "Descartada"]
              ].map(([value, label]) => `<option value="${value}" ${form.status === value ? "selected" : ""}>${label}</option>`).join("")}</select>
            </label>
            <label class="strategies-dialog__field">
              <span>Puntuación</span>
              <input type="number" step="0.1" name="score" value="${form.score}">
            </label>
            <label class="strategies-dialog__field strategies-dialog__field--full">
              <span>Descripción</span>
              <textarea rows="4" name="description" placeholder="Qué invalida el setup, cuándo entra y qué contexto necesita.">${form.description}</textarea>
            </label>
          </div>
          <div class="strategies-dialog__footer">
            <button class="btn-secondary" type="button" data-modal-dismiss="true">Cancelar</button>
            <button class="btn-primary" type="button" data-strategy-modal-save="true">${item ? "Guardar cambios" : "Guardar estrategia"}</button>
          </div>
        </form>
      </div>
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

    if (action === "import-backtest") {
      root.querySelector("[data-backtest-import-input]")?.click();
    }

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

  root.addEventListener("change", (event) => {
    const input = event.target.closest("[data-backtest-import-input]");
    if (!input) return;
    importBacktestFiles(store, input.files);
    input.value = "";
  });
}

export function renderStrategies(root, state) {
  const activePage = state.ui.activePage || "strategies";
  const items = state.workspace.strategies.items.map(normalizeStrategy);
  const journalEntries = state.workspace.journal.entries || [];
  const backtests = Array.isArray(state.workspace.strategies.backtests) ? state.workspace.strategies.backtests : [];
  const backtestVsRealReport = buildBacktestVsRealReport({
    backtests,
    realTrades: resolveRealTradesForBacktest(state, journalEntries),
    startingEquity: safeNumber(selectActiveDashboardPayload(state).balance, 100000),
    minRealTrades: 2,
    minBacktestTrades: 30
  });
  const setupStats = buildSetupStats(items, journalEntries);
  const setupSummary = buildStrategiesSetupSummary(items, setupStats);
  const strongestSetup = setupStats[0] || null;
  const weakestSetup = [...setupStats].sort((a, b) => a.pnl - b.pnl || b.trades - a.trades)[0] || null;
  const activeStrategies = items.filter((item) => (item.status || "testing") === "active");
  const testingStrategies = items.filter((item) => (item.status || "testing") === "testing");
  const strategiesTitle = activePage === "strategies-backtest"
    ? "Backtest vs Real"
    : activePage === "strategies-portfolio"
      ? "Portafolios"
      : "Strategy Lab";
  const strategiesDescription = activePage === "strategies-backtest"
    ? "Comparativa entre muestra importada, ejecución real y degradación del edge."
    : activePage === "strategies-portfolio"
      ? "Distribución de setups, concentración de riesgo y prioridades de capital operativo."
      : "Qué setups tienes, cuáles rinden mejor y cuáles necesitan más muestra.";

  const setupStatsMarkup = `
    <article class="tl-section-card strategies-setup-card">
      <div class="tl-section-header">
        <div class="strategies-section-heading">
          <div class="tl-section-title">Stats por Setup</div>
          <div class="row-sub">Muestra y P&amp;L asociados sin validar todavía reglas ni tags.</div>
        </div>
        ${renderStrategiesSetupSummary(setupSummary)}
      </div>
      <div class="strategies-setup-grid">
        ${setupStats.map((item) => `
          <div class="strategies-setup-item">
            <div class="strategies-setup-item__head">
              <div class="strategies-setup-item__name">${item.name}</div>
              <div class="strategies-setup-item__sample">${sampleLabel(item.trades)}</div>
            </div>
            <div class="strategies-setup-item__stats">
              <span class="strategies-setup-item__metric">${item.trades} trades</span>
              <span class="strategies-setup-item__metric">${percent(item.winRate)} WR</span>
              <span class="strategies-setup-item__metric strategies-setup-item__metric--pnl ${item.pnl >= 0 ? "metric-positive" : "metric-negative"}">${pnlTextMarkup({ value: item.pnl, text: formatCurrency(item.pnl), className: item.pnl >= 0 ? "metric-positive" : "metric-negative" })}</span>
            </div>
          </div>
        `).join("") || `
          <div class="strategies-setup-item strategies-setup-item--empty">
            <div class="strategies-setup-item__name">No hay setups registrados</div>
            <div class="row-sub">Añade una estrategia para empezar a comparar muestra, WR y P&amp;L.</div>
          </div>
        `}
      </div>
    </article>
  `;

  const strategiesTableMarkup = `
    <article class="tl-section-card strategies-table-card">
      <div class="tl-section-header">
        <div class="strategies-section-heading">
          <div class="tl-section-title">Lista de Estrategias</div>
          <div class="row-sub">Definición, muestra y estado operativo de cada setup.</div>
        </div>
        <div class="pill">${items.length} estrategias</div>
      </div>
      ${items.length ? `
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
                <tr class="strategies-table-row">
                  <td>
                    <div class="table-primary-cell strategy-primary-cell">
                      <strong>${item.name}</strong>
                      <div class="strategy-primary-cell__meta">
                        <span class="strategy-status-chip strategy-status-chip--${item.status || "testing"}">${strategyStatusLabel(item.status)}</span>
                      </div>
                      <div class="row-sub">${item.description || "Sin descripción operativa."}</div>
                    </div>
                  </td>
                  <td>${item.market || "—"}</td>
                  <td>${item.timeframe || "—"}</td>
                  <td>${item.session || "—"}</td>
                  <td class="num">${stats.trades}</td>
                  <td class="num">${percent(stats.winRate)}</td>
                  <td class="num">${stats.rr ? stats.rr.toFixed(2) : "—"}</td>
                  <td class="num ${stats.pnl >= 0 ? "metric-positive" : "metric-negative"}">${pnlTextMarkup({ value: stats.pnl, text: formatCurrency(stats.pnl), className: stats.pnl >= 0 ? "metric-positive" : "metric-negative" })}</td>
                  <td class="strategies-score-cell">
                    <div class="strategies-score-read">
                      <strong>${stats.score.toFixed(1)}</strong>
                      <div class="strategies-score-read__meta">
                        <span class="strategies-score-read__grade">${scoreLabel(stats.score)}</span>
                        <span class="strategies-score-read__sample">${sampleLabel(stats.trades)}</span>
                        <span class="strategies-score-read__sample">${stats.discipline.label} · ${stats.discipline.coveragePct.toFixed(0)}%</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div class="table-actions strategies-table-actions">
                      <button class="btn-secondary btn-inline strategies-action-btn" data-strategy-action="edit" data-strategy-id="${item.id}">Editar</button>
                      <button class="btn-secondary btn-inline strategies-action-btn strategies-action-btn--danger" data-strategy-action="delete" data-strategy-id="${item.id}">Eliminar</button>
                    </div>
                  </td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
      ` : `
      <div class="strategies-empty-state">
        <div class="strategies-empty-state__title">No hay estrategias registradas</div>
        <div class="strategies-empty-state__copy">Añade un setup para empezar a comparar muestra, score y rendimiento.</div>
        <div class="strategies-empty-state__actions">
          <button class="btn-primary btn-inline" data-strategy-action="new">Nueva estrategia</button>
        </div>
      </div>
      `}
    </article>
  `;

  const strategyPortfolioMarkup = `
    <article class="tl-section-card strategies-setup-card">
      <div class="tl-section-header">
        <div class="strategies-section-heading">
          <div class="tl-section-title">Asignación por setup</div>
          <div class="row-sub">Lectura de concentración: qué merece capital, qué sigue en testing y qué conviene pausar.</div>
        </div>
      </div>
      <div class="strategies-setup-grid">
        <div class="strategies-setup-item">
          <div class="strategies-setup-item__head">
            <div class="strategies-setup-item__name">Setup dominante</div>
            <div class="strategies-setup-item__sample">${strongestSetup ? sampleLabel(strongestSetup.trades) : "Sin muestra"}</div>
          </div>
          <div class="strategies-setup-item__stats">
            <span class="strategies-setup-item__metric">${strongestSetup?.name || "—"}</span>
            <span class="strategies-setup-item__metric">${strongestSetup ? percent(strongestSetup.winRate) : "—"} WR</span>
            <span class="strategies-setup-item__metric ${safeNumber(strongestSetup?.pnl) >= 0 ? "metric-positive" : "metric-negative"}">${strongestSetup ? formatCurrency(strongestSetup.pnl) : "—"}</span>
          </div>
        </div>
        <div class="strategies-setup-item">
          <div class="strategies-setup-item__head">
            <div class="strategies-setup-item__name">Setup a reducir</div>
            <div class="strategies-setup-item__sample">${weakestSetup ? sampleLabel(weakestSetup.trades) : "Sin muestra"}</div>
          </div>
          <div class="strategies-setup-item__stats">
            <span class="strategies-setup-item__metric">${weakestSetup?.name || "—"}</span>
            <span class="strategies-setup-item__metric">${weakestSetup ? percent(weakestSetup.winRate) : "—"} WR</span>
            <span class="strategies-setup-item__metric ${safeNumber(weakestSetup?.pnl) >= 0 ? "metric-positive" : "metric-negative"}">${weakestSetup ? formatCurrency(weakestSetup.pnl) : "—"}</span>
          </div>
        </div>
        <div class="strategies-setup-item">
          <div class="strategies-setup-item__head">
            <div class="strategies-setup-item__name">Estado portfolio</div>
            <div class="strategies-setup-item__sample">${items.length} setups</div>
          </div>
          <div class="strategies-setup-item__stats">
            <span class="strategies-setup-item__metric">${activeStrategies.length} activas</span>
            <span class="strategies-setup-item__metric">${testingStrategies.length} testing</span>
            <span class="strategies-setup-item__metric">${backtests.length} backtests</span>
          </div>
        </div>
      </div>
    </article>
    <article class="tl-section-card strategies-table-card">
      <div class="tl-section-header">
        <div class="strategies-section-heading">
          <div class="tl-section-title">Matriz de asignación</div>
          <div class="row-sub">Score operativo por setup para decidir foco, pausa o acumulación de muestra.</div>
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Setup</th><th>Estado</th><th>Trades</th><th>P&L</th><th>WR</th><th>Lectura</th></tr></thead>
          <tbody>
            ${items.length ? items.map((item) => {
              const stats = deriveStrategyStats(item, journalEntries);
              const decision = stats.trades < 12 ? "Acumular muestra" : stats.pnl < 0 ? "Reducir o pausar" : stats.score >= 7 ? "Candidato a más capital" : "Mantener controlado";
              return `
                <tr>
                  <td><strong>${item.name}</strong></td>
                  <td>${strategyStatusLabel(item.status)}</td>
                  <td class="num">${stats.trades}</td>
                  <td class="num ${stats.pnl >= 0 ? "metric-positive" : "metric-negative"}">${formatCurrency(stats.pnl)}</td>
                  <td class="num">${percent(stats.winRate)}</td>
                  <td>${decision}</td>
                </tr>
              `;
            }).join("") : `<tr><td colspan="6">Sin estrategias registradas todavía.</td></tr>`}
          </tbody>
        </table>
      </div>
    </article>
  `;
  const bodyMarkup = activePage === "strategies-backtest"
    ? renderBacktestVsRealSection(backtestVsRealReport)
    : activePage === "strategies-portfolio"
      ? strategyPortfolioMarkup
      : `${setupStatsMarkup}${strategiesTableMarkup}`;

  root.innerHTML = `
    <section class="strategies-screen strategies-page-stack">
    ${pageHeaderMarkup({
      eyebrow: "Estrategias",
      title: strategiesTitle,
      description: strategiesDescription,
      className: "calendar-screen__header strategies-screen__header",
      contentClassName: "calendar-screen__copy",
      eyebrowClassName: "calendar-screen__eyebrow",
      titleClassName: "calendar-screen__title",
      descriptionClassName: "calendar-screen__subtitle",
      actionsClassName: "strategies-screen__actions",
      actionsHtml: `<button class="btn-primary btn-inline" data-strategy-action="new">Nueva estrategia</button>`,
    })}
    ${bodyMarkup}
    </section>
  `;
}
