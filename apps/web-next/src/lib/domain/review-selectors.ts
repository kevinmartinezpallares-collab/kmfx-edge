import type { ClosedTrade } from "@/lib/contracts/trade";
import type { WorkspaceState } from "@/lib/contracts/workspace-state";
import { formatSignedCurrency } from "@/lib/formatters/numbers";

export type ReviewReason =
  | "Pérdida relevante"
  | "Sin etiqueta"
  | "Salida rápida"
  | "Parcial / multi-exec";

export type ReviewPriorityRow = {
  trade: ClosedTrade;
  score: number;
  reasons: ReviewReason[];
};

export type ReviewReadiness = {
  status: "empty" | "clean" | "needs_review";
  totalTrades: number;
  queueCount: number;
  lossCount: number;
  missingTagCount: number;
  topReview: ReviewPriorityRow | null;
};

export type BriefingVerdictState = "green" | "yellow" | "red";

export type BriefingLearningItem = {
  id: string;
  reason: "weekly_loss" | "overtrade_day" | "unclassified_loss";
  trade: ClosedTrade;
  rank: number;
  text: string;
  tone: "loss" | "risk" | "neutral";
};

export type BriefingUnclassifiedRow = {
  id: string;
  closedAt: string;
  symbol: string;
};

export type BriefingWeekDay = {
  key: string;
  label: string;
  pnl: number;
  hasTrades: boolean;
};

export type BriefingOverview = {
  verdict: {
    action: string;
    state: BriefingVerdictState;
    title: string;
    reason: string;
  };
  latestDayKey: string | null;
  latestDayPnl: number;
  lossStreak: number;
  weeklyPnl: number;
  weeklyDrawdown: number;
  dailyRoomLeft: number | null;
  dailyDrawdownConsumedPct: number;
  dailyDrawdownFreePct: number;
  weekDays: BriefingWeekDay[];
  topLearnings: BriefingLearningItem[];
  unclassifiedRows: BriefingUnclassifiedRow[];
  unclassifiedCount: number;
};

const WEEK_DAY_LABELS = ["D", "L", "M", "X", "J", "V", "S"];

function parseTradingDayKey(value: string) {
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed)) return null;

  return new Date(parsed);
}

function tradingDayKeyFromDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function startOfWeekKey(tradingDayKey: string) {
  const date = parseTradingDayKey(tradingDayKey);
  if (!date) return tradingDayKey;

  const day = date.getUTCDay();
  const offset = day === 0 ? 6 : day - 1;
  date.setUTCDate(date.getUTCDate() - offset);

  return tradingDayKeyFromDate(date);
}

function buildWeekDays(latestDayKey: string | null, pnlByDay: Map<string, number>) {
  if (!latestDayKey) return [];

  const start = parseTradingDayKey(startOfWeekKey(latestDayKey));
  if (!start) return [];

  return Array.from({ length: 5 }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    const key = tradingDayKeyFromDate(date);
    const pnl = pnlByDay.get(key) ?? 0;

    return {
      key,
      label: WEEK_DAY_LABELS[date.getUTCDay()] ?? "",
      pnl,
      hasTrades: pnlByDay.has(key),
    };
  });
}

function calculateWeeklyDrawdown(weekPnl: number[]) {
  let equity = 0;
  let peak = 0;
  let maxDrawdown = 0;

  weekPnl.forEach((pnl) => {
    equity += pnl;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.max(maxDrawdown, peak - equity);
  });

  return maxDrawdown;
}

function calculateLossStreak(days: Array<{ pnl: number }>) {
  let streak = 0;

  for (let index = days.length - 1; index >= 0; index -= 1) {
    if (days[index].pnl >= 0) break;
    streak += 1;
  }

  return streak;
}

function averageLossAbs(trades: ClosedTrade[]) {
  const losses = trades
    .filter((trade) => trade.netPnl < 0)
    .map((trade) => Math.abs(trade.netPnl));

  return losses.length > 0
    ? losses.reduce((sum, loss) => sum + loss, 0) / losses.length
    : 0;
}

function isRelevantLoss(trade: ClosedTrade, averageLoss: number, lossCount: number) {
  return (
    trade.netPnl < 0 &&
    (lossCount <= 1 || averageLoss === 0 || Math.abs(trade.netPnl) >= averageLoss)
  );
}

