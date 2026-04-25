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
const KMFX_TAGS_STORAGE_KEY = "kmfx_tags";

let activePostTradeModal = null;
let currentTagDraft = {
  tradeId: null,
  answers: {},
  note: "",
  reviewMode: false,
  saveAttempted: false
};
let postTradeQueueState = {
  trades: [],
  index: 0
};
let selectedRuleHistoryCell = null;

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
    conditionType: "boolean",
    tagQuestion: "¿Activaste el BE a 20 pips?",
    defaultEnabled: true,
    executionRule: RULE_DEFINITIONS[3]
  },
  "ob-entry": {
    id: "ob-entry",
    name: "Entrada en OB candle open",
    description: "Mide desviación frente a la entrada técnica ideal.",
    source: "mixed",
    weight: 1.5,
    params: {},
    conditionType: "boolean",
    tagQuestion: "¿El entry fue en el OB candle open (o 50% si el SL no cubre)?",
    defaultEnabled: true,
    executionRule: RULE_DEFINITIONS[2]
  },
  "valid-setup": {
    id: "valid-setup",
    name: "Setup válido confirmado",
    description: "Requiere etiquetar y validar el setup antes de operar.",
    source: "manual",
    weight: 1.5,
    params: {},
    conditionType: "boolean",
    tagQuestion: "¿El setup estaba validado antes de entrar?",
    defaultEnabled: true,
    executionRule: RULE_DEFINITIONS[5]
  },
  "daily-drawdown-limit": {
    id: "daily-drawdown-limit",
    name: "Límite de drawdown diario",
    description: "Controla la pérdida máxima permitida por día.",
    source: "auto",
    weight: 2.0,
    params: { pct: 2 },
    executionRule: "Límite de drawdown diario"
  },
  "news-blackout": {
    id: "news-blackout",
    name: "Bloqueo por noticias",
    description: "Evita operar durante ventanas de alto impacto.",
    source: "auto",
    weight: 1.5,
    params: { minutes: 30 },
    executionRule: "Bloqueo por noticias"
  },
  "min-rr-ratio": {
    id: "min-rr-ratio",
    name: "R:R mínimo",
    description: "Exige relación riesgo/beneficio mínima antes de entrar.",
    source: "auto",
    weight: 1.5,
    params: { ratio: 1.5 },
    executionRule: "R:R mínimo"
  },
  "max-daily-loss": {
    id: "max-daily-loss",
    name: "Pérdida diaria máxima",
    description: "Corta operativa al alcanzar el límite de pérdida diaria.",
    source: "auto",
    weight: 2.0,
    params: { amount: 500 },
    executionRule: "Pérdida diaria máxima"
  },
  "consecutive-losses": {
    id: "consecutive-losses",
    name: "Pérdidas consecutivas",
    description: "Detiene la sesión tras una racha negativa definida.",
    source: "auto",
    weight: 3.0,
    params: { max: 2 },
    executionRule: "Pérdidas consecutivas"
  },
  "allowed-pairs": {
    id: "allowed-pairs",
    name: "Par en lista permitida",
    description: "El par operado estaba en la lista de pares del plan.",
    source: "manual",
    weight: 1.5,
    conditionType: "boolean",
    tagQuestion: "¿El par operado estaba en tu lista de pares permitidos?",
    defaultEnabled: true,
    params: {},
    executionRule: "Par en lista permitida"
  },
  "london-confirmation": {
    id: "london-confirmation",
    name: "Confirmación London open",
    description: "Esperé la vela de confirmación post-London open antes de entrar.",
    source: "manual",
    weight: 1.5,
    conditionType: "boolean",
    tagQuestion: "¿Esperaste la vela de confirmación post-London open antes de entrar?",
    defaultEnabled: true,
    params: {},
    executionRule: "Confirmación London open"
  },
  "emotional-state": {
    id: "emotional-state",
    name: "Estado emocional",
    description: "Registro del estado psicológico antes de entrar.",
    source: "manual",
    weight: 0.5,
    conditionType: "enum",
    enumOptions: [
      { value: "calm", label: "Tranquilo", color: "#34D97B" },
      { value: "neutral", label: "Neutral", color: "#888888" },
      { value: "altered", label: "Alterado", color: "#FF5C5C" }
    ],
    tagQuestion: "¿Cómo era tu estado emocional antes de este trade?",
    defaultEnabled: false,
    excludeFromScore: true,
    params: {},
    executionRule: "Estado emocional"
  }
};

const CUSTOM_SOURCE_KEYWORDS = {
  auto: /pips|sl|stop|drawdown|p[eé]rdida|loss|hora|sesi[oó]n|trades\/d[ií]a|consecutiv|rr|ratio|horario|noticias|balance|%|precio/i,
  manual: /setup|confirmado|valid[eé]|revis[eé]|psicol[oó]gico|emoci[oó]n|plan|checklist|ob|order block|break even|\bbe\b|esper[eé]|verifiqu[eé]/i,
  mixed: /entrada|entry|precisi[oó]n|desviaci[oó]n|deviation|distancia/i
};

function slugify(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 42) || "regla";
}

function inferRuleSource(text = "") {
  if (CUSTOM_SOURCE_KEYWORDS.mixed.test(text)) return "mixed";
  if (CUSTOM_SOURCE_KEYWORDS.auto.test(text)) return "auto";
  if (CUSTOM_SOURCE_KEYWORDS.manual.test(text)) return "manual";
  return "manual";
}

function normalizeSource(value = "manual") {
  return ["auto", "manual", "mixed"].includes(value) ? value : "manual";
}

function normalizeConditionType(value = "boolean") {
  if (value === "numeric" || value === "enum") return value;
  return "boolean";
}

function normalizeNumericOperator(value = "<=") {
  return [">", ">=", "<", "<=", "="].includes(value) ? value : "<=";
}

function normalizeCustomRule(rule = {}) {
  const text = `${rule.name || ""} ${rule.description || ""} ${rule.tagQuestion || ""}`;
  const source = normalizeSource(rule.source || rule.suggestedSource || inferRuleSource(text));
  const conditionType = normalizeConditionType(rule.conditionType);
  return {
    id: String(rule.id || `custom-${slugify(rule.name || "regla")}-${Date.now()}`),
    name: String(rule.name || "Regla personalizada").trim().slice(0, 50),
    description: String(rule.description || "Regla definida por el usuario.").trim().slice(0, 120),
    source,
    suggestedSource: normalizeSource(rule.suggestedSource || inferRuleSource(text)),
    weight: normalizeWeight(rule.weight || 1),
    conditionType,
    numericThreshold: conditionType === "numeric" && Number.isFinite(Number(rule.numericThreshold)) ? Number(rule.numericThreshold) : "",
    numericOperator: normalizeNumericOperator(rule.numericOperator),
    numericUnit: String(rule.numericUnit || "").trim().slice(0, 16),
    tagQuestion: String(rule.tagQuestion || "").trim().slice(0, 120),
    isCustom: true,
    pendingImplementation: rule.pendingImplementation ?? source === "auto",
    createdAt: rule.createdAt || new Date().toISOString(),
    usedInProfiles: Array.isArray(rule.usedInProfiles) ? rule.usedInProfiles : []
  };
}

function resolveRuleDefinition(id, customRules = []) {
  return RULE_LIBRARY[id] || customRules.find((rule) => rule.id === id) || null;
}

function profileRule(id, overrides = {}, customRules = []) {
  const rule = resolveRuleDefinition(id, customRules);
  return {
    id,
    name: rule?.name || id,
    description: rule?.description || "Regla de ejecución.",
    enabled: true,
    source: rule?.source || "manual",
    weight: normalizeWeight(rule?.weight || 1),
    conditionType: rule?.conditionType || "boolean",
    numericThreshold: rule?.numericThreshold ?? "",
    numericOperator: rule?.numericOperator || "<=",
    numericUnit: rule?.numericUnit || "",
    enumOptions: Array.isArray(rule?.enumOptions) ? rule.enumOptions : [],
    tagQuestion: rule?.tagQuestion || "",
    isCustom: rule?.isCustom === true,
    pendingImplementation: rule?.pendingImplementation ?? false,
    excludeFromScore: rule?.excludeFromScore === true,
    defaultEnabled: rule?.defaultEnabled === true,
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
      allowedPairs: ["EURUSD", "GBPUSD", "USDCAD", "AUDUSD"],
      rules: [
        profileRule("sl-fixed"),
        profileRule("max-trades-per-day"),
        profileRule("session-window"),
        profileRule("london-confirmation"),
        profileRule("be-activation"),
        profileRule("ob-entry"),
        profileRule("valid-setup"),
        profileRule("allowed-pairs")
      ]
    },
    {
      id: "orion-phase1",
      name: "Orion Phase 1",
      type: "challenge",
      color: "#F5A623",
      description: "Max DD 10% · 30 días",
      allowedPairs: ["EURUSD", "GBPUSD", "USDCAD", "AUDUSD"],
      rules: [
        profileRule("sl-fixed"),
        profileRule("max-trades-per-day"),
        profileRule("session-window"),
        profileRule("london-confirmation"),
        profileRule("be-activation"),
        profileRule("ob-entry"),
        profileRule("valid-setup"),
        profileRule("allowed-pairs"),
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
      allowedPairs: ["EURUSD", "GBPUSD", "USDCAD", "AUDUSD"],
      rules: [
        profileRule("sl-fixed"),
        profileRule("max-trades-per-day"),
        profileRule("session-window"),
        profileRule("london-confirmation"),
        profileRule("be-activation"),
        profileRule("ob-entry"),
        profileRule("valid-setup"),
        profileRule("allowed-pairs"),
        profileRule("daily-drawdown-limit"),
        profileRule("news-blackout"),
        profileRule("max-daily-loss"),
        profileRule("consecutive-losses"),
        profileRule("min-rr-ratio")
      ]
    }
  ],
  accountMap: {},
  customRules: []
};

