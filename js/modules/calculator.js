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

const TOOL_CARDS = [
  {
    id: "position",
    title: "Calculadora",
    copy: "Calcula lotaje, riesgo real y objetivo antes de abrir una operación.",
    status: "Activa",
    active: true,
  },
  {
    id: "risk",
    title: "Riesgo",
    copy: "Contrasta el riesgo con la lectura actual del Risk Engine.",
    status: "Incluido",
    active: true,
  },
  {
    id: "rr",
    title: "RR / SL / TP",
    copy: "Planifica entrada, stop y objetivo con presets de R:R.",
    status: "Preparado",
  },
  {
    id: "drawdown",
    title: "Simulador DD",
    copy: "Evalúa el impacto de una pérdida antes de abrir operación.",
    status: "Próximamente",
  },
  {
    id: "checklist",
    title: "Checklist",
    copy: "Preparará una revisión rápida antes de operar.",
    status: "Próximamente",
  },
  {
    id: "prop-guard",
    title: "Prop guard",
    copy: "Validará trades contra reglas de Funding.",
    status: "Próximamente",
  },
];

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

function inferInstrumentId(symbol) {
  return SYMBOL_SPECS[normalizeSymbol(symbol)]?.instrumentId || "custom";
}

function ensureCalculatorState(calc = {}, currentModel) {
  const symbol = calc.symbol || "EURUSD";
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
    quoteCurrency: calc.quoteCurrency || "USD"
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

function resolveInstrumentSpec(calc) {
  const symbolKey = normalizeSymbol(calc.symbol);
  const presetSpec = SYMBOL_SPECS[symbolKey];
  const type = calc.instrumentType || presetSpec?.type || "Personalizado";
  const unitLabel = calc.unitLabel || presetSpec?.unitLabel || unitLabelForType(type);
  const spec = {
    pipValue: toOptionalNumber(calc.pipValuePerLot, presetSpec?.pipValue ?? 1),
    pipMultiplier: toOptionalNumber(calc.pipMultiplier, presetSpec?.pipMultiplier ?? 1),
    lotUnit: toOptionalNumber(calc.lotUnit, presetSpec?.lotUnit ?? 1),
    decimals: presetSpec?.decimals ?? (type === "Forex" ? 4 : 2),
    type,
    unitLabel,
    source: presetSpec ? "preset" : "custom"
  };
  return spec;
}

function unitLabelForType(type) {
  if (type === "Forex") return "pips";
  if (type === "Índice" || type === "Metal") return "puntos";
  return "pips/puntos";
}

function instrumentProfileCopy(spec) {
  if (spec.source === "custom") return "Perfil personalizado. Verifica valor por punto.";
  if (spec.type === "Forex") return "Perfil estándar Forex.";
  if (spec.type === "Índice") return "Perfil estándar para índices.";
  if (spec.type === "Metal") return "Perfil estándar para metales.";
  return "Perfil editable. Verifica las especificaciones del instrumento.";
}

function calculateModel(state) {
  const currentModel = selectCurrentModel(state);
  const calc = ensureCalculatorState(state.workspace.calculator, currentModel);
  const riskAdvice = getCalculatorRiskAdvice(currentModel);
  const spec = resolveInstrumentSpec(calc);
  const profile = CALCULATION_PROFILES[calc.broker] || CALCULATION_PROFILES.Manual;

  const accountSize = toNumber(calc.accountSize, currentModel?.account.balance || 0);
  const riskPct = toNumber(calc.riskPct, 0.5);
  const entry = toNumber(calc.entry, 0);
  const stop = toNumber(calc.stop, 0);
  const priceStopPips = Math.abs(entry - stop) * spec.pipMultiplier;
  const directStopPips = toNumber(calc.stopPips, priceStopPips || 15);
  const stopPips = Math.max(calc.slMode === "price" ? priceStopPips || directStopPips : directStopPips, 0.1);
  const riskUsd = accountSize * (riskPct / 100);
  const pipValue = spec.pipValue * profile.pointValue;
  const rawLots = riskUsd / (stopPips * pipValue || 1);
  const lotSize = Math.max(0, rawLots);
  const roundedLots = roundLotSize(spec.type, lotSize);
  const realRiskUsd = roundedLots * stopPips * pipValue;
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
    accountSize,
    riskPct,
    stopPips,
    priceStopPips,
    pipValue,
    riskUsd,
    lotSize,
    roundedLots,
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

function toolCardMarkup(tool) {
  const className = [
    "tools-card",
    tool.id === "position" ? "is-active" : "",
    tool.active && tool.id !== "position" ? "is-included" : "",
    !tool.active ? "is-disabled" : ""
  ].filter(Boolean).join(" ");
  const tone = tool.id === "position" ? "ok" : tool.active ? "neutral" : "neutral";
  return `
    <article class="${className}" aria-current="${tool.id === "position" ? "true" : "false"}" aria-label="${escapeHtml(`${tool.title}: ${tool.copy}`)}">
      <div class="tools-card__top">
        <strong>${tool.title}</strong>
        ${badgeMarkup({ label: tool.status, tone }, "ui-badge--compact")}
      </div>
    </article>
  `;
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

function riskAdviceMarkup(model, adviceTone) {
  if (!model.riskAdvice) {
    return `
      <div class="calculator-advice-empty calculator-advice-panel">
        <div>
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
        <span>Riesgo recomendado</span>
        <strong>${model.riskAdvice.recommendedRiskPct.toFixed(2)}%</strong>
      </div>
      <div class="calculator-advice-copy">
        <span>${model.riskAdvice.explanation || "El motor no detecta presión extraordinaria en este momento."}</span>
        <small>${deltaCopy}</small>
        <button class="btn-secondary btn-inline calculator-advice-action" type="button" data-calc-apply-risk>Aplicar</button>
      </div>
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
  const stopModeLabel = calc.slMode === "price" ? "SL por precio" : "SL por distancia";
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

      <section class="tools-hub-grid" aria-label="Herramientas disponibles">
        ${TOOL_CARDS.map(toolCardMarkup).join("")}
      </section>

      <section class="tl-section-card calculator-workspace-card" aria-label="Calculadora de posición">
        <div class="calculator-workspace-head">
          <div>
            <div class="tl-section-title">Calculadora de posición</div>
            <div class="tl-section-sub">Datos del trade → lotaje → validación de riesgo.</div>
          </div>
          ${badgeMarkup({ label: stopModeLabel, tone: "neutral" }, "ui-badge--compact")}
        </div>

        <div class="calculator-workflow-grid">
          <div class="calculator-input-panel" aria-label="Datos del trade">
            <div class="calculator-panel-label">Datos del trade</div>
            <div class="calculator-fast-grid">
              <label class="form-stack calculator-fast-field">
                <span>Capital ($)</span>
                <input type="text" inputmode="decimal" data-calc-field="accountSize" value="${calc.accountSize}" placeholder="${currentModel?.account.balance || ""}" autocomplete="off">
              </label>
              <label class="form-stack calculator-fast-field">
                <span>Riesgo %</span>
                <input type="text" inputmode="decimal" data-calc-field="riskPct" value="${calc.riskPct}" autocomplete="off">
                <div class="calc-inline-presets calculator-mini-presets">
                  ${[0.5, 1, 1.5, 2].map((preset) => `<button class="calc-pill ${toNumber(calc.riskPct) === preset ? "active" : ""}" type="button" data-calc-preset="riskPct" data-calc-value="${preset}">${preset}%</button>`).join("")}
                </div>
              </label>
              <label class="form-stack calculator-fast-field">
                <span>Instrumento</span>
                <input type="text" data-calc-field="symbol" value="${escapeHtml(calc.symbol)}" placeholder="EURJPY, GER40, BTCUSD">
              </label>
              <label class="form-stack calculator-fast-field">
                <span>Distancia SL (${unitLabel})</span>
                <input type="text" inputmode="decimal" data-calc-field="stopPips" value="${calc.slMode === "price" ? model.stopPips.toFixed(1) : calc.stopPips}" autocomplete="off" ${calc.slMode === "price" ? "readonly" : ""}>
              </label>
              <label class="form-stack calculator-fast-field">
                <span>R:R</span>
                <div class="calc-inline-presets calculator-mini-presets">
                  ${["1:1", "1:2", "1:3", "1:4"].map((preset) => `<button class="calc-pill ${calc.rrPreset === preset ? "active" : ""}" type="button" data-calc-preset="rrPreset" data-calc-value="${preset}">${preset}</button>`).join("")}
                </div>
              </label>
            </div>

            <div class="calculator-fast-controls">
              <div class="calc-chip-group calculator-symbol-strip" aria-label="Presets rápidos de instrumento">
                ${QUICK_INSTRUMENTS.map((item) => `<button class="calc-chip ${symbolKey === item.symbol ? "active" : ""}" type="button" data-calc-symbol="${item.symbol}">${item.label}</button>`).join("")}
              </div>
              <div class="calc-inline-presets calculator-mode-switch">
                <button class="calc-pill ${calc.slMode === "distance" ? "active" : ""}" type="button" data-calc-preset="slMode" data-calc-value="distance">SL distancia</button>
                <button class="calc-pill ${calc.slMode === "price" ? "active" : ""}" type="button" data-calc-preset="slMode" data-calc-value="price">SL precio</button>
              </div>
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
              <small>${escapeHtml(calc.symbol)} · riesgo real ${model.realRiskPct.toFixed(2)}% · ${formatCurrency(model.realRiskUsd)}</small>
            </div>
            <div class="calculator-metric-grid">
              ${calculatorMetricMarkup("Riesgo $", formatCurrency(model.realRiskUsd), `${model.riskPct.toFixed(2)}% configurado`)}
              ${calculatorMetricMarkup("R:R", `1:${model.rr}`, `${model.tpPips.toFixed(1)} ${unitLabel} TP`)}
              ${calculatorMetricMarkup("Resultado TP", formatCurrency(model.tpUsd), `Precio TP ${targetCopy}`)}
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
                <div class="calculator-panel-label">Validación de riesgo</div>
                <div class="tl-section-sub">Lectura compacta del Risk Engine.</div>
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
          <small>Supuestos del instrumento, perfil de cálculo y precio TP.</small>
        </summary>
        <div class="calculator-advanced-body">
          <div class="form-grid-clean calc-form-grid calculator-spec-form">
            <label class="form-stack">
              <span>Perfil de cálculo</span>
              <select data-calc-field="broker">
                ${Object.keys(CALCULATION_PROFILES).map((profile) => `<option value="${profile}" ${calc.broker === profile ? "selected" : ""}>${profile}</option>`).join("")}
              </select>
              <small>Preset editable, no verdad absoluta del broker.</small>
            </label>
            <label class="form-stack">
              <span>Tipo de instrumento</span>
              <select data-calc-field="instrumentType">
                ${["Forex", "Índice", "Metal", "Cripto", "Personalizado"].map((type) => `<option value="${type}" ${model.spec.type === type ? "selected" : ""}>${type}</option>`).join("")}
              </select>
            </label>
            <label class="form-stack">
              <span>Unidad SL</span>
              <select data-calc-field="unitLabel">
                ${["pips", "puntos", "pips/puntos"].map((unit) => `<option value="${unit}" ${unitLabel === unit ? "selected" : ""}>${unit}</option>`).join("")}
              </select>
            </label>
            <label class="form-stack">
              <span>Valor por pip/punto por lote</span>
              <input type="text" inputmode="decimal" data-calc-field="pipValuePerLot" value="${model.spec.pipValue}" autocomplete="off">
            </label>
            <label class="form-stack">
              <span>Multiplicador pip/punto</span>
              <input type="text" inputmode="decimal" data-calc-field="pipMultiplier" value="${model.spec.pipMultiplier}" autocomplete="off">
            </label>
            <label class="form-stack">
              <span>Tamaño contrato / lote base</span>
              <input type="text" inputmode="decimal" data-calc-field="lotUnit" value="${model.spec.lotUnit}" autocomplete="off">
            </label>
            <label class="form-stack">
              <span>Precio TP</span>
              <input type="text" value="${targetCopy}" readonly>
            </label>
          </div>
          <div class="calculator-spec-note">
            Supuestos editables. Verifica tu broker. ${model.profileCopy} ${model.profile.note}
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

function roundLotSize(instrumentType, value) {
  const precision = instrumentType === "Forex" || instrumentType === "Metal" ? 0.01 : 0.1;
  return Math.floor(value / precision) * precision;
}

function rrPresetValue(value) {
  const [, reward] = String(value || "1:2").split(":").map(Number);
  return Number.isFinite(reward) ? reward : 2;
}

function roundPrice(value, decimals = 2) {
  return Number(value.toFixed(decimals));
}
