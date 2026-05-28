export type ComputedRiskState = "NORMAL" | "CAUTION" | "DANGER" | "LOCKED";

export type RiskEngineInput = {
  drawdownPct?: number;
  dailyDrawdownPct?: number;
  consecutiveLosses?: number;
  recentWinRate?: number;
  riskPerTradePct?: number;
  maxDrawdownLimitPct?: number;
  dailyDrawdownLimitPct?: number;
  autoBlockEnabled?: boolean;
};

export type RiskEngineResult = {
  risk_state: ComputedRiskState;
  explanation: string;
  blocked: boolean;
  block_reason: string;
};

type LegacyRiskModel = {
  account?: {
    balance?: number;
    maxDrawdownLimit?: number;
  };
  riskProfile?: {
    autoBlock?: boolean;
    currentRiskPct?: number;
    dailyLossLimitPct?: number;
    maxTradeRiskPct?: number;
  };
  riskSummary?: {
    dailyLossUsd?: number;
  };
  streaks?: {
    bestLoss?: number;
  };
  totals?: {
    drawdown?: {
      maxPct?: number;
    };
    winRate?: number;
  };
  trades?: Array<{
    pnl?: number;
  }>;
};

type LegacyAccountInput = {
  balance?: number;
  maxDrawdownLimit?: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function toFiniteNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function recentWinRate(model: LegacyRiskModel, sample = 10) {
  const recent = [...(model.trades || [])].slice(-sample);
  if (!recent.length) return toFiniteNumber(model.totals?.winRate);
  const wins = recent.filter((trade) => toFiniteNumber(trade.pnl) > 0).length;
  return (wins / recent.length) * 100;
}

function currentDailyDrawdownPct(
  model: LegacyRiskModel,
  account: LegacyAccountInput,
) {
  const balance = toFiniteNumber(account.balance, toFiniteNumber(model.account?.balance));
  const todayLossUsd = Math.abs(Math.min(0, toFiniteNumber(model.riskSummary?.dailyLossUsd)));
  return balance > 0 ? (todayLossUsd / balance) * 100 : 0;
}

function buildExplanation(parts: string[]) {
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
  autoBlockEnabled = true,
}: RiskEngineInput = {}): RiskEngineResult {
  let riskState: ComputedRiskState = "NORMAL";
  const notes: string[] = [];
  const blocked = false;
  const blockReason = "";

  if (autoBlockEnabled && drawdownPct >= maxDrawdownLimitPct) {
    notes.push(
      `Drawdown total ${drawdownPct.toFixed(1)}% supera el limite ${maxDrawdownLimitPct.toFixed(1)}%.`,
    );
    return {
      risk_state: "LOCKED",
      explanation: buildExplanation(notes),
      blocked: true,
      block_reason: "Trading blocked",
    };
  }

  if (autoBlockEnabled && dailyDrawdownPct >= dailyDrawdownLimitPct) {
    notes.push(
      `Drawdown diario ${dailyDrawdownPct.toFixed(1)}% supera el limite ${dailyDrawdownLimitPct.toFixed(1)}%.`,
    );
    return {
      risk_state: "LOCKED",
      explanation: buildExplanation(notes),
      blocked: true,
      block_reason: "Trading blocked",
    };
  }

  if (drawdownPct > 9) {
    riskState = "LOCKED";
    notes.push(`Drawdown total ${drawdownPct.toFixed(1)}% supera 9%.`);
  } else if (drawdownPct >= 6) {
    riskState = "DANGER";
    notes.push(`Drawdown total ${drawdownPct.toFixed(1)}% entra en zona critica.`);
  } else if (drawdownPct >= 3) {
    riskState = "CAUTION";
    notes.push(`Drawdown total ${drawdownPct.toFixed(1)}% requiere vigilancia.`);
  } else {
    notes.push(`Drawdown total controlado en ${drawdownPct.toFixed(1)}%.`);
  }

  if (dailyDrawdownPct >= 3 && riskState !== "LOCKED") {
    riskState = "DANGER";
    notes.push(
      `El drawdown diario ${dailyDrawdownPct.toFixed(1)}% añade presion inmediata.`,
    );
  } else if (dailyDrawdownPct >= 1.5 && riskState === "NORMAL") {
    riskState = "CAUTION";
    notes.push(
      `El drawdown diario ${dailyDrawdownPct.toFixed(1)}% sugiere moderar la exposicion.`,
    );
  }

  if (consecutiveLosses > 5) {
    if (riskState === "NORMAL") riskState = "CAUTION";
    else if (riskState === "CAUTION") riskState = "DANGER";
    else if (riskState === "DANGER") riskState = "LOCKED";
    notes.push(
      `Racha de ${consecutiveLosses} perdidas consecutivas activa escalado de riesgo.`,
    );
  } else if (consecutiveLosses >= 4 && riskState === "NORMAL") {
    riskState = "CAUTION";
    notes.push(`Racha de ${consecutiveLosses} perdidas consecutivas en vigilancia.`);
  }

  if (recentWinRate < 35 && riskState !== "LOCKED") {
    riskState = riskState === "NORMAL" ? "CAUTION" : "DANGER";
    notes.push(
      `Win rate reciente en ${Math.round(recentWinRate)}% deteriora la estabilidad.`,
    );
  } else if (recentWinRate < 45 && riskState === "NORMAL") {
    riskState = "CAUTION";
    notes.push(
      `Win rate reciente en ${Math.round(recentWinRate)}% pide filtro operativo.`,
    );
  }

  if (riskPerTradePct >= 2 && riskState !== "LOCKED") {
    riskState = riskState === "NORMAL" ? "CAUTION" : "DANGER";
    notes.push(
      `Riesgo por operacion alto (${riskPerTradePct.toFixed(2)}%) reduce margen de maniobra.`,
    );
  } else if (riskPerTradePct >= 1.25 && riskState === "NORMAL") {
    riskState = "CAUTION";
    notes.push(
      `Riesgo por operacion ${riskPerTradePct.toFixed(2)}% cerca de zona sensible.`,
    );
  }

  return {
    risk_state: riskState,
    explanation: buildExplanation(notes),
    blocked,
    block_reason: blockReason,
  };
}

export function computeRiskStateFromModel(
  model: LegacyRiskModel,
  account: LegacyAccountInput = {},
) {
  return computeRiskState({
    drawdownPct: toFiniteNumber(model.totals?.drawdown?.maxPct),
    dailyDrawdownPct: currentDailyDrawdownPct(model, account),
    consecutiveLosses: clamp(toFiniteNumber(model.streaks?.bestLoss), 0, 99),
    recentWinRate: recentWinRate(model, 10),
    riskPerTradePct: toFiniteNumber(
      model.riskProfile?.currentRiskPct,
      toFiniteNumber(model.riskProfile?.maxTradeRiskPct),
    ),
    maxDrawdownLimitPct: toFiniteNumber(
      account.maxDrawdownLimit,
      toFiniteNumber(model.account?.maxDrawdownLimit, 10),
    ),
    dailyDrawdownLimitPct: toFiniteNumber(model.riskProfile?.dailyLossLimitPct, 1.2),
    autoBlockEnabled: Boolean(model.riskProfile?.autoBlock ?? true),
  });
}

export function recommendedRiskPctForState(riskState: ComputedRiskState) {
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

export function computeRecommendedRiskFromModel(
  model: LegacyRiskModel,
  account: LegacyAccountInput = {},
) {
  const risk = computeRiskStateFromModel(model, account);
  return {
    ...risk,
    recommendedRiskPct: recommendedRiskPctForState(risk.risk_state),
  };
}
