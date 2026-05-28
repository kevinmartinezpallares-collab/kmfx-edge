import { describe, expect, it } from "vitest";

import { wave1Workspace } from "@/lib/data/wave1-mock";
import { getRiskGuardAlerts } from "@/lib/domain/risk-alerts";

describe("getRiskGuardAlerts", () => {
  it("flags low daily room on funded accounts without blocking safe trading", () => {
    const alerts = getRiskGuardAlerts(wave1Workspace);

    expect(alerts.map((alert) => alert.label)).toContain(
      "KMFX Theta con poco room",
    );
    expect(alerts.some((alert) => alert.label === "Trading bloqueado")).toBe(false);
  });

  it("prioritises hard blocks before soft warnings", () => {
    const alerts = getRiskGuardAlerts({
      ...wave1Workspace,
      risk: {
        ...wave1Workspace.risk,
        status: "blocked",
        allowNewTrades: false,
        dailyDrawdownPct: 4.8,
        dailyLimitPct: 5,
        totalOpenRiskPct: 2.9,
        heatLimitPct: 3,
      },
    });

    expect(alerts[0]).toMatchObject({
      tone: "danger",
      label: "Trading bloqueado",
    });
    expect(alerts.map((alert) => alert.label)).toContain("Daily DD al limite");
    expect(alerts.map((alert) => alert.label)).toContain("Heat casi lleno");
  });
});