function buildBriefingVerdict({
  accountBalance,
  allowNewTrades,
  dailyDrawdownFreePct,
  dailyDrawdownReached,
  hasRelevantLossInLastTwoDays,
  latestDayRelevantLoss,
  lossStreak,
  weeklyPnl,
}: {
  accountBalance: number;
  allowNewTrades: boolean;
  dailyDrawdownFreePct: number;
  dailyDrawdownReached: boolean;
  hasRelevantLossInLastTwoDays: boolean;
  latestDayRelevantLoss: ClosedTrade | null;
  lossStreak: number;
  weeklyPnl: number;
}) {
  const balanceBase = accountBalance > 0 ? accountBalance : 100000;
  const weeklyLossLimit = balanceBase * 0.03;

  if (!allowNewTrades) {
    return {
      action: "No abras posiciones. Recupera margen antes de volver al terminal.",
      state: "red" as const,
      title: "No operes hoy",
      reason: "La lectura de riesgo impide abrir nuevas posiciones hasta recuperar margen.",
    };
  }

  if (dailyDrawdownReached) {
    return {
      action: "No abras posiciones. El margen diario ya no permite otro error.",
      state: "red" as const,
      title: "No operes hoy",
      reason: "El DD diario quedó consumido en la última lectura: pausa la ejecución.",
    };
  }

  if (lossStreak >= 3) {
    return {
      action: "No abras posiciones. Revisa la racha antes de buscar una entrada nueva.",
      state: "red" as const,
      title: "No operes hoy",
      reason: `Racha de ${lossStreak} días negativos: corta ejecución y revisa el patrón antes de entrar.`,
    };
  }

  if (weeklyPnl < -weeklyLossLimit) {
    return {
      action: "No abras posiciones. Protege la cuenta y cierra la semana defensivamente.",
      state: "red" as const,
      title: "No operes hoy",
      reason: `La pérdida semanal supera el 3% del balance (${formatSignedCurrency(weeklyPnl)}).`,
    };
  }

  if (latestDayRelevantLoss) {
    return {
      action: "Reduce tamaño y espera confirmación. Si dudas, no entres.",
      state: "yellow" as const,
      title: "Opera con precaución hoy",
      reason: `Última sesión con pérdida relevante en ${latestDayRelevantLoss.symbol}: reduce tamaño o espera confirmación.`,
    };
  }

  if (lossStreak >= 2) {
    return {
      action: "Reduce tamaño y opera solo si el setup llega limpio.",
      state: "yellow" as const,
      title: "Opera con precaución hoy",
      reason: `Llevas ${lossStreak} días negativos: opera solo si el setup llega limpio.`,
    };
  }

  if (dailyDrawdownFreePct >= 40 && dailyDrawdownFreePct <= 70) {
    return {
      action: "Reduce exposición. No uses el margen diario como permiso para forzar entradas.",
      state: "yellow" as const,
      title: "Opera con precaución hoy",
      reason: `DD libre al ${Math.round(dailyDrawdownFreePct)}%: evita aumentar exposición.`,
    };
  }

  if (hasRelevantLossInLastTwoDays) {
    return {
      action: "Reduce tamaño y exige confirmación clara antes del primer trade.",
      state: "yellow" as const,
      title: "Opera con precaución hoy",
      reason: "Hubo una pérdida relevante en los últimos 2 días: opera solo con confirmación clara.",
    };
  }

  if (!hasRelevantLossInLastTwoDays && lossStreak === 0 && dailyDrawdownFreePct > 70) {
    return {
      action: "Puedes operar con tamaño normal si aparece tu setup definido.",
      state: "green" as const,
      title: "Puedes operar con normalidad",
      reason: "Sin pérdida relevante reciente y con margen diario amplio.",
    };
  }

  return {
    action: "Opera con tamaño reducido hasta que la lectura vuelva a ser limpia.",
    state: "yellow" as const,
    title: "Opera con precaución hoy",
    reason: "La lectura no bloquea, pero no cumple todas las condiciones para operar normal.",
  };
}

function learningText(
  reason: BriefingLearningItem["reason"],
  trade: ClosedTrade,
  dayTrades: ClosedTrade[],
) {
  const sameDayLosses = dayTrades.filter((candidate) => candidate.netPnl < 0);
  const relatedSymbols = sameDayLosses
    .filter((candidate) => candidate.id !== trade.id)
    .map((candidate) => candidate.symbol)
    .slice(0, 2);
  const duration =
    trade.durationMinutes === null
      ? "duración pendiente"
      : trade.durationMinutes < 60
        ? `${trade.durationMinutes} min`
        : `${Math.floor(trade.durationMinutes / 60)}h`;

  if (reason === "overtrade_day" && relatedSymbols.length > 0) {
    return `Pérdida del mismo día que ${relatedSymbols.join(" y ")}. Revisa si hubo correlación, sobreoperación o una segunda entrada para recuperar.`;
  }

  if (reason === "unclassified_loss") {
    return `Pérdida relevante sin setup asignado. Clasifica el patrón antes de repetir ${trade.symbol} en ${trade.session}.`;
  }

  return `${trade.setup ?? "Setup sin clasificar"} en ${trade.session}, ${duration}. Mayor pérdida de la semana: revisa si entrada, stop y contexto estaban alineados.`;
}

