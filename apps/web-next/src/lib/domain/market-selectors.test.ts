import { describe, expect, it } from "vitest";

import { wave1Workspace } from "@/lib/data/wave1-mock";
import {
  buildMarketRows,
  getMarketReadiness,
} from "@/lib/domain/market-selectors";

describe("market selectors", () => {
  it("combines traded symbols with open risk exposure", () => {
    const rows = buildMarketRows(wave1Workspace);

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((row) => row.symbol === "EURUSD")).toBe(true);
    expect(rows[0]?.trades).toBeGreaterThanOrEqual(rows[1]?.trades ?? 0);
  });

  it("keeps exposed symbols visible even without closed trades", () => {
    const rows = buildMarketRows({
      ...wave1Workspace,
      trades: [],
    });

    expect(rows).toHaveLength(wave1Workspace.risk.exposureBySymbol.length);
    expect(rows[0]?.openRiskPct).toBeGreaterThan(0);
  });

  it("marks market empty when neither trades nor exposure exist", () => {
    const readiness = getMarketReadiness({
      ...wave1Workspace,
      trades: [],
      risk: {
        ...wave1Workspace.risk,
        exposureBySymbol: [],
      },
    });

    expect(readiness.status).toBe("empty");
    expect(readiness.hotSymbol).toBeNull();
  });
});
