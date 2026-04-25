import { resolveAccountDataAuthority, selectCurrentAccount, selectCurrentModel } from "./utils.js?v=build-20260406-213500";

// === DISCIPLINE SECTION ===
export const disciplineData = {
  kpis: {
    ruleAdherence: { value: 87, delta: +4 },
    entryPrecision: { value: 2.4, target: 2.0 },
    slViolations: { value: 3 },
    offHoursTrades: { value: 0 }
  },
  rules: [
    { name: "Fixed SL at 10 pips", pct: 73 },
    { name: "Max 1 trade/day", pct: 96 },
    { name: "Entry at OB candle open", pct: 88 },
    { name: "BE activated at 20 pips", pct: 81 },
    { name: "No trades after 17:00", pct: 100 },
    { name: "Valid setup confirmed", pct: 92 }
  ],
  calendar: [
    ["clean", "clean", "warn", "clean", "miss", "rest"],
    ["clean", "miss", "clean", "warn", "clean", "rest"],
    ["clean", "clean", "clean", "clean", "warn", "rest"],
    ["miss", "clean", "clean", "miss", "clean", "rest"],
    ["clean", "warn", "clean", "rest", "rest", "rest"]
  ],
  entryPrecision: [
    { date: "Apr 23", pair: "EURUSD", dev: 0.8 },
    { date: "Apr 22", pair: "GBPUSD", dev: 3.1 },
    { date: "Apr 17", pair: "EURUSD", dev: 1.2 },
    { date: "Apr 16", pair: "USDCAD", dev: 6.4 },
    { date: "Apr 15", pair: "AUDUSD", dev: 1.8 },
    { date: "Apr 14", pair: "GBPUSD", dev: 4.2 }
  ],
  score: {
    overall: 79,
    breakdown: {
      compliance: 87,
      precision: 72,
      consistency: 84,
      timing: 91,
      psychological: 68
    },
    insight: "Mayor brecha: disciplina de SL (73%). Revisa trades de GBPUSD en las semanas 1 y 4."
  }
};

const RULE_DEFINITIONS = disciplineData.rules.map((rule) => rule.name);

// === RULE PROFILES ===
const KMFX_PROFILES_STORAGE_KEY = "kmfx_profiles";

const WEIGHT_OPTIONS = [
  {
    value: 0.5,
    label: "Bajo",
    color: "#555555",
    short: "Impacto mínimo",
    description: "Buena práctica opcional"
  },
  {
    value: 1.0,
    label: "Normal",
    color: "#888888",
    short: "Regla estándar",
    description: "Proceso esperado"
  },
  {
    value: 1.5,
    label: "Alto",
    color: "#F5A623",
    short: "Regla del sistema",
    description: "Define el edge"
  },
  {
    value: 2.0,
    label: "Crítico",
    color: "#FF5C5C",
    short: "Riesgo de cuenta",
    description: "Penaliza fuertemente"
  },
  {
    value: 3.0,
    label: "Absoluto",
    color: "#FF2D2D",
    short: "Línea roja",
    description: "No admite violación"
  }
];

const RULE_LIBRARY = {
  "sl-fixed": {
    id: "sl-fixed",
    name: "SL fijo en 10 pips",
    description: "El stop debe quedar definido y respetado.",
    source: "auto",
    weight: 1.5,
    params: { pips: 10 },
    executionRule: RULE_DEFINITIONS[0]
  },
  "max-trades-per-day": {
    id: "max-trades-per-day",
    name: "Máx. trades por día",
    description: "Limita la frecuencia operativa diaria.",
    source: "auto",
    weight: 1.0,
    params: { max: 1 },
    executionRule: RULE_DEFINITIONS[1]
  },
  "session-window": {
    id: "session-window",
    name: "Ventana de sesión",
    description: "Evita operar fuera del horario permitido.",
    source: "auto",
    weight: 1.0,
    params: { until: "17:00" },
    executionRule: RULE_DEFINITIONS[4]
  },
  "be-activation": {
    id: "be-activation",
    name: "BE activado a 20 pips",
    description: "Protege la posición al alcanzar el umbral definido.",
    source: "manual",
    weight: 1.5,
    params: { pips: 20 },
    executionRule: RULE_DEFINITIONS[3]
  },
  "ob-entry": {
    id: "ob-entry",
    name: "Entrada en OB candle open",
    description: "Mide desviación frente a la entrada técnica ideal.",
    source: "auto",
    weight: 1.5,
    params: {},
    executionRule: RULE_DEFINITIONS[2]
  },
  "valid-setup": {
    id: "valid-setup",
    name: "Setup válido confirmado",
    description: "Requiere etiquetar y validar el setup antes de operar.",
    source: "manual",
    weight: 1.5,
    params: {},
    executionRule: RULE_DEFINITIONS[5]
  },
  "daily-drawdown-limit": {
    id: "daily-drawdown-limit",
    name: "Límite de drawdown diario",
    description: "Controla la pérdida máxima permitida por día.",
    source: "manual",
    weight: 2.0,
    params: { pct: 2 },
    executionRule: "Límite de drawdown diario"
  },
  "news-blackout": {
    id: "news-blackout",
    name: "Bloqueo por noticias",
    description: "Evita operar durante ventanas de alto impacto.",
    source: "manual",
    weight: 1.5,
    params: { minutes: 30 },
    executionRule: "Bloqueo por noticias"
  },
  "min-rr-ratio": {
    id: "min-rr-ratio",
    name: "R:R mínimo",
    description: "Exige relación riesgo/beneficio mínima antes de entrar.",
    source: "manual",
    weight: 1.5,
    params: { ratio: 1.5 },
    executionRule: "R:R mínimo"
  },
  "max-daily-loss": {
    id: "max-daily-loss",
    name: "Pérdida diaria máxima",
    description: "Corta operativa al alcanzar el límite de pérdida diaria.",
    source: "manual",
    weight: 2.0,
    params: { amount: 500 },
    executionRule: "Pérdida diaria máxima"
  },
  "consecutive-losses": {
    id: "consecutive-losses",
    name: "Pérdidas consecutivas",
    description: "Detiene la sesión tras una racha negativa definida.",
    source: "manual",
    weight: 3.0,
    params: { max: 2 },
    executionRule: "Pérdidas consecutivas"
  }
};

function profileRule(id, overrides = {}) {
  const rule = RULE_LIBRARY[id];
  return {
    id,
    name: rule?.name || id,
    description: rule?.description || "Regla de ejecución.",
    enabled: true,
    source: rule?.source || "manual",
    weight: normalizeWeight(rule?.weight || 1),
    params: { ...(rule?.params || {}) },
    ...overrides,
    weight: normalizeWeight(overrides.weight ?? rule?.weight ?? 1)
  };
}

const DEFAULT_KMFX_PROFILES = {
  profiles: [
    {
      id: "real-conservative",
      name: "Real conservador",
      type: "real",
      color: "#34D97B",
      description: "Capital propio · Sin límite de tiempo",
      rules: [
        profileRule("sl-fixed"),
        profileRule("max-trades-per-day"),
        profileRule("session-window"),
        profileRule("be-activation"),
        profileRule("ob-entry"),
        profileRule("valid-setup")
      ]
    },
    {
      id: "orion-phase1",
      name: "Orion Phase 1",
      type: "challenge",
      color: "#F5A623",
      description: "Max DD 10% · 30 días",
      rules: [
        profileRule("sl-fixed"),
        profileRule("max-trades-per-day"),
        profileRule("session-window"),
        profileRule("be-activation"),
        profileRule("ob-entry"),
        profileRule("valid-setup"),
        profileRule("daily-drawdown-limit"),
        profileRule("news-blackout"),
        profileRule("max-daily-loss")
      ]
    },
    {
      id: "orion-funded",
      name: "Orion Funded",
      type: "funded",
      color: "#2F6BFF",
      description: "Max DD 5% · Payout mensual",
      rules: [
        profileRule("sl-fixed"),
        profileRule("max-trades-per-day"),
        profileRule("session-window"),
        profileRule("be-activation"),
        profileRule("ob-entry"),
        profileRule("valid-setup"),
        profileRule("daily-drawdown-limit"),
        profileRule("news-blackout"),
        profileRule("max-daily-loss"),
        profileRule("consecutive-losses"),
        profileRule("min-rr-ratio")
      ]
    }
  ],
  accountMap: {}
};