function cloneProfiles(value = DEFAULT_KMFX_PROFILES) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeAllowedPairs(value) {
  const source = Array.isArray(value) ? value : ["EURUSD", "GBPUSD", "USDCAD", "AUDUSD"];
  return [...new Set(source
    .map((pair) => String(pair || "").trim().toUpperCase())
    .filter(Boolean)
    .map((pair) => pair.replace(/[^A-Z0-9]/g, ""))
    .filter(Boolean))]
    .slice(0, 16);
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

function ruleWeightClass(weight) {
  const normalized = normalizeWeight(weight);
  if (normalized >= 3.0) return "is-absolute";
  if (normalized >= 2.0) return "is-critical";
  if (normalized <= 1.0) return "is-quiet";
  return "is-standard";
}

function ruleGroupKey(rule = {}) {
  const weight = normalizeWeight(rule.weight);
  if (weight >= 2.0) return "critical";
  if (["london-confirmation", "ob-entry", "valid-setup", "be-activation", "allowed-pairs", "emotional-state", "min-rr-ratio", "news-blackout"].includes(rule.id) || rule.isCustom) return "strategy";
  return "process";
}

const RULE_GROUPS = [
  { id: "critical", label: "CRÍTICAS" },
  { id: "strategy", label: "ESTRATEGIA" },
  { id: "process", label: "PROCESO" }
];

const AUTO_POSTTRADE_EXCLUDED_IDS = new Set([
  "sl-fixed",
  "max-trades-per-day",
  "session-window",
  "daily-drawdown-limit",
  "max-daily-loss",
  "news-blackout",
  "consecutive-losses",
  "min-rr-ratio"
]);

const POST_TRADE_RULE_ORDER = [
  "london-confirmation",
  "ob-entry",
  "valid-setup",
  "allowed-pairs",
  "be-activation",
  "emotional-state"
];

const QUICK_PLAN_RULE_IDS = [
  "london-confirmation",
  "ob-entry",
  "valid-setup",
  "allowed-pairs",
  "be-activation"
];

const DEFAULT_ENABLED_RULE_IDS = Object.values(RULE_LIBRARY)
  .filter((rule) => rule.defaultEnabled === true)
  .map((rule) => rule.id);

function ensureDefaultEnabledRules(profile, customRules = []) {
  const existingIds = new Set((profile.rules || []).map((rule) => rule.id));
  DEFAULT_ENABLED_RULE_IDS.forEach((ruleId) => {
    if (!existingIds.has(ruleId)) {
      profile.rules.push(profileRule(ruleId, { enabled: true }, customRules));
    }
  });
  return profile;
}

function hasProfileNormalizationDrift(raw, normalized) {
  try {
    const rawWeights = (raw?.profiles || []).flatMap((profile) => (profile.rules || []).map((rule) => Number(rule.weight)));
    const invalidWeight = rawWeights.some((weight) => !WEIGHT_OPTIONS.some((option) => option.value === weight));
    const missingTransient = raw && (
      !Object.prototype.hasOwnProperty.call(raw, "openAddRuleMenu") ||
      !Object.prototype.hasOwnProperty.call(raw, "openWeightId") ||
      !Object.prototype.hasOwnProperty.call(raw, "confirmRuleRemoveId") ||
      !Object.prototype.hasOwnProperty.call(raw, "customRules") ||
      (raw.profiles || []).some((profile) => !Object.prototype.hasOwnProperty.call(profile, "allowedPairs")) ||
      (raw.profiles || []).some((profile) => DEFAULT_ENABLED_RULE_IDS.some((ruleId) => !(profile.rules || []).some((rule) => rule.id === ruleId))) ||
      (raw.profiles || []).some((profile) => (profile.rules || []).some((rule) => RULE_LIBRARY[rule.id] && rule.source !== RULE_LIBRARY[rule.id].source))
    );
    return invalidWeight || missingTransient || !normalized.profiles.length;
  } catch {
    return true;
  }
}

function normalizeProfiles(raw) {
  const defaults = cloneProfiles();
  const profiles = Array.isArray(raw?.profiles) && raw.profiles.length ? raw.profiles : defaults.profiles;
  const customRules = Array.isArray(raw?.customRules) ? raw.customRules.map(normalizeCustomRule) : [];
  return {
    profiles: profiles.map((profile) => ensureDefaultEnabledRules({
      ...profile,
      allowedPairs: normalizeAllowedPairs(profile.allowedPairs),
      rules: Array.isArray(profile.rules) ? profile.rules.map((rule) => {
        const normalizedRule = profileRule(rule.id, rule, customRules);
        const systemRule = RULE_LIBRARY[rule.id];
        return {
          ...normalizedRule,
          source: systemRule?.source || normalizedRule.source,
          conditionType: systemRule?.conditionType || normalizedRule.conditionType,
          tagQuestion: systemRule?.tagQuestion || normalizedRule.tagQuestion,
          enumOptions: systemRule?.enumOptions || normalizedRule.enumOptions,
          excludeFromScore: systemRule?.excludeFromScore === true || normalizedRule.excludeFromScore,
          enabled: rule.enabled !== false,
          weight: normalizeWeight(rule.weight)
        };
      }) : []
    }, customRules)),
    accountMap: raw?.accountMap && typeof raw.accountMap === "object" ? raw.accountMap : {},
    activeProfileId: raw?.activeProfileId || profiles[0]?.id || "real-conservative",
    openMenuId: raw?.openMenuId || "",
    confirmDeleteId: raw?.confirmDeleteId || "",
    editingProfileId: raw?.editingProfileId || "",
    openAddRuleMenu: raw?.openAddRuleMenu || false,
    openWeightId: raw?.openWeightId || "",
    confirmRuleRemoveId: raw?.confirmRuleRemoveId || "",
    showCustomRuleForm: raw?.showCustomRuleForm || false,
    editingCustomRuleId: raw?.editingCustomRuleId || "",
    openCustomRuleMenuId: raw?.openCustomRuleMenuId || "",
    confirmCustomRuleDeleteId: raw?.confirmCustomRuleDeleteId || "",
    customRules
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

export function loadPostTradeTags() {
  try {
    const saved = window.localStorage?.getItem(KMFX_TAGS_STORAGE_KEY);
    const parsed = saved ? JSON.parse(saved) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (error) {
    console.warn("[KMFX][POST_TRADE_TAGS] falling back to empty tags", error);
    return {};
  }
}

export function savePostTradeTag(tradeId, data) {
  if (!tradeId) return false;
  const tags = loadPostTradeTags();
  const previous = tags[tradeId] && typeof tags[tradeId] === "object" ? tags[tradeId] : {};
  const answers = normalizeTagAnswers(data?.answers || data || {});
  tags[tradeId] = {
    ...previous,
    ...data,
    tradeId: data?.tradeId || previous.tradeId || tradeId,
    timestamp: data?.timestamp || previous.timestamp || new Date().toISOString(),
    tagQuestionVersion: data?.tagQuestionVersion || previous.tagQuestionVersion || 2,
    londonConfirmation: answers.londonConfirmation,
    obEntry: answers.obEntry,
    validSetup: answers.validSetup,
    beActivated: answers.beActivated,
    allowedPairs: answers.allowedPairs,
    emotionalState: answers.emotionalState,
    customAnswers: {
      ...(answers.customAnswers || {})
    },
    note: data?.note ?? previous.note ?? null,
    tagSkipped: data?.tagSkipped ?? false,
    tagPartial: data?.tagPartial ?? previous.tagPartial ?? false
  };
  delete tags[tradeId].answers;
  delete tags[tradeId].status;
  try {
    window.localStorage?.setItem(KMFX_TAGS_STORAGE_KEY, JSON.stringify(tags));
    return true;
  } catch (error) {
    console.warn("[KMFX][POST_TRADE_TAGS] save skipped", error);
    return false;
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
  clearRuleProfileTransientState(profileState);
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
  clearRuleProfileTransientState(profileState);
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

function syncCustomRuleUsage(profileState) {
  const profiles = Array.isArray(profileState.profiles) ? profileState.profiles : [];
  profileState.customRules = (profileState.customRules || []).map((rule) => ({
    ...normalizeCustomRule(rule),
    usedInProfiles: profiles
      .filter((profile) => (profile.rules || []).some((item) => item.id === rule.id))
      .map((profile) => profile.id)
  }));
}

function addCustomRuleToProfile(profile, customRule) {
  if (!profile || !customRule || (profile.rules || []).some((rule) => rule.id === customRule.id)) return;
  profile.rules.push(profileRule(customRule.id, { ...customRule, enabled: false }, [customRule]));
}

function upsertCustomRule(profileState, customRule, activeProfile) {
  const normalized = normalizeCustomRule(customRule);
  const exists = profileState.customRules.some((rule) => rule.id === normalized.id);
  profileState.customRules = exists
    ? profileState.customRules.map((rule) => (rule.id === normalized.id ? normalized : rule))
    : [...profileState.customRules, normalized];
  profileState.profiles = profileState.profiles.map((profile) => ({
    ...profile,
    rules: (profile.rules || []).map((rule) => (
      rule.id === normalized.id
        ? { ...profileRule(normalized.id, { ...normalized, enabled: rule.enabled !== false, weight: rule.weight }, [normalized]) }
        : rule
    ))
  }));
  const targetProfile = profileState.profiles.find((profile) => profile.id === activeProfile?.id);
  if (!exists) addCustomRuleToProfile(targetProfile, normalized);
  syncCustomRuleUsage(profileState);
}

function deleteCustomRuleFromAll(profileState, ruleId) {
  profileState.profiles = profileState.profiles.map((profile) => ({
    ...profile,
    rules: (profile.rules || []).filter((rule) => rule.id !== ruleId)
  }));
  profileState.customRules = (profileState.customRules || []).filter((rule) => rule.id !== ruleId);
}

function disableCustomRuleInAll(profileState, ruleId) {
  profileState.profiles = profileState.profiles.map((profile) => ({
    ...profile,
    rules: (profile.rules || []).map((rule) => (
      rule.id === ruleId ? { ...rule, enabled: false } : rule
    ))
  }));
  syncCustomRuleUsage(profileState);
}

function clearRuleProfileTransientState(profileState) {
  profileState.openMenuId = "";
  profileState.confirmDeleteId = "";
  profileState.editingProfileId = "";
  profileState.openAddRuleMenu = false;
  profileState.openWeightId = "";
  profileState.confirmRuleRemoveId = "";
  profileState.showCustomRuleForm = false;
  profileState.editingCustomRuleId = "";
  profileState.openCustomRuleMenuId = "";
  profileState.confirmCustomRuleDeleteId = "";
}

function sourceLabel(source = "manual") {
  if (source === "auto") return "Automático";
  if (source === "mixed") return "Mixto";
  return "Manual";
}

function conditionLabel(rule = {}) {
  if (rule.conditionType === "numeric") {
    const threshold = rule.numericThreshold !== "" && rule.numericThreshold !== null && rule.numericThreshold !== undefined
      ? ` ${rule.numericOperator || "<="} ${rule.numericThreshold}${rule.numericUnit ? ` ${rule.numericUnit}` : ""}`
      : "";
    return `Valor numérico${threshold}`;
  }
  return "Sí / No";
}

function createUniqueCustomRuleId(name, customRules = []) {
  const base = `custom-${slugify(name)}`;
  const usedIds = new Set(customRules.map((rule) => rule.id));
  if (!usedIds.has(base)) return base;
  let index = 2;
  while (usedIds.has(`${base}-${index}`)) index += 1;
  return `${base}-${index}`;
}

function getCustomRuleFormDraft(form) {
  const formData = new FormData(form);
  const name = String(formData.get("name") || "").trim().slice(0, 50);
  const description = String(formData.get("description") || "").trim().slice(0, 120);
  const tagQuestion = String(formData.get("tagQuestion") || "").trim().slice(0, 120);
  const text = `${name} ${description} ${tagQuestion}`;
  const source = normalizeSource(formData.get("source") || inferRuleSource(text));
  const conditionType = normalizeConditionType(formData.get("conditionType"));
  return {
    name,
    description,
    source,
    suggestedSource: inferRuleSource(text),
    conditionType,
    numericThreshold: conditionType === "numeric" ? formData.get("numericThreshold") : "",
    numericOperator: conditionType === "numeric" ? formData.get("numericOperator") : "<=",
    numericUnit: conditionType === "numeric" ? String(formData.get("numericUnit") || "").trim().slice(0, 16) : "",
    tagQuestion,
    weight: normalizeWeight(formData.get("weight")),
    pendingImplementation: source === "auto"
  };
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

function cssEscape(value = "") {
  if (window.CSS?.escape) return window.CSS.escape(String(value));
  return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

function toDayKey(dateLike) {
  const date = dateLike instanceof Date ? dateLike : new Date(dateLike);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isoWeekStart(dateLike) {
  const date = dateLike instanceof Date ? new Date(dateLike) : new Date(dateLike);
  if (Number.isNaN(date.getTime())) return null;
  const day = date.getDay() || 7;
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - day + 1);
  return date;
}

function isoWeekKey(dateLike) {
  const weekStart = isoWeekStart(dateLike);
  if (!weekStart) return "";
  const thursday = new Date(weekStart);
  thursday.setDate(weekStart.getDate() + 3);
  const firstThursday = new Date(thursday.getFullYear(), 0, 4);
  const firstWeekStart = isoWeekStart(firstThursday);
  const week = Math.round((weekStart - firstWeekStart) / 604800000) + 1;
  return `${thursday.getFullYear()}-W${String(week).padStart(2, "0")}`;
}

function formatShortDate(dateLike) {
  const date = dateLike instanceof Date ? dateLike : new Date(dateLike);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("es-ES", { day: "2-digit", month: "short" }).replace(".", "");
}

function formatRuleHistoryWeekLabel(dateLike) {
  const date = dateLike instanceof Date ? dateLike : new Date(dateLike);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("es-ES", { day: "numeric", month: "short" }).replace(".", "").toLowerCase();
}

function formatPct(value) {
  return Number.isFinite(Number(value)) ? `${Math.round(Number(value))}%` : "Pendiente";
}

function formatPips(value) {
  return Number.isFinite(Number(value)) ? `${Number(value).toFixed(1)} pips` : "Pendiente";
}

function formatHistoryTradeDate(dateLike) {
  const date = dateLike instanceof Date ? dateLike : new Date(dateLike);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("es-ES", { day: "numeric", month: "short" }).replace(".", "").toLowerCase();
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
  return /sin datos|sin historial|sin operaciones|pendiente|tracking EA|tag pendiente/i.test(String(note));
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

function tradeIdForTag(trade = {}, index = 0) {
  const explicit = trade.id || trade.ticket || trade.ticketId || trade.dealId || trade.orderId || trade.positionId;
  if (explicit) return String(explicit);
  const when = trade.when instanceof Date ? trade.when.toISOString() : String(trade.when || trade.closeTime || trade.openTime || "");
  return [
    trade.symbol || "trade",
    trade.direction || trade.type || "",
    when,
    trade.entry ?? "",
    trade.exit ?? trade.close ?? "",
    trade.pnl ?? "",
    index
  ].join(":");
}

function normalizeTradeForTag(trade = {}, index = 0) {
  const parsedWhen = trade.when instanceof Date ? trade.when : new Date(trade.timestamp || trade.closeTime || trade.openTime || Date.now());
  const when = !Number.isNaN(parsedWhen.getTime()) ? parsedWhen : new Date();
  const direction = String(trade.direction || trade.type || "BUY").toUpperCase();
  const pips = Number(trade.pips ?? trade.pipsResult ?? trade.profitPips);
  const pnl = Number(trade.pnl ?? trade.profit ?? trade.result ?? 0);
  return {
    id: trade.id || tradeIdForTag({ ...trade, when }, index),
    symbol: String(trade.symbol || trade.pair || "EURUSD").toUpperCase(),
    direction: direction.includes("SELL") ? "SELL" : "BUY",
    pips: Number.isFinite(pips) ? pips : Math.round(pnl / 10),
    pnl,
    when,
    timestamp: when.toISOString()
  };
}

function postTagForTrade(tags = {}, trade = {}, index = 0) {
  const normalizedId = normalizeTradeForTag(trade, index).id;
  return tags[trade.id] || tags[normalizedId] || tags[tradeIdForTag(trade, index)] || null;
}

function mergeTradesWithPostTags(trades = [], tags = {}) {
  return trades.map((trade, index) => {
    const normalizedTrade = normalizeTradeForTag(trade, index);
    return {
      ...trade,
      id: trade.id || normalizedTrade.id,
      postTag: tags[trade.id] || tags[normalizedTrade.id] || null
    };
  });
}

function tagAnswerKey(ruleId = "") {
  if (ruleId === "london-confirmation") return "londonConfirmation";
  if (ruleId === "be-activation") return "beActivated";
  if (ruleId === "ob-entry") return "obEntry";
  if (ruleId === "valid-setup") return "validSetup";
  if (ruleId === "allowed-pairs") return "allowedPairs";
  if (ruleId === "emotional-state") return "emotionalState";
  return "";
}

function getTagAnswer(tag, ruleId) {
  const key = tagAnswerKey(ruleId);
  if (key) return tag?.[key] ?? tag?.answers?.[key] ?? null;
  return tag?.customAnswers?.[ruleId] ?? tag?.answers?.customRules?.[ruleId] ?? null;
}

function getTaggableRules(profile) {
  const rules = Array.isArray(profile?.rules) ? profile.rules : [];
  return rules
    .filter((rule) => {
      if (AUTO_POSTTRADE_EXCLUDED_IDS.has(rule.id)) return false;
      const source = normalizeSource(rule.source);
      return rule.enabled !== false && (source === "manual" || source === "mixed");
    })
    .sort((a, b) => {
      const aIndex = POST_TRADE_RULE_ORDER.includes(a.id) ? POST_TRADE_RULE_ORDER.indexOf(a.id) : 99;
      const bIndex = POST_TRADE_RULE_ORDER.includes(b.id) ? POST_TRADE_RULE_ORDER.indexOf(b.id) : 99;
      return aIndex - bIndex;
    });
}

function evaluateNumericAnswer(rule, value) {
  const actual = Number(value);
  const threshold = Number(rule.numericThreshold);
  if (!Number.isFinite(actual) || !Number.isFinite(threshold)) return null;
  const operator = normalizeNumericOperator(rule.numericOperator || "<=");
  if (operator === ">") return actual > threshold;
  if (operator === ">=") return actual >= threshold;
  if (operator === "<") return actual < threshold;
  if (operator === "<=") return actual <= threshold;
  return actual === threshold;
}

function evaluateTagAnswer(rule, value) {
  if (value === null || value === undefined || value === "") return null;
  if (normalizeConditionType(rule.conditionType) === "enum") return rule.excludeFromScore ? null : Boolean(value);
  if (normalizeConditionType(rule.conditionType) === "numeric") return evaluateNumericAnswer(rule, value);
  if (typeof value === "boolean") return value;
  if (String(value).toLowerCase() === "true") return true;
  if (String(value).toLowerCase() === "false") return false;
  return null;
}

function buildPostTradeTagStats(profile, recentTrades = [], tags = {}) {
  const taggableRules = getTaggableRules(profile);
  return taggableRules.reduce((map, rule) => {
    if (rule.excludeFromScore) {
      map[rule.id] = { answered: 0, awaiting: 0, total: 0, pct: null };
      return map;
    }
    let answered = 0;
    let awaiting = 0;
    let passed = 0;
    recentTrades.forEach((trade, index) => {
      const tag = trade.postTag || postTagForTrade(tags, trade, index);
      if (!tag || tag.tagSkipped === true) {
        awaiting += 1;
        return;
      }
      const result = evaluateTagAnswer(rule, getTagAnswer(tag, rule.id));
      if (result === null) {
        awaiting += 1;
        return;
      }
      answered += 1;
      if (result) passed += 1;
    });
    map[rule.id] = {
      answered,
      awaiting,
      total: answered + awaiting,
      pct: answered ? (passed / answered) * 100 : null
    };
    return map;
  }, {});
}

function getPendingTagTrades(profile, recentTrades = [], tags = {}) {
  const taggableRules = getTaggableRules(profile);
  if (!taggableRules.length) return [];
  return recentTrades
    .map((trade, index) => normalizeTradeForTag(trade, index))
    .filter((trade, index) => {
      const tag = postTagForTrade(tags, trade, index);
      if (!tag) return true;
      if (tag.tagSkipped === true || tag.tagPartial === true) return true;
      return taggableRules.some((rule) => evaluateTagAnswer(rule, getTagAnswer(tag, rule.id)) === null);
    });
}

function buildEmptyTagData(trade, rules = []) {
  const tag = {
    tradeId: trade?.id || "",
    timestamp: trade?.timestamp || new Date().toISOString(),
    tagQuestionVersion: 2,
    londonConfirmation: null,
    obEntry: null,
    validSetup: null,
    beActivated: null,
    allowedPairs: null,
    emotionalState: null,
    customAnswers: {},
    note: null,
    tagSkipped: true,
    tagPartial: true
  };
  rules.forEach((rule) => {
    const key = tagAnswerKey(rule.id);
    if (key && Object.prototype.hasOwnProperty.call(tag, key)) tag[key] = null;
    if (!key) tag.customAnswers[rule.id] = null;
  });
  return tag;
}

function normalizeTagAnswers(answers = {}) {
  return {
    londonConfirmation: answers.londonConfirmation ?? null,
    beActivated: answers.beActivated ?? null,
    obEntry: answers.obEntry ?? null,
    validSetup: answers.validSetup ?? null,
    allowedPairs: answers.allowedPairs ?? null,
    emotionalState: answers.emotionalState ?? null,
    customAnswers: { ...(answers.customAnswers || answers.customRules || {}) }
  };
}

function initCurrentTagDraft(trade, tag = {}) {
  if (currentTagDraft.tradeId === trade.id) return;
  currentTagDraft = {
    tradeId: trade.id,
    answers: normalizeTagAnswers(tag.answers || tag),
    note: tag.note || "",
    reviewMode: false,
    saveAttempted: false
  };
}

function draftAnswerForRule(ruleId) {
  const key = tagAnswerKey(ruleId);
  if (key) return currentTagDraft.answers?.[key] ?? null;
  return currentTagDraft.answers?.customAnswers?.[ruleId] ?? null;
}

function setDraftAnswer(ruleId, value) {
  const key = tagAnswerKey(ruleId);
  if (key) {
    currentTagDraft.answers[key] = value;
    return;
  }
  currentTagDraft.answers.customAnswers = currentTagDraft.answers.customAnswers || {};
  currentTagDraft.answers.customAnswers[ruleId] = value;
}

function resetCurrentTagDraft() {
  currentTagDraft = { tradeId: null, answers: {}, note: "", reviewMode: false, saveAttempted: false };
}

function resetPostTradeQueue() {
  postTradeQueueState = { trades: [], index: 0 };
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

function evaluateTradePostTag(trade, index, profile, tags = {}) {
  const rules = getTaggableRules(profile).filter((rule) => !rule.excludeFromScore);
  if (!rules.length) return null;
  const tag = trade.postTag || postTagForTrade(tags, trade, index);
  if (!tag || tag.tagSkipped === true) {
    return { passed: 0, failed: 0, awaiting: rules.length };
  }
  return rules.reduce((summary, rule) => {
    const result = evaluateTagAnswer(rule, getTagAnswer(tag, rule.id));
    if (result === true) summary.passed += 1;
    else if (result === false) summary.failed += 1;
    else summary.awaiting += 1;
    return summary;
  }, { passed: 0, failed: 0, awaiting: 0 });
}

function buildExecutionHeatmap(recentTrades = [], fallback = disciplineData, profile = null, tags = {}) {
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
        const tagSummaries = profile
          ? bucket.trades.map((trade, tradeIndex) => evaluateTradePostTag(trade, tradeIndex, profile, tags)).filter(Boolean)
          : [];
        if (tagSummaries.length) {
          const failed = tagSummaries.reduce((sum, item) => sum + item.failed, 0);
          const awaiting = tagSummaries.reduce((sum, item) => sum + item.awaiting, 0);
          state = failed >= 2 ? "miss" : failed === 1 || awaiting > 0 ? "warn" : "clean";
        } else {
          const outside = bucket.trades.some((trade) => trade.when.getHours() >= 17);
          const overtraded = bucket.trades.length > 1;
          const negative = bucket.pnl < 0;
          state = outside || (overtraded && negative) ? "miss" : overtraded || negative ? "warn" : "clean";
        }
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

function calculateManualTagScore(mergedTrades = [], enabledRules = []) {
  const supportedRuleIds = new Set([
    "london-confirmation",
    "ob-entry",
    "valid-setup",
    "allowed-pairs",
    "be-activation"
  ]);
  const evaluatedRules = enabledRules
    .filter((rule) => (
      rule.enabled !== false &&
      rule.pendingImplementation !== true &&
      supportedRuleIds.has(rule.id) &&
      ["manual", "mixed"].includes(normalizeSource(rule.source))
    ))
    .map((rule) => {
      const key = tagAnswerKey(rule.id);
      let eligible = 0;
      let passed = 0;
      mergedTrades.forEach((trade) => {
        const tag = trade.postTag;
        if (!tag || tag.tagSkipped === true || tag[key] === null || tag[key] === undefined) return;
        if (typeof tag[key] !== "boolean") return;
        eligible += 1;
        if (tag[key] === true) passed += 1;
      });
      return {
        id: rule.id,
        name: rule.name,
        weight: normalizeWeight(rule.weight || 1),
        eligible,
        passed,
        pct: eligible ? (passed / eligible) * 100 : null
      };
    });
  const eligibleRules = evaluatedRules.filter((rule) => rule.eligible > 0 && Number.isFinite(Number(rule.pct)));
  const totalWeight = eligibleRules.reduce((sum, rule) => sum + rule.weight, 0);
  const overall = totalWeight
    ? eligibleRules.reduce((sum, rule) => sum + (rule.pct * rule.weight), 0) / totalWeight
    : null;
  const weakestRule = eligibleRules
    .slice()
    .sort((a, b) => a.pct - b.pct)[0] || null;
  return {
    overall,
    rules: evaluatedRules,
    eligibleRules,
    weakestRule
  };
}

function buildRuleHistory(mergedTrades = [], profile = {}) {
  const rules = getTaggableRules(profile).filter((rule) => (
    rule.enabled !== false &&
    rule.pendingImplementation !== true &&
    !rule.excludeFromScore &&
    ["manual", "mixed"].includes(normalizeSource(rule.source))
  ));
  const buckets = new Map();
  mergedTrades.forEach((trade) => {
    const weekStart = isoWeekStart(trade.when);
    const week = isoWeekKey(trade.when);
    if (!weekStart || !week || !trade.postTag || trade.postTag.tagSkipped === true) return;
    const label = formatRuleHistoryWeekLabel(weekStart);
    rules.forEach((rule) => {
      const result = evaluateTagAnswer(rule, getTagAnswer(trade.postTag, rule.id));
      if (result === null) return;
      const key = `${rule.id}:${week}`;
      const bucket = buckets.get(key) || {
        ruleId: rule.id,
        ruleName: rule.name,
        week,
        label,
        total: 0,
        failed: 0,
        passed: 0,
        failedTrades: []
      };
      bucket.total += 1;
      if (result === true) bucket.passed += 1;
      else {
        bucket.failed += 1;
        bucket.failedTrades.push(buildRuleHistoryFailedTrade(trade, rule));
      }
      buckets.set(key, bucket);
    });
  });
  return rules.reduce((history, rule) => {
    history[rule.id] = [...buckets.values()]
      .filter((bucket) => bucket.ruleId === rule.id)
      .sort((a, b) => a.week.localeCompare(b.week))
      .map((bucket) => ({
        week: bucket.week,
        label: bucket.label,
        pct: bucket.total ? (bucket.passed / bucket.total) * 100 : null,
        total: bucket.total,
        failed: bucket.failed,
        ruleName: bucket.ruleName,
        failedTrades: bucket.failedTrades
      }));
    return history;
  }, {});
}

function ruleHistoryFailReason(ruleId) {
  const reasons = {
    "london-confirmation": "Entraste sin esperar confirmación London",
    "ob-entry": "Entrada fuera de OB candle open",
    "valid-setup": "Setup no validado antes de entrar",
    "allowed-pairs": "Par fuera de lista permitida",
    "be-activation": "BE no activado según plan"
  };
  return reasons[ruleId] || "Regla no cumplida en este trade";
}

function buildRuleHistoryFailedTrade(trade = {}, rule = {}) {
  const normalized = normalizeTradeForTag(trade);
  return {
    tradeId: normalized.id,
    date: normalized.when,
    pair: normalized.symbol,
    direction: normalized.direction,
    result: normalized.pips,
    pnl: normalized.pnl,
    failReason: ruleHistoryFailReason(rule.id),
    note: trade.postTag?.note || null
  };
}

function ruleHistoryTone(pct) {
  if (!Number.isFinite(Number(pct))) return "empty";
  if (pct >= 90) return "strong";
  if (pct >= 75) return "ok";
  if (pct >= 50) return "warn";
  return "bad";
}

function renderRuleHistoryDetail(point, rule, weekLabel) {
  if (!selectedRuleHistoryCell) return "";
  const headerRule = rule?.name || "Regla";
  const label = point?.label || weekLabel || selectedRuleHistoryCell.week;
  if (!point) {
    return `
      <div id="discipline-history-detail" class="rule-history-detail">
        <div class="rule-history-detail__header">
          <div>
            <strong>${escapeHtml(headerRule)} · semana ${escapeHtml(label)}</strong>
            <p>Sin datos esta semana</p>
          </div>
        </div>
      </div>
    `;
  }
  if (!point.failed) {
    return `
      <div id="discipline-history-detail" class="rule-history-detail">
        <div class="rule-history-detail__header">
          <div>
            <strong>${escapeHtml(headerRule)} · semana ${escapeHtml(label)}</strong>
            <p>0/${point.total} trades fallaron</p>
          </div>
        </div>
        <div class="rule-history-detail__empty">✓ Semana perfecta en esta regla</div>
      </div>
    `;
  }
  return `
    <div id="discipline-history-detail" class="rule-history-detail">
      <div class="rule-history-detail__header">
        <div>
          <strong>${escapeHtml(headerRule)} · semana ${escapeHtml(label)}</strong>
          <p>${point.failed}/${point.total} trades fallaron</p>
        </div>
      </div>
      <div class="rule-history-detail__list">
        ${(point.failedTrades || []).map((trade) => {
          const result = Number(trade.result);
          const resultLabel = Number.isFinite(result)
            ? `${result > 0 ? "+" : ""}${Math.round(result)} pips`
            : `${Number(trade.pnl) > 0 ? "+" : ""}${Math.round(Number(trade.pnl) || 0)} $`;
          const resultClass = Number.isFinite(result) && result < 0 ? "is-negative" : "is-positive";
          return `
            <article class="rule-history-detail__row">
              <div class="rule-history-detail__meta">
                <span>${escapeHtml(formatHistoryTradeDate(trade.date))}</span>
                <span>${escapeHtml(trade.pair)}</span>
                <span>${escapeHtml(trade.direction)}</span>
                <b class="${resultClass}">${escapeHtml(resultLabel)}</b>
              </div>
              <strong>${escapeHtml(trade.failReason)}</strong>
              ${trade.note ? `<em>${escapeHtml(trade.note)}</em>` : ""}
            </article>
          `;
        }).join("")}
      </div>
    </div>
  `;
}

function renderRuleHistory(history = {}, profile = {}) {
  const rules = getTaggableRules(profile).filter((rule) => (
    rule.enabled !== false &&
    rule.pendingImplementation !== true &&
    !rule.excludeFromScore &&
    ["manual", "mixed"].includes(normalizeSource(rule.source))
  ));
  const weekMap = new Map();
  Object.values(history).flat().forEach((point) => {
    if (!weekMap.has(point.week)) weekMap.set(point.week, point.label);
  });
  const weeks = [...weekMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const selectedRule = selectedRuleHistoryCell
    ? rules.find((rule) => rule.id === selectedRuleHistoryCell.ruleId)
    : null;
  const selectedPoint = selectedRuleHistoryCell
    ? (history[selectedRuleHistoryCell.ruleId] || []).find((point) => point.week === selectedRuleHistoryCell.week)
    : null;
  const selectedWeekLabel = selectedRuleHistoryCell
    ? weeks.find(([week]) => week === selectedRuleHistoryCell.week)?.[1]
    : "";
  if (weeks.length < 2) {
    return `
      <section id="discipline-rule-history" class="tl-section-card execution-panel rule-history">
        <div class="rule-history__header">
          <div>
            <strong>Historial de cumplimiento</strong>
            <p>Evolución semanal de reglas etiquetadas.</p>
          </div>
        </div>
        <div class="rule-history__empty">Historial insuficiente — necesitas más trades etiquetados</div>
      </section>
    `;
  }
  return `
    <section id="discipline-rule-history" class="tl-section-card execution-panel rule-history">
      <div class="rule-history__header">
        <div>
          <strong>Historial de cumplimiento</strong>
          <p>Evolución semanal de reglas etiquetadas.</p>
        </div>
        <div class="rule-history__legend" aria-label="Leyenda de cumplimiento">
          <span><i class="is-bad"></i>0–49</span>
          <span><i class="is-warn"></i>50–74</span>
          <span><i class="is-ok"></i>75–89</span>
          <span><i class="is-strong"></i>90–100</span>
        </div>
      </div>
      <div class="rule-history__body">
        <div class="rule-history__grid" style="--rule-history-cols:${weeks.length}">
          <div class="rule-history__corner"></div>
          ${weeks.map(([, label]) => `<span class="rule-history__week">${escapeHtml(label)}</span>`).join("")}
          ${rules.map((rule) => {
            const points = new Map((history[rule.id] || []).map((point) => [point.week, point]));
            return `
              <span class="rule-history__rule" title="${escapeHtml(rule.name)}">${escapeHtml(rule.name)}</span>
              ${weeks.map(([week, label]) => {
                const point = points.get(week);
                const tone = ruleHistoryTone(point?.pct);
                const isSelected = selectedRuleHistoryCell?.ruleId === rule.id && selectedRuleHistoryCell?.week === week;
                const title = point
                  ? `${rule.name} · ${point.label}: ${Math.round(point.pct)}% cumplimiento · ${point.total} trades`
                  : `${rule.name} · ${label}: sin datos`;
                return `
                  <button
                    type="button"
                    class="rule-history__cell is-${tone}${isSelected ? " is-selected" : ""}"
                    title="${escapeHtml(title)}"
                    data-rule-history-cell
                    data-rule-id="${escapeHtml(rule.id)}"
                    data-rule-week="${escapeHtml(week)}"
                    aria-label="${escapeHtml(title)}"
                  ></button>
                `;
              }).join("")}
            `;
          }).join("")}
        </div>
      </div>
      ${renderRuleHistoryDetail(selectedPoint, selectedRule, selectedWeekLabel)}
    </section>
  `;
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
    "requiere validación del setup": "requiere validación del setup",
    "según post-trade tag": "según post-trade tag",
    "tag pendiente": "tag pendiente",
    "tracking pendiente": "tracking pendiente",
    "Pendiente": "Pendiente"
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
function ruleRowFromProfileRule(profileRuleItem, currentRows = [], tagStats = {}) {
  const libraryRule = RULE_LIBRARY[profileRuleItem.id] || {};
  const executionName = libraryRule.executionRule || profileRuleItem.name;
  const matchedRow = currentRows.find((row) => row.name === executionName);
  const pendingImplementation = profileRuleItem.isCustom && profileRuleItem.source === "auto" && profileRuleItem.pendingImplementation !== false;
  const source = normalizeSource(profileRuleItem.source);
  const manualStats = source === "manual" || source === "mixed" || tagAnswerKey(profileRuleItem.id) ? tagStats[profileRuleItem.id] : null;
  const usesManualTags = Boolean(manualStats);
  if (usesManualTags) {
    const total = manualStats.total || 0;
    const awaitingRatio = total ? manualStats.awaiting / total : 0;
    const note = !manualStats.answered
      ? "Pendiente"
      : awaitingRatio > 0.3
        ? "tracking pendiente"
        : "según post-trade tag";
    return {
      ...(matchedRow || {}),
      name: executionName,
      profileRuleName: profileRuleItem.name,
      profileRuleId: profileRuleItem.id,
      weight: profileRuleItem.weight,
      note,
      pct: manualStats.pct
    };
  }
  if (matchedRow) {
    return {
      ...matchedRow,
      name: executionName,
      profileRuleName: profileRuleItem.name,
      profileRuleId: profileRuleItem.id,
      weight: profileRuleItem.weight,
      note: pendingImplementation ? "requiere configuración" : matchedRow.note,
      pct: pendingImplementation ? null : matchedRow.pct
    };
  }
  return {
    name: executionName,
    profileRuleName: profileRuleItem.name,
    profileRuleId: profileRuleItem.id,
    pct: null,
    note: pendingImplementation ? "requiere configuración" : "sin datos suficientes",
    weight: profileRuleItem.weight
  };
}

function buildProfileRuleRows(profile, currentRows = [], tagStats = {}) {
  const rules = Array.isArray(profile?.rules) ? profile.rules : [];
  return rules
    .filter((rule) => rule.enabled !== false)
    .map((rule) => ruleRowFromProfileRule(rule, currentRows, tagStats));
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
              <b>×${option.value.toFixed(1)}</b>
              <strong>${escapeHtml(option.label)}</strong>
              <span>· ${escapeHtml(option.short)}</span>
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
  const availableCustomRules = (profileState.customRules || []).filter((rule) => !existingIds.has(rule.id));
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
          ${availableCustomRules.length ? availableCustomRules.map((rule) => {
            const weight = getWeightOption(rule.weight);
            return `
              <button type="button" data-rule-add-custom="${escapeHtml(rule.id)}">
                <strong>${escapeHtml(rule.name)}</strong>
                <small>${escapeHtml(rule.description)} · ${escapeHtml(conditionLabel(rule))}</small>
                <em>×${weight.value.toFixed(1)} ${escapeHtml(weight.label)}</em>
              </button>
            `;
          }).join("") : `<p>No hay reglas personalizadas disponibles para añadir.</p>`}
          <div class="rule-profile-add-separator" aria-hidden="true"></div>
          <button type="button" class="rule-profile-add-create" data-rule-action="new-custom-rule">
            <strong>Crear regla nueva</strong>
            <small>Definir regla local para este perfil</small>
          </button>
        </div>
      ` : ""}
    </div>
  `;
}

function renderCustomRuleForm(profileState) {
  if (!profileState.showCustomRuleForm && !profileState.editingCustomRuleId) return "";
  const editingRule = (profileState.customRules || []).find((rule) => rule.id === profileState.editingCustomRuleId);
  const rule = normalizeCustomRule(editingRule || {
    id: "",
    name: "",
    description: "",
    source: "manual",
    conditionType: "boolean",
    weight: 1.0,
    tagQuestion: ""
  });
  const isEditing = Boolean(editingRule);
  const suggested = inferRuleSource(`${rule.name} ${rule.description} ${rule.tagQuestion}`);
  return `
    <form class="rule-profile-custom-form" data-rule-action="custom-rule-form" data-custom-rule-id="${escapeHtml(isEditing ? rule.id : "")}">
      <div class="rule-profile-custom-form__head">
        <div>
          <span>${isEditing ? "Editar regla" : "Nueva regla personalizada"}</span>
          <strong>${isEditing ? escapeHtml(rule.name) : "Crear regla nueva"}</strong>
          <p>Las reglas custom viven en localStorage y no modifican las reglas del sistema.</p>
        </div>
        <button type="button" data-rule-action="cancel-custom-rule">Cancelar</button>
      </div>
      <div class="rule-profile-custom-grid">
        <label>
          <span>Nombre</span>
          <input name="name" maxlength="50" value="${isEditing ? escapeHtml(rule.name) : ""}" placeholder="Ej. Validar liquidez antes de entrar" required>
        </label>
        <label>
          <span>Tipo de medición</span>
          <select name="source">
            <option value="manual" ${rule.source === "manual" ? "selected" : ""}>Manual</option>
            <option value="auto" ${rule.source === "auto" ? "selected" : ""}>Automático</option>
            <option value="mixed" ${rule.source === "mixed" ? "selected" : ""}>Mixto</option>
          </select>
        </label>
        <label class="rule-profile-custom-grid__wide">
          <span>Descripción</span>
          <textarea name="description" maxlength="120" placeholder="Qué comportamiento o condición controla esta regla">${isEditing ? escapeHtml(rule.description) : ""}</textarea>
        </label>
        <label>
          <span>Condición</span>
          <select name="conditionType" data-custom-condition-type>
            <option value="boolean" ${rule.conditionType === "boolean" ? "selected" : ""}>Sí / No</option>
            <option value="numeric" ${rule.conditionType === "numeric" ? "selected" : ""}>Valor numérico</option>
          </select>
        </label>
        <label>
          <span>Peso</span>
          <select name="weight">
            ${WEIGHT_OPTIONS.map((option) => `
              <option value="${option.value}" ${normalizeWeight(rule.weight) === option.value ? "selected" : ""}>×${option.value.toFixed(1)} ${escapeHtml(option.label)}</option>
            `).join("")}
          </select>
        </label>
        <div class="rule-profile-custom-numeric${rule.conditionType === "numeric" ? " is-visible" : ""}" data-custom-numeric-fields>
          <label>
            <span>Operador</span>
            <select name="numericOperator">
              ${[">", ">=", "<", "<=", "="].map((operator) => `<option value="${operator}" ${rule.numericOperator === operator ? "selected" : ""}>${operator}</option>`).join("")}
            </select>
          </label>
          <label>
            <span>Umbral</span>
            <input name="numericThreshold" inputmode="decimal" value="${escapeHtml(rule.numericThreshold)}" placeholder="2.0">
          </label>
          <label>
            <span>Unidad</span>
            <input name="numericUnit" maxlength="16" value="${escapeHtml(rule.numericUnit)}" placeholder="pips, %, trades">
          </label>
        </div>
        <label class="rule-profile-custom-grid__wide">
          <span>Pregunta post-trade</span>
          <input name="tagQuestion" maxlength="120" value="${escapeHtml(rule.tagQuestion)}" placeholder="¿Se cumplió esta regla en el trade?">
        </label>
      </div>
      <div class="rule-profile-custom-form__footer">
        <p data-custom-source-hint>Fuente sugerida: ${escapeHtml(sourceLabel(suggested))}</p>
        <button type="submit">${isEditing ? "Guardar regla" : "Crear y añadir"}</button>
      </div>
    </form>
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
  const groupedRules = RULE_GROUPS.map((group) => ({
    ...group,
    rules: rules
      .filter((rule) => ruleGroupKey(rule) === group.id)
      .sort((a, b) => normalizeWeight(b.weight) - normalizeWeight(a.weight))
  })).filter((group) => group.rules.length);
  const renderRule = (rule) => {
    const isConfirmingRemove = profileState.confirmRuleRemoveId === rule.id;
    const isCustomMenuOpen = profileState.openCustomRuleMenuId === rule.id;
    const isWeightOpen = profileState.openWeightId === rule.id;
    const isConfirmingCustomDelete = profileState.confirmCustomRuleDeleteId === rule.id;
    const activeRules = rules.filter((item) => item.enabled !== false);
    const cannotRemove = rule.enabled !== false && activeRules.length <= 1;
    const pendingBadge = rule.isCustom && rule.pendingImplementation ? " · requiere configuración" : "";
    return `
      <div class="rule-profile-rule ${ruleWeightClass(rule.weight)}${rule.enabled === false ? " is-disabled" : ""}${isCustomMenuOpen ? " custom-menu-open" : ""}${isWeightOpen ? " is-weight-open" : ""}" data-rule-id="${escapeHtml(rule.id)}">
        <label class="rule-profile-toggle">
          <input type="checkbox" data-rule-toggle="${escapeHtml(rule.id)}" ${rule.enabled !== false ? "checked" : ""}>
          <span></span>
        </label>
        <div class="rule-profile-rule__copy">
          <strong>${escapeHtml(rule.name)}</strong>
          <p>${escapeHtml(rule.description)}</p>
        </div>
        <span class="rule-profile-badge rule-profile-badge--${escapeHtml(normalizeSource(rule.source))}">${escapeHtml(sourceLabel(rule.source))}${escapeHtml(pendingBadge)}</span>
        ${renderWeightDropdown(rule, profileState)}
        ${rule.isCustom ? `
          <div class="rule-profile-custom-actions">
            <button type="button" class="rule-profile-custom-menu-trigger" data-custom-rule-menu="${escapeHtml(rule.id)}" aria-label="Opciones de regla personalizada">···</button>
            ${isCustomMenuOpen ? `
              <div class="rule-profile-custom-menu">
                <button type="button" data-custom-rule-edit="${escapeHtml(rule.id)}">Editar regla</button>
                <button type="button" class="danger" data-custom-rule-delete="${escapeHtml(rule.id)}">Eliminar regla</button>
                ${isConfirmingCustomDelete ? `
                  <div class="rule-profile-custom-confirm">
                    <strong>Eliminar regla</strong>
                    <p>Esta regla personalizada está disponible en varios perfiles.</p>
                    <div>
                      <button type="button" data-custom-rule-cancel-delete="${escapeHtml(rule.id)}">Cancelar</button>
                      <button type="button" data-custom-rule-disable-all="${escapeHtml(rule.id)}">Desactivar en todos</button>
                      <button type="button" class="danger" data-custom-rule-delete-all="${escapeHtml(rule.id)}">Eliminar de todos</button>
                    </div>
                  </div>
                ` : ""}
              </div>
            ` : ""}
          </div>
        ` : `<span></span>`}
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
  };
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
      ${renderAllowedPairsEditor(profile)}
      ${renderCustomRuleForm(profileState)}
      <div class="rule-profile-rule-list">
        ${groupedRules.map((group) => `
          <div class="rule-profile-rule-group" data-rule-group="${escapeHtml(group.id)}">
            <span>${escapeHtml(group.label)}</span>
            ${group.rules.map(renderRule).join("")}
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function renderAllowedPairsEditor(profile) {
  const pairs = normalizeAllowedPairs(profile?.allowedPairs);
  return `
    <div class="rule-profile-pairs">
      <div>
        <span>PARES PERMITIDOS</span>
        <p>Lista del plan para validar si el símbolo operado pertenece al sistema.</p>
      </div>
      <div class="rule-profile-pairs__control">
        <div class="rule-profile-pairs__pills">
          ${pairs.map((pair) => `
            <span>${escapeHtml(pair)} <button type="button" data-pair-remove="${escapeHtml(pair)}" aria-label="Eliminar ${escapeHtml(pair)}">×</button></span>
          `).join("")}
        </div>
        <input type="text" data-pair-input placeholder="Añadir par">
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
          <span>FASE 2 · LOCAL</span>
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

  container.querySelectorAll("[data-pair-remove]").forEach((button) => {
    button.addEventListener("click", () => {
      activeProfile.allowedPairs = normalizeAllowedPairs(activeProfile.allowedPairs).filter((pair) => pair !== button.dataset.pairRemove);
      saveProfiles(profileState);
      renderDisciplineSection(context.target, context.data, context);
    });
  });

  const pairInput = container.querySelector("[data-pair-input]");
  pairInput?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== ",") return;
    event.preventDefault();
    const pair = normalizeAllowedPairs([pairInput.value])[0];
    if (!pair) return;
    activeProfile.allowedPairs = normalizeAllowedPairs([...(activeProfile.allowedPairs || []), pair]);
    saveProfiles(profileState);
    renderDisciplineSection(context.target, context.data, context);
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
      syncCustomRuleUsage(profileState);
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

  container.querySelectorAll("[data-rule-add-custom]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const customRule = (profileState.customRules || []).find((rule) => rule.id === button.dataset.ruleAddCustom);
      if (customRule) addCustomRuleToProfile(activeProfile, customRule);
      profileState.openAddRuleMenu = false;
      syncCustomRuleUsage(profileState);
      saveProfiles(profileState);
      renderDisciplineSection(context.target, context.data, context);
    });
  });

  container.querySelectorAll("[data-rule-action='new-custom-rule']").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      profileState.showCustomRuleForm = true;
      profileState.editingCustomRuleId = "";
      profileState.openAddRuleMenu = false;
      profileState.openWeightId = "";
      profileState.openCustomRuleMenuId = "";
      profileState.confirmCustomRuleDeleteId = "";
      saveProfiles(profileState);
      renderDisciplineSection(context.target, context.data, context);
    });
  });

  const customRuleForm = container.querySelector("[data-rule-action='custom-rule-form']");
  if (customRuleForm) {
    const sourceSelect = customRuleForm.querySelector("select[name='source']");
    const hint = customRuleForm.querySelector("[data-custom-source-hint]");
    const conditionSelect = customRuleForm.querySelector("[data-custom-condition-type]");
    const numericFields = customRuleForm.querySelector("[data-custom-numeric-fields]");
    const updateSuggestion = () => {
      const draft = getCustomRuleFormDraft(customRuleForm);
      if (hint) hint.textContent = `Fuente sugerida: ${sourceLabel(draft.suggestedSource)}`;
      if (sourceSelect && !sourceSelect.dataset.touched) sourceSelect.value = draft.suggestedSource;
    };
    customRuleForm.querySelectorAll("input[name='name'], textarea[name='description'], input[name='tagQuestion']").forEach((field) => {
      field.addEventListener("input", updateSuggestion);
    });
    sourceSelect?.addEventListener("change", () => {
      sourceSelect.dataset.touched = "true";
      updateSuggestion();
    });
    conditionSelect?.addEventListener("change", () => {
      numericFields?.classList.toggle("is-visible", conditionSelect.value === "numeric");
    });
    customRuleForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const editingId = customRuleForm.dataset.customRuleId || "";
      const existingRule = (profileState.customRules || []).find((rule) => rule.id === editingId);
      const draft = getCustomRuleFormDraft(customRuleForm);
      if (!draft.name) return;
      const customRule = normalizeCustomRule({
        ...(existingRule || {}),
        ...draft,
        id: editingId || createUniqueCustomRuleId(draft.name, profileState.customRules),
        createdAt: existingRule?.createdAt || new Date().toISOString()
      });
      upsertCustomRule(profileState, customRule, activeProfile);
      profileState.showCustomRuleForm = false;
      profileState.editingCustomRuleId = "";
      profileState.openAddRuleMenu = false;
      profileState.openCustomRuleMenuId = "";
      profileState.confirmCustomRuleDeleteId = "";
      saveProfiles(profileState);
      renderDisciplineSection(context.target, context.data, context);
    });
  }

  container.querySelectorAll("[data-rule-action='cancel-custom-rule']").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      profileState.showCustomRuleForm = false;
      profileState.editingCustomRuleId = "";
      saveProfiles(profileState);
      renderDisciplineSection(context.target, context.data, context);
    });
  });

  container.querySelectorAll("[data-custom-rule-menu]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const ruleId = button.dataset.customRuleMenu;
      profileState.openCustomRuleMenuId = profileState.openCustomRuleMenuId === ruleId ? "" : ruleId;
      profileState.confirmCustomRuleDeleteId = "";
      profileState.openMenuId = "";
      profileState.confirmDeleteId = "";
      profileState.openWeightId = "";
      profileState.confirmRuleRemoveId = "";
      profileState.openAddRuleMenu = false;
      saveProfiles(profileState);
      renderDisciplineSection(context.target, context.data, context);
    });
  });

  container.querySelectorAll("[data-custom-rule-edit]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      profileState.editingCustomRuleId = button.dataset.customRuleEdit;
      profileState.showCustomRuleForm = true;
      profileState.openCustomRuleMenuId = "";
      profileState.confirmCustomRuleDeleteId = "";
      saveProfiles(profileState);
      renderDisciplineSection(context.target, context.data, context);
    });
  });

  container.querySelectorAll("[data-custom-rule-delete]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      profileState.confirmCustomRuleDeleteId = button.dataset.customRuleDelete;
      profileState.openCustomRuleMenuId = button.dataset.customRuleDelete;
      saveProfiles(profileState);
      renderDisciplineSection(context.target, context.data, context);
    });
  });

  container.querySelectorAll("[data-custom-rule-cancel-delete]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      profileState.confirmCustomRuleDeleteId = "";
      saveProfiles(profileState);
      renderDisciplineSection(context.target, context.data, context);
    });
  });

  container.querySelectorAll("[data-custom-rule-disable-all]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      disableCustomRuleInAll(profileState, button.dataset.customRuleDisableAll);
      profileState.openCustomRuleMenuId = "";
      profileState.confirmCustomRuleDeleteId = "";
      saveProfiles(profileState);
      renderDisciplineSection(context.target, context.data, context);
    });
  });

  container.querySelectorAll("[data-custom-rule-delete-all]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      deleteCustomRuleFromAll(profileState, button.dataset.customRuleDeleteAll);
      profileState.openCustomRuleMenuId = "";
      profileState.confirmCustomRuleDeleteId = "";
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
    if (!current.openMenuId && !current.confirmDeleteId && !current.editingProfileId && !current.openAddRuleMenu && !current.openWeightId && !current.confirmRuleRemoveId && !current.openCustomRuleMenuId && !current.confirmCustomRuleDeleteId) return;
    current.openMenuId = "";
    current.confirmDeleteId = "";
    current.editingProfileId = "";
    current.openAddRuleMenu = false;
    current.openWeightId = "";
    current.confirmRuleRemoveId = "";
    current.openCustomRuleMenuId = "";
    current.confirmCustomRuleDeleteId = "";
    saveProfiles(current);
    renderDisciplineSection(context.target, context.data, context);
  };
  container.addEventListener("click", (event) => {
    if (!event.target.closest(".rule-profile-card") && !event.target.closest(".rule-profile-add-rule") && !event.target.closest(".rule-profile-weight") && !event.target.closest(".rule-profile-custom-actions") && !event.target.closest(".rule-profile-custom-form")) closeMenu();
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

function postTradeRulePriority(rule = {}) {
  const weight = normalizeWeight(rule.weight);
  if (weight >= 1.5) return 0;
  if (weight >= 1.0) return 1;
  return 2;
}

function orderedPostTradeRules(rules = []) {
  const baseIndex = (rule) => {
    const index = POST_TRADE_RULE_ORDER.indexOf(rule.id);
    return index === -1 ? POST_TRADE_RULE_ORDER.length + 1 : index;
  };
  return [...rules].sort((a, b) => {
    const priority = postTradeRulePriority(a) - postTradeRulePriority(b);
    if (priority !== 0) return priority;
    return baseIndex(a) - baseIndex(b);
  });
}

function isQuestionAnswered(rule = {}) {
  const answer = draftAnswerForRule(rule.id);
  if (normalizeConditionType(rule.conditionType) === "numeric") {
    return answer !== null && answer !== "" && Number.isFinite(Number(answer));
  }
  return answer !== null && answer !== undefined && answer !== "";
}

function postTradeProgress(rules = []) {
  const total = rules.length;
  const answered = rules.filter(isQuestionAnswered).length;
  return { answered, total, isPartial: answered < total };
}

function applyQuickPlanAnswers(rules = []) {
  const quickRules = new Set(QUICK_PLAN_RULE_IDS);
  rules.forEach((rule) => {
    if (quickRules.has(rule.id) && normalizeConditionType(rule.conditionType) === "boolean") {
      setDraftAnswer(rule.id, true);
    }
  });
  currentTagDraft.reviewMode = false;
}

function setPostTradeQueue(trades = [], index = 0) {
  const normalized = trades.map((trade, tradeIndex) => normalizeTradeForTag(trade, tradeIndex));
  postTradeQueueState = {
    trades: normalized,
    index: clamp(index, 0, Math.max(normalized.length - 1, 0))
  };
}

function activeQueueMeta() {
  if (!activePostTradeModal || !postTradeQueueState.trades.length) return null;
  const index = postTradeQueueState.trades.findIndex((trade) => trade.id === activePostTradeModal.id);
  if (index === -1) return null;
  postTradeQueueState.index = index;
  return {
    index,
    total: postTradeQueueState.trades.length,
    hasPrev: index > 0,
    hasNext: index < postTradeQueueState.trades.length - 1
  };
}

function postTradeRuleQuestion(rule) {
  if (rule.id === "be-activation") return `¿Activaste el BE a ${rule.params?.pips ?? 20} pips?`;
  if (rule.id === "ob-entry") return "¿El entry fue en el OB candle open (o 50% si el SL no cubre)?";
  if (rule.id === "valid-setup") return "¿El setup estaba validado antes de entrar?";
  if (rule.id === "allowed-pairs") return "¿El par operado estaba en tu lista de pares permitidos?";
  if (rule.id === "london-confirmation") return "¿Esperaste la vela de confirmación post-London open antes de entrar?";
  if (rule.id === "emotional-state") return "¿Cómo era tu estado emocional antes de este trade?";
  if (rule.tagQuestion) return rule.tagQuestion;
  return `¿Se cumplió ${rule.name}?`;
}

function renderPostTradeIndicator(pendingTrades = [], canTag = true) {
  if (!canTag) return "";
  const count = pendingTrades.length;
  return `
    <section class="posttrade-tag-alert${count ? " has-pending" : ""}">
      <div>
        <span>POST-TRADE TAG</span>
        <strong>${count ? `${count} ${count === 1 ? "trade sin etiquetar" : "trades sin etiquetar"}` : "Tagging manual listo"}</strong>
        <p>${count ? "Completa las reglas manuales para alimentar el score sin asumir datos que el EA todavía no envía." : "Usa el simulador para probar el flujo antes de conectar la capa local."}</p>
      </div>
      <div class="posttrade-tag-alert__actions">
        ${count ? `<button type="button" data-posttrade-complete>Completar tags</button>` : ""}
        <button type="button" data-posttrade-simulate>Simular cierre trade</button>
      </div>
    </section>
  `;
}

function renderPostTradeQuestion(rule, tag) {
  const currentValue = currentTagDraft.tradeId ? draftAnswerForRule(rule.id) : getTagAnswer(tag, rule.id);
  const question = postTradeRuleQuestion(rule);
  const unit = rule.numericUnit || rule.params?.unit || "pips";
  if (normalizeConditionType(rule.conditionType) === "enum") {
    return `
      <div class="posttrade-question" data-posttrade-question="${escapeHtml(rule.id)}">
        <span>${escapeHtml(question)}</span>
        <input type="hidden" data-posttrade-answer="${escapeHtml(rule.id)}" value="${escapeHtml(currentValue || "")}">
        <div class="posttrade-choice-group posttrade-choice-group--enum">
          ${(rule.enumOptions || []).map((option) => `
            <button
              type="button"
              class="${currentValue === option.value ? "is-selected" : ""}"
              data-posttrade-choice="${escapeHtml(rule.id)}"
              data-posttrade-value="${escapeHtml(option.value)}"
              style="--posttrade-choice-color:${escapeHtml(option.color || "#888888")}"
            >${escapeHtml(option.label)}</button>
          `).join("")}
        </div>
      </div>
    `;
  }
  if (normalizeConditionType(rule.conditionType) === "numeric") {
    return `
      <label class="posttrade-question posttrade-question--numeric" data-posttrade-question="${escapeHtml(rule.id)}">
        <span>${escapeHtml(question)}</span>
        <div>
          <input data-posttrade-numeric="${escapeHtml(rule.id)}" type="number" step="0.1" inputmode="decimal" value="${Number.isFinite(Number(currentValue)) ? escapeHtml(currentValue) : ""}">
          <em>${escapeHtml(unit)}</em>
        </div>
      </label>
    `;
  }
  return `
    <div class="posttrade-question" data-posttrade-question="${escapeHtml(rule.id)}">
      <span>${escapeHtml(question)}</span>
      <input type="hidden" data-posttrade-answer="${escapeHtml(rule.id)}" value="${typeof currentValue === "boolean" ? currentValue : ""}">
      <div class="posttrade-choice-group">
        <button type="button" class="${currentValue === true ? "is-selected" : ""}" data-posttrade-choice="${escapeHtml(rule.id)}" data-posttrade-value="true">Sí</button>
        <button type="button" class="${currentValue === false ? "is-selected" : ""}" data-posttrade-choice="${escapeHtml(rule.id)}" data-posttrade-value="false">No</button>
      </div>
    </div>
  `;
}

function renderPostTradeModal(profile, tags = {}) {
  if (!activePostTradeModal) return "";
  const trade = activePostTradeModal;
  const rules = orderedPostTradeRules(getTaggableRules(profile));
  if (!rules.length) {
    activePostTradeModal = null;
    resetCurrentTagDraft();
    return "";
  }
  const existingTag = tags[trade.id] || {};
  initCurrentTagDraft(trade, existingTag);
  const queueMeta = activeQueueMeta();
  const progress = postTradeProgress(rules);
  const pips = Number(trade.pips);
  const resultClass = Number.isFinite(pips) && pips < 0 ? "is-negative" : "is-positive";
  const resultLabel = Number.isFinite(pips) ? `${pips > 0 ? "+" : ""}${pips} pips` : `${trade.pnl > 0 ? "+" : ""}${Math.round(trade.pnl)} $`;
  return `
    <div id="kmfx-posttrade-modal" class="posttrade-modal is-open">
      <div class="ptt-overlay" data-posttrade-close></div>
      <article class="ptt-dialog" role="dialog" aria-modal="true" aria-labelledby="posttrade-title" tabindex="-1" data-posttrade-dialog>
        <header class="ptt-header">
          <div>
            <span>${queueMeta ? `TAG PENDIENTE · ${queueMeta.index + 1} DE ${queueMeta.total}` : "POST-TRADE TAG"}</span>
            <h3 id="posttrade-title">${escapeHtml(trade.symbol)} · ${escapeHtml(trade.direction)} · <b class="${resultClass}">${escapeHtml(resultLabel)}</b></h3>
            <p>${new Date(trade.timestamp).toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" })}</p>
          </div>
          <button type="button" data-posttrade-close aria-label="Cerrar">×</button>
        </header>
        <div class="ptt-body">
          <section class="posttrade-quick">
            <div>
              <strong>¿Trade ejecutado según plan?</strong>
              <p>Usa el modo rápido si las reglas principales se cumplieron y solo quieres dejar nota.</p>
            </div>
            <div class="posttrade-quick__actions">
              <button type="button" data-posttrade-quick="ok">Todo correcto</button>
              <button type="button" class="${currentTagDraft.reviewMode ? "is-selected" : ""}" data-posttrade-quick="review">Revisar detalles</button>
            </div>
          </section>
          <div class="posttrade-progress" data-posttrade-progress>${progress.answered}/${progress.total} reglas respondidas</div>
          <div class="posttrade-partial-notice${progress.isPartial && currentTagDraft.saveAttempted ? "" : " is-hidden"}" data-posttrade-partial>
            Tag parcial: algunas reglas quedan sin confirmar.
          </div>
          <div class="posttrade-question-list${currentTagDraft.reviewMode ? "" : " is-hidden"}" data-posttrade-question-list>
          ${rules.length ? rules.map((rule) => renderPostTradeQuestion(rule, existingTag)).join("") : `
            <div class="posttrade-empty">
              <strong>No hay reglas manuales activas</strong>
              <p>Activa reglas manuales o mixtas en el perfil para alimentar el score con post-trade tags.</p>
            </div>
          `}
          </div>
          <label class="posttrade-note">
            <span>Nota opcional</span>
            <textarea data-posttrade-note rows="3" placeholder="Contexto breve del trade">${escapeHtml(currentTagDraft.note || "")}</textarea>
          </label>
        </div>
        <footer class="ptt-footer">
          ${queueMeta ? `
            <div class="ptt-queue-actions">
              <button type="button" data-posttrade-queue="prev" ${queueMeta.hasPrev ? "" : "disabled"}>Anterior</button>
              <button type="button" data-posttrade-queue="skip">Saltar</button>
              <button type="button" data-posttrade-queue="next" ${queueMeta.hasNext ? "" : "disabled"}>Siguiente</button>
            </div>
          ` : ""}
          <div class="ptt-save-actions">
            <button type="button" data-posttrade-close>Cancelar</button>
            <button type="button" class="primary" data-posttrade-save>Guardar tag</button>
          </div>
        </footer>
      </article>
    </div>
  `;
}

function refreshDisciplineSection(context = {}) {
  if (!context.target) return;
  const nextData = context.model ? buildDisciplineDataFromModel(context.model, context.accountLogin || "") : context.data;
  renderDisciplineSection(context.target, nextData, context);
}

export function openPostTradeModal(trade, context = {}) {
  if (!context.preservePostTradeQueue) resetPostTradeQueue();
  activePostTradeModal = normalizeTradeForTag(trade);
  resetCurrentTagDraft();
  refreshDisciplineSection(context);
}

function savePendingPostTradeTag(profile, trade) {
  if (!trade) return;
  savePostTradeTag(trade.id, buildEmptyTagData(trade, getTaggableRules(profile)));
}

function collectPostTradeAnswers(target, profile) {
  const answers = normalizeTagAnswers(currentTagDraft.answers);
  orderedPostTradeRules(getTaggableRules(profile)).forEach((rule) => {
    if (normalizeConditionType(rule.conditionType) === "numeric") {
      const input = target.querySelector(`[data-posttrade-numeric="${cssEscape(rule.id)}"]`);
      let value = input?.value === "" ? null : Number(input?.value);
      if (!Number.isFinite(value)) value = null;
      setDraftAnswer(rule.id, value);
    }
  });
  return normalizeTagAnswers(currentTagDraft.answers);
}

function saveCurrentPostTradeDraft(target, profile, { skipped = false } = {}) {
  if (!activePostTradeModal) return false;
  const rules = orderedPostTradeRules(getTaggableRules(profile));
  if (skipped) {
    return savePostTradeTag(activePostTradeModal.id, buildEmptyTagData(activePostTradeModal, rules));
  }
  const answers = collectPostTradeAnswers(target, profile);
  const progress = postTradeProgress(rules);
  return savePostTradeTag(activePostTradeModal.id, {
    tradeId: activePostTradeModal.id,
    timestamp: activePostTradeModal.timestamp,
    tagQuestionVersion: 2,
    answers,
    note: currentTagDraft.note?.trim() || null,
    tagSkipped: false,
    tagPartial: progress.isPartial
  });
}

function updateModalUI(target, ruleId) {
  const group = target.querySelector(`[data-posttrade-question="${cssEscape(ruleId)}"]`);
  if (!group) return;
  const currentValue = draftAnswerForRule(ruleId);
  group.querySelectorAll("[data-posttrade-choice]").forEach((button) => {
    button.classList.toggle("is-selected", String(currentValue) === button.dataset.posttradeValue);
  });
  const hidden = group.querySelector(`[data-posttrade-answer="${cssEscape(ruleId)}"]`);
  if (hidden) hidden.value = currentValue === null || currentValue === undefined ? "" : String(currentValue);
}

function updatePostTradeProgressUI(target, profile) {
  const rules = orderedPostTradeRules(getTaggableRules(profile));
  const progress = postTradeProgress(rules);
  const progressNode = target.querySelector("[data-posttrade-progress]");
  if (progressNode) progressNode.textContent = `${progress.answered}/${progress.total} reglas respondidas`;
  target.querySelector("[data-posttrade-partial]")?.classList.toggle("is-hidden", !progress.isPartial || !currentTagDraft.saveAttempted);
}

function updateQuickModeUI(target, profile) {
  const quickOk = QUICK_PLAN_RULE_IDS.every((ruleId) => {
    const rule = getTaggableRules(profile).find((item) => item.id === ruleId);
    return !rule || draftAnswerForRule(ruleId) === true;
  });
  target.querySelector("[data-posttrade-question-list]")?.classList.toggle("is-hidden", !currentTagDraft.reviewMode);
  target.querySelectorAll("[data-posttrade-quick]").forEach((button) => {
    const isReview = button.dataset.posttradeQuick === "review" && currentTagDraft.reviewMode;
    const isQuickOk = button.dataset.posttradeQuick === "ok" && quickOk && !currentTagDraft.reviewMode;
    button.classList.toggle("is-selected", isReview || isQuickOk);
  });
  updatePostTradeProgressUI(target, profile);
}

function openQueuedPostTradeAt(index, context) {
  const trade = postTradeQueueState.trades[index];
  if (!trade) {
    activePostTradeModal = null;
    resetCurrentTagDraft();
    resetPostTradeQueue();
    refreshDisciplineSection(context);
    return;
  }
  postTradeQueueState.index = index;
  openPostTradeModal(trade, { ...context, preservePostTradeQueue: true });
}

function advancePostTradeQueue(target, context, profile, action) {
  const meta = activeQueueMeta();
  if (!meta) return;
  if (action === "skip") {
    saveCurrentPostTradeDraft(target, profile, { skipped: true });
  } else {
    saveCurrentPostTradeDraft(target, profile);
  }
  const nextIndex = action === "prev" ? meta.index - 1 : meta.index + 1;
  openQueuedPostTradeAt(nextIndex, context);
}

function bindPostTradeControls(target, context, profile, pendingTrades = []) {
  target.querySelectorAll("[data-rule-history-cell]").forEach((cell) => {
    cell.addEventListener("click", () => {
      const nextCell = {
        ruleId: cell.dataset.ruleId,
        week: cell.dataset.ruleWeek
      };
      const isSameCell = selectedRuleHistoryCell?.ruleId === nextCell.ruleId && selectedRuleHistoryCell?.week === nextCell.week;
      selectedRuleHistoryCell = isSameCell ? null : nextCell;
      refreshDisciplineSection(context);
    });
  });

  const modalRoot = target.querySelector("#kmfx-posttrade-modal");
  const modalDialog = modalRoot?.querySelector("[data-posttrade-dialog]");
  if (modalDialog) {
    requestAnimationFrame(() => modalDialog.focus({ preventScroll: true }));
    modalRoot.addEventListener("keydown", (event) => {
      if (event.key !== "Tab") return;
      const focusable = [...modalRoot.querySelectorAll("button, input, textarea, select, [tabindex]:not([tabindex='-1'])")]
        .filter((node) => !node.disabled && node.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
  }

  target.querySelector("[data-posttrade-simulate]")?.addEventListener("click", () => {
    if (!getTaggableRules(profile).length) return;
    resetPostTradeQueue();
    const fallbackTrade = context.data?.recentTrades?.at(-1) || {
      symbol: "EURUSD",
      direction: "BUY",
      pips: 24,
      pnl: 240,
      when: new Date()
    };
    openPostTradeModal(fallbackTrade, context);
  });
  target.querySelector("[data-posttrade-complete]")?.addEventListener("click", () => {
    if (!getTaggableRules(profile).length) return;
    if (pendingTrades[0]) {
      setPostTradeQueue(pendingTrades, 0);
      openPostTradeModal(pendingTrades[0], { ...context, preservePostTradeQueue: true });
    }
  });
  target.querySelectorAll("[data-posttrade-quick]").forEach((button) => {
    button.addEventListener("click", () => {
      const rules = orderedPostTradeRules(getTaggableRules(profile));
      if (button.dataset.posttradeQuick === "ok") {
        applyQuickPlanAnswers(rules);
        rules.forEach((rule) => updateModalUI(target, rule.id));
      } else {
        currentTagDraft.reviewMode = true;
      }
      updateQuickModeUI(target, profile);
    });
  });
  target.querySelectorAll("[data-posttrade-choice]").forEach((button) => {
    button.addEventListener("click", () => {
      const ruleId = button.dataset.posttradeChoice;
      const rawValue = button.dataset.posttradeValue;
      const value = rawValue === "true" ? true : rawValue === "false" ? false : rawValue;
      setDraftAnswer(ruleId, value);
      updateModalUI(target, ruleId);
      updatePostTradeProgressUI(target, profile);
    });
  });
  target.querySelectorAll("[data-posttrade-numeric]").forEach((input) => {
    input.addEventListener("input", () => {
      const value = input.value === "" ? null : Number(input.value);
      setDraftAnswer(input.dataset.posttradeNumeric, Number.isFinite(value) ? value : null);
      updatePostTradeProgressUI(target, profile);
    });
  });
  target.querySelector("[data-posttrade-note]")?.addEventListener("input", (event) => {
    currentTagDraft.note = event.target.value;
  });
  target.querySelectorAll("[data-posttrade-close]").forEach((button) => {
    button.addEventListener("click", () => {
      savePendingPostTradeTag(profile, activePostTradeModal);
      activePostTradeModal = null;
      resetCurrentTagDraft();
      resetPostTradeQueue();
      refreshDisciplineSection(context);
    });
  });
  target.querySelectorAll("[data-posttrade-queue]").forEach((button) => {
    button.addEventListener("click", () => {
      advancePostTradeQueue(target, context, profile, button.dataset.posttradeQueue);
    });
  });
  target.querySelector("[data-posttrade-save]")?.addEventListener("click", () => {
    if (!activePostTradeModal) return;
    const progress = postTradeProgress(orderedPostTradeRules(getTaggableRules(profile)));
    if (progress.isPartial && !currentTagDraft.saveAttempted) {
      currentTagDraft.saveAttempted = true;
      updatePostTradeProgressUI(target, profile);
      return;
    }
    saveCurrentPostTradeDraft(target, profile);
    const meta = activeQueueMeta();
    if (meta?.hasNext) {
      openQueuedPostTradeAt(meta.index + 1, context);
      return;
    }
    activePostTradeModal = null;
    resetCurrentTagDraft();
    resetPostTradeQueue();
    refreshDisciplineSection(context);
  });
  target.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !activePostTradeModal) return;
    savePendingPostTradeTag(profile, activePostTradeModal);
    activePostTradeModal = null;
    resetCurrentTagDraft();
    resetPostTradeQueue();
    refreshDisciplineSection(context);
  });
}

function renderScorePanel(scoreValue, breakdown, insight, { isPartial = false } = {}) {
  return `
    <article class="tl-section-card execution-panel execution-score-panel execution-tone-${scoreDisplayTone(scoreValue, isPartial)}">
      <div class="tl-section-header execution-section-header">
        <div class="tl-section-title">Score de ejecución</div>
        ${isPartial ? `<span class="execution-data-pill">Score parcial</span>` : ""}
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

function buildDisciplineDataFromModel(model, accountLogin = "") {
  const rawRecentTrades = getRecentTrades(model?.trades || []);
  const tags = loadPostTradeTags();
  const recentTrades = mergeTradesWithPostTags(rawRecentTrades, tags);
  const entryDeviations = recentTrades.map(getEntryDeviationPips).filter((value) => Number.isFinite(value));
  const baseRules = calcRuleCompliance(recentTrades);
  const profileState = loadProfiles();
  const { profile } = getProfileForAccount(profileState, accountLogin);
  const tagStats = buildPostTradeTagStats(profile, recentTrades, tags);
  const rules = buildProfileRuleRows(profile, baseRules, tagStats);
  const kpis = buildKpis(rules, recentTrades, entryDeviations);
  const score = buildDisciplineScore(rules, recentTrades, entryDeviations);
  return {
    kpis,
    rules,
    baseRules,
    recentTrades,
    calendar: buildExecutionHeatmap(recentTrades, disciplineData, profile, tags),
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
  let kpis = Array.isArray(data.kpis)
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

  const rules = (data.baseRules || data.rules || []).map((rule) => ({
    name: rule.name,
    pct: rule.pct,
    note: rule.note || ""
  }));
  const profileState = loadProfiles();
  const accountLogin = context.accountLogin || data.accountLogin || "";
  const { profile: activeProfile } = getProfileForAccount(profileState, accountLogin);
  const postTradeTags = loadPostTradeTags();
  const recentTrades = Array.isArray(data.recentTrades) ? mergeTradesWithPostTags(data.recentTrades, postTradeTags) : [];
  const liveEntryDeviations = recentTrades.map(getEntryDeviationPips).filter((value) => Number.isFinite(value));
  const tagStats = buildPostTradeTagStats(activeProfile, recentTrades, postTradeTags);
  const visibleRules = buildProfileRuleRows(activeProfile, rules, tagStats);
  const manualTagScore = calculateManualTagScore(recentTrades, activeProfile.rules || []);
  const ruleHistory = buildRuleHistory(recentTrades, activeProfile);
  const hasManualScore = Number.isFinite(Number(manualTagScore.overall));
  if (recentTrades.length) {
    kpis = buildKpis(visibleRules, recentTrades, liveEntryDeviations);
  }
  const canOpenPostTradeTag = getTaggableRules(activeProfile).length > 0;
  const pendingTagTrades = getPendingTagTrades(activeProfile, recentTrades, postTradeTags);
  const calendar = recentTrades.length
    ? buildExecutionHeatmap(recentTrades, disciplineData, activeProfile, postTradeTags)
    : Array.isArray(data.calendar?.[0])
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
  const liveScore = recentTrades.length ? buildDisciplineScore(visibleRules, recentTrades, liveEntryDeviations) : null;
  const scoreSource = liveScore || data.score;
  const scoreValue = scoreSource?.overall ?? scoreSource?.score ?? 0;
  const weightedCompliance = weightedAverageRuleScore(visibleRules);
  const manualOverall = hasManualScore ? manualTagScore.overall : null;
  const breakdown = scoreSource?.breakdown
    ? [
      { label: "Cumplimiento", value: manualOverall ?? weightedCompliance ?? scoreSource.breakdown.compliance },
      { label: "Precisión", value: scoreSource.breakdown.precision },
      { label: "Consistencia", value: scoreSource.breakdown.consistency },
      { label: "Horario", value: scoreSource.breakdown.timing },
      { label: "Psicológico", value: scoreSource.breakdown.psychological }
    ]
    : (scoreSource?.subscores || []).map((item) => (
      item.label === "Cumplimiento" ? { ...item, value: manualOverall ?? weightedCompliance ?? item.value } : item
    ));
  const weightedScoreValue = Math.round((hasManualScore ? manualOverall : null) ?? average(breakdown.map((item) => item.value)) ?? scoreValue);
  const insight = hasManualScore && manualTagScore.weakestRule
    ? `Mayor brecha: ${manualTagScore.weakestRule.name} (${Math.round(manualTagScore.weakestRule.pct)}%). Revisa trades etiquetados con No.`
    : scoreSource?.insight || data.insight || disciplineData.score.insight;
  const hasEntryTracking = hasEntryPrecisionTracking(entryRows);
  const isPartialData = hasPartialExecutionData(visibleRules, entryRows, kpis);
  const entryPattern = hasEntryTracking ? buildEntryPattern(entryRows) : "No hay suficiente historial para detectar un patrón claro.";

  target.innerHTML = `
    <header class="kmfx-page__header">
      <div class="kmfx-page__copy">
        <p class="kmfx-page__eyebrow">EJECUCIÓN</p>
        <h2 class="kmfx-page__title">Ejecución</h2>
        <p class="kmfx-page__subtitle">Cumplimiento del plan, precisión de entrada y calidad operativa.</p>
      </div>
    </header>

    ${renderPostTradeIndicator(pendingTagTrades, canOpenPostTradeTag)}

    ${renderExecutionHero(visibleRules)}

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

    ${renderRuleHistory(ruleHistory, activeProfile)}

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
    ${renderPostTradeModal(activeProfile, postTradeTags)}
  `;
  renderProfileManager(target.querySelector("#discipline-profile-manager"), renderContext);
  bindPostTradeControls(target, { ...renderContext, data: { ...data, recentTrades } }, activeProfile, pendingTagTrades);
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
  const accountLogin = account?.login || "";
  renderDisciplineSection(root.querySelector("#section-discipline"), buildDisciplineDataFromModel(model, accountLogin), {
    accountLogin,
    model
  });
}
