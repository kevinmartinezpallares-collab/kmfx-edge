import { describe, expect, it } from "vitest";

import { wave1Workspace } from "@/lib/data/wave1-mock";
import { getRiskPolicyControls } from "@/lib/domain/risk-policy-selectors";

describe("getRiskPolicyControls", () => {
  it("builds the read-only policy controls without claiming MT5 enforcement", () => {
    const controls = getRiskPolicyControls(wave1Workspace);

    expect(controls.maxRiskReferencePct).toBe(0.25);
    expect(controls.rules.map((rule) => rule.label)).toEqual([
      "Riesgo por operación",
      "Pérdida diaria",
      "Drawdown máximo",
      "Riesgo abierto máximo",
      "Máximo operaciones/día",
      "Entradas sin stop loss",
      "Pausa tras 2 pérdidas",
      "Noticias alto impacto",
      "Automatización MT5 futura",
    ]);
    expect(controls.rules.at(-1)).toMatchObject({
      status: "Desactivado",
      checked: false,
      value: "Pendiente",
    });
    expect(controls.rules.some((rule) => rule.status === "Preparado para EA")).toBe(true);
    expect(controls.rules.some((rule) => rule.status === "Solo aviso ahora")).toBe(true);
  });

  it("prepares session rules with clear trading actions", () => {
    const controls = getRiskPolicyControls(wave1Workspace);

    expect(controls.sessionControls).toEqual([
      expect.objectContaining({
        key: "Asia",
        label: "Asia",
        mode: "Normal",
        size: "100%",
        effect: "Operativa normal",
      }),
      expect.objectContaining({
        key: "London",
        label: "Londres",
        mode: "Reducido",
        size: "50%",
        effect: "Lote reducido y solo planes A+",
      }),
      expect.objectContaining({
        key: "New York",
        label: "Nueva York",
        mode: "Bloqueado",
        size: "0%",
        effect: "No abrir nuevas entradas",
      }),
    ]);
  });

  it("keeps symbols and volume limits available when trades are empty", () => {
    const controls = getRiskPolicyControls({
      ...wave1Workspace,
      trades: [],
      risk: {
        ...wave1Workspace.risk,
        exposureBySymbol: [],
      },
    });

    expect(controls.volumeControls.map((row) => row.label)).toEqual([
      "Lote máximo",
      "Posiciones simultáneas",
      "Riesgo por símbolo",
      "Operaciones por día",
    ]);
    expect(controls.symbolControls.map((row) => row.symbol).slice(0, 4)).toEqual([
      "EURUSD",
      "GBPUSD",
      "XAUUSD",
      "NAS100",
    ]);
    expect(controls.enabledSymbolCount).toBe(2);
    expect(controls.symbolControls.find((row) => row.symbol === "USDCAD")).toMatchObject({
      enabled: false,
      rule: "Bloqueado",
    });
  });
});
