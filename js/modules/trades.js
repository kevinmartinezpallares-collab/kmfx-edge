import { openFocusPanel } from "./modal-system.js?v=build-20260406-213500";
import { formatCurrency, formatDurationHuman, resolveAccountDataAuthority, selectCurrentAccount, selectCurrentModel } from "./utils.js?v=build-20260406-213500";
import { pageHeaderMarkup, pnlTextMarkup } from "./ui-primitives.js?v=build-20260406-213500";

function formatTableValue(value) {
  return value == null || value === "" ? "—" : value;
}

function normalizeTradeSetup(value) {
  const text = String(value || "").trim();
  if (!text) return "—";
  if (/mt5\s*sync/i.test(text)) return "—";
  return text;
}

function displayTradeSetup(value, fallback = "Sin setup definido") {
  const normalized = normalizeTradeSetup(value);
  return normalized === "—" ? fallback : normalized;
}

const TRADE_TAG_STORAGE_KEY = "kmfx_tags";
const TRADE_RULE_FIELDS = [
  { key: "londonConfirmation", label: "Confirmación London" },
  { key: "obEntry", label: "Entrada en OB" },
  { key: "validSetup", label: "Setup válido" },
  { key: "allowedPairs", label: "Par permitido" }
];

function loadTradeTagMap() {
  try {
    const saved = window.localStorage?.getItem(TRADE_TAG_STORAGE_KEY);
    const parsed = saved ? JSON.parse(saved) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (error) {
    console.warn("[KMFX][TRADES_TAGS] tags unavailable", error);
    return {};
  }
}

function tradeTagCandidateIds(trade = {}) {
  return [
    trade.id,
    trade.ticket,
    trade.ticketId,
    trade.order,
    trade.orderId,
    trade.positionId,
    trade.dealId
  ]
    .filter((value) => value != null && value !== "")
    .map((value) => String(value));
}

function getTradeTag(trade = {}, tagMap = {}) {
  const ids = tradeTagCandidateIds(trade);
  return ids.reduce((match, id) => match || tagMap[id] || null, null);
}

function isExplicitFalse(value) {
  return value === false || String(value).toLowerCase() === "false";
}

function evaluateTradeTagState(trade = {}, tag = null) {
  if (!tag) return { state: "untagged", failedRules: [] };
  if (tag.tagSkipped === true || tag.tagPartial === true) return { state: "pending", failedRules: [] };

  const failedRules = TRADE_RULE_FIELDS
    .filter((rule) => isExplicitFalse(tag[rule.key]))
    .map((rule) => rule.label);

  return {
    state: failedRules.length ? "invalid" : "valid",
    failedRules
  };
}

function groupWorstByPnl(trades = [], field) {
  const groups = new Map();
  trades.forEach((trade) => {
    const rawKey = field === "setup" ? normalizeTradeSetup(trade.setup) : trade[field];
    if (!rawKey || rawKey === "—") return;
    const key = String(rawKey);
    const entry = groups.get(key) || { key, pnl: 0, trades: 0 };
    entry.pnl += Number(trade.pnl || 0);
    entry.trades += 1;
    groups.set(key, entry);
  });
  return [...groups.values()].sort((a, b) => a.pnl - b.pnl)[0] || null;
}

function formatSignedCurrency(value) {
  const amount = Number(value) || 0;
  const formatted = formatCurrency(amount);
  return amount > 0 ? `+${formatted}` : formatted;
}

function buildTradeTruthSummary(trades = []) {
  const totalTrades = trades.length;
  const tagMap = loadTradeTagMap();
  const evaluations = trades.map((trade) => ({
    trade,
    tag: getTradeTag(trade, tagMap)
  })).map((item) => ({
    ...item,
    tagState: evaluateTradeTagState(item.trade, item.tag)
  }));

  const completedTags = evaluations.filter((item) => item.tagState.state === "valid" || item.tagState.state === "invalid").length;
  const pendingTags = evaluations.filter((item) => item.tagState.state === "pending").length;
  const untaggedTrades = evaluations.filter((item) => item.tagState.state === "untagged").length;
  const validTaggedTrades = evaluations.filter((item) => item.tagState.state === "valid").length;
  const invalidTaggedTrades = evaluations.filter((item) => item.tagState.state === "invalid").length;
  const pendingOrMissing = pendingTags + untaggedTrades;
  const taggingCoverage = totalTrades ? completedTags / totalTrades : 0;
  const pnl = trades.reduce((sum, trade) => sum + Number(trade.pnl || 0), 0);
  const rValues = trades.map((trade) => Number(trade.rMultiple)).filter(Number.isFinite);
  const avgR = rValues.length ? rValues.reduce((sum, value) => sum + value, 0) / rValues.length : null;
  const failedRuleCounts = new Map();

  evaluations.forEach((item) => {
    item.tagState.failedRules.forEach((label) => {
      failedRuleCounts.set(label, (failedRuleCounts.get(label) || 0) + 1);
    });
  });

  const dominantFailedRule = [...failedRuleCounts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)[0] || null;
  const worstSession = groupWorstByPnl(trades, "session");
  const worstSetup = groupWorstByPnl(trades, "setup");

  let state = "insufficient";
  let stateLabel = "Sin muestra suficiente";
  let stateCopy = "Necesitas trades etiquetados para leer validez operativa.";
  let tone = "neutral";

  if (!totalTrades) {
    stateLabel = "Sin operaciones filtradas";
    stateCopy = "No hay muestra activa para interpretar.";
  } else if (!completedTags) {
    state = "pending";
    stateLabel = "Causa pendiente de tagging";
    stateCopy = "Completa los tags post-trade para conectar resultado con reglas.";
    tone = "warning";
  } else if (taggingCoverage < 0.5) {
    state = "pending";
    stateLabel = "Revisión pendiente";
    stateCopy = `${pendingOrMissing} trades necesitan tagging antes de sacar conclusiones.`;
    tone = "warning";
  } else if (taggingCoverage >= 0.5 && invalidTaggedTrades > 0 && dominantFailedRule) {
    state = "invalid";
    stateLabel = "Daño por reglas";
    stateCopy = `${invalidTaggedTrades} trades etiquetados tienen reglas manuales incumplidas.`;
    tone = "loss";
  } else if (invalidTaggedTrades > 0) {
    state = "review";
    stateLabel = "Revisión necesaria";
    stateCopy = "Hay incumplimientos aislados dentro de la muestra filtrada.";
    tone = "warning";
  } else {
    state = "valid";
    stateLabel = "Operativa válida";
    stateCopy = completedTags
      ? "Los trades etiquetados no muestran fallos explícitos de reglas."
      : "La muestra existe, pero aún no tiene tags completos.";
    tone = completedTags ? "profit" : "neutral";
  }

  const cause = !totalTrades
    ? {
        label: "No hay muestra para interpretar",
        copy: "Ajusta filtros o sincroniza operaciones."
      }
    : !completedTags
      ? {
          label: "Sin evidencia manual suficiente",
          copy: "Ningún trade filtrado tiene tagging completo."
        }
      : taggingCoverage < 0.5
        ? {
            label: "Causa pendiente de tagging",
            copy: `Solo ${completedTags} de ${totalTrades} trades tienen evidencia completa.`
          }
        : dominantFailedRule
    ? {
        label: `Principal causa: ${dominantFailedRule.label}`,
        copy: `Falló en ${dominantFailedRule.count} ${dominantFailedRule.count === 1 ? "trade" : "trades"} etiquetados.`
      }
    : pendingOrMissing > completedTags
      ? {
          label: "Causa pendiente",
          copy: `${pendingOrMissing} trades sin tagging completo.`
        }
      : worstSession && worstSession.pnl < 0
        ? {
            label: `Mayor presión: ${worstSession.key}`,
            copy: `${worstSession.trades} trades acumulan ${formatCurrency(worstSession.pnl)}.`
          }
        : worstSetup && worstSetup.pnl < 0
          ? {
              label: `Setup bajo presión: ${worstSetup.key}`,
              copy: `${worstSetup.trades} trades acumulan ${formatCurrency(worstSetup.pnl)}.`
            }
          : {
              label: "No hay causa dominante todavía",
              copy: "La muestra no concentra un fallo claro."
            };

  const action = !totalTrades
    ? "Selecciona una muestra con trades cerrados."
    : !completedTags
      ? "Completa los tags post-trade para conectar resultado con reglas."
      : taggingCoverage < 0.5
        ? `Completa ${pendingOrMissing} ${pendingOrMissing === 1 ? "tag pendiente" : "tags pendientes"} antes de sacar conclusiones.`
    : pendingOrMissing > 0 && pendingOrMissing >= completedTags
      ? `Completa ${pendingOrMissing} ${pendingOrMissing === 1 ? "tag pendiente" : "tags pendientes"} antes de sacar conclusiones.`
      : dominantFailedRule
        ? `Revisa los trades donde falló ${dominantFailedRule.label}.`
        : worstSession && worstSession.pnl < 0
          ? `Prioriza revisar la sesión ${worstSession.key} antes de ajustar el plan.`
          : "Mantén la muestra y sigue registrando reglas.";

  return {
    state,
    stateLabel,
    stateCopy,
    tone,
    cause,
    action,
    totalTrades,
    completedTags,
    pendingTags,
    untaggedTrades,
    pendingOrMissing,
    taggingCoverage,
    validTaggedTrades,
    invalidTaggedTrades,
    pnl,
    avgR
  };
}

function renderTruthMetric(label, value, options = {}) {
  return `
    <div class="trades-truth-compact__evidence-row">
      <dt>${escapeHtml(label)}</dt>
      <dd>${options.html ? value : escapeHtml(value)}</dd>
    </div>
  `;
}

function truthToneForSummary(tone) {
  if (tone === "profit") return "success";
  if (tone === "loss") return "danger";
  if (tone === "warning") return "warning";
  return "neutral";
}

function actionToneForSummary(summary) {
  if (summary.tone === "loss") return "danger";
  if (summary.tone === "warning" || summary.state === "pending") return "warning";
  if (summary.tone === "profit" || summary.state === "valid") return "info";
  return "neutral";
}

function renderTradeTruthSummary(summary) {
  const avgRLabel = Number.isFinite(Number(summary.avgR)) ? `${summary.avgR.toFixed(1)}R` : "—";
  const situationTone = truthToneForSummary(summary.tone);
  const nextStepTone = actionToneForSummary(summary);
  return `
    <section class="trades-truth-compact" aria-label="Lectura operativa">
      <header class="trades-truth-compact__header">
        <p class="trades-truth-compact__eyebrow">LECTURA OPERATIVA</p>
        <h2 class="trades-truth-compact__title">Centro de verdad operativo</h2>
        <p class="trades-truth-compact__description">Resultado, reglas y tags resumidos sobre la muestra filtrada.</p>
      </header>
      <div class="trades-truth-compact__grid">
        <article class="trades-truth-compact__cell trades-truth-cell" data-role="situacion" data-tone="${escapeHtml(situationTone)}">
          <span class="trades-truth-compact__label">SITUACIÓN</span>
          <strong class="trades-truth-compact__cell-title">${escapeHtml(summary.stateLabel)}</strong>
          <p>${escapeHtml(summary.stateCopy)}</p>
        </article>
        <article class="trades-truth-compact__cell trades-truth-cell" data-role="motivo" data-tone="neutral">
          <span class="trades-truth-compact__label">MOTIVO</span>
          <strong class="trades-truth-compact__cell-title">${escapeHtml(summary.cause.label)}</strong>
          <p>${escapeHtml(summary.cause.copy)}</p>
        </article>
        <article class="trades-truth-compact__cell trades-truth-cell" data-role="datos" data-tone="neutral">
          <span class="trades-truth-compact__label">DATOS CLAVE</span>
          <dl class="trades-truth-compact__evidence">
            ${renderTruthMetric("Trades filtrados", String(summary.totalTrades))}
            ${renderTruthMetric("Tags completos", String(summary.completedTags))}
            ${renderTruthMetric("Pendientes", String(summary.pendingOrMissing))}
            ${renderTruthMetric("Válidos / inválidos", `${summary.validTaggedTrades}/${summary.invalidTaggedTrades}`)}
            ${renderTruthMetric("P&L filtrado", pnlTextMarkup({ value: summary.pnl, text: formatSignedCurrency(summary.pnl) }), { html: true })}
            ${renderTruthMetric("R medio", avgRLabel)}
          </dl>
        </article>
        <article class="trades-truth-compact__cell trades-truth-cell" data-role="siguiente-paso" data-tone="${escapeHtml(nextStepTone)}">
          <span class="trades-truth-compact__label">SIGUIENTE PASO</span>
          <strong class="trades-truth-compact__cell-title">${escapeHtml(summary.action)}</strong>
          <p>Acción de proceso basada solo en la muestra filtrada.</p>
        </article>
      </div>
    </section>
  `;
}

function buildTradeExecutiveRead(trade) {
  const executions = Array.isArray(trade?.executions) ? trade.executions : [];
  const bestExecution = executions.reduce((top, execution) => {
    if (!top) return execution;
    return Math.abs(Number(execution?.pnl || 0)) > Math.abs(Number(top?.pnl || 0)) ? execution : top;
  }, null);

  if (executions.length > 1 && bestExecution) {
    return `${trade.side} ${trade.symbol} cerrada en ${executions.length} ejecuciones durante ${formatDurationHuman(trade.durationMin)}. El mayor parcial aportó ${formatCurrency(bestExecution.pnl)}.`;
  }

  return `${trade.side} ${trade.symbol} cerrada en ${formatDurationHuman(trade.durationMin)} con resultado final de ${formatCurrency(trade.pnl)}.`;
}

function renderTradeExecutions(trade) {
  const executions = Array.isArray(trade?.executions) ? trade.executions : [];
  if (!executions.length) return "";
  return `
    <section class="focus-panel-section">
      <div class="focus-panel-section__head">
        <div class="focus-panel-section__title">${executions.length > 1 ? "Parciales y ejecuciones" : "Ejecución"}</div>
      </div>
      <div class="focus-panel-executions">
        <div class="focus-panel-executions__head">
          <span>Hora</span>
          <span>Vol.</span>
          <span>Salida</span>
          <span>P&amp;L parcial</span>
          <span>Acumulado</span>
        </div>
        ${executions.map((execution) => `
          <div class="focus-panel-execution">
            <span>${execution.when.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}</span>
            <span>${formatTableValue(execution.volume)}</span>
            <span>${formatTableValue(execution.exit)}</span>
            ${pnlTextMarkup({ value: execution.pnl, text: formatCurrency(execution.pnl), className: execution.pnl >= 0 ? "metric-positive" : "metric-negative" })}
            ${pnlTextMarkup({ value: execution.cumulativePnl, text: formatCurrency(execution.cumulativePnl), className: execution.cumulativePnl >= 0 ? "metric-positive" : "metric-negative" })}
          </div>
        `).join("")}
      </div>
    </section>
  `;
}

function positionRail(position) {
  return `
    <div class="open-position-summary">
      <div class="open-position-summary__copy">
        <div class="open-position-summary__title">${position.symbol} · ${position.side}</div>
        <div class="open-position-summary__meta">Vol ${formatTableValue(position.volume)} · Entrada ${formatTableValue(position.entry)}</div>
      </div>
      ${pnlTextMarkup({ value: position.pnl, text: formatCurrency(position.pnl), className: `open-position-summary__pnl ${position.pnl >= 0 ? "metric-positive" : "metric-negative"}` })}
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
  openFocusPanel({
    title: trade.symbol,
    status: trade.side,
    statusTone: String(trade.side || "").toLowerCase() === "buy" ? "buy" : "sell",
    meta: `${trade.when.toLocaleDateString("es-ES")} · ${trade.when.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}`,
    pnl: formatCurrency(trade.pnl),
    pnlClass: trade.pnl >= 0 ? "metric-positive" : "metric-negative",
    maxWidth: "80vw",
    content: `
      <section class="focus-panel-section focus-panel-section--lead">
        <div class="focus-panel-read">
          <p class="focus-panel-read__summary">${buildTradeExecutiveRead(trade)}</p>
        </div>
      </section>
      <section class="focus-panel-section">
        <div class="focus-panel-section__head">
          <div class="focus-panel-section__title">Resumen rápido</div>
        </div>
        <div class="focus-panel-pairs">
          <div class="focus-panel-pair-row"><strong>Entrada</strong><span>${formatTableValue(trade.entry)}</span><strong>Salida</strong><span>${formatTableValue(trade.exit)}</span></div>
          <div class="focus-panel-pair-row"><strong>SL</strong><span>${formatTableValue(trade.sl)}</span><strong>TP</strong><span>${formatTableValue(trade.tp)}</span></div>
          <div class="focus-panel-pair-row"><strong>Lote</strong><span>${formatTableValue(trade.volume)}</span><strong>Duración</strong><span>${formatDurationHuman(trade.durationMin)}</span></div>
          <div class="focus-panel-pair-row"><strong>Fees</strong><span class="${Number(trade.commission || 0) + Number(trade.fees || 0) + Number(trade.swap || 0) < 0 ? "metric-negative" : ""}">${formatCurrency(Number(trade.commission || 0) + Number(trade.fees || 0) + Number(trade.swap || 0))}</span><strong>R múltiple</strong><span class="${trade.rMultiple >= 0 ? "metric-positive" : "metric-negative"}">${trade.rMultiple.toFixed(1)}R</span></div>
        </div>
      </section>
      <section class="focus-panel-section">
        <div class="focus-panel-section__head">
          <div class="focus-panel-section__title">Contexto</div>
        </div>
        <div class="focus-panel-pairs focus-panel-pairs--plain">
          <div class="focus-panel-pair-row"><strong>Setup</strong><span>${displayTradeSetup(trade.setup)}</span><strong>Sesión</strong><span>${trade.session || "—"}</span></div>
        </div>
      </section>
      ${renderTradeExecutions(trade)}
    `
  });
}

function showPositionContextMenu(position) {
  if (!position) return;
  openFocusPanel({
    title: position.symbol,
    status: position.side,
    statusTone: String(position.side || "").toLowerCase() === "buy" ? "buy" : "sell",
    meta: "Posición abierta",
    pnl: formatCurrency(position.pnl),
    pnlClass: position.pnl >= 0 ? "metric-positive" : "metric-negative",
    maxWidth: "80vw",
    content: `
      <section class="focus-panel-section">
        <div class="focus-panel-section__head">
          <div class="focus-panel-section__title">Detalle de la posición</div>
        </div>
        <div class="focus-panel-pairs">
          <div class="focus-panel-pair-row"><strong>Entrada</strong><span>${formatTableValue(position.entry)}</span><strong>Salida</strong><span>—</span></div>
          <div class="focus-panel-pair-row"><strong>SL</strong><span>${formatTableValue(position.sl)}</span><strong>TP</strong><span>${formatTableValue(position.tp)}</span></div>
          <div class="focus-panel-pair-row"><strong>Lote</strong><span>${formatTableValue(position.volume)}</span><strong>Duración</strong><span>Abierta</span></div>
          <div class="focus-panel-pair-row"><strong>Fees</strong><span>—</span><strong>R múltiple</strong><span>—</span></div>
        </div>
      </section>
    `
  });
}

export function renderTrades(root, state) {
  const account = selectCurrentAccount(state);
  const model = selectCurrentModel(state);
  if (!model) {
    root.innerHTML = "";
    return;
  }
  const authority = resolveAccountDataAuthority(account);
  console.info("[KMFX][TRADES_AUTHORITY]", {
    account_id: account?.id || "",
    login: account?.login || "",
    broker: account?.broker || "",
    payloadSource: authority.payloadSource,
    tradeCount: authority.tradeCount,
    historyPoints: authority.historyPoints,
    firstTradeLabel: authority.firstTradeLabel,
    lastTradeLabel: authority.lastTradeLabel,
    sourceUsed: authority.sourceUsed,
  });
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
  const bestSetupLabel = displayTradeSetup(bestSetup?.key);
  const tradeTruthSummary = buildTradeTruthSummary(filteredTrades);

  root.innerHTML = `
    <section class="trades-screen">
    ${pageHeaderMarkup({
      eyebrow: "Operaciones",
      title: "Operaciones",
      description: "Revisa la ejecución por símbolo, sesión y setup.",
      className: "calendar-screen__header trades-screen__header",
      contentClassName: "calendar-screen__copy",
      eyebrowClassName: "calendar-screen__eyebrow",
      titleClassName: "calendar-screen__title",
      descriptionClassName: "calendar-screen__subtitle",
    })}

    ${renderTradeTruthSummary(tradeTruthSummary)}

    <div class="tl-kpi-row five">
      <article class="tl-kpi-card"><div class="tl-kpi-label">Trades filtrados</div><div class="tl-kpi-val">${filteredTrades.length}</div></article>
      <article class="tl-kpi-card"><div class="tl-kpi-label">PnL filtrado</div><div class="tl-kpi-val ${filteredPnl >= 0 ? "green" : "red"}">${formatCurrency(filteredPnl)}</div></article>
      <article class="tl-kpi-card"><div class="tl-kpi-label">Win Rate</div><div class="tl-kpi-val">${Math.round(filteredWinRate)}%</div></article>
      <article class="tl-kpi-card"><div class="tl-kpi-label">R medio</div><div class="tl-kpi-val">${filteredAvgR.toFixed(1)}R</div></article>
      <article class="tl-kpi-card"><div class="tl-kpi-label">Duración media</div><div class="tl-kpi-val">${formatDurationHuman(avgDuration)}</div></article>
    </div>

    <div class="grid-2 equal">
      <article class="tl-section-card">
        <div class="tl-section-header"><div class="tl-section-title">Resumen Operativo</div></div>
        <div class="breakdown-list">
          <div class="list-row"><div><div class="row-title">Setup con mejor edge</div><div class="row-sub">Mayor P&L agregado</div></div><div class="row-pnl ${bestSetup?.pnl >= 0 ? "metric-positive" : ""}">${bestSetupLabel}</div></div>
          <div class="list-row"><div><div class="row-title">Sesión más rentable</div><div class="row-sub">Mejor distribución de P&L</div></div><div class="row-pnl ${bestSession?.pnl >= 0 ? "metric-positive" : "metric-negative"}">${bestSession?.key || "—"}</div></div>
          <div class="list-row"><div><div class="row-title">Profit factor</div><div class="row-sub">Eficiencia media de la ejecución</div></div><div class="row-pnl">${model.totals.profitFactor.toFixed(2)}</div></div>
        </div>
      </article>
      <article class="tl-section-card">
        <div class="tl-section-header"><div class="tl-section-title">Top Símbolos</div></div>
        <div class="breakdown-list">
          ${model.symbols.slice(0, 4).map((symbol) => `
            <div class="list-row">
              <div><div class="row-title">${symbol.key}</div><div class="row-sub">${symbol.trades} trades · WR ${symbol.winRate.toFixed(0)}%</div></div>
              ${pnlTextMarkup({ value: symbol.pnl, text: formatCurrency(symbol.pnl), className: `row-pnl ${symbol.pnl >= 0 ? "metric-positive" : "metric-negative"}` })}
            </div>
          `).join("")}
        </div>
      </article>
    </div>

    <div class="tl-section-card">
      <div class="tl-section-header">
        <div class="tl-section-title">Posiciones abiertas</div>
        <div class="trades-table-summary">
          ${model.positions.length ? `<span>${model.positions.length} abiertas · ${formatCurrency(model.account.openPnl)}</span>` : ``}
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
              <tr class="open-position-row" data-position-id="${position.id || `${position.symbol}-${position.side}-${position.entry}`}">
                <td><span class="table-symbol">${position.symbol}</span></td>
                <td><span class="trade-side trade-side--${String(position.side || "").toLowerCase()}">${position.side}</span></td>
                <td>${position.volume}</td>
                <td>${position.entry}</td>
                <td>${pnlTextMarkup({ value: position.pnl, text: formatCurrency(position.pnl), className: position.pnl >= 0 ? "metric-positive" : "metric-negative" })}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
      <div class="widget-position-rails">
        ${model.positions.map((position) => positionRail(position)).join("")}
      </div>
    </div>

    <div class="tl-section-card trades-history-surface trades-history-card">
      <div class="tl-section-header">
        <div class="tl-section-title">Historial de operaciones</div>
        <div class="trades-table-summary">
          <span>${filteredTrades.length} operaciones</span>
          <span>${formatCurrency(filteredPnl)}</span>
        </div>
      </div>
      <div class="trades-toolbar">
        <label class="trades-filter-field ${filters.symbol !== "all" ? "is-active" : ""}">
          <span>Símbolo</span>
          <select data-trades-filter="symbol">
            <option value="all">Todos</option>
            ${symbols.map((symbol) => `<option value="${symbol}" ${filters.symbol === symbol ? "selected" : ""}>${symbol}</option>`).join("")}
          </select>
        </label>
        <label class="trades-filter-field ${filters.session !== "all" ? "is-active" : ""}">
          <span>Sesión</span>
          <select data-trades-filter="session">
            <option value="all">Todas</option>
            ${sessions.map((session) => `<option value="${session}" ${filters.session === session ? "selected" : ""}>${session}</option>`).join("")}
          </select>
        </label>
        <label class="trades-filter-field ${filters.setup !== "all" ? "is-active" : ""}">
          <span>Setup</span>
          <select data-trades-filter="setup">
            <option value="all">Todos</option>
            ${setups.map((setup) => `<option value="${setup}" ${filters.setup === setup ? "selected" : ""}>${setup}</option>`).join("")}
          </select>
        </label>
        <label class="trades-filter-field ${filters.side !== "all" ? "is-active" : ""}">
          <span>Dirección</span>
          <select data-trades-filter="side">
            <option value="all">Ambas</option>
            <option value="BUY" ${filters.side === "BUY" ? "selected" : ""}>BUY</option>
            <option value="SELL" ${filters.side === "SELL" ? "selected" : ""}>SELL</option>
          </select>
        </label>
        <label class="trades-filter-field trades-filter-field--search ${filters.queryRaw ? "is-active" : ""}">
          <span>Buscar</span>
          <div class="trades-filter-search-shell">
            <span class="trades-filter-search-icon" aria-hidden="true">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="7" cy="7" r="4.5"></circle>
                <path d="M10.5 10.5 14 14"></path>
              </svg>
            </span>
            <input type="search" value="${escapeHtml(filters.queryRaw)}" placeholder="Buscar símbolo, setup o sesión" data-trades-filter="query">
          </div>
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
                <td class="table-num">${pnlTextMarkup({ value: trade.pnl, text: formatCurrency(trade.pnl), className: trade.pnl >= 0 ? "metric-positive" : "metric-negative" })}</td>
                <td class="table-num">${trade.rMultiple.toFixed(1)}R</td>
                <td class="table-num">${formatDurationHuman(trade.durationMin)}</td>
                <td>${normalizeTradeSetup(trade.setup)}</td>
                <td>${trade.session}</td>
              </tr>
            `).join("")}
            ${!filteredTrades.length ? `
              <tr>
                <td colspan="13" class="trades-empty-state">No hay operaciones registradas</td>
              </tr>
            ` : ""}
          </tbody>
        </table>
      </div>
    </div>
    </section>
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
    row.addEventListener("click", () => {
      showTradeContextMenu(tradesById.get(String(row.dataset.tradeId)));
    });
    addLongPress(row, () => {
      showTradeContextMenu(tradesById.get(String(row.dataset.tradeId)));
    });
  });

  const positionsById = new Map(model.positions.map((position) => [String(position.id || `${position.symbol}-${position.side}-${position.entry}`), position]));
  root.querySelectorAll(".open-position-row").forEach((row) => {
    row.addEventListener("click", () => {
      showPositionContextMenu(positionsById.get(String(row.dataset.positionId)));
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
