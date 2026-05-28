import type { WorkspaceState } from "@/lib/contracts/workspace-state";
import type { DailyTradeBucket, HourlyTradeBucket, TradeSession } from "@/lib/contracts/trade";
import { buildReviewPriorityRows } from "@/lib/domain/review-selectors";
import { buildStrategyRows } from "@/lib/domain/strategies-selectors";

export type AnalyticsReadinessStatus = "empty" | "partial" | "ready";

export type AnalyticsReadiness = {
  status: AnalyticsReadinessStatus;
  totalTrades: number;
  taggedTrades: number;
  tagCoveragePct: number;
  dailyBucketCount: number;
  hourlyBucketCount: number;
  sampleLabel: "Sin operaciones" | "Pocas operaciones" | "En progreso" | "Datos fiables";
  blockers: string[];
};

export type AnalyticsDailyOverview = {
  days: DailyTradeBucket[];
  activeDayCount: number;
  bestDay: DailyTradeBucket | null;
  worstDay: DailyTradeBucket | null;
  averageTradesPerActiveDay: number;
};

export type AnalyticsHourlyOverview = {
  hours: HourlyTradeBucket[];
  activeHourCount: number;
  bestHour: HourlyTradeBucket | null;
  dominantSession: TradeSession | "Pend.";
  sessionCounts: Record<string, number>;
};

export type AnalyticsAttributionBucket = {
  label: string;
  trades: number;
  pnl: number;
};

export type AnalyticsInsightAttribution = {
  bestSetup: ReturnType<typeof buildStrategyRows>[number] | null;
  worstSetup: ReturnType<typeof buildStrategyRows>[number] | null;
  bestDay: DailyTradeBucket | null;
  worstDay: DailyTradeBucket | null;
  topSymbol: AnalyticsAttributionBucket | null;
  topSession: AnalyticsAttributionBucket | null;
  sessionRows: AnalyticsAttributionBucket[];
  tagCoverage: number;
  reviewQueue: ReturnType<typeof buildReviewPriorityRows>;
  cumulativeCurve: Array<{ label: string; pnl: number }>;
  sampleState: "Pocas operaciones" | "En progreso" | "Datos fiables";
  outlierDependency: number | null;
  setupRows: ReturnType<typeof buildStrategyRows>;
};

export type AnalyticsActionFindingTone =
  | "positive"
  | "negative"
  | "warning"
  | "neutral";

export type AnalyticsActionFinding = {
  label: "Potenciar" | "Revisar" | "Limitar";
  title: string;
  body: string;
  href: string;
  tone: AnalyticsActionFindingTone;
};

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

export function getAnalyticsReadiness(workspace: WorkspaceState): AnalyticsReadiness {
  const totalTrades = workspace.analytics.performance.totalTrades || workspace.trades.length;
  const taggedTrades = workspace.trades.filter((trade) => Boolean(trade.setup)).length;
  const tagCoveragePct =
    totalTrades > 0 ? clampPercent((taggedTrades / totalTrades) * 100) : 0;
  const dailyBucketCount = workspace.analytics.daily.length;
  const hourlyBucketCount = workspace.analytics.hourly.length;
  const blockers = [
    totalTrades === 0 ? "no_trades" : null,
    workspace.analytics.summary.length === 0 ? "missing_summary" : null,
    totalTrades > 0 && dailyBucketCount === 0 ? "missing_daily_buckets" : null,
    totalTrades > 0 && hourlyBucketCount === 0 ? "missing_hourly_buckets" : null,
  ].filter((item): item is string => Boolean(item));
  const sampleLabel =
    totalTrades === 0
      ? "Sin operaciones"
      : totalTrades >= 50 && tagCoveragePct >= 80
        ? "Datos fiables"
        : totalTrades >= 20
          ? "En progreso"
          : "Pocas operaciones";

  return {
    status:
      totalTrades === 0
        ? "empty"
        : blockers.length > 0
          ? "partial"
          : "ready",
    totalTrades,
    taggedTrades,
    tagCoveragePct,
    dailyBucketCount,
    hourlyBucketCount,
    sampleLabel,
    blockers,
  };
}

