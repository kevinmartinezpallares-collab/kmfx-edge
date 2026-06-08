import { describe, expect, it } from "vitest";

import { wave1Workspace } from "@/lib/data/wave1-mock";
import {
  getExecutionQuality,
  getExecutionRMetrics,
} from "@/lib/domain/execution-selectors";

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

  it("summarises R, excursion and exit efficiency when execution fields exist", () => {
    const metrics = getExecutionRMetrics(wave1Workspace);

    expect(metrics.status).toBe("ready");
    expect(metrics.measuredTrades).toBe(wave1Workspace.trades.length);
    expect(metrics.avgCapturedR).toBeGreaterThan(0);
    expect(metrics.avgMfeR).toBeGreaterThan(0);
    expect(metrics.avgExitEfficiencyPct).toBeGreaterThan(0);
    expect(metrics.rows).toHaveLength(wave1Workspace.trades.length);
  });

  it("does not fabricate R metrics when execution fields are absent", () => {
    const metrics = getExecutionRMetrics({
      ...wave1Workspace,
      trades: wave1Workspace.trades.map((trade) => ({
        ...trade,
        capturedR: null,
        exitEfficiencyPct: null,
        initialStopPrice: null,
        maeR: null,
        maxAdverseExcursionAmount: null,
        maxFavorableExcursionAmount: null,
        mfeR: null,
        plannedRewardAmount: null,
        plannedRewardRiskRatio: null,
        plannedRiskAmount: null,
        targetPrice: null,
      })),
    });

    expect(metrics.status).toBe("empty");
    expect(metrics.measuredTrades).toBe(0);
    expect(metrics.avgCapturedR).toBeNull();
  });
});
