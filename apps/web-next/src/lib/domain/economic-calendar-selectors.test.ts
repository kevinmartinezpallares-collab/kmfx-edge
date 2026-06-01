import { describe, expect, it } from "vitest";

import { wave1Workspace } from "@/lib/data/wave1-mock";
import {
  buildEconomicSymbolContext,
  economicImpactLabel,
  getEconomicCalendarOverview,
} from "@/lib/domain/economic-calendar-selectors";

describe("getEconomicCalendarOverview", () => {
  it("builds a read-only news guard overview without promising enforcement", () => {
    const overview = getEconomicCalendarOverview(wave1Workspace, [
      {
        id: "calendar-us-ism",
        scheduledAt: "2026-06-01T16:00:00+02:00",
        timeLabel: "16:00",
        currency: "USD",
        title: "ISM Manufacturing PMI",
        impact: "alto",
        affectedSymbols: ["EURUSD", "XAUUSD"],
        suggestedAction: "Revisar antes de abrir o aumentar riesgo",
        protectionWindowLabel: "30 min antes / 15 min después",
        source: {
          provider: "Forex Factory",
          status: "connected",
          provenanceUrl: "https://www.forexfactory.com/calendar",
          fetchedAt: "2026-06-01T06:00:00.000Z",
        },
        forecast: "53.3",
        previous: "52.7",
      },
    ]);

    expect(overview.highImpactCount).toBe(1);
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

  it("does not invent events without a connected calendar source", () => {
    const overview = getEconomicCalendarOverview(wave1Workspace);

    expect(overview.rows).toEqual([]);
    expect(overview.highImpactCount).toBe(0);
    expect(overview.summaryCards[0]).toMatchObject({
      label: "Próxima noticia",
      value: "Sin fuente",
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
