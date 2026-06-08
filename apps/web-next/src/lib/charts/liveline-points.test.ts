import { describe, expect, it } from "vitest";

import {
  bucketLivelinePoints,
  fitLivelineToWindowStart,
  prepareHistoricalLivelineCurve,
} from "./liveline-points";

describe("liveline point preparation", () => {
  it("keeps stable historical buckets while preserving first and last real points", () => {
    const points = [
      { time: 1_771_958_400, value: 100 },
      { time: 1_771_958_460, value: 101 },
      { time: 1_771_958_520, value: 102 },
      { time: 1_772_044_800, value: 104 },
      { time: 1_772_044_860, value: 106 },
    ];

    const bucketed = bucketLivelinePoints(points, 86_400);

    expect(bucketed).toHaveLength(2);
    expect(bucketed[0]?.time).toBe(points[0]?.time);
    expect(bucketed[0]?.value).toBe(100);
    expect(bucketed.at(-1)?.time).toBe(points.at(-1)?.time);
    expect(bucketed[1]?.value).toBe(106);
  });

  it("reduces dense MT5 equity history before rendering historic Liveline charts", () => {
    const points = Array.from({ length: 180 }, (_, index) => ({
      time: 1_771_958_400 + index * 900,
      value: 100_000 + Math.sin(index / 4) * 400 + index * 12,
    }));

    const prepared = prepareHistoricalLivelineCurve(points, {
      bucketSecs: 3_600,
      maxPoints: 48,
      minPoints: 12,
      minStepSecs: 300,
    });

    expect(prepared.length).toBeLessThan(points.length);
    expect(prepared.length).toBeGreaterThanOrEqual(12);
    expect(prepared[0]?.time).toBe(points[0]?.time);
    expect(prepared.at(-1)?.time).toBe(points.at(-1)?.time);
  });

  it("anchors selected windows at the left edge with the carried equity value", () => {
    const points = [
      { time: 100, value: 1000 },
      { time: 200, value: 1100 },
      { time: 300, value: 1200 },
    ];

    const fitted = fitLivelineToWindowStart(points, 150);

    expect(fitted[0]).toEqual({ time: 150, value: 1050 });
    expect(fitted.at(-1)).toEqual(points.at(-1));
  });

  it("starts sparse selected windows at the first real point when no earlier point exists", () => {
    const points = [
      { time: 200, value: 1100 },
      { time: 300, value: 1200 },
    ];

    const fitted = fitLivelineToWindowStart(points, 150);

    expect(fitted[0]).toEqual(points[0]);
    expect(fitted.at(-1)).toEqual(points.at(-1));
  });
});