function cloneProfiles(value = DEFAULT_KMFX_PROFILES) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeWeight(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 1.0;
  return WEIGHT_OPTIONS.reduce((closest, option) => (
    Math.abs(option.value - numeric) < Math.abs(closest.value - numeric) ? option : closest
  ), WEIGHT_OPTIONS[1]).value;
}

function getWeightOption(value) {
  return WEIGHT_OPTIONS.find((option) => option.value === normalizeWeight(value)) || WEIGHT_OPTIONS[1];
}

function hasProfileNormalizationDrift(raw, normalized) {
  try {
    const rawWeights = (raw?.profiles || []).flatMap((profile) => (profile.rules || []).map((rule) => Number(rule.weight)));
    const invalidWeight = rawWeights.some((weight) => !WEIGHT_OPTIONS.some((option) => option.value === weight));
    const missingTransient = raw && (
      !Object.prototype.hasOwnProperty.call(raw, "openAddRuleMenu") ||
      !Object.prototype.hasOwnProperty.call(raw, "openWeightId") ||
      !Object.prototype.hasOwnProperty.call(raw, "confirmRuleRemoveId")
    );
    return invalidWeight || missingTransient || !normalized.profiles.length;
  } catch {
    return true;
  }
}

function normalizeProfiles(raw) {
  const defaults = cloneProfiles();
  const profiles = Array.isArray(raw?.profiles) && raw.profiles.length ? raw.profiles : defaults.profiles;
  return {
    profiles: profiles.map((profile) => ({
      ...profile,
      rules: Array.isArray(profile.rules) ? profile.rules.map((rule) => ({
        ...profileRule(rule.id, rule),
        enabled: rule.enabled !== false,
        weight: normalizeWeight(rule.weight)
      })) : []
    })),
    accountMap: raw?.accountMap && typeof raw.accountMap === "object" ? raw.accountMap : {},
    activeProfileId: raw?.activeProfileId || profiles[0]?.id || "real-conservative",
    openMenuId: raw?.openMenuId || "",
    confirmDeleteId: raw?.confirmDeleteId || "",
    editingProfileId: raw?.editingProfileId || "",
    openAddRuleMenu: raw?.openAddRuleMenu || false,
    openWeightId: raw?.openWeightId || "",
    confirmRuleRemoveId: raw?.confirmRuleRemoveId || ""
  };
}

function loadProfiles() {
  try {
    const saved = window.localStorage?.getItem(KMFX_PROFILES_STORAGE_KEY);
    const parsed = saved ? JSON.parse(saved) : DEFAULT_KMFX_PROFILES;
    const normalized = normalizeProfiles(parsed);
    if (saved && hasProfileNormalizationDrift(parsed, normalized)) saveProfiles(normalized);
    return normalized;
  } catch (error) {
    console.warn("[KMFX][RULE_PROFILES] falling back to defaults", error);
    return normalizeProfiles(DEFAULT_KMFX_PROFILES);
  }
}

