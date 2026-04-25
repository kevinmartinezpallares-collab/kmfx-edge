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
  const advisoryMesh = `
    <div class="calc-advisory-blobs" aria-hidden="true">
      <div class="calc-advisory-blob blob-1"></div>
      <div class="calc-advisory-blob blob-2"></div>
      <div class="calc-advisory-blob blob-3"></div>
      <div class="calc-advisory-blob blob-4"></div>
    </div>
  `;

  root.innerHTML = `
    ${pageHeaderMarkup({
      title: "Calculadora de Lotaje",
      description: "Sizing rápido con broker, instrumento, riesgo real y exposición operativa controlada.",
      className: "tl-page-header",
      titleClassName: "tl-page-title",
      descriptionClassName: "tl-page-sub",
    })}

    ${renderAuthorityNotice(authorityMeta)}

    <div class="grid-2 equal">
      <article class="tl-section-card">
        <div class="tl-section-header"><div class="tl-section-title">Configuración del trade</div></div>

        <div class="calc-advisory-block">
          ${advisoryMesh}
          <div class="calc-advisory-top">
            <div>
              <div class="calc-advisory-title">Riesgo recomendado</div>
              <div class="goal-card-sub">Lectura orientativa del motor de riesgo. No altera tu cálculo automáticamente.</div>
            </div>
            ${model.riskAdvice ? badgeMarkup({ label: model.riskAdvice.risk_state, tone: adviceTone }, "ui-badge--compact") : badgeMarkup({ label: "Sin lectura", tone: "neutral" }, "ui-badge--compact")}
          </div>
          ${model.riskAdvice ? `
            <div class="calc-advisory-grid">
              <div class="calc-advisory-metric">
                <span>Riesgo recomendado</span>
                <strong>${model.riskAdvice.recommendedRiskPct.toFixed(2)}%</strong>
              </div>
              <div class="calc-advisory-copy">${model.riskAdvice.explanation || "El motor no detecta presión extraordinaria en este momento."}</div>
            </div>
            <div class="calc-advisory-actions">
              <button class="btn-secondary btn-inline" type="button" data-calc-apply-risk>Aplicar sugerencia</button>
            </div>
          ` : `
            <div class="calc-advisory-copy">La calculadora sigue operativa aunque el motor de riesgo no esté disponible.</div>
          `}
        </div>

        <div class="calc-chip-group">
          ${INSTRUMENTS.map((item) => `<button class="calc-chip ${calc.instrument === item.id ? "active" : ""}" type="button" data-calc-instrument="${item.id}">${item.label}</button>`).join("")}
        </div>

        <div class="form-grid-clean calc-form-grid">
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

      <article class="tl-section-card calc-result-surface">
        <div class="tl-section-header"><div class="tl-section-title">Resultado principal</div></div>
        <div class="calc-main-lot">${model.roundedLots.toFixed(2)} lotes</div>
        <div class="goal-card-sub">Lotes calculados con riesgo real redondeado y exposición compatible con ${calc.broker}.</div>

        <div class="detail-metrics-grid">
          <div class="metric-item"><div class="metric-label">Riesgo $</div><div class="metric-value">${formatCurrency(model.realRiskUsd)}</div></div>
          <div class="metric-item"><div class="metric-label">Riesgo %</div><div class="metric-value">${model.realRiskPct.toFixed(2)}%</div></div>
          <div class="metric-item"><div class="metric-label">TP $</div><div class="metric-value">${formatCurrency(model.tpUsd)}</div></div>
          <div class="metric-item"><div class="metric-label">TP pips</div><div class="metric-value">${model.tpPips.toFixed(1)}</div></div>
          <div class="metric-item"><div class="metric-label">Pip value</div><div class="metric-value">${formatCurrency(model.pipValue)}</div></div>
          <div class="metric-item"><div class="metric-label">Unidades</div><div class="metric-value">${Math.round(model.units).toLocaleString("es-ES")}</div></div>
        </div>

        <div class="calc-exposure-block">
          <div class="score-bar-row">
            <span>Exposición</span>
            <div class="score-bar-track calc-exposure-track">
              <div class="score-bar-fill calc-exposure-fill calc-exposure-fill--${model.exposureTone}" style="width:${Math.min(model.realRiskPct * 50, 100)}%"></div>
            </div>
            <strong>${model.realRiskPct.toFixed(2)}%</strong>
          </div>
          <div class="goal-card-sub">Verde ≤ 1% · Amarillo ≤ 2% · Rojo &gt; 2%</div>
        </div>
      </article>
    </div>

    <article class="tl-section-card">
      <div class="tl-section-header"><div class="tl-section-title">Especificaciones del instrumento</div></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Instrumento</th><th>Tipo</th><th>Pip value</th><th>Multiplicador</th><th>Lote base</th><th>Broker</th></tr></thead>
          <tbody>
            <tr>
              <td>${calc.symbol}</td>
              <td>${model.spec.type}</td>
              <td>${formatCurrency(model.pipValue)}</td>
              <td>${model.spec.pipMultiplier}</td>
              <td>${model.spec.lotUnit.toLocaleString("es-ES")}</td>
              <td>${calc.broker}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="goal-card-sub" style="margin-top:12px;">${model.broker.note}</div>
    </article>
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
