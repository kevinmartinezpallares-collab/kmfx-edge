import { describe, expect, it } from "vitest";

import { wave1Workspace } from "@/lib/data/wave1-mock";
import {
  getJournalAiReviewOverview,
  getJournalOverview,
} from "@/lib/domain/journal-selectors";

describe("getJournalOverview", () => {
  it("builds recent journal rows from visible trades", () => {
    const overview = getJournalOverview(wave1Workspace);

    expect(overview.recentRows).toHaveLength(wave1Workspace.trades.length);
    expect(overview.reviewQueueCount).toBeGreaterThan(0);
    expect(overview.connectedEntriesCount).toBe(wave1Workspace.trades.length);
    expect(overview.taggedCount + overview.missingSetupCount).toBe(
      wave1Workspace.trades.length,
    );
  });

  it("uses fallback rows when no workspace is available", () => {
    const overview = getJournalOverview(undefined, [
      {
        id: "fallback",
        date: "Hoy",
        session: "London",
        setup: "Pendiente",
        symbol: "EURUSD",
        result: "Pendiente",
        note: "Sin datos conectados",
      },
    ]);

    expect(overview.recentRows).toHaveLength(1);
    expect(overview.reviewQueueCount).toBe(0);
    expect(overview.connectedEntriesCount).toBe(0);
  });
});

describe("getJournalAiReviewOverview", () => {
  it("keeps AI review as heuristic read-only context", () => {
    const overview = getJournalAiReviewOverview(wave1Workspace);

    expect(overview.queueCount).toBeGreaterThan(0);
    expect(overview.hints).toHaveLength(3);
    expect(overview.dominantLossSession).not.toBe("Pendiente");
  });

  it("handles a clean dataset without pretending there is AI insight", () => {
    const overview = getJournalAiReviewOverview({
      ...wave1Workspace,
      trades: wave1Workspace.trades.map((trade) => ({
        ...trade,
        netPnl: Math.abs(trade.netPnl),
        setup: trade.setup ?? "Manual setup",
      })),
    });

    expect(overview.queueCount).toBe(0);
    expect(overview.dominantLossSession).toBe("Pendiente");
    expect(overview.hints[0]).toContain("no hay pérdidas suficientes");
  });
});