function saveProfiles(state) {
  try {
    window.localStorage?.setItem(KMFX_PROFILES_STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn("[KMFX][RULE_PROFILES] save skipped", error);
  }
}

function getProfileForAccount(state, accountLogin = "") {
  const mappedId = accountLogin ? state.accountMap?.[String(accountLogin)] : "";
  const activeId = mappedId || state.activeProfileId || "real-conservative";
  const profile = state.profiles.find((item) => item.id === activeId) || state.profiles[0];
  return {
    profile,
    isDefault: !mappedId,
    accountLogin: String(accountLogin || "")
  };
}

function duplicateProfile(profileState, profileId) {
  const source = profileState.profiles.find((profile) => profile.id === profileId);
  if (!source) return;
  const id = `${profileId}-copy-${Date.now()}`;
  profileState.profiles.push({
    ...cloneProfiles(source),
    id,
    name: `${source.name} copia`
  });
  profileState.activeProfileId = id;
  profileState.openMenuId = "";
  profileState.confirmDeleteId = "";
  profileState.editingProfileId = "";
  profileState.openAddRuleMenu = false;
  profileState.openWeightId = "";
  profileState.confirmRuleRemoveId = "";
}

function deleteProfile(profileState, profileId) {
  if (profileId === "real-conservative" || profileState.profiles.length <= 1) return false;
  const exists = profileState.profiles.some((profile) => profile.id === profileId);
  if (!exists) return false;
  profileState.profiles = profileState.profiles.filter((profile) => profile.id !== profileId);
  Object.keys(profileState.accountMap || {}).forEach((login) => {
    if (profileState.accountMap[login] === profileId) delete profileState.accountMap[login];
  });
  if (profileState.activeProfileId === profileId) profileState.activeProfileId = "real-conservative";
  profileState.openMenuId = "";
  profileState.confirmDeleteId = "";
  profileState.editingProfileId = "";
  profileState.openAddRuleMenu = false;
  profileState.openWeightId = "";
  profileState.confirmRuleRemoveId = "";
  return true;
}

function removeRuleFromProfile(profile, ruleId) {
  if (!profile || !Array.isArray(profile.rules)) return false;
  const target = profile.rules.find((rule) => rule.id === ruleId);
  const activeRules = profile.rules.filter((rule) => rule.enabled !== false);
  if (target?.enabled !== false && activeRules.length <= 1) return false;
  profile.rules = profile.rules.filter((rule) => rule.id !== ruleId);
  return true;
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function average(values = []) {
  const valid = values.filter((value) => Number.isFinite(Number(value)));
  if (!valid.length) return null;
  return valid.reduce((sum, value) => sum + Number(value), 0) / valid.length;
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function toDayKey(dateLike) {
  const date = dateLike instanceof Date ? dateLike : new Date(dateLike);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatShortDate(dateLike) {
  const date = dateLike instanceof Date ? dateLike : new Date(dateLike);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("es-ES", { day: "2-digit", month: "short" }).replace(".", "");
}

function formatPct(value) {
  return Number.isFinite(Number(value)) ? `${Math.round(Number(value))}%` : "Pendiente";
}

function formatPips(value) {
  return Number.isFinite(Number(value)) ? `${Number(value).toFixed(1)} pips` : "Pendiente";
}

function pipSize(symbol = "") {
  const normalized = String(symbol).toUpperCase();
  if (normalized.includes("JPY")) return 0.01;
  if (normalized.includes("XAU") || normalized.includes("GOLD")) return 0.1;
  return 0.0001;
}

function pipsBetween(symbol, a, b) {
  const first = Number(a);
  const second = Number(b);
  if (!Number.isFinite(first) || !Number.isFinite(second)) return null;
  return Math.abs(first - second) / pipSize(symbol);
}

function getEntryDeviationPips(trade) {
  const explicit = [
    trade?.entryDeviationPips,
    trade?.entry_deviation_pips,
    trade?.entryDeviation,
    trade?.entry_deviation
  ].find((value) => Number.isFinite(Number(value)));
  if (Number.isFinite(Number(explicit))) return Math.abs(Number(explicit));

  const plannedEntry = [
    trade?.plannedEntry,
    trade?.planned_entry,
    trade?.signalEntry,
    trade?.signal_entry,
    trade?.modelEntry,
    trade?.model_entry
  ].find((value) => Number.isFinite(Number(value)));

  if (!Number.isFinite(Number(plannedEntry)) || !Number.isFinite(Number(trade?.entry))) return null;
  return pipsBetween(trade.symbol, plannedEntry, trade.entry);
}

function ruleColor(value) {
  if (!Number.isFinite(Number(value))) return "pending";
  if (value >= 90) return "ok";
  if (value >= 70) return "warn";
  return "bad";
}

function isIncompleteNote(note = "") {
  return /sin datos|sin historial|sin operaciones|pendiente|tracking EA/i.test(String(note));
}

function ruleTone(row = {}) {
  if (isIncompleteNote(row.note)) return "pending";
  return ruleColor(row.pct);
}

function scoreColor(score) {
  if (!Number.isFinite(Number(score))) return "pending";
  if (score >= 80) return "ok";
  if (score >= 65) return "warn";
  return "bad";
}

function scoreLabel(score) {
  if (!Number.isFinite(Number(score))) return "PENDIENTE";
  if (score >= 80) return "SÓLIDO";
  if (score >= 65) return "ACEPTABLE";
  if (score >= 45) return "DÉBIL";
  return "BAJO";
}

function precisionColor(value) {
  if (!Number.isFinite(Number(value))) return "pending";
  if (value < 2) return "ok";
  if (value <= 4) return "warn";
  return "bad";
}

function precisionTag(value) {
  if (!Number.isFinite(Number(value))) return "sin historial suficiente";
  if (value < 2) return "ideal";
  if (value <= 4) return "entrada tardía";
  return "persecución";
}

function translatePrecisionStatus(status = "") {
  const normalized = String(status).toLowerCase();
  if (normalized === "late entry") return "entrada tardía";
  if (normalized === "chasing") return "persecución";
  if (normalized === "ideal") return "ideal";
  if (normalized === "sin historial suficiente") return "sin historial suficiente";
  return status;
}

function calendarCellClass(state, isToday = false) {
  const map = {
    clean: "execution-tone-ok",
    warn: "execution-tone-warn",
    miss: "execution-tone-bad",
    bad: "execution-tone-bad",
    ok: "execution-tone-ok",
    rest: "execution-tone-empty",
    empty: "execution-tone-empty"
  };
  return `${map[state] || "execution-tone-empty"}${isToday ? " is-today" : ""}`;
}

function getRecentTrades(trades = []) {
  const ordered = [...trades]
    .filter((trade) => trade?.when instanceof Date && !Number.isNaN(trade.when.getTime()))
    .sort((a, b) => a.when - b.when);
  const latest = ordered[ordered.length - 1]?.when;
  if (!latest) return ordered;
  const windowStart = new Date(latest);
  windowStart.setDate(windowStart.getDate() - 30);
  const recent = ordered.filter((trade) => trade.when >= windowStart);
  return recent.length ? recent : ordered.slice(-30);
}

function groupTradesByDay(trades = []) {
  return trades.reduce((map, trade) => {
    const key = toDayKey(trade.when);
    if (!key) return map;
    const bucket = map.get(key) || { key, trades: [], pnl: 0 };
    bucket.trades.push(trade);
    bucket.pnl += Number(trade.pnl || 0);
    map.set(key, bucket);
    return map;
  }, new Map());
}

function calcRuleCompliance(recentTrades = []) {
  const dayMap = groupTradesByDay(recentTrades);
  const activeDays = [...dayMap.values()];
  const slDistances = recentTrades
    .map((trade) => pipsBetween(trade.symbol, trade.entry, trade.sl))
    .filter((value) => Number.isFinite(value) && value > 0);
  const entryDeviations = recentTrades
    .map(getEntryDeviationPips)
    .filter((value) => Number.isFinite(value));
  const beValues = recentTrades
    .map((trade) => trade?.beActivated ?? trade?.be_activated ?? trade?.breakEvenActivated)
    .filter((value) => typeof value === "boolean");

  const slFixed = slDistances.length
    ? (slDistances.filter((distance) => Math.abs(distance - 10) <= 2).length / slDistances.length) * 100
    : null;
  const oneTradeDay = activeDays.length
    ? (activeDays.filter((day) => day.trades.length <= 1).length / activeDays.length) * 100
    : null;
  const entryObOpen = entryDeviations.length
    ? (entryDeviations.filter((value) => value < 2).length / entryDeviations.length) * 100
    : null;
  const beActivated = beValues.length
    ? (beValues.filter(Boolean).length / beValues.length) * 100
    : null;
  const noPost17 = recentTrades.length
    ? (recentTrades.filter((trade) => trade.when.getHours() < 17).length / recentTrades.length) * 100
    : null;
  const validSetup = recentTrades.length
    ? (recentTrades.filter((trade) => {
      const setup = String(trade.setup || trade.strategyTag || "").trim();
      return setup && !/mt5\s*sync|sin setup|^[-—]$/i.test(setup);
    }).length / recentTrades.length) * 100
    : null;

  return [
    { name: RULE_DEFINITIONS[0], pct: slFixed, note: slDistances.length ? "según histórico registrado" : "sin historial suficiente" },
    { name: RULE_DEFINITIONS[1], pct: oneTradeDay, note: activeDays.length ? "frecuencia frente al plan" : "sin historial suficiente" },
    { name: RULE_DEFINITIONS[2], pct: entryObOpen, note: entryDeviations.length ? "según entrada registrada" : "sin historial suficiente" },
    { name: RULE_DEFINITIONS[3], pct: beActivated, note: beValues.length ? "según break even registrado" : "sin datos suficientes" },
    { name: RULE_DEFINITIONS[4], pct: noPost17, note: recentTrades.length ? "según horario registrado" : "sin operaciones" },
    { name: RULE_DEFINITIONS[5], pct: validSetup, note: recentTrades.length ? "requiere validación del setup" : "sin operaciones" }
  ];
}

function buildKpis(ruleRows, recentTrades, entryDeviations, fallback = disciplineData) {
  const adherence = average(ruleRows.map((row) => row.pct));
  const previousAdherence = Number.isFinite(adherence) ? Math.max(0, adherence - 4) : null;
  const entryAverage = average(entryDeviations);
  const slViolations = ruleRows[0].pct == null
    ? null
    : recentTrades.filter((trade) => {
      const distance = pipsBetween(trade.symbol, trade.entry, trade.sl);
      return Number.isFinite(distance) && Math.abs(distance - 10) > 2;
    }).length;
  const outsideSchedule = recentTrades.filter((trade) => trade.when.getHours() >= 17).length;

  return [
    {
      label: "Cumplimiento de reglas",
      value: Number.isFinite(adherence) ? formatPct(adherence) : "Pendiente",
      subcopy: Number.isFinite(adherence) ? "últimos 30 días" : "estimación basada en histórico",
      badge: Number.isFinite(adherence) && Number.isFinite(previousAdherence) ? `+${Math.round(adherence - previousAdherence)}% vs mes anterior` : "datos parciales",
      tone: "neutral"
    },
    {
      label: "Precisión de entrada",
      value: Number.isFinite(entryAverage) ? formatPips(entryAverage) : "Pendiente",
      subcopy: Number.isFinite(entryAverage) ? "desviación media" : "pendiente de tracking EA",
      badge: Number.isFinite(entryAverage) ? "objetivo <2.0" : "sin datos suficientes",
      tone: Number.isFinite(entryAverage) && entryAverage > 2 ? precisionColor(entryAverage) : "neutral"
    },
    {
      label: "Violaciones de SL",
      value: Number.isFinite(slViolations) ? String(slViolations) : "Pendiente",
      subcopy: Number.isFinite(slViolations) ? "trades este mes" : "pendiente de tracking EA",
      badge: Number.isFinite(slViolations) && slViolations > 0 ? "violación confirmada" : "sin datos suficientes",
      tone: Number.isFinite(slViolations) ? (slViolations === 0 ? "ok" : "bad") : "warn"
    },
    {
      label: "Trades fuera de horario",
      value: String(Number.isFinite(outsideSchedule) ? outsideSchedule : fallback.kpis.offHoursTrades.value),
      subcopy: "violaciones",
      badge: outsideSchedule === 0 ? "100% en horario" : "violación confirmada",
      tone: outsideSchedule === 0 ? "ok" : "bad"
    }
  ];
}

function buildExecutionHeatmap(recentTrades = [], fallback = disciplineData) {
  if (!recentTrades.length) {
    return fallback.calendar.map((days, index) => ({
      label: `S${index + 1}`,
      days: days.map(() => ({ state: "empty", label: "Sin datos", trades: 0, date: null, key: "" }))
    }));
  }

  const latest = recentTrades[recentTrades.length - 1]?.when || new Date();
  const end = new Date(latest);
  const day = end.getDay();
  const diffToSaturday = day === 0 ? -1 : 6 - day;
  end.setDate(end.getDate() + diffToSaturday);
  const start = new Date(end);
  start.setDate(start.getDate() - 34);

  const dayMap = groupTradesByDay(recentTrades);
  const weeks = [];
  for (let week = 0; week < 5; week += 1) {
    const days = [];
    for (let column = 0; column < 6; column += 1) {
      const date = new Date(start);
      date.setDate(start.getDate() + (week * 7) + column);
      const key = toDayKey(date);
      const bucket = dayMap.get(key);
      let state = "empty";
      let label = "Sin trade";
      if (bucket?.trades?.length) {
        const outside = bucket.trades.some((trade) => trade.when.getHours() >= 17);
        const overtraded = bucket.trades.length > 1;
        const negative = bucket.pnl < 0;
        state = outside || (overtraded && negative) ? "miss" : overtraded || negative ? "warn" : "clean";
        label = state === "clean" ? "Limpio" : state === "warn" ? "Advertencia" : "Violación";
      }
      days.push({ key, date, state, label, trades: bucket?.trades?.length || 0, pnl: bucket?.pnl || 0 });
    }
    weeks.push({ label: `S${week + 1}`, days });
  }
  return weeks;
}

function buildEntryPrecisionRows(recentTrades = [], fallback = disciplineData, useFallback = true) {
  const source = recentTrades.length ? [...recentTrades].slice(-10).reverse().map((trade) => {
    const deviation = getEntryDeviationPips(trade);
    const tone = precisionColor(deviation);
    const width = Number.isFinite(deviation) ? clamp((deviation / 6) * 100, 8, 100) : 0;
    return {
      date: formatShortDate(trade.when),
      pair: trade.symbol || "—",
      deviation,
      deviationLabel: Number.isFinite(deviation) ? `+${deviation.toFixed(1)}p` : "pendiente",
      status: precisionTag(deviation),
      tone,
      width,
      tracked: Number.isFinite(deviation)
    };
  }) : useFallback ? fallback.entryPrecision.map((item) => ({
    date: item.date,
    pair: item.pair,
    deviation: item.dev,
    deviationLabel: `+${item.dev.toFixed(1)}p`,
    status: precisionTag(item.dev),
    tone: precisionColor(item.dev),
    width: clamp((item.dev / 6) * 100, 8, 100),
    tracked: false
  })) : [];
  return source;
}

function calcConsistency(recentTrades = []) {
  const days = [...groupTradesByDay(recentTrades).values()];
  if (!days.length) return null;
  return (days.filter((day) => day.trades.length <= 1 && day.pnl >= 0).length / days.length) * 100;
}

function calcPsychologicalScore(recentTrades = []) {
  if (!recentTrades.length) return null;
  let lossesBefore = 0;
  let pressureTrades = 0;
  for (const trade of recentTrades) {
    if (lossesBefore > 0) pressureTrades += 1;
    lossesBefore = Number(trade.pnl || 0) < 0 ? lossesBefore + 1 : 0;
  }
  return clamp(100 - (pressureTrades / recentTrades.length) * 100);
}

function weightedAverageRuleScore(ruleRows = []) {
  const validRows = ruleRows.filter((row) => (
    Number.isFinite(Number(row.pct)) &&
    !isIncompleteNote(row.note)
  ));
  const totalWeight = validRows.reduce((sum, row) => sum + normalizeWeight(row.weight || 1), 0);
  if (!totalWeight) return null;
  const weightedSum = validRows.reduce((sum, row) => sum + (Number(row.pct) * normalizeWeight(row.weight || 1)), 0);
  return weightedSum / totalWeight;
}

function resolveScoreTone(score) {
  return scoreColor(score);
}

function buildDisciplineScore(ruleRows, recentTrades, entryDeviations, fallback = disciplineData) {
  const compliance = weightedAverageRuleScore(ruleRows) ?? average(ruleRows.map((row) => row.pct));
  const precision = entryDeviations.length
    ? clamp(100 - (average(entryDeviations) / 6) * 100)
    : fallback.score.breakdown.precision;
  const consistency = calcConsistency(recentTrades);
  const timing = ruleRows.find((row) => row.name === "No trades after 17:00")?.pct ?? fallback.score.breakdown.timing;
  const psychological = calcPsychologicalScore(recentTrades);
  const subscores = [
    { label: "Cumplimiento", value: compliance ?? fallback.score.breakdown.compliance },
    { label: "Precisión", value: precision },
    { label: "Consistencia", value: consistency ?? fallback.score.breakdown.consistency },
    { label: "Horario", value: timing },
    { label: "Psicológico", value: psychological ?? fallback.score.breakdown.psychological }
  ];
  const score = Math.round(average(subscores.map((item) => item.value)) ?? fallback.score.overall);
  return { score, tone: resolveScoreTone(score), subscores };
}

function renderRuleRows(rows) {
  const noteMap = {
    "según histórico registrado": "según histórico registrado",
    "sin historial suficiente": "sin historial suficiente",
    "frecuencia frente al plan": "frecuencia frente al plan",
    "según entrada registrada": "según entrada registrada",
    "según break even registrado": "según break even registrado",
    "sin datos suficientes": "sin datos suficientes",
    "según horario registrado": "según horario registrado",
    "sin operaciones": "sin operaciones",
    "requiere validación del setup": "requiere validación del setup"
  };
  return rows.map((row) => {
    const tone = ruleTone(row);
    const isIncomplete = isIncompleteNote(row.note);
    const width = !isIncomplete && Number.isFinite(Number(row.pct)) ? clamp(row.pct, 6, 100) : 0;
    return `
      <div class="execution-rule-row execution-tone-${tone}">
        <div class="execution-rule-row__head">
          <strong>${ruleDisplayName(row.name)}</strong>
          <span>${isIncomplete ? "Pendiente" : formatPct(row.pct)}</span>
        </div>
        <div class="execution-rule-row__track" aria-hidden="true">
          <span style="width:${width}%"></span>
        </div>
        <small>${noteMap[row.note] || row.note}</small>
      </div>
    `;
  }).join("");
}

// === RULE PROFILES ===
function ruleRowFromProfileRule(profileRuleItem, currentRows = []) {
  const libraryRule = RULE_LIBRARY[profileRuleItem.id] || {};
  const executionName = libraryRule.executionRule || profileRuleItem.name;
  const matchedRow = currentRows.find((row) => row.name === executionName);
  if (matchedRow) {
    return {
      ...matchedRow,
      name: executionName,
      profileRuleName: profileRuleItem.name,
      profileRuleId: profileRuleItem.id,
      weight: profileRuleItem.weight
    };
  }
  return {
    name: executionName,
    profileRuleName: profileRuleItem.name,
    profileRuleId: profileRuleItem.id,
    pct: null,
    note: "sin datos suficientes",
    weight: profileRuleItem.weight
  };
}

function buildProfileRuleRows(profile, currentRows = []) {
  const rules = Array.isArray(profile?.rules) ? profile.rules : [];
  return rules
    .filter((rule) => rule.enabled !== false)
    .map((rule) => ruleRowFromProfileRule(rule, currentRows));
}

function renderWeightDropdown(rule, profileState) {
  const selected = getWeightOption(rule.weight);
  const isOpen = profileState.openWeightId === rule.id;
  return `
    <div class="rule-profile-weight" style="--rule-weight-color:${escapeHtml(selected.color)}">
      <button type="button" class="rule-profile-weight__trigger" data-rule-weight-menu="${escapeHtml(rule.id)}">
        <b>×${selected.value.toFixed(1)}</b>
        <span>${escapeHtml(selected.label)}</span>
        <i>⌄</i>
      </button>
      ${isOpen ? `
        <div class="rule-profile-weight-menu">
          ${WEIGHT_OPTIONS.map((option) => `
            <button
              type="button"
              class="${option.value === selected.value ? "is-selected" : ""}"
              data-rule-weight-option="${escapeHtml(rule.id)}"
              data-weight-value="${option.value}"
              style="--rule-weight-option-color:${escapeHtml(option.color)}"
            >
              <i></i>
              <strong>×${option.value.toFixed(1)} ${escapeHtml(option.label)}</strong>
              <span>${escapeHtml(option.short)}</span>
            </button>
          `).join("")}
        </div>
      ` : ""}
    </div>
  `;
}

function renderProfileWarnings(profile) {
  const rules = Array.isArray(profile?.rules) ? profile.rules.filter((rule) => rule.enabled !== false) : [];
  const absoluteCount = rules.filter((rule) => normalizeWeight(rule.weight) === 3.0).length;
  const criticalCount = rules.filter((rule) => normalizeWeight(rule.weight) === 2.0).length;
  const warnings = [];
  if (absoluteCount > 2) warnings.push("Demasiadas reglas absolutas reducen la discriminación del score.");
  if (criticalCount > 4) warnings.push("Demasiadas reglas críticas pueden hacer el score demasiado punitivo.");
  if (!warnings.length) return "";
  return `
    <div class="rule-profile-warnings">
      ${warnings.map((warning) => `<p>${escapeHtml(warning)}</p>`).join("")}
    </div>
  `;
}

function renderAddRuleDropdown(profile, profileState) {
  const existingIds = new Set((profile?.rules || []).map((rule) => rule.id));
  const availableSystemRules = Object.values(RULE_LIBRARY).filter((rule) => !existingIds.has(rule.id));
  return `
    <div class="rule-profile-add-rule${profileState.openAddRuleMenu ? " is-open" : ""}">
      <button type="button" class="rule-profile-action" data-rule-action="toggle-add-rule">+ Añadir regla</button>
      ${profileState.openAddRuleMenu ? `
        <div class="rule-profile-add-menu">
          <span>REGLAS DEL SISTEMA</span>
          ${availableSystemRules.length ? availableSystemRules.map((rule) => {
            const weight = getWeightOption(rule.weight);
            return `
              <button type="button" data-rule-add="${escapeHtml(rule.id)}">
                <strong>${escapeHtml(rule.name)}</strong>
                <small>${escapeHtml(rule.description)}</small>
                <em>×${weight.value.toFixed(1)} ${escapeHtml(weight.label)}</em>
              </button>
            `;
          }).join("") : `<p>Todas las reglas del sistema ya están en este perfil.</p>`}
          <span>REGLAS PERSONALIZADAS</span>
          <button type="button" disabled>
            <strong>Crear regla nueva</strong>
            <small>Disponible en Fase 2</small>
          </button>
        </div>
      ` : ""}
    </div>
  `;
}

function renderProfileCards(profileState, activeProfile) {
  return `
    <div class="rule-profile-cards">
      ${profileState.profiles.map((profile) => {
        const isLocked = profile.id === "real-conservative" || profileState.profiles.length <= 1;
        const isOpen = profileState.openMenuId === profile.id;
        const isConfirming = profileState.confirmDeleteId === profile.id;
        const isEditing = profileState.editingProfileId === profile.id;
        return `
          <div
            class="rule-profile-card${profile.id === activeProfile.id ? " is-active" : ""}${isOpen ? " menu-open" : ""}"
            data-profile-card="${escapeHtml(profile.id)}"
            style="--rule-profile-color:${escapeHtml(profile.color || "#34D97B")}"
          >
            <button type="button" class="rule-profile-card__select" data-profile-id="${escapeHtml(profile.id)}">
              <span>${escapeHtml(profile.type || "perfil")}</span>
              ${isEditing ? `
                <input class="rule-profile-name-input" type="text" value="${escapeHtml(profile.name)}" data-profile-name-input="${escapeHtml(profile.id)}" aria-label="Editar nombre de perfil">
              ` : `<strong>${escapeHtml(profile.name)}</strong>`}
              <small>${escapeHtml(profile.description || "")}</small>
            </button>
            <button type="button" class="rule-profile-menu-trigger" data-profile-menu="${escapeHtml(profile.id)}" aria-label="Opciones de perfil">…</button>
            ${isOpen ? `
              <div class="rule-profile-menu" data-profile-menu-panel="${escapeHtml(profile.id)}">
                <button type="button" data-profile-action="edit" data-profile-target="${escapeHtml(profile.id)}">Editar nombre</button>
                <button type="button" data-profile-action="duplicate" data-profile-target="${escapeHtml(profile.id)}">Duplicar perfil</button>
                <button type="button" class="danger" data-profile-action="delete" data-profile-target="${escapeHtml(profile.id)}" ${isLocked ? "disabled" : ""}>Eliminar perfil</button>
                ${isConfirming ? `
                  <div class="rule-profile-confirm">
                    <strong>Eliminar perfil</strong>
                    <p>Las cuentas asignadas volverán al perfil por defecto.</p>
                    <div>
                      <button type="button" data-profile-action="cancel-delete" data-profile-target="${escapeHtml(profile.id)}">Cancelar</button>
                      <button type="button" class="danger" data-profile-action="confirm-delete" data-profile-target="${escapeHtml(profile.id)}">Eliminar</button>
                    </div>
                  </div>
                ` : ""}
              </div>
            ` : ""}
          </div>
        `;
      }).join("")}
      <button type="button" class="rule-profile-card rule-profile-card--new" data-rule-action="new-profile">
        <span>Nuevo</span>
        <strong>+ Nuevo perfil</strong>
        <small>Duplicar base conservadora</small>
      </button>
    </div>
  `;
}

function renderProfileEditor(profile, profileState) {
  const rules = Array.isArray(profile?.rules) ? profile.rules : [];
  return `
    <div class="rule-profile-editor">
      <div class="rule-profile-editor__head">
        <div>
          <span>Perfil activo</span>
          <strong>${escapeHtml(profile?.name || "Perfil")}</strong>
          <p>El score se calcula solo con reglas activas.</p>
        </div>
        ${renderAddRuleDropdown(profile, profileState)}
      </div>
      ${renderProfileWarnings(profile)}
      <div class="rule-profile-rule-list">
        ${rules.map((rule) => {
          const isConfirmingRemove = profileState.confirmRuleRemoveId === rule.id;
          const activeRules = rules.filter((item) => item.enabled !== false);
          const cannotRemove = rule.enabled !== false && activeRules.length <= 1;
          return `
          <div class="rule-profile-rule${rule.enabled === false ? " is-disabled" : ""}" data-rule-id="${escapeHtml(rule.id)}">
            <label class="rule-profile-toggle">
              <input type="checkbox" data-rule-toggle="${escapeHtml(rule.id)}" ${rule.enabled !== false ? "checked" : ""}>
              <span></span>
            </label>
            <div class="rule-profile-rule__copy">
              <strong>${escapeHtml(rule.name)}</strong>
              <p>${escapeHtml(rule.description)}</p>
            </div>
            <span class="rule-profile-badge">${rule.source === "auto" ? "Automático" : "Manual"}</span>
            ${renderWeightDropdown(rule, profileState)}
            <button type="button" class="rule-profile-remove" data-rule-remove="${escapeHtml(rule.id)}" ${cannotRemove ? "disabled" : ""} aria-label="Quitar regla">×</button>
            ${isConfirmingRemove ? `
              <div class="rule-profile-rule-confirm">
                <strong>Quitar regla</strong>
                <p>La regla dejará de afectar al score de este perfil.</p>
                <div>
                  <button type="button" data-rule-remove-cancel="${escapeHtml(rule.id)}">Cancelar</button>
                  <button type="button" class="danger" data-rule-remove-confirm="${escapeHtml(rule.id)}">Quitar</button>
                </div>
              </div>
            ` : ""}
          </div>
        `;
        }).join("")}
      </div>
    </div>
  `;
}

function renderAccountAssignments(profileState, activeProfile, accountLogin = "", isDefault = false) {
  const mappedAccounts = Object.entries(profileState.accountMap || {})
    .filter(([, profileId]) => profileId === activeProfile.id)
    .map(([login]) => login);
  return `
    <div class="rule-profile-accounts">
      <div>
        <span>Cuentas asignadas</span>
        <strong>${mappedAccounts.length ? mappedAccounts.map(escapeHtml).join(", ") : "Sin cuentas asignadas"}</strong>
        ${isDefault && accountLogin ? `<p>Perfil por defecto aplicado a ${escapeHtml(accountLogin)}.</p>` : ""}
      </div>
      <form class="rule-profile-account-form" data-rule-action="assign-account">
        <input type="text" name="login" placeholder="Login MT5" value="${escapeHtml(accountLogin || "")}">
        <button type="submit">+ Asignar cuenta</button>
      </form>
    </div>
  `;
}

function renderProfileManager(container, context = {}) {
  if (!container) return;
  const profileState = loadProfiles();
  const { profile: activeProfile, isDefault, accountLogin } = getProfileForAccount(profileState, context.accountLogin);
  container.innerHTML = `
    <article class="rule-profile-manager">
      <div class="rule-profile-manager__head">
        <div>
          <span>FASE 1 · LOCAL</span>
          <strong>Perfiles de reglas</strong>
          <p>Configura reglas por cuenta antes de conectar tracking real del EA.</p>
        </div>
        <button type="button" class="rule-profile-action" data-rule-action="new-profile">+ Nuevo</button>
      </div>
      ${renderProfileCards(profileState, activeProfile)}
      ${renderProfileEditor(activeProfile, profileState)}
      ${renderAccountAssignments(profileState, activeProfile, accountLogin, isDefault)}
    </article>
  `;

  container.querySelectorAll("[data-profile-id]").forEach((button) => {
    button.addEventListener("click", () => {
      profileState.activeProfileId = button.dataset.profileId;
      profileState.openMenuId = "";
      profileState.confirmDeleteId = "";
      profileState.openWeightId = "";
      profileState.confirmRuleRemoveId = "";
      profileState.openAddRuleMenu = false;
      if (context.accountLogin) profileState.accountMap[String(context.accountLogin)] = button.dataset.profileId;
      saveProfiles(profileState);
      renderDisciplineSection(context.target, context.data, context);
    });
  });

  container.querySelectorAll("[data-profile-menu]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const profileId = button.dataset.profileMenu;
      profileState.openMenuId = profileState.openMenuId === profileId ? "" : profileId;
      profileState.confirmDeleteId = "";
      profileState.editingProfileId = "";
      profileState.openWeightId = "";
      profileState.confirmRuleRemoveId = "";
      profileState.openAddRuleMenu = false;
      saveProfiles(profileState);
      renderDisciplineSection(context.target, context.data, context);
    });
  });

  container.querySelectorAll("[data-profile-action]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const profileId = button.dataset.profileTarget;
      const action = button.dataset.profileAction;
      if (action === "edit") {
        profileState.editingProfileId = profileId;
        profileState.openMenuId = "";
        profileState.confirmDeleteId = "";
        profileState.openWeightId = "";
        profileState.confirmRuleRemoveId = "";
        profileState.openAddRuleMenu = false;
      }
      if (action === "duplicate") duplicateProfile(profileState, profileId);
      if (action === "delete") {
        if (profileId !== "real-conservative" && profileState.profiles.length > 1) {
          profileState.confirmDeleteId = profileId;
        }
      }
      if (action === "cancel-delete") profileState.confirmDeleteId = "";
      if (action === "confirm-delete") deleteProfile(profileState, profileId);
      saveProfiles(profileState);
      renderDisciplineSection(context.target, context.data, context);
    });
  });

  container.querySelectorAll("[data-profile-name-input]").forEach((input) => {
    const saveName = () => {
      const profile = profileState.profiles.find((item) => item.id === input.dataset.profileNameInput);
      const name = input.value.trim();
      if (profile && name) profile.name = name;
      profileState.editingProfileId = "";
      saveProfiles(profileState);
      renderDisciplineSection(context.target, context.data, context);
    };
    input.addEventListener("click", (event) => event.stopPropagation());
    input.addEventListener("blur", saveName);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") saveName();
      if (event.key === "Escape") {
        profileState.editingProfileId = "";
        saveProfiles(profileState);
        renderDisciplineSection(context.target, context.data, context);
      }
    });
    setTimeout(() => input.focus(), 0);
  });

  container.querySelectorAll("[data-rule-action='new-profile']").forEach((button) => {
    button.addEventListener("click", () => {
      const base = activeProfile || profileState.profiles[0];
      const id = `custom-${Date.now()}`;
      profileState.profiles.push({
        ...cloneProfiles(base),
        id,
        name: `Perfil ${profileState.profiles.length + 1}`,
        type: "custom",
        color: "#8E8E93"
      });
      profileState.activeProfileId = id;
      profileState.openMenuId = "";
      profileState.confirmDeleteId = "";
      profileState.editingProfileId = "";
      profileState.openWeightId = "";
      profileState.confirmRuleRemoveId = "";
      profileState.openAddRuleMenu = false;
      if (context.accountLogin) profileState.accountMap[String(context.accountLogin)] = id;
      saveProfiles(profileState);
      renderDisciplineSection(context.target, context.data, context);
    });
  });

  container.querySelectorAll("[data-rule-toggle]").forEach((input) => {
    input.addEventListener("change", () => {
      const rule = activeProfile.rules.find((item) => item.id === input.dataset.ruleToggle);
      if (rule) rule.enabled = input.checked;
      saveProfiles(profileState);
      renderDisciplineSection(context.target, context.data, context);
    });
  });

  container.querySelectorAll("[data-rule-weight-menu]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const ruleId = button.dataset.ruleWeightMenu;
      profileState.openWeightId = profileState.openWeightId === ruleId ? "" : ruleId;
      profileState.openMenuId = "";
      profileState.confirmDeleteId = "";
      profileState.confirmRuleRemoveId = "";
      profileState.openAddRuleMenu = false;
      saveProfiles(profileState);
      renderDisciplineSection(context.target, context.data, context);
    });
  });

  container.querySelectorAll("[data-rule-weight-option]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const rule = activeProfile.rules.find((item) => item.id === button.dataset.ruleWeightOption);
      if (rule) rule.weight = normalizeWeight(button.dataset.weightValue);
      profileState.openWeightId = "";
      saveProfiles(profileState);
      renderDisciplineSection(context.target, context.data, context);
    });
  });

  container.querySelectorAll("[data-rule-remove]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      if (button.disabled) return;
      profileState.confirmRuleRemoveId = button.dataset.ruleRemove;
      profileState.openWeightId = "";
      profileState.openMenuId = "";
      profileState.confirmDeleteId = "";
      profileState.openAddRuleMenu = false;
      saveProfiles(profileState);
      renderDisciplineSection(context.target, context.data, context);
    });
  });

  container.querySelectorAll("[data-rule-remove-cancel]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      profileState.confirmRuleRemoveId = "";
      saveProfiles(profileState);
      renderDisciplineSection(context.target, context.data, context);
    });
  });

  container.querySelectorAll("[data-rule-remove-confirm]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      removeRuleFromProfile(activeProfile, button.dataset.ruleRemoveConfirm);
      profileState.confirmRuleRemoveId = "";
      saveProfiles(profileState);
      renderDisciplineSection(context.target, context.data, context);
    });
  });

  const addRuleButton = container.querySelector("[data-rule-action='toggle-add-rule']");
  addRuleButton?.addEventListener("click", (event) => {
    event.stopPropagation();
    profileState.openAddRuleMenu = !profileState.openAddRuleMenu;
    profileState.openMenuId = "";
    profileState.confirmDeleteId = "";
    profileState.openWeightId = "";
    profileState.confirmRuleRemoveId = "";
    saveProfiles(profileState);
    renderDisciplineSection(context.target, context.data, context);
  });

  container.querySelectorAll("[data-rule-add]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const ruleId = button.dataset.ruleAdd;
      const existingIds = new Set(activeProfile.rules.map((rule) => rule.id));
      if (!existingIds.has(ruleId) && RULE_LIBRARY[ruleId]) {
        activeProfile.rules.push(profileRule(ruleId, { enabled: false }));
      }
      profileState.openAddRuleMenu = false;
      saveProfiles(profileState);
      renderDisciplineSection(context.target, context.data, context);
    });
  });

  const accountForm = container.querySelector("[data-rule-action='assign-account']");
  accountForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(accountForm);
    const login = String(formData.get("login") || "").trim();
    if (!login) return;
    profileState.accountMap[login] = activeProfile.id;
    profileState.openAddRuleMenu = false;
    saveProfiles(profileState);
    accountForm.reset();
    renderDisciplineSection(context.target, { ...context.data, accountLogin: "" }, { ...context, accountLogin: "" });
  });

  const closeMenu = () => {
    const current = loadProfiles();
    if (!current.openMenuId && !current.confirmDeleteId && !current.editingProfileId && !current.openAddRuleMenu && !current.openWeightId && !current.confirmRuleRemoveId) return;
    current.openMenuId = "";
    current.confirmDeleteId = "";
    current.editingProfileId = "";
    current.openAddRuleMenu = false;
    current.openWeightId = "";
    current.confirmRuleRemoveId = "";
    saveProfiles(current);
    renderDisciplineSection(context.target, context.data, context);
  };
  container.addEventListener("click", (event) => {
    if (!event.target.closest(".rule-profile-card")) closeMenu();
  });
  container.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMenu();
  });
}