export function buildReviewPriorityRows(workspace: WorkspaceState): ReviewPriorityRow[] {
  const losses = workspace.trades
    .filter((trade) => trade.netPnl < 0)
    .map((trade) => Math.abs(trade.netPnl));
  const averageLoss = averageLossAbs(workspace.trades);

  return workspace.trades
    .reduce<ReviewPriorityRow[]>((rows, trade) => {
      const reasons: ReviewReason[] = [];
      let score = 0;
      if (isRelevantLoss(trade, averageLoss, losses.length)) {
        score += 3;
        reasons.push("Pérdida relevante");
      }
      if (!trade.setup) {
        score += 2;
        reasons.push("Sin etiqueta");
      }
      if ((trade.durationMinutes ?? 0) <= 10) {
        score += 1;
        reasons.push("Salida rápida");
      }
      if (trade.executions.length > 1) {
        score += 1;
        reasons.push("Parcial / multi-exec");
      }

      if (score > 0) {
        rows.push({
          trade,
          score,
          reasons,
        });
      }

      return rows;
    }, [])
    .toSorted((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.trade.closedAt.localeCompare(a.trade.closedAt);
    });
}

export function getReviewAction(reasons: ReviewReason[]) {
  if (reasons.includes("Pérdida relevante") && reasons.includes("Sin etiqueta")) {
    return "Documentar setup y causa de pérdida antes de volver a operar ese patrón.";
  }
  if (reasons.includes("Pérdida relevante")) {
    return "Revisar entrada, stop y contexto de sesión.";
  }
  if (reasons.includes("Sin etiqueta")) {
    return "Asignar setup para que Insights pueda atribuir resultado.";
  }
  if (reasons.includes("Parcial / multi-exec")) {
    return "Validar gestión de salida y parciales.";
  }
  return "Revisar solo si afecta al plan semanal.";
}

export function getReviewReadiness(workspace: WorkspaceState): ReviewReadiness {
  const queue = buildReviewPriorityRows(workspace);
  const lossCount = queue.filter((item) =>
    item.reasons.includes("Pérdida relevante"),
  ).length;
  const missingTagCount = queue.filter((item) => !item.trade.setup).length;

  return {
    status:
      workspace.trades.length === 0
        ? "empty"
        : queue.length > 0
          ? "needs_review"
          : "clean",
    totalTrades: workspace.trades.length,
    queueCount: queue.length,
    lossCount,
    missingTagCount,
    topReview: queue[0] ?? null,
  };
}

