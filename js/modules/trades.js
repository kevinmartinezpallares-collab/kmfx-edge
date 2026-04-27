import { closeModal, openFocusPanel } from "./modal-system.js?v=build-20260406-213500";
import { formatCurrency, formatDurationHuman, resolveAccountDataAuthority, selectCurrentAccount, selectCurrentModel } from "./utils.js?v=build-20260406-213500";
import { kpiCardMarkup, pageHeaderMarkup, pnlTextMarkup } from "./ui-primitives.js?v=build-20260406-213500";

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

function toneFromValue(value) {
  const amount = Number(value) || 0;
  if (amount > 0) return "profit";
  if (amount < 0) return "loss";
  return "neutral";
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

function renderTradesKpiRow({
  filteredTradesCount,
  filteredPnl,
  filteredWinRate,
  filteredAvgR,
  avgDuration
}) {
  return `
    <div class="trades-kpi-row" aria-label="Resumen de operaciones filtradas">
      ${kpiCardMarkup({
        label: "Trades filtrados",
        value: String(filteredTradesCount),
        tone: "neutral",
        className: "trades-kpi-card",
        attrs: { "data-trades-kpi": "filtered-trades" }
      })}
      ${kpiCardMarkup({
        label: "PnL filtrado",
        valueHtml: pnlTextMarkup({ value: filteredPnl, text: formatSignedCurrency(filteredPnl) }),
        tone: toneFromValue(filteredPnl),
        className: "trades-kpi-card",
        attrs: { "data-trades-kpi": "filtered-pnl" }
      })}
      ${kpiCardMarkup({
        label: "Win Rate",
        value: `${Math.round(filteredWinRate)}%`,
        tone: "info",
        className: "trades-kpi-card",
        attrs: { "data-trades-kpi": "win-rate" }
      })}
      ${kpiCardMarkup({
        label: "R medio",
        value: `${filteredAvgR.toFixed(1)}R`,
        tone: toneFromValue(filteredAvgR),
        className: "trades-kpi-card",
        attrs: { "data-trades-kpi": "average-r" }
      })}
      ${kpiCardMarkup({
        label: "Duración media",
        value: formatDurationHuman(avgDuration),
        tone: "neutral",
        className: "trades-kpi-card",
        attrs: { "data-trades-kpi": "average-duration" }
      })}
    </div>
  `;
}

function renderTradesOverviewSections({
  bestSetup,
  bestSetupLabel,
  bestSession,
  profitFactor,
  symbols = []
}) {
  return `
    <div class="trades-overview-grid">
      <article class="trades-overview-card" aria-label="Resumen operativo">
        <header class="trades-overview-header">
          <div>
            <h2 class="trades-overview-title">Resumen Operativo</h2>
            <p class="trades-overview-subtitle">Lectura rápida de edge, sesión y eficiencia.</p>
          </div>
        </header>
        <div class="trades-overview-card__body">
          <div class="trades-overview-row">
            <div>
              <span class="trades-overview-row__label">Setup con mejor edge</span>
              <span class="trades-overview-row__meta">Mayor P&amp;L agregado</span>
            </div>
            <strong class="trades-overview-row__value">${escapeHtml(bestSetupLabel)}</strong>
          </div>
          <div class="trades-overview-row">
            <div>
              <span class="trades-overview-row__label">Sesión más rentable</span>
              <span class="trades-overview-row__meta">Mejor distribución de P&amp;L</span>
            </div>
            <strong class="trades-overview-row__value">${escapeHtml(bestSession?.key || "—")}</strong>
          </div>
          <div class="trades-overview-row">
            <div>
              <span class="trades-overview-row__label">Profit factor</span>
              <span class="trades-overview-row__meta">Eficiencia media de la ejecución</span>
            </div>
            <strong class="trades-overview-row__value">${escapeHtml(profitFactor.toFixed(2))}</strong>
          </div>
        </div>
      </article>

      <article class="trades-overview-card trades-symbols-card" aria-label="Top símbolos">
        <header class="trades-overview-header">
          <div>
            <h2 class="trades-overview-title">Top Símbolos</h2>
            <p class="trades-overview-subtitle">Ranking por rendimiento agregado.</p>
          </div>
        </header>
        <div class="trades-symbols-list">
          ${symbols.slice(0, 4).map((symbol) => `
            <div class="trades-symbol-row">
              <div>
                <div class="trades-symbol-name">${escapeHtml(symbol.key)}</div>
                <div class="trades-symbol-meta">${escapeHtml(`${symbol.trades} trades · WR ${symbol.winRate.toFixed(0)}%`)}</div>
              </div>
              ${pnlTextMarkup({ value: symbol.pnl, text: formatCurrency(symbol.pnl), className: "trades-symbol-value" })}
            </div>
          `).join("")}
        </div>
      </article>
    </div>
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

function tradeFeesValue(trade) {
  return Number(trade.commission || 0) + Number(trade.fees || 0) + Number(trade.swap || 0);
}

function tradeNextStepCopy(trade) {
  const pnl = Number(trade?.pnl || 0);
  if (pnl > 0) return "Revisa si la ejecución respetó el plan antes de escalar conclusiones.";
  if (pnl < 0) return "Revisa entrada, gestión y reglas antes de repetir el setup.";
  return "Completa la validación post-trade para cerrar el análisis.";
}

function renderTradeFocusStat({ label, valueHtml, tone = "neutral" }) {
  return `
    <article class="trades-focus-stats__item" data-tone="${tone}">
      <span class="trades-focus-stats__label">${label}</span>
      <span class="trades-focus-stats__value">${valueHtml}</span>
    </article>
  `;
}

function renderTradeFocusKv(label, valueHtml, tone = "neutral") {
  return `
    <div class="trades-focus-kv__item" data-tone="${tone}">
      <span class="trades-focus-kv__label">${label}</span>
      <span class="trades-focus-kv__value">${valueHtml}</span>
    </div>
  `;
}

function tradeFocusTruthContent(tagState) {
  const state = tagState?.state || "untagged";
  const contentByState = {
    untagged: {
      title: "Sin tag",
      description: "Completa el tag post-trade para cerrar la lectura de este trade.",
      tone: "neutral",
      action: "Completar tag"
    },
    pending: {
      title: "Validación pendiente",
      description: "El tag está parcial o marcado como pendiente.",
      tone: "warning",
      action: "Completar validación"
    },
    valid: {
      title: "Trade válido",
      description: "No hay reglas manuales incumplidas en el tag completado.",
      tone: "success",
      action: "Ver validación"
    },
    invalid: {
      title: "Trade a revisar",
      description: "Hay reglas manuales incumplidas en el tag completado.",
      tone: "danger",
      action: "Ver validación"
    }
  };
  return contentByState[state] || contentByState.untagged;
}

function renderTradeFocusTruth(trade, summary = "") {
  const tag = getTradeTag(trade, loadTradeTagMap());
  const tagState = evaluateTradeTagState(trade, tag);
  const content = tradeFocusTruthContent(tagState);
  const failedRules = tagState.failedRules || [];
  const note = String(tag?.note || "").trim();
  const emotionalState = String(tag?.emotionalState || "").trim();

  return `
    <section class="trades-focus-section trades-focus-section--truth">
      <div class="trades-focus-truth" data-tone="${content.tone}">
        <div class="trades-focus-truth__main">
          <span class="trades-focus-section__eyebrow">VERDAD DEL TRADE</span>
          <div class="trades-focus-truth__title-row">
            <strong class="trades-focus-truth__title">${escapeHtml(content.title)}</strong>
            <button
              type="button"
              class="trades-focus-truth__action trades-focus-tag-action"
              data-trade-tag-action
              data-trade-id="${escapeHtml(trade?.id || "")}"
            >${escapeHtml(content.action)}</button>
          </div>
          <p class="trades-focus-truth__description">${escapeHtml(content.description)}</p>
          ${summary ? `<p class="trades-focus-truth__summary">${escapeHtml(summary)}</p>` : ""}
        </div>
        ${failedRules.length ? `
          <div class="trades-focus-rule-list" aria-label="Reglas incumplidas">
            ${failedRules.map((rule) => `<span class="trades-focus-rule-pill">${escapeHtml(rule)}</span>`).join("")}
          </div>
        ` : ""}
        ${note || emotionalState ? `
          <div class="trades-focus-truth__context">
            ${note ? `
              <div class="trades-focus-truth__context-item">
                <span>Nota</span>
                <p>${escapeHtml(note)}</p>
              </div>
            ` : ""}
            ${emotionalState ? `
              <div class="trades-focus-truth__context-item">
                <span>Estado emocional</span>
                <p>${escapeHtml(emotionalState)}</p>
              </div>
            ` : ""}
          </div>
        ` : ""}
      </div>
    </section>
  `;
}

function dispatchTradeTagIntent(trade) {
  if (!trade) return;
  const tagTrade = {
    ...trade,
    direction: trade.direction || trade.side || trade.type || ""
  };
  closeModal();
  window.dispatchEvent(new CustomEvent("kmfx:open-post-trade-tag", {
    detail: {
      source: "trades-focus-panel",
      tradeId: tagTrade.id || "",
      trade: tagTrade
    }
  }));
}

function renderTradeExecutions(trade) {
  const executions = Array.isArray(trade?.executions) ? trade.executions : [];
  if (!executions.length) return "";
  return `
    <section class="trades-focus-section trades-focus-section--executions">
      <div class="trades-focus-section__head">
        <div>
          <div class="trades-focus-section__eyebrow">EJECUCIÓN</div>
          <div class="trades-focus-section__title">${executions.length > 1 ? "Parciales y ejecuciones" : "Ejecución"}</div>
        </div>
        <p class="trades-focus-section__description">Cierres registrados y P&amp;L acumulado del trade.</p>
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

function positionDomId(position = {}) {
  return position.id || `${position.symbol}-${position.side}-${position.entry}`;
}

function renderOpenPositionRow(position) {
  return `
    <button
      type="button"
      class="open-position-row trades-position-row"
      data-position-id="${escapeHtml(positionDomId(position))}"
      role="row"
    >
      <span class="trades-position-row__main" role="cell">
        <span class="trades-position-row__symbol">${position.symbol}</span>
        <span class="trades-position-row__meta">Vol ${position.volume} · Entrada ${position.entry}</span>
      </span>
      <span class="trades-position-row__side trades-position-row__side--${String(position.side || "").toLowerCase()}" role="cell">${position.side}</span>
      <span class="trades-position-row__value" role="cell">${position.volume}</span>
      <span class="trades-position-row__value" role="cell">${position.entry}</span>
      <span class="trades-position-row__pnl-cell" role="cell">
        ${pnlTextMarkup({
          value: position.pnl,
          text: formatCurrency(position.pnl),
          className: `trades-position-row__pnl ${position.pnl >= 0 ? "metric-positive" : "metric-negative"}`
        })}
      </span>
    </button>
  `;
}

function renderPositionFocusKv(label, valueHtml) {
  return `
    <div class="trades-position-focus__item">
      <span class="trades-position-focus__label">${label}</span>
      <span class="trades-position-focus__value">${valueHtml}</span>
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

function captureTradesViewState(root, control) {
  const scrollContainers = [];
  const scrollingElement = document.scrollingElement || document.documentElement;
  if (scrollingElement) {
    scrollContainers.push({ element: scrollingElement, top: scrollingElement.scrollTop, left: scrollingElement.scrollLeft });
  }

  for (let element = root?.parentElement; element; element = element.parentElement) {
    scrollContainers.push({ element, top: element.scrollTop, left: element.scrollLeft });
  }

  const tableScroll = root.querySelector(".trades-table-wrap");
  const selectionStart = typeof control?.selectionStart === "number" ? control.selectionStart : null;
  const selectionEnd = typeof control?.selectionEnd === "number" ? control.selectionEnd : null;

  return {
    field: control?.dataset?.tradesFilter || "",
    selectionStart,
    selectionEnd,
    scrollContainers,
    tableScrollTop: tableScroll?.scrollTop || 0,
    tableScrollLeft: tableScroll?.scrollLeft || 0,
  };
}

function restoreTradesViewState(root, viewState, { restoreFocus = true } = {}) {
  if (!viewState) return;

  viewState.scrollContainers?.forEach(({ element, top, left }) => {
    if (!element) return;
    element.scrollTop = top;
    element.scrollLeft = left;
  });

  const tableScroll = root.querySelector(".trades-table-wrap");
  if (tableScroll) {
    tableScroll.scrollTop = viewState.tableScrollTop;
    tableScroll.scrollLeft = viewState.tableScrollLeft;
  }

  if (!restoreFocus || !viewState.field) return;
  const nextControl = root.querySelector(`[data-trades-filter="${viewState.field}"]`);
  if (!nextControl) return;

  nextControl.focus({ preventScroll: true });
  if (
    typeof nextControl.setSelectionRange === "function" &&
    viewState.selectionStart !== null &&
    viewState.selectionEnd !== null
  ) {
    nextControl.setSelectionRange(viewState.selectionStart, viewState.selectionEnd);
  }
}

function updateTradeFilterAndRender(root, state, input) {
  const viewState = captureTradesViewState(root, input);
  const next = getTradeFilters(root);
  const field = input.dataset.tradesFilter;
  next[field] = field === "query" ? input.value.trim().toLowerCase() : input.value;
  next.queryRaw = field === "query" ? input.value : next.queryRaw;
  root.__tradeFilters = next;
  renderTrades(root, state);
  restoreTradesViewState(root, viewState);
  window.requestAnimationFrame?.(() => restoreTradesViewState(root, viewState, { restoreFocus: false }));
}

function showTradeContextMenu(trade) {
  if (!trade) return;
  const fees = tradeFeesValue(trade);
  const rMultipleText = `${trade.rMultiple.toFixed(1)}R`;
  const rMultipleTone = trade.rMultiple >= 0 ? "profit" : "loss";
  const feesTone = fees < 0 ? "loss" : "neutral";
  openFocusPanel({
    title: trade.symbol,
    status: trade.side,
    statusTone: String(trade.side || "").toLowerCase() === "buy" ? "buy" : "sell",
    meta: `${trade.when.toLocaleDateString("es-ES")} · ${trade.when.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}`,
    pnl: formatCurrency(trade.pnl),
    pnlClass: trade.pnl >= 0 ? "metric-positive" : "metric-negative",
    maxWidth: "80vw",
    content: `
      <article class="trades-focus-report">
        <div class="trades-focus-stats" aria-label="Resultado operativo del trade">
          ${renderTradeFocusStat({
            label: "P&L neto",
            valueHtml: pnlTextMarkup({ value: trade.pnl, text: formatCurrency(trade.pnl), className: trade.pnl >= 0 ? "metric-positive" : "metric-negative" }),
            tone: trade.pnl > 0 ? "profit" : trade.pnl < 0 ? "loss" : "neutral"
          })}
          ${renderTradeFocusStat({
            label: "R múltiple",
            valueHtml: `<span class="${trade.rMultiple >= 0 ? "metric-positive" : "metric-negative"}">${rMultipleText}</span>`,
            tone: rMultipleTone
          })}
          ${renderTradeFocusStat({
            label: "Fees",
            valueHtml: `<span class="${fees < 0 ? "metric-negative" : ""}">${formatCurrency(fees)}</span>`,
            tone: feesTone
          })}
          ${renderTradeFocusStat({
            label: "Duración",
            valueHtml: formatDurationHuman(trade.durationMin)
          })}
        </div>

        ${renderTradeFocusTruth(trade, buildTradeExecutiveRead(trade))}

        <section class="trades-focus-section">
          <div class="trades-focus-section__head">
            <div>
              <div class="trades-focus-section__eyebrow">EVIDENCIA TÉCNICA</div>
              <div class="trades-focus-section__title">Ejecución técnica</div>
            </div>
          </div>
          <div class="trades-focus-kv">
            ${renderTradeFocusKv("Entrada", formatTableValue(trade.entry))}
            ${renderTradeFocusKv("Salida", formatTableValue(trade.exit))}
            ${renderTradeFocusKv("SL", formatTableValue(trade.sl))}
            ${renderTradeFocusKv("TP", formatTableValue(trade.tp))}
            ${renderTradeFocusKv("Volumen", formatTableValue(trade.volume))}
            ${renderTradeFocusKv("Setup", displayTradeSetup(trade.setup))}
            ${renderTradeFocusKv("Sesión", trade.session || "—")}
          </div>
        </section>

        ${renderTradeExecutions(trade)}

        <section class="trades-focus-next-step">
          <span class="trades-focus-next-step__label">Siguiente paso</span>
          <p>${tradeNextStepCopy(trade)}</p>
        </section>
      </article>
    `,
    onMount: (panel) => {
      panel.querySelector("[data-trade-tag-action]")?.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        dispatchTradeTagIntent(trade);
      });
    }
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
      <section class="trades-position-focus">
        <div class="trades-position-focus__head">
          <div>
            <span class="trades-position-focus__eyebrow">POSICIÓN ABIERTA</span>
            <h3 class="trades-position-focus__title">Detalle de la posición</h3>
          </div>
          <p class="trades-position-focus__description">Entrada, protección y exposición actual.</p>
        </div>
        <div class="trades-position-focus__grid">
          ${renderPositionFocusKv("Entrada", formatTableValue(position.entry))}
          ${renderPositionFocusKv("Salida", "—")}
          ${renderPositionFocusKv("SL", formatTableValue(position.sl))}
          ${renderPositionFocusKv("TP", formatTableValue(position.tp))}
          ${renderPositionFocusKv("Lote", formatTableValue(position.volume))}
          ${renderPositionFocusKv("Duración", "Abierta")}
          ${renderPositionFocusKv("Fees", "—")}
          ${renderPositionFocusKv("R múltiple", "—")}
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

    ${renderTradesKpiRow({
      filteredTradesCount: filteredTrades.length,
      filteredPnl,
      filteredWinRate,
      filteredAvgR,
      avgDuration
    })}

    ${renderTradesOverviewSections({
      bestSetup,
      bestSetupLabel,
      bestSession,
      profitFactor: model.totals.profitFactor,
      symbols: model.symbols
    })}

    <section class="trades-open-positions" aria-label="Posiciones abiertas">
      <div class="trades-open-positions__header">
        <div class="trades-open-positions__copy">
          <h2 class="trades-open-positions__title">Posiciones abiertas</h2>
          <p class="trades-open-positions__description">Riesgo vivo y exposición actual de la cuenta.</p>
        </div>
        <div class="trades-open-positions__summary">
          ${model.positions.length ? `
            <span>${model.positions.length} abiertas ·</span>
            ${pnlTextMarkup({
              value: model.account.openPnl,
              text: formatSignedCurrency(model.account.openPnl),
              className: "trades-open-positions__summary-pnl"
            })}
          ` : ``}
        </div>
      </div>
      <div class="trades-open-positions__table" role="table" aria-label="Riesgo vivo y exposición actual">
        <div class="trades-open-positions__head" role="row">
          <span role="columnheader">Par</span>
          <span role="columnheader">Dir</span>
          <span role="columnheader">Vol</span>
          <span role="columnheader">Entrada</span>
          <span role="columnheader">P&amp;L</span>
        </div>
        <div class="trades-open-positions__body" role="rowgroup">
          ${model.positions.map((position) => renderOpenPositionRow(position)).join("")}
        </div>
      </div>
    </section>

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
      updateTradeFilterAndRender(root, state, input);
    });
    input.addEventListener("change", () => {
      updateTradeFilterAndRender(root, state, input);
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

  const positionsById = new Map(model.positions.map((position) => [String(positionDomId(position)), position]));
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