function renderHeatmap(weeks) {
  const weekdays = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  const todayKey = toDayKey(new Date());
  return `
    <div class="execution-heatmap">
      <div class="execution-heatmap__weekdays">
        <span></span>
        ${weekdays.map((day) => `<span>${day}</span>`).join("")}
      </div>
      ${weeks.map((week) => `
        <div class="execution-heatmap__row">
          <strong>${week.label}</strong>
          ${week.days.map((day) => `
            <span class="execution-heatmap__cell ${calendarCellClass(day.state, day.key === todayKey)}" title="${formatShortDate(day.date)} · ${day.label} · ${day.trades} operaciones"></span>
          `).join("")}
        </div>
      `).join("")}
      <div class="execution-heatmap__legend">
        <span><i class="execution-tone-ok"></i>Limpio</span>
        <span><i class="execution-tone-warn"></i>Advertencia</span>
        <span><i class="execution-tone-bad"></i>Violación</span>
        <span><i class="execution-tone-empty"></i>Sin trade</span>
      </div>
    </div>
  `;
}

function renderEntryRows(rows) {
  if (!rows.length) {
    return `<div class="execution-empty">Sin trades suficientes para leer precisión de entrada.</div>`;
  }
  return rows.map((row) => `
    <div class="execution-entry-row execution-tone-${row.tone}">
      <span>${row.date}</span>
      <strong>${row.pair}</strong>
      <span>${row.deviationLabel}</span>
      <div class="execution-entry-row__bar" aria-hidden="true">
        <i style="width:${row.width}%"></i>
      </div>
      <em>${translatePrecisionStatus(row.status)}</em>
    </div>
  `).join("");
}

