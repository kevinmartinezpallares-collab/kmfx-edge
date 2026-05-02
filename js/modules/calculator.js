import { describeAccountAuthority, formatCurrency, renderAuthorityNotice, selectCurrentAccount, selectCurrentModel } from "./utils.js?v=build-20260406-213500";
import { computeRecommendedRiskFromModel } from "./risk-engine.js?v=build-20260406-213500";
import { badgeMarkup } from "./status-badges.js?v=build-20260406-213500";
import { pageHeaderMarkup } from "./ui-primitives.js?v=build-20260406-213500";

const QUICK_INSTRUMENTS = [
  { symbol: "EURUSD", label: "EURUSD" },
  { symbol: "GBPUSD", label: "GBPUSD" },
  { symbol: "XAUUSD", label: "XAUUSD" },
  { symbol: "NAS100", label: "NAS100" },
  { symbol: "US30", label: "US30" },
  { symbol: "US500", label: "S&P500" }
];

const ACCOUNT_CURRENCIES = ["USD", "EUR", "GBP", "CHF", "JPY", "AUD", "CAD"];
const FOREX_CURRENCIES = new Set(ACCOUNT_CURRENCIES);

const STATIC_FX_RATES = {
  EURUSD: 1.08,
  GBPUSD: 1.27,
  AUDUSD: 0.66,
  USDCAD: 1.37,
  USDCHF: 0.91,
  USDJPY: 155,
  EURGBP: 0.85,
  EURJPY: 167,
  GBPJPY: 197,
  AUDCAD: 0.90,
};

const CALCULATION_PROFILES = {
  Manual: { pointValue: 1, contractSize: 1, note: "Perfil manual. Verifica valor por pip/punto antes de operar." },
  FTMO: { pointValue: 1, contractSize: 1, note: "Preset operativo editable para cuentas tipo challenge." },
  FundingPips: { pointValue: 1, contractSize: 1, note: "Preset operativo editable para cuentas tipo challenge." },
  Orion: { pointValue: 1, contractSize: 1, note: "Preset operativo editable para cuenta principal." },
  "Darwinex Zero": { pointValue: 1, contractSize: 1, note: "Preset operativo editable para referencia profesional." },
  "Wall Street": { pointValue: 1, contractSize: 1, note: "Preset operativo editable para índices." },
  "IC Markets": { pointValue: 1, contractSize: 1, note: "Preset operativo editable para FX/CFD." }
};

const SYMBOL_SPECS = {
  EURUSD: { pipValue: 10, pipMultiplier: 10000, lotUnit: 100000, decimals: 4, type: "Forex", instrumentId: "forex", unitLabel: "pips" },
  GBPUSD: { pipValue: 10, pipMultiplier: 10000, lotUnit: 100000, decimals: 4, type: "Forex", instrumentId: "forex", unitLabel: "pips" },
  USDJPY: { pipValue: 9.1, pipMultiplier: 100, lotUnit: 100000, decimals: 3, type: "Forex", instrumentId: "forex", unitLabel: "pips" },
  XAUUSD: { pipValue: 10, pipMultiplier: 10, lotUnit: 100, decimals: 2, type: "Metal", instrumentId: "gold", unitLabel: "puntos" },
  NAS100: { pipValue: 1, pipMultiplier: 1, lotUnit: 1, decimals: 1, type: "Índice", instrumentId: "indices", unitLabel: "puntos" },
  US30: { pipValue: 1, pipMultiplier: 1, lotUnit: 1, decimals: 1, type: "Índice", instrumentId: "indices", unitLabel: "puntos" },
  US500: { pipValue: 1, pipMultiplier: 1, lotUnit: 1, decimals: 1, type: "Índice", instrumentId: "indices", unitLabel: "puntos" }
};

