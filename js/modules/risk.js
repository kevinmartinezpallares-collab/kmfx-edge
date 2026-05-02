import { formatCurrency, formatDateTime, resolveAccountDataAuthority, resolveActiveAccountId, selectCurrentAccount } from "./utils.js?v=build-20260406-213500";
import { badgeMarkup } from "./status-badges.js?v=build-20260406-213500";
import { selectVisibleUserProfile } from "./auth-session.js?v=build-20260406-213500";
import { persistLocalPreferences, readLocalPreferences, saveSupabaseUserConfig } from "./supabase-user-config.js?v=build-20260406-213500";
import { renderAdminTracePanel } from "./admin-mode.js?v=build-20260406-213500";
import { pageHeaderMarkup } from "./ui-primitives.js?v=build-20260406-213500";
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

function riskStatusMeta(snapshot) {
  const panicLock = snapshot?.status?.risk_status === "blocked" || snapshot?.status?.enforcement?.block_new_trades || false;
  const status = snapshot?.status?.risk_status || "unavailable";
  if (panicLock) {
    return {
      tone: "danger",
      eyebrow: "Mando central",
      headline: "Panic lock activo",
      context: "El bloqueo manual sigue activo. No se permiten nuevas órdenes hasta su expiración o liberación explícita."
    };
  }
  if (status === "blocked" || status === "breach") {
    return {
      tone: "danger",
      eyebrow: "Mando central",
      headline: "Riesgo en modo protección",
      context: "La política de riesgo ya está limitando la operativa. La prioridad es preservar capital y disciplina."
    };
  }
  if (status === "warning") {
    return {
      tone: "warn",
      eyebrow: "Mando central",
      headline: "Presión de riesgo en vigilancia",
      context: "La cuenta sigue operable, pero la presión actual exige recortar exposición y evitar ampliar riesgo sin confirmación."
    };
  }
  if (status === "active_monitoring" || status === "ok") {
    return {
      tone: "ok",
      eyebrow: "Mando central",
      headline: "Dentro de límites operativos",
      context: "La cuenta sigue dentro de política. Mantén ejecución limpia y evita añadir fricción innecesaria."
    };
  }
  return {
    tone: "warn",
    eyebrow: "Mando central",
    headline: "Datos de riesgo pendientes",
    context: "Aún no hay datos suficientes para confirmar el estado de protección de esta cuenta."
  };
}

function mt5FieldStateMeta(rawValue = "") {
  const value = String(rawValue || "");
  if (value === "activo_mt5") return { label: "MT5 recibido", tone: "ok" };
  if (value === "pendiente") return { label: "Pendiente", tone: "warn" };
  if (value === "error") return { label: "Error", tone: "danger" };
  if (value === "desactivado") return { label: "Desactivado", tone: "neutral" };
  return { label: "MT5 pendiente", tone: "warn" };
}

function riskSyncStateMeta(liveState, snapshot) {
  if (!snapshot) {
    return { label: "MT5 pendiente", tone: "warn", detail: "Sin confirmación de recepción MT5." };
  }
  if (liveState.status === "error") {
    return { label: "Error", tone: "danger", detail: liveState.lastError || "No se pudo resolver la cuenta activa." };
  }
  if (liveState.status === "stale") {
    return { label: "Sin confirmación reciente", tone: "warn", detail: `Última sincronización ${formatDateTime(liveState.lastSyncAt)}` };
  }
  if (!liveState.connected) {
    return { label: "MT5 pendiente", tone: "warn", detail: `Última sincronización ${formatDateTime(liveState.lastSyncAt)}` };
  }
  return { label: "MT5 recibido", tone: "ok", detail: `Última sincronización ${formatDateTime(liveState.lastSyncAt)}` };
}

function safeNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function formatRiskPct(value, digits = 2) {
  return `${safeNumber(value).toFixed(digits)}%`;
}

function formatRiskMultiple(value) {
  const numeric = safeNumber(value, NaN);
  return Number.isFinite(numeric) ? numeric.toFixed(2) : "—";
}

function clampRiskValue(value, min = 0, max = 100) {
  return Math.min(max, Math.max(min, safeNumber(value, min)));
}

function formatSignedRiskPct(value, digits = 2) {
  const numeric = safeNumber(value, 0);
  if (numeric > 0) return `+${numeric.toFixed(digits)}%`;
  if (numeric < 0) return `${numeric.toFixed(digits)}%`;
  return `${numeric.toFixed(digits)}%`;
}

function resolveProfessionalMetrics(snapshot) {
  const metrics = safeObject(snapshot?.professional_metrics);
  const tailRisk = safeObject(metrics.tail_risk);
  const drawdownPath = safeObject(metrics.drawdown_path);
  const monteCarlo = safeObject(metrics.monte_carlo);
  const inputs = safeObject(metrics.inputs);
  const warnings = Array.isArray(metrics.warnings) ? metrics.warnings.filter(Boolean) : [];
  const sampleSize = safeNumber(monteCarlo.sample_size || inputs.closed_trades_count, 0);
  const hasMetrics = Boolean(snapshot && Object.keys(metrics).length);
  return {
    hasMetrics,
    tailRisk,
    drawdownPath,
    monteCarlo,
    inputs,
    warnings,
    sampleSize
  };
}

function professionalSampleMeta(sampleSize) {
  if (sampleSize >= 100) return { label: "Muestra robusta", tone: "ok", detail: `${sampleSize} trades cerrados` };
  if (sampleSize >= 30) return { label: "Muestra operativa", tone: "ok", detail: `${sampleSize} trades cerrados` };
  if (sampleSize > 0) return { label: "Muestra temprana", tone: "warn", detail: `${sampleSize} trades cerrados` };
  return { label: "Sin muestra", tone: "neutral", detail: "Esperando trades cerrados" };
}

function professionalRiskTone(value, warningAt, dangerAt) {
  const numeric = safeNumber(value, 0);
  if (numeric >= dangerAt) return "danger";
  if (numeric >= warningAt) return "warn";
  return "ok";
}