function hasEntryPrecisionTracking(rows = []) {
  return rows.some((row) => {
    const deviation = Number(row.deviation ?? row.dev);
    return row.tracked === true && Number.isFinite(deviation) && Math.abs(deviation) > 0.05;
  });
}

function renderEntryPrecisionEmpty() {
  return `
    <div class="execution-entry-empty">
      <strong>Precisión de entrada</strong>
      <p>Sin historial suficiente para evaluar desviación frente a la entrada ideal.</p>
      <small>Cuando el EA envíe la entrada ideal, KMFX medirá chasing y entradas tardías.</small>
    </div>
  `;
}

function renderSubscores(subscores) {
  return subscores.map((item) => `
    <div class="execution-subscore">
      <span>${item.label}</span>
      <strong>${Number.isFinite(Number(item.value)) ? Math.round(item.value) : "Pendiente"}</strong>
    </div>
  `).join("");
}

function scoreDisplayTone(score, isPartial = false) {
  if (isPartial && scoreColor(score) === "bad") return "warn";
  return scoreColor(score);
}

function renderScoreGauge(score, { isPartial = false } = {}) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const dash = (clamp(score, 0, 100) / 100) * circumference;
  const label = scoreLabel(score);
  return `
    <div class="execution-score-gauge execution-tone-${scoreDisplayTone(score, isPartial)}">
      <svg viewBox="0 0 140 140" aria-hidden="true">
        <circle class="execution-score-gauge__track" cx="70" cy="70" r="${radius}"></circle>
        <circle class="execution-score-gauge__arc" cx="70" cy="70" r="${radius}" stroke-dasharray="${dash} ${circumference}"></circle>
      </svg>
      <div>
        <strong>${score}</strong>
        <span>${label}</span>
      </div>
    </div>
  `;
}