function toNumber(value, fallback = 0) {
  const parsed = parseNumericInput(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toOptionalNumber(value, fallback = 0) {
  if (value === "" || value === null || typeof value === "undefined") return fallback;
  const parsed = parseNumericInput(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseNumericInput(value) {
  if (typeof value === "number") return value;
  const raw = String(value ?? "").trim().replace(/\s/g, "");
  if (!raw) return Number.NaN;
  const lastComma = raw.lastIndexOf(",");
  const lastDot = raw.lastIndexOf(".");
  const normalized = lastComma > -1 && lastDot > -1
    ? lastComma > lastDot
      ? raw.replace(/\./g, "").replace(",", ".")
      : raw.replace(/,/g, "")
    : raw.replace(",", ".");
  return Number(normalized);
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  })[char]);
}

function normalizeSymbol(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizeSymbolKey(value) {
  return normalizeSymbol(value).replace(/[^A-Z0-9]/g, "");
}

function normalizeSymbolStem(value) {
  return normalizeSymbol(value).split(/[._-]/)[0].replace(/[^A-Z0-9]/g, "");
}

function isGoldSymbol(symbol) {
  return /^(XAU|GOLD)/.test(normalizeSymbolKey(symbol));
}

function inferInstrumentId(symbol) {
  return SYMBOL_SPECS[normalizeSymbol(symbol)]?.instrumentId || "custom";
}

function normalizeCurrency(value, fallback = "USD") {
  const code = String(value || "").trim().toUpperCase();
  return ACCOUNT_CURRENCIES.includes(code) ? code : fallback;
}

function parseForexPair(symbol) {
  const stem = normalizeSymbolStem(symbol).slice(0, 6);
  if (stem.length !== 6) return null;
  const base = stem.slice(0, 3);
  const quote = stem.slice(3, 6);
  if (!FOREX_CURRENCIES.has(base) || !FOREX_CURRENCIES.has(quote) || base === quote) return null;
  return { symbol: `${base}${quote}`, base, quote };
}

function firstFiniteValue(source = {}, keys = []) {
  for (const key of keys) {
    const value = source?.[key];
    const parsed = parseNumericInput(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function firstTextValue(source = {}, keys = []) {
  for (const key of keys) {
    const value = source?.[key];
    if (value !== null && typeof value !== "undefined" && String(value).trim()) {
      return String(value).trim();
    }
  }
  return "";
}

function readRateValue(value) {
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? value : null;
  if (typeof value === "string") {
    const parsed = parseNumericInput(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  if (!value || typeof value !== "object") return null;
  const bid = parseNumericInput(value.bid);
  const ask = parseNumericInput(value.ask);
  if (Number.isFinite(bid) && bid > 0 && Number.isFinite(ask) && ask > 0) return (bid + ask) / 2;
  return firstFiniteValue(value, ["mid", "price", "rate", "last", "close", "value"]);
}

function collectRatesFromContainer(container, rates = {}) {
  if (!container) return rates;
  if (Array.isArray(container)) {
    container.forEach((item) => {
      if (!item || typeof item !== "object") return;
      const symbol = normalizeSymbolKey(item.symbol || item.pair || item.instrument || item.name);
      const rate = readRateValue(item);
      if (symbol.length >= 6 && rate) rates[symbol.slice(0, 6)] = rate;
    });
    return rates;
  }
  if (typeof container !== "object") return rates;

  Object.entries(container).forEach(([key, value]) => {
    const symbol = normalizeSymbolKey(key);
    const rate = readRateValue(value);
    if (symbol.length >= 6 && rate) {
      rates[symbol.slice(0, 6)] = rate;
      return;
    }
    if (value && typeof value === "object") collectRatesFromContainer(value, rates);
  });
  return rates;
}

function resolveExchangeRateContext(state = {}, account = {}) {
  const payload = account?.dashboardPayload && typeof account.dashboardPayload === "object" ? account.dashboardPayload : {};
  const model = account?.model && typeof account.model === "object" ? account.model : {};
  const liveRates = {};
  [
    payload.prices,
    payload.rates,
    payload.exchangeRates,
    payload.exchange_rates,
    payload.market?.prices,
    payload.market?.rates,
    model.prices,
    model.rates,
    state?.workspace?.market?.rates,
    state?.market?.rates,
  ].forEach((container) => collectRatesFromContainer(container, liveRates));

  return {
    liveRates,
    fallbackRates: STATIC_FX_RATES,
  };
}

function lookupRate(base, quote, rateContext) {
  if (base === quote) return { rate: 1, source: "identity", path: `${base}${quote}` };
  const directKey = `${base}${quote}`;
  const reverseKey = `${quote}${base}`;
  const liveDirect = rateContext.liveRates?.[directKey];
  if (Number.isFinite(liveDirect) && liveDirect > 0) return { rate: liveDirect, source: "live", path: directKey };
  const liveReverse = rateContext.liveRates?.[reverseKey];
  if (Number.isFinite(liveReverse) && liveReverse > 0) return { rate: 1 / liveReverse, source: "live", path: reverseKey };
  const staticDirect = rateContext.fallbackRates?.[directKey];
  if (Number.isFinite(staticDirect) && staticDirect > 0) return { rate: staticDirect, source: "static", path: directKey };
  const staticReverse = rateContext.fallbackRates?.[reverseKey];
  if (Number.isFinite(staticReverse) && staticReverse > 0) return { rate: 1 / staticReverse, source: "static", path: reverseKey };
  return null;
}

function resolveCurrencyConversion(fromCurrency, toCurrency, rateContext) {
  const from = normalizeCurrency(fromCurrency);
  const to = normalizeCurrency(toCurrency);
  if (from === to) return { rate: 1, source: "identity", path: `${from}${to}` };
  const direct = lookupRate(from, to, rateContext);
  if (direct) return direct;
  const toUsd = lookupRate(from, "USD", rateContext);
  const fromUsd = lookupRate("USD", to, rateContext);
  if (!toUsd || !fromUsd) return null;
  return {
    rate: toUsd.rate * fromUsd.rate,
    source: toUsd.source === "live" && fromUsd.source === "live" ? "live" : "static",
    path: `${toUsd.path}→${fromUsd.path}`,
  };
}

function buildStandaloneForexSpec(calc, rateContext, accountCurrency) {
  const pair = parseForexPair(calc.symbol);
  if (!pair) return null;
  const pipSize = pair.quote === "JPY" ? 0.01 : 0.0001;
  const quotePipValue = 100000 * pipSize;
  const conversion = resolveCurrencyConversion(pair.quote, accountCurrency, rateContext);
  if (!conversion) return null;
  const pipValue = quotePipValue * conversion.rate;
  const rateSourceLabel = conversion.source === "live" ? "Tipos de cambio actuales" : "Tipos estimados";
  return {
    symbol: pair.symbol,
    pipValue,
    pipMultiplier: 1 / pipSize,
    lotUnit: 100000,
    decimals: pair.quote === "JPY" ? 3 : 5,
    type: "Forex",
    unitLabel: "pips",
    source: "standalone_fx",
    sourceLabel: "Cálculo estándar",
    sourceDetail: `${pair.quote} → ${accountCurrency} · ${conversion.path}`,
    accuracyCopy: conversion.source === "live"
      ? "Cálculo estándar con tipos de cambio disponibles en la cuenta o mercado."
      : "Cálculo estándar con tipos estimados. Verifica el tipo de cambio antes de operar.",
    rateSource: conversion.source,
    rateSourceLabel,
    accountCurrency,
    baseCurrency: pair.base,
    quoteCurrency: pair.quote,
    conversionRate: conversion.rate,
    conversionPath: conversion.path,
    volumeMin: null,
    volumeMax: null,
    volumeStep: null,
  };
}

function inferLiveInstrumentType(symbol, liveSpec = {}) {
  const mode = String(liveSpec.tradeCalcMode || liveSpec.trade_calc_mode || liveSpec.calcMode || "").toLowerCase();
  if (mode.includes("forex")) return "Forex";
  const symbolKey = normalizeSymbol(symbol);
  if (/XAU|XAG|GOLD|SILVER/.test(symbolKey)) return "Metal";
  if (/BTC|ETH|CRYPTO/.test(symbolKey)) return "Cripto";
  if (/NAS|US100|US30|US500|SPX|GER|DAX|INDEX/.test(symbolKey)) return "Índice";
  return SYMBOL_SPECS[normalizeSymbolStem(symbol)]?.type || "Personalizado";
}

function liveUnitLabelForSpec(symbol, liveSpec = {}) {
  const explicit = firstTextValue(liveSpec, ["unitLabel", "unit_label", "slUnit", "sl_unit"]);
  if (explicit) return explicit;
  return unitLabelForType(inferLiveInstrumentType(symbol, liveSpec));
}

function normalizeLiveSymbolSpec(rawSpec = {}, fallbackSymbol = "") {
  if (!rawSpec || typeof rawSpec !== "object") return null;
  const symbol = firstTextValue(rawSpec, ["symbol", "name", "instrument"]) || fallbackSymbol;
  if (!symbol) return null;
  const digits = firstFiniteValue(rawSpec, ["digits", "symbol_digits", "SYMBOL_DIGITS"]);
  const point = firstFiniteValue(rawSpec, ["point", "symbolPoint", "symbol_point", "SYMBOL_POINT"]);
  const tickSize = firstFiniteValue(rawSpec, ["tickSize", "tick_size", "tradeTickSize", "trade_tick_size", "SYMBOL_TRADE_TICK_SIZE"]) || point || null;
  const tickValueLoss = firstFiniteValue(rawSpec, [
    "tickValueLoss",
    "tick_value_loss",
    "trade_tick_value_loss",
    "SYMBOL_TRADE_TICK_VALUE_LOSS"
  ]);
  const tickValueProfit = firstFiniteValue(rawSpec, [
    "tickValueProfit",
    "tick_value_profit",
    "trade_tick_value_profit",
    "SYMBOL_TRADE_TICK_VALUE_PROFIT"
  ]);
  const tickValue = tickValueLoss || firstFiniteValue(rawSpec, [
    "tickValue",
    "tick_value",
    "tradeTickValue",
    "trade_tick_value",
    "SYMBOL_TRADE_TICK_VALUE"
  ]) || tickValueProfit;
  const contractSize = firstFiniteValue(rawSpec, ["contractSize", "contract_size", "tradeContractSize", "trade_contract_size", "SYMBOL_TRADE_CONTRACT_SIZE"]);
  const volumeMin = firstFiniteValue(rawSpec, ["volumeMin", "volume_min", "minVolume", "min_volume", "SYMBOL_VOLUME_MIN"]);
  const volumeMax = firstFiniteValue(rawSpec, ["volumeMax", "volume_max", "maxVolume", "max_volume", "SYMBOL_VOLUME_MAX"]);
  const volumeStep = firstFiniteValue(rawSpec, ["volumeStep", "volume_step", "lotStep", "lot_step", "SYMBOL_VOLUME_STEP"]);
  if (!Number.isFinite(tickValue) || tickValue <= 0 || !Number.isFinite(tickSize) || tickSize <= 0) return null;

  const type = inferLiveInstrumentType(symbol, rawSpec);
  const unitLabel = liveUnitLabelForSpec(symbol, rawSpec);
  const explicitPipSize = firstFiniteValue(rawSpec, ["pipSize", "pip_size", "pointSize", "point_size"]);
  const pipSize = explicitPipSize
    || (unitLabel === "pips" && Number.isFinite(point) && point > 0 ? point * (digits === 3 || digits === 5 ? 10 : 1) : tickSize);
  const pipValue = tickValue * (pipSize / tickSize);
  const pipMultiplier = pipSize > 0 ? 1 / pipSize : (point > 0 ? 1 / point : 1);
  return {
    symbol,
    pipValue,
    pipMultiplier,
    lotUnit: contractSize || 1,
    decimals: Number.isFinite(digits) ? digits : (type === "Forex" ? 5 : 2),
    type,
    unitLabel,
    source: "live",
    sourceLabel: "Specs MT5",
    sourceDetail: "Sincronizado desde cuenta activa",
    accuracyCopy: "Cálculo basado en especificaciones MT5 de la cuenta activa.",
    tickSize,
    tickValue,
    tickValueProfit,
    tickValueLoss,
    point,
    digits,
    contractSize: contractSize || null,
    volumeMin,
    volumeMax,
    volumeStep,
    currencyProfit: firstTextValue(rawSpec, ["currencyProfit", "currency_profit", "profitCurrency", "profit_currency", "SYMBOL_CURRENCY_PROFIT"]),
    currencyMargin: firstTextValue(rawSpec, ["currencyMargin", "currency_margin", "marginCurrency", "margin_currency", "SYMBOL_CURRENCY_MARGIN"]),
    tradeCalcMode: firstTextValue(rawSpec, ["tradeCalcMode", "trade_calc_mode", "calcMode", "calc_mode", "SYMBOL_TRADE_CALC_MODE"]),
    raw: rawSpec,
  };
}

function collectSymbolSpecCandidates(value, candidates = [], fallbackSymbol = "") {
  if (!value) return candidates;
  if (Array.isArray(value)) {
    value.forEach((item) => collectSymbolSpecCandidates(item, candidates, fallbackSymbol));
    return candidates;
  }
  if (typeof value !== "object") return candidates;

  const hasSpecShape = [
    "tickValue", "tick_value", "tradeTickValue", "trade_tick_value", "tickValueProfit", "tick_value_profit",
    "tickSize", "tick_size", "tradeTickSize", "trade_tick_size", "contractSize", "contract_size",
    "volumeStep", "volume_step", "digits", "point"
  ].some((key) => Object.prototype.hasOwnProperty.call(value, key));

  if (hasSpecShape) {
    candidates.push({ ...value, symbol: firstTextValue(value, ["symbol", "name", "instrument"]) || fallbackSymbol });
    return candidates;
  }

  Object.entries(value).forEach(([key, item]) => {
    if (item && typeof item === "object") {
      collectSymbolSpecCandidates(item, candidates, key);
    }
  });
  return candidates;
}

function getPossibleLiveSpecContainers(account = {}) {
  const payload = account?.dashboardPayload && typeof account.dashboardPayload === "object" ? account.dashboardPayload : {};
  const model = account?.model && typeof account.model === "object" ? account.model : {};
  const riskSnapshot = account?.riskSnapshot && typeof account.riskSnapshot === "object"
    ? account.riskSnapshot
    : payload.riskSnapshot && typeof payload.riskSnapshot === "object"
      ? payload.riskSnapshot
      : {};
  return [
    payload.symbolSpecs,
    payload.symbol_specs,
    payload.symbols,
    payload.mt5Symbols,
    payload.mt5_symbols,
    payload.specs,
    payload.specifications,
    payload.market?.symbols,
    payload.market?.symbolSpecs,
    payload.account?.symbolSpecs,
    payload.account?.symbol_specs,
    riskSnapshot.symbol_specs,
    riskSnapshot.symbolSpecs,
    riskSnapshot.metadata?.symbol_specs,
    riskSnapshot.metadata?.symbolSpecs,
    model.symbolSpecs,
    model.symbol_specs,
    model.sourceTrace?.symbolSpecs,
    model.sourceTrace?.symbol_specs,
  ];
}

function findLiveSymbolSpec(account, symbol, options = {}) {
  if (!account || account.sourceType !== "mt5") return null;
  const requested = normalizeSymbol(symbol);
  if (!requested) return null;
  const allowAlias = Boolean(options.allowAlias);
  const candidates = getPossibleLiveSpecContainers(account)
    .flatMap((container) => collectSymbolSpecCandidates(container, []))
    .map((candidate) => normalizeLiveSymbolSpec(candidate))
    .filter(Boolean);
  if (!candidates.length) return null;
  const exact = candidates.find((candidate) => normalizeSymbol(candidate.symbol) === requested);
  if (exact) return { ...exact, matchQuality: "exact" };
  const requestedKey = normalizeSymbolKey(requested);
  const compact = candidates.find((candidate) => normalizeSymbolKey(candidate.symbol) === requestedKey);
  if (compact) return { ...compact, matchQuality: "compact" };
  if (!allowAlias) return null;
  const requestedStem = normalizeSymbolStem(requested);
  const stem = candidates.find((candidate) => normalizeSymbolStem(candidate.symbol) === requestedStem);
  return stem ? { ...stem, matchQuality: "alias" } : null;
}

function hasManualSpecOverride(calc = {}) {
  return ["pipValuePerLot", "pipMultiplier", "lotUnit", "instrumentType", "unitLabel"]
    .some((key) => calc[key] !== "" && calc[key] !== null && typeof calc[key] !== "undefined");
}

function ensureCalculatorState(calc = {}, currentModel) {
  const symbol = calc.symbol || "EURUSD";
  const accountCurrency = normalizeCurrency(calc.quoteCurrency || currentModel?.account?.currency || "USD");
  return {
    instrument: calc.instrument || inferInstrumentId(symbol),
    broker: calc.broker || "FTMO",
    symbol,
    slMode: calc.slMode || "distance",
    accountSize: calc.accountSize || currentModel?.account.balance || "",
    riskPct: calc.riskPct ?? 0.5,
    stopPips: calc.stopPips ?? 15,
    entry: calc.entry ?? 1.0842,
    stop: calc.stop ?? 1.0827,
    target: calc.target ?? 1.0878,
    rrPreset: calc.rrPreset || "1:2",
    instrumentType: calc.instrumentType || "",
    pipValuePerLot: calc.pipValuePerLot ?? "",
    pipMultiplier: calc.pipMultiplier ?? "",
    lotUnit: calc.lotUnit ?? "",
    unitLabel: calc.unitLabel || "",
    quoteCurrency: accountCurrency
  };
}

function getCalculatorRiskAdvice(currentModel) {
  if (!currentModel) return null;
  try {
    return computeRecommendedRiskFromModel(currentModel, currentModel.account);
  } catch (error) {
    console.warn("[KMFX][CALC] risk guidance unavailable", error);
    return null;
  }
}

function resolveInstrumentSpec(calc, account, rateContext, accountCurrency) {
  const symbolKey = normalizeSymbol(calc.symbol);
  const symbolStem = normalizeSymbolStem(calc.symbol);
  const liveSpec = findLiveSymbolSpec(account, calc.symbol);
  if (liveSpec) return liveSpec;
  const manualOverride = hasManualSpecOverride(calc);
  const standaloneForexSpec = !manualOverride
    ? buildStandaloneForexSpec(calc, rateContext, accountCurrency)
    : null;
  if (standaloneForexSpec) return standaloneForexSpec;
  const presetSpec = SYMBOL_SPECS[symbolKey] || SYMBOL_SPECS[symbolStem];
  const isGold = isGoldSymbol(calc.symbol);
  const type = calc.instrumentType || presetSpec?.type || "Personalizado";
  const unitLabel = calc.unitLabel || presetSpec?.unitLabel || unitLabelForType(type);
  const estimatedGoldCopy = `${normalizeSymbol(calc.symbol) || "XAUUSD"} usa supuestos manuales. Verifica tick value y contract size del broker.`;
  const spec = {
    pipValue: toOptionalNumber(calc.pipValuePerLot, presetSpec?.pipValue ?? 1),
    pipMultiplier: toOptionalNumber(calc.pipMultiplier, presetSpec?.pipMultiplier ?? 1),
    lotUnit: toOptionalNumber(calc.lotUnit, presetSpec?.lotUnit ?? 1),
    decimals: presetSpec?.decimals ?? (type === "Forex" ? 4 : 2),
    type,
    unitLabel,
    source: manualOverride ? "override" : presetSpec ? "preset" : "manual",
    sourceLabel: manualOverride ? "Override manual" : presetSpec ? "Preset estimado" : "Supuestos manuales",
    sourceDetail: manualOverride ? "Valores editados en este workspace" : presetSpec ? "Preset común editable" : "Sin specs MT5 exactas para este símbolo",
    accuracyCopy: isGold
      ? estimatedGoldCopy
      : "Cálculo estimado con supuestos manuales. Verifica el valor por pip/punto de tu broker.",
    volumeMin: null,
    volumeMax: null,
    volumeStep: null
  };
  return spec;
}

function unitLabelForType(type) {
  if (type === "Forex") return "pips";
  if (type === "Índice" || type === "Metal") return "puntos";
  return "pips/puntos";
}

function instrumentProfileCopy(spec) {
  if (spec.source === "live") return "Especificaciones MT5 de la cuenta activa.";
  if (spec.source === "standalone_fx") return `${spec.rateSourceLabel || "Tipos estimados"} · ${spec.sourceDetail || "modelo Forex estándar"}.`;
  if (spec.source === "manual") return "Perfil personalizado. Verifica valor por punto.";
  if (spec.source === "override") return "Supuestos editados manualmente. Verifica valor por punto.";
  if (spec.type === "Forex") return "Perfil estándar Forex.";
  if (spec.type === "Índice") return "Perfil estándar para índices.";
  if (spec.type === "Metal") return "Perfil estándar para metales.";
  return "Perfil editable. Verifica las especificaciones del instrumento.";
}

function resolveStopPriceDistance(stopDistance, spec) {
  const multiplier = Number(spec.pipMultiplier);
  if (!Number.isFinite(multiplier) || multiplier <= 0) return Math.abs(stopDistance);
  return Math.abs(stopDistance) / multiplier;
}

function resolveRiskPerLot(stopDistance, spec, profile) {
  const effectivePipValue = Number(spec.pipValue || 0) * (spec.source === "live" ? 1 : Number(profile.pointValue || 1));
  const stopPriceDistance = resolveStopPriceDistance(stopDistance, spec);
  const tickSize = Number(spec.tickSize);
  const tickValue = Number(spec.tickValue);

  if (spec.source === "live" && Number.isFinite(tickSize) && tickSize > 0 && Number.isFinite(tickValue) && tickValue > 0) {
    const ticksAtRisk = stopPriceDistance / tickSize;
    return {
      method: "live_tick",
      riskPerLot: Math.abs(ticksAtRisk) * tickValue,
      effectivePipValue,
      stopPriceDistance,
      ticksAtRisk,
    };
  }

  return {
    method: spec.source === "preset" ? "preset_point" : "manual_point",
    riskPerLot: Math.abs(stopDistance) * effectivePipValue,
    effectivePipValue,
    stopPriceDistance,
    ticksAtRisk: null,
  };
}

function calculateModel(state) {
  const account = selectCurrentAccount(state);
  const currentModel = selectCurrentModel(state);
  const calc = ensureCalculatorState(state.workspace.calculator, currentModel);
  const riskAdvice = getCalculatorRiskAdvice(currentModel);
  const accountCurrency = normalizeCurrency(calc.quoteCurrency || currentModel?.account?.currency || account?.dashboardPayload?.currency || "USD");
  const rateContext = resolveExchangeRateContext(state, account);
  const spec = resolveInstrumentSpec(calc, account, rateContext, accountCurrency);
  const profile = CALCULATION_PROFILES[calc.broker] || CALCULATION_PROFILES.Manual;

  const accountSize = toNumber(calc.accountSize, currentModel?.account.balance || 0);
  const riskPct = toNumber(calc.riskPct, 0.5);
  const entry = toNumber(calc.entry, 0);
  const stop = toNumber(calc.stop, 0);
  const priceStopPips = Math.abs(entry - stop) * spec.pipMultiplier;
  const directStopPips = toNumber(calc.stopPips, priceStopPips || 15);
  const stopPips = Math.max(calc.slMode === "price" ? priceStopPips || directStopPips : directStopPips, 0.1);
  const riskUsd = accountSize * (riskPct / 100);
  const riskPerLotModel = resolveRiskPerLot(stopPips, spec, profile);
  const pipValue = riskPerLotModel.effectivePipValue;
  const rawLots = riskUsd / (riskPerLotModel.riskPerLot || 1);
  const lotSize = Math.max(0, rawLots);
  const volumeResolution = resolveLotSize(spec, lotSize);
  const roundedLots = volumeResolution.lots;
  const realRiskUsd = roundedLots * riskPerLotModel.riskPerLot;
  const realRiskPct = accountSize ? (realRiskUsd / accountSize) * 100 : 0;
  const rr = rrPresetValue(calc.rrPreset);
  const tpPips = stopPips * rr;
  const tpUsd = realRiskUsd * rr;
  const units = roundedLots * spec.lotUnit;
  const exposureTone = realRiskPct <= 1 ? "green" : realRiskPct <= 2 ? "gold" : "red";
  const stopDistance = stopPips / spec.pipMultiplier;
  const target = entry
    ? entry + (entry >= stop || !stop ? stopDistance * rr : -stopDistance * rr)
    : null;

  return {
    calc,
    riskAdvice,
    spec,
    profile,
    accountCurrency,
    rateContext,
    accountSize,
    riskPct,
    stopPips,
    priceStopPips,
    pipValue,
    riskPerLot: riskPerLotModel.riskPerLot,
    riskMethod: riskPerLotModel.method,
    stopPriceDistance: riskPerLotModel.stopPriceDistance,
    ticksAtRisk: riskPerLotModel.ticksAtRisk,
    riskUsd,
    lotSize,
    roundedLots,
    volumeResolution,
    realRiskUsd,
    realRiskPct,
    rr,
    tpPips,
    tpUsd,
    units,
    exposureTone,
    target: target === null ? null : roundPrice(target, spec.decimals),
    profileCopy: instrumentProfileCopy(spec)
  };
}

function calculatorMetricMarkup(label, value, meta = "") {
  return `
    <div class="calculator-metric">
      <span>${label}</span>
      <strong>${value}</strong>
      ${meta ? `<small>${meta}</small>` : ""}
    </div>
  `;
}

function formatSpecNumber(value, digits = 4) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return number.toLocaleString("es-ES", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits
  });
}

function formatInputNumber(value, digits = 6) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  return Number(number.toFixed(digits)).toString();
}

function specSourceTone(source) {
  if (source === "live") return "ok";
  if (source === "standalone_fx") return "neutral";
  if (source === "manual") return "warn";
  return "neutral";
}

function compactSourceLabel(spec = {}) {
  if (spec.source === "live") return "Specs MT5";
  if (spec.source === "standalone_fx") return "Estándar";
  if (spec.source === "preset") return "Estimado";
  if (spec.source === "manual" || spec.source === "override") return "Manual";
  const label = spec.sourceLabel || "Manual";
  return label
    .replace(/^Cálculo estándar$/i, "Estándar")
    .replace(/^Preset estimado$/i, "Estimado")
    .replace(/^Supuestos manuales$/i, "Manual");
}

function specSourceMarkup(model) {
  const isEstimatedGold = isGoldSymbol(model.calc.symbol) && model.spec.source !== "live";
  const sourceClass = [
    `calculator-spec-source--${model.spec.source || "manual"}`,
    isEstimatedGold ? "calculator-spec-source--gold-estimated" : ""
  ].filter(Boolean).join(" ");
  const unitSource = model.spec.source === "live"
    ? "Tick MT5"
    : model.spec.source === "standalone_fx"
      ? model.spec.rateSourceLabel || "Tipos estimados"
    : model.spec.source === "preset"
      ? "Preset estimado"
      : "Punto manual";
  const sourceLabel = model.spec.sourceLabel || "Supuestos manuales";
  const sourceTitle = [sourceLabel, unitSource]
    .filter(Boolean)
    .filter((item, index, list) => list.findIndex((entry) => entry.toLowerCase() === item.toLowerCase()) === index)
    .join(" · ");
  const badgeLabel = compactSourceLabel(model.spec);
  const badgeTone = isEstimatedGold ? "warn" : specSourceTone(model.spec.source);
  const riskPerLotCopy = Number.isFinite(Number(model.riskPerLot)) && Number(model.riskPerLot) > 0
    ? ` Riesgo/lote ${formatCurrency(model.riskPerLot, model.accountCurrency)}.`
    : "";
  const sourceCopy = isEstimatedGold
    ? "Verifica tick value y contrato del broker."
    : model.spec.source === "live"
      ? "Cálculo basado en especificaciones MT5."
      : model.spec.source === "standalone_fx"
        ? (model.spec.rateSource === "live" ? "Tipos de cambio disponibles." : "Tipos estimados; verifica divisa.")
        : "Supuestos editables; verifica tu broker.";
  return `
    <div class="calculator-spec-source ${sourceClass}">
      <div>
        <strong>${escapeHtml(sourceTitle)}</strong>
        <span>${escapeHtml(sourceCopy)}${escapeHtml(riskPerLotCopy)}</span>
      </div>
      ${badgeMarkup({ label: badgeLabel, tone: badgeTone }, "ui-badge--compact calculator-soft-badge")}
    </div>
  `;
}

function lotWarningMarkup(model) {
  const warning = model.volumeResolution?.warning;
  if (!warning) return "";
  return `
    <div class="calculator-lot-warning">
      <strong>${warning.title}</strong>
      <span>${warning.copy}</span>
    </div>
  `;
}

function riskAdviceMarkup(model, adviceTone) {
  if (!model.riskAdvice) {
    return `
      <div class="calculator-advice-empty calculator-advice-panel">
        <div class="calculator-advice-copy">
          <strong>Sin lectura del Risk Engine</strong>
          <span>La calculadora sigue operativa aunque el motor de riesgo no esté disponible.</span>
        </div>
      </div>
    `;
  }

  const delta = Number(model.riskAdvice.recommendedRiskPct || 0) - Number(model.riskPct || 0);
  const deltaCopy = Math.abs(delta) < 0.01
    ? "La sugerencia coincide prácticamente con tu riesgo actual."
    : delta < 0
      ? `Reduce ${Math.abs(delta).toFixed(2)} puntos frente al riesgo configurado.`
      : `Aumenta ${delta.toFixed(2)} puntos frente al riesgo configurado.`;

  return `
    <div class="calculator-advice-panel">
      <div class="calculator-advice-primary">
        <span>Riesgo sugerido</span>
        <strong>${model.riskAdvice.recommendedRiskPct.toFixed(2)}%</strong>
      </div>
      <div class="calculator-advice-copy">
        <span>${escapeHtml(model.riskAdvice.explanation || "El motor no detecta presión extraordinaria en este momento.")}</span>
        <small>${deltaCopy}</small>
      </div>
      <button class="btn-secondary btn-inline calculator-advice-action" type="button" data-calc-apply-risk>Aplicar</button>
    </div>
  `;
}

function captureFocusedCalculatorField(root) {
  const active = document.activeElement;
  if (!active || !root.contains(active) || !active.matches("[data-calc-field]")) return null;
  const snapshot = {
    key: active.dataset.calcField,
    value: active.value,
    selectionStart: null,
    selectionEnd: null
  };
  try {
    snapshot.selectionStart = active.selectionStart;
    snapshot.selectionEnd = active.selectionEnd;
  } catch (error) {
    // Some controls such as select do not expose caret positions.
  }
  return snapshot;
}

function restoreFocusedCalculatorField(root, snapshot) {
  if (!snapshot?.key) return;
  const next = root.querySelector(`[data-calc-field="${snapshot.key}"]`);
  if (!next) return;
  if ("value" in next && next.value !== snapshot.value) {
    next.value = snapshot.value;
  }
  next.focus({ preventScroll: true });
  if (snapshot.selectionStart === null || snapshot.selectionEnd === null || typeof next.setSelectionRange !== "function") return;
  try {
    next.setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd);
  } catch (error) {
    // Non-text inputs can reject selection restoration; focus preservation is enough.
  }
}

export function initCalculator(store) {
  const root = document.getElementById("calculatorRoot");
  if (!root) return;
  if (!root.dataset.calculatorAdvancedOpen) {
    root.dataset.calculatorAdvancedOpen = "false";
  }

  root.addEventListener("input", (event) => {
    const field = event.target.closest("[data-calc-field]");
    if (!field) return;
    const key = field.dataset.calcField;
    store.setState((state) => ({
      ...state,
      workspace: {
        ...state.workspace,
        calculator: (() => {
          const current = ensureCalculatorState(state.workspace.calculator, selectCurrentModel(state));
          const next = {
            ...current,
            [key]: field.value
          };
          if (key === "symbol") {
            next.instrument = inferInstrumentId(field.value);
          }
          return next;
        })()
      }
    }));
  });

  root.addEventListener("change", (event) => {
    const field = event.target.closest("[data-calc-field]");
    if (!field) return;
    const key = field.dataset.calcField;
    store.setState((state) => ({
      ...state,
      workspace: {
        ...state.workspace,
        calculator: {
          ...ensureCalculatorState(state.workspace.calculator, selectCurrentModel(state)),
          [key]: field.value
        }
      }
    }));
  });

  root.addEventListener("toggle", (event) => {
    const details = event.target.closest?.(".calculator-advanced-card");
    if (!details || !root.contains(details)) return;
    root.dataset.calculatorAdvancedOpen = details.open ? "true" : "false";
  }, true);

  root.addEventListener("click", (event) => {
    const symbolPreset = event.target.closest("[data-calc-symbol]");
    const preset = event.target.closest("[data-calc-preset]");
    const applyRisk = event.target.closest("[data-calc-apply-risk]");
    if (symbolPreset) {
      const nextSymbol = symbolPreset.dataset.calcSymbol;
      store.setState((state) => ({
        ...state,
        workspace: {
          ...state.workspace,
          calculator: {
            ...ensureCalculatorState(state.workspace.calculator, selectCurrentModel(state)),
            instrument: inferInstrumentId(nextSymbol),
            symbol: nextSymbol,
            instrumentType: "",
            pipValuePerLot: "",
            pipMultiplier: "",
            lotUnit: "",
            unitLabel: ""
          }
        }
      }));
    }
    if (preset) {
      const kind = preset.dataset.calcPreset;
      const value = preset.dataset.calcValue;
      const nextValue = kind === "rrPreset" || kind === "slMode" ? value : Number(value);
      store.setState((state) => ({
        ...state,
        workspace: {
          ...state.workspace,
          calculator: {
            ...ensureCalculatorState(state.workspace.calculator, selectCurrentModel(state)),
            [kind]: nextValue
          }
        }
      }));
    }
    if (applyRisk) {
      store.setState((state) => {
        const currentModel = selectCurrentModel(state);
        const guidance = getCalculatorRiskAdvice(currentModel);
        if (!guidance) return state;
        return {
          ...state,
          workspace: {
            ...state.workspace,
            calculator: {
              ...ensureCalculatorState(state.workspace.calculator, currentModel),
              riskPct: guidance.recommendedRiskPct
            }
          }
        };
      });
    }
  });
}

export function renderCalculator(root, state) {
  const focusedField = captureFocusedCalculatorField(root);
  const advancedOpen = root.dataset.calculatorAdvancedOpen === "true";
  const account = selectCurrentAccount(state);
  const currentModel = selectCurrentModel(state);
  const model = calculateModel(state);
  const authorityMeta = describeAccountAuthority(account, "workspace");
  console.info("[KMFX][CALCULATOR_AUTHORITY]", {
    account_id: account?.id || "",
    login: account?.login || "",
    broker: account?.broker || "",
    payloadSource: authorityMeta.authority.payloadSource,
    tradeCount: authorityMeta.authority.tradeCount,
    sourceUsed: "workspace_risk_tool",
  });
  const calc = model.calc;
  const symbolKey = normalizeSymbol(calc.symbol);
  const unitLabel = model.spec.unitLabel || "pips/puntos";
  const targetCopy = model.target === null ? "Opcional" : String(model.target);
  const stopModeLabel = calc.slMode === "price" ? "SL precio" : "SL distancia";
  const specLocked = model.spec.source === "live";
  const specControlState = specLocked ? "disabled" : "";
  const specInputState = specLocked ? "readonly" : "";
  const volumeMeta = model.spec.source === "live"
    ? ([
        model.spec.volumeMin ? `mín ${formatSpecNumber(model.spec.volumeMin, 2)}` : "",
        model.spec.volumeMax ? `máx ${formatSpecNumber(model.spec.volumeMax, 2)}` : "",
        model.spec.volumeStep ? `paso ${formatSpecNumber(model.spec.volumeStep, 4)}` : ""
      ].filter(Boolean).join(" · ") || "Sin límites MT5 de volumen.")
    : "Sin límites MT5 disponibles";
  const adviceTone = model.riskAdvice?.risk_state === "LOCKED" || model.riskAdvice?.risk_state === "DANGER"
    ? "error"
    : model.riskAdvice?.risk_state === "CAUTION"
      ? "warn"
      : "ok";

  root.innerHTML = `
    <div class="tools-page-stack">
      ${pageHeaderMarkup({
        title: "Herramientas",
        description: "Utilidades para planificar riesgo, lotaje y escenarios antes de operar.",
        className: "tl-page-header",
        titleClassName: "tl-page-title",
        descriptionClassName: "tl-page-sub",
      })}

      <section class="tl-section-card calculator-workspace-card" aria-label="Calculadora de posición">
        <div class="calculator-workspace-head">
          <div>
            <div class="tl-section-title">Calculadora de posición</div>
            <div class="tl-section-sub">Calcula el lotaje desde capital, riesgo, instrumento y stop.</div>
          </div>
          <div class="calculator-workspace-badges">
            ${badgeMarkup({ label: compactSourceLabel(model.spec), tone: specSourceTone(model.spec.source) }, "ui-badge--compact calculator-soft-badge")}
            ${badgeMarkup({ label: stopModeLabel, tone: "neutral" }, "ui-badge--compact calculator-soft-badge")}
          </div>
        </div>

        <div class="calculator-workflow-grid">
          <div class="calculator-input-panel" aria-label="Datos del trade">
            <div class="calculator-panel-label">Datos del trade</div>
            <div class="calculator-fast-grid">
              <label class="form-stack calculator-fast-field">
                <span>Divisa</span>
                <select data-calc-field="quoteCurrency">
                  ${ACCOUNT_CURRENCIES.map((currency) => `<option value="${currency}" ${model.accountCurrency === currency ? "selected" : ""}>${currency}</option>`).join("")}
                </select>
              </label>
              <label class="form-stack calculator-fast-field">
                <span>Capital (${model.accountCurrency})</span>
                <input type="text" inputmode="decimal" data-calc-field="accountSize" value="${calc.accountSize}" placeholder="${currentModel?.account.balance || ""}" autocomplete="off">
              </label>
              <label class="form-stack calculator-fast-field">
                <span>Riesgo %</span>
                <input type="text" inputmode="decimal" data-calc-field="riskPct" value="${calc.riskPct}" autocomplete="off">
                <div class="calc-inline-presets calculator-mini-presets calculator-attached-presets calculator-risk-presets" aria-label="Presets rápidos de riesgo">
                  ${[0.5, 1, 1.5, 2].map((preset) => `<button class="calc-pill ${toNumber(calc.riskPct) === preset ? "active" : ""}" type="button" data-calc-preset="riskPct" data-calc-value="${preset}">${preset}%</button>`).join("")}
                </div>
              </label>
              <label class="form-stack calculator-fast-field">
                <span>Instrumento</span>
                <input type="text" data-calc-field="symbol" value="${escapeHtml(calc.symbol)}" placeholder="EURJPY, GER40, BTCUSD">
                <div class="calc-chip-group calculator-symbol-strip calculator-attached-presets" aria-label="Presets rápidos de instrumento">
                  ${QUICK_INSTRUMENTS.map((item) => `<button class="calc-chip ${symbolKey === item.symbol ? "active" : ""}" type="button" data-calc-symbol="${item.symbol}">${item.label}</button>`).join("")}
                </div>
              </label>
              <label class="form-stack calculator-fast-field">
                <span>Distancia SL (${unitLabel})</span>
                <input type="text" inputmode="decimal" data-calc-field="stopPips" value="${calc.slMode === "price" ? model.stopPips.toFixed(1) : calc.stopPips}" autocomplete="off" ${calc.slMode === "price" ? "readonly" : ""}>
                <div class="calculator-segmented-control calculator-sl-segmented" role="group" aria-label="Modo Stop Loss">
                  <button class="calc-pill ${calc.slMode === "distance" ? "active" : ""}" type="button" data-calc-preset="slMode" data-calc-value="distance">Por distancia</button>
                  <button class="calc-pill ${calc.slMode === "price" ? "active" : ""}" type="button" data-calc-preset="slMode" data-calc-value="price">Por precio</button>
                </div>
              </label>
              <label class="form-stack calculator-fast-field">
                <span>R:R</span>
                <div class="calc-inline-presets calculator-mini-presets calculator-segmented-control calculator-rr-control" role="group" aria-label="Selector R:R">
                  ${["1:1", "1:2", "1:3", "1:4"].map((preset) => `<button class="calc-pill ${calc.rrPreset === preset ? "active" : ""}" type="button" data-calc-preset="rrPreset" data-calc-value="${preset}">${preset}</button>`).join("")}
                </div>
              </label>
            </div>

            <div class="calculator-price-fields ${calc.slMode === "price" ? "is-visible" : ""}">
              <label class="form-stack"><span>Precio entrada</span><input type="text" inputmode="decimal" data-calc-field="entry" value="${calc.entry}" autocomplete="off"></label>
              <label class="form-stack"><span>Precio SL</span><input type="text" inputmode="decimal" data-calc-field="stop" value="${calc.stop}" autocomplete="off"></label>
            </div>
          </div>

          <div class="calculator-result-panel" aria-label="Resultado">
            <div class="calculator-panel-label">Resultado</div>
            <div class="calculator-primary-result">
              <span>Lotaje calculado</span>
              <strong>${model.roundedLots.toFixed(2)} lotes</strong>
              <small>${escapeHtml(normalizeSymbol(calc.symbol))} · riesgo real ${model.realRiskPct.toFixed(2)}% · ${formatCurrency(model.realRiskUsd, model.accountCurrency)}</small>
            </div>
            ${lotWarningMarkup(model)}
            ${specSourceMarkup(model)}
            <div class="calculator-metric-grid">
              ${calculatorMetricMarkup("Riesgo", formatCurrency(model.realRiskUsd, model.accountCurrency), `${model.riskPct.toFixed(2)}% configurado`)}
              ${calculatorMetricMarkup("R:R", `1:${model.rr}`, `${model.tpPips.toFixed(1)} ${unitLabel} TP`)}
              ${calculatorMetricMarkup("Resultado TP", formatCurrency(model.tpUsd, model.accountCurrency), `Precio TP ${targetCopy}`)}
              ${calculatorMetricMarkup("Exposición", `${model.realRiskPct.toFixed(2)}%`, `${Math.round(model.units).toLocaleString("es-ES")} unidades`)}
            </div>
            <div class="calculator-exposure-strip">
              <span>Exposición</span>
              <div class="score-bar-track calc-exposure-track">
                <div class="score-bar-fill calc-exposure-fill calc-exposure-fill--${model.exposureTone}" style="width:${Math.min(model.realRiskPct * 50, 100)}%"></div>
              </div>
              <strong>${model.realRiskPct.toFixed(2)}%</strong>
            </div>
          </div>

          <div class="calculator-validation-panel" aria-label="Validación de riesgo">
            <div class="calculator-validation-head">
              <div>
                <div class="calculator-panel-label">Validación</div>
                <div class="tl-section-sub">Risk Engine</div>
              </div>
              ${model.riskAdvice ? badgeMarkup({ label: model.riskAdvice.risk_state, tone: adviceTone }, "ui-badge--compact") : badgeMarkup({ label: "Sin lectura", tone: "neutral" }, "ui-badge--compact")}
            </div>
            ${riskAdviceMarkup(model, adviceTone)}
          </div>
        </div>
      </section>

      <details class="tl-section-card calculator-advanced-card" ${advancedOpen ? "open" : ""}>
        <summary>
          <span>Ajustes avanzados</span>
          <small>Supuestos del instrumento, perfil y precio TP.</small>
        </summary>
        <div class="calculator-advanced-body">
          <div class="form-grid-clean calc-form-grid calculator-spec-form">
            <label class="form-stack">
              <span>Perfil de cálculo</span>
              <select data-calc-field="broker" ${specControlState}>
                ${Object.keys(CALCULATION_PROFILES).map((profile) => `<option value="${profile}" ${calc.broker === profile ? "selected" : ""}>${profile}</option>`).join("")}
              </select>
              <small>${specLocked ? "Ignorado mientras existan specs MT5 live." : model.spec.source === "standalone_fx" ? "Forex estándar por divisa y tipos de cambio." : "Preset editable, no verdad absoluta del broker."}</small>
            </label>
            <label class="form-stack">
              <span>Tipo de instrumento</span>
              <select data-calc-field="instrumentType" ${specControlState}>
                ${["Forex", "Índice", "Metal", "Cripto", "Personalizado"].map((type) => `<option value="${type}" ${model.spec.type === type ? "selected" : ""}>${type}</option>`).join("")}
              </select>
            </label>
            <label class="form-stack">
              <span>Unidad SL</span>
              <select data-calc-field="unitLabel" ${specControlState}>
                ${["pips", "puntos", "pips/puntos"].map((unit) => `<option value="${unit}" ${unitLabel === unit ? "selected" : ""}>${unit}</option>`).join("")}
              </select>
            </label>
            <label class="form-stack">
              <span>Valor por pip/punto por lote</span>
              <input type="text" inputmode="decimal" data-calc-field="pipValuePerLot" value="${formatInputNumber(model.spec.pipValue, 6)}" autocomplete="off" ${specInputState}>
            </label>
            <label class="form-stack">
              <span>Multiplicador pip/punto</span>
              <input type="text" inputmode="decimal" data-calc-field="pipMultiplier" value="${formatInputNumber(model.spec.pipMultiplier, 6)}" autocomplete="off" ${specInputState}>
            </label>
            <label class="form-stack">
              <span>Tamaño contrato / lote base</span>
              <input type="text" inputmode="decimal" data-calc-field="lotUnit" value="${formatInputNumber(model.spec.lotUnit, 2)}" autocomplete="off" ${specInputState}>
            </label>
            <label class="form-stack">
              <span>Precio TP</span>
              <input type="text" value="${targetCopy}" readonly>
            </label>
          </div>
          <div class="calculator-spec-note calculator-spec-note--${model.spec.source || "manual"}">
            ${escapeHtml(model.spec.accuracyCopy)} ${escapeHtml(model.profileCopy)} ${escapeHtml(model.spec.source === "standalone_fx" ? "" : model.profile.note)} ${escapeHtml(volumeMeta)}
          </div>
        </div>
      </details>

      <div class="calculator-authority-footnote">
        ${renderAuthorityNotice(authorityMeta)}
      </div>
    </div>
  `;
  restoreFocusedCalculatorField(root, focusedField);
}

function decimalPlaces(value) {
  const normalized = String(value || "");
  if (!normalized.includes(".")) return 0;
  return normalized.split(".")[1]?.length || 0;
}

function roundLotToStep(value, step) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const safeStep = Number.isFinite(Number(step)) && Number(step) > 0 ? Number(step) : 0.01;
  const precision = Math.min(Math.max(decimalPlaces(safeStep), 2), 8);
  const rounded = Math.floor((value + Number.EPSILON) / safeStep) * safeStep;
  return Number(rounded.toFixed(precision));
}

function resolveLotSize(spec, value) {
  const fallbackStep = spec.type === "Forex" || spec.type === "Metal" ? 0.01 : 0.1;
  const step = Number.isFinite(Number(spec.volumeStep)) && Number(spec.volumeStep) > 0
    ? Number(spec.volumeStep)
    : fallbackStep;
  const min = Number.isFinite(Number(spec.volumeMin)) && Number(spec.volumeMin) > 0 ? Number(spec.volumeMin) : null;
  const max = Number.isFinite(Number(spec.volumeMax)) && Number(spec.volumeMax) > 0 ? Number(spec.volumeMax) : null;
  let lots = roundLotToStep(value, step);
  let warning = null;

  if (spec.source === "live" && min !== null && value > 0 && lots < min) {
    lots = min;
    warning = {
      title: "Lotaje mínimo MT5 aplicado",
      copy: `El cálculo queda por debajo del mínimo del broker (${formatSpecNumber(min, 4)} lotes). Revisa el riesgo real antes de operar.`
    };
  }

  if (spec.source === "live" && max !== null && lots > max) {
    lots = roundLotToStep(max, step);
    warning = {
      title: "Lotaje máximo MT5 aplicado",
      copy: `El cálculo supera el máximo del broker (${formatSpecNumber(max, 4)} lotes). Se limita al máximo permitido.`
    };
  }

  return { lots, step, min, max, warning };
}

function rrPresetValue(value) {
  const [, reward] = String(value || "1:2").split(":").map(Number);
  return Number.isFinite(reward) ? reward : 2;
}

function roundPrice(value, decimals = 2) {
  return Number(value.toFixed(decimals));
}
