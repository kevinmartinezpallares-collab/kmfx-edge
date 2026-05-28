import { describe, expect, it } from "vitest";

import {
  computeRecommendedRiskFromModel,
  computeRiskState,
  recommendedRiskPctForState,
} from "@/lib/domain/risk-engine";

describe("risk-engine", () => {
  it("locks immediately when hard drawdown limits are breached", () => {
    expect(
      computeRiskState({
        drawdownPct: 10,
        maxDrawdownLimitPct: 10,
        autoBlockEnabled: true,
      }),
    ).toMatchObject({
      risk_state: "LOCKED",
      blocked: true,
      block_reason: "Trading blocked",
    });

    expect(
      computeRiskState({
        dailyDrawdownPct: 1.2,
        dailyDrawdownLimitPct: 1.2,
        autoBlockEnabled: true,
      }),
    ).toMatchObject({
      risk_state: "LOCKED",
      blocked: true,
    });
  });

  it("escalates soft risk when loss streak, win rate and trade risk deteriorate", () => {
    const risk = computeRiskState({
      drawdownPct: 3.2,
      dailyDrawdownPct: 0.3,
      consecutiveLosses: 6,
      recentWinRate: 32,
      riskPerTradePct: 2.2,
      autoBlockEnabled: false,
    });

    expect(risk.risk_state).toBe("DANGER");
    expect(risk.blocked).toBe(false);
    expect(risk.explanation).toContain("Racha de 6");
  });

  it("keeps recommendation percentages stable by state", () => {
    expect(recommendedRiskPctForState("NORMAL")).toBe(1);
    expect(recommendedRiskPctForState("CAUTION")).toBe(0.75);
    expect(recommendedRiskPctForState("DANGER")).toBe(0.5);
    expect(recommendedRiskPctForState("LOCKED")).toBe(0);
  });

  it("computes risk from the legacy-shaped calculator model", () => {
    const result = computeRecommendedRiskFromModel(
      {
        account: {
          balance: 10000,
          maxDrawdownLimit: 10,
        },
        riskProfile: {
          autoBlock: true,
          currentRiskPct: 0.8,
          dailyLossLimitPct: 1.2,
        },
        riskSummary: {
          dailyLossUsd: -80,
        },
        streaks: {
          bestLoss: 2,
        },
        totals: {
          drawdown: {
            maxPct: 2,
          },
          winRate: 55,
        },
        trades: [
          { pnl: 100 },
          { pnl: -50 },
          { pnl: 90 },
          { pnl: 30 },
        ],
      },
      { balance: 10000 },
    );

    expect(result.risk_state).toBe("NORMAL");
    expect(result.recommendedRiskPct).toBe(1);
  });
});
