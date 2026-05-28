import { describe, expect, it } from "vitest";

import { wave1Workspace } from "@/lib/data/wave1-mock";
import { getExecutionQuality } from "@/lib/domain/execution-selectors";

describe("getExecutionQuality", () => {
  it("summarises execution diagnostics from closed trades", () => {
    const quality = getExecutionQuality(wave1Workspace);

    expect(quality.totalTrades).toBe(wave1Workspace.trades.length);
    expect(quality.taggedTrades).toBeLessThanOrEqual(quality.totalTrades);
    expect(quality.scaleOutTrades).toBeGreaterThanOrEqual(0);
    expect(quality.hints).toHaveLength(3);
  });

  it("marks execution empty without fabricating session or duration", () => {
    const quality = getExecutionQuality({
      ...wave1Workspace,
      trades: [],
    });

    expect(quality.status).toBe("empty");
    expect(quality.averageDurationMinutes).toBeNull();
    expect(quality.worstSession).toBe("Pend.");
  });

  it("marks execution partial when tags or durations are missing", () => {
    const quality = getExecutionQuality({
      ...wave1Workspace,
      trades: wave1Workspace.trades.map((trade, index) => ({
        ...trade,
        setup: index === 0 ? null : trade.setup,
        durationMinutes: index === 1 ? null : trade.durationMinutes,
      })),
    });

    expect(quality.status).toBe("partial");
    expect(quality.tagCoveragePct).toBeLessThan(100);
  });
});