export function getAnalyticsDailyOverview(
  workspace: WorkspaceState,
): AnalyticsDailyOverview {
  const days = workspace.analytics.daily;
  const bestDay =
    days.length > 0 ? [...days].sort((a, b) => b.pnl - a.pnl)[0] : null;
  const worstDay =
    days.length > 0 ? [...days].sort((a, b) => a.pnl - b.pnl)[0] : null;
  const averageTradesPerActiveDay =
    days.length > 0 ? days.reduce((sum, item) => sum + item.trades, 0) / days.length : 0;

  return {
    days,
    activeDayCount: days.length,
    bestDay,
    worstDay,
    averageTradesPerActiveDay,
  };
}

export function getAnalyticsHourlyOverview(
  workspace: WorkspaceState,
): AnalyticsHourlyOverview {
  const hours = workspace.analytics.hourly;
  const bestHour =
    hours.length > 0 ? [...hours].sort((a, b) => b.pnl - a.pnl)[0] : null;
  const sessionCounts = workspace.trades.reduce<Record<string, number>>((acc, trade) => {
    acc[trade.session] = (acc[trade.session] ?? 0) + 1;
    return acc;
  }, {});
  const dominantSession =
    (Object.entries(sessionCounts).sort((a, b) => b[1] - a[1])[0]?.[0] as
      | TradeSession
      | undefined) ?? "Pend.";

  return {
    hours,
    activeHourCount: hours.length,
    bestHour,
    dominantSession,
    sessionCounts,
  };
}

export function buildInsightAttribution(
  workspace: WorkspaceState,
): AnalyticsInsightAttribution {
  const trades = workspace.trades;
  const performance = workspace.analytics.performance;
  const setupRows = buildStrategyRows(workspace).sort((a, b) => b.netPnl - a.netPnl);
  const positiveSetups = setupRows.filter((row) => row.netPnl > 0);
  const negativeSetups = setupRows.filter((row) => row.netPnl < 0);
  const bestSetup = positiveSetups[0] ?? setupRows[0] ?? null;
  const worstSetup = negativeSetups.sort((a, b) => a.netPnl - b.netPnl)[0] ?? null;
  const taggedTrades = trades.filter((trade) => Boolean(trade.setup)).length;
  const tagCoverage = trades.length > 0 ? (taggedTrades / trades.length) * 100 : 0;
  const reviewQueue = buildReviewPriorityRows(workspace);
  const dailyOverview = getAnalyticsDailyOverview(workspace);
  const topSymbol =
    Object.values(
      trades.reduce<Record<string, AnalyticsAttributionBucket>>((acc, trade) => {
        const current = acc[trade.symbol] ?? { label: trade.symbol, trades: 0, pnl: 0 };
        current.trades += 1;
        current.pnl += trade.netPnl;
        acc[trade.symbol] = current;
        return acc;
      }, {}),
    ).sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl))[0] ?? null;
  const sessionRows = Object.values(
    trades.reduce<Record<string, AnalyticsAttributionBucket>>((acc, trade) => {
      const current = acc[trade.session] ?? { label: trade.session, trades: 0, pnl: 0 };
      current.trades += 1;
      current.pnl += trade.netPnl;
      acc[trade.session] = current;
      return acc;
    }, {}),
  ).sort((a, b) => b.pnl - a.pnl);
  const topSession =
    [...sessionRows].sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl))[0] ?? null;
  const cumulativeCurve = [...workspace.analytics.daily]
    .sort((a, b) => a.tradingDayKey.localeCompare(b.tradingDayKey))
    .reduce<Array<{ label: string; pnl: number }>>((acc, day) => {
      const previous = acc.at(-1)?.pnl ?? 0;
      acc.push({ label: day.label, pnl: previous + day.pnl });
      return acc;
    }, []);
  const sampleState =
    performance.totalTrades >= 50 && tagCoverage >= 80
      ? "Datos fiables"
      : performance.totalTrades >= 20
        ? "En progreso"
        : "Pocas operaciones";
  const outlierDependency =
    performance.netProfit > 0 && performance.bestTrade !== null
      ? Math.min(100, Math.abs(performance.bestTrade / performance.netProfit) * 100)
      : null;

  return {
    bestSetup,
    worstSetup,
    bestDay: dailyOverview.bestDay,
    worstDay: dailyOverview.worstDay,
    topSymbol,
    topSession,
    sessionRows,
    tagCoverage,
    reviewQueue,
    cumulativeCurve,
    sampleState,
    outlierDependency,
    setupRows,
  };
}

