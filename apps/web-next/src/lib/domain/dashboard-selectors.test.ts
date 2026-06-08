import { describe, expect, it } from "vitest";

import { wave1Workspace } from "@/lib/data/wave1-mock";
import {
  buildDashboardAttentionItems,
  buildDashboardPerformance,
  buildDashboardSessionRows,
  buildDashboardSetupRows,
  buildDashboardSymbolRows,
  resolveAccountMode,
  riskStatusLabel,
  sessionLabel,
} from "@/lib/domain/dashboard-selectors";

describe("dashboard selectors", () => {
  it("uses analytics performance when the source is coherent", () => {
    const performance = buildDashboardPerformance(wave1Workspace);

    expect(performance.totalTrades).toBe(wave1Workspace.analytics.performance.totalTrades);
    expect(performance.profitFactor).toBe(wave1Workspace.analytics.performance.profitFactor);
  });

  it("falls back to closed trades if aggregate performance is empty", () => {
    const performance = buildDashboardPerformance({
      ...wave1Workspace,
      analytics: {
        ...wave1Workspace.analytics,
        performance: {
          ...wave1Workspace.analytics.performance,
          netProfit: 0,
          profitFactor: 0,
          totalTrades: 0,
          winCount: 0,
          lossCount: 0,
        },
      },
    });

    expect(performance.totalTrades).toBe(wave1Workspace.trades.length);
    expect(performance.netProfit).toBeCloseTo(
      wave1Workspace.trades.reduce((sum, trade) => sum + trade.netPnl, 0),
    );
  });

  it("resolves account mode and risk labels for visible dashboard copy", () => {
    expect(resolveAccountMode(wave1Workspace.accounts[0])).toBe("Reto");
    expect(riskStatusLabel("safe")).toBe("Operable");
    expect(riskStatusLabel("caution")).toBe("Vigilar");
    expect(riskStatusLabel("blocked")).toBe("Bloqueado");
  });

  it("builds daily attention items without exceeding three priorities", () => {
    const items = buildDashboardAttentionItems(wave1Workspace);

    expect(items.length).toBeLessThanOrEqual(3);
    expect(items.some((item) => item.href === "/trades")).toBe(true);
  });

  it("builds attribution rows for setup, symbol and session", () => {
    const setupRows = buildDashboardSetupRows(wave1Workspace.trades);
    const symbolRows = buildDashboardSymbolRows(wave1Workspace.trades);
    const sessionRows = buildDashboardSessionRows(wave1Workspace.trades);

    expect(setupRows.length).toBeGreaterThan(0);
    expect(symbolRows[0]?.trades).toBeGreaterThanOrEqual(symbolRows[1]?.trades ?? 0);
    expect(sessionRows.length).toBeGreaterThan(0);
    expect(sessionLabel("New York")).toBe("NY");
  });
});
