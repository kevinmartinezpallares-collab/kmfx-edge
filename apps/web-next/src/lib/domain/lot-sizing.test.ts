import { describe, expect, it } from "vitest";

import { wave1Workspace } from "@/lib/data/wave1-mock";
import {
  asCalculatorNumber,
  calculateFxLotSize,
  getInstrumentProfile,
  getLotSizingRecommendationRows,
  getLotSizingOverview,
  getRecommendedRiskPct,
  parsePair,
  parseCalculatorNumber,
  resolveConversion,
} from "@/lib/domain/lot-sizing";

describe("lot sizing", () => {
  it("parses valid FX pairs and rejects invalid symbols", () => {
    expect(parsePair("EURUSD")).toEqual({
      base: "EUR",
      quote: "USD",
      symbol: "EURUSD",
    });
    expect(parsePair("XAUUSD")).toBeNull();
    expect(parsePair("USDEURUSD")).toBeNull();
  });

  it("resolves direct, reverse and identity currency conversion", () => {
    expect(resolveConversion("USD", "USD")?.source).toBe("identity");
    expect(resolveConversion("EUR", "USD")?.path).toBe("EURUSD");
    expect(resolveConversion("USD", "EUR")?.path).toBe("EURUSD");
  });

  it("calculates FX lot size with funding cap applied", () => {
    const account = wave1Workspace.accounts.find((item) => item.funding) ?? null;
    const result = calculateFxLotSize({
      account,
      symbol: "EURUSD",
      riskPct: 1,
      stopPips: 10,
    });

    expect(result.safeCapPct).not.toBeNull();
    expect(result.appliedRiskPct).toBeLessThanOrEqual(1);
    expect(result.lotSize).toBeGreaterThanOrEqual(0);
    expect(result.riskPerLot).toBeGreaterThan(0);
  });

  it("calculates gold and index sizing with editable point value defaults", () => {
    const account = wave1Workspace.accounts.find((item) => item.id === "acct-alpha") ?? null;
    const gold = calculateFxLotSize({
      account,
      symbol: "XAUUSD",
      riskPct: 0.45,
      stopPips: 1000,
      valuePerUnitPerLot: getInstrumentProfile("XAUUSD").defaultValuePerUnitPerLot,
    });
    const index = calculateFxLotSize({
      account,
      symbol: "NAS100",
      riskPct: 0.45,
      stopPips: 100,
      valuePerUnitPerLot: 1,
    });

    expect(gold.instrument.kind).toBe("metal");
    expect(gold.instrument.unitLabel).toBe("0.01 USD");
    expect(gold.pipValuePerLot).toBe(1);
    expect(gold.lotSize).toBeGreaterThan(0);
    expect(index.instrument.kind).toBe("index");
    expect(index.pipValuePerLot).toBe(1);
    expect(index.riskPerLot).toBe(100);
  });

  it("keeps calculator numeric parsing compatible with comma decimals", () => {
    expect(asCalculatorNumber("0,75", 0.5)).toBe(0.75);
    expect(asCalculatorNumber("nope", 0.5)).toBe(0.5);
    expect(parseCalculatorNumber("1,25")).toBe(1.25);
    expect(parseCalculatorNumber("")).toBeNull();
  });

  it("builds account risk budgets without treating missing funding room as zero", () => {
    const overview = getLotSizingOverview(wave1Workspace);
    const ownAccount = overview.accountRows.find((row) => !row.account.funding);

    expect(overview.visibleAccountCount).toBe(3);
    expect(overview.fundedAccountCount).toBe(2);
    expect(ownAccount?.dailyRoomCapUsd).toBeNull();
    expect(ownAccount?.suggestedRiskUsd).toBeCloseTo(74.56);
    expect(overview.highestBudget?.account.id).toBe("acct-theta");
  });

  it("builds account recommendations with explicit freshness and funding context", () => {
    const rows = getLotSizingRecommendationRows({
      accounts: wave1Workspace.accounts,
      symbol: "EURUSD",
      stopPips: 15,
    });
    const funded = rows.find((row) => row.account.id === "acct-alpha");
    const own = rows.find((row) => row.account.id === "acct-sigma");
    const limited = rows.find((row) => row.account.id === "acct-theta");

    expect(funded?.recommendedRiskPct).toBe(getRecommendedRiskPct(funded?.account ?? null));
    expect(funded?.dailyRoomPct).toBe(2.81);
    expect(funded?.result.lotSize).toBeGreaterThan(0);
    expect(own?.dailyRoomPct).toBeNull();
    expect(own?.sourceLabel).toBe("Riesgo base sin límite externo");
    expect(limited?.needsFreshData).toBe(true);
    expect(limited?.freshnessLabel).toContain("estimado");
  });
});
