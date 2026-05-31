import type { ClosedTrade, TradeSession } from "@/lib/contracts/trade";
import type { WorkspaceState } from "@/lib/contracts/workspace-state";
import {
  buildReviewPriorityRows,
  getReviewAction,
  type ReviewPriorityRow,
} from "@/lib/domain/review-selectors";

export type FallbackJournalTableRow = {
  id?: string;
  date: string;
  session: string;
  setup: string;
  symbol: string;
  result: string;
  note: string;
};

export type JournalTableRow = Omit<FallbackJournalTableRow, "result"> & {
  session: TradeSession | string;
  netPnl: number | null;
  result?: string;
};

export type JournalOverview = {
  recentRows: JournalTableRow[];
  recentTradesCount: number;
  reviewQueue: ReviewPriorityRow[];
  reviewQueueCount: number;
  topReview: ReviewPriorityRow | null;
  connectedEntriesCount: number;
  taggedCount: number;
  missingSetupCount: number;
};

export type JournalAiReviewOverview = {
  queue: ClosedTrade[];
  queueCount: number;
  dominantLossSession: TradeSession | "Pendiente";
  missingSetupCount: number;
  hints: string[];
};

const JOURNAL_DATE_LABEL_FORMATTER = new Intl.DateTimeFormat("es-ES", {
  day: "2-digit",
  month: "short",
});

function toDateLabel(value: string) {
  return JOURNAL_DATE_LABEL_FORMATTER.format(new Date(value));
}

export function getJournalOverview(
  workspace?: WorkspaceState,
  fallbackRows: FallbackJournalTableRow[] = [],
): JournalOverview {
  const trades = workspace?.trades ?? [];
  const recentTrades = trades.slice(0, 6);
  const reviewQueue = workspace ? buildReviewPriorityRows(workspace) : [];
  const recentRows =
    recentTrades.length > 0
      ? recentTrades.map((trade) => ({
          id: trade.id,
          date: toDateLabel(trade.closedAt),
          session: trade.session,
          setup: trade.setup ?? "Sin etiqueta",
          symbol: trade.symbol,
          netPnl: trade.netPnl,
          note: `${trade.executions.length} ejecuciones / ${
            trade.durationMinutes ?? 0
          } min`,
        }))
      : fallbackRows.map((row) => ({
          ...row,
          netPnl: null,
        }));

  return {
    recentRows,
    recentTradesCount: recentTrades.length,
    reviewQueue,
    reviewQueueCount: reviewQueue.length,
    topReview: reviewQueue[0] ?? null,
    connectedEntriesCount: trades.length,
    taggedCount: trades.filter((trade) => Boolean(trade.setup)).length,
    missingSetupCount: trades.filter((trade) => !trade.setup).length,
  };
}

export function getJournalAiReviewOverview(
  workspace: WorkspaceState,
): JournalAiReviewOverview {
  const queue = workspace.trades.filter((trade) => trade.netPnl < 0 || !trade.setup);
  const dominantLossSession =
    Object.entries(
      queue
        .filter((trade) => trade.netPnl < 0)
        .reduce<Partial<Record<TradeSession, number>>>((acc, trade) => {
          acc[trade.session] = (acc[trade.session] ?? 0) + 1;
          return acc;
        }, {}),
    ).toSorted((a, b) => b[1] - a[1])[0]?.[0] ?? "Pendiente";
  const missingSetupCount = workspace.trades.filter((trade) => !trade.setup).length;

  return {
    queue,
    queueCount: queue.length,
    dominantLossSession: dominantLossSession as TradeSession | "Pendiente",
    missingSetupCount,
    hints: [
      dominantLossSession === "Pendiente"
        ? "Todavía no hay pérdidas suficientes para inferir una sesión dominante."
        : `Revisa primero la sesión ${dominantLossSession}; concentra la mayor parte de los cierres rojos visibles.`,
      missingSetupCount > 0
        ? "Hay operaciones sin etiqueta; falta contexto para entender el resultado."
        : "Todos los trades visibles llegan ya con setup, buena base para review.",
      queue.length > 2
        ? "La cola de review ya justifica un flujo dedicado antes de abrir más tamaño."
        : "La cola de review visible es contenida; puede convivir con el flujo diario.",
    ],
  };
}

export function getJournalReviewAction(item: ReviewPriorityRow) {
  return getReviewAction(item.reasons);
}