function professionalReadout(professional) {
  if (!professional.hasMetrics) {
    return {
      title: "Esperando motor profesional",
      body: "Este bloque se activará cuando haya datos suficientes para estimar VaR, CVaR, drawdown y Monte Carlo.",
      tone: "neutral"
    };
  }
  if (professional.sampleSize <= 0) {
    return {
      title: "Aún no hay muestra cerrada",
      body: "Risk Engine puede vigilar límites live, pero VaR y ruina necesitan historial cerrado para tener lectura útil.",
      tone: "warn"
    };
  }
  const ruinProbability = safeNumber(professional.monteCarlo.ruin_probability_pct, 0);
  const cvar95 = safeNumber(professional.tailRisk.var_95?.cvar_amount, 0);
  if (ruinProbability >= 10) {
    return {
      title: "Supervivencia bajo presión",
      body: `Monte Carlo marca ${formatRiskPct(ruinProbability)} de probabilidad de tocar el límite. Revisa sizing antes de escalar exposición.`,
      tone: "danger"
    };
  }
  if (ruinProbability >= 3 || cvar95 > 0) {
    return {
      title: "Riesgo medible, no invisible",
      body: `La cola histórica ya deja una pérdida media esperada de ${formatCurrency(cvar95)} cuando el peor 5% aparece.`,
      tone: "warn"
    };
  }
  return {
    title: "Perfil estable",
    body: "La simulación no detecta amenaza material de ruina con la muestra actual. Mantén la lectura como estimación, no como certeza.",
    tone: "ok"
  };
}

function resolveSimulationScale(values = []) {
  const finiteValues = values
    .map((value) => safeNumber(value, NaN))
    .filter((value) => Number.isFinite(value));
  const baseValues = finiteValues.length ? finiteValues : [0];
  let min = Math.min(...baseValues, 0);
  let max = Math.max(...baseValues, 0);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const padding = Math.max((max - min) * 0.12, 0.5);
  min -= padding;
  max += padding;
  return {
    min,
    max,
    position(value) {
      return clampRiskValue(((safeNumber(value, 0) - min) / (max - min)) * 100);
    }
  };
}

function professionalSimulationModel(professional) {
  if (!professional.hasMetrics || professional.sampleSize <= 0) {
    return { available: false };
  }
  const monteCarlo = professional.monteCarlo;
  const p05 = safeNumber(monteCarlo.p05_return_pct, 0);
  const median = safeNumber(monteCarlo.median_return_pct, 0);
  const p95 = safeNumber(monteCarlo.p95_return_pct, 0);
  const returnScale = resolveSimulationScale([p05, median, p95]);
  const ruinThreshold = Math.max(safeNumber(monteCarlo.ruin_threshold_pct, 20), 0.1);
  const medianDrawdown = safeNumber(monteCarlo.median_max_drawdown_pct, 0);
  const stressDrawdown = safeNumber(monteCarlo.p95_max_drawdown_pct, 0);
  const drawdownScale = Math.max(ruinThreshold, stressDrawdown, medianDrawdown, 1);
  return {
    available: true,
    horizonTrades: safeNumber(monteCarlo.horizon_trades, 0),
    simulations: safeNumber(monteCarlo.simulations, 0),
    zeroPosition: returnScale.position(0),
    returnMarkers: [
      { label: "P05", value: p05, tone: "danger", position: returnScale.position(p05) },
      { label: "Mediana", value: median, tone: median >= 0 ? "ok" : "warn", position: returnScale.position(median) },
      { label: "P95", value: p95, tone: "ok", position: returnScale.position(p95) }
    ],
    stats: [
      { label: "Retorno P05", value: formatSignedRiskPct(p05), tone: p05 < 0 ? "danger" : "ok" },
      { label: "Retorno mediano", value: formatSignedRiskPct(median), tone: median < 0 ? "warn" : "ok" },
      { label: "Retorno P95", value: formatSignedRiskPct(p95), tone: p95 < 0 ? "warn" : "ok" }
    ],
    drawdownRows: [
      {
        label: "DD mediano simulado",
        value: formatRiskPct(medianDrawdown),
        width: clampRiskValue((medianDrawdown / drawdownScale) * 100),
        tone: medianDrawdown >= ruinThreshold * 0.7 ? "warn" : "ok"
      },
      {
        label: "DD estrés P95",
        value: formatRiskPct(stressDrawdown),
        width: clampRiskValue((stressDrawdown / drawdownScale) * 100),
        tone: stressDrawdown >= ruinThreshold ? "danger" : stressDrawdown >= ruinThreshold * 0.7 ? "warn" : "ok"
      },
      {
        label: "Límite de ruina",
        value: `-${formatRiskPct(ruinThreshold, 1)}`,
        width: clampRiskValue((ruinThreshold / drawdownScale) * 100),
        tone: "limit"
      }
    ]
  };
}