function hasPartialExecutionData(rules = [], entryRows = [], kpis = []) {
  const hasIncompleteRules = rules.some((rule) => isIncompleteNote(rule.note) || !Number.isFinite(Number(rule.pct)));
  const hasEntryTracking = hasEntryPrecisionTracking(entryRows);
  const hasPendingKpis = kpis.some((kpi) => /pendiente|parcial|sin datos/i.test(`${kpi.value} ${kpi.subcopy} ${kpi.badge}`));
  return hasIncompleteRules || !hasEntryTracking || hasPendingKpis;
}

function ruleDisplayName(name = "") {
  if (/fixed sl|sl fijo|sl/i.test(name)) return "Disciplina de SL";
  if (/max 1 trade|trade\/day|frecuencia/i.test(name)) return "Frecuencia operativa";
  if (/entry/i.test(name)) return "Precisión de entrada";
  if (/be activated|be activado/i.test(name)) return "Gestión a break even";
  if (/17:00|hours|horario/i.test(name)) return "Disciplina horaria";
  if (/setup/i.test(name)) return "Validación de setup";
  return name || "Disciplina de ejecución";
}

function issueDescription(name = "") {
  if (/fixed sl|sl fijo|sl/i.test(name)) {
    return "El stop está siendo movido, ignorado o no queda suficientemente validado.";
  }
  if (/max 1 trade|trade\/day|frecuencia/i.test(name)) {
    return "La cantidad de trades se aleja del límite operativo definido.";
  }
  if (/17:00|hours|horario/i.test(name)) {
    return "Hay operaciones fuera de la ventana permitida.";
  }
  if (/entry/i.test(name)) {
    return "La entrada se aleja del punto técnico ideal.";
  }
  if (/setup/i.test(name)) {
    return "El setup no queda etiquetado o validado con suficiente consistencia.";
  }
  return "La ejecución se desvía del proceso y reduce la consistencia operativa.";
}

