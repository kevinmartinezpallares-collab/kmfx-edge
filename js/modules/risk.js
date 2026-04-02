import { formatCurrency, formatDateTime, formatPercent, selectCurrentAccount, selectCurrentModel } from "./utils.js?v=build-20260401-203500";
import { badgeMarkup } from "./status-badges.js?v=build-20260401-203500";
import { computeRiskAlerts, riskAlertsMarkup } from "./risk-alerts.js?v=build-20260401-203500";
import { computeRecommendedRiskFromModel } from "./risk-engine.js?v=build-20260401-203500";
import { selectVisibleUserProfile } from "./auth-session.js?v=build-20260401-203500";
import { persistLocalPreferences, readLocalPreferences, saveSupabaseUserConfig } from "./supabase-user-config.js?v=build-20260401-203500";

const RISK_PANEL_STORAGE_KEY = "kmfx.risk.panel.config.v1";
const ALL_SYMBOLS = [
  { id: "EURUSD", cat: "Forex", color: "#0A84FF" },
  { id: "GBPUSD", cat: "Forex", color: "#0A84FF" },
  { id: "USDJPY", cat: "Forex", color: "#0A84FF" },
  { id: "USDCHF", cat: "Forex", color: "#0A84FF" },
  { id: "AUDUSD", cat: "Forex", color: "#0A84FF" },
  { id: "USDCAD", cat: "Forex", color: "#0A84FF" },
  { id: "NZDUSD", cat: "Forex", color: "#0A84FF" },
  { id: "EURGBP", cat: "Forex", color: "#0A84FF" },
  { id: "EURJPY", cat: "Forex", color: "#0A84FF" },
  { id: "GBPJPY", cat: "Forex", color: "#0A84FF" },
  { id: "NAS100", cat: "Índice", color: "#30d158" },
  { id: "US30", cat: "Índice", color: "#30d158" },
  { id: "SPX500", cat: "Índice", color: "#30d158" },
  { id: "GER40", cat: "Índice", color: "#30d158" },
  { id: "UK100", cat: "Índice", color: "#30d158" },
  { id: "XAUUSD", cat: "Commodity", color: "#FFD60A" },
  { id: "XAGUSD", cat: "Commodity", color: "#FFD60A" },
  { id: "USOIL", cat: "Commodity", color: "#FFD60A" },
  { id: "BTCUSD", cat: "Crypto", color: "#bf5af2" },
  { id: "ETHUSD", cat: "Crypto", color: "#bf5af2" }
];

