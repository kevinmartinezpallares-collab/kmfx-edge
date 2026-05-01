import { describeAccountAuthority, formatCurrency, renderAuthorityNotice, selectCurrentAccount, selectCurrentModel } from "./utils.js?v=build-20260406-213500";
import { computeRecommendedRiskFromModel } from "./risk-engine.js?v=build-20260406-213500";
import { badgeMarkup } from "./status-badges.js?v=build-20260406-213500";
import { pageHeaderMarkup } from "./ui-primitives.js?v=build-20260406-213500";

const INSTRUMENTS = [
  { id: "forex", label: "Forex", symbols: ["EURUSD", "GBPUSD", "USDJPY"] },
  { id: "nas100", label: "NAS100", symbols: ["NAS100"] },
  { id: "sp500", label: "S&P500", symbols: ["US500"] },
  { id: "gold", label: "Oro", symbols: ["XAUUSD"] }
];

const BROKERS = {
  FTMO: { pointValue: 1, contractSize: 1, note: "Perfil estándar para índices." },
  FundingPips: { pointValue: 1, contractSize: 1, note: "Sizing conservador y microajustes." },
  Orion: { pointValue: 1, contractSize: 1, note: "Contrato simulado para cuenta principal." },
  "Darwinex Zero": { pointValue: 1, contractSize: 1, note: "Referencia DMA / FX profesional." },
  "Wall Street": { pointValue: 1, contractSize: 1, note: "Perfil de índice con punto entero." },
  "IC Markets": { pointValue: 1, contractSize: 100000, note: "Broker de referencia para FX spot." }
};

const SYMBOL_SPECS = {
  EURUSD: { pipValue: 10, pipMultiplier: 10000, lotUnit: 100000, decimals: 4, type: "Forex" },
  GBPUSD: { pipValue: 10, pipMultiplier: 10000, lotUnit: 100000, decimals: 4, type: "Forex" },
  USDJPY: { pipValue: 9.1, pipMultiplier: 100, lotUnit: 100000, decimals: 3, type: "Forex" },
  NAS100: { pipValue: 1, pipMultiplier: 1, lotUnit: 1, decimals: 1, type: "Índice" },
  US500: { pipValue: 1, pipMultiplier: 1, lotUnit: 1, decimals: 1, type: "Índice" },
  XAUUSD: { pipValue: 10, pipMultiplier: 10, lotUnit: 100, decimals: 2, type: "Metal" }
};

