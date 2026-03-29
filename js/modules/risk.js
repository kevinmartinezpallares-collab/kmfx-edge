import { formatCurrency, formatDateTime, formatPercent, selectCurrentAccount, selectCurrentModel } from "./utils.js";
import { badgeMarkup, getRiskStatusMeta } from "./status-badges.js";
import { computeRiskAlerts, riskAlertsMarkup } from "./risk-alerts.js";
import { computeRecommendedRiskFromModel } from "./risk-engine.js";
import { chartCanvas, lineAreaSpec, mountCharts } from "./chart-system.js";
import { selectVisibleUserProfile } from "./auth-session.js";
import { persistLocalPreferences, readLocalPreferences, saveSupabaseUserConfig } from "./supabase-user-config.js";

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

function renderStepperInput({
  label,
  key,
  value,
  step = "0.1",
  min = "0",
  max = "",
  dataset = "number",
  disabled = false
}) {
  const maxAttr = max !== "" ? ` max="${max}"` : "";
  const disabledAttr = disabled ? " disabled" : "";
  const dataAttr = dataset === "text"
    ? `data-risk-pref-text="${key}"`
    : `data-risk-pref-number="${key}"`;
  const stepperAttr = dataset === "text"
    ? `data-risk-step-text="${key}"`
    : `data-risk-step="${key}"`;

  return `
    <label class="risk-config-control">
      <span>${label}</span>
      <div class="risk-stepper">
        <button class="risk-stepper-btn" type="button" ${stepperAttr} data-step-dir="-1" data-step-value="${step}" aria-label="Reducir ${label}"${disabledAttr}>−</button>
        <input type="number" step="${step}" min="${min}"${maxAttr} value="${value}" ${dataAttr}${disabledAttr}>
        <button class="risk-stepper-btn" type="button" ${stepperAttr} data-step-dir="1" data-step-value="${step}" aria-label="Aumentar ${label}"${disabledAttr}>+</button>
      </div>
    </label>
  `;
}

function riskConfigPreviewMap(inputKey = "") {
  const map = {
    dailyDrawdownLimit: "drawdown",
    maxDrawdownLimit: "drawdown",
    defaultRisk: "risk",
    maxVolume: "volume"
  };
  return map[inputKey] || "";
}

function getRiskConfigPreviewValue(root, previewKey) {
  const draft = getRiskPreferencesDraft(root);
  if (previewKey === "drawdown") {
    return `${Number(draft.dailyDrawdownLimit || 0).toFixed(1)}% · ${Number(draft.maxDrawdownLimit || 0).toFixed(1)}%`;
  }
  if (previewKey === "risk") {
    return `${Number(draft.defaultRisk || 0).toFixed(2)}%`;
  }
  if (previewKey === "volume") {
    return draft.maxVolume || "0";
  }
  return "";
}

function syncRiskConfigPreview(root, previewKey) {
  if (!previewKey) return;
  const valueNode = root.querySelector(`[data-risk-config-value="${previewKey}"]`);
  if (!valueNode) return;
  valueNode.textContent = getRiskConfigPreviewValue(root, previewKey);
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

function focusCardControl(card) {
  const control = card?.querySelector("input, textarea, [data-risk-menu-trigger]");
  control?.focus();
}

function polar(cx, cy, radius, deg) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return [cx + radius * Math.cos(rad), cy + radius * Math.sin(rad)];
}

