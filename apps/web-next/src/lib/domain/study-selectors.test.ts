import { describe, expect, it } from "vitest";

import { wave1Workspace } from "@/lib/data/wave1-mock";
import { getStudyOverview } from "@/lib/domain/study-selectors";

describe("getStudyOverview", () => {
  it("builds glossary rows for trader-facing metrics", () => {
    const overview = getStudyOverview(wave1Workspace);

    expect(overview.glossaryRows.map((row) => row.term)).toEqual([
      "PnL",
      "Profit factor",
      "Win rate",
      "Expectancy",
      "DD",
      "Score",
      "Margen diario",
      "Riesgo abierto",
      "Lotaje",
      "Drawdown",
      "Sesiones",
      "Símbolos",
      "Setups",
      "Parciales",
      "Margen diario",
      "Límite total",
      "Consistencia",
      "Payout",
      "Pips",
      "Valor pip",
      "Lotaje",
      "Divisa",
    ]);
    expect(overview.contextRows[1]).toContain("Score");
    expect(overview.contextRows[1]).toContain("Win rate");
  });

  it("detects the dominant session from visible trades", () => {
    const overview = getStudyOverview(wave1Workspace);

    expect(overview.dominantSession).not.toBe("Pendiente");
  });

  it("groups terms by the agreed study categories", () => {
    const overview = getStudyOverview(wave1Workspace);

    expect(overview.categorySummaries.map((summary) => summary.category)).toEqual([
      "Métricas",
      "Riesgo",
      "Operativa",
      "Prop Firms",
      "Calculadora",
    ]);
    expect(
      overview.glossaryRows.find((row) => row.term === "Profit factor"),
    ).toMatchObject({
      formula: "Profit factor = gross profit / abs(gross loss).",
      usedIn: expect.arrayContaining([
        expect.objectContaining({ href: "/analytics" }),
      ]),
    });
  });

  it("stays render-safe without trades", () => {
    const overview = getStudyOverview({
      ...wave1Workspace,
      trades: [],
    });

    expect(overview.dominantSession).toBe("Pendiente");
    expect(overview.contextRows[0]).toBe("Sesión dominante: Pendiente.");
  });
});