function professionalActionAlerts(professional, snapshot) {
  if (!professional.hasMetrics) {
    return [{
      tone: "warn",
      title: "Esperar datos profesionales",
      detail: "Aún faltan métricas avanzadas para esta cuenta."
    }];
  }
  if (professional.sampleSize <= 0) {
    return [{
      tone: "warn",
      title: "Cerrar muestra antes de estimar",
      detail: "VaR, CVaR y Monte Carlo necesitan historial de operaciones cerradas."
    }];
  }

  const alerts = [];
  const monteCarlo = professional.monteCarlo;
  const drawdownPath = professional.drawdownPath;
  const var95 = safeObject(professional.tailRisk.var_95);
  const var99 = safeObject(professional.tailRisk.var_99);
  const ruinProbability = safeNumber(monteCarlo.ruin_probability_pct, 0);
  const ruinThreshold = Math.max(safeNumber(monteCarlo.ruin_threshold_pct, 20), 0.1);
  const stressDrawdown = safeNumber(monteCarlo.p95_max_drawdown_pct, 0);
  const recoveryFactor = safeNumber(drawdownPath.recovery_factor, NaN);
  const openRiskPct = safeNumber(snapshot?.summary?.total_open_risk_pct, 0);
  const maxRiskPerTradePct = safeNumber(snapshot?.summary?.max_risk_per_trade_pct, 0);

  if (professional.sampleSize < 30) {
    alerts.push({
      tone: "warn",
      title: "Validar por estrategia",
      detail: "Muestra menor a 30 trades: evita subir sizing hasta separar setups y sesiones."
    });
  }
  if (ruinProbability >= 10) {
    alerts.push({
      tone: "danger",
      title: "Reducir sizing",
      detail: `Monte Carlo marca ${formatRiskPct(ruinProbability)} de probabilidad de tocar ruina.`
    });
  } else if (ruinProbability >= 3) {
    alerts.push({
      tone: "warn",
      title: "No escalar riesgo",
      detail: `La probabilidad de ruina ya es visible: ${formatRiskPct(ruinProbability)}.`
    });
  }
  if (stressDrawdown >= ruinThreshold) {
    alerts.push({
      tone: "danger",
      title: "Estrés toca límite",
      detail: `El DD P95 simulado (${formatRiskPct(stressDrawdown)}) alcanza el límite -${formatRiskPct(ruinThreshold, 1)}.`
    });
  } else if (stressDrawdown >= ruinThreshold * 0.7) {
    alerts.push({
      tone: "warn",
      title: "DD cerca de límite",
      detail: `El DD P95 simulado consume más del 70% del límite de ruina.`
    });
  }
  if (safeNumber(var99.var_amount, 0) > safeNumber(var95.var_amount, 0) * 1.6 && safeNumber(var95.var_amount, 0) > 0) {
    alerts.push({
      tone: "warn",
      title: "Cola asimétrica",
      detail: `VaR 99 supera con claridad a VaR 95. Revisa outliers y stops reales.`
    });
  }
  if (Number.isFinite(recoveryFactor) && recoveryFactor < 1 && safeNumber(drawdownPath.max_drawdown_pct, 0) > 0) {
    alerts.push({
      tone: "warn",
      title: "Recovery débil",
      detail: "El beneficio neto aún no compensa el drawdown máximo observado."
    });
  }
  if (openRiskPct > 0 && maxRiskPerTradePct > 0 && openRiskPct >= maxRiskPerTradePct * 1.5) {
    alerts.push({
      tone: "warn",
      title: "Heat por encima del trade base",
      detail: `Riesgo abierto ${formatRiskPct(openRiskPct)} frente a ${formatRiskPct(maxRiskPerTradePct)} por trade.`
    });
  }

  if (!alerts.length) {
    alerts.push({
      tone: "ok",
      title: "Mantener sizing base",
      detail: "La simulación no pide recorte inmediato; sigue validando por muestra y disciplina."
    });
  }
  return alerts.slice(0, 4);
}

function renderRiskStateCard(kind, title, body, detail = "") {
  return `
    <article class="tl-section-card risk-data-state risk-data-state--${kind}">
      <div class="risk-data-state__eyebrow">Risk Engine</div>
      <strong>${title}</strong>
      <p>${body}</p>
      ${detail ? `<small>${detail}</small>` : ""}
    </article>
  `;
}

function renderRiskEmptyState({ account = {}, lastSyncAt = null } = {}) {
  const source = account?.login
    ? `Cuenta activa ${account.login} · MT5 pendiente`
    : "Cuenta activa · MT5 pendiente";
  return `
    <section class="risk-empty-state">
      <article class="tl-section-card risk-empty-state__primary">
        <span>Estado de protección</span>
        <strong>Esperando sincronización</strong>
        <p>Aún no hay datos suficientes para calcular límites, exposición y margen de riesgo.</p>
        <div class="risk-empty-state__meta">
          <span>${source}</span>
          ${lastSyncAt ? `<span>Última sincronización ${formatDateTime(lastSyncAt)}</span>` : `<span>La protección se actualizará cuando MT5 envíe el próximo estado.</span>`}
        </div>
        <a class="risk-empty-state__action" href="/cuentas">Ir a Cuentas</a>
      </article>
    </section>
  `;
}

function syncDraftFromSnapshot(root, snapshot) {
  if (!snapshot?.policy) return;
  if (root.__riskPrefsStatus === "pending" || root.__riskPrefsStatus === "saving") return;
  const currentDraft = getRiskPreferencesDraft(root);
  root.__riskPrefsDraft = {
    ...currentDraft,
    defaultRisk: String(snapshot.policy.risk_per_trade_pct ?? currentDraft.defaultRisk),
    dailyDrawdownLimit: String(snapshot.policy.daily_dd_limit_pct ?? currentDraft.dailyDrawdownLimit),
    maxDrawdownLimit: String(snapshot.policy.max_dd_limit_pct ?? currentDraft.maxDrawdownLimit),
  };
}