export function getBriefingOverview(workspace: WorkspaceState): BriefingOverview {
  const activeAccount =
    workspace.accounts.find((account) => account.id === workspace.activeAccountId) ??
    workspace.accounts[0] ??
    null;
  const sortedDays = workspace.analytics.daily.toSorted((a, b) =>
    a.tradingDayKey.localeCompare(b.tradingDayKey),
  );
  const latestDay = sortedDays.at(-1) ?? null;
  const latestDayKey = latestDay?.tradingDayKey ?? null;
  const weekStartKey = latestDayKey ? startOfWeekKey(latestDayKey) : null;
  const weekDaysRaw = weekStartKey
    ? sortedDays.filter(
        (day) => day.tradingDayKey >= weekStartKey && day.tradingDayKey <= (latestDayKey ?? ""),
      )
    : [];
  const pnlByDay = new Map(sortedDays.map((day) => [day.tradingDayKey, day.pnl]));
  const weekDays = buildWeekDays(latestDayKey, pnlByDay);
  const lossStreak = calculateLossStreak(sortedDays);
  const weeklyPnl = weekDaysRaw.reduce((sum, day) => sum + day.pnl, 0);
  const weeklyDrawdown = calculateWeeklyDrawdown(weekDaysRaw.map((day) => day.pnl));
  const dailyLimitPct = workspace.risk.dailyLimitPct > 0 ? workspace.risk.dailyLimitPct : 5;
  const dailyRoomLeftPct = activeAccount?.funding?.dailyRoomLeftPct ?? workspace.risk.dailyRoomLeftPct;
  const dailyDrawdownFreePct = Math.max(
    0,
    Math.min(100, (dailyRoomLeftPct / dailyLimitPct) * 100),
  );
  const dailyDrawdownConsumedPct = Math.max(0, Math.min(100, 100 - dailyDrawdownFreePct));
  const dailyRoomLeft = activeAccount
    ? activeAccount.equity * (dailyRoomLeftPct / 100)
    : null;
  const dayTradesByKey = new Map<string, ClosedTrade[]>();

  workspace.trades.forEach((trade) => {
    dayTradesByKey.set(trade.tradingDayKey, [
      ...(dayTradesByKey.get(trade.tradingDayKey) ?? []),
      trade,
    ]);
  });

  const averageLoss = averageLossAbs(workspace.trades);
  const lossCount = workspace.trades.filter((trade) => trade.netPnl < 0).length;
  const weeklyTrades = weekStartKey
    ? workspace.trades.filter(
        (trade) =>
          trade.tradingDayKey >= weekStartKey &&
          trade.tradingDayKey <= (latestDayKey ?? ""),
      )
    : workspace.trades;
  const latestTwoDayKeys = new Set(sortedDays.slice(-2).map((day) => day.tradingDayKey));
  const hasRelevantLossInLastTwoDays = workspace.trades.some(
    (trade) =>
      latestTwoDayKeys.has(trade.tradingDayKey) &&
      isRelevantLoss(trade, averageLoss, lossCount),
  );
  const latestDayRelevantLoss =
    latestDayKey
      ? workspace.trades
          .filter(
            (trade) =>
              trade.tradingDayKey === latestDayKey &&
              isRelevantLoss(trade, averageLoss, lossCount),
          )
          .toSorted((a, b) => a.netPnl - b.netPnl)[0] ?? null
      : null;
  const dailyLimitAmount = (activeAccount?.equity ?? activeAccount?.balance ?? 0) * (dailyLimitPct / 100);
  const dailyDrawdownReached =
    dailyDrawdownFreePct <= 0 ||
    (latestDay?.pnl ?? 0) <= -Math.abs(dailyLimitAmount);
  const selectedTradeIds = new Set<string>();
  const topLearnings: BriefingLearningItem[] = [];

  function pushLearning(reason: BriefingLearningItem["reason"], trade: ClosedTrade | null) {
    if (!trade || selectedTradeIds.has(trade.id) || topLearnings.length >= 3) return;

    selectedTradeIds.add(trade.id);
    topLearnings.push({
      id: `${reason}-${trade.id}`,
      reason,
      trade,
      rank: topLearnings.length + 1,
      text: learningText(reason, trade, dayTradesByKey.get(trade.tradingDayKey) ?? []),
      tone: reason === "unclassified_loss" ? "risk" : "loss",
    });
  }

  const biggestWeeklyLoss =
    weeklyTrades
      .filter((trade) => trade.netPnl < 0)
      .toSorted((a, b) => a.netPnl - b.netPnl)[0] ?? null;
  const pressureDay =
    weekDaysRaw
      .filter((day) => day.losses >= 2)
      .toSorted((a, b) => {
        if (b.losses !== a.losses) return b.losses - a.losses;
        return a.pnl - b.pnl;
      })[0] ?? null;
  const pressureDayTrade =
    pressureDay
      ? (dayTradesByKey.get(pressureDay.tradingDayKey) ?? [])
          .filter((trade) => trade.netPnl < 0 && !selectedTradeIds.has(trade.id))
          .toSorted((a, b) => a.netPnl - b.netPnl)[0] ?? null
      : null;
  const unclassifiedLoss =
    weeklyTrades
      .filter((trade) => !trade.setup && trade.netPnl < 0 && !selectedTradeIds.has(trade.id))
      .toSorted((a, b) => a.netPnl - b.netPnl)[0] ?? null;

  pushLearning("weekly_loss", biggestWeeklyLoss);
  pushLearning("overtrade_day", pressureDayTrade);
  pushLearning("unclassified_loss", unclassifiedLoss);

  const unclassifiedTrades = workspace.trades
    .filter((trade) => !trade.setup)
    .toSorted((a, b) => b.closedAt.localeCompare(a.closedAt));

  return {
    verdict: buildBriefingVerdict({
      accountBalance: activeAccount?.balance ?? activeAccount?.equity ?? 0,
      allowNewTrades: activeAccount?.funding?.allowNewTrades ?? workspace.risk.allowNewTrades,
      dailyDrawdownFreePct,
      dailyDrawdownReached,
      hasRelevantLossInLastTwoDays,
      latestDayRelevantLoss,
      lossStreak,
      weeklyPnl,
    }),
    latestDayKey,
    latestDayPnl: latestDay?.pnl ?? 0,
    lossStreak,
    weeklyPnl,
    weeklyDrawdown,
    dailyRoomLeft,
    dailyDrawdownConsumedPct,
    dailyDrawdownFreePct,
    weekDays,
    topLearnings,
    unclassifiedRows: unclassifiedTrades.slice(0, 6).map((trade) => ({
      id: trade.id,
      closedAt: trade.closedAt,
      symbol: trade.symbol,
    })),
    unclassifiedCount: unclassifiedTrades.length,
  };
}
