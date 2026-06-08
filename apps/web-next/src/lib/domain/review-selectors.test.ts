import { describe, expect, it } from "vitest";

import { wave1Workspace } from "@/lib/data/wave1-mock";
import {
  buildReviewPriorityRows,
  getBriefingOverview,
  getReviewAction,
  getReviewReadiness,
} from "@/lib/domain/review-selectors";

describe("review selectors", () => {
  it("prioritises losing and untagged trades before minor review items", () => {
    const queue = buildReviewPriorityRows(wave1Workspace);

    expect(queue.length).toBeGreaterThan(0);
    expect(queue[0].score).toBeGreaterThanOrEqual(queue.at(-1)?.score ?? 0);
    expect(queue[0].reasons).toContain("Pérdida relevante");
  });

  it("summarises review readiness without requiring UI logic", () => {
    const readiness = getReviewReadiness(wave1Workspace);

    expect(readiness.status).toBe("needs_review");
    expect(readiness.totalTrades).toBe(wave1Workspace.trades.length);
    expect(readiness.queueCount).toBeGreaterThan(0);
    expect(readiness.topReview).not.toBeNull();
  });

  it("keeps empty review queues explicit", () => {
    const readiness = getReviewReadiness({
      ...wave1Workspace,
      trades: [],
    });

    expect(readiness.status).toBe("empty");
    expect(readiness.queueCount).toBe(0);
    expect(readiness.topReview).toBeNull();
  });

  it("maps review reasons to actionable guidance", () => {
    expect(getReviewAction(["Pérdida relevante", "Sin etiqueta"])).toContain("Documentar setup");
    expect(getReviewAction(["Parcial / multi-exec"])).toContain("parciales");
  });

  it("builds a pre-session briefing with a verdict and at most three learnings", () => {
    const briefing = getBriefingOverview(wave1Workspace);

    expect(["green", "yellow", "red"]).toContain(briefing.verdict.state);
    expect(briefing.verdict.reason).toBeTruthy();
    expect(briefing.topLearnings.length).toBeLessThanOrEqual(3);
    expect(briefing.weekDays.length).toBeLessThanOrEqual(5);
    expect(briefing.unclassifiedCount).toBeGreaterThanOrEqual(briefing.unclassifiedRows.length);
  });
});