export function renderRisk(root, state) {
  const activeAccountId = resolveActiveAccountId(state);
  const account = selectCurrentAccount(state);
  if (!account) {
    console.log("[KMFX][VIEW]", {
      view: "risk",
      activeAccountId,
      hasAccount: false,
      reason: "no_active_account",
    });
    root.innerHTML = renderRiskStateCard("warning", "Sin cuenta activa", "No hay una cuenta real activa para renderizar Riesgo.");
    return;
  }

  const dashboardPayload = account.dashboardPayload && typeof account.dashboardPayload === "object" ? account.dashboardPayload : {};
  const authority = resolveAccountDataAuthority(account);
  const accountRiskSnapshot = account.riskSnapshot && typeof account.riskSnapshot === "object" ? account.riskSnapshot : null;
  const liveSnapshot = dashboardPayload.riskSnapshot && typeof dashboardPayload.riskSnapshot === "object" ? dashboardPayload.riskSnapshot : accountRiskSnapshot;
  const lastSyncAt = account.connection?.lastSync || account.dashboardPayload?.timestamp || null;
  const lastSyncMs = lastSyncAt ? new Date(lastSyncAt).getTime() : 0;
  const isStale = Number.isFinite(lastSyncMs) ? Date.now() - lastSyncMs > 30000 : false;
  const liveState = {
    status: !liveSnapshot ? "empty" : isStale ? "stale" : "ready",
    snapshot: liveSnapshot,
    lastError: "",
    lastSyncAt,
    connected: Boolean(account.connection?.connected),
  };
  console.log("[KMFX][VIEW]", {
    view: "risk",
    activeAccountId,
    hasAccount: true,
    hasPayload: Boolean(account.dashboardPayload),
    hasRiskSnapshot: Boolean(liveSnapshot),
    liveState: liveState.status,
    lastSyncAt,
  });
  console.info("[KMFX][RISK_AUTHORITY]", {
    account_id: account?.id || "",
    login: account?.login || "",
    broker: account?.broker || "",
    payloadSource: authority.payloadSource,
    tradeCount: authority.tradeCount,
    historyPoints: authority.historyPoints,
    hasRiskSnapshot: authority.hasRiskSnapshot,
    firstTradeLabel: authority.firstTradeLabel,
    lastTradeLabel: authority.lastTradeLabel,
    sourceUsed: authority.sourceUsed,
  });
  syncDraftFromSnapshot(root, liveSnapshot);

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
  const symbolUniverse = [...symbolUniverseMap.values()];
  const selectedSessions = parseTokenList(
    prefsDraft.__hasAllowedSessions
      ? prefsDraft.allowedSessions
      : (liveSnapshot?.policy?.allowed_sessions || ["London", "New York"]).join(" · ")
  );
  const selectedSymbols = parseTokenList(
    prefsDraft.__hasAllowedSymbols
      ? prefsDraft.allowedSymbols
      : ((liveSnapshot?.policy?.allowed_symbols?.length ? liveSnapshot.policy.allowed_symbols : symbolUniverse.map((item) => item.id))).join(" · ")
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
  const selectedSymbolEditorTagsMarkup = selectedSymbolItems.length
    ? selectedSymbolItems.map((symbol) => `
      <button class="risk-symbol-editor-tag risk-symbol-editor-tag--${symbolCategoryTone(symbol.cat)}" type="button" data-risk-symbol-remove="${symbol.id}" ${prefsDraft.allowedSymbolsEnabled ? "" : "disabled"}>
        <span>${symbol.id}</span>
        <em aria-hidden="true">×</em>
      </button>
    `).join("")
    : `<div class="risk-symbol-search-empty">No hay símbolos activos en la whitelist.</div>`;
  const symbolSearchResultsMarkup = normalizedQuery
    ? availableSymbolItems.length
      ? availableSymbolItems.map((symbol, index, list) => `
        <div class="risk-symbol-row ${index === 0 ? "first" : ""} ${index === list.length - 1 ? "last" : ""}" data-risk-symbol-row="${symbol.id}">
          <button class="risk-symbol-main" type="button" data-risk-symbol-option="${symbol.id}" aria-pressed="false" ${prefsDraft.allowedSymbolsEnabled ? "" : "disabled"}>
            <span class="risk-symbol-action-pill">Añadir</span>
            <span class="risk-symbol-name">${symbol.id}</span>
            ${categoryPillMarkup(symbol)}
          </button>
          <button class="risk-symbol-favorite ${favoriteSymbols.has(symbol.id) ? "active" : ""}" type="button" data-risk-symbol-favorite="${symbol.id}" aria-label="Marcar ${symbol.id} como favorito" ${prefsDraft.allowedSymbolsEnabled ? "" : "disabled"}>★</button>
        </div>
      `).join("")
      : `<div class="risk-symbol-search-empty">No hay resultados para "${normalizedQuery}".</div>`
    : `<div class="risk-symbol-search-empty">Empieza a escribir para buscar pares y añadirlos a la whitelist.</div>`;
  const allSessionsSelected = selectedSessions.length === sessionOptions.length;
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
  const mt5SyncState = riskSyncStateMeta(liveState, liveSnapshot);
  const defaultRiskMt5State = mt5FieldStateMeta(account.dashboardPayload?.mt5_limit_states?.risk_per_trade);
  const dailyDdMt5State = mt5FieldStateMeta(account.dashboardPayload?.mt5_limit_states?.daily_dd_limit);
  const maxDdMt5State = mt5FieldStateMeta(account.dashboardPayload?.mt5_limit_states?.max_dd_limit);
  const professionalMetrics = resolveProfessionalMetrics(liveSnapshot);
  const professionalSample = professionalSampleMeta(professionalMetrics.sampleSize);
  const professionalDecision = professionalReadout(professionalMetrics);
  const var95 = safeObject(professionalMetrics.tailRisk.var_95);
  const var99 = safeObject(professionalMetrics.tailRisk.var_99);
  const drawdownPath = professionalMetrics.drawdownPath;
  const monteCarlo = professionalMetrics.monteCarlo;
  const riskSimulation = professionalSimulationModel(professionalMetrics);
  const professionalActions = professionalActionAlerts(professionalMetrics, liveSnapshot);
  const ladder = [];
  const ladderLevel = liveSnapshot?.policy?.current_level || "";
  const commandMeta = riskStatusMeta(liveSnapshot);
  const exposureSnapshot = {
    openPositions: Number(liveSnapshot?.summary?.open_positions_count || 0),
    totalOpenRiskPct: Number(liveSnapshot?.summary?.total_open_risk_pct || 0),
    effectiveCorrelatedRisk: 0,
    pressureLabel: liveSnapshot?.status?.risk_status || "",
    pressureTone: liveSnapshot?.status?.severity === "critical" ? "danger" : liveSnapshot?.status?.severity === "warning" ? "warn" : "ok"
  };
  const hasExposureData = Boolean(liveSnapshot && (
    exposureSnapshot.openPositions > 0 ||
    exposureSnapshot.totalOpenRiskPct > 0 ||
    exposureSnapshot.effectiveCorrelatedRisk > 0
  ));
  const remainingDailyLabel = liveSnapshot
    ? (Number(liveSnapshot.summary?.distance_to_daily_dd_limit_pct || 0) <= 0 ? "Sin margen diario" : `${Number(liveSnapshot.summary?.distance_to_daily_dd_limit_pct || 0).toFixed(2)}% de margen diario`)
    : "—";
  const remainingTotalLabel = liveSnapshot
    ? (Number(liveSnapshot.summary?.distance_to_max_dd_limit_pct || 0) <= 0 ? "Sin margen total" : `${Number(liveSnapshot.summary?.distance_to_max_dd_limit_pct || 0).toFixed(2)}% de margen total`)
    : "—";
  const marginHeadline = !liveSnapshot
    ? "—"
    : liveSnapshot?.status?.risk_status === "blocked"
      ? "Operativa congelada"
      : Number(liveSnapshot.summary?.distance_to_max_dd_limit_pct || 0) <= 0
        ? "Sin margen operativo"
        : `${Number(liveSnapshot.summary?.distance_to_max_dd_limit_pct || 0).toFixed(2)}%`;
  const commandRows = liveSnapshot ? [
    {
      label: "Trigger",
      value: liveSnapshot.status?.reason_code || "Sin trigger activo",
      detail: liveSnapshot.status?.risk_status === "active_monitoring" ? "La cuenta sigue dentro de política." : "Este evento disparó el estado actual."
    },
    {
      label: "Bloqueo actual",
      value: liveSnapshot.status?.blocking_rule || "Sin bloqueo operativo",
      detail: liveSnapshot.status?.enforcement?.block_new_trades ? "La cuenta no admite nuevas órdenes." : "Esta regla manda ahora mismo sobre la operativa."
    },
    {
      label: "Acción requerida",
      value: liveSnapshot.status?.action_required || "Sin acción requerida",
      detail: "Acción inmediata derivada del motor de riesgo."
    }
  ] : [];
  const protectionLabel = liveSnapshot ? commandMeta.headline : "Esperando sincronización";
  const protectionCopy = liveSnapshot ? commandMeta.context : "La protección se activará cuando la cuenta envíe el próximo estado.";
  const policySourceLabel = liveSnapshot ? mt5SyncState.label : "MT5 pendiente";
  const policySourceCopy = liveSnapshot ? mt5SyncState.detail : "Sin confirmación de recepción MT5.";
  const activeRules = Array.isArray(account.dashboardPayload?.riskRules) ? account.dashboardPayload.riskRules : [];
  const rulesMarkup = activeRules.length
    ? activeRules.map((rule) => `
      <article class="risk-rule-card risk-rule-card--${rule.isDominant ? "dominant" : rule.tone}">
        <div class="risk-rule-card__head">
          <span>${rule.isDominant ? "Dominante" : rule.tone === "danger" ? "Activa" : rule.tone === "warn" ? "Vigila" : "Control"}</span>
        </div>
        <strong>${rule.title}</strong>
        <div class="risk-rule-card__meta">
          <div class="risk-rule-card__meta-row">
            <span>Condición</span>
            <strong>${rule.condition}</strong>
          </div>
          <div class="risk-rule-card__meta-row">
            <span>Estado actual</span>
            <strong>${rule.state}</strong>
          </div>
          <div class="risk-rule-card__meta-row">
            <span>Impacto operativo</span>
            <strong>${rule.impact}</strong>
          </div>
        </div>
      </article>
    `).join("")
    : `<article class="risk-rule-card risk-rule-card--neutral"><strong>Sin reglas activas</strong><div class="risk-rule-card__meta"><div class="risk-rule-card__meta-row"><span>Estado</span><strong>Esperando sincronización de la cuenta</strong></div></div></article>`;
  const coreMetrics = liveSnapshot ? [
    {
      label: "DD actual",
      value: `${Number(liveSnapshot.summary?.peak_to_equity_drawdown_pct || 0).toFixed(2)}%`,
      noteLead: `${Number(liveSnapshot.summary?.floating_drawdown_pct || 0).toFixed(2)}%`,
      noteTail: "drawdown flotante",
      noteTone: "neutral"
    },
    {
      label: "Daily DD",
      value: `${Number(liveSnapshot.summary?.daily_drawdown_pct || 0).toFixed(2)}%`,
      noteLead: `${Number(liveSnapshot.summary?.distance_to_daily_dd_limit_pct || 0).toFixed(2)}%`,
      noteTail: "margen diario restante",
      noteTone: "neutral"
    },
    {
      label: "Heat",
      value: `${Number(liveSnapshot.summary?.total_open_risk_pct || 0).toFixed(2)}%`,
      noteLead: liveSnapshot.summary?.heat_usage_ratio_pct != null ? `${Number(liveSnapshot.summary?.heat_usage_ratio_pct || 0).toFixed(1)}%` : "—",
      noteTail: "uso del límite heat",
      noteTone: "neutral"
    },
    {
      label: "Risk / trade",
      value: `${Number(liveSnapshot.summary?.max_open_trade_risk_pct || 0).toFixed(2)}%`,
      noteLead: `${Number(liveSnapshot.summary?.max_risk_per_trade_pct || 0).toFixed(2)}%`,
      noteTail: "límite por política",
      noteTone: "neutral"
    }
  ] : [];
  const professionalCards = [
    {
      label: "Risk of Ruin",
      value: professionalMetrics.hasMetrics ? formatRiskPct(monteCarlo.ruin_probability_pct) : "—",
      detail: professionalMetrics.hasMetrics
        ? `${safeNumber(monteCarlo.simulations, 0).toLocaleString("es-ES")} sims · límite -${formatRiskPct(monteCarlo.ruin_threshold_pct, 1)}`
        : "Monte Carlo pendiente",
      tone: professionalMetrics.hasMetrics ? professionalRiskTone(monteCarlo.ruin_probability_pct, 3, 10) : "neutral"
    },
    {
      label: "VaR 95",
      value: professionalMetrics.hasMetrics ? formatCurrency(var95.var_amount || 0) : "—",
      detail: professionalMetrics.hasMetrics ? `CVaR ${formatCurrency(var95.cvar_amount || 0)}` : "Histórico pendiente",
      tone: safeNumber(var95.var_amount, 0) > 0 ? "warn" : professionalMetrics.hasMetrics ? "ok" : "neutral"
    },
    {
      label: "VaR 99",
      value: professionalMetrics.hasMetrics ? formatCurrency(var99.var_amount || 0) : "—",
      detail: professionalMetrics.hasMetrics ? `CVaR ${formatCurrency(var99.cvar_amount || 0)}` : "Tail risk pendiente",
      tone: safeNumber(var99.var_amount, 0) > safeNumber(var95.var_amount, 0) ? "danger" : safeNumber(var99.var_amount, 0) > 0 ? "warn" : professionalMetrics.hasMetrics ? "ok" : "neutral"
    },
    {
      label: "Recovery Factor",
      value: professionalMetrics.hasMetrics ? formatRiskMultiple(drawdownPath.recovery_factor) : "—",
      detail: professionalMetrics.hasMetrics
        ? `Max DD ${formatRiskPct(drawdownPath.max_drawdown_pct)} · ${safeNumber(drawdownPath.max_drawdown_duration_periods, 0)} periodos`
        : "Drawdown path pendiente",
      tone: safeNumber(drawdownPath.recovery_factor, 0) >= 1 ? "ok" : safeNumber(drawdownPath.max_drawdown_pct, 0) > 0 ? "warn" : "neutral"
    }
  ];
  const adminTracePanel = renderAdminTracePanel(state, {
    title: "Diagnóstico de riesgo",
    subtitle: "Lectura técnica de política, frescura y datos operativos.",
    items: [
      { label: "account_id", value: account?.id || activeAccountId || "" },
      { label: "payloadSource", value: authority.payloadSource || "" },
      { label: "sourceUsed", value: authority.sourceUsed || "" },
      { label: "datosRiesgo", value: Boolean(liveSnapshot) },
      { label: "freshness", value: liveState.status },
      { label: "connected", value: liveState.connected },
      { label: "lastSyncAt", value: lastSyncAt || "" },
      { label: "policyStatus", value: liveSnapshot?.policy?.status || liveSnapshot?.status?.risk_status || "" },
    ],
  });
  if (!liveSnapshot) {
    root.innerHTML = `
      <div class="risk-page-stack risk-engine-page">
        ${pageHeaderMarkup({
          title: "Risk Engine",
          description: "Protección de cuenta, límites activos y política de riesgo.",
          className: "tl-page-header risk-engine-page-header",
          titleClassName: "tl-page-title risk-engine-page-title",
          descriptionClassName: "tl-page-sub risk-engine-page-sub",
        })}
        ${adminTracePanel}
        ${renderRiskEmptyState({ account, lastSyncAt })}
      </div>
    `;
    return;
  }
  root.innerHTML = `
    <div class="risk-page-stack risk-engine-page">
    ${pageHeaderMarkup({
      title: "Risk Engine",
      description: "Protección de cuenta, límites activos y política de riesgo.",
      className: "tl-page-header risk-engine-page-header",
      titleClassName: "tl-page-title risk-engine-page-title",
      descriptionClassName: "tl-page-sub risk-engine-page-sub",
    })}
    ${adminTracePanel}
    ${liveState.status === "error" && !liveSnapshot ? renderRiskStateCard("error", "Cuenta activa no disponible", "No se pudo resolver una cuenta activa válida.", liveState.lastError || "") : ""}
    ${liveState.status === "stale" && liveSnapshot ? renderRiskStateCard("warning", "Mostrando último estado conocido", "La cuenta no ha enviado una actualización reciente.", `Última sincronización ${formatDateTime(lastSyncAt)}`) : ""}
    ${liveSnapshot && !account.connection?.connected ? renderRiskStateCard("warning", "MT5 sin sincronización reciente", "La cuenta existe, pero la conexión no está marcada como activa.", "Se conserva la última lectura conocida.") : ""}

    <section class="risk-overview-grid">
      <article class="risk-overview-card risk-overview-card--${commandMeta.tone}">
        <span>Estado de protección</span>
        <strong>${protectionLabel}</strong>
        <p>${protectionCopy}</p>
      </article>
      <article class="risk-overview-card">
        <span>Margen disponible</span>
        <strong class="${Number(liveSnapshot?.summary?.distance_to_max_dd_limit_pct || 0) <= 0 || liveSnapshot?.status?.risk_status === "blocked" ? "metric-negative" : Number(liveSnapshot?.summary?.distance_to_max_dd_limit_pct || 0) <= 1 ? "metric-warning" : ""}">${marginHeadline}</strong>
        <p>${remainingTotalLabel} · ${remainingDailyLabel}</p>
      </article>
      <article class="risk-overview-card risk-overview-card--${mt5SyncState.tone}">
        <span>Estado de política</span>
        <strong>${policySourceLabel}</strong>
        <p>${policySourceCopy}</p>
      </article>
    </section>

    <article class="tl-section-card risk-professional-surface risk-professional-surface--${professionalDecision.tone}">
      <div class="risk-professional-header">
        <div>
          <div class="tl-section-title">Ruin / VaR</div>
          <div class="row-sub">Lectura profesional de cola, supervivencia y recuperación. Estimación basada en trades cerrados.</div>
        </div>
        <div class="risk-professional-sample risk-professional-sample--${professionalSample.tone}">
          <span>${professionalSample.label}</span>
          <strong>${professionalSample.detail}</strong>
        </div>
      </div>
      <div class="risk-professional-grid">
        ${professionalCards.map((item) => `
          <article class="risk-professional-card risk-professional-card--${item.tone}">
            <span>${item.label}</span>
            <strong>${item.value}</strong>
            <small>${item.detail}</small>
          </article>
        `).join("")}
      </div>
      <div class="risk-professional-readout">
        <div>
          <span>Lectura</span>
          <strong>${professionalDecision.title}</strong>
        </div>
        <p>${professionalDecision.body}</p>
      </div>
      <div class="risk-simulation-panel">
        <div class="risk-simulation-panel__head">
          <div>
            <span>Simulación visual</span>
            <strong>${riskSimulation.available ? `${riskSimulation.simulations.toLocaleString("es-ES")} caminos · ${riskSimulation.horizonTrades} trades` : "Monte Carlo pendiente"}</strong>
          </div>
          <small>Distribución estimada, drawdown esperado y probabilidad de tocar límite.</small>
        </div>
        ${riskSimulation.available ? `
          <div class="risk-simulation-return">
            <div class="risk-simulation-return__axis">
              <span>Peor 5%</span>
              <span>Mediana</span>
              <span>Mejor 5%</span>
            </div>
            <div class="risk-simulation-return__track">
              <i class="risk-simulation-return__zero" style="left:${riskSimulation.zeroPosition.toFixed(2)}%"></i>
              ${riskSimulation.returnMarkers.map((marker) => `
                <div class="risk-simulation-marker risk-simulation-marker--${marker.tone}" style="left:${marker.position.toFixed(2)}%" title="${marker.label} ${formatSignedRiskPct(marker.value)}">
                  <i></i>
                </div>
              `).join("")}
            </div>
          </div>
          <div class="risk-simulation-stat-grid">
            ${riskSimulation.stats.map((stat) => `
              <div class="risk-simulation-stat risk-simulation-stat--${stat.tone}">
                <span>${stat.label}</span>
                <strong>${stat.value}</strong>
              </div>
            `).join("")}
          </div>
          <div class="risk-simulation-dd">
            ${riskSimulation.drawdownRows.map((row) => `
              <div class="risk-simulation-dd-row risk-simulation-dd-row--${row.tone}">
                <div>
                  <span>${row.label}</span>
                  <strong>${row.value}</strong>
                </div>
                <em><i style="width:${row.width.toFixed(2)}%"></i></em>
              </div>
            `).join("")}
          </div>
        ` : `
          <div class="risk-simulation-empty">La visualización se activa con retornos cerrados suficientes.</div>
        `}
      </div>
      <div class="risk-professional-actions">
        <div class="risk-professional-actions__head">
          <span>Alertas accionables</span>
          <strong>${professionalActions.length} señales</strong>
        </div>
        <div class="risk-professional-actions__list">
          ${professionalActions.map((alert) => `
            <div class="risk-professional-action risk-professional-action--${alert.tone}">
              <span></span>
              <div>
                <strong>${alert.title}</strong>
                <small>${alert.detail}</small>
              </div>
            </div>
          `).join("")}
        </div>
      </div>
      ${(professionalMetrics.warnings.length || !professionalMetrics.hasMetrics) ? `
        <div class="risk-professional-warnings">
          ${(professionalMetrics.warnings.length ? professionalMetrics.warnings : ["Aún faltan métricas avanzadas para esta cuenta."]).slice(0, 2).map((warning) => `
            <span>${warning}</span>
          `).join("")}
        </div>
      ` : ""}
    </article>

    ${liveSnapshot?.status?.risk_status === "blocked" ? `
      <article class="risk-lock-banner">
        <div class="risk-lock-copy">
          <strong>Panic lock activo</strong>
          <span>La operativa está congelada mientras el enforcement mantenga bloqueo sobre nuevas entradas.</span>
        </div>
        ${state.auth?.user?.role === "admin" ? `<div class="risk-lock-meta">Última lectura: ${formatDateTime(lastSyncAt)}</div>` : ""}
      </article>
    ` : ""}

    <article class="tl-section-card risk-active-rules">
      <div class="tl-section-header">
        <div>
          <div class="tl-section-title">Reglas activas</div>
          <div class="row-sub">Controles de protección recibidos para la cuenta activa.</div>
        </div>
      </div>
      <div class="risk-active-rules__context">${liveSnapshot ? (liveSnapshot.status?.blocking_rule || "Sin bloqueo operativo activo.") : "Esperando sincronización de la cuenta."}</div>
      <div class="risk-active-rules__grid">
        ${rulesMarkup}
      </div>
    </article>

      <div class="risk-core-grid">
      <article class="tl-section-card risk-core-metrics">
        <div class="tl-section-header">
          <div>
            <div class="tl-section-title">Márgenes actuales</div>
            <div class="row-sub">Consumo de límites, presión flotante y margen real disponible.</div>
          </div>
        </div>
        <div class="risk-core-metrics__grid">
          ${(coreMetrics.length ? coreMetrics : [
            { label: "Riesgo", value: "—", noteLead: "Sin datos", noteTail: "esperando sincronización", noteTone: "neutral" }
          ]).map((item) => `
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
        ${hasExposureData ? `<div class="risk-exposure-list">
          <div class="risk-exposure-row">
            <span>Riesgo abierto</span>
            <strong class="${exposureSnapshot.totalOpenRiskPct > 0 ? "metric-warning" : ""}">${liveSnapshot ? `${exposureSnapshot.totalOpenRiskPct.toFixed(2)}%` : "—"}</strong>
          </div>
          <div class="risk-exposure-row">
            <span>Clúster correlacionado</span>
            <strong>${liveSnapshot ? `${exposureSnapshot.effectiveCorrelatedRisk.toFixed(2)}%` : "—"}</strong>
          </div>
          <div class="risk-exposure-row">
            <span>Presión</span>
            <strong class="${exposureSnapshot.pressureTone === "danger" ? "metric-negative" : exposureSnapshot.pressureTone === "warn" ? "metric-warning" : "green"}">${String(exposureSnapshot.pressureLabel || "sin exposición").replaceAll("_", " ")}</strong>
          </div>
        </div>` : `
          <div class="risk-exposure-empty">
            <strong>Sin exposición calculada</strong>
            <p>Se mostrará cuando haya posiciones abiertas o una lectura de riesgo con exposición.</p>
          </div>
        `}
      </article>
    </div>

    <article class="tl-section-card risk-policy-surface">
      <div class="risk-policy-header">
        <div>
          <div class="tl-section-title">Política editable</div>
          <div class="row-sub">Configuración guardada para la cuenta. La aplicación en MT5 depende de backend, launcher y EA.</div>
        </div>
        <div class="risk-policy-sync risk-policy-sync--${mt5SyncState.tone}">
          <span>${mt5SyncState.label}</span>
          <strong>${mt5SyncState.detail}</strong>
        </div>
      </div>

      <div class="risk-policy-numeric-grid">
        <label class="risk-policy-field">
          <div class="risk-policy-field__head">
            <span>Riesgo por trade</span>
            ${defaultRiskMt5State.tone !== "warn" ? `<em class="risk-policy-field__state risk-policy-field__state--${defaultRiskMt5State.tone}">${defaultRiskMt5State.label}</em>` : ""}
          </div>
          <div class="risk-policy-input-shell">
              <input type="number" step="0.05" min="0" max="5" value="${prefsDraft.defaultRisk}" data-risk-pref-number="defaultRisk">
            <em>%</em>
          </div>
        </label>
        <label class="risk-policy-field">
          <div class="risk-policy-field__head">
            <span>Límite daily DD</span>
            ${dailyDdMt5State.tone !== "warn" ? `<em class="risk-policy-field__state risk-policy-field__state--${dailyDdMt5State.tone}">${dailyDdMt5State.label}</em>` : ""}
          </div>
          <div class="risk-policy-input-shell">
            <input type="number" step="0.1" min="0" value="${prefsDraft.dailyDrawdownLimit}" data-risk-pref-number="dailyDrawdownLimit">
            <em>%</em>
          </div>
        </label>
        <label class="risk-policy-field">
          <div class="risk-policy-field__head">
            <span>Límite max DD</span>
            ${maxDdMt5State.tone !== "warn" ? `<em class="risk-policy-field__state risk-policy-field__state--${maxDdMt5State.tone}">${maxDdMt5State.label}</em>` : ""}
          </div>
          <div class="risk-policy-input-shell">
            <input type="number" step="0.1" min="0" value="${prefsDraft.maxDrawdownLimit}" data-risk-pref-number="maxDrawdownLimit">
            <em>%</em>
          </div>
        </label>
      </div>

      <div class="risk-policy-editors">
        <article class="risk-policy-card ${riskUi.openMenu === "sessions" ? "risk-policy-card--menu-open" : ""}">
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
            <div class="risk-policy-input-shell">
              <input type="number" step="0.01" min="0" value="${prefsDraft.maxVolume || String(liveSnapshot?.policy?.max_volume || 1.5)}" data-risk-pref-text="maxVolume" ${prefsDraft.maxVolumeEnabled ? "" : "disabled"}>
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
            </button>
            <div class="risk-select-menu risk-select-menu--policy risk-select-menu--sessions-policy">
              <div class="risk-inline-editor-head">
                <div>
                  <strong>Ventanas operativas</strong>
                  <span>Activa solo las sesiones autorizadas por la política.</span>
                </div>
                <button class="risk-inline-editor-link" type="button" data-risk-sessions-all ${prefsDraft.allowedSessionsEnabled ? "" : "disabled"}>
                  ${allSessionsSelected ? "Quitar todas" : "Seleccionar todas"}
                </button>
              </div>
              <div class="risk-session-group risk-session-group--inline">
                ${sessionOptions.map((session, index) => `
                  <button class="risk-session-row ${index === sessionOptions.length - 1 ? "last" : ""} ${selectedSessions.includes(session) ? "checked" : ""}" type="button" data-risk-session-option="${session}" ${prefsDraft.allowedSessionsEnabled ? "" : "disabled"}>
                    <span class="risk-session-copy">
                      <span class="risk-session-name">${session}</span>
                      <span class="risk-session-utc">${sessionUtcLabel(session)}</span>
                    </span>
                    <span class="risk-session-toggle ${selectedSessions.includes(session) ? "is-on" : ""}" aria-hidden="true">
                      <span class="risk-session-toggle__track"></span>
                      <span class="risk-session-toggle__thumb"></span>
                      <em>${selectedSessions.includes(session) ? "ON" : "OFF"}</em>
                    </span>
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

        <article class="risk-policy-card risk-policy-card--full ${riskUi.openMenu === "symbols" ? "risk-policy-card--menu-open" : ""}">
          <div class="risk-policy-card__head">
            <div>
              <div class="risk-config-title">Símbolos permitidos</div>
              <div class="risk-config-meta">Lista operativa que define los símbolos autorizados para MT5.</div>
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
            <div class="risk-select-menu risk-select-menu--symbols risk-select-menu--policy risk-select-menu--symbols-policy">
              <div class="risk-inline-editor-head">
                <div>
                  <strong>Editar whitelist</strong>
                  <span>Busca un símbolo y añádelo o quítalo sin salir de la política activa.</span>
                </div>
              </div>
              <label class="risk-select-search">
                <input type="search" placeholder="Buscar símbolo o mercado" data-risk-symbol-search ${prefsDraft.allowedSymbolsEnabled ? "" : "disabled"}>
              </label>
              ${canCreateCustomSymbol ? `
                <button class="risk-symbol-add-custom" type="button" data-risk-symbol-add="${normalizedQuery}" ${prefsDraft.allowedSymbolsEnabled ? "" : "disabled"}>
                  + Añadir '${normalizedQuery}' como símbolo personalizado
                </button>
              ` : ""}
              <div class="risk-symbol-editor">
                <div class="risk-symbol-editor__selected">
                  <div class="risk-symbol-section-label">Whitelist actual</div>
                  <div class="risk-symbol-editor__tags">
                    ${selectedSymbolEditorTagsMarkup}
                  </div>
                </div>
                <div class="risk-symbol-editor__results">
                  <div class="risk-symbol-section-label">Resultados</div>
                  <div class="risk-symbol-group risk-symbol-group--results">
                    ${symbolSearchResultsMarkup}
                  </div>
                </div>
              </div>
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
      <div class="tl-section-header">
        <div>
          <div class="tl-section-title">Escalera dinámica</div>
          <div class="row-sub">Avanzado · Ajuste de riesgo por niveles cuando haya datos suficientes.</div>
        </div>
      </div>
      ${ladder.length ? renderLadderProgress(ladder, ladderLevel) : `
        <div class="risk-advanced-empty">
          <div>
            <strong>Escalera dinámica</strong>
            <p>Pendiente de datos avanzados para construir niveles de riesgo.</p>
          </div>
          <span>Configurar más adelante</span>
        </div>
      `}
      ${ladder.length ? `<div class="table-wrap risk-ladder-table">
        <table>
          <thead><tr><th>Nivel</th><th>Riesgo/Trade</th><th>Condición Entrada</th><th>Condición Subida</th><th>Condición Bajada</th><th>Trades a $100k</th><th>Estado</th></tr></thead>
          <tbody>
            ${ladder.map((row) => `
              <tr class="${row.level === ladderLevel ? "risk-ladder-row--current" : ""}">
                <td>${row.level}</td>
                <td>${Number(row.riskPct || 0).toFixed(2)}%</td>
                <td>${row.entryCondition}</td>
                <td>${row.riseCondition}</td>
                <td>${row.fallCondition}</td>
                <td>${row.tradesTo100k}</td>
                <td>${badgeMarkup({ label: row.level === ladderLevel ? "ACTUAL" : row.isRecommended ? "RECOMENDADO" : row.state, tone: row.level === ladderLevel ? "warn" : row.isRecommended ? "info" : row.level === "PROTECT" ? "warn" : "neutral" }, "ui-badge--compact")}</td>
              </tr>
            `).join("") || `<tr><td colspan="7">Sin datos de escalera todavía.</td></tr>`}
          </tbody>
        </table>
      </div>` : ""}
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

  root.querySelectorAll("[data-risk-symbol-remove]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const next = new Set(selectedSymbols);
      const symbol = button.dataset.riskSymbolRemove;
      next.delete(symbol);
      persistRiskPreferencesDraft(root, { allowedSymbols: serializeTokenList([...next]) });
      ensureRiskUiState(root).openMenu = "symbols";
      rerenderRiskKeepingSymbolSearch(root, state);
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