function signedCurrency(value: number) {
  const amount = Math.abs(value).toLocaleString("es-ES", {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  });

  if (value > 0) return `+${amount} US$`;
  if (value < 0) return `-${amount} US$`;
  return "0 US$";
}

export function buildInsightActionFindings(
  workspace: WorkspaceState,
): AnalyticsActionFinding[] {
  const insights = buildInsightAttribution(workspace);
  const readiness = getAnalyticsReadiness(workspace);
  const worstDay = insights.worstDay;
  const outlierDependency = insights.outlierDependency;
  const bestSession = insights.sessionRows.find((session) => session.pnl > 0) ?? null;
  const worstSession =
    [...insights.sessionRows].filter((session) => session.pnl < 0).sort((a, b) => a.pnl - b.pnl)[0] ??
    null;

  const maintain: AnalyticsActionFinding = bestSession
    ? {
        label: "Potenciar",
        title: bestSession.label,
        body: `${signedCurrency(bestSession.pnl)} / ${bestSession.trades} operaciones. Sesión con mejor lectura visible.`,
        href: "/analytics/hourly",
        tone: "positive",
      }
    : {
        label: "Potenciar",
        title: "Sin sesión fuerte clara",
        body: `${readiness.sampleLabel}. Primero acumular operaciones por sesión.`,
        href: "/trades",
        tone: "warning",
      };

  const correct: AnalyticsActionFinding = worstSession
    ? {
        label: "Revisar",
        title: worstSession.label,
        body: `${signedCurrency(worstSession.pnl)} / ${worstSession.trades} operaciones. Mirar timing, noticias y frecuencia.`,
        href: "/analytics/hourly",
        tone: "negative",
      }
    : {
        label: "Revisar",
        title: worstDay?.label ?? "Sin problema dominante",
        body: worstDay
          ? `${signedCurrency(worstDay.pnl)} / ${worstDay.trades} operaciones. Analizar el día completo.`
          : "No hay patrón negativo dominante en los datos actuales.",
        href: "/analytics/daily",
        tone: worstDay && worstDay.pnl < 0 ? "negative" : "neutral",
      };

  const restrict: AnalyticsActionFinding =
    outlierDependency !== null && outlierDependency > 35
      ? {
          label: "Limitar",
          title: "No escalar todavía",
          body: `La operación de mayor peso representa ${outlierDependency.toFixed(0)}% del resultado. Confirmar repetición antes de escalar.`,
          href: "/risk",
          tone: "warning",
        }
      : insights.tagCoverage < 80
        ? {
            label: "Limitar",
            title: "Leer por sesión",
            body: `${insights.tagCoverage.toFixed(0)}% con setup. Usar sesiones hasta tener más etiquetas.`,
            href: "/analytics/hourly",
            tone: "warning",
          }
        : {
            label: "Limitar",
            title: "Mantener riesgo actual",
            body: "Los datos actuales no muestran un bloqueo dominante. Sigue con tamaño controlado.",
            href: "/risk",
            tone: "neutral",
          };

  return [maintain, correct, restrict];
}
