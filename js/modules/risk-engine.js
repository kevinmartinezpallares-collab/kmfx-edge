// Pure risk computation module.
// It only derives risk values from inputs/model snapshots and returns plain objects.
// It must not render UI, attach listeners, mutate navigation, or own application flow.
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function recentWinRate(model, sample = 10) {
  const recent = [...(model?.trades || [])].slice(-sample);
  if (!recent.length) return Number(model?.totals?.winRate || 0);
  const wins = recent.filter((trade) => (trade.pnl || 0) > 0).length;
  return (wins / recent.length) * 100;
}

function currentDailyDrawdownPct(model, account) {
  const balance = Number(account?.balance || model?.account?.balance || 0);
  const todayLossUsd = Math.abs(Math.min(0, Number(model?.riskSummary?.dailyLossUsd || 0)));
  return balance > 0 ? (todayLossUsd / balance) * 100 : 0;
}

function buildExplanation(parts) {
  return parts.filter(Boolean).join(" ");
}

export function computeRiskState({
  drawdownPct = 0,
  dailyDrawdownPct = 0,
  consecutiveLosses = 0,
  recentWinRate = 0,
  riskPerTradePct = 0,
  maxDrawdownLimitPct = 10,
  dailyDrawdownLimitPct = 1.2,
  autoBlockEnabled = true
} = {}) {
  let riskState = "NORMAL";
  const notes = [];
  let blocked = false;
  let blockReason = "";

  if (autoBlockEnabled && drawdownPct >= maxDrawdownLimitPct) {
    riskState = "LOCKED";
    blocked = true;
    blockReason = "Trading blocked";
    notes.push(`Drawdown total ${drawdownPct.toFixed(1)}% supera el límite ${maxDrawdownLimitPct.toFixed(1)}%.`);
    return {
      risk_state: riskState,
      explanation: buildExplanation(notes),
      blocked,
      block_reason: blockReason
    };
  }

  if (autoBlockEnabled && dailyDrawdownPct >= dailyDrawdownLimitPct) {
    riskState = "LOCKED";
    blocked = true;
    blockReason = "Trading blocked";
    notes.push(`Drawdown diario ${dailyDrawdownPct.toFixed(1)}% supera el límite ${dailyDrawdownLimitPct.toFixed(1)}%.`);
    return {
      risk_state: riskState,
      explanation: buildExplanation(notes),
      blocked,
      block_reason: blockReason
    };
  }

  if (drawdownPct > 9) {
    riskState = "LOCKED";
    notes.push(`Drawdown total ${drawdownPct.toFixed(1)}% supera 9%.`);
  } else if (drawdownPct >= 6) {
    riskState = "DANGER";
    notes.push(`Drawdown total ${drawdownPct.toFixed(1)}% entra en zona crítica.`);
  } else if (drawdownPct >= 3) {
    riskState = "CAUTION";
    notes.push(`Drawdown total ${drawdownPct.toFixed(1)}% requiere vigilancia.`);
  } else {
    notes.push(`Drawdown total controlado en ${drawdownPct.toFixed(1)}%.`);
  }

  if (dailyDrawdownPct >= 3 && riskState !== "LOCKED") {
    riskState = "DANGER";
    notes.push(`El drawdown diario ${dailyDrawdownPct.toFixed(1)}% añade presión inmediata.`);
  } else if (dailyDrawdownPct >= 1.5 && riskState === "NORMAL") {
    riskState = "CAUTION";
    notes.push(`El drawdown diario ${dailyDrawdownPct.toFixed(1)}% sugiere moderar la exposición.`);
  }

  if (consecutiveLosses > 5) {
    if (riskState === "NORMAL") riskState = "CAUTION";
    else if (riskState === "CAUTION") riskState = "DANGER";
    else if (riskState === "DANGER") riskState = "LOCKED";
    notes.push(`Racha de ${consecutiveLosses} pérdidas consecutivas activa escalado de riesgo.`);
  } else if (consecutiveLosses >= 4 && riskState === "NORMAL") {
    riskState = "CAUTION";
    notes.push(`Racha de ${consecutiveLosses} pérdidas consecutivas en vigilancia.`);
  }

  if (recentWinRate < 35 && riskState !== "LOCKED") {
    riskState = riskState === "NORMAL" ? "CAUTION" : "DANGER";
    notes.push(`Win rate reciente en ${Math.round(recentWinRate)}% deteriora la estabilidad.`);
  } else if (recentWinRate < 45 && riskState === "NORMAL") {
    riskState = "CAUTION";
    notes.push(`Win rate reciente en ${Math.round(recentWinRate)}% pide filtro operativo.`);
  }

  if (riskPerTradePct >= 2 && riskState !== "LOCKED") {
    riskState = riskState === "NORMAL" ? "CAUTION" : "DANGER";
    notes.push(`Riesgo por trade alto (${riskPerTradePct.toFixed(2)}%) reduce margen de maniobra.`);
  } else if (riskPerTradePct >= 1.25 && riskState === "NORMAL") {
    riskState = "CAUTION";
    notes.push(`Riesgo por trade ${riskPerTradePct.toFixed(2)}% cerca de zona sensible.`);
  }

  return {
    risk_state: riskState,
    explanation: buildExplanation(notes),
    blocked,
    block_reason: blockReason
  };
}

export function computeRiskStateFromModel(model, account = {}) {
  const drawdownPct = Number(model?.totals?.drawdown?.maxPct || 0);
  const dailyDrawdown = currentDailyDrawdownPct(model, account);
  const consecutiveLosses = clamp(Number(model?.streaks?.bestLoss || 0), 0, 99);
  const recentWr = recentWinRate(model, 10);
  const riskPerTradePct = Number(model?.riskProfile?.currentRiskPct || model?.riskProfile?.maxTradeRiskPct || 0);
  const maxDrawdownLimitPct = Number(account?.maxDrawdownLimit || model?.account?.maxDrawdownLimit || 10);
  const dailyDrawdownLimitPct = Number(model?.riskProfile?.dailyLossLimitPct || 1.2);
  const autoBlockEnabled = Boolean(model?.riskProfile?.autoBlock ?? true);

  return computeRiskState({
    drawdownPct,
    dailyDrawdownPct: dailyDrawdown,
    consecutiveLosses,
    recentWinRate: recentWr,
    riskPerTradePct,
    maxDrawdownLimitPct,
    dailyDrawdownLimitPct,
    autoBlockEnabled
  });
}

export function recommendedRiskPctForState(riskState) {
  switch (riskState) {
    case "LOCKED":
      return 0;
    case "DANGER":
      return 0.5;
    case "CAUTION":
      return 0.75;
    default:
      return 1;
  }
}

export function computeRecommendedRiskFromModel(model, account = {}) {
  const risk = computeRiskStateFromModel(model, account);
  return {
    ...risk,
    recommendedRiskPct: recommendedRiskPctForState(risk.risk_state)
  };
}
