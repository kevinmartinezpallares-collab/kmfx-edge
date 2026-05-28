import { describe, expect, it } from "vitest";

import type { RawLiveAccountsSnapshot } from "@/lib/contracts/live-snapshot";
import { wave1Workspace } from "@/lib/data/wave1-mock";
import { createWorkspaceFromLiveSnapshot } from "@/lib/data/live-snapshot-adapter";
import fixtureSnapshot from "@/lib/data/fixtures/live-accounts-snapshot.fixture.json";
import { getRiskGuardPosture } from "@/lib/domain/risk-selectors";

describe("getRiskGuardPosture", () => {
  it("derives daily room, heat usage and account pressure from workspace risk", () => {
    const posture = getRiskGuardPosture(wave1Workspace);

    expect(posture.status).toBe("caution");
    expect(posture.allowNewTrades).toBe(true);
    expect(posture.dailyUsagePct).toBeCloseTo(43.8);
    expect(posture.dailyRoomSharePct).toBeCloseTo(56.2);
    expect(posture.heatUsagePct).toBeCloseTo(44.67);
    expect(posture.firstAccountAtRisk?.accountId).toBe("acct-theta");
  });

  it("sorts dominant exposure by open risk rather than trusting payload order", () => {
    const posture = getRiskGuardPosture({
      ...wave1Workspace,
      risk: {
        ...wave1Workspace.risk,
        totalOpenRiskPct: 3,
        exposureBySymbol: [
          { symbol: "EURUSD", openRiskPct: 0.3, tone: "safe" },
          { symbol: "XAUUSD", openRiskPct: 1.8, tone: "caution" },
          { symbol: "NAS100", openRiskPct: 0.9, tone: "safe" },
        ],
      },
    });

    expect(posture.dominantExposure?.symbol).toBe("XAUUSD");
    expect(posture.dominantSharePct).toBe(60);
  });

  it("works on the live fixture contract used by Wave 1", () => {
    const workspace = createWorkspaceFromLiveSnapshot(
      fixtureSnapshot as RawLiveAccountsSnapshot,
      "fixture",
    );
    const posture = getRiskGuardPosture(workspace);

    expect(posture.status).toBe("safe");
    expect(posture.accountPostures).toHaveLength(fixtureSnapshot.accounts.length);
    expect(posture.dominantExposure?.symbol).toBe("XAUUSD");
  });

  it("keeps the posture safe to render when accounts, exposures and limits are missing", () => {
    const posture = getRiskGuardPosture({
      ...wave1Workspace,
      activeAccountId: "missing",
      accounts: [],
      risk: {
        ...wave1Workspace.risk,
        dailyLimitPct: 0,
        heatLimitPct: 0,
        exposureBySymbol: [],
      },
    });

    expect(posture.accountPostures).toEqual([]);
    expect(posture.firstAccountAtRisk).toBeNull();
    expect(posture.dominantExposure).toBeNull();
    expect(posture.dailyUsagePct).toBe(0);
    expect(posture.heatUsagePct).toBe(0);
  });
});
