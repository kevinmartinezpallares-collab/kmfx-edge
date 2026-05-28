import { describe, expect, it } from "vitest";

import { wave1Workspace } from "@/lib/data/wave1-mock";
import { getFundingCockpitSummary } from "@/lib/domain/funding-selectors";

describe("getFundingCockpitSummary", () => {
  it("summarises funded/challenge accounts without treating unknown rules as real rules", () => {
    const summary = getFundingCockpitSummary(wave1Workspace);

    expect(summary.status).toBe("partial");
    expect(summary.linkedAccountCount).toBe(2);
    expect(summary.activeChallengeCount).toBe(1);
    expect(summary.activeFundedCount).toBe(1);
    expect(summary.fundedCapital).toBe(124854);
    expect(summary.feesAndResets).toBe(129);
    expect(summary.netFundingResult).toBe(-129);
    expect(summary.requiresReviewCount).toBe(1);
    expect(summary.postures.map((posture) => posture.account.id)).toEqual([
      "acct-alpha",
      "acct-theta",
    ]);
  });

  it("keeps payout ledger maths explicit and provenance-safe", () => {
    const summary = getFundingCockpitSummary({
      ...wave1Workspace,
      funding: {
        ...wave1Workspace.funding,
        profiles: [],
        ruleSets: [],
        journeys: [],
        stageAccounts: [],
        timelineEvents: [],
        ledgerEntries: [
          {
            id: "ledger-paid",
            fundingJourneyId: "journey-alpha",
            accountId: "acct-alpha",
            type: "payout_received",
            status: "paid",
            grossAmount: 1000,
            feesAmount: 100,
            netReceivedAmount: 900,
            currency: "USD",
            method: "bank",
            requestedAt: "2026-05-01T00:00:00.000Z",
            paidAt: "2026-05-03T00:00:00.000Z",
            occurredAt: "2026-05-03T00:00:00.000Z",
            proofUrl: null,
            notes: null,
          },
          {
            id: "ledger-pending",
            fundingJourneyId: "journey-alpha",
            accountId: "acct-alpha",
            type: "payout_requested",
            status: "pending",
            grossAmount: 500,
            feesAmount: null,
            netReceivedAmount: null,
            currency: "USD",
            method: "bank",
            requestedAt: "2026-05-10T00:00:00.000Z",
            paidAt: null,
            occurredAt: "2026-05-10T00:00:00.000Z",
            proofUrl: null,
            notes: null,
          },
          {
            id: "ledger-fee",
            fundingJourneyId: "journey-alpha",
            accountId: "acct-alpha",
            type: "challenge_fee",
            status: "paid",
            grossAmount: -100,
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

    expect(summary.paidPayouts).toBe(900);
    expect(summary.pendingPayouts).toBe(500);
    expect(summary.feesAndResets).toBe(100);
    expect(summary.netFundingResult).toBe(800);
  });

  it("keeps funding empty when no funded accounts are linked", () => {
    const summary = getFundingCockpitSummary({
      ...wave1Workspace,
      accounts: wave1Workspace.accounts.map((account) => ({
        ...account,
        isFunded: false,
        funding: undefined,
      })),
      funding: undefined,
    });

    expect(summary.status).toBe("empty");
    expect(summary.linkedAccountCount).toBe(0);
    expect(summary.fundedCapital).toBe(0);
    expect(summary.nextEventLabel).toBe("requiere revisión");
  });
});