function arcPath(cx, cy, radius, startDeg, endDeg) {
  const [sx, sy] = polar(cx, cy, radius, startDeg);
  const [ex, ey] = polar(cx, cy, radius, endDeg);
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${sx} ${sy} A ${radius} ${radius} 0 ${largeArc} 1 ${ex} ${ey}`;
}

function securitySegments({ account, model, risk, score }) {
  const ddHeadroom = Math.max(0, Math.min(100, 100 - ((model.totals.drawdown.maxPct / Math.max(account.maxDrawdownLimit || 10, 0.01)) * 100)));
  const riskDiscipline = Math.max(0, Math.min(100, 100 - ((risk.currentRiskPct / Math.max(model.riskProfile.maxTradeRiskPct || 1, 0.01)) * 100) * 0.45));
  const exposureControl = Math.max(0, Math.min(100, 100 - ((Math.abs(model.account.openPnl) / 1500) * 100)));
  const complianceState = account.compliance.riskStatus === "violation" ? 14 : account.compliance.riskStatus === "warning" ? 46 : 82;

  return [
    { label: "Drawdown", value: Math.round(ddHeadroom), tone: "blue" },
    { label: "Riesgo", value: Math.round(riskDiscipline), tone: "violet" },
    { label: "Exposición", value: Math.round(exposureControl), tone: "green" },
    { label: "Cumplimiento", value: Math.round((complianceState + score) / 2), tone: account.compliance.riskStatus === "violation" ? "red" : "gold" }
  ];
}

function renderSecurityArc(segments, score) {
  const radius = 84;
  const cx = 120;
  const cy = 128;
  const gapDeg = 7;
  const totalDeg = 180;
  const totalValue = segments.reduce((sum, segment) => sum + segment.value, 0) || 1;
  const usableDeg = totalDeg - gapDeg * segments.length;
  let currentDeg = -90;

  const paths = segments.map((segment, index) => {
    const sweep = Math.max((segment.value / totalValue) * usableDeg, 12);
    const start = currentDeg + gapDeg / 2;
    const end = start + sweep;
    const arcLen = (sweep / 360) * (2 * Math.PI * radius);
    currentDeg = end;
    return `
      <path
        d="${arcPath(cx, cy, radius, start, end)}"
        class="kmfx-arc-path kmfx-arc-path--${segment.tone}"
        data-risk-arc="${index}"
        stroke-dasharray="${arcLen}"
        stroke-dashoffset="${arcLen}"
        style="animation-delay:${(0.15 + index * 0.18).toFixed(2)}s"
      ></path>
    `;
  }).join("");

  const track = arcPath(cx, cy, radius, -90, 90);

  return `
    <div class="security-arc-widget" data-arc-widget="risk-security-score">
      <div class="security-arc-shell">
        <svg viewBox="0 0 240 162" class="security-arc-svg" aria-hidden="true">
          <path d="${track}" class="kmfx-arc-track"></path>
          ${paths}
          <text x="120" y="106" text-anchor="middle" class="kmfx-arc-total kmfx-arc-total--risk">${Math.round(score)}</text>
          <text x="120" y="126" text-anchor="middle" class="kmfx-arc-subtitle kmfx-arc-subtitle--risk">SCORE</text>
        </svg>
      </div>
      <div class="security-arc-legend">
        ${segments.map((segment) => `
          <div class="security-arc-legend-item">
            <i class="security-arc-dot security-arc-dot--${segment.tone}"></i>
            <span>${segment.label}</span>
            <strong>${segment.value}</strong>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function attachArcInteractions(root) {
  root.querySelectorAll("[data-arc-widget]").forEach((widget) => {
    const paths = [...widget.querySelectorAll(".kmfx-arc-path")];
    paths.forEach((path) => {
      path.addEventListener("mouseenter", () => {
        paths.forEach((item) => {
          if (item !== path) item.style.opacity = "0.25";
        });
        path.style.strokeWidth = "28";
        path.style.filter = "drop-shadow(0 0 10px currentColor)";
      });
      path.addEventListener("mouseleave", () => {
        paths.forEach((item) => {
          item.style.opacity = "";
          item.style.strokeWidth = "";
          item.style.filter = "";
        });
      });
    });
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
  const riskBadge = getRiskStatusMeta(account.compliance);
  const isBlocked = account.compliance.riskStatus === "violation";
  const runtimeTone = isBlocked ? "danger" : account.compliance.riskStatus === "warning" ? "warn" : "ok";
  const securityScore = isBlocked ? 8 : account.compliance.riskStatus === "warning" ? Math.min(risk.securityProgress, 52) : risk.securityProgress;
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
  const securityArc = renderSecurityArc(securitySegments({ account, model, risk, score: securityScore }), securityScore);
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
  const avgLoss = Number(model.totals.avgLoss || 0);
  const ladderLevel = currentLadderLevel(ladder, risk);
  const riskConfigCards = [
    {
      title: "Control de Drawdown",
      description: "Activa avisos y define los límites diario / total.",
      value: `${Number(prefsDraft.dailyDrawdownLimit || 0).toFixed(1)}% · ${Number(prefsDraft.maxDrawdownLimit || 0).toFixed(1)}%`,
      previewKey: "drawdown",
      checked: prefsDraft.alertDrawdown,
      key: "alertDrawdown",
      statusLabel: toggleStatusLabel(prefsDraft.alertDrawdown, "Activo", "Off"),
      controls: `
        <div class="risk-config-edit-grid risk-config-edit-grid--two">
          ${renderStepperInput({ label: "Daily DD", key: "dailyDrawdownLimit", value: prefsDraft.dailyDrawdownLimit, step: "0.1", min: "0" })}
          ${renderStepperInput({ label: "Max DD", key: "maxDrawdownLimit", value: prefsDraft.maxDrawdownLimit, step: "0.1", min: "0" })}
        </div>
      `
    },
    {
      title: "Riesgo por Trade",
      description: "Usa la guía automática con tu riesgo base.",
      value: `${Number(prefsDraft.defaultRisk || 0).toFixed(2)}%`,
      previewKey: "risk",
      checked: prefsDraft.riskGuidanceEnabled,
      key: "riskGuidanceEnabled",
      statusLabel: toggleStatusLabel(prefsDraft.riskGuidanceEnabled, "Activo", "Off"),
      controls: renderStepperInput({ label: "Riesgo máximo", key: "defaultRisk", value: prefsDraft.defaultRisk, step: "0.05", min: "0", max: "5" })
    },
    {
      title: "Horarios Permitidos",
      description: "Ventanas operativas UTC",
      value: selectedSessionsLabel,
      menuOpen: riskUi.openMenu === "sessions",
      checked: prefsDraft.allowedSessionsEnabled,
      key: "allowedSessionsEnabled",
      headBadge: "Editable",
      hideFooterBadge: true,
      controls: `
        ${sessionSummaryMarkup}
        <div class="risk-config-control">
          <span>Sesiones</span>
          <div class="risk-select ${riskUi.openMenu === "sessions" ? "open" : ""}">
            <button class="risk-select-trigger" type="button" data-risk-menu-trigger="sessions" aria-expanded="${riskUi.openMenu === "sessions" ? "true" : "false"}" ${prefsDraft.allowedSessionsEnabled ? "" : "disabled"}>
              <span>${selectedSessionsLabel}</span>
              <strong>${selectedSessions.length}/3</strong>
            </button>
            <div class="risk-select-menu">
              <div class="risk-session-group">
                <button class="risk-session-row risk-session-row--all first ${sessionsPartial ? "partial" : ""} ${allSessionsSelected ? "checked" : ""}" type="button" data-risk-sessions-all ${prefsDraft.allowedSessionsEnabled ? "" : "disabled"}>
                  <span class="ccheck ${allSessionsSelected ? "is-checked" : ""} ${sessionsPartial ? "is-partial" : ""}" aria-hidden="true">
                    ${allSessionsSelected ? iconCheckMarkup() : ""}
                    ${sessionsPartial ? `<span class="ccheck-dash"></span>` : ""}
                  </span>
                  <span class="risk-session-name">Seleccionar todas</span>
                  <span class="risk-session-utc">${selectedSessions.length}/3</span>
                </button>
                ${sessionOptions.map((session, index) => `
                  <button class="risk-session-row ${index === sessionOptions.length - 1 ? "last" : ""} ${selectedSessions.includes(session) ? "checked" : ""}" type="button" data-risk-session-option="${session}" ${prefsDraft.allowedSessionsEnabled ? "" : "disabled"}>
                    <span class="risk-session-dot ${selectedSessions.includes(session) ? "active" : ""}" aria-hidden="true"></span>
                    <span class="ccheck ${selectedSessions.includes(session) ? "is-checked" : ""}" aria-hidden="true">${selectedSessions.includes(session) ? iconCheckMarkup() : ""}</span>
                    <span class="risk-session-name">${session}</span>
                    <span class="risk-session-utc">${sessionUtcLabel(session)}</span>
                  </button>
                `).join("")}
              </div>
            </div>
          </div>
        </div>
      `
    },
    {
      title: "Control de Volumen",
      description: "Lote máximo por trade",
      value: prefsDraft.maxVolume || String(model.riskProfile.maxVolume || 1.5),
      previewKey: "volume",
      checked: prefsDraft.maxVolumeEnabled,
      key: "maxVolumeEnabled",
      statusLabel: toggleStatusLabel(prefsDraft.maxVolumeEnabled, "Activo", "Off"),
      controls: renderStepperInput({ label: "Lote máximo", key: "maxVolume", value: prefsDraft.maxVolume || String(model.riskProfile.maxVolume || 1.5), step: "0.01", min: "0", dataset: "text", disabled: !prefsDraft.maxVolumeEnabled })
    },
    {
      title: "Símbolos Permitidos",
      description: "Universo habilitado",
      value: selectedSymbolsLabel,
      menuOpen: riskUi.openMenu === "symbols",
      checked: prefsDraft.allowedSymbolsEnabled,
      key: "allowedSymbolsEnabled",
      statusLabel: toggleStatusLabel(prefsDraft.allowedSymbolsEnabled, "Activo", "Off"),
      controls: `
        <div class="risk-config-control">
          <span>Símbolos</span>
          <div class="risk-select ${riskUi.openMenu === "symbols" ? "open" : ""}">
            <button class="risk-select-trigger" type="button" data-risk-menu-trigger="symbols" aria-expanded="${riskUi.openMenu === "symbols" ? "true" : "false"}" ${prefsDraft.allowedSymbolsEnabled ? "" : "disabled"}>
              <span>${selectedSymbolsLabel}</span>
              <strong>${selectedSymbols.length}</strong>
            </button>
            <div class="risk-select-menu risk-select-menu--symbols">
              <label class="risk-select-search">
                <input type="search" placeholder="Buscar símbolo" data-risk-symbol-search ${prefsDraft.allowedSymbolsEnabled ? "" : "disabled"}>
              </label>
              ${summaryCardMarkup}
              ${canCreateCustomSymbol ? `
                <button class="risk-symbol-add-custom" type="button" data-risk-symbol-add="${normalizedQuery}" ${prefsDraft.allowedSymbolsEnabled ? "" : "disabled"}>
                  + Añadir '${normalizedQuery}' como símbolo personalizado
                </button>
              ` : ""}
              <div class="risk-select-options risk-select-options--symbols">
                <div class="risk-symbol-section-label">Seleccionados</div>
                <div class="risk-symbol-group">
                  ${selectedSymbolItems.length ? selectedSymbolItems.map((symbol, index, list) => `
                    <div class="risk-symbol-row ${index === 0 ? "first" : ""} ${index === list.length - 1 ? "last" : ""}" data-risk-symbol-row="${symbol.id}">
                      <button class="risk-symbol-main" type="button" data-risk-symbol-option="${symbol.id}" aria-pressed="true" ${prefsDraft.allowedSymbolsEnabled ? "" : "disabled"}>
                        <div class="ccheck is-checked" aria-hidden="true">${iconCheckMarkup()}</div>
                        <span class="risk-symbol-name">${symbol.id}</span>
                        ${categoryPillMarkup(symbol)}
                      </button>
                      <button class="risk-symbol-favorite ${favoriteSymbols.has(symbol.id) ? "active" : ""}" type="button" data-risk-symbol-favorite="${symbol.id}" aria-label="Marcar ${symbol.id} como favorito" ${prefsDraft.allowedSymbolsEnabled ? "" : "disabled"}>★</button>
                    </div>
                  `).join("") : `<div class="risk-symbol-empty">No hay símbolos activos.</div>`}
                </div>
                <div class="risk-symbol-section-label">Disponibles</div>
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
            </div>
          </div>
        </div>
      `,
      hideFooterBadge: true
    },
    {
      title: "Bloqueo Automático",
      description: "Permite bloquear el flujo cuando el riesgo se dispara.",
      value: prefsDraft.autoBlockOptIn ? "ON" : "OFF",
      checked: prefsDraft.autoBlockOptIn,
      key: "autoBlockOptIn",
      statusLabel: toggleStatusLabel(prefsDraft.autoBlockOptIn, "Activo", "Off")
    }
  ];
  const riskStateTone = riskGuidance.risk_state === "LOCKED" || riskGuidance.risk_state === "DANGER"
    ? "error"
    : riskGuidance.risk_state === "CAUTION"
      ? "warn"
      : "ok";
  const riskStatusMessage = riskGuidance.risk_state === "LOCKED"
    ? "Trading blocked"
    : riskGuidance.risk_state === "DANGER"
      ? "Reduce exposure"
      : riskGuidance.risk_state === "CAUTION"
        ? "Reduce exposure"
        : "Trading normal";

  root.innerHTML = `
    <div class="risk-page-stack">
    <div class="tl-page-header">
      <div class="tl-page-title">Gestor de Riesgo</div>
      <div class="tl-page-sub">Controles operativos, configuración de límites y lectura clara del estado de seguridad.</div>
    </div>
    ${riskAlertsMarkup(riskAlerts, 3)}

    <article class="tl-section-card risk-overview-surface">
      <div class="tl-section-header">
        <div>
          <div class="tl-section-title">Resumen de Riesgo</div>
          <div class="row-sub">Drawdown, exposición y presión actual concentrados en un único bloque.</div>
        </div>
      </div>
      <div class="trades-kpi-row risk-current-grid">
        <article class="tl-kpi-card risk-kpi-card">
          <div class="tl-kpi-label">Current Drawdown</div>
          <div class="tl-kpi-val ${currentDrawdownAmount > 0 ? "red" : ""}">${formatCurrency(-currentDrawdownAmount)}</div>
          <div class="row-sub">${formatPercent(currentDrawdownPct)} desde el último pico</div>
        </article>
        <article class="tl-kpi-card risk-kpi-card">
          <div class="tl-kpi-label">Daily Drawdown</div>
          <div class="tl-kpi-val ${risk.dailyLossUsd < 0 ? "red" : ""}">${formatCurrency(risk.dailyLossUsd)}</div>
          <div class="row-sub">${formatPercent(dailyDrawdownPct)} del balance</div>
        </article>
        <article class="tl-kpi-card risk-kpi-card">
          <div class="tl-kpi-label">Max Drawdown</div>
          <div class="tl-kpi-val red">${formatCurrency(-model.totals.drawdown.maxAmount)}</div>
          <div class="row-sub">${formatPercent(model.totals.drawdown.maxPct)} máximo histórico</div>
        </article>
        <article class="tl-kpi-card risk-kpi-card">
          <div class="tl-kpi-label">Risk Pressure</div>
          <div class="tl-kpi-val ${riskStateTone === "error" ? "red" : riskStateTone === "warn" ? "metric-warning" : "green"}">${riskGuidance.risk_state}</div>
          <div class="row-sub">Recomendado ${riskGuidance.recommendedRiskPct.toFixed(2)}%</div>
        </article>
        <article class="tl-kpi-card risk-kpi-card">
          <div class="tl-kpi-label">Risk / Trade</div>
          <div class="tl-kpi-val">${risk.currentRiskPct.toFixed(2)}%</div>
          <div class="row-sub">${formatCurrency(risk.currentRiskUsd)} por operación</div>
        </article>
        <article class="tl-kpi-card risk-kpi-card">
          <div class="tl-kpi-label">Exposure</div>
          <div class="tl-kpi-val ${account.openPnl >= 0 ? "green" : "red"}">${formatCurrency(account.openPnl)}</div>
          <div class="row-sub">${formatCurrency(exposureOpen)} flotante absoluta</div>
        </article>
        <article class="tl-kpi-card risk-kpi-card">
          <div class="tl-kpi-label">Consecutive Losses</div>
          <div class="tl-kpi-val ${currentLossStreak >= 3 ? "red" : ""}">${currentLossStreak}</div>
          <div class="row-sub">Máximo histórico ${model.streaks.bestLoss}</div>
        </article>
        <article class="tl-kpi-card risk-kpi-card">
          <div class="tl-kpi-label">Average Loss</div>
          <div class="tl-kpi-val red">${formatCurrency(-avgLoss)}</div>
          <div class="row-sub">Recovery ${model.totals.ratios.recovery.toFixed(2)}</div>
        </article>
      </div>
      <div class="widget-feature-chart">
        ${chartCanvas("risk-drawdown-curve", 240, "kmfx-chart-shell--feature kmfx-chart-shell--blended-card")}
      </div>
      <div class="risk-overview-meta">
        <span>Límite DD total ${formatPercent(account.maxDrawdownLimit || 0)}</span>
        <span>Límite DD diario ${formatPercent(model.riskProfile.dailyLossLimitPct || 0)}</span>
        <span>Max consecutive losses ${model.streaks.bestLoss}</span>
        <span>Recovery Factor ${model.totals.ratios.recovery.toFixed(2)}</span>
      </div>
    </article>

    <article class="tl-section-card risk-status-widget risk-status-widget--${riskStateTone}">
      <div class="risk-status-top">
        <div>
          <div class="tl-section-title">Risk Status</div>
          <div class="row-sub">Lectura global del motor de riesgo</div>
        </div>
        ${badgeMarkup({ label: riskGuidance.risk_state, tone: riskStateTone })}
      </div>
      <div class="risk-status-grid">
        <div class="risk-status-main">
          <span class="risk-status-label">Recommended Risk</span>
          <strong class="risk-status-value">${riskGuidance.recommendedRiskPct.toFixed(2)}%</strong>
        </div>
        <div class="risk-status-main">
          <span class="risk-status-label">Estado actual</span>
          <strong class="risk-status-message">${riskStatusMessage}</strong>
        </div>
      </div>
      <div class="risk-status-explanation">${riskGuidance.blocked ? riskGuidance.block_reason : riskGuidance.explanation}</div>
    </article>

    <article class="tl-section-card risk-current-surface">
      <div class="tl-section-header"><div class="tl-section-title">Estado Actual</div></div>
      <div class="trades-kpi-row risk-current-grid">
        <article class="tl-kpi-card risk-kpi-card risk-kpi-card--current"><div class="tl-kpi-label">Riesgo Actual</div><div class="tl-kpi-val">${formatCurrency(risk.currentRiskUsd)}</div><div class="row-sub">${risk.currentRiskPct.toFixed(2)}% por operación</div></article>
        <article class="tl-kpi-card risk-kpi-card risk-kpi-card--margin"><div class="tl-kpi-label">Margen de Error</div><div class="tl-kpi-val ${risk.marginTrades <= 2 ? "red" : ""}">${risk.marginTrades}</div><div class="row-sub">Trades hasta DD</div></article>
        <article class="tl-kpi-card risk-kpi-card risk-kpi-card--daily"><div class="tl-kpi-label">Pérdida Hoy</div><div class="tl-kpi-val ${risk.dailyLossUsd < 0 ? "red" : ""}">${formatCurrency(risk.dailyLossUsd)}</div><div class="row-sub">PnL neto del día</div></article>
      </div>
    </article>

    ${isBlocked ? `
      <article class="risk-lock-banner">
        <div class="risk-lock-copy">
          <strong>EA bloqueado por protección de capital</strong>
          <span>${account.compliance.messages[0] || "Se activó el bloqueo automático por incumplimiento de límites."}</span>
        </div>
        <div class="risk-lock-meta">Último sync: ${formatDateTime(account.connection.lastSync)}</div>
      </article>
    ` : ""}

    <div class="risk-security-card risk-security-card--premium">
      <div class="risk-sec-header">
        <span class="risk-sec-title">Estado de Seguridad</span>
        ${badgeMarkup({ label: account.compliance.riskStatus === "ok" ? risk.securityLevel : riskBadge.label, tone: riskBadge.tone })}
      </div>
      <div class="risk-security-layout">
        <div class="risk-security-gauge">
          ${securityArc}
        </div>
        <div class="risk-security-copy">
          <div class="risk-sec-score-line">
            <strong>${Math.round(securityScore)}</strong>
            <span>/ 100</span>
          </div>
          <div class="risk-sec-score-sub">Lectura actual de seguridad operativa</div>
          <div class="risk-sec-bar-track">
            <div class="risk-sec-bar-fill ${runtimeTone}" style="width:${isBlocked ? 96 : risk.securityProgress}%"></div>
          </div>
          <div class="risk-sec-msg">${account.compliance.messages[0] || risk.securityMessage}</div>
        </div>
      </div>
    </div>

    <article class="tl-section-card risk-config-surface">
      <div class="tl-section-header"><div class="tl-section-title">Reglas Configurables</div></div>
      <div class="risk-config-grid">
        ${riskConfigCards.map((rule) => `
          <article class="risk-config-card risk-config-card--editable ${rule.menuOpen ? "risk-config-card--menu-open" : ""} ${rule.checked ? "" : "risk-config-card--off"}" data-risk-config-card="${rule.previewKey || rule.key}">
            <div class="risk-config-card-head">
              <div>
                <div class="risk-config-title">${rule.title}</div>
                <div class="risk-config-meta">${rule.description}</div>
              </div>
              ${rule.headBadge
                ? `<div class="risk-config-state-pill risk-config-state-pill--header">${rule.headBadge}</div>`
                : `
                  <label class="risk-config-toggle" aria-label="${rule.title}">
                    <input type="checkbox" data-risk-pref-bool="${rule.key}" ${rule.checked ? "checked" : ""}>
                    <span class="risk-config-toggle-ui"></span>
                  </label>
                `}
            </div>
            <div class="risk-config-value" data-risk-config-value="${rule.previewKey || rule.key}">${rule.value}</div>
            ${rule.controls || ""}
            ${rule.hideFooterBadge ? "" : `
              <div class="risk-config-footer">
                ${badgeMarkup({ label: rule.statusLabel, tone: rule.checked ? "ok" : "neutral" }, "ui-badge--compact")}
              </div>
            `}
          </article>
        `).join("")}
      </div>
    </article>

    <div class="grid-2 equal risk-split-grid">
      <article class="tl-section-card risk-limits-surface">
        <div class="tl-section-header"><div class="tl-section-title">Configurar Límites</div></div>
        <div class="risk-limit-form">
          <label class="risk-input-field">
            <span>Riesgo por defecto</span>
            <input type="number" step="0.05" min="0" max="5" value="${prefsDraft.defaultRisk}" data-risk-pref-number="defaultRisk">
          </label>
          <label class="risk-input-field">
            <span>Límite Daily DD</span>
            <input type="number" step="0.1" min="0" value="${prefsDraft.dailyDrawdownLimit}" data-risk-pref-number="dailyDrawdownLimit">
          </label>
          <label class="risk-input-field">
            <span>Límite Max DD</span>
            <input type="number" step="0.1" min="0" value="${prefsDraft.maxDrawdownLimit}" data-risk-pref-number="maxDrawdownLimit">
          </label>
        </div>
        <div class="risk-limit-actions">
          <button class="btn btn-secondary" type="button" data-risk-reset>Reset</button>
          <button class="btn btn-primary" type="button" data-risk-save>${root.__riskSaving ? "Guardando..." : "Guardar configuración"}</button>
        </div>
        <div class="risk-limit-note">${riskConfigStatusLabel(root.__riskPrefsStatus)}</div>
      </article>

      <article class="tl-section-card">
        <div class="tl-section-header"><div class="tl-section-title">Reglas Stop Diario</div></div>
        <div class="breakdown-list">
          ${risk.stopRules.map((rule) => `
            <div class="list-row">
              <div><div class="row-title">${rule.text}</div><div class="row-sub">Disciplina operativa KMFX</div></div>
              <div class="row-chip">${rule.tone.toUpperCase()}</div>
              <div class="row-pnl ${rule.tone === "green" ? "metric-positive" : rule.tone === "red" ? "metric-negative" : ""}">${rule.tone === "green" ? "OK" : rule.tone === "red" ? "STOP" : "WATCH"}</div>
            </div>
          `).join("")}
        </div>
      </article>
    </div>

    <article class="tl-section-card risk-ladder-surface">
      <div class="tl-section-header"><div class="tl-section-title">Escalera de Riesgo Dinámica</div></div>
      ${renderLadderProgress(ladder, ladderLevel)}
      <div class="table-wrap risk-ladder-table">
        <table>
          <thead><tr><th>Nivel</th><th>Riesgo/Trade</th><th>Condición Entrada</th><th>Condición Subida</th><th>Condición Bajada</th><th>Trades a $100k</th><th>Estado</th></tr></thead>
          <tbody>
            ${ladder.map((row) => `
              <tr>
                <td>${row.level}</td>
                <td>${row.riskPct.toFixed(2)}%</td>
                <td>${row.entryCondition}</td>
                <td>${row.riseCondition}</td>
                <td>${row.fallCondition}</td>
                <td>${row.tradesTo100k}</td>
                <td>${badgeMarkup({ label: row.state, tone: row.level === "PROTECT" ? "warn" : row.level === "MAX" ? "info" : "neutral" }, "ui-badge--compact")}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </article>

    <div class="grid-2 equal risk-split-grid">
      <article class="tl-section-card">
        <div class="tl-section-header"><div class="tl-section-title">Monitor de Riesgo</div></div>
        <div class="score-bar-row"><span>Límite diario</span><div class="risk-track"><div class="risk-fill" style="width:${(model.riskProfile.dailyLossLimitPct || 1.2) * 50}%;background:var(--gold)"></div></div><strong>${(model.riskProfile.dailyLossLimitPct || 1.2).toFixed(2)}%</strong></div>
        <div class="score-bar-row"><span>Heat semanal</span><div class="risk-track"><div class="risk-fill" style="width:${Math.min(model.totals.drawdown.maxPct * 10, 100)}%;background:var(--red)"></div></div><strong>${formatPercent(model.totals.drawdown.maxPct)}</strong></div>
        <div class="score-bar-row"><span>Exposición abierta</span><div class="risk-track"><div class="risk-fill" style="width:${Math.min((Math.abs(model.account.openPnl) / 1500) * 100, 100)}%;background:var(--accent)"></div></div><strong>${formatCurrency(model.account.openPnl)}</strong></div>
      </article>
      <article class="tl-section-card">
        <div class="tl-section-header"><div class="tl-section-title">Risk Ledger</div></div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Métrica</th><th>Valor</th><th>Comentario</th></tr></thead>
            <tbody>
              ${risk.ledger.map((item) => `
                <tr>
                  <td>${item.metric}</td>
                  <td>${item.format === "currency" ? formatCurrency(item.value) : item.format === "percent" ? formatPercent(item.value) : Number(item.value).toFixed(2)}</td>
                  <td>${item.note}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </article>
    </div>
    </div>
  `;

  root.querySelectorAll("[data-risk-pref-number]").forEach((input) => {
    input.addEventListener("input", () => {
      const inputKey = input.dataset.riskPrefNumber;
      persistRiskPreferencesDraft(root, {
        [inputKey]: input.value
      });
      syncRiskConfigPreview(root, riskConfigPreviewMap(inputKey));
      const note = root.querySelector(".risk-limit-note");
      if (note) note.textContent = riskConfigStatusLabel(root.__riskPrefsStatus);
    });
  });

  root.querySelectorAll("[data-risk-pref-text]").forEach((input) => {
    input.addEventListener("input", () => {
      const inputKey = input.dataset.riskPrefText;
      persistRiskPreferencesDraft(root, {
        [inputKey]: input.value
      });
      syncRiskConfigPreview(root, riskConfigPreviewMap(inputKey));
      const note = root.querySelector(".risk-limit-note");
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

  const stepInputValue = (input, direction, stepValue) => {
    const step = Number(stepValue || input.step || "1");
    const min = input.min !== "" ? Number(input.min) : -Infinity;
    const max = input.max !== "" ? Number(input.max) : Infinity;
    const current = Number(input.value || "0");
    const precision = step.toString().includes(".") ? step.toString().split(".")[1].length : 0;
    const next = Math.min(max, Math.max(min, current + step * direction));
    input.value = String(next.toFixed(precision));
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.focus();
  };

  root.querySelectorAll("[data-risk-step]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.riskStep;
      const input = root.querySelector(`[data-risk-pref-number="${key}"]`);
      if (!input) return;
      stepInputValue(input, Number(button.dataset.stepDir || "1"), button.dataset.stepValue);
    });
  });

  root.querySelectorAll("[data-risk-step-text]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.riskStepText;
      const input = root.querySelector(`[data-risk-pref-text="${key}"]`);
      if (!input) return;
      stepInputValue(input, Number(button.dataset.stepDir || "1"), button.dataset.stepValue);
    });
  });

  root.querySelectorAll(".risk-config-card--editable").forEach((card) => {
    card.addEventListener("click", (event) => {
      if (event.target.closest("input, textarea, label, button, .risk-config-toggle, .risk-config-state-pill, .risk-select-menu")) return;
      focusCardControl(card);
    });
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

  attachArcInteractions(root);
  const axisLine = getComputedStyle(document.documentElement).getPropertyValue("--chart-axis-line").trim() || undefined;
  mountCharts(root, [
    lineAreaSpec("risk-drawdown-curve", model.drawdownCurve, {
      tone: "red",
      showAxisBorder: true,
      axisBorderColor: axisLine,
      axisBorderWidth: 1,
      borderWidth: 2.2,
      pointHoverRadius: 3,
      minimalTooltip: true,
      formatter: (value) => formatPercent(value),
      axisFormatter: (value) => `${Number(value).toFixed(1)}%`,
      fillAlphaStart: 0.12,
      fillAlphaEnd: 0.015,
      glowAlpha: 0.1
    })
  ]);
}
