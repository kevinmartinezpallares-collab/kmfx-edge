export const DASHBOARD_PROFESSIONAL_KPI_VERSION = "dashboard_professional_kpis_v1";

export const DASHBOARD_PROFESSIONAL_KPI_ORDER = Object.freeze([
  "net_return",
  "max_drawdown",
  "var_95",
  "var_99",
  "exposure",
  "vol_ann",
  "sortino",
  "dscore",
]);

export const DASHBOARD_PROFESSIONAL_KPI_REFRESH = Object.freeze({
  realtime: { intervalMs: 5000, label: "1-10s" },
  hourly: { intervalMs: 60 * 60 * 1000, label: "1h" },
  intraday: { intervalMs: 6 * 60 * 60 * 1000, label: "6h/12h/EOD" },
  eod: { intervalMs: 24 * 60 * 60 * 1000, label: "EOD" },
});

const KPI_DEFINITIONS = Object.freeze({
  net_return: {
    label: "Net Return",
    unit: "percent",
    period: "7d",
    visual: "sparkline",
    refresh: "realtime",
    category: "Rendimiento",
    tooltip: "Rendimiento neto sobre capital, tras costes y comisiones.",
    traderUse: "Te dice si tu edge esta creciendo despues de costes. Sirve para decidir si mantener el ritmo, reducir riesgo o revisar el sistema.",
    formula: "P&L neto acumulado / capital de referencia.",
    sourceLabel: "Snapshot MT5 normalizado: balance, equity, P&L y operaciones cerradas.",
    confidence: "Alta cuando el ultimo sync MT5 esta al dia y el historial cerrado esta completo.",
  },
  max_drawdown: {
    label: "Max Drawdown",
    unit: "percent",
    period: "30d",
    visual: "area",
    refresh: "intraday",
    category: "Riesgo",
    tooltip: "Mayor caida pico-a-valle del periodo.",
    traderUse: "Mide el dolor maximo de la curva. Sirve para ajustar tamano y saber si la cuenta soporta tu metodo.",
    formula: "max((pico de equity - valle posterior) / pico de equity).",
    sourceLabel: "Curva de equity y drawdown normalizada desde MT5.",
    confidence: "Mejora con historial continuo; las cuentas recien conectadas pueden infravalorarlo.",
  },
  var_95: {
    label: "VaR 95",
    unit: "currency",
    period: "1 trade",
    visual: "gauge",
    refresh: "hourly",
    category: "Riesgo",
    tooltip: "Perdida maxima esperada al 95% de confianza.",
    traderUse: "Estima una perdida extrema razonable por trade o muestra. Sirve para no poner la cuenta en peligro cuando la muestra empeora.",
    formula: "Percentil 95 de perdidas cerradas normalizadas; CVaR = media de la cola.",
    sourceLabel: "Módulo de riesgo KMFX: pérdidas cerradas y cola estadística.",
    confidence: "Depende de la calidad de muestra; robusto desde una muestra amplia de trades cerrados.",
  },
  var_99: {
    label: "VaR 99",
    unit: "currency",
    period: "1 trade",
    visual: "gauge",
    refresh: "hourly",
    category: "Riesgo",
    tooltip: "Perdida maxima esperada al 99% de confianza.",
    traderUse: "Mira el escenario de cola mas duro. Sirve para calibrar limites antes de aumentar lotaje o entrar en fondeo.",
    formula: "Percentil 99 de perdidas cerradas normalizadas; CVaR = media de la cola extrema.",
    sourceLabel: "Módulo de riesgo KMFX: pérdidas cerradas y cola extrema.",
    confidence: "Mas sensible a muestra pequena; robusto con historico amplio y limpio.",
  },
  exposure: {
    label: "Exposure",
    unit: "percent",
    period: "live",
    visual: "stacked_bar",
    refresh: "realtime",
    category: "Seguimiento",
    tooltip: "Exposicion neta y bruta sobre capital.",
    traderUse: "Muestra cuanto capital esta comprometido ahora. Sirve para evitar concentracion, correlacion excesiva y sobreoperar.",
    formula: "Riesgo abierto bruto y neto / capital; el neto respeta direccion long/short.",
    sourceLabel: "Posiciones abiertas y resumen de riesgo recibido desde MT5/Risk Engine.",
    confidence: "Alta si las posiciones tienen SL o riesgo calculable; sin SL puede quedar incompleta.",
  },
  vol_ann: {
    label: "Volatilidad anualizada",
    unit: "percent",
    period: "30d",
    visual: "sparkline",
    refresh: "eod",
    category: "Riesgo",
    tooltip: "Desviacion estandar anualizada de retornos diarios.",
    traderUse: "Mide lo nerviosa que esta la cuenta. Sirve para bajar agresividad cuando la curva se vuelve inestable.",
    formula: "Desviacion estandar de retornos diarios x raiz(252).",
    sourceLabel: "Retornos diarios normalizados por dia contable.",
    confidence: "Necesita suficientes dias con actividad; con poca muestra es orientativa.",
  },
  sortino: {
    label: "Sortino",
    unit: "ratio",
    period: "rolling",
    visual: "pill",
    refresh: "eod",
    category: "Rendimiento ajustado",
    tooltip: "Retorno excedente dividido por desviacion negativa.",
    traderUse: "Compara retorno frente a caidas negativas. Sirve para priorizar sistemas que ganan sin castigar tanto la cuenta.",
    formula: "Retorno medio / desviacion negativa de los retornos.",
    sourceLabel: "Métricas de riesgo KMFX o cálculo local cuando la muestra todavía es limitada.",
    confidence: "Mas fiable cuando hay suficientes retornos negativos y muestra amplia.",
  },
  dscore: {
    label: "Edge Score",
    unit: "score",
    period: "hourly",
    visual: "badge",
    refresh: "hourly",
    category: "Seguimiento",
    tooltip: "Score propio de calidad y consistencia operativa.",
    traderUse: "Resume calidad operativa. Sirve para detectar cuando bajar al detalle de disciplina, riesgo o ejecucion.",
    formula: "Score compuesto KMFX de consistencia, riesgo, ejecucion y calidad de muestra.",
    sourceLabel: "Modelo de calidad KMFX calculado con rendimiento, riesgo y ejecución.",
    confidence: "Complementa la revision manual; no sustituye el criterio del trader.",
  },
});

