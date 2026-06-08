import { describe, expect, it } from "vitest";

import {
  getStrategyLabReadiness,
  strategyLabGeneBlocks,
  strategyLabMetrics,
  strategyLabSteps,
} from "@/lib/domain/strategy-lab";

describe("strategy lab contract", () => {
  it("keeps the six genetic blocks from the master document", () => {
    expect(strategyLabGeneBlocks.map((block) => block.block)).toEqual([
      "A",
      "B",
      "C",
      "D",
      "E",
      "F",
    ]);
    expect(strategyLabGeneBlocks.reduce((total, block) => total + block.options.length, 0)).toBe(32);
  });

  it("tracks setup readiness from concrete steps", () => {
    expect(strategyLabSteps.map((step) => step.id)).toEqual([
      "postgres",
      "ea",
      "env",
      "first-run",
      "dashboard",
    ]);
    expect(getStrategyLabReadiness()).toBe(40);
  });

  it("surfaces the expected genetic defaults", () => {
    expect(strategyLabMetrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Pool inicial", value: "200" }),
        expect.objectContaining({ label: "Survivors", value: "10" }),
        expect.objectContaining({ label: "Promocion", value: "50+" }),
      ]),
    );
  });
});
