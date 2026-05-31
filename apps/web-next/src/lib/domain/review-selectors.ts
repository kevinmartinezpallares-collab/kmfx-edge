import type { ClosedTrade } from "@/lib/contracts/trade";
import type { WorkspaceState } from "@/lib/contracts/workspace-state";

export type ReviewReason = "Pérdida" | "Sin etiqueta" | "Salida rápida" | "Parcial / multi-exec";

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

export function buildReviewPriorityRows(workspace: WorkspaceState): ReviewPriorityRow[] {
  return workspace.trades
    .reduce<ReviewPriorityRow[]>((rows, trade) => {
      const reasons: ReviewReason[] = [];
      let score = 0;

      if (trade.netPnl < 0) {
        score += 3;
        reasons.push("Pérdida");
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
  if (reasons.includes("Pérdida") && reasons.includes("Sin etiqueta")) {
    return "Documentar setup y causa de pérdida antes de volver a operar ese patrón.";
  }
  if (reasons.includes("Pérdida")) {
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
  const lossCount = queue.filter((item) => item.trade.netPnl < 0).length;
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
