import { describe, expect, it } from "vitest";

import { wave1Workspace } from "@/lib/data/wave1-mock";
import {
  buildFundingJourneys,
  getFundingAccountRows,
  getFundingJourneyDashboard,
  getFundingPayoutsOverview,
  getFundingRulesOverview,
  getFundingRiskQueue,
} from "@/lib/domain/funding-journey-selectors";

describe("buildFundingJourneys", () => {
  it("groups funding accounts as journey views instead of loose logins", () => {
    const journeys = buildFundingJourneys(wave1Workspace);

    expect(journeys).toHaveLength(2);
    expect(journeys.map((journey) => journey.account.id)).toEqual([
      "acct-theta",
      "acct-alpha",
    ]);
    expect(journeys[0]).toMatchObject({
      firm: "FTMO",
      currentStageKey: "funded",
      state: "funded",
      stateLabel: "Funded",
    });
    expect(journeys[1]).toMatchObject({
      firm: "The5ers",
      currentStageKey: "phase_2",
      state: "requires_review",
    });
  });

  it("keeps missing historical stages in requires_review instead of inventing results", () => {
    const [fundedJourney] = buildFundingJourneys(wave1Workspace);

    expect(fundedJourney.stages.map((stage) => stage.key)).toEqual([
      "phase_1",
      "phase_2",
      "funded",
    ]);
    expect(fundedJourney.stages[0]).toMatchObject({
      state: "requires_review",
      stateLabel: "Revisar",
      loginLabel: "Sin login vinculado",
      profitLabel: "requiere revisión",
      progressLabel: "requiere revisión",
    });
  });

  it("separates funding ledger economics from trading PnL when ledger exists", () => {
    const journeys = buildFundingJourneys({
      ...wave1Workspace,
      funding: {
        profiles: [],
        ruleSets: [],
        journeys: [],
        stageAccounts: [],
        timelineEvents: [],
        ledgerEntries: [
          {
            id: "paid-payout",
            fundingJourneyId: "journey-acct-theta",
            accountId: "acct-theta",
            type: "payout_received",
            status: "paid",
            grossAmount: 1200,
            feesAmount: 100,
            netReceivedAmount: 1100,
            currency: "USD",
            method: "bank",
            requestedAt: "2026-05-01T00:00:00.000Z",
            paidAt: "2026-05-03T00:00:00.000Z",
            occurredAt: "2026-05-03T00:00:00.000Z",
            proofUrl: null,
            notes: null,
          },
          {
            id: "reset-fee",
            fundingJourneyId: "journey-acct-theta",
            accountId: "acct-theta",
            type: "reset_fee",
            status: "paid",
            grossAmount: -150,
            feesAmount: null,
            netReceivedAmount: null,
            currency: "USD",
            method: "manual",
            requestedAt: null,
            paidAt: null,
            occurredAt: "2026-04-20T00:00:00.000Z",
            proofUrl: null,
            notes: null,
          },
        ],
      },
    });

    expect(journeys[0]).toMatchObject({
      paidPayoutsUsd: 1100,
      feesResetsUsd: 150,
      netRealUsd: 950,
    });
  });
});

describe("getFundingRiskQueue", () => {
  it("caps the next trade by requested risk, daily room and max room", () => {
    const queue = getFundingRiskQueue(wave1Workspace);
    const theta = queue.find((item) => item.journey.account.id === "acct-theta");

    expect(theta).toBeDefined();
    expect(theta?.requestedRiskAmount).toBeCloseTo(249.1);
    expect(theta?.dailyRoomAmount).toBeCloseTo(1893.16);
    expect(theta?.maxRoomAmount).toBeCloseTo(3786.32);
    expect(theta?.nextTradeRiskAmount).toBeCloseTo(249.1);
  });

  it("explains funded accounts as payout protection, not challenge pushing", () => {
    const queue = getFundingRiskQueue(wave1Workspace);
    const theta = queue.find((item) => item.journey.account.id === "acct-theta");

    expect(theta?.answer).toBe("Mas cerca de cobrar si protege payout");
  });
});

describe("funding route view selectors", () => {
  it("builds the funding dashboard without recalculating route metrics in the UI", () => {
    const dashboard = getFundingJourneyDashboard(wave1Workspace);

    expect(dashboard.journeys).toHaveLength(2);
    expect(dashboard.riskQueue).toHaveLength(2);
    expect(dashboard.nearPassCount).toBe(0);
    expect(dashboard.nearBreachCount).toBe(1);
  });

  it("extracts account rows from linked stages only", () => {
    const rows = getFundingAccountRows(wave1Workspace);

    expect(rows.map((row) => row.account.id)).toEqual(["acct-theta", "acct-alpha"]);
    expect(rows.every((row) => row.funding.firm.length > 0)).toBe(true);
  });

  it("keeps funding rules provenance-safe and marks missing stages for review", () => {
    const overview = getFundingRulesOverview(wave1Workspace);

    expect(overview.rows).toHaveLength(6);
    expect(overview.verifiedCount).toBe(2);
    expect(overview.requiresReviewCount).toBe(4);
    expect(overview.blockedRulesCount).toBe(0);
    expect(overview.defensiveRulesCount).toBe(2);
    expect(overview.notes[1]).toContain("no se completan con defaults");
  });

  it("separates payouts, resets and defense mode from trading PnL", () => {
    const overview = getFundingPayoutsOverview(wave1Workspace);

    expect(overview.rows.map((row) => row.type)).toEqual([
      "payout_requested",
      "payout_requested",
      "reset_fee",
    ]);
    expect(overview.rows.map((row) => row.typeLabel)).toEqual([
      "Payout solicitado",
      "Payout solicitado",
      "Reset",
    ]);
    expect(overview.pendingPayoutCount).toBe(2);
    expect(overview.feesResetsUsd).toBe(129);
    expect(overview.netRealUsd).toBe(-129);
    expect(overview.defenseItems.map((item) => item.mode)).toEqual(["Defend", "Defend"]);
  });
});
