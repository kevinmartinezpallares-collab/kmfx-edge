import { describe, expect, it } from "vitest";

import type { TradingAccount } from "@/lib/contracts/account";
import {
  evaluateFundingRuleForAccount,
  resolveFundingRuleForAccount,
} from "@/lib/domain/funding-rule-catalog";

function accountWithFunding(
  funding: NonNullable<TradingAccount["funding"]>,
  overrides: Partial<TradingAccount> = {},
): TradingAccount {
  return {
    balance: 100000,
    baseCurrency: "USD",
    broker: funding.firm,
    connectionState: "connected",
    connectionTone: "connected",
    equity: 100000,
    floatingPnl: 0,
    funding,
    id: "acct-test",
    isFunded: true,
    label: `${funding.firm} ${funding.phaseLabel}`,
    lastSyncLabel: "Hoy",
    login: "123",
    openPositionsCount: 0,
    planAccess: "active",
    platform: "mt5",
    server: `${funding.firm}-Demo`,
    totalPnl: 0,
    ...overrides,
  };
}

const baseFunding: NonNullable<TradingAccount["funding"]> = {
  accountMode: "evaluation",
  allowNewTrades: true,
  consistencyPct: null,
  dailyRoomLeftPct: 5,
  firm: "The Funding Pips",
  maxRoomLeftPct: 10,
  nextPayoutLabel: null,
  objectivePct: 5,
  payoutCadenceLabel: null,
  phaseLabel: "Step 2",
  playbookLabel: "2 Step Standard",
  progressPct: 0,
  recommendedRiskPct: 0.4,
  resetCostUsd: null,
  status: "safe",
};

describe("funding-rule-catalog", () => {
  it("resolves The Funding Pips 2 Step Standard phase 2 from account metadata", () => {
    const resolution = resolveFundingRuleForAccount(accountWithFunding(baseFunding));

    expect(resolution.status).toBe("verified");
    if (resolution.status !== "verified") return;

    expect(resolution.ruleSet).toMatchObject({
      dailyBaseline: "opening_balance_or_equity",
      dailyLossLimitPct: 5,
      firmName: "The Funding Pips",
      floatingLossCounts: true,
      maxDrawdownKind: "static_initial_balance",
      maxLossLimitPct: 10,
      phaseId: "phase_2",
      profitTargetPct: 5,
      touchedLimitBreaches: true,
    });
  });

  it("resolves The Funding Pips 1 Step evaluation separately", () => {
    const resolution = resolveFundingRuleForAccount(
      accountWithFunding({
        ...baseFunding,
        dailyRoomLeftPct: 3,
        maxRoomLeftPct: 6,
        objectivePct: 10,
        phaseLabel: "1 Step",
        playbookLabel: "1 Step",
      }),
    );

    expect(resolution.status).toBe("verified");
    if (resolution.status !== "verified") return;

    expect(resolution.ruleSet).toMatchObject({
      dailyLossLimitPct: 3,
      maxLossLimitPct: 6,
      phaseId: "phase_1",
      profitTargetPct: 10,
      programId: "1-step",
    });
  });

  it("requires review when The Funding Pips phase 1 lacks the selected model", () => {
    const resolution = resolveFundingRuleForAccount(
      accountWithFunding({
        ...baseFunding,
        objectivePct: null,
        phaseLabel: "Fase 1",
        playbookLabel: "Evaluation plan",
      }),
    );

    expect(resolution).toMatchObject({
      reason:
        "No se puede resolver una única regla verificada con la firma, programa, fase y objetivo disponibles.",
      status: "requires_review",
    });
  });

  it("requires review for funded firms without verified catalog entries", () => {
    const resolution = resolveFundingRuleForAccount(
      accountWithFunding({
        ...baseFunding,
        firm: "Unknown Funded",
        phaseLabel: "Fase 1",
      }, { broker: "Unknown Funded", label: "Unknown Funded 100K" }),
    );

    expect(resolution).toMatchObject({
      reason: "Firma de fondeo sin catálogo verificado.",
      status: "requires_review",
    });
  });

  it("resolves The5ers High Stakes New phase 1 from objective and program", () => {
    const resolution = resolveFundingRuleForAccount(
      accountWithFunding({
        ...baseFunding,
        dailyRoomLeftPct: 4.4,
        firm: "The5ers",
        maxRoomLeftPct: 9.4,
        objectivePct: 10,
        phaseLabel: "High Stakes",
        playbookLabel: "High stakes defensive",
      }, { broker: "The5ers", label: "The5ers High Stakes 100K" }),
    );

    expect(resolution.status).toBe("verified");
    if (resolution.status !== "verified") return;

    expect(resolution.ruleSet).toMatchObject({
      dailyBaseline: "previous_day_close_balance_or_equity",
      dailyLossLimitPct: 5,
      firmName: "The5ers",
      maxLossLimitPct: 10,
      phaseId: "phase_1",
      profitTargetPct: 10,
      programId: "high-stakes-new",
    });
  });

  it("resolves Orion Standard Swing phase 1 when target uniquely identifies the program", () => {
    const resolution = resolveFundingRuleForAccount(
      accountWithFunding({
        ...baseFunding,
        dailyRoomLeftPct: 4.8,
        firm: "Orion Funded",
        maxRoomLeftPct: 5.8,
        objectivePct: 8,
        phaseLabel: "Fase 1",
        playbookLabel: "Reto conservador",
      }, { broker: "Orion Funded", label: "Orion Funded 50K" }),
    );

    expect(resolution.status).toBe("verified");
    if (resolution.status !== "verified") return;

    expect(resolution.matchConfidence).toBe("firm_phase");
    expect(resolution.warnings).toContain(
      "Programa inferido por firma y fase; confirmar etiqueta exacta del examen.",
    );
    expect(resolution.ruleSet).toMatchObject({
      dailyLossLimitPct: 5,
      maxDrawdownKind: "static_initial_balance",
      maxLossLimitPct: 6,
      programId: "standard-swing",
    });
  });

  it("keeps Darwinex Zero in review without a concrete allocation model", () => {
    const resolution = resolveFundingRuleForAccount(
      accountWithFunding({
        ...baseFunding,
        firm: "Darwinex Zero",
        objectivePct: 8,
        phaseLabel: "Fase 1",
        playbookLabel: "Challenge conservative",
      }, { broker: "Darwinex", label: "Darwinex Zero 100K" }),
    );

    expect(resolution).toMatchObject({
      reason: "Firma de fondeo sin catálogo verificado.",
      status: "requires_review",
    });
  });

  it("recommends a logical block when verified daily funding room is exhausted", () => {
    const evaluation = evaluateFundingRuleForAccount(
      accountWithFunding({
        ...baseFunding,
        dailyRoomLeftPct: 0,
      }),
    );

    expect(evaluation).toMatchObject({
      allowNewTradesRecommendation: false,
      status: "blocked",
    });
    expect(evaluation.alerts).toContainEqual(
      expect.objectContaining({
        id: "funding-daily-block",
        label: "Bloqueo diario de fondeo",
        tone: "danger",
      }),
    );
  });

  it("warns before the verified funding daily limit is exhausted", () => {
    const evaluation = evaluateFundingRuleForAccount(
      accountWithFunding({
        ...baseFunding,
        dailyRoomLeftPct: 1.4,
      }),
    );

    expect(evaluation.status).toBe("warning");
    expect(evaluation.dailyUsagePct).toBeCloseTo(72);
    expect(evaluation.alerts).toContainEqual(
      expect.objectContaining({
        id: "funding-daily-warning",
        tone: "warning",
      }),
    );
  });
});
