import { describe, expect, it } from "vitest";

import { wave1Workspace } from "@/lib/data/wave1-mock";
import { getTradesOverview } from "@/lib/domain/trades-selectors";

describe("getTradesOverview", () => {
  it("summarises closed trades for the ledger header", () => {
    const overview = getTradesOverview(wave1Workspace);

    expect(overview.trades.length).toBe(wave1Workspace.trades.length);
    expect(overview.wins + overview.losses).toBe(wave1Workspace.trades.length);
    expect(overview.reviewQueueCount).toBeGreaterThan(0);
    expect(overview.tagCoveragePct).toBeGreaterThanOrEqual(0);
    expect(overview.partialTrades).toBeGreaterThanOrEqual(0);
  });

  it("adds costs and review score to each ledger row", () => {
    const overview = getTradesOverview(wave1Workspace);

    expect(overview.ledgerRows).toHaveLength(wave1Workspace.trades.length);
    expect(overview.ledgerRows[0]?.costs).toBeGreaterThanOrEqual(0);
    expect(
      overview.ledgerRows.some((row) => row.reviewScore !== null),
    ).toBe(true);
  });

  it("builds symbol and session concentration rows", () => {
    const overview = getTradesOverview(wave1Workspace);

    expect(overview.bySymbol.length).toBeGreaterThan(0);
    expect(overview.bySession.length).toBeGreaterThan(0);
    expect(overview.bySymbol[0]?.trades).toBeGreaterThanOrEqual(
      overview.bySymbol.at(-1)?.trades ?? 0,
    );
  });

  it("keeps an empty trade payload render-safe", () => {
    const overview = getTradesOverview({
      ...wave1Workspace,
      trades: [],
    });

    expect(overview.wins).toBe(0);
    expect(overview.losses).toBe(0);
    expect(overview.netPnl).toBe(0);
    expect(overview.costs).toBe(0);
    expect(overview.tagCoveragePct).toBe(0);
    expect(overview.bySymbol).toEqual([]);
    expect(overview.bySession).toEqual([]);
  });
});
