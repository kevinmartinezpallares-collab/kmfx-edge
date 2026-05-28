import { describe, expect, it } from "vitest";

import { wave1Workspace } from "@/lib/data/wave1-mock";
import {
  buildEconomicSymbolContext,
  economicImpactLabel,
  getEconomicCalendarOverview,
} from "@/lib/domain/economic-calendar-selectors";

describe("getEconomicCalendarOverview", () => {
  it("builds a read-only news guard overview without promising enforcement", () => {
    const overview = getEconomicCalendarOverview(wave1Workspace);

    expect(overview.highImpactCount).toBe(2);
    expect(overview.summaryCards.map((card) => card.label)).toEqual([
      "Próxima noticia",
      "Impacto alto hoy",
      "Cuenta activa",
      "Símbolos vigilados",
    ]);
    expect(overview.guardRows).toContainEqual({
      label: "Protección",
      value: "Solo lectura",
      note: "Recomienda y avisa; no modifica operaciones",
    });
  });

  it("derives watched symbols from visible trading data", () => {
    const symbols = buildEconomicSymbolContext(wave1Workspace);

    expect(symbols.length).toBeGreaterThan(0);
    expect(symbols.length).toBeLessThanOrEqual(4);
  });

  it("falls back to core FX/metals symbols when there are no trades", () => {
    const symbols = buildEconomicSymbolContext({
      ...wave1Workspace,
      trades: [],
    });

    expect(symbols).toEqual(["EURUSD", "XAUUSD"]);
  });

  it("keeps impact labels user-facing", () => {
    expect(economicImpactLabel("alto")).toBe("Alto impacto");
    expect(economicImpactLabel("medio")).toBe("Impacto medio");
    expect(economicImpactLabel("bajo")).toBe("Bajo impacto");
  });
});
