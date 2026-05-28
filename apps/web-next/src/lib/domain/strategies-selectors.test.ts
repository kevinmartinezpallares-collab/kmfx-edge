import { describe, expect, it } from "vitest";

import { wave1Workspace } from "@/lib/data/wave1-mock";
import {
  buildStrategyRows,
  getStrategiesReadiness,
} from "@/lib/domain/strategies-selectors";

describe("strategy selectors", () => {
  it("groups trades by setup and sorts the largest samples first", () => {
    const rows = buildStrategyRows(wave1Workspace);

    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]?.trades).toBeGreaterThanOrEqual(rows[1]?.trades ?? 0);
    expect(rows[0]?.symbols.length).toBeGreaterThan(0);
    expect(rows[0]?.dominantSession).toBeTruthy();
  });

  it("falls back to discretionary buckets when setup is missing", () => {
    const rows = buildStrategyRows({
      ...wave1Workspace,
      trades: wave1Workspace.trades.map((trade) => ({
        ...trade,
        setup: null,
      })),
    });

    expect(rows.every((row) => row.name.includes("discretionary"))).toBe(true);
  });

  it("marks strategy readiness empty without trades", () => {
    const readiness = getStrategiesReadiness({
      ...wave1Workspace,
      trades: [],
    });

    expect(readiness.status).toBe("empty");
    expect(readiness.topStrategy).toBeNull();
    expect(readiness.tagCoveragePct).toBe(0);
  });

  it("marks readiness partial when attribution is not fully tagged", () => {
    const readiness = getStrategiesReadiness({
      ...wave1Workspace,
      trades: wave1Workspace.trades.map((trade, index) => ({
        ...trade,
        setup: index === 0 ? null : trade.setup,
      })),
    });

    expect(readiness.status).toBe("partial");
    expect(readiness.untaggedTrades).toBe(1);
    expect(readiness.tagCoveragePct).toBeLessThan(100);
  });
});