const TOOL_CARDS = [
  {
    id: "position",
    title: "Calculadora de posición",
    copy: "Calcula lotaje, riesgo real y objetivo antes de abrir una operación.",
    status: "Activa",
    active: true,
  },
  {
    id: "risk",
    title: "Riesgo por operación",
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
    title: "Simulador de DD",
    copy: "Evalúa el impacto de una pérdida antes de abrir operación.",
    status: "Próximamente",
  },
  {
    id: "checklist",
    title: "Checklist pre-operativa",
    copy: "Preparará una revisión rápida antes de operar.",
    status: "Próximamente",
  },
  {
    id: "prop-guard",
    title: "Prop challenge guard",
    copy: "Validará trades contra reglas de Funding.",
    status: "Próximamente",
  },
];

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function ensureCalculatorState(calc = {}, currentModel) {
  return {
    instrument: calc.instrument || "forex",
    broker: calc.broker || "FTMO",
    symbol: calc.symbol || "EURUSD",
    accountSize: calc.accountSize || currentModel?.account.balance || "",
    riskPct: calc.riskPct ?? 0.5,
    stopPips: calc.stopPips ?? 15,
    entry: calc.entry ?? 1.0842,
    stop: calc.stop ?? 1.0827,
    target: calc.target ?? 1.0878,
    rrPreset: calc.rrPreset || "1:2"
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

function calculateModel(state) {
  const currentModel = selectCurrentModel(state);
  const calc = ensureCalculatorState(state.workspace.calculator, currentModel);
  const riskAdvice = getCalculatorRiskAdvice(currentModel);
  const spec = SYMBOL_SPECS[calc.symbol] || SYMBOL_SPECS.EURUSD;
  const broker = BROKERS[calc.broker] || BROKERS.FTMO;

  const accountSize = toNumber(calc.accountSize, currentModel?.account.balance || 0);
  const riskPct = toNumber(calc.riskPct, 0.5);
  const entry = toNumber(calc.entry, 0);
  const stop = toNumber(calc.stop, 0);
  const stopPips = Math.max(toNumber(calc.stopPips, Math.abs(entry - stop) * spec.pipMultiplier), 0.1);
  const riskUsd = accountSize * (riskPct / 100);
  const pipValue = spec.pipValue * broker.pointValue;
  const rawLots = riskUsd / (stopPips * pipValue || 1);
  const lotSize = Math.max(0, rawLots);
  const roundedLots = roundLotSize(calc.instrument, lotSize);
  const realRiskUsd = roundedLots * stopPips * pipValue;
  const realRiskPct = accountSize ? (realRiskUsd / accountSize) * 100 : 0;
  const rr = rrPresetValue(calc.rrPreset);
  const tpPips = stopPips * rr;
  const tpUsd = realRiskUsd * rr;
  const units = roundedLots * spec.lotUnit;
  const exposureTone = realRiskPct <= 1 ? "green" : realRiskPct <= 2 ? "gold" : "red";
  const stopDistance = stopPips / spec.pipMultiplier;
  const target = calc.instrument === "forex" || calc.symbol === "XAUUSD"
    ? entry + (entry >= stop ? stopDistance * rr : -stopDistance * rr)
    : entry + (entry >= stop ? tpPips : -tpPips);

  return {
    calc,
    riskAdvice,
    spec,
    broker,
    accountSize,
    riskPct,
    stopPips,
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
    target: roundPrice(target, spec.decimals)
  };
}

function toolCardMarkup(tool) {
  return `
    <article class="tools-card ${tool.active ? "is-active" : "is-disabled"}" aria-current="${tool.id === "position" ? "true" : "false"}">
      <div class="tools-card__top">
        <strong>${tool.title}</strong>
        ${badgeMarkup({ label: tool.status, tone: tool.active ? "ok" : "neutral" }, "ui-badge--compact")}
      </div>
      <span>${tool.copy}</span>
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
      <div class="calculator-advice-empty">
        <strong>Sin lectura del Risk Engine</strong>
        <span>La calculadora sigue operativa aunque el motor de riesgo no esté disponible.</span>
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
    <div class="calculator-advice-grid">
      <div class="calculator-advice-primary">
        <span>Riesgo recomendado</span>
        <strong>${model.riskAdvice.recommendedRiskPct.toFixed(2)}%</strong>
      </div>
      <div class="calculator-advice-copy">
        <span>${model.riskAdvice.explanation || "El motor no detecta presión extraordinaria en este momento."}</span>
        <small>${deltaCopy}</small>
      </div>
    </div>
    <button class="btn-secondary btn-inline" type="button" data-calc-apply-risk>Aplicar sugerencia</button>
  `;
}

export function initCalculator(store) {
  const root = document.getElementById("calculatorRoot");
  if (!root) return;

  root.addEventListener("input", (event) => {
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

  root.addEventListener("click", (event) => {
    const instrument = event.target.closest("[data-calc-instrument]");
    const preset = event.target.closest("[data-calc-preset]");
    const applyRisk = event.target.closest("[data-calc-apply-risk]");
    if (instrument) {
      const nextInstrument = instrument.dataset.calcInstrument;
      const firstSymbol = INSTRUMENTS.find((item) => item.id === nextInstrument)?.symbols?.[0] || "EURUSD";
      store.setState((state) => ({
        ...state,
        workspace: {
          ...state.workspace,
          calculator: {
            ...ensureCalculatorState(state.workspace.calculator, selectCurrentModel(state)),
            instrument: nextInstrument,
            symbol: firstSymbol
          }
        }
      }));
    }
    if (preset) {
      const kind = preset.dataset.calcPreset;
      const value = preset.dataset.calcValue;
      store.setState((state) => ({
        ...state,
        workspace: {
          ...state.workspace,
          calculator: {
            ...ensureCalculatorState(state.workspace.calculator, selectCurrentModel(state)),
            [kind]: kind === "rrPreset" ? value : Number(value)
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
  const instrumentSymbols = INSTRUMENTS.find((item) => item.id === calc.instrument)?.symbols || [];
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

      ${renderAuthorityNotice(authorityMeta)}

      <section class="tools-hub-grid" aria-label="Herramientas disponibles">
        ${TOOL_CARDS.map(toolCardMarkup).join("")}
      </section>

      <section class="calculator-active-shell" aria-label="Calculadora de posición">
        <article class="tl-section-card calculator-result-card">
          <div class="calculator-result-head">
            <div>
              <div class="tl-section-title">Calculadora de posición</div>
              <div class="tl-section-sub">Sizing activo para ${calc.symbol} con ${calc.broker}.</div>
            </div>
            ${badgeMarkup({ label: "Activa", tone: "ok" }, "ui-badge--compact")}
          </div>

          <div class="calculator-primary-result">
            <span>Lotaje calculado</span>
            <strong>${model.roundedLots.toFixed(2)} lotes</strong>
            <small>Riesgo real ${model.realRiskPct.toFixed(2)}% · ${formatCurrency(model.realRiskUsd)}</small>
          </div>

          <div class="calculator-metric-grid">
            ${calculatorMetricMarkup("Riesgo $", formatCurrency(model.realRiskUsd), `${model.riskPct.toFixed(2)}% configurado`)}
            ${calculatorMetricMarkup("R:R", `1:${model.rr}`, `${model.tpPips.toFixed(1)} pips TP`)}
            ${calculatorMetricMarkup("Resultado TP", formatCurrency(model.tpUsd), `Precio TP ${model.target}`)}
            ${calculatorMetricMarkup("Exposición", `${model.realRiskPct.toFixed(2)}%`, `${Math.round(model.units).toLocaleString("es-ES")} unidades`)}
          </div>

          <div class="calculator-exposure-strip">
            <span>Exposición</span>
            <div class="score-bar-track calc-exposure-track">
              <div class="score-bar-fill calc-exposure-fill calc-exposure-fill--${model.exposureTone}" style="width:${Math.min(model.realRiskPct * 50, 100)}%"></div>
            </div>
            <strong>${model.realRiskPct.toFixed(2)}%</strong>
          </div>
          <div class="tl-section-sub">Verde ≤ 1% · Amarillo ≤ 2% · Rojo &gt; 2%</div>
        </article>

        <article class="tl-section-card calculator-advice-card">
          <div class="calculator-result-head">
            <div>
              <div class="tl-section-title">Riesgo</div>
              <div class="tl-section-sub">Contexto operativo antes de ejecutar.</div>
            </div>
            ${model.riskAdvice ? badgeMarkup({ label: model.riskAdvice.risk_state, tone: adviceTone }, "ui-badge--compact") : badgeMarkup({ label: "Sin lectura", tone: "neutral" }, "ui-badge--compact")}
          </div>
          ${riskAdviceMarkup(model, adviceTone)}
        </article>
      </section>

      <section class="calculator-workbench-grid" aria-label="Configuración del trade">
        <article class="tl-section-card calculator-config-card">
          <div class="tl-section-header">
            <div>
              <div class="tl-section-title">Configuración del trade</div>
              <div class="tl-section-sub">Ajusta instrumento, riesgo, stop y R:R sin cambiar el motor de cálculo.</div>
            </div>
          </div>

          <div class="calc-chip-group">
            ${INSTRUMENTS.map((item) => `<button class="calc-chip ${calc.instrument === item.id ? "active" : ""}" type="button" data-calc-instrument="${item.id}">${item.label}</button>`).join("")}
          </div>

          <div class="form-grid-clean calc-form-grid calculator-form-grid">
            <label class="form-stack">
              <span>Broker</span>
              <select data-calc-field="broker">
                ${Object.keys(BROKERS).map((broker) => `<option value="${broker}" ${calc.broker === broker ? "selected" : ""}>${broker}</option>`).join("")}
              </select>
            </label>
            <label class="form-stack">
              <span>Par / instrumento</span>
              <select data-calc-field="symbol">
                ${instrumentSymbols.map((symbol) => `<option value="${symbol}" ${calc.symbol === symbol ? "selected" : ""}>${symbol}</option>`).join("")}
              </select>
            </label>
            <label class="form-stack"><span>Capital ($)</span><input type="number" data-calc-field="accountSize" value="${calc.accountSize}" placeholder="${currentModel?.account.balance || ""}"></label>
            <label class="form-stack">
              <span>Riesgo %</span>
              <input type="number" step="0.1" data-calc-field="riskPct" value="${calc.riskPct}">
              <div class="calc-inline-presets">
                ${[0.5, 1, 1.5, 2].map((preset) => `<button class="calc-pill ${Number(calc.riskPct) === preset ? "active" : ""}" type="button" data-calc-preset="riskPct" data-calc-value="${preset}">${preset}%</button>`).join("")}
              </div>
            </label>
            <label class="form-stack"><span>Stop Loss</span><input type="number" step="0.1" data-calc-field="stopPips" value="${calc.stopPips}"></label>
            <label class="form-stack"><span>Precio entrada</span><input type="number" step="0.0001" data-calc-field="entry" value="${calc.entry}"></label>
            <label class="form-stack"><span>Precio SL</span><input type="number" step="0.0001" data-calc-field="stop" value="${calc.stop}"></label>
            <label class="form-stack">
              <span>R:R</span>
              <div class="calc-inline-presets">
                ${["1:1", "1:2", "1:3", "1:4"].map((preset) => `<button class="calc-pill ${calc.rrPreset === preset ? "active" : ""}" type="button" data-calc-preset="rrPreset" data-calc-value="${preset}">${preset}</button>`).join("")}
              </div>
            </label>
          </div>
        </article>

        <article class="tl-section-card calculator-spec-card">
          <div class="tl-section-header">
            <div>
              <div class="tl-section-title">Contexto / especificación</div>
              <div class="tl-section-sub">Valores del instrumento usados por la calculadora actual.</div>
            </div>
          </div>
          <div class="calculator-spec-list">
            ${calculatorMetricMarkup("Instrumento", calc.symbol, model.spec.type)}
            ${calculatorMetricMarkup("Pip value", formatCurrency(model.pipValue), `${model.spec.pipMultiplier} multiplicador`)}
            ${calculatorMetricMarkup("Lote base", model.spec.lotUnit.toLocaleString("es-ES"), calc.broker)}
            ${calculatorMetricMarkup("Precio TP", String(model.target), `${model.tpPips.toFixed(1)} pips`)}
          </div>
          <div class="tl-section-sub">${model.broker.note}</div>
        </article>
      </section>
    </div>
  `;
}

function roundLotSize(instrument, value) {
  const precision = instrument === "forex" || instrument === "gold" ? 0.01 : 0.1;
  return Math.floor(value / precision) * precision;
}

function rrPresetValue(value) {
  const [, reward] = String(value || "1:2").split(":").map(Number);
  return Number.isFinite(reward) ? reward : 2;
}

function roundPrice(value, decimals = 2) {
  return Number(value.toFixed(decimals));
}
