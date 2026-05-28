import { describe, expect, it } from "vitest";

import { wave1Workspace } from "@/lib/data/wave1-mock";
import {
  buildInsightActionFindings,
  buildInsightAttribution,
  getAnalyticsDailyOverview,
  getAnalyticsHourlyOverview,
  getAnalyticsReadiness,
} from "@/lib/domain/analytics-selectors";

describe("getAnalyticsReadiness", () => {
  it("classifies the current fixture as renderable with available aggregate trades", () => {
    const readiness = getAnalyticsReadiness(wave1Workspace);

    expect(readiness.status).toBe("ready");
    expect(readiness.totalTrades).toBe(58);
    expect(readiness.sampleLabel).toBe("En progreso");
    expect(readiness.blockers).toEqual([]);
  });

  it("marks analytics empty when there are no trades", () => {
    const readiness = getAnalyticsReadiness({
      ...wave1Workspace,
      trades: [],
      analytics: {
        ...wave1Workspace.analytics,
        performance: {
          ...wave1Workspace.analytics.performance,
          totalTrades: 0,
        },
        daily: [],
        hourly: [],
      },
    });

    expect(readiness.status).toBe("empty");
    expect(readiness.sampleLabel).toBe("Sin operaciones");
    expect(readiness.blockers).toContain("no_trades");
  });

  it("keeps analytics partial when trade totals exist but buckets are missing", () => {
    const readiness = getAnalyticsReadiness({
      ...wave1Workspace,
      analytics: {
        ...wave1Workspace.analytics,
        daily: [],
        hourly: [],
      },
    });

    expect(readiness.status).toBe("partial");
    expect(readiness.blockers).toEqual([
      "missing_daily_buckets",
      "missing_hourly_buckets",
    ]);
  });
});

describe("analytics route overviews", () => {
  it("summarises daily buckets for the daily insights route", () => {
    const overview = getAnalyticsDailyOverview(wave1Workspace);

    expect(overview.activeDayCount).toBe(wave1Workspace.analytics.daily.length);
    expect(overview.bestDay?.label).toBe("3 may");
    expect(overview.worstDay?.label).toBe("4 may");
    expect(overview.averageTradesPerActiveDay).toBeCloseTo(1, 1);
  });

  it("summarises hourly buckets and dominant trade session", () => {
    const overview = getAnalyticsHourlyOverview(wave1Workspace);

    expect(overview.activeHourCount).toBe(wave1Workspace.analytics.hourly.length);
    expect(overview.bestHour?.trades).toBeGreaterThan(0);
    expect(overview.dominantSession).toBe("London");
    expect(overview.sessionCounts.London).toBe(2);
  });

  it("builds attribution for what contributes, drains and needs review", () => {
    const attribution = buildInsightAttribution(wave1Workspace);

    expect(attribution.bestSetup?.name).toBe("NY impulse");
    expect(attribution.worstSetup?.name).toBe("Open drive fail");
    expect(attribution.topSymbol?.label).toBe("XAUUSD");
    expect(attribution.topSession?.label).toBe("New York");
    expect(attribution.sessionRows[0].label).toBe("New York");
    expect(attribution.cumulativeCurve.at(-1)?.pnl).toBe(561);
    expect(attribution.reviewQueue.length).toBeGreaterThan(0);
    expect(attribution.outlierDependency).toBeGreaterThan(0);
  });

  it("builds actionable findings without adding extra dashboard sections", () => {
    const findings = buildInsightActionFindings(wave1Workspace);

    expect(findings.map((finding) => finding.label)).toEqual([
      "Potenciar",
      "Revisar",
      "Limitar",
    ]);
    expect(findings[0].href).toBe("/analytics/hourly");
    expect(findings[1].href).toBe("/analytics/daily");
    expect(findings[2].href).toBe("/risk");
  });
});