function isReliableRule(row = {}) {
  if (!Number.isFinite(Number(row.pct))) return false;
  return !/requires|pending|no trades|no traded days|sin datos|sin historial|sin operaciones|pendiente/i.test(String(row.note || ""));
}

function resolvePrincipalDeviation(rules = []) {
  const priority = [
    /fixed sl|sl fijo|sl/i,
    /max 1 trade|trade\/day|frecuencia/i,
    /17:00|hours|horario/i,
    /entry/i,
    /setup/i
  ];
  const reliableRules = rules.filter(isReliableRule);
  for (const matcher of priority) {
    const belowTarget = reliableRules.find((rule) => matcher.test(rule.name) && Number(rule.pct) < 90);
    if (belowTarget) return belowTarget;
  }
  for (const matcher of priority) {
    const available = reliableRules.find((rule) => matcher.test(rule.name));
    if (available) return available;
  }
  return { name: RULE_DEFINITIONS[0], pct: null, note: "sin historial suficiente" };
}

function renderExecutionHero(rules = []) {
  const principalRule = resolvePrincipalDeviation(rules);
  const issueName = ruleDisplayName(principalRule?.name || RULE_DEFINITIONS[0]);

  return `
    <section class="execution-hero">
      <div class="execution-hero__copy">
        <p class="execution-hero__eyebrow">CALIDAD DE EJECUCIÓN</p>
        <h3>Calidad de ejecución baja</h3>
        <p>Tu ejecución se degrada en momentos de presión.</p>
      </div>
      <div class="execution-hero__issue">
        <span>Principal desviación</span>
        <strong>${issueName}</strong>
        <p>${issueDescription(principalRule?.name || RULE_DEFINITIONS[0])}</p>
      </div>
    </section>
  `;
}

function buildEntryPattern(rows = []) {
  const byPair = rows.reduce((map, row) => {
    const deviation = Number(row.deviation ?? row.dev);
    if (!row.pair || !Number.isFinite(deviation)) return map;
    const bucket = map.get(row.pair) || { pair: row.pair, total: 0, count: 0 };
    bucket.total += deviation;
    bucket.count += 1;
    map.set(row.pair, bucket);
    return map;
  }, new Map());

  const weakestPair = [...byPair.values()]
    .filter((item) => item.count > 0)
    .map((item) => ({ ...item, avg: item.total / item.count }))
    .sort((a, b) => b.avg - a.avg)[0];

  if (!weakestPair) return "No hay suficiente historial para detectar un patrón claro.";
  return `Tiendes a entrar tarde en operaciones de ${weakestPair.pair}.`;
}

function renderScorePanel(scoreValue, breakdown, insight, { isPartial = false } = {}) {
  return `
    <article class="tl-section-card execution-panel execution-score-panel execution-tone-${scoreDisplayTone(scoreValue, isPartial)}">
      <div class="tl-section-header execution-section-header">
        <div class="tl-section-title">Score de ejecución</div>
        ${isPartial ? `<span class="execution-data-pill">Datos parciales</span>` : ""}
      </div>
      <div class="execution-score-body">
        ${renderScoreGauge(scoreValue, { isPartial })}
        <div class="execution-subscore-list">${renderSubscores(breakdown)}</div>
        <div class="execution-score-reading">
          <span>Lectura</span>
          <p>La lectura actual es parcial hasta activar tracking completo desde el EA.</p>
        </div>
      </div>
      <div class="execution-system-insight">
        <strong>Insight</strong>
        <p>${insight}</p>
      </div>
    </article>
  `;
}