function readRiskPanelStorage() {
  try {
    return JSON.parse(window.localStorage.getItem(RISK_PANEL_STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function persistRiskPanelStorage(values = {}) {
  try {
    window.localStorage.setItem(RISK_PANEL_STORAGE_KEY, JSON.stringify(values));
  } catch {
    // noop
  }
}

function ladderRows(risk) {
  return risk.ladder.map((row) => ({
    ...row,
    entryCondition: row.condition,
    riseCondition: row.rise,
    fallCondition: row.fall,
    tradesTo100k: Math.round(100 / Math.max(row.riskPct, 0.1))
  }));
}

function currentLadderLevel(ladder, risk) {
  const currentRiskPct = Number(risk?.currentRiskPct || 0);
  const protectRow = ladder.find((row) => row.level === "PROTECT");
  if (Number(risk?.marginTrades || 0) <= 1 && protectRow) return protectRow.level;

  let closest = ladder[0]?.level || "BASE";
  let minDiff = Number.POSITIVE_INFINITY;
  ladder.forEach((row) => {
    const diff = Math.abs(Number(row.riskPct || 0) - currentRiskPct);
    if (diff < minDiff) {
      minDiff = diff;
      closest = row.level;
    }
  });
  return closest;
}

function renderLadderProgress(ladder, currentLevel) {
  const currentIndex = Math.max(0, ladder.findIndex((row) => row.level === currentLevel));
  return `
    <div class="risk-ladder-progress" aria-label="Progresión de escalera de riesgo">
      ${ladder.map((row, index) => {
        const stateClass = index < currentIndex
          ? "done"
          : index === currentIndex
            ? "current"
            : "idle";
        return `
          <div class="risk-ladder-step risk-ladder-step--${stateClass}">
            <div class="risk-ladder-node">
              <span>${row.level}</span>
              <small>${row.riskPct.toFixed(2)}%</small>
              ${stateClass === "current" ? `<em class="risk-ladder-current-pill">ACTUAL</em>` : ""}
            </div>
            ${index < ladder.length - 1 ? `<div class="risk-ladder-connector"></div>` : ""}
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function getRiskPreferencesDraft(root) {
  if (!root.__riskPrefsDraft) {
    const preferences = readLocalPreferences();
    const panelConfig = readRiskPanelStorage();
    const hasAllowedSessions = Object.prototype.hasOwnProperty.call(panelConfig, "allowedSessions");
    const hasAllowedSymbols = Object.prototype.hasOwnProperty.call(panelConfig, "allowedSymbols");
    const hasFavoriteSymbols = Object.prototype.hasOwnProperty.call(panelConfig, "favoriteSymbols");
    const hasCustomSymbols = Object.prototype.hasOwnProperty.call(panelConfig, "customSymbols");
    root.__riskPrefsDraft = {
      defaultRisk: String(preferences.defaultRisk ?? "0.45"),
      dailyDrawdownLimit: String(preferences.dailyDrawdownLimit ?? "1.2"),
      maxDrawdownLimit: String(preferences.maxDrawdownLimit ?? "10"),
      alertDrawdown: Boolean(preferences.alertDrawdown),
      alertStreaks: Boolean(preferences.alertStreaks),
      alertWinRate: Boolean(preferences.alertWinRate),
      alertOvertrading: Boolean(preferences.alertOvertrading),
      riskGuidanceEnabled: Boolean(preferences.riskGuidanceEnabled),
      autoBlockOptIn: Boolean(preferences.autoBlockOptIn),
      allowedSessionsEnabled: panelConfig.allowedSessionsEnabled ?? true,
      maxVolumeEnabled: panelConfig.maxVolumeEnabled ?? true,
      allowedSymbolsEnabled: panelConfig.allowedSymbolsEnabled ?? true,
      allowedSessions: String(hasAllowedSessions ? (panelConfig.allowedSessions ?? "") : ""),
      maxVolume: String(panelConfig.maxVolume ?? ""),
      allowedSymbols: String(hasAllowedSymbols ? (panelConfig.allowedSymbols ?? "") : ""),
      favoriteSymbols: String(hasFavoriteSymbols ? (panelConfig.favoriteSymbols ?? "") : ""),
      customSymbols: String(hasCustomSymbols ? (panelConfig.customSymbols ?? "") : ""),
      __hasAllowedSessions: hasAllowedSessions,
      __hasAllowedSymbols: hasAllowedSymbols
    };
  }
  return root.__riskPrefsDraft;
}

function persistRiskPreferencesDraft(root, patch = {}) {
  root.__riskPrefsDraft = {
    ...getRiskPreferencesDraft(root),
    ...patch
  };
  root.__riskPrefsStatus = "pending";
  return root.__riskPrefsDraft;
}

function riskConfigStatusLabel(status) {
  if (status === "saved") return "Configuración de riesgo guardada.";
  if (status === "error") return "No se pudo guardar la configuración. Inténtalo de nuevo.";
  if (status === "saving") return "Guardando configuración de riesgo...";
  if (status === "pending") return "Cambios pendientes de guardar.";
  return "Estos controles sí se guardan en tus preferencias del panel.";
}

function toggleStatusLabel(active, enabledLabel = "Activo", disabledLabel = "Off") {
  return active ? enabledLabel : disabledLabel;
}

function parseTokenList(value) {
  return String(value || "")
    .split(/[·,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function serializeTokenList(values = []) {
  return values.filter(Boolean).join(" · ");
}

function ensureRiskUiState(root) {
  if (!root.__riskUiState) {
    root.__riskUiState = { openMenu: null, symbolQuery: "" };
  }
  return root.__riskUiState;
}

function iconCheckMarkup() {
  return `
    <svg viewBox="0 0 13 13" fill="none" aria-hidden="true">
      <path d="M2.5 6.5L5.5 9.5L10.5 3.5" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path>
    </svg>
  `;
}

function symbolCategoryTone(category = "") {
  const normalized = String(category).toLowerCase();
  if (normalized === "forex") return "forex";
  if (normalized === "índice" || normalized === "indice") return "indice";
  if (normalized === "commodity") return "commodity";
  if (normalized === "crypto") return "crypto";
  return "custom";
}

function categoryPillMarkup(symbol) {
  const tone = symbolCategoryTone(symbol.cat);
  const icons = {
    forex: "↔",
    indice: "▦",
    commodity: "◈",
    crypto: "◌",
    custom: "+"
  };
  return `
    <span class="risk-symbol-cat risk-symbol-cat--${tone}">
      <span class="risk-symbol-cat-icon" aria-hidden="true">${icons[tone] || "+"}</span>
      <span>${symbol.cat}</span>
    </span>
  `;
}

function sessionUtcLabel(session = "") {
  if (session === "Asia") return "00:00 · 08:00 UTC";
  if (session === "London") return "07:00 · 16:00 UTC";
  if (session === "New York") return "12:00 · 21:00 UTC";
  return "UTC";
}

function rerenderRiskKeepingSymbolSearch(root, state) {
  const ui = ensureRiskUiState(root);
  const query = ui.symbolQuery;
  renderRisk(root, state);
  window.requestAnimationFrame(() => {
    const search = root.querySelector("[data-risk-symbol-search]");
    if (!search) return;
    search.focus();
    search.value = query;
    search.setSelectionRange(query.length, query.length);
  });
}

export function renderRisk(root, state) {
  const model = selectCurrentModel(state);
  const account = selectCurrentAccount(state);
  if (!model || !account) {
    root.innerHTML = "";
    return;
  }

  const risk = model.riskSummary;
  const isBlocked = account.compliance.riskStatus === "violation";
  const ladder = ladderRows(risk);
  const prefsDraft = getRiskPreferencesDraft(root);
  const riskUi = ensureRiskUiState(root);
  const sessionOptions = ["Asia", "London", "New York"];
  const customSymbols = parseTokenList(prefsDraft.customSymbols).map((id) => ({
    id,
    cat: "Custom",
    color: "#8e8e93"
  }));
  const symbolUniverseMap = new Map(
    [...ALL_SYMBOLS, ...customSymbols].map((symbol) => [symbol.id.toUpperCase(), { ...symbol, id: symbol.id.toUpperCase() }])
  );
  (model.symbols || []).forEach((item) => {
    const id = String(item.key || "").toUpperCase().trim();
    if (!id || symbolUniverseMap.has(id)) return;
    symbolUniverseMap.set(id, { id, cat: "Custom", color: "#8e8e93" });
  });
  const symbolUniverse = [...symbolUniverseMap.values()];
  const selectedSessions = parseTokenList(
    prefsDraft.__hasAllowedSessions
      ? prefsDraft.allowedSessions
      : (model.riskProfile.allowedSessions || ["London", "New York"]).join(" · ")
  );
  const selectedSymbols = parseTokenList(
    prefsDraft.__hasAllowedSymbols
      ? prefsDraft.allowedSymbols
      : (model.riskProfile.allowedSymbols || symbolUniverse.map((item) => item.id)).join(" · ")
  );
  const favoriteSymbols = new Set(parseTokenList(prefsDraft.favoriteSymbols));
  const selectedSymbolSet = new Set(selectedSymbols);
  const normalizedQuery = riskUi.symbolQuery.trim().toUpperCase();
  const filteredSymbols = symbolUniverse.filter((symbol) => !normalizedQuery || symbol.id.includes(normalizedQuery));
  const selectedSymbolItems = symbolUniverse
    .filter((symbol) => selectedSymbolSet.has(symbol.id))
    .sort((a, b) => {
      const favDelta = Number(favoriteSymbols.has(b.id)) - Number(favoriteSymbols.has(a.id));
      if (favDelta !== 0) return favDelta;
      return a.id.localeCompare(b.id);
    });
  const availableSymbolItems = filteredSymbols
    .filter((symbol) => !selectedSymbolSet.has(symbol.id))
    .sort((a, b) => {
      const favDelta = Number(favoriteSymbols.has(b.id)) - Number(favoriteSymbols.has(a.id));
      if (favDelta !== 0) return favDelta;
      return a.id.localeCompare(b.id);
    });
  const canCreateCustomSymbol = Boolean(normalizedQuery) && filteredSymbols.length === 0 && !symbolUniverse.some((symbol) => symbol.id === normalizedQuery);
  const selectedSessionsLabel = selectedSessions.length ? serializeTokenList(selectedSessions) : "Sin sesiones";
  const selectedSymbolsLabel = selectedSymbols.length
    ? selectedSymbols.length <= 4
      ? serializeTokenList(selectedSymbols)
      : `${selectedSymbols.length} símbolos seleccionados`
    : "Sin símbolos";
  const summaryPills = selectedSymbols.slice(0, 4);
  const summaryOverflow = Math.max(0, selectedSymbols.length - summaryPills.length);
  const selectedSymbolTagsMarkup = selectedSymbolItems.length
    ? selectedSymbolItems.slice(0, 5).map((symbol) => {
      const meta = symbolUniverseMap.get(symbol.id) || { cat: "Custom" };
      return `<span class="risk-selected-tag risk-selected-tag--${symbolCategoryTone(meta.cat)}">${symbol.id}</span>`;
    }).join("")
    : `<span class="risk-selected-tag risk-selected-tag--empty">Sin símbolos</span>`;
  const selectedSymbolOverflowMarkup = selectedSymbolItems.length > 5
    ? `<span class="risk-selected-tag risk-selected-tag--more">+${selectedSymbolItems.length - 5}</span>`
    : "";
  const selectedSymbolEditorChips = selectedSymbolItems.length
    ? selectedSymbolItems.map((symbol) => `
      <button class="risk-editor-chip risk-editor-chip--selected" type="button" data-risk-symbol-remove="${symbol.id}" ${prefsDraft.allowedSymbolsEnabled ? "" : "disabled"}>
        <span>${symbol.id}</span>
        <i aria-hidden="true">×</i>
      </button>
    `).join("")
    : `<div class="risk-editor-empty">Todavía no hay símbolos autorizados.</div>`;
  const showSymbolSearchResults = Boolean(normalizedQuery) || canCreateCustomSymbol;
  const syncToneClass = mt5SyncState.tone === "danger" ? "negative" : mt5SyncState.tone === "warn" ? "warning" : "positive";
  const riskTradeStatus = prefsDraft.riskGuidanceEnabled ? mt5SyncState.label : "Desactivado";
  const drawdownStatus = prefsDraft.alertDrawdown ? mt5SyncState.label : "Desactivado";
  const volumeStatus = prefsDraft.maxVolumeEnabled ? mt5SyncState.label : "Desactivado";
  const summaryCardMarkup = `
    <div class="risk-symbol-summary">
      <div class="risk-symbol-summary-count">
        <strong>${selectedSymbols.length}</strong>
        <span>símbolos activos</span>
      </div>
      <div class="risk-symbol-summary-pills">
        ${summaryPills.map((symbol) => {
          const meta = symbolUniverseMap.get(symbol) || { cat: "Custom" };
          return `<span class="risk-symbol-summary-pill risk-symbol-summary-pill--${symbolCategoryTone(meta.cat)}">${symbol}</span>`;
        }).join("")}
        ${summaryOverflow ? `<span class="risk-symbol-summary-pill risk-symbol-summary-pill--more">+${summaryOverflow} más</span>` : ""}
      </div>
    </div>
  `;
  const allSessionsSelected = selectedSessions.length === sessionOptions.length;
  const sessionsPartial = selectedSessions.length > 0 && !allSessionsSelected;
  const sessionSummaryMarkup = `
    <div class="risk-session-summary">
      <div class="risk-session-summary-count">
        <strong>${selectedSessions.length}</strong>
        <span>sesiones activas</span>
      </div>
      <div class="risk-session-summary-dots" aria-hidden="true">
        ${sessionOptions.map((session) => `
          <span class="risk-session-summary-dot ${selectedSessions.includes(session) ? "active" : ""}"></span>
        `).join("")}
      </div>
    </div>
  `;
  const mt5SyncState = root.__riskPrefsStatus === "error"
    ? { label: "Error", tone: "danger", detail: "No se pudo aplicar la política. Reintenta la sincronización." }
    : root.__riskPrefsStatus === "saving"
      ? { label: "Sincronizando", tone: "warn", detail: "Aplicando cambios de la política al backend." }
      : root.__riskPrefsStatus === "pending"
        ? { label: "Pendiente", tone: "warn", detail: "Hay cambios sin guardar antes de enviar a MT5." }
        : account.connection?.state === "connected"
          ? { label: "Aplicado en MT5", tone: "ok", detail: `Última sincronización ${formatDateTime(account.connection.lastSync)}` }
          : { label: "Pendiente de MT5", tone: "warn", detail: "La política está guardada en panel pero aún no confirma MT5." };
  const riskAlerts = computeRiskAlerts(model, account);
  const riskGuidance = computeRecommendedRiskFromModel(model, account);
  const equityPeak = Math.max(account.balance || 0, ...((model.equityCurve || []).map((point) => Number(point.value || 0))));
  const currentDrawdownAmount = Math.max(0, equityPeak - Number(account.equity || 0));
  const currentDrawdownPct = equityPeak ? (currentDrawdownAmount / equityPeak) * 100 : 0;
  const dailyDrawdownPct = account.balance ? (Math.abs(Math.min(0, risk.dailyLossUsd || 0)) / account.balance) * 100 : 0;
  const exposureOpen = model.positions.reduce((sum, item) => sum + Math.abs(item.pnl || 0), 0);
  const currentLossStreak = (() => {
    let streak = 0;
    for (let index = model.trades.length - 1; index >= 0; index -= 1) {
      const trade = model.trades[index];
      if ((trade.pnl || 0) < 0) {
        streak += 1;
        continue;
      }
      break;
    }
    return streak;
  })();
  const ladderLevel = currentLadderLevel(ladder, risk);
  const ddHeadroomPct = Math.max(0, (account.maxDrawdownLimit || 10) - currentDrawdownPct);
  const remainingDailyLossPct = Math.max(0, (model.riskProfile.dailyLossLimitPct || 1.2) - dailyDrawdownPct);
  const openTrades = model.positions.length;
  const formatDdConsumed = (value) => `${value > 0 ? "-" : ""}${formatPercent(Math.abs(value))}`;
  const controlState = isBlocked
    ? "Bloqueo recomendado"
    : currentLossStreak >= 4 || currentDrawdownPct >= Math.max((account.maxDrawdownLimit || 10) * 0.7, 5.5)
      ? "Zona de protección"
      : account.compliance.riskStatus === "warning" || riskGuidance.risk_state === "CAUTION" || currentLossStreak >= 2
        ? "Vigilancia activa"
        : "Dentro de límites";
  const controlTone = isBlocked
    ? "danger"
    : controlState === "Zona de protección"
      ? "warn"
      : controlState === "Vigilancia activa"
        ? "warn"
        : "ok";
  const controlHeadline = isBlocked
    ? "BLOQUEO RECOMENDADO — CORTA EL FLUJO"
    : controlState === "Zona de protección"
      ? "RIESGO ACTIVO — MODO PROTECCIÓN"
      : controlState === "Vigilancia activa"
        ? "RIESGO BAJO PRESIÓN — VIGILANCIA ACTIVA"
        : "DENTRO DE LÍMITES — CONTROL OPERATIVO";
  const controlTrigger = currentLossStreak >= 3
    ? `Racha de ${currentLossStreak} pérdidas consecutivas`
    : currentDrawdownPct >= 1
      ? `Drawdown actual en ${formatPercent(currentDrawdownPct)}`
      : account.openPnl < 0
        ? `Exposición abierta en ${formatCurrency(account.openPnl)}`
        : "Sin trigger crítico activo";
  const marginHeadline = ddHeadroomPct <= 0
    ? "Sin margen operativo"
    : ddHeadroomPct <= 0.35
      ? "Margen agotado"
      : formatPercent(ddHeadroomPct);
  const controlContext = isBlocked
    ? "El sistema recomienda detener la operativa hasta recuperar margen y resetear presión."
    : controlState === "Zona de protección"
      ? "La protección debe mandar ahora: baja frecuencia, baja tamaño y prioriza supervivencia."
      : controlState === "Vigilancia activa"
        ? "Todavía puedes operar, pero ya hay un límite o comportamiento demasiado cerca."
        : "La operativa sigue dentro del plan y el margen todavía protege la cuenta.";
  const dominantRuleIndex = risk.stopRules.findIndex((rule) => rule.tone === "red");
  const activeRulesMarkup = risk.stopRules.map((rule, index) => {
    const toneClass = index === dominantRuleIndex
      ? "dominant"
      : rule.tone === "green"
        ? "neutral"
        : "warn";
    const statusLabel = rule.tone === "green" ? "Activa" : rule.tone === "red" ? "Stop" : "Vigila";
    return `
      <article class="risk-rule-card risk-rule-card--${toneClass}">
        <div class="risk-rule-card__head">
          <span>${statusLabel}</span>
        </div>
        <strong>${rule.text}</strong>
      </article>
    `;
  }).join("");
  const coreMetrics = [
    {
      label: "Drawdown actual",
      value: formatDdConsumed(currentDrawdownPct),
      noteLead: formatCurrency(-currentDrawdownAmount),
      noteTail: "desde el último pico",
      noteTone: currentDrawdownAmount > 0 ? "negative" : "positive"
    },
    {
      label: "Drawdown máximo",
      value: formatDdConsumed(model.totals.drawdown.maxPct),
      noteLead: `${Math.round((model.totals.drawdown.maxPct / Math.max(account.maxDrawdownLimit || 10, 0.01)) * 100)}%`,
      noteTail: "del límite total consumido",
      noteTone: "warning"
    },
    {
      label: "Riesgo por trade",
      value: `${risk.currentRiskPct.toFixed(2)}%`,
      noteLead: formatCurrency(risk.currentRiskUsd),
      noteTail: "expuestos por operación",
      noteTone: risk.currentRiskPct >= (model.riskProfile.maxTradeRiskPct || 1) * 0.8 ? "warning" : "positive"
    },
    {
      label: "Exposición actual",
      value: formatCurrency(account.openPnl),
      noteLead: formatCurrency(exposureOpen),
      noteTail: "flotante absoluta",
      noteTone: account.openPnl < 0 ? "negative" : account.openPnl > 0 ? "positive" : "warning"
    }
  ];
  root.innerHTML = `
    <div class="risk-page-stack">
    <div class="tl-page-header">
      <div class="tl-page-title">Gestor de Riesgo</div>
      <div class="tl-page-sub">Controles operativos, configuración de límites y lectura clara del estado de seguridad.</div>
    </div>
    ${riskAlertsMarkup(riskAlerts, 3)}

    <article class="tl-section-card risk-command-center risk-command-center--${controlTone}">
      <div class="risk-command-center__copy">
        <div class="eyebrow">Mando central</div>
        <h3>${controlHeadline}</h3>
        <p>${controlContext}</p>
      </div>
      <div class="risk-command-center__meta">
        <div class="risk-command-center__metric">
          <span>Margen restante</span>
          <strong class="${ddHeadroomPct <= 0 ? "metric-negative" : ddHeadroomPct <= 0.35 ? "metric-warning" : ""}">${marginHeadline}</strong>
          <small>${formatPercent(remainingDailyLossPct)} de margen diario</small>
        </div>
        <div class="risk-command-center__metric">
          <span>Regla que manda</span>
          <strong class="${currentLossStreak >= 3 ? "metric-negative" : controlTone === "warn" ? "metric-warning" : ""}">${controlTrigger}</strong>
          <small>${riskGuidance.blocked ? riskGuidance.block_reason : riskGuidance.explanation}</small>
        </div>
      </div>
    </article>

    ${isBlocked ? `
      <article class="risk-lock-banner">
        <div class="risk-lock-copy">
          <strong>EA bloqueado por protección de capital</strong>
          <span>${account.compliance.messages[0] || "Se activó el bloqueo automático por incumplimiento de límites."}</span>
        </div>
        ${state.auth?.user?.role === "admin" ? `<div class="risk-lock-meta">Último sync: ${formatDateTime(account.connection.lastSync)}</div>` : ""}
      </article>
    ` : ""}

    <article class="tl-section-card risk-active-rules">
      <div class="tl-section-header">
        <div>
          <div class="tl-section-title">Reglas activas</div>
          <div class="row-sub">El sistema de protección que manda ahora mismo sobre la operativa.</div>
        </div>
      </div>
      <div class="risk-active-rules__grid">
        ${activeRulesMarkup}
      </div>
    </article>

    <div class="risk-core-grid">
      <article class="tl-section-card risk-core-metrics">
        <div class="tl-section-header">
          <div>
            <div class="tl-section-title">Métricas clave</div>
            <div class="row-sub">Solo lo esencial para saber si el riesgo sigue bajo control.</div>
          </div>
        </div>
        <div class="risk-core-metrics__grid">
          ${coreMetrics.map((item) => `
            <article class="tl-kpi-card risk-core-kpi">
              <div class="tl-kpi-label">${item.label}</div>
              <div class="tl-kpi-val">${item.value}</div>
              <div class="row-sub risk-core-kpi__note">
                <span class="risk-core-kpi__note-value risk-core-kpi__note-value--${item.noteTone || "neutral"}">${item.noteLead}</span>
                <span>${item.noteTail}</span>
              </div>
            </article>
          `).join("")}
        </div>
      </article>

      <article class="tl-section-card risk-exposure-card">
        <div class="tl-section-header">
          <div>
            <div class="tl-section-title">Exposición</div>
            <div class="row-sub">Riesgo abierto y presión inmediata del flujo activo.</div>
          </div>
        </div>
        <div class="risk-exposure-list">
          <div class="risk-exposure-row">
            <span>Riesgo abierto</span>
            <strong class="${account.openPnl < 0 ? "metric-negative" : account.openPnl > 0 ? "metric-positive" : ""}">${formatCurrency(account.openPnl)}</strong>
          </div>
          <div class="risk-exposure-row">
            <span>Trades activos</span>
            <strong>${openTrades}</strong>
          </div>
          <div class="risk-exposure-row">
            <span>Presión</span>
            <strong class="${controlTone === "danger" ? "metric-negative" : controlTone === "warn" ? "metric-warning" : "green"}">${controlState}</strong>
          </div>
        </div>
      </article>
    </div>

    <article class="tl-section-card risk-policy-surface">
      <div class="risk-policy-header">
        <div>
          <div class="tl-section-title">Política activa de riesgo</div>
          <div class="row-sub">Única fuente de verdad editable para la cuenta. Esta política es la que terminará gobernando la ejecución en MT5.</div>
        </div>
        <div class="risk-policy-sync risk-policy-sync--${mt5SyncState.tone}">
          <span>${mt5SyncState.label}</span>
          <strong>${mt5SyncState.detail}</strong>
        </div>
      </div>

      <div class="risk-policy-numeric-grid">
        <label class="risk-policy-field">
          <span>Riesgo por trade</span>
          <span class="risk-policy-status risk-policy-status--${prefsDraft.riskGuidanceEnabled ? syncToneClass : "neutral"}">${riskTradeStatus}</span>
          <div class="risk-policy-input-shell">
            <input type="number" step="0.05" min="0" max="5" value="${prefsDraft.defaultRisk}" data-risk-pref-number="defaultRisk">
            <em>%</em>
          </div>
        </label>
        <label class="risk-policy-field">
          <span>Límite daily DD</span>
          <span class="risk-policy-status risk-policy-status--${prefsDraft.alertDrawdown ? syncToneClass : "neutral"}">${drawdownStatus}</span>
          <div class="risk-policy-input-shell">
            <input type="number" step="0.1" min="0" value="${prefsDraft.dailyDrawdownLimit}" data-risk-pref-number="dailyDrawdownLimit">
            <em>%</em>
          </div>
        </label>
        <label class="risk-policy-field">
          <span>Límite max DD</span>
          <span class="risk-policy-status risk-policy-status--${prefsDraft.alertDrawdown ? syncToneClass : "neutral"}">${drawdownStatus}</span>
          <div class="risk-policy-input-shell">
            <input type="number" step="0.1" min="0" value="${prefsDraft.maxDrawdownLimit}" data-risk-pref-number="maxDrawdownLimit">
            <em>%</em>
          </div>
        </label>
      </div>

      <div class="risk-policy-editors">
        <article class="risk-policy-card">
          <div class="risk-policy-card__head">
            <div>
              <div class="risk-config-title">Control de volumen</div>
              <div class="risk-config-meta">Lote máximo autorizado por operación.</div>
            </div>
            <label class="risk-config-toggle" aria-label="Control de volumen">
              <input type="checkbox" data-risk-pref-bool="maxVolumeEnabled" ${prefsDraft.maxVolumeEnabled ? "checked" : ""}>
              <span class="risk-config-toggle-ui"></span>
            </label>
          </div>
          <label class="risk-policy-field risk-policy-field--compact">
            <span>Lote máximo</span>
            <span class="risk-policy-status risk-policy-status--${prefsDraft.maxVolumeEnabled ? syncToneClass : "neutral"}">${volumeStatus}</span>
            <div class="risk-policy-input-shell">
              <input type="number" step="0.01" min="0" value="${prefsDraft.maxVolume || String(model.riskProfile.maxVolume || 1.5)}" data-risk-pref-text="maxVolume" ${prefsDraft.maxVolumeEnabled ? "" : "disabled"}>
              <em>lot</em>
            </div>
          </label>
        </article>

        <article class="risk-policy-card">
          <div class="risk-policy-card__head">
            <div>
              <div class="risk-config-title">Horarios permitidos</div>
              <div class="risk-config-meta">Sesiones que puede usar la cuenta para ejecutar.</div>
            </div>
            <label class="risk-config-toggle" aria-label="Horarios permitidos">
              <input type="checkbox" data-risk-pref-bool="allowedSessionsEnabled" ${prefsDraft.allowedSessionsEnabled ? "checked" : ""}>
              <span class="risk-config-toggle-ui"></span>
            </label>
          </div>
          ${sessionSummaryMarkup}
          <div class="risk-select ${riskUi.openMenu === "sessions" ? "open" : ""}">
            <button class="risk-select-trigger risk-select-trigger--policy" type="button" data-risk-menu-trigger="sessions" aria-expanded="${riskUi.openMenu === "sessions" ? "true" : "false"}" ${prefsDraft.allowedSessionsEnabled ? "" : "disabled"}>
              <span>${selectedSessionsLabel}</span>
              <strong>${selectedSessions.length}/3</strong>
            </button>
            <div class="risk-select-menu risk-select-menu--policy risk-select-menu--sessions">
              <div class="risk-session-group">
                <button class="risk-session-row risk-session-row--all first ${sessionsPartial ? "partial" : ""} ${allSessionsSelected ? "checked" : ""}" type="button" data-risk-sessions-all ${prefsDraft.allowedSessionsEnabled ? "" : "disabled"}>
                  <span class="risk-session-stack">
                    <span class="risk-session-name">Seleccionar todas</span>
                    <span class="risk-session-utc">${selectedSessions.length}/3 activas</span>
                  </span>
                  <span class="risk-session-switch ${allSessionsSelected ? "on" : ""} ${sessionsPartial ? "partial" : ""}" aria-hidden="true"><i></i></span>
                </button>
                ${sessionOptions.map((session, index) => `
                  <button class="risk-session-row ${index === sessionOptions.length - 1 ? "last" : ""} ${selectedSessions.includes(session) ? "checked" : ""}" type="button" data-risk-session-option="${session}" ${prefsDraft.allowedSessionsEnabled ? "" : "disabled"}>
                    <span class="risk-session-stack">
                      <span class="risk-session-name">${session}</span>
                      <span class="risk-session-utc">${sessionUtcLabel(session)}</span>
                    </span>
                    <span class="risk-session-switch ${selectedSessions.includes(session) ? "on" : ""}" aria-hidden="true"><i></i></span>
                  </button>
                `).join("")}
              </div>
            </div>
          </div>
        </article>

        <article class="risk-policy-card">
          <div class="risk-policy-card__head">
            <div>
              <div class="risk-config-title">Bloqueo automático</div>
              <div class="risk-config-meta">Corta la operativa cuando la política detecta incumplimiento crítico.</div>
            </div>
            <label class="risk-config-toggle" aria-label="Bloqueo automático">
              <input type="checkbox" data-risk-pref-bool="autoBlockOptIn" ${prefsDraft.autoBlockOptIn ? "checked" : ""}>
              <span class="risk-config-toggle-ui"></span>
            </label>
          </div>
          <div class="risk-policy-confirmation">
            <strong>${prefsDraft.autoBlockOptIn ? "Protección activa" : "Protección desactivada"}</strong>
            <span>${prefsDraft.autoBlockOptIn ? "La cuenta se bloqueará cuando una regla crítica se dispare." : "Sin autobloqueo: la disciplina dependerá de supervisión manual."}</span>
          </div>
        </article>

        <article class="risk-policy-card risk-policy-card--full">
          <div class="risk-policy-card__head">
            <div>
              <div class="risk-config-title">Símbolos permitidos</div>
              <div class="risk-config-meta">Whitelist operativa que define el universo autorizado para MT5.</div>
            </div>
            <label class="risk-config-toggle" aria-label="Símbolos permitidos">
              <input type="checkbox" data-risk-pref-bool="allowedSymbolsEnabled" ${prefsDraft.allowedSymbolsEnabled ? "checked" : ""}>
              <span class="risk-config-toggle-ui"></span>
            </label>
          </div>
          ${summaryCardMarkup}
          <div class="risk-select ${riskUi.openMenu === "symbols" ? "open" : ""}">
            <button class="risk-select-trigger risk-select-trigger--symbols risk-select-trigger--policy" type="button" data-risk-menu-trigger="symbols" aria-expanded="${riskUi.openMenu === "symbols" ? "true" : "false"}" ${prefsDraft.allowedSymbolsEnabled ? "" : "disabled"}>
              <span class="risk-select-trigger__tags">
                ${selectedSymbolTagsMarkup}
                ${selectedSymbolOverflowMarkup}
              </span>
            </button>
            <div class="risk-select-menu risk-select-menu--symbols risk-select-menu--policy">
              <label class="risk-select-search">
                <input type="search" placeholder="Buscar símbolo" data-risk-symbol-search ${prefsDraft.allowedSymbolsEnabled ? "" : "disabled"}>
              </label>
              <div class="risk-symbol-editor-topline">
                <div class="risk-symbol-section-label">Whitelist activa</div>
                <div class="risk-symbol-editor-chips">
                  ${selectedSymbolEditorChips}
                </div>
              </div>
              ${canCreateCustomSymbol ? `
                <button class="risk-symbol-add-custom" type="button" data-risk-symbol-add="${normalizedQuery}" ${prefsDraft.allowedSymbolsEnabled ? "" : "disabled"}>
                  + Añadir '${normalizedQuery}' como símbolo personalizado
                </button>
              ` : ""}
              ${showSymbolSearchResults ? `
                <div class="risk-select-options risk-select-options--symbols">
                  <div class="risk-symbol-section-label">Resultados</div>
                  <div class="risk-symbol-group">
                    ${availableSymbolItems.length ? availableSymbolItems.map((symbol, index, list) => `
                      <div class="risk-symbol-row ${index === 0 ? "first" : ""} ${index === list.length - 1 ? "last" : ""}" data-risk-symbol-row="${symbol.id}">
                        <button class="risk-symbol-main" type="button" data-risk-symbol-option="${symbol.id}" aria-pressed="false" ${prefsDraft.allowedSymbolsEnabled ? "" : "disabled"}>
                          <div class="ccheck" aria-hidden="true"></div>
                          <span class="risk-symbol-name">${symbol.id}</span>
                          ${categoryPillMarkup(symbol)}
                        </button>
                        <button class="risk-symbol-favorite ${favoriteSymbols.has(symbol.id) ? "active" : ""}" type="button" data-risk-symbol-favorite="${symbol.id}" aria-label="Marcar ${symbol.id} como favorito" ${prefsDraft.allowedSymbolsEnabled ? "" : "disabled"}>★</button>
                      </div>
                    `).join("") : `<div class="risk-symbol-empty">No hay símbolos disponibles con ese filtro.</div>`}
                  </div>
                </div>
              ` : `<div class="risk-editor-empty">Busca un símbolo para añadirlo rápidamente a la whitelist.</div>`}
            </div>
          </div>
        </article>

      </div>

      <div class="risk-policy-footer">
        <div class="risk-limit-note">
          <strong>Fuente de verdad</strong>
          <span>${riskConfigStatusLabel(root.__riskPrefsStatus)}</span>
        </div>
        <div class="risk-limit-actions">
          <button class="btn btn-secondary risk-limit-btn risk-limit-btn--secondary" type="button" data-risk-reset>Reset</button>
          <button class="btn btn-primary risk-limit-btn risk-limit-btn--primary" type="button" data-risk-save>${root.__riskSaving ? "Guardando..." : "Guardar política"}</button>
        </div>
      </div>
    </article>

    <article class="tl-section-card risk-ladder-surface">
      <div class="tl-section-header"><div class="tl-section-title">Escalera de Riesgo Dinámica</div></div>
      ${renderLadderProgress(ladder, ladderLevel)}
      <div class="table-wrap risk-ladder-table">
        <table>
          <thead><tr><th>Nivel</th><th>Riesgo/Trade</th><th>Condición Entrada</th><th>Condición Subida</th><th>Condición Bajada</th><th>Trades a $100k</th><th>Estado</th></tr></thead>
          <tbody>
            ${ladder.map((row) => `
              <tr class="${row.level === ladderLevel ? "risk-ladder-row--current" : ""}">
                <td>${row.level}</td>
                <td>${row.riskPct.toFixed(2)}%</td>
                <td>${row.entryCondition}</td>
                <td>${row.riseCondition}</td>
                <td>${row.fallCondition}</td>
                <td>${row.tradesTo100k}</td>
                <td>${badgeMarkup({ label: row.level === ladderLevel ? "ACTUAL" : row.state, tone: row.level === ladderLevel ? "warn" : row.level === "PROTECT" ? "warn" : row.level === "MAX" ? "info" : "neutral" }, "ui-badge--compact")}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </article>

    </div>
  `;

  root.querySelectorAll("[data-risk-pref-number]").forEach((input) => {
    input.addEventListener("input", () => {
      const inputKey = input.dataset.riskPrefNumber;
      persistRiskPreferencesDraft(root, {
        [inputKey]: input.value
      });
      const note = root.querySelector(".risk-limit-note span");
      if (note) note.textContent = riskConfigStatusLabel(root.__riskPrefsStatus);
    });
  });

  root.querySelectorAll("[data-risk-pref-text]").forEach((input) => {
    input.addEventListener("input", () => {
      const inputKey = input.dataset.riskPrefText;
      persistRiskPreferencesDraft(root, {
        [inputKey]: input.value
      });
      const note = root.querySelector(".risk-limit-note span");
      if (note) note.textContent = riskConfigStatusLabel(root.__riskPrefsStatus);
    });
  });

  root.querySelectorAll("[data-risk-pref-bool]").forEach((input) => {
    input.addEventListener("change", () => {
      persistRiskPreferencesDraft(root, {
        [input.dataset.riskPrefBool]: input.checked
      });
      const ui = ensureRiskUiState(root);
      if (!input.checked && input.dataset.riskPrefBool === "allowedSessionsEnabled" && ui.openMenu === "sessions") {
        ui.openMenu = null;
      }
      if (!input.checked && input.dataset.riskPrefBool === "allowedSymbolsEnabled" && ui.openMenu === "symbols") {
        ui.openMenu = null;
      }
      renderRisk(root, state);
    });
  });

  root.querySelectorAll("[data-risk-menu-trigger]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const ui = ensureRiskUiState(root);
      ui.openMenu = ui.openMenu === button.dataset.riskMenuTrigger ? null : button.dataset.riskMenuTrigger;
      renderRisk(root, state);
    });
  });

  root.querySelectorAll("[data-risk-session-option]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const next = new Set(selectedSessions);
      const session = button.dataset.riskSessionOption;
      if (next.has(session)) next.delete(session);
      else next.add(session);
      persistRiskPreferencesDraft(root, { allowedSessions: serializeTokenList([...next]) });
      ensureRiskUiState(root).openMenu = "sessions";
      renderRisk(root, state);
    });
  });

  root.querySelector("[data-risk-sessions-all]")?.addEventListener("click", (event) => {
    event.stopPropagation();
    const next = selectedSessions.length === sessionOptions.length ? [] : sessionOptions;
    persistRiskPreferencesDraft(root, { allowedSessions: serializeTokenList(next) });
    ensureRiskUiState(root).openMenu = "sessions";
    renderRisk(root, state);
  });

  root.querySelectorAll("[data-risk-symbol-option]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const next = new Set(selectedSymbols);
      const symbol = button.dataset.riskSymbolOption;
      if (next.has(symbol)) next.delete(symbol);
      else next.add(symbol);
      persistRiskPreferencesDraft(root, { allowedSymbols: serializeTokenList([...next]) });
      ensureRiskUiState(root).openMenu = "symbols";
      renderRisk(root, state);
    });
  });

  root.querySelectorAll("[data-risk-symbol-favorite]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const nextFavorites = new Set(favoriteSymbols);
      const symbol = button.dataset.riskSymbolFavorite;
      if (nextFavorites.has(symbol)) nextFavorites.delete(symbol);
      else nextFavorites.add(symbol);
      const serializedFavorites = serializeTokenList([...nextFavorites]);
      persistRiskPreferencesDraft(root, { favoriteSymbols: serializedFavorites });
      persistRiskPanelStorage({
        ...readRiskPanelStorage(),
        favoriteSymbols: serializedFavorites
      });
      ensureRiskUiState(root).openMenu = "symbols";
      renderRisk(root, state);
    });
  });

  root.querySelector("[data-risk-symbol-search]")?.addEventListener("input", (event) => {
    ensureRiskUiState(root).symbolQuery = event.target.value;
    ensureRiskUiState(root).openMenu = "symbols";
    rerenderRiskKeepingSymbolSearch(root, state);
  });

  root.querySelectorAll("[data-risk-symbol-remove]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const symbol = button.dataset.riskSymbolRemove;
      const next = new Set(selectedSymbols);
      next.delete(symbol);
      persistRiskPreferencesDraft(root, { allowedSymbols: serializeTokenList([...next]) });
      ensureRiskUiState(root).openMenu = "symbols";
      renderRisk(root, state);
    });
  });

  root.querySelector("[data-risk-symbol-add]")?.addEventListener("click", (event) => {
    event.stopPropagation();
    const symbol = String(event.currentTarget.dataset.riskSymbolAdd || "").toUpperCase().trim();
    if (!symbol) return;
    const nextCustom = new Set(parseTokenList(getRiskPreferencesDraft(root).customSymbols));
    nextCustom.add(symbol);
    const nextSelected = new Set(selectedSymbols);
    nextSelected.add(symbol);
    persistRiskPreferencesDraft(root, {
      customSymbols: serializeTokenList([...nextCustom]),
      allowedSymbols: serializeTokenList([...nextSelected])
    });
    const ui = ensureRiskUiState(root);
    ui.symbolQuery = "";
    ui.openMenu = "symbols";
    renderRisk(root, state);
  });

  root.addEventListener("click", (event) => {
    if (!event.target.closest(".risk-select")) {
      const ui = ensureRiskUiState(root);
      if (ui.openMenu) {
        ui.openMenu = null;
        renderRisk(root, state);
      }
    }
  }, { once: true });

  root.querySelector("[data-risk-reset]")?.addEventListener("click", () => {
    persistRiskPanelStorage({});
    root.__riskPrefsDraft = null;
    root.__riskPrefsStatus = null;
    renderRisk(root, state);
  });

  root.querySelector("[data-risk-save]")?.addEventListener("click", async () => {
    const nextPreferences = {
      ...readLocalPreferences(),
      ...getRiskPreferencesDraft(root)
    };

    root.__riskSaving = true;
    root.__riskPrefsStatus = "saving";
    renderRisk(root, state);

    if (state.auth?.status === "authenticated" && state.auth?.user?.id) {
      const profile = selectVisibleUserProfile(state);
      const remoteSave = await saveSupabaseUserConfig({
        auth: state.auth,
        profile: {
          name: profile.name,
          email: profile.email,
          avatar: profile.avatar,
          initials: profile.initials,
          discord: profile.discord,
          defaultAccount: profile.defaultAccount || state.currentAccount
        },
        preferences: nextPreferences
      });

      if (!remoteSave.ok) {
        root.__riskSaving = false;
        root.__riskPrefsStatus = "error";
        renderRisk(root, state);
        return;
      }
    }

    persistLocalPreferences(nextPreferences);
    persistRiskPanelStorage({
      allowedSessionsEnabled: getRiskPreferencesDraft(root).allowedSessionsEnabled,
      maxVolumeEnabled: getRiskPreferencesDraft(root).maxVolumeEnabled,
      allowedSymbolsEnabled: getRiskPreferencesDraft(root).allowedSymbolsEnabled,
      allowedSessions: getRiskPreferencesDraft(root).allowedSessions,
      maxVolume: getRiskPreferencesDraft(root).maxVolume,
      allowedSymbols: getRiskPreferencesDraft(root).allowedSymbols,
      favoriteSymbols: getRiskPreferencesDraft(root).favoriteSymbols,
      customSymbols: getRiskPreferencesDraft(root).customSymbols
    });
    root.__riskSaving = false;
    root.__riskPrefsStatus = "saved";
    renderRisk(root, state);
  });
}
