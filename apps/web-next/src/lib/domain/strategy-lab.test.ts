import { describe, expect, it } from "vitest";

import {
  accountObjectives,
  getStrategyLabReadiness,
  researchGates,
  strategyFamilies,
  strategyLabMetrics,
  strategyLabSteps,
} from "@/lib/domain/strategy-lab";

describe("strategy lab contract", () => {
  it("supports multiple account objectives", () => {
    expect(accountObjectives.map((objective) => objective.name)).toEqual([
      "Fondeo",
      "Consistencia larga",
      "Darwinex / track record",
    ]);
    expect(accountObjectives.every((objective) => objective.controls.length >= 4)).toBe(true);
  });

  it("tracks setup readiness from concrete steps", () => {
    expect(strategyLabSteps.map((step) => step.id)).toEqual([
      "supabase",
      "mt5-export",
      "csv-ingest",
      "validation",
      "promotion",
    ]);
    expect(getStrategyLabReadiness()).toBe(50);
  });

  it("surfaces research metrics and validation gates", () => {
    expect(strategyLabMetrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Fuente conectada", value: "Supabase" }),
        expect.objectContaining({ label: "Promocion", value: "7 puertas" }),
      ]),
    );
    expect(researchGates).toHaveLength(7);
  });

  it("includes the initial strategy families", () => {
    expect(strategyFamilies.map((strategy) => strategy.name)).toEqual(
      expect.arrayContaining([
        "ORB breakout",
        "ORB failed breakout",
        "VWAP continuation",
        "VWAP mean reversion",
        "Liquidity sweep",
        "Range compression breakout",
      ]),
    );
  });
});