export function selectDashboardMetricStudyCards() {
  return DASHBOARD_PROFESSIONAL_KPI_ORDER.map((id) => {
    const definition = KPI_DEFINITIONS[id];
    return {
      id,
      label: definition.label,
      summary: definition.tooltip,
      formula: definition.formula,
      source: definition.sourceLabel,
      confidence: definition.confidence,
      category: definition.category,
      traderUse: definition.traderUse,
      unit: definition.unit,
      period: definition.period,
      visual: definition.visual,
      refresh: {
        key: definition.refresh,
        ...DASHBOARD_PROFESSIONAL_KPI_REFRESH[definition.refresh],
      },
    };
  });
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function finiteNumber(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function round(value, digits = 2) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const factor = 10 ** digits;
  return Math.round(parsed * factor) / factor;
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values) {
  if (!values.length) return 0;
  const mean = average(values);
  return Math.sqrt(average(values.map((value) => (value - mean) ** 2)));
}

function readPath(source, path, fallback = null) {
  let current = source;
  for (const key of path) {
    if (!current || typeof current !== "object") return fallback;
    current = current[key];
  }
  return current ?? fallback;
}

function statusToken(status, label = "") {
  const normalized = ["good", "warn", "bad", "neutral", "insufficient"].includes(status)
    ? status
    : "neutral";
  return {
    status: normalized,
    statusLabel: label || (normalized === "insufficient" ? "insuficiente historico" : normalized),
  };
}

function deltaToken(deltaPct) {
  const value = finiteNumber(deltaPct);
  if (value === null) {
    return { value: null, direction: "flat", label: "-" };
  }
  const direction = value > 0 ? "up" : value < 0 ? "down" : "flat";
  const prefix = value > 0 ? "+" : "";
  return {
    value: round(value, 2),
    direction,
    label: `${prefix}${round(value, 2)}%`,
  };
}

function valueState(value, emptyReason = "insuficiente historico") {
  const parsed = finiteNumber(value);
  if (parsed === null) {
    return {
      value: null,
      display: "-",
      emptyReason,
      ...statusToken("insufficient", emptyReason),
    };
  }
  return {
    value: parsed,
    display: null,
    emptyReason: "",
  };
}

function compactText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function sampleConfidence(sampleSize, sampleQualityLabel, fallback = "") {
  const size = finiteNumber(sampleSize);
  const label = compactText(sampleQualityLabel);
  if (label && size !== null) return `${label} (${size} trades)`;
  if (label) return label;
  if (size !== null && size < 30) return `Muestra insuficiente (${size} trades).`;
  if (size !== null) return `Muestra calculada con ${size} trades.`;
  return fallback;
}

function buildKpiExplain(id, definition, overrides = {}) {
  const explain = safeObject(overrides.explain);
  return {
    summary: compactText(explain.summary || overrides.tooltip || definition.tooltip),
    formula: compactText(explain.formula || overrides.formula || definition.formula),
    source: compactText(explain.source || overrides.sourceLabel || definition.sourceLabel || overrides.source),
    confidence: compactText(explain.confidence || overrides.confidence || definition.confidence),
  };
}

function kpiExplainTooltip(explain) {
  return [
    explain.summary,
    explain.formula ? `Formula: ${explain.formula}` : "",
    explain.source ? `Fuente: ${explain.source}` : "",
    explain.confidence ? `Confianza: ${explain.confidence}` : "",
  ].filter(Boolean).join(" ");
}

function buildKpi(id, overrides = {}) {
  const definition = KPI_DEFINITIONS[id];
  const value = valueState(overrides.value, overrides.emptyReason);
  const status = overrides.status ? statusToken(overrides.status, overrides.statusLabel) : {
    status: value.status || "neutral",
    statusLabel: value.statusLabel || "neutral",
  };
  const explain = buildKpiExplain(id, definition, overrides);

  return {
    id,
    kpi: id,
    label: definition.label,
    value: value.value,
    display: overrides.display || value.display,
    unit: definition.unit,
    period: overrides.period || definition.period,
    status: status.status,
    statusLabel: status.statusLabel,
    delta: deltaToken(overrides.deltaPct),
    refresh: {
      key: definition.refresh,
      ...DASHBOARD_PROFESSIONAL_KPI_REFRESH[definition.refresh],
    },
    microVisual: {
      type: definition.visual,
      series: safeArray(overrides.series),
      ...safeObject(overrides.microVisual),
    },
    tooltip: overrides.tooltip || kpiExplainTooltip(explain),
    explain,
    source: overrides.source || "derived",
    emptyReason: value.emptyReason,
    meta: safeObject(overrides.meta),
  };
}

function dailyPnlSeries(model, limit = 7) {
  return safeArray(model.dayStats).slice(-limit).map((day) => ({
    label: day.label || day.key || "",
    value: round(day.pnl || 0, 2),
  }));
}

function dailyReturnValues(model, limit = 30) {
  const returns = safeArray(model.dailyReturns);
  if (returns.length) {
    return returns.slice(-limit)
      .map((day) => finiteNumber(day.returnPct))
      .filter((value) => value !== null);
  }
  const account = safeObject(model.account);
  const balance = finiteNumber(account.balance, account.equity, 0) || 0;
  if (!balance) return [];
  return safeArray(model.dayStats).slice(-limit)
    .map((day) => (Number(day.pnl || 0) / balance) * 100)
    .filter((value) => Number.isFinite(value));
}

function riskSnapshotFromAccount(account) {
  return safeObject(account.riskSnapshot || account.dashboardPayload?.riskSnapshot);
}

function professionalMetricsFrom(riskSnapshot) {
  return safeObject(riskSnapshot.professional_metrics);
}

function equityCapital(model, account, professional) {
  const inputs = safeObject(professional.inputs);
  return finiteNumber(
    inputs.equity,
    inputs.capital_amount,
    model.account?.equity,
    model.account?.balance,
    account.equity,
    account.balance,
  );
}

function statusFromPercent(value, warnAt, badAt, sampleSize = 30, sampleQualityLabel = "") {
  const qualityLabel = String(sampleQualityLabel || "").trim();
  if (sampleSize < 30) return statusToken("insufficient", qualityLabel || "insuficiente historico");
  if (value === null) return statusToken("insufficient", qualityLabel || "insuficiente historico");
  if (value >= badAt) return statusToken("bad", "riesgo alto");
  if (value >= warnAt) return statusToken("warn", "vigilancia");
  return statusToken("good", "controlado");
}

function positionExposure(model, riskSummary) {
  const positions = safeArray(model.positions);
  let grossPct = 0;
  let netPct = 0;

  positions.forEach((position) => {
    const riskPct = finiteNumber(position.risk_pct, position.riskPct);
    if (riskPct === null) return;
    const side = String(position.side || position.type || position.direction || "").toLowerCase();
    const sign = side.includes("sell") || side.includes("short") ? -1 : 1;
    grossPct += Math.abs(riskPct);
    netPct += riskPct * sign;
  });

  const fallback = finiteNumber(riskSummary.total_open_risk_pct, riskSummary.totalOpenRiskPct, 0) || 0;
  return {
    grossPct: round(grossPct || fallback, 2),
    netPct: round(netPct || fallback, 2),
  };
}

function buildVarKpi(id, confidence, model, account, professional) {
  const tailRisk = safeObject(professional.tail_risk);
  const varMetrics = safeObject(tailRisk[`var_${confidence}`]);
  const capital = equityCapital(model, account, professional);
  const varAmount = finiteNumber(varMetrics.var_amount);
  const cvarAmount = finiteNumber(varMetrics.cvar_amount);
  const equityPct = finiteNumber(
    varMetrics.equity_pct,
    varAmount !== null && capital ? (varAmount / capital) * 100 : null,
  );
  const sampleSize = finiteNumber(varMetrics.sample_size, professional.inputs?.closed_trades_count, model.trades?.length, 0) || 0;
  const sampleQualityLabel = String(varMetrics.sample_quality_label || "").trim();
  const sampleQualityLevel = String(varMetrics.sample_quality_level || "").trim();
  const status = statusFromPercent(equityPct, 1, 2.5, sampleSize, sampleQualityLabel);
  const sourceLabel = varAmount === null
    ? "Pendiente de calculo: falta historico cerrado suficiente."
    : confidence === 99
      ? "Módulo de riesgo KMFX: pérdidas cerradas y cola extrema."
      : "Módulo de riesgo KMFX: pérdidas cerradas y cola estadística.";

  return buildKpi(id, {
    value: varAmount,
    status: status.status,
    statusLabel: status.statusLabel,
    source: varAmount === null ? "missing" : "professional_metrics.tail_risk",
    sourceLabel,
    explain: {
      source: sourceLabel,
      confidence: sampleConfidence(
        sampleSize,
        sampleQualityLabel,
        "Depende de la calidad de muestra; robusto desde una muestra amplia de trades cerrados.",
      ),
    },
    emptyReason: "insuficiente historico",
    microVisual: {
      confidence,
      pointerValuePct: round(equityPct, 2),
      bands: [
        { label: "good", from: 0, to: 1 },
        { label: "warn", from: 1, to: 2.5 },
        { label: "bad", from: 2.5, to: 100 },
      ],
    },
    meta: {
      confidence,
      cvarAmount: round(cvarAmount, 2),
      equityPct: round(equityPct, 2),
      sampleSize,
      sampleQualityLevel,
      sampleQualityLabel,
    },
  });
}

export function selectDashboardProfessionalKpis(input = {}) {
  const account = safeObject(input.account);
  const model = safeObject(input.model || account.model);
  const riskSnapshot = safeObject(input.riskSnapshot || riskSnapshotFromAccount(account));
  const professional = professionalMetricsFrom(riskSnapshot);
  const riskSummary = safeObject(riskSnapshot.summary || model.riskSummary);
  const capital = equityCapital(model, account, professional);
  const dailySeries = dailyPnlSeries(model, 7);
  const sevenDayPnl = dailySeries.reduce((sum, point) => sum + Number(point.value || 0), 0);
  const delta7dPct = capital ? (sevenDayPnl / capital) * 100 : null;
  const netReturn = finiteNumber(model.cumulative?.totalPct, capital ? (Number(model.totals?.pnl || 0) / capital) * 100 : null);

  const drawdownSeries = safeArray(model.drawdownCurve).slice(-30).map((point) => ({
    label: point.label || "",
    value: round(point.value || 0, 2),
  }));
  const maxDrawdown = finiteNumber(
    professional.drawdown_path?.max_drawdown_pct,
    model.totals?.drawdown?.maxPct,
    riskSummary.peak_to_equity_drawdown_pct,
    riskSummary.peakToEquityDrawdownPct,
  );
  const maxDrawdownFromSeries = drawdownSeries.reduce((best, point, index) => (
    Number(point.value || 0) > Number(best.value || 0) ? { ...point, index } : best
  ), { label: "", value: 0, index: -1 });
  const drawdownStatus = statusFromPercent(maxDrawdown, 4, 8, safeArray(model.trades).length || 30);

  const exposure = positionExposure(model, riskSummary);
  const exposureValue = finiteNumber(riskSummary.total_open_risk_pct, riskSummary.totalOpenRiskPct, exposure.grossPct);
  const heatLimit = finiteNumber(riskSummary.portfolio_heat_limit_pct, riskSummary.portfolioHeatLimitPct, 3);
  const exposureStatus = exposureValue === null
    ? statusToken("insufficient", "sin exposicion")
    : exposureValue >= heatLimit
      ? statusToken("bad", "limite alcanzado")
      : exposureValue >= heatLimit * 0.7
        ? statusToken("warn", "vigilancia")
        : statusToken("good", "controlado");

  const dailyReturns = dailyReturnValues(model, 30);
  const volatility = dailyReturns.length >= 5
    ? standardDeviation(dailyReturns.map((value) => value / 100)) * Math.sqrt(252) * 100
    : null;
  const volatilityStatus = volatility === null
    ? statusToken("insufficient", "insuficiente historico")
    : volatility >= 40
      ? statusToken("bad", "volatilidad alta")
      : volatility >= 25
        ? statusToken("warn", "volatilidad media")
        : statusToken("good", "estable");

  const sortino = finiteNumber(professional.risk_adjusted?.sortino_ratio, model.totals?.ratios?.sortino);
  const sortinoStatus = sortino === null
    ? statusToken("insufficient", "insuficiente historico")
    : sortino < 0
      ? statusToken("bad", "retorno negativo")
      : sortino < 1
        ? statusToken("warn", "mejorable")
        : statusToken("good", "eficiente");

  const dscore = finiteNumber(
    professional.edge_score,
    professional.edgeScore,
    professional.dscore,
    professional.d_score,
    professional.quality_score,
    account.dashboardPayload?.dscore,
    account.dashboardPayload?.d_score,
    account.dashboardPayload?.edge_score,
    account.dashboardPayload?.edgeScore,
  );
  const dscoreStatus = dscore === null
    ? statusToken("insufficient", "score pendiente")
    : dscore >= 70
      ? statusToken("good", "alta calidad")
      : dscore >= 50
        ? statusToken("warn", "en desarrollo")
        : statusToken("bad", "debil");

  const kpis = [
    buildKpi("net_return", {
      value: round(netReturn, 2),
      deltaPct: delta7dPct,
      status: netReturn === null ? "insufficient" : netReturn >= 0 ? "good" : "bad",
      statusLabel: netReturn === null ? "insuficiente historico" : netReturn >= 0 ? "positivo" : "negativo",
      source: model.cumulative ? "model.cumulative" : "derived",
      sourceLabel: model.cumulative ? "Modelo de rendimiento normalizado del dashboard." : "P&L neto recibido desde MT5.",
      series: dailySeries,
      microVisual: { stroke: "semantic", deltaEncoding: ["arrow", "color", "text"] },
      meta: { pnl7d: round(sevenDayPnl, 2), capital: round(capital, 2) },
    }),
    buildKpi("max_drawdown", {
      value: round(maxDrawdown, 2),
      status: drawdownStatus.status,
      statusLabel: drawdownStatus.statusLabel,
      source: professional.drawdown_path ? "professional_metrics.drawdown_path" : "model.drawdown",
      sourceLabel: professional.drawdown_path ? "Métricas de riesgo KMFX: curva de drawdown." : "Curva de drawdown calculada en el dashboard.",
      explain: {
        confidence: sampleConfidence(safeArray(model.trades).length, "", "Mejora con historico continuo y trades cerrados suficientes."),
      },
      series: drawdownSeries,
      microVisual: { highlight: maxDrawdownFromSeries },
      meta: { sampleSize: safeArray(model.trades).length },
    }),
    buildVarKpi("var_95", 95, model, account, professional),
    buildVarKpi("var_99", 99, model, account, professional),
    buildKpi("exposure", {
      value: round(exposureValue, 2),
      status: exposureStatus.status,
      statusLabel: exposureStatus.statusLabel,
      source: "riskSnapshot.summary",
      sourceLabel: "Posiciones abiertas, riesgo bruto/neto y límite de exposición.",
      explain: {
        confidence: exposureValue === null
          ? "Pendiente hasta recibir posiciones o resumen de riesgo desde MT5."
          : "Alta si el EA envia posiciones completas y riesgo calculable por posicion.",
      },
      microVisual: {
        grossPct: exposure.grossPct,
        netPct: exposure.netPct,
        limitPct: round(heatLimit, 2),
      },
      meta: { grossPct: exposure.grossPct, netPct: exposure.netPct, limitPct: round(heatLimit, 2) },
    }),
    buildKpi("vol_ann", {
      value: round(volatility, 2),
      status: volatilityStatus.status,
      statusLabel: volatilityStatus.statusLabel,
      source: "model.dailyReturns",
      explain: {
        confidence: dailyReturns.length >= 20
          ? `Muestra operativa: ${dailyReturns.length} dias de retornos.`
          : `Orientativa: solo ${dailyReturns.length} dias de retornos.`,
      },
      series: dailyReturns.map((value, index) => ({ label: String(index + 1), value: round(Math.abs(value), 4) })),
      meta: { sampleSize: dailyReturns.length },
    }),
    buildKpi("sortino", {
      value: round(sortino, 2),
      status: sortinoStatus.status,
      statusLabel: sortinoStatus.statusLabel,
      source: professional.risk_adjusted ? "professional_metrics.risk_adjusted" : "model.ratios",
      sourceLabel: professional.risk_adjusted ? "Métricas de riesgo KMFX: retorno ajustado." : "Ratios calculados en el dashboard.",
      explain: {
        confidence: sampleConfidence(
          finiteNumber(professional.risk_adjusted?.sample_size, dailyReturns.length, 0),
          "",
          "Mas fiable cuando hay suficientes retornos negativos y muestra amplia.",
        ),
      },
      microVisual: { direction: sortino !== null && sortino >= 1 ? "up" : sortino !== null && sortino < 0 ? "down" : "flat" },
      meta: { sampleSize: finiteNumber(professional.risk_adjusted?.sample_size, dailyReturns.length, 0) },
    }),
    buildKpi("dscore", {
      value: round(dscore, 2),
      status: dscoreStatus.status,
      statusLabel: dscoreStatus.statusLabel,
      source: dscore === null ? "missing_quality_score" : "kmfx_quality_score",
      sourceLabel: dscore === null ? "Pendiente de score de calidad." : "Score de calidad KMFX calculado con la muestra disponible.",
      explain: {
        confidence: dscore === null
          ? "Pendiente hasta que exista muestra suficiente y score calculado."
          : "Complementa la revision manual; revisa tambien drawdown, VaR y ejecucion.",
      },
      emptyReason: "score pendiente",
      microVisual: {
        bands: [
          { label: "bad", from: 0, to: 50 },
          { label: "warn", from: 50, to: 70 },
          { label: "good", from: 70, to: 100 },
        ],
      },
    }),
  ];

  return {
    version: DASHBOARD_PROFESSIONAL_KPI_VERSION,
    order: [...DASHBOARD_PROFESSIONAL_KPI_ORDER],
    kpis,
    refresh: DASHBOARD_PROFESSIONAL_KPI_REFRESH,
    generatedFrom: {
      hasModel: Boolean(input.model || account.model),
      hasRiskSnapshot: Object.keys(riskSnapshot).length > 0,
      hasProfessionalMetrics: Object.keys(professional).length > 0,
    },
  };
}

export function selectDashboardProfessionalKpisFromState(state = {}) {
  const accounts = safeObject(state.accounts);
  const accountId = state.activeAccountId || state.activeLiveAccountId || state.currentAccount || Object.keys(accounts)[0];
  const account = safeObject(accounts[accountId]);
  return selectDashboardProfessionalKpis({ account, model: account.model, riskSnapshot: riskSnapshotFromAccount(account) });
}