function buildDisciplineDataFromModel(model) {
  const recentTrades = getRecentTrades(model?.trades || []);
  const entryDeviations = recentTrades.map(getEntryDeviationPips).filter((value) => Number.isFinite(value));
  const rules = calcRuleCompliance(recentTrades);
  const kpis = buildKpis(rules, recentTrades, entryDeviations);
  const score = buildDisciplineScore(rules, recentTrades, entryDeviations);
  return {
    kpis,
    rules,
    calendar: buildExecutionHeatmap(recentTrades),
    entryPrecision: buildEntryPrecisionRows(recentTrades, disciplineData, false),
    score,
    insight: rules[0]?.pct == null
      ? "Mayor brecha: disciplina de SL. Revisa las operaciones donde el stop fue movido o ignorado."
      : `Mayor brecha: disciplina de SL (${Math.round(rules[0].pct)}%). Revisa las operaciones donde el stop fue movido o ignorado.`
  };
}

export function renderDisciplineSection(target, data = disciplineData, context = {}) {
  if (!target) return;
  const renderContext = { ...context, target, data };
  const kpis = Array.isArray(data.kpis)
    ? data.kpis
    : [
      {
        label: "Cumplimiento de reglas",
        value: formatPct(data.kpis?.ruleAdherence?.value),
        subcopy: "últimos 30 días",
        badge: `+${data.kpis?.ruleAdherence?.delta ?? 0}% vs mes anterior`,
        tone: "neutral"
      },
      {
        label: "Precisión de entrada",
        value: formatPips(data.kpis?.entryPrecision?.value),
        subcopy: "estimación basada en histórico",
        badge: `objetivo <${data.kpis?.entryPrecision?.target ?? 2.0}`,
        tone: "neutral"
      },
      {
        label: "Violaciones de SL",
        value: String(data.kpis?.slViolations?.value ?? "Pendiente"),
        subcopy: "trades este mes",
        badge: "SL movido o ignorado",
        tone: Number(data.kpis?.slViolations?.value || 0) === 0 ? "ok" : "bad"
      },
      {
        label: "Trades fuera de horario",
        value: String(data.kpis?.offHoursTrades?.value ?? 0),
        subcopy: "violaciones",
        badge: Number(data.kpis?.offHoursTrades?.value || 0) === 0 ? "100% en horario" : "violación confirmada",
        tone: Number(data.kpis?.offHoursTrades?.value || 0) === 0 ? "ok" : "bad"
      }
    ];

  const rules = (data.rules || []).map((rule) => ({
    name: rule.name,
    pct: rule.pct,
    note: rule.note || ""
  }));
  const profileState = loadProfiles();
  const accountLogin = context.accountLogin || data.accountLogin || "";
  const { profile: activeProfile } = getProfileForAccount(profileState, accountLogin);
  const visibleRules = buildProfileRuleRows(activeProfile, rules);
  const calendar = Array.isArray(data.calendar?.[0])
    ? data.calendar.map((days, index) => ({ label: `S${index + 1}`, days: days.map((state) => ({ state, label: state, trades: 0, key: "", date: null })) }))
    : data.calendar || [];
  const entryRows = (data.entryPrecision || []).map((item) => ({
    date: item.date,
    pair: item.pair,
    deviation: item.dev ?? item.deviation,
    deviationLabel: Number.isFinite(Number(item.dev ?? item.deviation)) ? `+${Number(item.dev ?? item.deviation).toFixed(1)}p` : "pendiente",
    status: item.status || precisionTag(item.dev ?? item.deviation),
    tone: item.tone || precisionColor(item.dev ?? item.deviation),
    width: item.width || clamp((Number(item.dev ?? item.deviation ?? 0) / 6) * 100, 8, 100),
    tracked: item.tracked === true || item.hasTracking === true
  }));
  const scoreValue = data.score?.overall ?? data.score?.score ?? 0;
  const weightedCompliance = weightedAverageRuleScore(visibleRules);
  const breakdown = data.score?.breakdown
    ? [
      { label: "Cumplimiento", value: weightedCompliance ?? data.score.breakdown.compliance },
      { label: "Precisión", value: data.score.breakdown.precision },
      { label: "Consistencia", value: data.score.breakdown.consistency },
      { label: "Horario", value: data.score.breakdown.timing },
      { label: "Psicológico", value: data.score.breakdown.psychological }
    ]
    : (data.score?.subscores || []).map((item) => (
      item.label === "Cumplimiento" ? { ...item, value: weightedCompliance ?? item.value } : item
    ));
  const weightedScoreValue = Math.round(average(breakdown.map((item) => item.value)) ?? scoreValue);
  const insight = data.score?.insight || data.insight || disciplineData.score.insight;
  const hasEntryTracking = hasEntryPrecisionTracking(entryRows);
  const isPartialData = hasPartialExecutionData(rules, entryRows, kpis);
  const entryPattern = hasEntryTracking ? buildEntryPattern(entryRows) : "No hay suficiente historial para detectar un patrón claro.";

  target.innerHTML = `
    <header class="kmfx-page__header">
      <div class="kmfx-page__copy">
        <p class="kmfx-page__eyebrow">EJECUCIÓN</p>
        <h2 class="kmfx-page__title">Ejecución</h2>
        <p class="kmfx-page__subtitle">Cumplimiento del plan, precisión de entrada y calidad operativa.</p>
      </div>
    </header>

    ${renderExecutionHero(rules)}

    <section class="execution-score-row">
      ${renderScorePanel(weightedScoreValue, breakdown, insight, { isPartial: isPartialData })}
    </section>

    <section class="execution-main-grid">
      <article class="tl-section-card execution-panel execution-rules-panel">
        <div class="tl-section-header execution-section-header">
          <div class="tl-section-title">Cumplimiento de reglas</div>
        </div>
        <div class="execution-rule-list">${renderRuleRows(visibleRules)}</div>
      </article>

      <article class="tl-section-card execution-panel execution-calendar-panel">
        <div class="tl-section-header execution-section-header">
          <div class="tl-section-title">Ejecución diaria — últimas 5 semanas</div>
        </div>
        ${renderHeatmap(calendar)}
      </article>
    </section>

    <section class="execution-kpi-grid">
      ${kpis.map((kpi) => `
        <article class="tl-kpi-card execution-kpi execution-kpi--${kpi.label === "Violaciones de SL" || kpi.label === "Trades fuera de horario" ? "critical" : "support"} execution-tone-${kpi.tone}">
          <div class="tl-kpi-label">${kpi.label}</div>
          <div class="tl-kpi-val">${kpi.value}</div>
          <p>${kpi.subcopy}</p>
          <span>${kpi.badge}</span>
        </article>
      `).join("")}
    </section>

    <section class="execution-main-grid execution-main-grid--lower">
      <article class="tl-section-card execution-panel execution-entry-panel">
        <div class="tl-section-header execution-section-header">
          <div class="tl-section-title">${hasEntryTracking ? "Precisión de entrada — últimos 10 trades" : "Precisión de entrada"}</div>
        </div>
        <div class="execution-entry-pattern">
          <span>Patrón de ejecución</span>
          <p>${entryPattern}</p>
        </div>
        ${hasEntryTracking ? `<div class="execution-entry-table">
          <div class="execution-entry-table__head">
            <span>Fecha</span>
            <span>Par</span>
            <span>Desv. pips</span>
            <span>Precisión</span>
            <span>Estado</span>
          </div>
          ${renderEntryRows(entryRows)}
        </div>` : renderEntryPrecisionEmpty()}
      </article>
    </section>

    <div id="discipline-profile-manager"></div>
  `;
  renderProfileManager(target.querySelector("#discipline-profile-manager"), renderContext);
}

export function renderDiscipline(root, state) {
  if (!root) return;
  const account = selectCurrentAccount(state);
  const model = selectCurrentModel(state);
  if (!model) {
    root.innerHTML = "";
    return;
  }

  const authority = resolveAccountDataAuthority(account);
  console.info("[KMFX][EXECUTION_AUTHORITY]", {
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

  root.innerHTML = `
    <section id="section-discipline" class="discipline-page-stack execution-page kmfx-page kmfx-page--spacious"></section>
  `;
  renderDisciplineSection(root.querySelector("#section-discipline"), buildDisciplineDataFromModel(model), {
    accountLogin: account?.login || ""
  });
}
