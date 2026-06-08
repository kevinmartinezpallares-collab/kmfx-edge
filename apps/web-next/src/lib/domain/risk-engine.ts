import type { WorkspaceState } from "@/lib/contracts/workspace-state";
import {
  evaluateFundingRuleForAccount,
  type FundingRuleEvaluationStatus,
} from "@/lib/domain/funding-rule-catalog";

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

export type RiskGuardBetaMonitorStatus =
  | "permitted"
  | "warning"
  | "critical"
  | "limit_reached"
  | "requires_review"
  | "insufficient"
  | "no_account";

export type RiskGuardBetaMonitorTone =
  | "safe"
  | "warning"
  | "danger"
  | "muted";

export type RiskGuardBetaMonitorMetric = {
  id: string;
  label: string;
  value: string;
  detail: string;
  tone: RiskGuardBetaMonitorTone;
};

export type RiskGuardBetaMonitorRule = {
  id: string;
  label: string;
  value: string;
  status: string;
  detail: string;
  tone: RiskGuardBetaMonitorTone;
};

export type RiskGuardBetaMonitorEvent = {
  id: string;
  label: string;
  value: string;
  detail: string;
  tone: RiskGuardBetaMonitorTone;
};

export type RiskGuardBetaMonitor = {
  account: {
    id: string;
    label: string;
    broker: string;
    server: string;
    baseCurrency: string;
    balance: number;
    equity: number;
    openPositionsCount: number;
  } | null;
  status: {
    key: RiskGuardBetaMonitorStatus;
    label: string;
    action: string;
    tone: RiskGuardBetaMonitorTone;
  };
  monitor: {
    active: true;
    mt5BlockingActive: false;
    orderActionsActive: false;
    message: string;
  };
  dailyLossUsedPct: number;
  dailyLimitPct: number;
  dailyLimitSourceLabel: string;
  dailyUsagePct: number;
  dailyPnl: number;
  tradesToday: number;
  lossStreak: number | null;
  openRiskPct: number | null;
  openRiskLabel: string;
  openRiskDetail: string;
  lastReadLabel: string;
  fundingRule: {
    status: "verified" | "requires_review" | "not_funded";
    evaluationStatus: FundingRuleEvaluationStatus;
    firmName: string | null;
    programName: string | null;
    sourceLabel: string | null;
    verifiedAt: string | null;
    reviewReason: string | null;
    allowNewTradesRecommendation: boolean;
    alerts: Array<{
      tone: "danger" | "warning" | "info";
      label: string;
      reason: string;
    }>;
  };
  hasSufficientData: boolean;
  metrics: RiskGuardBetaMonitorMetric[];
  rules: RiskGuardBetaMonitorRule[];
  recentEvents: RiskGuardBetaMonitorEvent[];
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

function formatMonitorPercent(value: number, digits = 1) {
  return `${value.toFixed(digits)}%`;
}

function formatMonitorMoney(
  value: number,
  currency = "USD",
  minimumFractionDigits = 0,
) {
  return Intl.NumberFormat("es-ES", {
    currency,
    maximumFractionDigits: minimumFractionDigits,
    minimumFractionDigits,
    style: "currency",
  }).format(value);
}

function formatSignedMonitorMoney(
  value: number,
  currency = "USD",
  minimumFractionDigits = 0,
) {
  const formatted = formatMonitorMoney(Math.abs(value), currency, minimumFractionDigits);
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `-${formatted}`;
  return formatted;
}

function riskGuardTone(status: RiskGuardBetaMonitorStatus): RiskGuardBetaMonitorTone {
  if (status === "limit_reached" || status === "critical") return "danger";
  if (status === "warning" || status === "requires_review") return "warning";
  if (status === "permitted") return "safe";
  return "muted";
}

function riskGuardLabel(status: RiskGuardBetaMonitorStatus) {
  switch (status) {
    case "limit_reached":
      return "Límite alcanzado";
    case "critical":
      return "Límite cercano";
    case "warning":
      return "Cerca del límite";
    case "requires_review":
      return "Reglas por revisar";
    case "permitted":
      return "Operativa permitida";
    case "no_account":
      return "Sin cuenta activa";
    default:
      return "Sin datos suficientes";
  }
}

function riskGuardAction(status: RiskGuardBetaMonitorStatus) {
  switch (status) {
    case "limit_reached":
      return "Revisa el diario y decide fuera de esta pantalla antes de seguir.";
    case "critical":
      return "Reduce exposición y confirma si el plan diario sigue vigente.";
    case "warning":
      return "Vigila el margen diario antes de añadir una nueva posición.";
    case "requires_review":
      return "Confirma firma, examen y fase antes de tratar estos límites como política.";
    case "permitted":
      return "El margen diario mantiene espacio operativo.";
    case "no_account":
      return "Selecciona o conecta una cuenta para leer el monitor.";
    default:
      return "Historial insuficiente para calcular todos los límites.";
  }
}

function latestDailyBucket(workspace: WorkspaceState) {
  return [...workspace.analytics.daily].toSorted((a, b) =>
    a.tradingDayKey.localeCompare(b.tradingDayKey),
  ).at(-1) ?? null;
}

function latestTrades(workspace: WorkspaceState, limit = 5) {
  return [...workspace.trades]
    .toSorted((a, b) => b.closedAt.localeCompare(a.closedAt))
    .slice(0, limit);
}

function countCurrentLossStreak(workspace: WorkspaceState) {
  const closedTrades = [...workspace.trades].toSorted((a, b) =>
    b.closedAt.localeCompare(a.closedAt),
  );

  if (!closedTrades.length) return null;

  let streak = 0;
  for (const trade of closedTrades) {
    if (toFiniteNumber(trade.netPnl) < 0) {
      streak += 1;
      continue;
    }
    break;
  }

  return streak;
}

function statusFromDailyUsage({
  hasAccount,
  hasSufficientData,
  riskStatus,
  riskSeverity,
  usagePct,
}: {
  hasAccount: boolean;
  hasSufficientData: boolean;
  riskStatus: WorkspaceState["risk"]["status"];
  riskSeverity: WorkspaceState["risk"]["severity"];
  usagePct: number;
}): RiskGuardBetaMonitorStatus {
  if (!hasAccount) return "no_account";
  if (!hasSufficientData) return "insufficient";
  if (usagePct >= 100 || riskStatus === "blocked") return "limit_reached";
  if (usagePct >= 90 || riskSeverity === "danger") return "critical";
  if (usagePct >= 70 || riskStatus === "caution") return "warning";
  return "permitted";
}

export function buildRiskGuardBetaMonitor(
  workspace: WorkspaceState,
): RiskGuardBetaMonitor {
  const activeAccount =
    workspace.accounts.find((account) => account.id === workspace.activeAccountId) ??
    workspace.accounts[0] ??
    null;
  const fundingRuleEvaluation = activeAccount
    ? evaluateFundingRuleForAccount(activeAccount)
    : null;
  const fundingRuleResolution = fundingRuleEvaluation?.resolution ?? null;
  const verifiedFundingRule =
    fundingRuleResolution?.status === "verified" ? fundingRuleResolution.ruleSet : null;
  const dailyBucket = latestDailyBucket(workspace);
  const balance = toFiniteNumber(activeAccount?.balance);
  const dailyPnl = toFiniteNumber(dailyBucket?.pnl);
  const dailyDrawdownFromSnapshot = Math.max(0, toFiniteNumber(workspace.risk.dailyDrawdownPct));
  const dailyDrawdownFromPnl =
    balance > 0 && dailyPnl < 0 ? (Math.abs(dailyPnl) / balance) * 100 : 0;
  const dailyLossUsedPct = dailyDrawdownFromSnapshot || dailyDrawdownFromPnl;
  const configuredDailyLimitPct = toFiniteNumber(workspace.risk.dailyLimitPct);
  const fundingDailyLimitPct = toFiniteNumber(verifiedFundingRule?.dailyLossLimitPct);
  const dailyLimitPct =
    fundingDailyLimitPct > 0
      ? fundingDailyLimitPct
      : (configuredDailyLimitPct > 0 ? configuredDailyLimitPct : 3);
  const dailyLimitSourceLabel = verifiedFundingRule
    ? "Política común verificada"
    : (fundingRuleResolution?.status === "requires_review"
      ? "Pendiente de verificación de fondeo"
      : (configuredDailyLimitPct > 0 ? "Lectura MT5" : "Pendiente de configuración"));
  const dailyUsagePct =
    dailyLimitPct > 0 ? clamp((dailyLossUsedPct / dailyLimitPct) * 100, 0, 999) : 0;
  const hasAccount = Boolean(activeAccount);
  const hasSufficientData = Boolean(activeAccount && balance > 0 && dailyBucket);
  let statusKey = statusFromDailyUsage({
    hasAccount,
    hasSufficientData,
    riskSeverity: workspace.risk.severity,
    riskStatus: workspace.risk.status,
    usagePct: dailyUsagePct,
  });
  if (hasSufficientData && fundingRuleEvaluation?.status === "blocked") {
    statusKey = "limit_reached";
  } else if (
    hasSufficientData &&
    fundingRuleEvaluation?.status === "requires_review" &&
    statusKey === "permitted"
  ) {
    statusKey = "requires_review";
  } else if (
    hasSufficientData &&
    fundingRuleEvaluation?.status === "warning" &&
    statusKey === "permitted"
  ) {
    statusKey = "warning";
  }
  const statusTone = riskGuardTone(statusKey);
  const openRiskPct = toFiniteNumber(workspace.risk.totalOpenRiskPct);
  const openRiskAvailable = openRiskPct > 0 || (activeAccount?.openPositionsCount ?? 0) === 0;
  const openRiskLabel = !activeAccount
    ? "Sin cuenta activa"
    : (activeAccount.openPositionsCount === 0
      ? "Sin posiciones abiertas"
      : (openRiskAvailable
        ? formatMonitorPercent(openRiskPct)
        : "Riesgo abierto no disponible"));
  const openRiskDetail = !activeAccount
    ? "Selecciona una cuenta para revisar exposición."
    : (activeAccount.openPositionsCount === 0
      ? "Lectura MT5 sin posiciones abiertas."
      : (openRiskAvailable
        ? `${activeAccount.openPositionsCount} posiciones abiertas.`
        : "Pendiente de lectura desde MT5."));
  const lossStreak = countCurrentLossStreak(workspace);
  const currency = activeAccount?.baseCurrency ?? "USD";
  const tradesToday = toFiniteNumber(dailyBucket?.trades);
  const pnlTone: RiskGuardBetaMonitorTone =
    dailyPnl < 0 ? "danger" : (dailyPnl > 0 ? "safe" : "muted");

  const metrics: RiskGuardBetaMonitorMetric[] = [
    {
      id: "daily-loss",
      detail: `${formatMonitorPercent(dailyUsagePct, 0)} del límite diario.`,
      label: "Pérdida diaria usada",
      tone: statusTone,
      value: formatMonitorPercent(dailyLossUsedPct),
    },
    {
      id: "daily-limit",
      detail: dailyLimitSourceLabel,
      label: "Límite diario",
      tone: verifiedFundingRule || configuredDailyLimitPct > 0 ? "safe" : "muted",
      value: formatMonitorPercent(dailyLimitPct),
    },
    {
      id: "daily-pnl",
      detail: dailyBucket?.label ?? "Historial insuficiente",
      label: "Resultado diario",
      tone: pnlTone,
      value: formatSignedMonitorMoney(dailyPnl, currency),
    },
    {
      id: "trades-today",
      detail: dailyBucket ? "Cerradas en la jornada leída." : "Historial insuficiente",
      label: "Operaciones del día",
      tone: tradesToday > 0 ? "safe" : "muted",
      value: String(tradesToday),
    },
    {
      id: "loss-streak",
      detail: lossStreak === null ? "Historial insuficiente" : "Racha actual leída.",
      label: "Racha de pérdidas",
      tone: (lossStreak ?? 0) >= 3 ? "warning" : "muted",
      value: lossStreak === null ? "Pendiente" : String(lossStreak),
    },
    {
      id: "open-risk",
      detail: openRiskDetail,
      label: "Riesgo abierto",
      tone: openRiskAvailable ? "safe" : "muted",
      value: openRiskLabel,
    },
  ];

  const fundingAlertRules: RiskGuardBetaMonitorRule[] =
    fundingRuleEvaluation?.alerts.slice(0, 3).map((alert, index) => ({
      detail: alert.reason,
      id: `funding-rule-alert-${index + 1}`,
      label: alert.label,
      status: alert.tone === "danger" ? "Bloqueo lógico" : (alert.tone === "warning" ? "Aviso" : "Monitor"),
      tone: alert.tone === "danger" ? "danger" : (alert.tone === "warning" ? "warning" : "muted"),
      value: "Regla común",
    })) ?? [];

  const rules: RiskGuardBetaMonitorRule[] = [
    {
      id: "funding-rule",
      detail: verifiedFundingRule
        ? `Límite compatible con reglas comunes, verificado ${verifiedFundingRule.verifiedAt}.`
        : (fundingRuleResolution?.status === "requires_review"
          ? fundingRuleResolution.reason
          : "Cuenta sin perfil de fondeo."),
      label: "Regla común",
      status:
        fundingRuleEvaluation?.status === "blocked"
          ? "Bloqueo lógico"
          : (verifiedFundingRule ? "Verificada" : "Revisar"),
      tone:
        fundingRuleEvaluation?.status === "blocked"
          ? "danger"
          : (fundingRuleEvaluation?.status === "requires_review"
            ? "warning"
            : (verifiedFundingRule ? "safe" : "muted")),
      value: verifiedFundingRule ? "Activa" : "No aplica",
    },
    ...fundingAlertRules,
    {
      id: "daily-limit",
      detail: dailyLimitSourceLabel,
      label: "Límite diario",
      status: "Monitor",
      tone: verifiedFundingRule || configuredDailyLimitPct > 0 ? "safe" : "muted",
      value: formatMonitorPercent(dailyLimitPct),
    },
    {
      id: "warning-threshold",
      detail: "Aviso visual antes de zona crítica.",
      label: "Aviso preventivo",
      status: dailyUsagePct >= 70 ? "Aviso" : "Monitor",
      tone: dailyUsagePct >= 70 ? "warning" : "safe",
      value: "70%",
    },
    {
      id: "critical-threshold",
      detail: "Revisión estricta antes de seguir.",
      label: "Zona crítica",
      status: dailyUsagePct >= 90 ? "Crítico" : "Monitor",
      tone: dailyUsagePct >= 90 ? "danger" : "safe",
      value: "90%",
    },
    {
      id: "theoretical-limit",
      detail: "Configuración de bloqueo pendiente de activar en EA.",
      label: "Bloqueo teórico",
      status: dailyUsagePct >= 100 ? "Teórico" : "Pendiente",
      tone: dailyUsagePct >= 100 ? "danger" : "muted",
      value: "100%",
    },
    {
      id: "operations-day",
      detail: dailyBucket ? "Lectura desde operaciones cerradas." : "Historial insuficiente",
      label: "Máximo de operaciones",
      status: "Monitor",
      tone: "muted",
      value: tradesToday > 0 ? String(tradesToday) : "Pendiente",
    },
    {
      id: "open-risk",
      detail: openRiskDetail,
      label: "Riesgo abierto",
      status: openRiskAvailable ? "Monitor" : "Pendiente",
      tone: openRiskAvailable ? "safe" : "muted",
      value: openRiskLabel,
    },
    {
      id: "mt5-blocking",
      detail: "No se envían órdenes ni se bloquean operaciones desde esta pantalla.",
      label: "Bloqueo MT5",
      status: "No activado",
      tone: "muted",
      value: "Lectura",
    },
  ];

  const latestDayKey = dailyBucket?.tradingDayKey;
  const latestDayTrades = latestDayKey
    ? workspace.trades.filter((trade) => trade.tradingDayKey === latestDayKey)
    : [];
  const eventTrades = (latestDayTrades.length ? latestDayTrades : latestTrades(workspace))
    .toSorted((a, b) => b.closedAt.localeCompare(a.closedAt))
    .slice(0, 5);
  const recentEvents = eventTrades.map((trade): RiskGuardBetaMonitorEvent => {
    const tradeTone: RiskGuardBetaMonitorTone =
      trade.netPnl < 0 ? "danger" : (trade.netPnl > 0 ? "safe" : "muted");

    return {
      detail: trade.tradingDayKey,
      id: trade.id,
      label: `${trade.symbol} ${trade.side.toUpperCase()}`,
      tone: tradeTone,
      value: formatSignedMonitorMoney(trade.netPnl, currency),
    };
  });

  return {
    account: activeAccount
      ? {
          balance: activeAccount.balance,
          baseCurrency: activeAccount.baseCurrency,
          broker: activeAccount.broker,
          equity: activeAccount.equity,
          id: activeAccount.id,
          label: activeAccount.label,
          openPositionsCount: activeAccount.openPositionsCount,
          server: activeAccount.server,
        }
      : null,
    dailyLimitPct,
    dailyLimitSourceLabel,
    dailyLossUsedPct,
    dailyPnl,
    dailyUsagePct,
    fundingRule: verifiedFundingRule
      ? {
          alerts: fundingRuleEvaluation?.alerts.map((alert) => ({
            label: alert.label,
            reason: alert.reason,
            tone: alert.tone,
          })) ?? [],
          allowNewTradesRecommendation:
            fundingRuleEvaluation?.allowNewTradesRecommendation ?? true,
          evaluationStatus: fundingRuleEvaluation?.status ?? "clear",
          firmName: verifiedFundingRule.firmName,
          programName: verifiedFundingRule.programName,
          reviewReason: null,
          sourceLabel: verifiedFundingRule.sourceLabel,
          status: "verified",
          verifiedAt: verifiedFundingRule.verifiedAt,
        }
      : {
          alerts: fundingRuleEvaluation?.alerts.map((alert) => ({
            label: alert.label,
            reason: alert.reason,
            tone: alert.tone,
          })) ?? [],
          allowNewTradesRecommendation:
            fundingRuleEvaluation?.allowNewTradesRecommendation ?? true,
          evaluationStatus: fundingRuleEvaluation?.status ?? "not_funded",
          firmName:
            fundingRuleResolution?.status === "requires_review"
              ? fundingRuleResolution.firmName
              : null,
          programName: null,
          reviewReason:
            fundingRuleResolution?.status === "requires_review"
              ? fundingRuleResolution.reason
              : null,
          sourceLabel: null,
          status: fundingRuleResolution?.status ?? "not_funded",
          verifiedAt: null,
        },
    hasSufficientData,
    lastReadLabel: activeAccount?.lastSyncLabel ?? "Pendiente de lectura",
    lossStreak,
    metrics,
    monitor: {
      active: true,
      message: "No se envían órdenes ni se bloquean operaciones desde esta pantalla.",
      mt5BlockingActive: false,
      orderActionsActive: false,
    },
    openRiskDetail,
    openRiskLabel,
    openRiskPct: openRiskAvailable ? openRiskPct : null,
    recentEvents,
    rules,
    status: {
      action: riskGuardAction(statusKey),
      key: statusKey,
      label: riskGuardLabel(statusKey),
      tone: statusTone,
    },
    tradesToday,
  };
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
